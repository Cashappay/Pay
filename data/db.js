const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'database.json');

// Helper to hash password using Node's built-in crypto (scrypt)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  try {
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (e) {
    return false;
  }
}

// Generate random secure strings
function generateId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function generateSecret(prefix = 'whsec') {
  return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
}

function generateApiKey(prefix = 'sk_live') {
  return `${prefix}_${crypto.randomBytes(20).toString('hex')}`;
}

class Database {
  constructor() {
    this.data = {
      users: [],
      pages: [],
      payments: [],
      webhook_logs: []
    };
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(__dirname)) {
        fs.mkdirSync(__dirname, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.seedInitialData();
        this.save();
      }
    } catch (err) {
      console.error('Error loading database, reinitializing:', err);
      this.seedInitialData();
      this.save();
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write database file:', err);
    }
  }

  seedInitialData() {
    const defaultUserId = 'usr_admin_default';
    const defaultPageId = 'pg_sample_natasha';

    const defaultUser = {
      id: defaultUserId,
      name: 'Natasha Torres',
      email: 'demo@cashapp-gateway.com',
      password_hash: hashPassword('admin123'),
      lightning_address: 'fittinggliding280@walletofsatoshi.com',
      telegram_bot_token: '8778648114:AAEgz8BG3-Yucpw2dSl0UMVCegWGzTINpu8',
      telegram_chat_id: '-1004437748729',
      webhook_url: 'https://webhook.site/sample-endpoint',
      webhook_secret: generateSecret('whsec'),
      api_key_public: generateApiKey('ck_live'),
      api_key_secret: generateApiKey('sk_live'),
      created_at: new Date().toISOString()
    };

    const defaultPage = {
      id: defaultPageId,
      user_id: defaultUserId,
      title: 'Pay Natasha Torres',
      slug: 'natasha-torres',
      receiver_name: 'Natasha Torres',
      is_verified: true,
      description: 'Official Cash App Lightning payment gateway for donations and services.',
      type: 'keypad', // 'keypad' for custom user amount or 'fixed'
      fixed_amount: 0,
      success_url: '',
      webhook_url: '',
      is_active: true,
      created_at: new Date().toISOString()
    };

    this.data.users.push(defaultUser);
    this.data.pages.push(defaultPage);
  }

  // User queries
  findUserByEmail(email) {
    return this.data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  findUserById(id) {
    return this.data.users.find(u => u.id === id);
  }

  findUserByApiKey(key) {
    return this.data.users.find(u => u.api_key_secret === key || u.api_key_public === key);
  }

  createUser({ name, email, password, lightning_address }) {
    const user = {
      id: generateId('usr'),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash: hashPassword(password),
      lightning_address: lightning_address?.trim() || '',
      telegram_bot_token: '',
      telegram_chat_id: '',
      webhook_url: '',
      webhook_secret: generateSecret('whsec'),
      api_key_public: generateApiKey('ck_live'),
      api_key_secret: generateApiKey('sk_live'),
      created_at: new Date().toISOString()
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  updateUser(id, updates) {
    const user = this.findUserById(id);
    if (!user) return null;

    if (updates.name !== undefined) user.name = updates.name.trim();
    if (updates.lightning_address !== undefined) user.lightning_address = updates.lightning_address.trim();
    if (updates.telegram_bot_token !== undefined) user.telegram_bot_token = updates.telegram_bot_token.trim();
    if (updates.telegram_chat_id !== undefined) user.telegram_chat_id = updates.telegram_chat_id.trim();
    if (updates.webhook_url !== undefined) user.webhook_url = updates.webhook_url.trim();
    if (updates.password) user.password_hash = hashPassword(updates.password);

    this.save();
    return user;
  }

  regenerateKeys(id) {
    const user = this.findUserById(id);
    if (!user) return null;
    user.webhook_secret = generateSecret('whsec');
    user.api_key_public = generateApiKey('ck_live');
    user.api_key_secret = generateApiKey('sk_live');
    this.save();
    return user;
  }

  // Page queries
  findPagesByUserId(userId) {
    return this.data.pages.filter(p => p.user_id === userId);
  }

  findPageById(id) {
    return this.data.pages.find(p => p.id === id);
  }

  findPageBySlug(slug) {
    const cleanSlug = slug.toLowerCase().trim();
    return this.data.pages.find(p => p.slug.toLowerCase() === cleanSlug);
  }

  createPage({ user_id, title, slug, receiver_name, description, type, fixed_amount, success_url, webhook_url, is_verified }) {
    let finalSlug = (slug || title)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!finalSlug) finalSlug = 'pay-' + Math.floor(Math.random() * 100000);

    // Ensure unique slug
    let uniqueSlug = finalSlug;
    let counter = 1;
    while (this.findPageBySlug(uniqueSlug)) {
      uniqueSlug = `${finalSlug}-${counter}`;
      counter++;
    }

    const page = {
      id: generateId('pg'),
      user_id,
      title: title.trim(),
      slug: uniqueSlug,
      receiver_name: (receiver_name || title).trim(),
      is_verified: is_verified !== false,
      description: description?.trim() || '',
      type: type === 'fixed' ? 'fixed' : 'keypad',
      fixed_amount: type === 'fixed' ? parseFloat(fixed_amount) || 5.00 : 0,
      success_url: success_url?.trim() || '',
      webhook_url: webhook_url?.trim() || '',
      is_active: true,
      created_at: new Date().toISOString()
    };
    this.data.pages.push(page);
    this.save();
    return page;
  }

  updatePage(id, userId, updates) {
    const page = this.data.pages.find(p => p.id === id && p.user_id === userId);
    if (!page) return null;

    if (updates.title !== undefined) page.title = updates.title.trim();
    if (updates.receiver_name !== undefined) page.receiver_name = updates.receiver_name.trim();
    if (updates.description !== undefined) page.description = updates.description.trim();
    if (updates.type !== undefined) page.type = updates.type;
    if (updates.fixed_amount !== undefined) page.fixed_amount = parseFloat(updates.fixed_amount) || 0;
    if (updates.success_url !== undefined) page.success_url = updates.success_url.trim();
    if (updates.webhook_url !== undefined) page.webhook_url = updates.webhook_url.trim();
    if (updates.is_verified !== undefined) page.is_verified = Boolean(updates.is_verified);
    if (updates.is_active !== undefined) page.is_active = Boolean(updates.is_active);

    this.save();
    return page;
  }

  deletePage(id, userId) {
    const index = this.data.pages.findIndex(p => p.id === id && p.user_id === userId);
    if (index === -1) return false;
    this.data.pages.splice(index, 1);
    this.save();
    return true;
  }

  // Payment queries
  createPayment(paymentData) {
    const payment = {
      id: generateId('pay'),
      ...paymentData,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      paid_at: null,
      webhook_status: 'NONE',
      webhook_attempts: []
    };
    this.data.payments.unshift(payment);
    this.save();
    return payment;
  }

  findPaymentById(id) {
    return this.data.payments.find(p => p.id === id);
  }

  findPaymentsByUserId(userId) {
    return this.data.payments.filter(p => p.user_id === userId);
  }

  updatePayment(id, updates) {
    const payment = this.findPaymentById(id);
    if (!payment) return null;
    Object.assign(payment, updates);
    this.save();
    return payment;
  }

  // Webhook Logs
  logWebhook(entry) {
    const log = {
      id: generateId('whlog'),
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.data.webhook_logs.unshift(log);
    // Keep last 200 logs
    if (this.data.webhook_logs.length > 200) {
      this.data.webhook_logs.pop();
    }
    this.save();
    return log;
  }

  getWebhookLogsByUserId(userId) {
    return this.data.webhook_logs.filter(l => l.user_id === userId);
  }
}

const db = new Database();

module.exports = {
  db,
  hashPassword,
  verifyPassword
};

