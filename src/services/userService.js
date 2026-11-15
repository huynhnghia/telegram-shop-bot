const { db } = require('../database');

const userService = {
    async findOrCreate(telegramUser) {
        const existingResult = await db.execute({
            sql: 'SELECT * FROM users WHERE telegram_id = ?',
            args: [telegramUser.id]
        });
        if (existingResult.rows.length > 0) return existingResult.rows[0];

        const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
        await db.execute({
            sql: 'INSERT INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)',
            args: [telegramUser.id, telegramUser.username || null, fullName]
        });

        const newUserResult = await db.execute({
            sql: 'SELECT * FROM users WHERE telegram_id = ?',
            args: [telegramUser.id]
        });
        return newUserResult.rows[0];
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