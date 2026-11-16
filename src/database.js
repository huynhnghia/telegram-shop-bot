const config = require('../config');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');
const { db } = require('../database');

const adminState = {};

function isAdmin(ctx) { return ctx.from.id === config.ADMIN_ID; }
function adminOnly(ctx, next) {
    if (!isAdmin(ctx)) return ctx.replyWithHTML('⛔ Bạn không có quyền sử dụng lệnh này.');
    return next();
}

module.exports = (bot) => {

    // Menu Admin
    bot.command('admin', adminOnly, (ctx) => {
        ctx.replyWithHTML(
            `🔧 <b>ADMIN PANEL — ${config.SHOP_NAME}</b>\n\n` +
            `👥 <b>QUẢN LÝ USER & SỐ DƯ:</b>\n` +
            `/users — Xem danh sách users\n` +
            `/setbalance [ID] [tiền] — Đặt lại số dư\n` +
            `/addbalance [ID] [tiền] — Cộng/trừ số dư\n` +
            `/max [tiền] — Giới hạn cược tối đa (0 = không giới hạn)\n\n` +
            `📢 <b>THÔNG BÁO:</b>\n` +
            `/broadcast — Gửi thông báo tới all users\n` +
            `/broadcast1 [ID] [nội dung] — Gửi thông báo 1 user`
        );
    });

    // 1. Lệnh /users
    bot.command('users', adminOnly, async (ctx) => {
        try {
            const result = await db.execute('SELECT * FROM users ORDER BY created_at DESC LIMIT 20');
            const users = result.rows;

            if (users.length === 0) return ctx.reply('👥 Chưa có user nào trong hệ thống.');

            let text = `👥 <b>USERS GẦN ĐÂY (${users.length})</b>\n\n`;
            users.forEach((u) => {
                text += `🆔 <code>${u.telegram_id}</code> | ${u.full_name}`;
                if (u.username) text += ` (@${u.username})`;
                text += `\n  💰 ${formatPrice(u.balance)} | 📅 ${u.created_at}\n\n`;
            });

            ctx.replyWithHTML(text);
        } catch (error) {
            ctx.reply(`❌ Lỗi: ${error.message}`);
        }
    });

    // 2. Lệnh /setbalance
    bot.command('setbalance', adminOnly, async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.replyWithHTML(`💰 <b>SET SỐ DƯ USER</b>\n\nCách dùng: <code>/setbalance [user_id] [số_tiền]</code>`);
        
        const userId = parseInt(args[1]);
        const amount = parseInt(args[2]);
        if (isNaN(userId) || isNaN(amount) || amount < 0) return ctx.reply('❌ User ID hoặc số tiền không hợp lệ.');
        
        try {
            const user = await userService.getUser(userId);
            if (!user) return ctx.reply('❌ Không tìm thấy user này.');
            
            await userService.updateBalance(userId, amount);
            
            ctx.replyWithHTML(`✅ <b>ĐÃ CẬP NHẬT SỐ DƯ</b>\n\n👤 User: <b>${user.full_name}</b> (<code>${userId}</code>)\n💰 Số dư mới: <b>${formatPrice(amount)}</b>`);
            bot.telegram.sendMessage(userId, `💰 Số dư tài khoản của bạn đã được Admin cập nhật thành: <b>${formatPrice(amount)}</b>`, { parse_mode: 'HTML' }).catch(() => {});
        } catch (error) {
            ctx.reply(`❌ Lỗi: ${error.message}`);
        }
    });

    // 3. Lệnh /addbalance
    bot.command('addbalance', adminOnly, async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.replyWithHTML(`💸 <b>CỘNG/TRỪ SỐ DƯ USER</b>\n\nCách dùng: <code>/addbalance [user_id] [số_tiền]</code>`);
        
        const userId = parseInt(args[1]);
        const amount = parseInt(args[2]);
        if (isNaN(userId) || isNaN(amount)) return ctx.reply('❌ User ID hoặc số tiền không hợp lệ.');
        
        try {
            const user = await userService.getUser(userId);
            if (!user) return ctx.reply('❌ Không tìm thấy user này.');
            
            const newBalance = Number(user.balance) + amount;
            if (newBalance < 0) return ctx.reply(`❌ Số dư không đủ để trừ. Số dư hiện tại: ${formatPrice(user.balance)}`);
            
            await userService.updateBalance(userId, newBalance);
            
            const action = amount > 0 ? '➕ Cộng' : '➖ Trừ';
            const absAmount = Math.abs(amount);
            
            ctx.replyWithHTML(`✅ <b>ĐÃ CẬP NHẬT SỐ DƯ</b>\n\n👤 User: <b>${user.full_name}</b> (<code>${userId}</code>)\n${action}: ${formatPrice(absAmount)}\n💰 Số dư mới: <b>${formatPrice(newBalance)}</b>`);
        } catch (error) {
            ctx.reply(`❌ Lỗi: ${error.message}`);
        }
    });

    // 4. Lệnh /max - Giới hạn số tiền cược
    bot.command('max', adminOnly, async (ctx) => {
        const args = ctx.message.text.split(' ');
        
        try {
            // Nếu không nhập số, hiển thị giới hạn hiện tại
            if (args.length < 2) {
                const result = await db.execute("SELECT value FROM settings WHERE key = 'max_bet'");
                const maxBet = result.rows.length > 0 ? result.rows[0].value : '0';
                const displayMax = maxBet === '0' ? 'Không giới hạn' : formatPrice(maxBet);
                
                return ctx.replyWithHTML(
                    `🎯 <b>GIỚI HẠN CƯỢC HIỆN TẠI</b>\n\n` +
                    `💰 Mức tối đa: <b>${displayMax}</b>\n\n` +
                    `✏️ Để thay đổi:\n<code>/max [số tiền]</code>\n` +
                    `Ví dụ: <code>/max 100000</code> (giới hạn 100k)\n` +
                    `Nhập <code>/max 0</code> để bỏ giới hạn.`
                );
            }

            const maxAmount = parseInt(args[1]);
            if (isNaN(maxAmount) || maxAmount < 0) {
                return ctx.reply('❌ Số tiền không hợp lệ.');
            }

            // Lưu hoặc cập nhật vào bảng settings
            await db.execute({
                sql: `INSERT INTO settings (key, value) VALUES ('max_bet', ?) 
                      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                args: [maxAmount.toString()]
            });

            if (maxAmount === 0) {
                ctx.replyWithHTML(`✅ <b>Đã BỎ giới hạn cược</b>\n\nNgười chơi có thể cược không giới hạn.`);
            } else {
                ctx.replyWithHTML(`✅ <b>ĐÃ CẬP NHẬT GIỚI HẠN CƯỢC</b>\n\n🎯 Số tiền cược tối đa: <b>${formatPrice(maxAmount)}</b>`);
            }
        } catch (error) {
            ctx.reply(`❌ Lỗi: ${error.message}`);
        }
    });

    // 5. Lệnh /broadcast
    bot.command('broadcast', adminOnly, async (ctx) => {
        const msg = ctx.message.text.replace('/broadcast', '').trim();

        if (!msg) {
            adminState[ctx.from.id] = { action: 'broadcast' };
            return ctx.replyWithHTML(`📢 <b>GỬI THÔNG BÁO</b>\n\nGửi nội dung thông báo ngay bây giờ.\n\nGõ /cancel để hủy.`);
        }

        await sendBroadcast(ctx, bot, msg);
    });

    // 6. Lệnh /broadcast1
    bot.command('broadcast1', adminOnly, async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.replyWithHTML(`📢 <b>GỬI THÔNG BÁO CÁ NHÂN</b>\n\nCách dùng: <code>/broadcast1 [user_id] [nội dung]</code>`);
        
        const userId = parseInt(args[1]);
        const msg = ctx.message.text.replace('/broadcast1', '').replace(args[1], '').trim();
        if (isNaN(userId)) return ctx.reply('❌ User ID không hợp lệ.');

        try {
            await bot.telegram.sendMessage(userId, msg, { parse_mode: 'HTML' });
            ctx.replyWithHTML(`✅ Đã gửi thông báo tới user <code>${userId}</code> thành công!`);
        } catch (err) {
            ctx.reply(`❌ Không thể gửi tin nhắn: ${err.message}`);
        }
    });

    // Hủy thao tác
    bot.command('cancel', (ctx) => {
        if (adminState[ctx.from.id]) {
            delete adminState[ctx.from.id];
            ctx.reply('❌ Đã hủy thao tác.');
        }
    });

    // Xử lý text cho broadcast
    bot.on('text', async (ctx, next) => {
        if (!isAdmin(ctx)) return next();
        const state = adminState[ctx.from.id];
        if (!state) return next();

        if (state.action === 'broadcast') {
            delete adminState[ctx.from.id];
            await sendBroadcast(ctx, bot, ctx.message.text);
            return;
        }
        return next();
    });

    // Hàm gửi broadcast
    async function sendBroadcast(ctx, bot, message) {
        try {
            const result = await db.execute('SELECT telegram_id FROM users');
            const users = result.rows;
            
            let sent = 0;
            let failed = 0;
            
            await ctx.reply(`📢 Đang gửi tới ${users.length} users...`);
            
            for (const user of users) {
                try {
                    await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
                    sent++;
                } catch (err) {
                    failed++;
                }
            }
            
            ctx.replyWithHTML(`📢 <b>Đã gửi xong!</b>\n├ ✅ Thành công: ${sent}\n└ ❌ Thất bại: ${failed}`);
        } catch (error) {
            ctx.reply(`❌ Lỗi gửi broadcast: ${error.message}`);
        }
    }
};

module.exports.setAdminState = (userId, state) => {
    adminState[userId] = state;
};