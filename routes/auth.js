const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db, verifyPassword } = require('../data/db');

const AUTH_SECRET = process.env.AUTH_SECRET || 'cashapp_lightning_auth_key_super_secret_2026';

// Simple signed token generator
function generateToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + (30 * 24 * 60 * 60 * 1000) })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (signature !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (data.exp && data.exp < Date.now()) return null;
    return data.uid;
  } catch (e) {
    return null;
  }
}

// Authentication Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }

  const user = db.findUserById(userId);
  if (!user) {
    return res.status(401).json({ success: false, error: 'User account not found.' });
  }

  req.user = user;
  next();
}

// Sanitize user object for responses
function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    lightning_address: user.lightning_address,
    telegram_bot_token: user.telegram_bot_token ? `${user.telegram_bot_token.substring(0, 8)}...` : '',
    has_telegram_bot: Boolean(user.telegram_bot_token),
    telegram_chat_id: user.telegram_chat_id,
    webhook_url: user.webhook_url,
    webhook_secret: user.webhook_secret,
    api_key_public: user.api_key_public,
    api_key_secret: user.api_key_secret,
    created_at: user.created_at
  };
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { name, email, password, lightning_address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const existing = db.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
    }

    const user = db.createUser({
      name,
      email,
      password,
      lightning_address: lightning_address || 'fittinggliding280@walletofsatoshi.com'
    });

    // Create a default first payment page for the user
    db.createPage({
      user_id: user.id,
      title: `${user.name}'s Cash App Pay`,
      slug: user.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      receiver_name: user.name,
      description: 'Accepting Cash App Lightning payments',
      type: 'keypad',
      fixed_amount: 0,
      is_verified: true
    });

    const token = generateToken(user.id);
    res.json({
      success: true,
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: 'Registration failed: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const token = generateToken(user.id);
    res.json({
      success: true,
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed: ' + err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: sanitizeUser(req.user)
  });
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, (req, res) => {
  try {
    const { name, lightning_address, telegram_bot_token, telegram_chat_id, webhook_url, password } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (lightning_address !== undefined) updates.lightning_address = lightning_address;
    if (telegram_bot_token !== undefined && !telegram_bot_token.includes('...')) {
      updates.telegram_bot_token = telegram_bot_token;
    }
    if (telegram_chat_id !== undefined) updates.telegram_chat_id = telegram_chat_id;
    if (webhook_url !== undefined) updates.webhook_url = webhook_url;
    if (password && password.length >= 6) updates.password = password;

    const updated = db.updateUser(req.user.id, updates);
    res.json({
      success: true,
      user: sanitizeUser(updated),
      message: 'Profile updated successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update profile: ' + err.message });
  }
});

// POST /api/auth/regenerate-keys
router.post('/regenerate-keys', requireAuth, (req, res) => {
  try {
    const updated = db.regenerateKeys(req.user.id);
    res.json({
      success: true,
      user: sanitizeUser(updated),
      message: 'API Keys and Webhook Secret regenerated successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to regenerate keys: ' + err.message });
  }
});

module.exports = {
  router,
  requireAuth,
  sanitizeUser
};

