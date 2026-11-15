const config = require('../config');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const { mainMenuKeyboard } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.command('start', async (ctx) => {
        // 1. Tạo hoặc lấy thông tin user
        const user = userService.findOrCreate(ctx.from);

        // 2. Gửi tin nhắn chào mừng cho khách
        const userName = ctx.from.first_name || 'bạn';
        await ctx.replyWithHTML(
            messages.welcome(userName),
            mainMenuKeyboard()
        );

        // 3. GỬI THÔNG BÁO CHO ADMIN KHI CÓ NGƯỜI VÀO BOT
        try {
            const adminMsg = 
                `🔔 <b>NGƯỜI CHƠI VÀO BOT</b>\n\n` +
                `👤 Tên: <b>${ctx.from.first_name} ${ctx.from.last_name || ''}</b>\n` +
                `🆔 ID: <code>${ctx.from.id}</code>\n` +
                `📱 Username: ${ctx.from.username ? '@' + ctx.from.username : 'Không có'}`;
            
            await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
        } catch (err) {
            console.error('Lỗi gửi thông báo Admin:', err.message);
        }
    });
};