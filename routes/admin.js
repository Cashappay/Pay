const express = require('express');
const router = express.Router();
const { db } = require('../data/db');
const { requireStaff, generateToken } = require('./auth');
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

// POST /api/admin/users - Manually create User or Support or Admin account
router.post('/users', (req, res) => {
  try {
    const { name, email, password, role, status, lightning_address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.findUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
    }

    const allowedRoles = ['user', 'support', 'admin'];
    const finalRole = allowedRoles.includes(role) ? role : 'user';

    const user = db.createUser({
      name: name.trim(),
      email: cleanEmail,
      password: password,
      role: finalRole,
      status: ['active', 'frozen', 'blocked'].includes(status) ? status : 'active',
      lightning_address: lightning_address?.trim() || 'fittinggliding280@walletofsatoshi.com',
      agreed_terms: true
    });

    // Create an initial default payment page if regular user
    if (finalRole === 'user') {
      db.createPage({
        user_id: user.id,
        title: `${user.name}'s Cash App Pay`,
        slug: user.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        receiver_name: user.name,
        description: 'Cash App Lightning payment page',
        type: 'keypad',
        fixed_amount: 0,
        is_verified: true,
        custom_wallet: user.lightning_address
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        lightning_address: user.lightning_address,
        created_at: user.created_at
      },
      message: `Account (${finalRole}) created successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/users/:id/impersonate - Generate visit/impersonation session for a user profile
router.post('/users/:id/impersonate', (req, res) => {
  try {
    const targetUser = db.findUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const token = generateToken(targetUser.id);
    res.json({
      success: true,
      token,
      redirectUrl: `/profile?impersonate_token=${token}`,
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/users/:id/pages - Get all payment pages belonging to a specific user
router.get('/users/:id/pages', (req, res) => {
  try {
    const targetUser = db.findUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const pages = db.findPagesByUserId(targetUser.id);
    const payments = db.getAllPayments();

    const pagesWithStats = pages.map(p => {
      const pagePayments = payments.filter(pay => pay.page_id === p.id);
      const completed = pagePayments.filter(pay => pay.status === 'COMPLETED');
      const totalUsd = completed.reduce((sum, pay) => sum + (parseFloat(pay.amount_usd) || 0), 0);
      return {
        ...p,
        stats: {
          total_transactions: pagePayments.length,
          completed_transactions: completed.length,
          total_usd: totalUsd.toFixed(2)
        }
      };
    });

    res.json({ success: true, user: targetUser, pages: pagesWithStats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== FULL PAYMENT LINKS CONTROL ====================

// GET /api/admin/pages - List all payment pages platform-wide with merchant info
router.get('/pages', (req, res) => {
  try {
    const pages = db.getAllPages();
    const users = db.getAllUsers();
    const payments = db.getAllPayments();

    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    const enriched = pages.map(page => {
      const pagePayments = payments.filter(p => p.page_id === page.id);
      const completed = pagePayments.filter(p => p.status === 'COMPLETED');
      const totalUsd = completed.reduce((sum, p) => sum + (parseFloat(p.amount_usd) || 0), 0);
      const totalSats = completed.reduce((sum, p) => sum + (parseInt(p.amount_sats) || 0), 0);
      const user = userMap[page.user_id];

      return {
        ...page,
        merchant_name: user ? user.name : 'Unknown User',
        merchant_email: user ? user.email : 'N/A',
        merchant_role: user ? user.role : 'user',
        stats: {
          total_transactions: pagePayments.length,
          completed_transactions: completed.length,
          total_usd: totalUsd.toFixed(2),
          total_sats: totalSats
        }
      };
    });

    res.json({ success: true, pages: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/pages - Create payment page on behalf of any merchant/user
router.post('/pages', (req, res) => {
  try {
    const { user_id, title, slug, receiver_name, description, type, fixed_amount, custom_wallet, is_verified, success_url } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Page Title is required.' });
    }

    const targetUserId = user_id || req.user.id;
    const targetUser = db.findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target merchant/user not found.' });
    }

    const wallet = custom_wallet || targetUser.lightning_address || 'fittinggliding280@walletofsatoshi.com';

    const page = db.createPage({
      user_id: targetUserId,
      title,
      slug,
      receiver_name: receiver_name || title,
      description: description || '',
      type: type === 'fixed' ? 'fixed' : 'keypad',
      fixed_amount: parseFloat(fixed_amount) || 0,
      custom_wallet: wallet,
      success_url: success_url || '',
      is_verified: is_verified !== false
    });

    res.json({ success: true, page, message: 'Payment page created successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/pages/:id - Full update of any payment page
router.put('/pages/:id', (req, res) => {
  try {
    const { title, slug, receiver_name, description, type, fixed_amount, custom_wallet, is_verified, is_active, user_id, success_url } = req.body;

    const page = db.findPageById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Payment page not found.' });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (slug !== undefined) updates.slug = slug;
    if (receiver_name !== undefined) updates.receiver_name = receiver_name;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (fixed_amount !== undefined) updates.fixed_amount = fixed_amount;
    if (custom_wallet !== undefined) updates.custom_wallet = custom_wallet;
    if (is_verified !== undefined) updates.is_verified = is_verified;
    if (is_active !== undefined) updates.is_active = is_active;
    if (user_id !== undefined) updates.user_id = user_id;
    if (success_url !== undefined) updates.success_url = success_url;

    const updated = db.updatePage(page.id, updates);
    res.json({ success: true, page: updated, message: 'Payment page updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/pages/:id/toggle - Toggle active/paused status of pay link
router.patch('/pages/:id/toggle', (req, res) => {
  try {
    const page = db.findPageById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Payment page not found.' });
    }

    const updated = db.updatePage(page.id, { is_active: !page.is_active });
    res.json({
      success: true,
      page: updated,
      message: `Payment page is now ${updated.is_active ? 'Active' : 'Paused'}.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/pages/:id - Delete any payment page
router.delete('/pages/:id', (req, res) => {
  try {
    const deleted = db.deletePage(req.params.id, null, true);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Payment page not found.' });
    }
    res.json({ success: true, message: 'Payment page deleted successfully.' });
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

