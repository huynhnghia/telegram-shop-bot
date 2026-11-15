const { Telegraf, session } = require('telegraf');
const config = require('./config');
const { initDatabase } = require('./database'); // Import hàm khởi tạo Database

const bot = new Telegraf(config.BOT_TOKEN || 'invalid-token');

// Enable session for admin stock input
bot.use(session());

// Error handler
bot.catch((err, ctx) => {
    console.error(`❌ Error for ${ctx.updateType}:`, err.message);
    try {
        ctx.reply('❌ Đã xảy ra lỗi. Vui lòng thử lại sau.');
    } catch (e) {
        // ignore
    }
});

// Register commands
require('./commands/start')(bot);
require('./commands/menu')(bot);
require('./commands/product')(bot);
require('./commands/nap')(bot);
require('./commands/checkpay')(bot);
require('./commands/support')(bot);
require('./commands/myid')(bot);

// Register handlers
require('./handlers/productSelect')(bot);
require('./handlers/quantitySelect')(bot);
require('./handlers/paymentConfirm')(bot);
require('./handlers/adminActions')(bot);

// Start webhook server FIRST
const setupWebhook = require('./webhook');
setupWebhook(bot);

// Launch Telegram polling
if (!config.BOT_TOKEN || config.BOT_TOKEN === 'your_bot_token_here') {
    console.error('❌ BOT_TOKEN chưa được cấu hình!');
} else {
    // CẬP NHẬT MENU LỆNH TẠI ĐÂY
    bot.telegram.setMyCommands([
        { command: 'start', description: '🔄 Bắt đầu / Khởi động lại' },
        { command: 'menu', description: '👤 Thông tin tài khoản' },
        { command: 'batdau', description: '🎲 Chơi tài xỉu' },
        { command: 'nap', description: '💰 Nạp số dư' },
        { command: 'checkpay', description: '🔍 Kiểm tra thanh toán' },
        { command: 'support', description: '🆘 Hỗ trợ' },
        { command: 'myid', description: '🆔 Lấy ID của bạn' },
    ]).catch((err) => console.error('⚠️  Không set được bot commands:', err.message));

    // KHỞI TẠO DATABASE TRƯỚC KHI LAUNCH BOT
    initDatabase()
        .then(() => {
            console.log('✅ Đã kết nối Database Turso thành công!');
            
            // Sau khi khởi tạo DB xong mới chạy bot
            return bot.launch();
        })
        .then(() => {
            console.log(`🤖 ${config.SHOP_NAME} Bot đã khởi động!`);
            const { startAutoSync } = require('./services/sheetSync');
            startAutoSync();
        })
        .catch((err) => {
            console.error('❌ Không thể khởi động Bot:', err.message);
        });
}

// Prevent crash on network errors
process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled rejection (ignored):', err.message || err);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught exception:', err.message || err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return;
    process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));