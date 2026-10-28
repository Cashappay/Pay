require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth').router;
const pagesRoutes = require('./routes/pages');
const checkoutRoutes = require('./routes/checkout');
const transactionsRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CashApp-Signature', 'X-CashApp-Event']
}));

// Body Parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Clean URL Routing Middleware (strip .html extensions and normalize /pay?slug=xyz to /pay/xyz)
app.use((req, res, next) => {
  // If payment page requested via /pay.html or /pay with query param slug/to/p
  const slug = req.query.slug || req.query.to || req.query.p || req.query.pay;
  if ((req.path === '/pay' || req.path === '/pay.html') && slug) {
    return res.redirect(301, `/pay/${encodeURIComponent(slug)}`);
  }

  // Handle any other .html extensions
  if (req.path.endsWith('.html')) {
    const cleanPath = req.path.slice(0, -5);
    const query = req.url.slice(req.path.length);
    if (cleanPath === '/dashboard') return res.redirect(301, '/profile' + query);
    if (cleanPath === '/pay') {
      return res.redirect(301, '/pay/natasha-torres' + query);
    }
    return res.redirect(301, cleanPath + query);
  }
  next();
});

// Handle /pay without slug
app.get('/pay', (req, res) => {
  const slug = req.query.slug || req.query.to || req.query.p || req.query.pay;
  if (slug) {
    return res.redirect(301, `/pay/${encodeURIComponent(slug)}`);
  }
  res.redirect(301, '/pay/natasha-torres');
});

// Mount Static Assets (without index.html override)
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// Mount API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/public', checkoutRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/admin', adminRoutes);

// Clean Pretty URLs (NO .html visible)
app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// Backward compatibility redirect for /dashboard -> /profile
app.get('/dashboard', (req, res) => {
  res.redirect('/profile');
});

// Website Owner & Management Team Admin Dashboard
app.get(['/admin', '/owner'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Terms & Conditions Page
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// Public Payment Page: /pay/:slug
app.get('/pay/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

// Root Landing Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`
  ==============================================================
  ⚡ CASH APP CRYPTO LIGHTNING PAYMENT GATEWAY SERVER ACTIVE ⚡
  ==============================================================
  • Portal & Landing:   http://localhost:${PORT}/
  • User Profile:       http://localhost:${PORT}/profile
  • Owner & Admin:      http://localhost:${PORT}/admin
  • Terms & Conditions: http://localhost:${PORT}/terms
  • Sample Pay Page:    http://localhost:${PORT}/pay/natasha-torres
  ==============================================================
  `);
});

module.exports = app;
