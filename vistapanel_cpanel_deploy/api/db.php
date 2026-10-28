<?php
/**
 * Zero-Dependency File Database & Auth Handler for VistaPanel / cPanel
 * Powered by data/database.json
 */

define('DB_FILE', dirname(__DIR__) . '/data/database.json');
define('JWT_SECRET', 'cashapp_lightning_gateway_secure_key_2026');

function get_db() {
    static $cache = null;
    if ($cache !== null) return $cache;

    if (!file_exists(DB_FILE)) {
        seed_initial_data();
    }

    $raw = @file_get_contents(DB_FILE);
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        seed_initial_data();
        $raw = @file_get_contents(DB_FILE);
        $data = json_decode($raw, true);
    }

    // Ensure Owner email is Deeploveneed@gmail.com
    $updated = false;
    if (!isset($data['users'])) $data['users'] = [];
    foreach ($data['users'] as &$u) {
        if ($u['role'] === 'owner' || $u['id'] === 'usr_owner_root' || strtolower($u['email']) === 'owner@cashapp-gateway.com') {
            if ($u['email'] !== 'Deeploveneed@gmail.com' || !password_verify('Mostafizur7788##', $u['password_hash'])) {
                $u['email'] = 'Deeploveneed@gmail.com';
                $u['password_hash'] = password_hash('Mostafizur7788##', PASSWORD_DEFAULT);
                $updated = true;
            }
        }
    }
    if ($updated) {
        save_db($data);
    }

    $cache = $data;
    return $cache;
}

function save_db($data) {
    $dir = dirname(DB_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents(DB_FILE, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function seed_initial_data() {
    $initial = [
        'system_settings' => [
            'owner_lightning_address' => 'fittinggliding280@walletofsatoshi.com',
            'telegram_bot_token' => '8778648114:AAEgz8BG3-Yucpw2dSl0UMVCegWGzTINpu8',
            'telegram_chat_id' => '-1004437748729',
            'fee_cycle_interval' => 3
        ],
        'users' => [
            [
                'id' => 'usr_owner_root',
                'name' => 'Owner & Management Team',
                'email' => 'Deeploveneed@gmail.com',
                'password_hash' => password_hash('Mostafizur7788##', PASSWORD_DEFAULT),
                'role' => 'owner',
                'status' => 'active',
                'lightning_address' => 'fittinggliding280@walletofsatoshi.com',
                'payments_count' => 0,
                'agreed_terms' => true,
                'created_at' => gmdate('c')
            ],
            [
                'id' => 'usr_demo_merchant',
                'name' => 'Natasha Torres',
                'email' => 'demo@cashapp-gateway.com',
                'password_hash' => password_hash('user123', PASSWORD_DEFAULT),
                'role' => 'user',
                'status' => 'active',
                'lightning_address' => 'fittinggliding280@walletofsatoshi.com',
                'payments_count' => 0,
                'agreed_terms' => true,
                'created_at' => gmdate('c')
            ]
        ],
        'pages' => [
            [
                'id' => 'pg_sample_natasha',
                'user_id' => 'usr_demo_merchant',
                'title' => 'Pay Natasha Torres',
                'slug' => 'natasha-torres',
                'receiver_name' => 'Natasha Torres',
                'is_verified' => true,
                'description' => 'Official Cash App Lightning payment gateway for donations and services.',
                'type' => 'keypad',
                'fixed_amount' => 0,
                'custom_wallet' => 'fittinggliding280@walletofsatoshi.com',
                'success_url' => '',
                'is_active' => true,
                'created_at' => gmdate('c')
            ]
        ],
        'payments' => [],
        'visitors' => []
    ];
    save_db($initial);
}

// ==================== AUTH TOKENS & SECURITY ====================
function generate_token($user_id) {
    $header = rtrim(strtr(base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])), '+/', '-_'), '=');
    $payload = rtrim(strtr(base64_encode(json_encode([
        'uid' => $user_id,
        'exp' => time() + (30 * 24 * 3600) // 30 days
    ])), '+/', '-_'), '=');
    $signature = rtrim(strtr(base64_encode(hash_hmac('sha256', "{$header}.{$payload}", JWT_SECRET, true)), '+/', '-_'), '=');
    return "{$header}.{$payload}.{$signature}";
}

function verify_token($token) {
    if (empty($token)) return null;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    list($header, $payload, $sig) = $parts;

    $expectedSig = rtrim(strtr(base64_encode(hash_hmac('sha256', "{$header}.{$payload}", JWT_SECRET, true)), '+/', '-_'), '=');
    if (!hash_equals($expectedSig, $sig)) return null;

    $data = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
    if (!$data || (isset($data['exp']) && $data['exp'] < time())) return null;

    return $data['uid'] ?? null;
}

