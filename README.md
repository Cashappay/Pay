# ⚡ Cash App Crypto Lightning Payment Gateway

A high-converting, enterprise-grade payment gateway that accepts **Bitcoin Lightning payments exclusively via Cash App**.

Designed for digital creators, merchants, platforms, donation portals, and mobile apps.

---

## 🚀 Key Features

1. **Cash App Crypto Lightning Only**:
   - Seamless deep-linking directly into Cash App (`squarecash://`, `cashme://`, and Android Intent).
   - Auto-copies invoice to clipboard so Cash App prompts the user to pay immediately upon launch.
   - High-definition QR Code styled with the official Cash App green icon for desktop and camera scans.
   - Live BTC spot rate conversion (Coinbase/Binance).

2. **100% Backend Security**:
   - **No sensitive credentials in frontend code**: Telegram bot tokens, chat IDs, secret keys, and webhook signing are stored strictly on the server.
   - Protected against inspection, DevTools extraction, and WebView decompilation.

3. **User Management Dashboard**:
   - **User Authentication**: Secure Sign Up & Login with hashed passwords and session management.
   - **Payment Pages Manager**: Create and manage multiple pages (`/pay/:slug`), toggle between **Custom Keypad** and **Fixed Price ($)**, set custom redirect URLs.
   - **Transactions Ledger**: Real-time record of all invoices, satoshis, USD amounts, and settlement statuses.
   - **Webhooks & Developer Hub**:
     - Webhook URL configuration with live **"Send Test Webhook"** ping runner.
     - Measures latency (ms), HTTP status code (200 OK, 500), and response preview.
     - Cryptographic **HMAC-SHA256 signature** verification.
     - Delivery logs and retry history.
   - **Merchant Settings**: Configure your Lightning Payout Address (`user@walletofsatoshi.com`, Blink, Alby, Cash App Lightning) and private Telegram alert bot.

4. **WebView & Embed Friendly**:
   - Fully tested and optimized for Android WebView, iOS WKWebView, Telegram WebApp, and iframe embeds.
   - Generates 1-click HTML button widgets and responsive embed iframes.

---

## 🛠️ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Gateway Server
```bash
npm start
```
The server will boot on `http://localhost:3000`.

### 3. Open in Browser
- **Portal & Homepage**: `http://localhost:3000/`
- **Merchant Dashboard**: `http://localhost:3000/dashboard`
- **Sample Payment Page**: `http://localhost:3000/pay/natasha-torres`

> **Default Demo Login**:
> - Email: `demo@cashapp-gateway.com`
> - Password: `admin123`

---

## 🔗 Accurate Webhook Verification Guide

Every webhook event sent from this gateway carries the following HTTP headers:
- `X-CashApp-Signature`: `t=1793218000,v1=9f83ab...` (Timestamp and HMAC-SHA256 hash)
- `X-CashApp-Event`: e.g. `payment.completed`
- `X-CashApp-Delivery`: Unique delivery ID
- `X-CashApp-Timestamp`: Unix timestamp

### Sample Webhook Payload (`payment.completed`)
```json
{
  "id": "evt_98f82a10",
  "event": "payment.completed",
  "created_at": 1793218000,
  "data": {
    "payment_id": "pay_a1b2c3d4",
    "page_id": "pg_sample_natasha",
    "slug": "natasha-torres",
    "receiver_name": "Natasha Torres",
    "amount_usd": 25.00,
    "amount_sats": 36500,
    "currency": "USD",
    "status": "COMPLETED",
    "invoice": "lnbc365u1p...",
    "paid_at": "2026-10-28T20:15:00.000Z"
  }
}
```

### Verification in PHP (WordPress / WooCommerce / Custom PHP)
```php
<?php
$webhookSecret = 'whsec_your_secret_from_dashboard';

$payload = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_X_CASHAPP_SIGNATURE'] ?? '';

// Parse signature header: t=...,v1=...
parse_str(str_replace(',', '&', $sigHeader), $parts);
$timestamp = $parts['t'] ?? '';
$signature = $parts['v1'] ?? '';

$expected = hash_hmac('sha256', "{$timestamp}.{$payload}", $webhookSecret);

if (hash_equals($expected, $signature)) {
    $event = json_decode($payload, true);
    if ($event['event'] === 'payment.completed') {
        $paymentId = $event['data']['payment_id'];
        $amount = $event['data']['amount_usd'];
        // Mark order as PAID in your database!
    }
    http_response_code(200);
    echo json_encode(['received' => true]);
} else {
    http_response_code(400);
    echo 'Invalid signature';
}
?>
```

### Verification in Node.js (Express)
```javascript
const crypto = require('crypto');

app.post('/api/cashapp-webhook', (req, res) => {
  const secret = process.env.CASHAPP_WEBHOOK_SECRET;
  const sigHeader = req.headers['x-cashapp-signature'];
  const rawBody = JSON.stringify(req.body);

  const parts = Object.fromEntries(sigHeader.split(',').map(s => s.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;

  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  if (signature === expected) {
    const { event, data } = req.body;
    if (event === 'payment.completed') {
      // Mark transaction completed
    }
    return res.status(200).json({ received: true });
  }

  return res.status(400).send('Invalid signature');
});
```

