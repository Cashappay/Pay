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

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Mount API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/public', checkoutRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/admin', adminRoutes);

// ==================== EXPLICIT CLEAN PAGE ROUTES ====================

// Website Owner & Management Team Console: /admin & /owner
app.get(['/admin', '/admin/', '/owner', '/owner/', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Merchant / User Profile: /profile
app.get(['/profile', '/profile/', '/profile.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// Legacy /dashboard alias -> Serves Admin or Profile
app.get(['/dashboard', '/dashboard.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Terms & Conditions Page: /terms
app.get(['/terms', '/terms/', '/terms.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// Normalize /pay?slug=mony or /pay.html?slug=mony -> /pay/:slug
app.get(['/pay', '/pay.html'], (req, res) => {
  const slug = req.query.slug || req.query.to || req.query.p || req.query.pay;
  if (slug) {
    return res.redirect(301, `/pay/${encodeURIComponent(slug)}`);
  }
  res.redirect(301, '/pay/natasha-torres');
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
  ⚡ CASH APP CRYPTO LIGHTNING PAYMENT GATEWAY ACTIVE ⚡
  ==============================================================
  • Portal & Landing:   http://localhost:${PORT}/
  • Owner & Admin:      http://localhost:${PORT}/admin
  • User Profile:       http://localhost:${PORT}/profile
  • Terms & Conditions: http://localhost:${PORT}/terms
  • Sample Pay Page:    http://localhost:${PORT}/pay/natasha-torres
  ==============================================================
  `);
});

module.exports = app;
