getPendingBySuffix(suffix) {
        // Lấy tất cả các đơn đang chờ
        const allPending = db.prepare("SELECT * FROM topups WHERE status = 'pending'").all();
        
        // Duyệt qua từng đơn, xóa mọi ký tự đặc biệt rồi so sánh
        for (const topup of allPending) {
            const cleanDbCode = topup.payment_code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (cleanDbCode.includes(suffix)) {
                return topup;
            }
        }
        return undefined;
    },