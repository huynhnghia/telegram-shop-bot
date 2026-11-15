const { db } = require('../database');

const userService = {
    async findOrCreate(telegramUser) {
        try {
            // 1. Tìm user trong DB trước
            const existingResult = await db.execute({
                sql: 'SELECT * FROM users WHERE telegram_id = ?',
                args: [telegramUser.id]
            });
            
            // Nếu tìm thấy thì trả về luôn
            if (existingResult.rows.length > 0) return existingResult.rows[0];

            // 2. Nếu chưa có, tạo mới
            const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
            
            // Dùng INSERT OR IGNORE để tránh lỗi trùng lặp (UNIQUE constraint)
            await db.execute({
                sql: 'INSERT OR IGNORE INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)',
                args: [telegramUser.id, telegramUser.username || null, fullName]
            });

            // 3. Lấy lại thông tin user vừa tạo (hoặc vừa được ignore)
            const newUserResult = await db.execute({
                sql: 'SELECT * FROM users WHERE telegram_id = ?',
                args: [telegramUser.id]
            });
            return newUserResult.rows[0];
        } catch (error) {
            console.error('❌ Lỗi findOrCreate:', error.message);
            throw error;
        }
    },

    async get(telegramId) {
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE telegram_id = ?',
            args: [telegramId]
        });
        return result.rows[0];
    },

    async getUser(telegramId) {
        return this.get(telegramId);
    },

    async addBalance(telegramId, amount) {
        await db.execute({
            sql: 'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
            args: [amount, telegramId]
        });
    },

    async deductBalance(telegramId, amount) {
        const user = await this.get(telegramId);
        if (!user || user.balance < amount) return false;
        await db.execute({
            sql: 'UPDATE users SET balance = balance - ? WHERE telegram_id = ?',
            args: [amount, telegramId]
        });
        return true;
    },

    async updateBalance(telegramId, newBalance) {
        await db.execute({
            sql: 'UPDATE users SET balance = ? WHERE telegram_id = ?',
            args: [newBalance, telegramId]
        });
    }
};

module.exports = userService;