const { db } = require('../database');

const topupService = {
    async create(telegramId, amount, paymentCode) {
        const result = await db.execute({
            sql: `INSERT INTO topups (telegram_id, amount, payment_code, status) VALUES (?, ?, ?, 'pending')`,
            args: [telegramId, amount, paymentCode]
        });
        return await this.getById(result.lastInsertRowid);
    },

    async getById(id) {
        const result = await db.execute({
            sql: 'SELECT * FROM topups WHERE id = ?',
            args: [id]
        });
        return result.rows[0];
    },

    async getPendingBySuffix(suffix) {
        const result = await db.execute("SELECT * FROM topups WHERE status = 'pending'");
        const allPending = result.rows;
        
        for (const topup of allPending) {
            const cleanDbCode = topup.payment_code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            const cleanSuffix = suffix.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (cleanDbCode.includes(cleanSuffix)) {
                return topup;
            }
        }
        return null;
    },

    async markPaid(id) {
        await db.execute({
            sql: `UPDATE topups SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [id]
        });
    },

    async getAllPending() {
        const result = await db.execute("SELECT * FROM topups WHERE status = 'pending'");
        return result.rows;
    }
};

module.exports = topupService;