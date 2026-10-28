// Secure Backend Telegram Notification Service
// Keeps Telegram Bot Token and Chat ID completely hidden from frontend source code and DevTools

const https = require('https');
const { db } = require('../data/db');

function sendTelegramMessage(botToken, chatId, message) {
  return new Promise((resolve) => {
    if (!botToken || !chatId) {
      return resolve({ skipped: true, reason: 'Bot token or Chat ID not configured' });
    }

    const payload = JSON.stringify({
      chat_id: chatId.trim(),
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken.trim()}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: json.ok === true, data: json });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });

    req.on('error', (err) => {
      console.error('Telegram notification network error:', err.message);
      resolve({ ok: false, error: err.message });
    });

    req.setTimeout(6000, () => {
      req.destroy();
      resolve({ ok: false, error: 'Telegram request timed out' });
    });

    req.write(payload);
    req.end();
  });
}

// Notification for newly generated Cash App invoice
async function notifyInvoiceCreated({ page, payment, targetWallet }) {
  const settings = db.getSettings();
  const token = settings.telegram_bot_token;
  const chatId = settings.telegram_chat_id;
  if (!token || !chatId) return;

  const shortInvoice = payment.invoice
    ? `${payment.invoice.substring(0, 24)}...${payment.invoice.substring(payment.invoice.length - 12)}`
    : 'N/A';

  const routeLabel = payment.routing_target === 'OWNER'
    ? '👑 Owner Platform Wallet (Commission)'
    : '👤 Merchant Wallet';

  const msg =
    `⚡ *New Cash App Lightning Invoice Created!*\n\n` +
    `👤 *Page:* ${page.title} (\`/${page.slug}\`)\n` +
    `💰 *Amount:* $${Number(payment.amount_usd).toFixed(2)} USD (~${Number(payment.amount_sats).toLocaleString()} Sats)\n` +
    `🎯 *Routing:* ${routeLabel}\n` +
    `📥 *Target Wallet:* \`${targetWallet || payment.destination_wallet}\`\n` +
    `🌍 *Country:* ${payment.visitor_country || 'Unknown'}\n` +
    `🧾 *Invoice:* \`${shortInvoice}\`\n` +
    `🕒 *Time:* ${new Date().toUTCString()}`;

  return sendTelegramMessage(token, chatId, msg);
}

// Notification for confirmed payment settlement
async function notifyPaymentCompleted({ page, payment }) {
  const settings = db.getSettings();
  const token = settings.telegram_bot_token;
  const chatId = settings.telegram_chat_id;
  if (!token || !chatId) return;

  const routeLabel = payment.routing_target === 'OWNER'
    ? '👑 Owner Wallet (Commission)'
    : '👤 Merchant Wallet';

  const msg =
    `🎉 *Cash App Lightning Payment Settled!*\n\n` +
    `✅ *Status:* PAID & CONFIRMED\n` +
    `💵 *Amount:* $${Number(payment.amount_usd).toFixed(2)} USD (${Number(payment.amount_sats).toLocaleString()} Sats)\n` +
    `🎯 *Delivered To:* ${routeLabel} (\`${payment.destination_wallet}\`)\n` +
    `🆔 *Payment ID:* \`${payment.id}\`\n` +
    `🕒 *Settled At:* ${new Date().toUTCString()}`;

  return sendTelegramMessage(token, chatId, msg);
}

module.exports = {
  sendTelegramMessage,
  notifyInvoiceCreated,
  notifyPaymentCompleted
};