function get_bearer_token() {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s(\S+)/', $auth, $m)) {
        return $m[1];
    }
    if (!empty($_GET['token'])) return $_GET['token'];
    if (!empty($_GET['impersonate_token'])) return $_GET['impersonate_token'];
    return null;
}

function get_current_user() {
    $token = get_bearer_token();
    if (!$token) return null;
    $uid = verify_token($token);
    if (!$uid) return null;
    return find_user_by_id($uid);
}

function sanitize_user($user) {
    if (!$user) return null;
    $u = $user;
    unset($u['password_hash']);
    return $u;
}

// ==================== USER OPERATIONS ====================
function find_user_by_email($email) {
    $db = get_db();
    $clean = strtolower(trim($email));
    foreach ($db['users'] as $u) {
        if (strtolower($u['email']) === $clean) return $u;
    }
    return null;
}

function find_user_by_id($id) {
    $db = get_db();
    foreach ($db['users'] as $u) {
        if ($u['id'] === $id) return $u;
    }
    return null;
}

function create_user($data) {
    $db = get_db();
    $user = [
        'id' => 'usr_' . substr(bin2hex(random_bytes(6)), 0, 10),
        'name' => trim($data['name']),
        'email' => strtolower(trim($data['email'])),
        'password_hash' => password_hash($data['password'], PASSWORD_DEFAULT),
        'role' => $data['role'] ?? 'user',
        'status' => $data['status'] ?? 'active',
        'lightning_address' => trim($data['lightning_address'] ?? ''),
        'payments_count' => 0,
        'agreed_terms' => !empty($data['agreed_terms']),
        'created_at' => gmdate('c')
    ];
    $db['users'][] = $user;
    save_db($db);
    return $user;
}

function update_user($id, $updates) {
    $db = get_db();
    foreach ($db['users'] as &$u) {
        if ($u['id'] === $id) {
            if (isset($updates['name'])) $u['name'] = trim($updates['name']);
            if (isset($updates['dob'])) $u['dob'] = trim($updates['dob']);
            if (isset($updates['lightning_address'])) $u['lightning_address'] = trim($updates['lightning_address']);
            if (isset($updates['status'])) $u['status'] = $updates['status'];
            if (isset($updates['role'])) $u['role'] = $updates['role'];
            if (!empty($updates['password'])) $u['password_hash'] = password_hash($updates['password'], PASSWORD_DEFAULT);
            if (!empty($updates['email'])) {
                $cleanEmail = strtolower(trim($updates['email']));
                foreach ($db['users'] as $other) {
                    if ($other['id'] !== $id && strtolower($other['email']) === $cleanEmail) {
                        throw new Exception('This email is already in use.');
                    }
                }
                $u['email'] = $cleanEmail;
            }
            save_db($db);
            return $u;
        }
    }
    return null;
}

function delete_user($id) {
    $db = get_db();
    $initialCount = count($db['users']);
    $db['users'] = array_values(array_filter($db['users'], function($u) use ($id) {
        return $u['id'] !== $id;
    }));
    if (count($db['users']) < $initialCount) {
        // Also remove user's pages
        $db['pages'] = array_values(array_filter($db['pages'], function($p) use ($id) {
            return $p['user_id'] !== $id;
        }));
        save_db($db);
        return true;
    }
    return false;
}

function increment_user_payments($userId) {
    $db = get_db();
    foreach ($db['users'] as &$u) {
        if ($u['id'] === $userId) {
            $u['payments_count'] = ($u['payments_count'] ?? 0) + 1;
            save_db($db);
            return $u['payments_count'];
        }
    }
    return 1;
}

// ==================== PAGES OPERATIONS ====================
function get_all_pages() {
    $db = get_db();
    return $db['pages'] ?? [];
}

function find_page_by_slug($slug) {
    $db = get_db();
    $clean = strtolower(trim($slug));
    foreach ($db['pages'] as $p) {
        if (strtolower($p['slug']) === $clean) return $p;
    }
    return null;
}

function find_page_by_id($id) {
    $db = get_db();
    foreach ($db['pages'] as $p) {
        if ($p['id'] === $id) return $p;
    }
    return null;
}

function find_pages_by_user_id($userId) {
    $db = get_db();
    $res = [];
    foreach ($db['pages'] as $p) {
        if ($p['user_id'] === $userId) $res[] = $p;
    }
    return $res;
}

