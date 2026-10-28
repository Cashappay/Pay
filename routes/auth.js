const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db, verifyPassword } = require('../data/db');

const AUTH_SECRET = process.env.AUTH_SECRET || 'cashapp_lightning_auth_key_super_secret_2026';

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

  if (user.status === 'blocked') {
    return res.status(403).json({ success: false, error: 'Your account has been deactivated. Please contact management.' });
  }

  req.user = user;
  next();
}

// Owner / Admin / Support Staff Middleware
function requireStaff(req, res, next) {
  requireAuth(req, res, () => {
    if (['owner', 'admin', 'support'].includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ success: false, error: 'Access denied. Management and Admin team only.' });
  });
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    dob: user.dob || '',
    role: user.role || 'user',
    status: user.status || 'active',
    lightning_address: user.lightning_address,
    payments_count: user.payments_count || 0,
    created_at: user.created_at
  };
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { name, email, password, lightning_address, agreed_terms } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }

    if (!agreed_terms) {
      return res.status(400).json({ success: false, error: 'You must agree to the Terms and Conditions to register.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must contain at least one uppercase letter, one number, and one special character.'
      });
    }

    const existing = db.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
    }

    const user = db.createUser({
      name,
      email,
      password,
      lightning_address: lightning_address || 'fittinggliding280@walletofsatoshi.com',
      agreed_terms: true,
      role: 'user'
    });

    // Create initial page for user
    db.createPage({
      user_id: user.id,
      title: `${user.name}'s Cash App Pay`,
      slug: user.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      receiver_name: user.name,
      description: 'Cash App Lightning payment page',
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

    if (user.status === 'blocked') {
      return res.status(403).json({ success: false, error: 'Your account has been deactivated by management.' });
    }

    const token = generateToken(user.id);
    res.json({
      success: true,
      token,
      user: sanitizeUser(user),
      redirect: ['owner', 'admin', 'support'].includes(user.role) ? '/admin' : '/profile'
    });
  } catch (err) {
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
    const { name, email, dob, lightning_address, password } = req.body;

    const updates = {};
    if (name) updates.name = name.trim();
    if (email) updates.email = email.trim();
    if (dob !== undefined) updates.dob = dob.trim();
    if (lightning_address !== undefined) updates.lightning_address = lightning_address.trim();
    if (password && password.length >= 6) updates.password = password;

    const updated = db.updateUser(req.user.id, updates);
    res.json({
      success: true,
      user: sanitizeUser(updated),
      message: 'Profile settings updated successfully.'
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to update profile.' });
  }
});

module.exports = {
  router,
  requireAuth,
  requireStaff,
  generateToken,
  sanitizeUser
};
