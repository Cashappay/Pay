// Lightning Network LNURL-Pay Resolver
// Handles resolving lightning addresses into BOLT11 payment requests

const http = require('http');
const https = require('https');

// Helper to make fetch requests using native node http/https
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'CashApp-Lightning-Gateway/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('LNURL request timed out'));
    });
  });
}

// Get live BTC rate from Coinbase or Binance
async function getBtcSpotRate() {
  try {
    const data = await fetchJson('https://api.coinbase.com/v2/prices/spot?currency=USD');
    if (data?.data?.amount) {
      return parseFloat(data.data.amount);
    }
  } catch (err) {
    try {
      const bData = await fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      if (bData?.price) {
        return parseFloat(bData.price);
      }
    } catch (e) {
      console.warn('Using fallback BTC rate:', e.message);
    }
  }
  return 68500; // Safe fallback spot rate if APIs are temporarily down
}

// Resolve Lightning Address (e.g. user@walletofsatoshi.com) into a BOLT11 Invoice
async function generateLightningInvoice(lightningAddress, satsAmount, comment = 'Cash App Lightning Payment') {
  if (!lightningAddress || !lightningAddress.includes('@')) {
    throw new Error('Invalid or missing Lightning Address');
  }

  const [username, domain] = lightningAddress.trim().split('@');
  const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${username}`;

  try {
    // 1. Fetch LNURL-pay metadata
    const meta = await fetchJson(lnurlpUrl);
    if (!meta.callback) {
      throw new Error(meta.reason || 'Invalid LNURL-Pay response: no callback URL');
    }

    const millisats = Math.round(satsAmount * 1000);
    const minSendable = meta.minSendable || 1000;
    const maxSendable = meta.maxSendable || 100000000000;

    if (millisats < minSendable || millisats > maxSendable) {
      const minSats = Math.round(minSendable / 1000);
      const maxSats = Math.round(maxSendable / 1000);
      throw new Error(`Amount must be between ${minSats} and ${maxSats} Sats`);
    }

    // 2. Call callback to generate real BOLT11 invoice
    const separator = meta.callback.includes('?') ? '&' : '?';
    let callbackUrl = `${meta.callback}${separator}amount=${millisats}`;
    if (meta.commentAllowed && meta.commentAllowed > 0 && comment) {
      callbackUrl += `&comment=${encodeURIComponent(comment.substring(0, meta.commentAllowed))}`;
    }

    const invoiceData = await fetchJson(callbackUrl);
    if (!invoiceData.pr) {
      throw new Error(invoiceData.reason || 'Failed to obtain BOLT11 payment request');
    }

    return {
      invoice: invoiceData.pr,
      verifyUrl: invoiceData.verify || null,
      routes: invoiceData.routes || []
    };
  } catch (err) {
    console.error('LNURL resolution error for address ' + lightningAddress + ':', err.message);
    throw err;
  }
}

// Verify settlement if the LNURL provider supports LUD-11 verify
async function checkInvoiceSettlement(verifyUrl) {
  if (!verifyUrl) return null;
  try {
    const res = await fetchJson(verifyUrl);
    return res.settled === true || res.status === 'PAID';
  } catch (err) {
    return null;
  }
}

module.exports = {
  getBtcSpotRate,
  generateLightningInvoice,
  checkInvoiceSettlement
};

