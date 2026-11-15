const productService = require('../services/productService');
const messages = require('../utils/messages');
const { quantityKeyboard, productListKeyboard, formatPrice } = require('../utils/keyboard');
const config = require('../config');
const userService = require('../services/userService');
const { Markup } = require('telegraf');

module.exports = (bot) => {
    // 1. Xử lý chọn sản phẩm (Giữ nguyên)
    bot.action(/^product_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const product = await productService.getById(productId);
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        await ctx.answerCbQuery();

        if (product.contact_only) {
            const buttons = [];
            const adminUsername = config.SUPPORT_CONTACT.replace('@', '');
            buttons.push([Markup.button.url('💬 Liên hệ mua', `https://t.me/${adminUsername}`)]);
            if (product.contact_url) buttons.push([Markup.button.url('📱 Hotline Zalo 24/7', product.contact_url)]);
            buttons.push([Markup.button.callback('↩️ Quay lại', 'refresh_products')]);
            return ctx.replyWithHTML(messages.contactOnly(product), Markup.inlineKeyboard(buttons));
        }

        const availableStock = product.display_stock || product.stock_count;
        if (availableStock === 0) return ctx.reply(messages.noStock);
        const maxQty = Math.min(availableStock, 10);
        ctx.replyWithHTML(messages.selectQuantity(product), quantityKeyboard(productId, maxQty));
    });

    // ═══════════════════════════════════════
    // XỬ LÝ TÀI XỈU
    // ═══════════════════════════════════════

    // 2. Khi bấm nút TÀI hoặc XỈU
    bot.action(/^bet_(tai|xiu)$/, async (ctx) => {
        const choice = ctx.match[1];
        await ctx.answerCbQuery();
        
        ctx.session = ctx.session || {};
        ctx.session.betChoice = choice;

        const choiceName = choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU';
        
        ctx.replyWithHTML(
            `Bạn đã chọn cược <b>${choiceName}</b>.\n\n` +
            `💰 Vui lòng nhập <b>số tiền</b> bạn muốn cược (Ví dụ: 10000):\n\n` +
            `Gõ /cancel để hủy.`
        );
    });

    // 3. Hủy đặt cược
    bot.command('cancel', (ctx) => {
        if (ctx.session && ctx.session.betChoice) {
            ctx.session.betChoice = null;
            return ctx.reply('❌ Đã hủy đặt cược.');
        }
    });

    // 4. Bắt sự kiện người chơi nhập số tiền (Text)
    bot.on('text', async (ctx, next) => {
        if (!ctx.session || !ctx.session.betChoice) return next();

        const text = ctx.message.text.trim();
        if (text.startsWith('/')) return next();

        const amount = parseInt(text);
        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('❌ Số tiền không hợp lệ. Vui lòng nhập lại (Ví dụ: 10000).');
        }

        const user = await userService.get(ctx.from.id);
        const userBalance = Number(user ? user.balance : 0);

        if (!user || userBalance < amount) {
            return ctx.reply(`❌ Số dư của bạn không đủ. Số dư hiện tại: ${formatPrice(userBalance)}`);
        }

        const choice = ctx.session.betChoice;
        const choiceName = choice === 'tai' ? 'TÀI' : 'XỈU';
        
        ctx.session.betChoice = null;

        // ═══════════════════════════════════════
        // 5. HIỆU ỨNG ĐỔ 3 VIÊN XÚC XẮC ĐỘNG (CÓ DELAY)
        // ═══════════════════════════════════════
        await ctx.replyWithHTML('🎲 <b>Đang lắc xúc xắc...</b>');

        // Gửi viên 1
        const dice1Msg = await ctx.replyWithDice();
        const dice1 = dice1Msg.dice.value;
        
        // Đợi 0.8 giây để Telegram không chặn
        await new Promise(resolve => setTimeout(resolve, 800));

        // Gửi viên 2
        const dice2Msg = await ctx.replyWithDice();
        const dice2 = dice2Msg.dice.value;

        // Đợi 0.8 giây
        await new Promise(resolve => setTimeout(resolve, 800));

        // Gửi viên 3
        const dice3Msg = await ctx.replyWithDice();
        const dice3 = dice3Msg.dice.value;

        // Đợi 1 giây để xúc xắc 3 dừng hẳn
        await new Promise(resolve => setTimeout(resolve, 1000));

        const total = dice1 + dice2 + dice3;
        const result = total >= 11 ? 'tai' : 'xiu';
        const resultName = result === 'tai' ? 'TÀI' : 'XỈU';

        const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        const diceMsg = 
            `🎲 <b>KẾT QUẢ LẮC XÚC XẮC</b> 🎲\n\n` +
            `${diceEmojis[dice1]}  ${diceEmojis[dice2]}  ${diceEmojis[dice3]}\n\n` +
            `🔢 Tổng điểm: <b>${total}</b> => <b>${resultName}</b>\n\n` +
            `Bạn đã cược: <b>${choiceName}</b> (${formatPrice(amount)})\n`;

        // ═══════════════════════════════════════
        // 6. XỬ LÝ THẮNG / THUA
        // ═══════════════════════════════════════
        
        await userService.deductBalance(ctx.from.id, amount);

        if (choice === result) {
            const winnings = amount;
            await userService.addBalance(ctx.from.id, amount + winnings); 
            
            const updatedUser = await userService.get(ctx.from.id);
            const newBalance = Number(updatedUser.balance);
            
            await ctx.replyWithHTML(
                diceMsg +
                `\n🎉 <b>CHÚC MỪNG! BẠN ĐÃ THẮNG</b>\n` +
                `💰 Tiền thắng: <b>+${formatPrice(winnings)}</b>\n` +
                `💳 Số dư mới: <b>${formatPrice(newBalance)}</b>`
            );

            try {
                const adminMsg = 
                    `🎉 <b>NGƯỜI CHƠI THẮNG</b>\n\n` +
                    `👤 Khách: <b>${ctx.from.first_name}</b> (<code>${ctx.from.id}</code>)\n` +
                    `🎲 Cược: <b>${choiceName}</b> | Kết quả: <b>${resultName}</b> (${total} điểm)\n` +
                    `💰 Tiền cược: <b>${formatPrice(amount)}</b>\n` +
                    `💵 Số dư mới: <b>${formatPrice(newBalance)}</b>`;
                await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
            } catch (e) { console.error('Lỗi gửi Admin:', e.message); }

        } else {
            const updatedUser = await userService.get(ctx.from.id);
            const newBalance = Number(updatedUser.balance);
            
            await ctx.replyWithHTML(
                diceMsg +
                `\n😢 <b>RẤT TIẾC! BẠN ĐÃ THUA</b>\n` +
                `💸 Tiền mất: <b>-${formatPrice(amount)}</b>\n` +
                `💳 Số dư mới: <b>${formatPrice(newBalance)}</b>`
            );

            try {
                const adminMsg = 
                    `😢 <b>NGƯỜI CHƠI THUA</b>\n\n` +
                    `👤 Khách: <b>${ctx.from.first_name}</b> (<code>${ctx.from.id}</code>)\n` +
                    `🎲 Cược: <b>${choiceName}</b> | Kết quả: <b>${resultName}</b> (${total} điểm)\n` +
                    `💸 Tiền mất: <b>${formatPrice(amount)}</b>\n` +
                    `💵 Số dư mới: <b>${formatPrice(newBalance)}</b>`;
                await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
            } catch (e) { console.error('Lỗi gửi Admin:', e.message); }
        }

        // Gửi lại menu chơi
        ctx.reply('Chơi tiếp?', productListKeyboard([]));
    });
};