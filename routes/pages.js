const express = require('express');
const router = express.Router();
const { db } = require('../data/db');
const { requireAuth } = require('./auth');

// GET /api/pages - List all payment pages for current user
router.get('/', requireAuth, (req, res) => {
  try {
    const isStaff = ['owner', 'admin'].includes(req.user.role);
    const pages = isStaff && req.query.all === 'true'
      ? db.getAllPages()
      : db.findPagesByUserId(req.user.id);

    const payments = db.getAllPayments();

    const pagesWithStats = pages.map(page => {
      const pagePayments = payments.filter(p => p.page_id === page.id);
      const completed = pagePayments.filter(p => p.status === 'COMPLETED');
      const totalUsd = completed.reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
      const totalSats = completed.reduce((sum, p) => sum + (parseInt(p.amount_sats) || 0), 0);

      return {
        ...page,
        stats: {
          total_transactions: pagePayments.length,
          completed_transactions: completed.length,
          total_usd: totalUsd.toFixed(2),
          total_sats: totalSats
        }
      };
    });

    res.json({ success: true, pages: pagesWithStats });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch pages: ' + err.message });
  }
});

// POST /api/pages - Create new payment page with Satoshi wallet address
router.post('/', requireAuth, (req, res) => {
  try {
    const { title, slug, receiver_name, description, type, fixed_amount, success_url, is_verified, custom_wallet } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Page Title is required.' });
    }

    const wallet = custom_wallet || req.user.lightning_address;
    if (!wallet) {
      return res.status(400).json({ success: false, error: 'A Satoshi (Lightning) wallet address is required.' });
    }

    const page = db.createPage({
      user_id: req.user.id,
      title,
      slug,
      receiver_name: receiver_name || title,
      description,
      type: type || 'keypad',
      fixed_amount: parseFloat(fixed_amount) || 0,
      success_url,
      custom_wallet: wallet,
      is_verified: is_verified !== false
    });

    res.json({ success: true, page, message: 'Payment page created successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create page: ' + err.message });
  }
});

// DELETE /api/pages/:id - Delete payment page
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const isStaff = ['owner', 'admin'].includes(req.user.role);
    const deleted = db.deletePage(req.params.id, req.user.id, isStaff);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Page not found or unauthorized.' });
    }
    res.json({ success: true, message: 'Payment page deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete page: ' + err.message });
  }
});

module.exports = router;
