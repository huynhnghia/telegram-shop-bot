const { Telegraf, session } = require('telegraf');
const config = require('./config');

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

// Start webhook server FIRST — Render/Railway need to see an open port
// almost immediately, regardless of whether Telegram polling succeeds.
const setupWebhook = require('./webhook');
setupWebhook(bot);

// Launch Telegram polling separately so a Telegram-side failure
// (bad token, network issue) never takes down the whole process/port.
if (!config.BOT_TOKEN || config.BOT_TOKEN === 'your_bot_token_here') {
    console.error('❌ BOT_TOKEN chưa được cấu hình trong Environment Variables!');
    console.error('💡 Bot Telegram sẽ KHÔNG nhận tin nhắn cho tới khi bạn thêm BOT_TOKEN và deploy lại.');
} else {
    // Set bot commands for menu
    bot.telegram.setMyCommands([
        { command: 'start', description: '🔄 Bắt đầu / Khởi động lại' },
        { command: 'menu', description: '👤 Thông tin tài khoản' },
        { command: 'product', description: '📦 Danh sách sản phẩm' },
        { command: 'nap', description: '💰 Nạp số dư' },
        { command: 'checkpay', description: '🔍 Kiểm tra thanh toán' },
        { command: 'support', description: '🆘 Hỗ trợ' },
        { command: 'myid', description: '🆔 Lấy ID của bạn' },
    ]).catch((err) => console.error('⚠️  Không set được bot commands:', err.message));

    bot.launch()
        .then(() => {
            console.log(`🤖 ${config.SHOP_NAME} Bot đã khởi động!`);
            console.log(`👤 Admin ID: ${config.ADMIN_ID}`);
            console.log(`🏦 Bank: ${config.BANK.NAME} - ${config.BANK.ACCOUNT}`);

            // Start Google Sheet auto-sync
            const { startAutoSync } = require('./services/sheetSync');
            startAutoSync();
        })
        .catch((err) => {
            console.error('❌ Không thể khởi động Telegram polling:', err.message);
            console.error('💡 Kiểm tra lại BOT_TOKEN trong Environment Variables có đúng không.');
            // NOTE: intentionally NOT calling process.exit(1) here —
            // the webhook server above must keep running so Render doesn't
            // fail the whole deploy just because Telegram polling failed.
        });
}

// Prevent crash on network errors
process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled rejection (ignored):', err.message || err);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught exception:', err.message || err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        console.log('🔄 Network error, bot continues running...');
        return; // Don't crash on network errors
    }
    process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
