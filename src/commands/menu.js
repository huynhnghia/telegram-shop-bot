const userService = require('../services/userService');
const messages = require('../utils/messages');

module.exports = (bot) => {
    bot.command('menu', async (ctx) => {
        try {
            // Lấy user từ Turso (phải await)
            const user = await userService.get(ctx.from.id);
            
            if (!user) {
                return ctx.reply('❌ Không tìm thấy thông tin. Vui lòng gõ /start lại.');
            }

            // Ép kiểu balance sang số để tránh lỗi NaN
            const safeUser = {
                ...user,
                balance: Number(user.balance) || 0
            };

            // Gửi tin nhắn (dùng messages.accountInfo như cũ)
            await ctx.replyWithHTML(messages.accountInfo(safeUser));
        } catch (error) {
            console.error('Lỗi lệnh menu:', error);
            ctx.reply(`❌ Lỗi: ${error.message}`);
        }
    });
};