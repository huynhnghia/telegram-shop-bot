const db = require('../database');

const topupService = {
    create(telegramId, amount, paymentCode) {
        const result = db.prepare(`
      INSERT INTO topups (telegram_id, amount, payment_code, status)
      VALUES (?, ?, ?, 'pending')
    `).run(telegramId, amount, paymentCode);

        return this.getById(result.lastInsertRowid);
    },

    getById(id) {
        return db.prepare('SELECT * FROM topups WHERE id = ?').get(id);
    },

    getByCode(code) {
        return db.prepare('SELECT * FROM topups WHERE payment_code = ?').get(code);
    },

    // HÀM TÌM KIẾM MỚI: Bỏ qua mọi dấu cách, gạch ngang, và cả lỗi gõ nhầm 0/O
    getPendingBySuffix(suffix) {
        const allPending = db.prepare("SELECT * FROM topups WHERE status = 'pending'").all();
        
        for (const topup of allPending) {
            // Xóa mọi ký tự đặc biệt trong mã lưu ở DB
            const cleanDbCode = topup.payment_code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            
            // Xóa mọi ký tự đặc biệt trong mã SePay gửi sang
            const cleanSuffix = suffix.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            
            // So sánh: Nếu mã DB chứa mã SePay gửi sang là khớp
            if (cleanDbCode.includes(cleanSuffix)) {
                return topup;
            }
        }
        return undefined;
    },

    markPaid(id) {
        db.prepare(`
      UPDATE topups SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    },

    getRecentByUser(telegramId, limit = 5) {
        return db.prepare(`
      SELECT * FROM topups WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(telegramId, limit);
    },

    getAllPending() {
        return db.prepare("SELECT * FROM topups WHERE status = 'pending'").all();
    },
};

module.exports = topupService;