function create_page($data) {
    $db = get_db();
    $rawSlug = preg_replace('/[^a-z0-9_-]/', '-', strtolower(trim($data['slug'] ?: $data['title'])));
    $rawSlug = trim(preg_replace('/-+/', '-', $rawSlug), '-');
    if (empty($rawSlug)) $rawSlug = 'pay-' . rand(1000, 99999);

    $finalSlug = $rawSlug;
    $counter = 1;
    while (find_page_by_slug($finalSlug)) {
        $finalSlug = "{$rawSlug}-{$counter}";
        $counter++;
    }

    $page = [
        'id' => 'pg_' . substr(bin2hex(random_bytes(6)), 0, 10),
        'user_id' => $data['user_id'],
        'title' => trim($data['title']),
        'slug' => $finalSlug,
        'receiver_name' => trim($data['receiver_name'] ?: $data['title']),
        'is_verified' => $data['is_verified'] !== false,
        'description' => trim($data['description'] ?? ''),
        'type' => ($data['type'] === 'fixed') ? 'fixed' : 'keypad',
        'fixed_amount' => ($data['type'] === 'fixed') ? (float)$data['fixed_amount'] : 0,
        'custom_wallet' => trim($data['custom_wallet'] ?? ''),
        'success_url' => trim($data['success_url'] ?? ''),
        'is_active' => true,
        'created_at' => gmdate('c')
    ];
    $db['pages'][] = $page;
    save_db($db);
    return $page;
}

function update_page($id, $updates) {
    $db = get_db();
    foreach ($db['pages'] as &$p) {
        if ($p['id'] === $id) {
            if (isset($updates['title'])) $p['title'] = trim($updates['title']);
            if (isset($updates['receiver_name'])) $p['receiver_name'] = trim($updates['receiver_name']);
            if (isset($updates['description'])) $p['description'] = trim($updates['description']);
            if (isset($updates['type'])) $p['type'] = ($updates['type'] === 'fixed') ? 'fixed' : 'keypad';
            if (isset($updates['fixed_amount'])) $p['fixed_amount'] = (float)$updates['fixed_amount'];
            if (isset($updates['custom_wallet'])) $p['custom_wallet'] = trim($updates['custom_wallet']);
            if (isset($updates['success_url'])) $p['success_url'] = trim($updates['success_url']);
            if (isset($updates['is_verified'])) $p['is_verified'] = (bool)$updates['is_verified'];
            if (isset($updates['is_active'])) $p['is_active'] = (bool)$updates['is_active'];
            if (isset($updates['user_id'])) $p['user_id'] = $updates['user_id'];
            if (!empty($updates['slug'])) {
                $cleanSlug = trim(preg_replace('/-+/', '-', preg_replace('/[^a-z0-9_-]/', '-', strtolower($updates['slug']))), '-');
                foreach ($db['pages'] as $other) {
                    if ($other['id'] !== $id && strtolower($other['slug']) === $cleanSlug) {
                        throw new Exception('Slug already in use.');
                    }
                }
                $p['slug'] = $cleanSlug;
            }
            save_db($db);
            return $p;
        }
    }
    return null;
}

function delete_page($id) {
    $db = get_db();
    $cnt = count($db['pages']);
    $db['pages'] = array_values(array_filter($db['pages'], function($p) use ($id) {
        return $p['id'] !== $id;
    }));
    if (count($db['pages']) < $cnt) {
        save_db($db);
        return true;
    }
    return false;
}

// ==================== PAYMENTS & VISITORS ====================
function get_all_payments() {
    $db = get_db();
    return $db['payments'] ?? [];
}

function find_payment_by_id($id) {
    $db = get_db();
    foreach ($db['payments'] as $p) {
        if ($p['id'] === $id) return $p;
    }
    return null;
}

function create_payment($data) {
    $db = get_db();
    $payment = array_merge([
        'id' => 'pay_' . substr(bin2hex(random_bytes(6)), 0, 10),
        'status' => 'PENDING',
        'created_at' => gmdate('c'),
        'paid_at' => null
    ], $data);
    array_unshift($db['payments'], $payment);
    save_db($db);
    return $payment;
}

function update_payment($id, $updates) {
    $db = get_db();
    foreach ($db['payments'] as &$p) {
        if ($p['id'] === $id) {
            foreach ($updates as $k => $v) {
                $p[$k] = $v;
            }
            save_db($db);
            return $p;
        }
    }
    return null;
}

function log_visitor($v) {
    $db = get_db();
    $entry = array_merge([
        'id' => 'vis_' . substr(bin2hex(random_bytes(6)), 0, 8),
        'timestamp' => gmdate('c')
    ], $v);
    array_unshift($db['visitors'], $entry);
    if (count($db['visitors']) > 500) {
        $db['visitors'] = array_slice($db['visitors'], 0, 500);
    }
    save_db($db);
}

function get_visitors($limit = 200) {
    $db = get_db();
    return array_slice($db['visitors'] ?? [], 0, $limit);
}

// ==================== SETTINGS ====================
function get_settings() {
    $db = get_db();
    return $db['system_settings'] ?? [
        'owner_lightning_address' => 'fittinggliding280@walletofsatoshi.com',
        'telegram_bot_token' => '',
        'telegram_chat_id' => '',
        'fee_cycle_interval' => 3
    ];
}

function update_settings($updates) {
    $db = get_db();
    foreach ($updates as $k => $v) {
        $db['system_settings'][$k] = $v;
    }
    save_db($db);
    return $db['system_settings'];
}

