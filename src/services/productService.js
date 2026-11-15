const { db } = require('../database');

const productService = {
    /**
     * Get all active products with stock count
     */
    async getAll() {
        const result = await db.execute(`
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count,
        CASE
          WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) > 0
          THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0)
          ELSE COALESCE(p.sheet_stock, 0)
        END as display_stock
      FROM products p
      WHERE p.is_active = 1
      ORDER BY p.category_id, p.id
    `);
        return result.rows;
    },

    /**
     * Get single product with stock count
     */
    async getById(id) {
        const result = await db.execute({
            sql: `
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count,
        CASE
          WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) > 0
          THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0)
          ELSE COALESCE(p.sheet_stock, 0)
        END as display_stock
      FROM products p
      WHERE p.id = ?
    `,
            args: [id]
        });
        return result.rows[0];
    },

    /**
     * Get products by category
     */
    async getByCategory(categoryId) {
        const result = await db.execute({
            sql: `
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count
      FROM products p
      WHERE p.category_id = ? AND p.is_active = 1
      ORDER BY p.id
    `,
            args: [categoryId]
        });
        return result.rows;
    },

    /**
     * Get all categories
     */
    async getCategories() {
        const result = await db.execute('SELECT * FROM categories ORDER BY sort_order');
        return result.rows;
    },

    /**
     * Add stock items for a product
     */
    async addStock(productId, dataLines) {
        // Turso không hỗ trợ transaction đồng bộ, ta dùng vòng lặp async
        for (const line of dataLines) {
            if (line.trim()) {
                await db.execute({
                    sql: 'INSERT INTO stock (product_id, data) VALUES (?, ?)',
                    args: [productId, line.trim()]
                });
            }
        }
    },

    /**
     * Get available stock for a product
     */
    async getAvailableStock(productId, quantity) {
        const result = await db.execute({
            sql: 'SELECT * FROM stock WHERE product_id = ? AND is_sold = 0 LIMIT ?',
            args: [productId, quantity]
        });
        return result.rows;
    },

    /**
     * Mark stock as sold
     */
    async markSold(stockIds, userId) {
        for (const id of stockIds) {
            await db.execute({
                sql: 'UPDATE stock SET is_sold = 1, sold_to = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ?',
                args: [userId, id]
            });
        }
    },

    /**
     * Add a new product
     */
    async addProduct(categoryId, name, price, emoji = '📦', promotion = null, contactOnly = false) {
        const result = await db.execute({
            sql: 'INSERT INTO products (category_id, name, price, emoji, promotion, contact_only) VALUES (?, ?, ?, ?, ?, ?)',
            args: [categoryId, name, price, emoji, promotion, contactOnly ? 1 : 0]
        });
        return result.lastInsertRowid;
    },
};

module.exports = productService;