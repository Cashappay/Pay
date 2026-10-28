// Enterprise Webhook Service
// Dispatches HMAC-SHA256 signed event hooks to merchant external websites

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { db } = require('../data/db');

// Creates standard Stripe-grade HMAC-SHA256 signature
function generateWebhookSignature(payloadString, secret, timestamp) {
  const signedPayload = `${timestamp}.${payloadString}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedPayload);
  return `t=${timestamp},v1=${hmac.digest('hex')}`;
}

// Dispatches a signed webhook HTTP POST to the target URL
function dispatchHttpWebhook(url, payloadObject, secret, eventName) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith('http')) {
      return resolve({
        success: false,
        http_code: 0,
        error: 'Invalid or missing Webhook URL',
        duration_ms: 0
      });
    }

    const payloadString = JSON.stringify(payloadObject);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateWebhookSignature(payloadString, secret || '', timestamp);
    const deliveryId = `del_${crypto.randomBytes(8).toString('hex')}`;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return resolve({
        success: false,
        http_code: 0,
        error: `Invalid URL format: ${e.message}`,
        duration_ms: 0
      });
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString),
        'User-Agent': 'CashApp-Lightning-Gateway-Webhook/1.0',
        'X-CashApp-Signature': signature,
        'X-CashApp-Event': eventName,
        'X-CashApp-Delivery': deliveryId,
        'X-CashApp-Timestamp': String(timestamp)
      }
    };

    const startTime = Date.now();
    const req = lib.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => {
        if (responseBody.length < 2000) responseBody += chunk;
      });
      res.on('end', () => {
        const duration_ms = Date.now() - startTime;
        const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
        resolve({
          success: isSuccess,
          http_code: res.statusCode,
          response_body: responseBody.substring(0, 500),
          duration_ms,
          delivery_id: deliveryId
        });
      });
    });

    req.on('error', (err) => {
      const duration_ms = Date.now() - startTime;
      resolve({
        success: false,
        http_code: 0,
        error: err.message,
        duration_ms,
        delivery_id: deliveryId
      });
    });

    req.setTimeout(8000, () => {
      req.destroy();
      const duration_ms = Date.now() - startTime;
      resolve({
        success: false,
        http_code: 408,
        error: 'Request timed out (8000ms)',
        duration_ms,
        delivery_id: deliveryId
      });
    });

    req.write(payloadString);
    req.end();
  });
}

// Dispatches a webhook for payment events and saves delivery status
async function triggerPaymentWebhook(event, payment, user, page) {
  const webhookUrl = page?.webhook_url || user?.webhook_url;
  if (!webhookUrl) return null;

  const eventPayload = {
    id: `evt_${crypto.randomBytes(8).toString('hex')}`,
    event: event,
    created_at: Math.floor(Date.now() / 1000),
    data: {
      payment_id: payment.id,
      page_id: payment.page_id,
      slug: page?.slug || payment.slug,
      receiver_name: page?.receiver_name || user.name,
      amount_usd: Number(payment.amount_usd),
      amount_sats: Number(payment.amount_sats),
      currency: 'USD',
      status: payment.status,
      invoice: payment.invoice,
      paid_at: payment.paid_at,
      metadata: payment.metadata || {}
    }
  };

  const secret = user.webhook_secret;
  const result = await dispatchHttpWebhook(webhookUrl, eventPayload, secret, event);

  // Record log in database
  const logEntry = db.logWebhook({
    user_id: user.id,
    payment_id: payment.id,
    event,
    url: webhookUrl,
    success: result.success,
    http_code: result.http_code,
    duration_ms: result.duration_ms,
    response_body: result.response_body || result.error || '',
    payload: eventPayload
  });

  // Update payment webhook status
  db.updatePayment(payment.id, {
    webhook_status: result.success ? 'DELIVERED' : 'FAILED',
    webhook_attempts: [
      ...(payment.webhook_attempts || []),
      {
        timestamp: new Date().toISOString(),
        url: webhookUrl,
        http_code: result.http_code,
        success: result.success,
        duration_ms: result.duration_ms
      }
    ]
  });

  return { log: logEntry, result };
}

// Send a test webhook ping to verify merchant website integration
async function sendTestWebhook(user, targetUrl = null) {
  const webhookUrl = targetUrl || user.webhook_url;
  if (!webhookUrl) {
    throw new Error('No webhook URL configured. Please set a Webhook URL first.');
  }

  const testPayload = {
    id: `evt_test_${crypto.randomBytes(6).toString('hex')}`,
    event: 'test.ping',
    created_at: Math.floor(Date.now() / 1000),
    data: {
      message: 'This is a test webhook from Cash App Lightning Gateway.',
      status: 'VERIFIED',
      merchant_id: user.id,
      merchant_name: user.name,
      lightning_address: user.lightning_address,
      timestamp: new Date().toISOString()
    }
  };

  const secret = user.webhook_secret;
  const result = await dispatchHttpWebhook(webhookUrl, testPayload, secret, 'test.ping');

  // Log test event
  const logEntry = db.logWebhook({
    user_id: user.id,
    payment_id: null,
    event: 'test.ping',
    url: webhookUrl,
    success: result.success,
    http_code: result.http_code,
    duration_ms: result.duration_ms,
    response_body: result.response_body || result.error || '',
    payload: testPayload
  });

  return { log: logEntry, result };
}

module.exports = {
  dispatchHttpWebhook,
  triggerPaymentWebhook,
  sendTestWebhook,
  generateWebhookSignature
};

