const express = require('express');
const router = express.Router();
const { db } = require('../data/db');
const { requireAuth } = require('./auth');
const { sendTestWebhook } = require('../services/webhook');

// GET /api/transactions - List payments for the authenticated user
router.get('/', requireAuth, (req, res) => {
  try {
    const payments = db.findPaymentsByUserId(req.user.id);
    const pages = db.findPagesByUserId(req.user.id);
    const pageMap = {};
    pages.forEach(p => { pageMap[p.id] = p; });

    const enriched = payments.map(payment => ({
      ...payment,
      page_title: pageMap[payment.page_id]?.title || payment.slug,
      receiver_name: pageMap[payment.page_id]?.receiver_name || req.user.name
    }));

    res.json({
      success: true,
      payments: enriched
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch transactions: ' + err.message });
  }
});

// GET /api/transactions/:id - Get transaction details
router.get('/:id', requireAuth, (req, res) => {
  try {
    const payment = db.findPaymentById(req.params.id);
    if (!payment || payment.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Transaction not found.' });
    }
    const page = db.findPageById(payment.page_id);
    res.json({
      success: true,
      payment: {
        ...payment,
        page_title: page?.title || payment.slug,
        receiver_name: page?.receiver_name || req.user.name,
        success_url: page?.success_url || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch transaction: ' + err.message });
  }
});

// POST /api/webhooks/test - Fire real-time test webhook ping
router.post('/webhooks/test', requireAuth, async (req, res) => {
  try {
    const targetUrl = req.body.url || req.user.webhook_url;
    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Please configure a Webhook URL in your profile or enter one in the test dialog.'
      });
    }

    const { log, result } = await sendTestWebhook(req.user, targetUrl);

    res.json({
      success: true,
      result: {
        success: result.success,
        http_code: result.http_code,
        duration_ms: result.duration_ms,
        response_body: result.response_body,
        delivery_id: result.delivery_id,
        target_url: targetUrl
      },
      log
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Webhook test failed: ' + err.message });
  }
});

// GET /api/webhooks/logs - List webhook delivery logs
router.get('/webhooks/logs', requireAuth, (req, res) => {
  try {
    const logs = db.getWebhookLogsByUserId(req.user.id);
    res.json({
      success: true,
      logs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch webhook logs: ' + err.message });
  }
});

module.exports = router;

