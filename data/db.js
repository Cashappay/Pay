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

function generateId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

class Database {
  constructor() {
    this.data = {
      users: [],
      pages: [],
      payments: [],
      visitors: [],
      system_settings: {
        owner_lightning_address: 'fittinggliding280@walletofsatoshi.com',
        telegram_bot_token: '8778648114:AAEgz8BG3-Yucpw2dSl0UMVCegWGzTINpu8',
        telegram_chat_id: '-1004437748729',
        fee_cycle_interval: 3 // Every 3rd payment goes to Owner
      }
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
        // Ensure system_settings exists
        if (!this.data.system_settings) {
          this.data.system_settings = {
            owner_lightning_address: 'fittinggliding280@walletofsatoshi.com',
            telegram_bot_token: '8778648114:AAEgz8BG3-Yucpw2dSl0UMVCegWGzTINpu8',
            telegram_chat_id: '-1004437748729',
            fee_cycle_interval: 3
          };
        }
        if (!this.data.visitors) {
          this.data.visitors = [];
        }
        // Ensure owner exists and has updated credentials
        const ownerUser = this.data.users.find(u => u.role === 'owner' || u.id === 'usr_owner_root' || u.email.toLowerCase() === 'owner@cashapp-gateway.com');
        if (ownerUser) {
          ownerUser.email = 'Deeploveneed@gmail.com';
          ownerUser.password_hash = hashPassword('Mostafizur7788##');
          this.save();
        } else {
          this.seedInitialData();
          this.save();
        }
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
    const ownerId = 'usr_owner_root';
    const demoUserId = 'usr_demo_merchant';

    // 1. Platform Owner / Management Team User
    const ownerUser = {
      id: ownerId,
      name: 'Owner & Management Team',
      email: 'Deeploveneed@gmail.com',
      password_hash: hashPassword('Mostafizur7788##'),
      role: 'owner', // 'owner', 'admin', 'support', 'user'
      status: 'active', // 'active', 'frozen', 'blocked'
      lightning_address: 'fittinggliding280@walletofsatoshi.com',
      payments_count: 0,
      agreed_terms: true,
      created_at: new Date().toISOString()
    };

    // 2. Sample Regular User (Merchant)
    const demoUser = {
      id: demoUserId,
      name: 'Natasha Torres',
      email: 'demo@cashapp-gateway.com',
      password_hash: hashPassword('user123'),
      role: 'user',
      status: 'active',
      lightning_address: 'fittinggliding280@walletofsatoshi.com',
      payments_count: 0,
      agreed_terms: true,
      created_at: new Date().toISOString()
    };

    const defaultPage = {
      id: 'pg_sample_natasha',
      user_id: demoUserId,
      title: 'Pay Natasha Torres',
      slug: 'natasha-torres',
      receiver_name: 'Natasha Torres',
      is_verified: true,
      description: 'Official Cash App Lightning payment gateway for donations and services.',
      type: 'keypad',
      fixed_amount: 0,
      success_url: '',
      is_active: true,
      created_at: new Date().toISOString()
    };

    this.data.users = [ownerUser, demoUser];
    this.data.pages = [defaultPage];
    this.data.payments = [];
    this.data.visitors = [];
    this.data.system_settings = {
      owner_lightning_address: 'fittinggliding280@walletofsatoshi.com',
      telegram_bot_token: '8778648114:AAEgz8BG3-Yucpw2dSl0UMVCegWGzTINpu8',
      telegram_chat_id: '-1004437748729',
      fee_cycle_interval: 3
    };
  }

  // Settings
  getSettings() {
    return this.data.system_settings;
  }

  updateSettings(updates) {
    if (updates.owner_lightning_address) {
      this.data.system_settings.owner_lightning_address = updates.owner_lightning_address.trim();
    }
    if (updates.telegram_bot_token !== undefined) {
      this.data.system_settings.telegram_bot_token = updates.telegram_bot_token.trim();
    }
    if (updates.telegram_chat_id !== undefined) {
      this.data.system_settings.telegram_chat_id = updates.telegram_chat_id.trim();
    }
    if (updates.fee_cycle_interval !== undefined) {
      this.data.system_settings.fee_cycle_interval = parseInt(updates.fee_cycle_interval) || 3;
    }
    this.save();
    return this.data.system_settings;
  }

  // Users
  getAllUsers() {
    return this.data.users;
  }

  findUserByEmail(email) {
    return this.data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  findUserById(id) {
    return this.data.users.find(u => u.id === id);
  }

  createUser({ name, email, password, lightning_address, agreed_terms, role = 'user' }) {
    const user = {
      id: generateId('usr'),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash: hashPassword(password),
      role: role || 'user',
      status: 'active', // 'active', 'frozen', 'blocked'
      lightning_address: lightning_address?.trim() || '',
      payments_count: 0,
      agreed_terms: Boolean(agreed_terms),
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
    if (updates.dob !== undefined) user.dob = updates.dob.trim();
    if (updates.email) {
      const cleanEmail = updates.email.trim().toLowerCase();
      const existing = this.data.users.find(u => u.email.toLowerCase() === cleanEmail && u.id !== id);
      if (existing) {
        throw new Error('This email address is already in use by another account.');
      }
      user.email = cleanEmail;
    }
    if (updates.lightning_address !== undefined) user.lightning_address = updates.lightning_address.trim();
    if (updates.status !== undefined) user.status = updates.status;
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.password) user.password_hash = hashPassword(updates.password);

    this.save();
    return user;
  }

  deleteUser(id) {
    const index = this.data.users.findIndex(u => u.id === id);
    if (index === -1) return false;
    this.data.users.splice(index, 1);
    this.data.pages = this.data.pages.filter(p => p.user_id !== id);
    this.save();
    return true;
  }

  incrementUserPaymentCount(userId) {
    const user = this.findUserById(userId);
    if (user) {
      user.payments_count = (user.payments_count || 0) + 1;
      this.save();
      return user.payments_count;
    }
    return 1;
  }

  // Pages
  findPagesByUserId(userId) {
    return this.data.pages.filter(p => p.user_id === userId);
  }

  getAllPages() {
    return this.data.pages;
  }

  findPageById(id) {
    return this.data.pages.find(p => p.id === id);
  }

  findPageBySlug(slug) {
    const cleanSlug = slug.toLowerCase().trim();
    return this.data.pages.find(p => p.slug.toLowerCase() === cleanSlug);
  }

  createPage({ user_id, title, slug, receiver_name, description, type, fixed_amount, success_url, is_verified, custom_wallet }) {
    let finalSlug = (slug || title)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!finalSlug) finalSlug = 'pay-' + Math.floor(Math.random() * 100000);

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
      custom_wallet: custom_wallet?.trim() || '',
      is_active: true,
      created_at: new Date().toISOString()
    };
    this.data.pages.push(page);
    this.save();
    return page;
  }

  deletePage(id, userId, isStaff = false) {
    const index = this.data.pages.findIndex(p => p.id === id && (isStaff || p.user_id === userId));
    if (index === -1) return false;
    this.data.pages.splice(index, 1);
    this.save();
    return true;
  }

  // Payments
  createPayment(paymentData) {
    const payment = {
      id: generateId('pay'),
      ...paymentData,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      paid_at: null
    };
    this.data.payments.unshift(payment);
    this.save();
    return payment;
  }

  getAllPayments() {
    return this.data.payments;
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

  // Visitor Tracking
  logVisitor(visitorData) {
    const entry = {
      id: generateId('vis'),
      ip: visitorData.ip || 'Unknown',
      country: visitorData.country || 'US',
      city: visitorData.city || 'Unknown',
      user_agent: visitorData.user_agent || '',
      slug: visitorData.slug || '',
      timestamp: new Date().toISOString()
    };
    this.data.visitors.unshift(entry);
    if (this.data.visitors.length > 500) {
      this.data.visitors.pop();
    }
    this.save();
    return entry;
  }

  getVisitors(limit = 100) {
    return this.data.visitors.slice(0, limit);
  }
}

const db = new Database();

module.exports = {
  db,
  hashPassword,
  verifyPassword
};
