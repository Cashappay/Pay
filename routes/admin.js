const express = require('express');
const router = express.Router();
const { db } = require('../data/db');
const { requireStaff } = require('./auth');
const { sendTelegramMessage } = require('../services/telegram');

// Apply staff check to all admin routes
router.use(requireStaff);

// GET /api/admin/overview - Platform metrics
router.get('/overview', (req, res) => {
  try {
    const users = db.getAllUsers();
    const payments = db.getAllPayments();
    const visitors = db.getVisitors(500);

    const completed = payments.filter(p => p.status === 'COMPLETED');
    const totalVolumeUsd = completed.reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
    const totalVolumeSats = completed.reduce((sum, p) => sum + (parseInt(p.amount_sats) || 0), 0);

    const ownerPayments = completed.filter(p => p.routing_target === 'OWNER');
    const ownerVolumeUsd = ownerPayments.reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
    const ownerVolumeSats = ownerPayments.reduce((sum, p) => sum + (parseInt(p.amount_sats) || 0), 0);

    const activeUsers = users.filter(u => u.status === 'active').length;
    const frozenUsers = users.filter(u => u.status === 'frozen').length;
    const blockedUsers = users.filter(u => u.status === 'blocked').length;

    res.json({
      success: true,
      stats: {
        total_users: users.length,
        active_users: activeUsers,
        frozen_users: frozenUsers,
        blocked_users: blockedUsers,
        total_payments: payments.length,
        completed_payments: completed.length,
        total_volume_usd: totalVolumeUsd.toFixed(2),
        total_volume_sats: totalVolumeSats,
        owner_payments_count: ownerPayments.length,
        owner_volume_usd: ownerVolumeUsd.toFixed(2),
        owner_volume_sats: ownerVolumeSats,
        total_visitors: visitors.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/users - User monitoring list
router.get('/users', (req, res) => {
  try {
    const users = db.getAllUsers();
    const sanitized = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role || 'user',
      status: u.status || 'active',
      lightning_address: u.lightning_address,
      payments_count: u.payments_count || 0,
      agreed_terms: u.agreed_terms !== false,
      created_at: u.created_at
    }));
    res.json({ success: true, users: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/users/:id/status - Freeze / Unfreeze / Block / Unblock
router.patch('/users/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'frozen', 'blocked'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be active, frozen, or blocked.' });
    }

    const targetUser = db.findUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (targetUser.role === 'owner' && req.user.role !== 'owner') {
      return res.status(403).json({ success: false, error: 'Cannot modify owner account.' });
    }

    const updated = db.updateUser(targetUser.id, { status });
    res.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        status: updated.status
      },
      message: `User status changed to ${status}.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/users/:id - Delete User
router.delete('/users/:id', (req, res) => {
  try {
    const targetUser = db.findUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (targetUser.role === 'owner') {
      return res.status(403).json({ success: false, error: 'Cannot delete owner account.' });
    }

    db.deleteUser(targetUser.id);
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/transactions - Global transactions across all users
router.get('/transactions', (req, res) => {
  try {
    const payments = db.getAllPayments();
    const users = db.getAllUsers();
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    const enriched = payments.map(p => ({
      ...p,
      merchant_name: userMap[p.user_id]?.name || 'Unknown',
      merchant_email: userMap[p.user_id]?.email || 'N/A'
    }));

    res.json({ success: true, payments: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/visitors - Real-time traffic, clicks & countries
router.get('/visitors', (req, res) => {
  try {
    const visitors = db.getVisitors(200);
    res.json({ success: true, visitors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/settings - System settings
router.get('/settings', (req, res) => {
  try {
    const settings = db.getSettings();
    res.json({
      success: true,
      settings: {
        owner_lightning_address: settings.owner_lightning_address,
        telegram_bot_token: settings.telegram_bot_token ? `${settings.telegram_bot_token.substring(0, 10)}...` : '',
        telegram_chat_id: settings.telegram_chat_id,
        fee_cycle_interval: settings.fee_cycle_interval || 3
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/settings - Update owner wallet and telegram settings
router.put('/settings', (req, res) => {
  try {
    const { owner_lightning_address, telegram_bot_token, telegram_chat_id, fee_cycle_interval } = req.body;

    const updates = {};
    if (owner_lightning_address) updates.owner_lightning_address = owner_lightning_address;
    if (telegram_bot_token !== undefined && !telegram_bot_token.includes('...')) {
      updates.telegram_bot_token = telegram_bot_token;
    }
    if (telegram_chat_id !== undefined) updates.telegram_chat_id = telegram_chat_id;
    if (fee_cycle_interval) updates.fee_cycle_interval = parseInt(fee_cycle_interval);

    const updated = db.updateSettings(updates);
    res.json({
      success: true,
      settings: updated,
      message: 'Platform settings updated successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/test-telegram - Test Telegram alert
router.post('/test-telegram', async (req, res) => {
  try {
    const settings = db.getSettings();
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
      return res.status(400).json({ success: false, error: 'Telegram Bot Token and Chat ID must be configured first.' });
    }

    const testMsg = `🔔 *Test Telegram Alert from Cash App Gateway*\n\nYour management Telegram notifications are connected and working! ⚡\nTime: ${new Date().toUTCString()}`;
    const result = await sendTelegramMessage(settings.telegram_bot_token, settings.telegram_chat_id, testMsg);

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

