const { db } = require('../database');
const productService = require('./productService');

const orderService = {
  /**
   * Create a new order
   */
  async create(userId, productId, quantity, totalPrice, paymentCode) {
    const result = await db.execute({
      sql: `INSERT INTO orders (user_id, product_id, quantity, total_price, payment_code, status)
            VALUES (?, ?, ?, ?, ?, 'pending')`,
      args: [userId, productId, quantity, totalPrice, paymentCode]
    });

    return await this.getById(result.lastInsertRowid);
  },

  /**
   * Get order by ID
   */
  async getById(id) {
    const result = await db.execute({
      sql: `SELECT o.*, p.name as product_name
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.id = ?`,
      args: [id]
    });
    return result.rows[0];
  },

  /**
   * Get order by payment code
   */
  async getByPaymentCode(code) {
    const result = await db.execute({
      sql: `SELECT o.*, p.name as product_name
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.payment_code = ?`,
      args: [code]
    });
    return result.rows[0];
  },

  /**
   * Find a PENDING order whose payment_code contains the given suffix
   */
  async getPendingBySuffix(suffix) {
    // Lấy tất cả đơn đang chờ
    const result = await db.execute("SELECT o.*, p.name as product_name FROM orders o JOIN products p ON o.product_id = p.id WHERE o.status = 'pending'");
    const allPending = result.rows;
    
    // Duyệt qua từng đơn và so sánh mã đã làm sạch
    for (const order of allPending) {
        const cleanDbCode = order.payment_code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const cleanSuffix = suffix.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (cleanDbCode.includes(cleanSuffix)) {
            return order;
        }
    }
    return null;
  },

  /**
   * Get user's pending orders
   */
  async getPendingByUser(userId) {
    const result = await db.execute({
      sql: `SELECT o.*, p.name as product_name
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.user_id = ? AND o.status = 'pending'
            ORDER BY o.created_at DESC`,
      args: [userId]
    });
    return result.rows;
  },

  /**
   * Get user's recent orders
   */
  async getRecentByUser(userId, limit = 5) {
    const result = await db.execute({
      sql: `SELECT o.*, p.name as product_name
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
            LIMIT ?`,
      args: [userId, limit]
    });
    return result.rows;
  },

  /**
   * Confirm payment and deliver products
   */
  async confirmAndDeliver(orderId) {
    const order = await this.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    if (order.status !== 'pending') return { success: false, error: 'Đơn hàng đã được xử lý' };

    // Get available stock
    const stock = await productService.getAvailableStock(order.product_id, order.quantity);
    if (stock.length < order.quantity) {
      return { success: false, error: `Không đủ hàng. Chỉ còn ${stock.length} sản phẩm.` };
    }

    // Mark stock as sold
    const stockIds = stock.map((s) => s.id);
    await productService.markSold(stockIds, order.user_id);

    // Update order status
    await db.execute({
      sql: `UPDATE orders SET status = 'delivered', paid_at = CURRENT_TIMESTAMP, delivered_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [orderId]
    });

    const accounts = stock.map((s) => s.data);
    return { success: true, accounts, order };
  },

  /**
   * Mark order as paid
   */
  async markPaid(orderId) {
    const order = await this.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    if (order.status !== 'pending') return { success: false, error: 'Đơn hàng đã được xử lý' };

    await db.execute({
      sql: `UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [orderId]
    });

    return { success: true, order };
  },

  /**
   * Manual deliver
   */
  async manualDeliver(orderId) {
    await db.execute({
      sql: `UPDATE orders SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [orderId]
    });
  },

  /**
   * Cancel order
   */
  async cancel(orderId) {
    await db.execute({
      sql: "UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
      args: [orderId]
    });
  },

  /**
   * Get all pending orders
   */
  async getAllPending() {
    const result = await db.execute(`
      SELECT o.*, p.name as product_name, u.full_name as user_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.user_id = u.telegram_id
      WHERE o.status = 'pending'
      ORDER BY o.created_at ASC
    `);
    return result.rows;
  },

  /**
   * Get stats
   */
  async getStats() {
    const totalOrdersRes = await db.execute("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'");
    const totalRevenueRes = await db.execute("SELECT COALESCE(SUM(total_price), 0) as s FROM orders WHERE status = 'delivered'");
    const pendingOrdersRes = await db.execute("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'");
    const totalStockRes = await db.execute('SELECT COUNT(*) as c FROM stock WHERE is_sold = 0');
    const totalUsersRes = await db.execute('SELECT COUNT(*) as c FROM users');

    return {
        totalOrders: totalOrdersRes.rows[0].c,
        totalRevenue: totalRevenueRes.rows[0].s,
        pendingOrders: pendingOrdersRes.rows[0].c,
        totalStock: totalStockRes.rows[0].c,
        totalUsers: totalUsersRes.rows[0].c
    };
  },
};

module.exports = orderService;