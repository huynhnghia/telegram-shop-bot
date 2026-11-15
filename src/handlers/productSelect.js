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
        // 5. HIỆU ỨNG ĐỔ XÚC XẮC (SỬA LỖI TELEGRAM CHẶN)
        // ═══════════════════════════════════════
        
        const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        
        // Hàm tạo chuỗi hiển thị 3 viên xúc xắc
        const getDiceString = (v1, v2, v3) => {
            return `<b>Đang lắc xúc xắc...</b>\n\n${diceEmojis[v1]}  ${diceEmojis[v2]}  ${diceEmojis[v3]}`;
        };

        // Gửi tin nhắn bắt đầu lắc
        const msg = await ctx.replyWithHTML(getDiceString(1, 1, 1));

        // Tạo hiệu ứng lắc trong 2 giây (4 lần cập nhật, mỗi lần 500ms)
        for (let i = 0; i < 4; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const r1 = Math.floor(Math.random() * 6) + 1;
            const r2 = Math.floor(Math.random() * 6) + 1;
            const r3 = Math.floor(Math.random() * 6) + 1;
            try {
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, getDiceString(r1, r2, r3), { parse_mode: 'HTML' });
            } catch (e) {
                // Bỏ qua lỗi nếu Telegram từ chối cập nhật quá nhanh
            }
        }

        // Đợi thêm 0.5s rồi chốt kết quả
        await new Promise(resolve => setTimeout(resolve, 500));

        // Kết quả cuối cùng
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const dice3 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2 + dice3;

        const result = total >= 11 ? 'tai' : 'xiu';
        const resultName = result === 'tai' ? 'TÀI' : 'XỈU';

        const finalMsg = 
            `🎲 <b>KẾT QUẢ LẮC XÚC XẮC</b> 🎲\n\n` +
            `${diceEmojis[dice1]}  ${diceEmojis[dice2]}  ${diceEmojis[dice3]}\n\n` +
            `🔢 Tổng điểm: <b>${total}</b> => <b>${resultName}</b>\n\n` +
            `Bạn đã cược: <b>${choiceName}</b> (${formatPrice(amount)})\n`;

        // Cập nhật tin nhắn lần cuối với kết quả thật
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, finalMsg, { parse_mode: 'HTML' });
        } catch (e) {
            await ctx.replyWithHTML(finalMsg);
        }

        // ═══════════════════════════════════════
        // 6. XỬ LÝ THẮNG / THUA
        // ═══════════════════════════════════════
        
        // BƯỚC A: LUÔN TRỪ TIỀN CƯỢC TRƯỚC
        await userService.deductBalance(ctx.from.id, amount);

        if (choice === result) {
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

            // Gửi thông báo Admin
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
            // THUA
            const updatedUser = await userService.get(ctx.from.id);
            const newBalance = Number(updatedUser.balance);
            
            await ctx.replyWithHTML(
                `\n😢 <b>RẤT TIẾC! BẠN ĐÃ THUA</b>\n` +
                `💸 Tiền mất: <b>-${formatPrice(amount)}</b>\n` +
                `💳 Số dư mới: <b>${formatPrice(newBalance)}</b>`
            );

            // Gửi thông báo Admin
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