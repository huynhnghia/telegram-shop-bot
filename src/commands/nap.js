const paymentService = require('../services/paymentService');
const topupService = require('../services/topupService');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.command('nap', async (ctx) => {
        try {
            const text = ctx.message.text.split(' ');
            if (text.length < 2 || isNaN(text[1])) {
                return ctx.replyWithHTML(
                    '💰 <b>NẠP SỐ DƯ</b>\n\n' +
                    'Cách dùng: /nap [số tiền]\n' +
                    'Ví dụ: /nap 50000\n\n' +
                    '💡 Số tiền tối thiểu: 10.000đ'
                );
            }

            const amount = parseInt(text[1]);
            if (amount < 10000) {
                return ctx.reply('❌ Số tiền tối thiểu là 10.000đ');
            }

            // 1. Đảm bảo user tồn tại
            userService.findOrCreate(ctx.from);

            // 2. Tạo thông tin thanh toán (Mã QR, Nội dung CK)
            const payment = paymentService.generatePayment(amount);
            
            // 3. Lưu đơn nạp tiền vào Database để Webhook đối soát
            topupService.create(ctx.from.id, amount, payment.paymentCode);

            // 4. Nội dung tin nhắn
            const caption =
                `💰 <b>NẠP SỐ DƯ</b>\n\n` +
                `Quét mã QR hoặc bấm vào link dưới đây để chuyển khoản:\n` +
                `👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>\n\n` +
                `🏦 Thông tin chuyển khoản:\n` +
                `├ Số tiền: <b>${formatPrice(amount)}</b>\n` +
                `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
                `⏳ Hệ thống sẽ tự động cộng tiền sau khi nhận được thanh toán.`;

            // 5. Gửi tin nhắn
            await ctx.replyWithHTML(caption);
            
        } catch (err) {
            console.error('❌ Lỗi tạo nạp tiền:', err.message);
            ctx.reply(`❌ Lỗi: ${err.message}`); 
        }
    });
};