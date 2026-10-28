require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth').router;
const pagesRoutes = require('./routes/pages');
const checkoutRoutes = require('./routes/checkout');
const transactionsRoutes = require('./routes/transactions');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for external website integrations / embeds
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

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/public', checkoutRoutes);
app.use('/api/transactions', transactionsRoutes);

// Pretty URL Routing for /pay/:slug
app.get('/pay/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

// Pretty URL Routing for /dashboard and /admin
app.get(['/dashboard', '/admin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Fallback to index.html for root
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
  • Merchant Dashboard: http://localhost:${PORT}/dashboard
  • Sample Pay Page:    http://localhost:${PORT}/pay/natasha-torres
  • API Endpoint:       http://localhost:${PORT}/api/public
  ==============================================================
  `);
});

module.exports = app;

