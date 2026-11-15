const productService = require('../services/productService');
const messages = require('../utils/messages');
const { quantityKeyboard, productListKeyboard, formatPrice } = require('../utils/keyboard');
const config = require('../config');
const userService = require('../services/userService');
const { Markup } = require('telegraf');

module.exports = (bot) => {
    // 1. Xử lý chọn sản phẩm (Giữ nguyên)
    bot.action(/^product_(\d+)$/, (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        ctx.answerCbQuery();

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
    bot.action(/^bet_(tai|xiu)$/, (ctx) => {
        const choice = ctx.match[1]; // 'tai' hoặc 'xiu'
        ctx.answerCbQuery();
        
        // Lưu lựa chọn vào session để tí nữa dùng
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
        // Chỉ xử lý nếu người dùng đang trong trạng thái chờ nhập tiền cược
        if (!ctx.session || !ctx.session.betChoice) return next();

        const text = ctx.message.text.trim();
        if (text.startsWith('/')) return next(); // Bỏ qua nếu là lệnh khác

        const amount = parseInt(text);
        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('❌ Số tiền không hợp lệ. Vui lòng nhập lại (Ví dụ: 10000).');
        }

        // Lấy thông tin user
        const user = userService.get(ctx.from.id);
        if (!user || user.balance < amount) {
            return ctx.reply(`❌ Số dư của bạn không đủ. Số dư hiện tại: ${formatPrice(user ? user.balance : 0)}`);
        }

        const choice = ctx.session.betChoice;
        const choiceName = choice === 'tai' ? 'TÀI' : 'XỈU';
        
        // Xóa session để tránh bị lặp lại
        ctx.session.betChoice = null;

        // 5. MÔ PHỎNG ĐỔ 3 VIÊN XÚC XẮC
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const dice3 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2 + dice3;

        // Quy tắc: Từ 11 đến 18 là TÀI, từ 3 đến 10 là XỈU
        const result = total >= 11 ? 'tai' : 'xiu';
        const resultName = result === 'tai' ? 'TÀI' : 'XỈU';

        // Hiển thị kết quả tung xúc xắc
        const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        const diceMsg = 
            `🎲 <b>KẾT QUẢ LẮC XÚC XẮC</b> 🎲\n\n` +
            `${diceEmojis[dice1]}  ${diceEmojis[dice2]}  ${diceEmojis[dice3]}\n\n` +
            `🔢 Tổng điểm: <b>${total}</b> => <b>${resultName}</b>\n\n` +
            `Bạn đã cược: <b>${choiceName}</b> (${formatPrice(amount)})\n`;

        // 6. XỬ LÝ THẮNG / THUA (ĐÃ SỬA LỖI TRỪ TIỀN)
        
        // BƯỚC A: LUÔN TRỪ TIỀN CƯỢC TRƯỚC
        userService.deductBalance(ctx.from.id, amount);

        if (choice === result) {
            // THẮNG: Cộng lại tiền gốc + tiền lời
            const winnings = amount; // Tiền lời
            userService.addBalance(ctx.from.id, amount + winnings); 
            
            const newBalance = userService.get(ctx.from.id).balance;
            await ctx.replyWithHTML(
                diceMsg +
                `\n🎉 <b>CHÚC MỪNG! BẠN ĐÃ THẮNG</b>\n` +
                `💰 Tiền thắng: <b>+${formatPrice(winnings)}</b>\n` +
                `💳 Số dư mới: <b>${formatPrice(newBalance)}</b>`
            );
        } else {
            // THUA: Đã bị trừ ở Bước A, chỉ báo kết quả
            const newBalance = userService.get(ctx.from.id).balance;
            
            await ctx.replyWithHTML(
                diceMsg +
                `\n😢 <b>RẤT TIẾC! BẠN ĐÃ THUA</b>\n` +
                `💸 Tiền mất: <b>-${formatPrice(amount)}</b>\n` +
                `💳 Số dư mới: <b>${formatPrice(newBalance)}</b>`
            );
        }

        // Gửi lại menu chơi
        ctx.reply('Chơi tiếp?', productListKeyboard([]));
    });
};