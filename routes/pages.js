const express = require('express');
const router = express.Router();
const { db } = require('../data/db');
const { requireAuth } = require('./auth');

// GET /api/pages - List all payment pages for the current user
router.get('/', requireAuth, (req, res) => {
  try {
    const pages = db.findPagesByUserId(req.user.id);
    const payments = db.findPaymentsByUserId(req.user.id);

    // Compute stats for each page
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

// POST /api/pages - Create a new payment page
router.post('/', requireAuth, (req, res) => {
  try {
    const { title, slug, receiver_name, description, type, fixed_amount, success_url, webhook_url, is_verified } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Page Title is required.' });
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
      webhook_url,
      is_verified: is_verified !== false
    });

    res.json({ success: true, page, message: 'Payment page created successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create page: ' + err.message });
  }
});

// GET /api/pages/:id - Get a specific payment page
router.get('/:id', requireAuth, (req, res) => {
  try {
    const page = db.findPageById(req.params.id);
    if (!page || page.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Page not found.' });
    }
    res.json({ success: true, page });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch page: ' + err.message });
  }
});

// PUT /api/pages/:id - Update payment page
router.put('/:id', requireAuth, (req, res) => {
  try {
    const updated = db.updatePage(req.params.id, req.user.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Page not found or unauthorized.' });
    }
    res.json({ success: true, page: updated, message: 'Page updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update page: ' + err.message });
  }
});

// DELETE /api/pages/:id - Delete payment page
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const deleted = db.deletePage(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Page not found or unauthorized.' });
    }
    res.json({ success: true, message: 'Payment page deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete page: ' + err.message });
  }
});

// PATCH /api/pages/:id/toggle - Toggle active status
router.patch('/:id/toggle', requireAuth, (req, res) => {
  try {
    const page = db.findPageById(req.params.id);
    if (!page || page.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Page not found or unauthorized.' });
    }
    const updated = db.updatePage(page.id, req.user.id, { is_active: !page.is_active });
    res.json({ success: true, page: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to toggle page: ' + err.message });
  }
});

module.exports = router;

