const paymentService = require('../services/paymentService');
const topupService = require('../services/topupService');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.command('checkdb', async (ctx) => {
        try {
            const pending = await topupService.getAllPending();
            if (pending.length === 0) {
                return ctx.reply('Database trống! Không có đơn nạp nào đang chờ.');
            }
            ctx.reply(`Có ${pending.length} đơn nạp đang chờ:\n${JSON.stringify(pending, null, 2)}`);
        } catch (error) {
            ctx.reply(`Lỗi kiểm tra DB: ${error.message}`);
        }
    });

    bot.command('nap', async (ctx) => {
        try {
            const text = ctx.message.text.split(' ');
            if (text.length < 2 || isNaN(text[1])) {
                return ctx.replyWithHTML('💰 Cách dùng: /nap [số tiền]\nVí dụ: /nap 10000');
            }

            const amount = parseInt(text[1]);
            if (amount < 10000) return ctx.reply('❌ Số tiền tối thiểu là 10.000đ');

            // QUAN TRỌNG: Thêm await vào hàm này
            await userService.findOrCreate(ctx.from);
            
            const payment = paymentService.generatePayment(amount);
            
            // QUAN TRỌNG: Thêm await vào hàm này
            await topupService.create(ctx.from.id, amount, payment.paymentCode);

            const caption =
                `💰 <b>NẠP SỐ DƯ</b>\n\n` +
                `👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>\n\n` +
                `🏦 Số tiền: <b>${formatPrice(amount)}</b>\n` +
                `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
                `⏳ Hệ thống sẽ tự động cộng tiền sau khi nhận được thanh toán.`;

            await ctx.replyWithHTML(caption);
        } catch (err) {
            console.error('❌ Lỗi tạo nạp tiền:', err.message);
            ctx.reply(`❌ Lỗi: ${err.message}`); 
        }
    });
};