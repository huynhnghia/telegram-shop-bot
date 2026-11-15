const productService = require('../services/productService');
const messages = require('../utils/messages');
const { quantityKeyboard } = require('../utils/keyboard');
const config = require('../config');
const { Markup } = require('telegraf');

module.exports = (bot) => {
    // Xử lý khi chọn sản phẩm (giữ nguyên logic cũ của bạn)
    bot.action(/^product_(\d+)$/, (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        ctx.answerCbQuery();

        // Contact-only products → show contact info + Zalo link
        if (product.contact_only) {
            const buttons = [];

            // Button 1: Liên hệ mua qua Telegram admin
            const adminUsername = config.SUPPORT_CONTACT.replace('@', '');
            buttons.push([Markup.button.url('💬 Liên hệ mua', `https://t.me/${adminUsername}`)]);

            // Button 2: Tham gia nhóm Zalo (from sheet contact_url)
            if (product.contact_url) {
                buttons.push([Markup.button.url('📱 Hotline Zalo 24/7', product.contact_url)]);
            }

            // Back to product list
            buttons.push([Markup.button.callback('↩️ Quay lại', 'refresh_products')]);

            return ctx.replyWithHTML(
                messages.contactOnly(product),
                Markup.inlineKeyboard(buttons)
            );
        }

        // Check stock (use display_stock which falls back to sheet_stock)
        const availableStock = product.display_stock || product.stock_count;
        if (availableStock === 0) {
            return ctx.reply(messages.noStock);
        }

        // Show quantity selector
        const maxQty = Math.min(availableStock, 10);
        ctx.replyWithHTML(
            messages.selectQuantity(product),
            quantityKeyboard(productId, maxQty)
        );
    });

    // ═══════════════════════════════════════
    // XỬ LÝ NÚT TÀI / XỈU (MỚI THÊM)
    // ═══════════════════════════════════════

    // Xử lý khi bấm nút TÀI
    bot.action('bet_tai', (ctx) => {
        ctx.answerCbQuery('Bạn đã chọn TÀI!');
        ctx.replyWithHTML(
            `🔴 Bạn đã chọn cược <b>TÀI</b>.\n\n` +
            `⏳ Vui lòng chờ kết quả từ Admin...`
        );
    });

    // Xử lý khi bấm nút XỈU
    bot.action('bet_xiu', (ctx) => {
        ctx.answerCbQuery('Bạn đã chọn XỈU!');
        ctx.replyWithHTML(
            `🔵 Bạn đã chọn cược <b>XỈU</b>.\n\n` +
            `⏳ Vui lòng chờ kết quả từ Admin...`
        );
    });
};