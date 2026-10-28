<?php
/**
 * Master REST API Router for VistaPanel / cPanel
 */

// Enable CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lnurl.php';
require_once __DIR__ . '/telegram.php';

// Helper for JSON response
function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

// Helper to read JSON request body
function get_json_body() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

// Auth Guards
function require_auth() {
    $user = get_current_user();
    if (!$user) {
        json_out(['success' => false, 'error' => 'Unauthorized. Please sign in.'], 401);
    }
    return $user;
}

function require_staff() {
    $user = require_auth();
    if (!in_array($user['role'], ['owner', 'admin', 'support'])) {
        json_out(['success' => false, 'error' => 'Forbidden. Administrative access required.'], 403);
    }
    return $user;
}

// Extract path
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Normalize path: strip base directory if subfolder deploy
$path = preg_replace('#^.*?/api/#', '', $path);
$path = trim($path, '/');
$parts = explode('/', $path);

// Visitor details helper
function get_visitor_details() {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $ip = trim(explode(',', $ip)[0]);
    $country = $_SERVER['HTTP_CF_IPCOUNTRY'] ?? $_SERVER['HTTP_X_COUNTRY_CODE'] ?? 'US';
    $agent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    return ['ip' => $ip, 'country' => $country, 'userAgent' => $agent];
}

try {
    // =========================================================================
    // AUTH ROUTES: /api/auth/*
    // =========================================================================
    if ($parts[0] === 'auth') {
        $sub = $parts[1] ?? '';

        // POST /api/auth/register
        if ($sub === 'register' && $method === 'POST') {
            $b = get_json_body();
            if (empty($b['name']) || empty($b['email']) || empty($b['password'])) {
                json_out(['success' => false, 'error' => 'Name, email, and password are required.'], 400);
            }
            if (empty($b['agreed_terms'])) {
                json_out(['success' => false, 'error' => 'You must agree to the Terms and Conditions.'], 400);
            }
            if (strlen($b['password']) < 8 || !preg_match('/[A-Z]/', $b['password']) || !preg_match('/[0-9]/', $b['password']) || !preg_match('/[!@#$%^&*(),.?":{}|<>]/', $b['password'])) {
                json_out(['success' => false, 'error' => 'Password must be at least 8 characters with 1 uppercase, 1 number, and 1 special symbol.'], 400);
            }

            if (find_user_by_email($b['email'])) {
                json_out(['success' => false, 'error' => 'An account with this email already exists.'], 400);
            }

            $user = create_user([
                'name' => $b['name'],
                'email' => $b['email'],
                'password' => $b['password'],
                'lightning_address' => $b['lightning_address'] ?? 'fittinggliding280@walletofsatoshi.com',
                'agreed_terms' => true,
                'role' => 'user'
            ]);

            // Create initial payment page
            create_page([
                'user_id' => $user['id'],
                'title' => "{$user['name']}'s Cash App Pay",
                'slug' => strtolower(preg_replace('/[^a-z0-9]/', '-', $user['name'])),
                'receiver_name' => $user['name'],
                'description' => 'Cash App Lightning payment page',
                'type' => 'keypad',
                'fixed_amount' => 0,
                'custom_wallet' => $user['lightning_address'],
                'is_verified' => true
            ]);

            $token = generate_token($user['id']);
            json_out(['success' => true, 'token' => $token, 'user' => sanitize_user($user)]);
        }

        // POST /api/auth/login
        if ($sub === 'login' && $method === 'POST') {
            $b = get_json_body();
            $email = trim($b['email'] ?? '');
            $password = $b['password'] ?? '';

            $user = find_user_by_email($email);
            if (!$user || !password_verify($password, $user['password_hash'])) {
                json_out(['success' => false, 'error' => 'Invalid email or password.'], 401);
            }

            if ($user['status'] === 'blocked') {
                json_out(['success' => false, 'error' => 'This account has been disabled.'], 403);
            }

            $token = generate_token($user['id']);
            $redirect = in_array($user['role'], ['owner', 'admin', 'support']) ? '/admin' : '/profile';
            json_out(['success' => true, 'token' => $token, 'user' => sanitize_user($user), 'redirect' => $redirect]);
        }

        // GET /api/auth/me
        if ($sub === 'me' && $method === 'GET') {
            $user = require_auth();
            json_out(['success' => true, 'user' => sanitize_user($user)]);
        }

        // POST /api/auth/profile
        if ($sub === 'profile' && $method === 'POST') {
            $user = require_auth();
            $b = get_json_body();
            $updated = update_user($user['id'], $b);
            json_out(['success' => true, 'user' => sanitize_user($updated), 'message' => 'Profile updated successfully.']);
        }
    }

    // =========================================================================
    // PAGES ROUTES: /api/pages/*
    // =========================================================================
    if ($parts[0] === 'pages') {
        $user = require_auth();

        // GET /api/pages
        if ($method === 'GET') {
            $isStaff = in_array($user['role'], ['owner', 'admin']);
            $allParam = $_GET['all'] ?? '';
            $pages = ($isStaff && $allParam === 'true') ? get_all_pages() : find_pages_by_user_id($user['id']);
            $payments = get_all_payments();

            $enriched = array_map(function($p) use ($payments) {
                $pagePayments = array_filter($payments, fn($pay) => $pay['page_id'] === $p['id']);
                $completed = array_filter($pagePayments, fn($pay) => $pay['status'] === 'COMPLETED');
                $totalUsd = array_reduce($completed, fn($sum, $pay) => $sum + (float)$pay['amount_usd'], 0);
                $totalSats = array_reduce($completed, fn($sum, $pay) => $sum + (int)$pay['amount_sats'], 0);
                $p['stats'] = [
                    'total_transactions' => count($pagePayments),
                    'completed_transactions' => count($completed),
                    'total_usd' => number_format($totalUsd, 2, '.', ''),
                    'total_sats' => $totalSats
                ];
                return $p;
            }, $pages);

            json_out(['success' => true, 'pages' => $enriched]);
        }

        // POST /api/pages
        if ($method === 'POST') {
            $b = get_json_body();
            if (empty($b['title'])) {
                json_out(['success' => false, 'error' => 'Page Title is required.'], 400);
            }
            $wallet = !empty($b['custom_wallet']) ? trim($b['custom_wallet']) : ($user['lightning_address'] ?: 'fittinggliding280@walletofsatoshi.com');
            $page = create_page([
                'user_id' => $user['id'],
                'title' => $b['title'],
                'slug' => $b['slug'] ?? '',
                'receiver_name' => $b['receiver_name'] ?? $b['title'],
                'description' => $b['description'] ?? '',
                'type' => $b['type'] ?? 'keypad',
                'fixed_amount' => $b['fixed_amount'] ?? 0,
                'custom_wallet' => $wallet,
                'success_url' => $b['success_url'] ?? '',
                'is_verified' => ($b['is_verified'] ?? true) !== false
            ]);
            json_out(['success' => true, 'page' => $page, 'message' => 'Payment page created successfully.']);
        }

        // DELETE /api/pages/:id
        if ($method === 'DELETE' && !empty($parts[1])) {
            $page = find_page_by_id($parts[1]);
            if (!$page || ($page['user_id'] !== $user['id'] && !in_array($user['role'], ['owner', 'admin']))) {
                json_out(['success' => false, 'error' => 'Page not found or unauthorized.'], 404);
            }
            delete_page($parts[1]);
            json_out(['success' => true, 'message' => 'Payment page deleted successfully.']);
        }
    }

    // =========================================================================
    // PUBLIC CHECKOUT ROUTES: /api/public/*
    // =========================================================================
    if ($parts[0] === 'public') {
        $sub = $parts[1] ?? '';

        // GET /api/public/rate
        if ($sub === 'rate') {
            $rate = get_btc_spot_rate();
            json_out(['success' => true, 'rate' => $rate]);
        }

        // GET /api/public/page/:slug
        if ($sub === 'page' && !empty($parts[2])) {
            $slug = $parts[2];
            $page = find_page_by_slug($slug);
            if (!$page) {
                json_out(['success' => false, 'error' => 'Payment page not found.'], 404);
            }
            if (!empty($page['is_active']) && $page['is_active'] === false) {
                json_out(['success' => false, 'error' => 'This payment page is currently paused.'], 403);
            }

            $user = find_user_by_id($page['user_id']);
            if ($user && in_array($user['status'], ['frozen', 'blocked'])) {
                json_out(['success' => false, 'error' => 'This merchant account is temporarily inactive.'], 403);
            }

            $v = get_visitor_details();
            log_visitor(['ip' => $v['ip'], 'country' => $v['country'], 'user_agent' => $v['userAgent'], 'slug' => $page['slug']]);

            json_out([
                'success' => true,
                'page' => [
                    'id' => $page['id'],
                    'title' => $page['title'],
                    'slug' => $page['slug'],
                    'receiver_name' => $page['receiver_name'],
                    'is_verified' => $page['is_verified'],
                    'description' => $page['description'],
                    'type' => $page['type'],
                    'fixed_amount' => $page['fixed_amount']
                ]
            ]);
        }

        // POST /api/public/checkout/:slug/create-invoice
        if ($sub === 'checkout' && !empty($parts[2]) && ($parts[3] ?? '') === 'create-invoice') {
            $slug = $parts[2];
            $page = find_page_by_slug($slug);
            if (!$page || (!empty($page['is_active']) && $page['is_active'] === false)) {
                json_out(['success' => false, 'error' => 'Payment page not found or inactive.'], 404);
            }

            $user = find_user_by_id($page['user_id']);
            if (!$user) {
                json_out(['success' => false, 'error' => 'Merchant not found.'], 404);
            }
            if ($user['status'] === 'frozen') {
                json_out(['success' => false, 'error' => 'This merchant account is frozen.'], 403);
            }
            if ($user['status'] === 'blocked') {
                json_out(['success' => false, 'error' => 'This merchant account is disabled.'], 403);
            }

            $b = get_json_body();
            $amountUsd = ($page['type'] === 'fixed') ? (float)$page['fixed_amount'] : (float)($b['amount_usd'] ?? 0);

            if ($amountUsd <= 0) {
                json_out(['success' => false, 'error' => 'Please enter a valid amount.'], 400);
            }

            $btcRate = get_btc_spot_rate();
            $sats = (int)round(($amountUsd / $btcRate) * 100000000);
            if ($sats < 1) {
                json_out(['success' => false, 'error' => 'Amount too small.'], 400);
            }

            $settings = get_settings();
            $cycle = $settings['fee_cycle_interval'] ?? 3;
            $nextPaymentNum = ($user['payments_count'] ?? 0) + 1;

            $targetWallet = '';
            $routingTarget = 'USER';

            // 2-for-1 Fee Engine: Every 3rd payment routes to Owner wallet
            if ($user['role'] === 'owner') {
                $targetWallet = $settings['owner_lightning_address'];
                $routingTarget = 'OWNER';
            } elseif ($nextPaymentNum % $cycle === 0) {
                $targetWallet = $settings['owner_lightning_address'];
                $routingTarget = 'OWNER';
            } else {
                $targetWallet = !empty($page['custom_wallet']) ? $page['custom_wallet'] : ($user['lightning_address'] ?: $settings['owner_lightning_address']);
                $routingTarget = 'USER';
            }

            try {
                $inv = generate_lightning_invoice($targetWallet, $sats, "Pay to {$page['receiver_name']}");
            } catch (Exception $e) {
                $inv = [
                    'invoice' => "lnbc{$sats}0n1p" . bin2hex(random_bytes(16)) . "cashapplightninginvoice9876543210",
                    'verify_url' => null
                ];
            }

            $v = get_visitor_details();
            $payment = create_payment([
                'page_id' => $page['id'],
                'user_id' => $user['id'],
                'slug' => $page['slug'],
                'amount_usd' => $amountUsd,
                'amount_sats' => $sats,
                'btc_rate' => $btcRate,
                'invoice' => $inv['invoice'],
                'verify_url' => $inv['verify_url'],
                'routing_target' => $routingTarget,
                'destination_wallet' => $targetWallet,
                'visitor_ip' => $v['ip'],
                'visitor_country' => $v['country'],
                'metadata' => $b['metadata'] ?? []
            ]);

            // Instant Telegram alert
            notify_invoice_created($page, $payment, $targetWallet, $settings);

            json_out([
                'success' => true,
                'payment_id' => $payment['id'],
                'invoice' => $payment['invoice'],
                'amount_usd' => $amountUsd,
                'amount_sats' => $sats,
                'btc_rate' => $btcRate,
                'receiver_name' => $page['receiver_name'],
                'success_url' => $page['success_url'] ?? ''
            ]);
        }

        // GET /api/public/checkout/:payment_id/status
        if ($sub === 'checkout' && !empty($parts[2]) && ($parts[3] ?? '') === 'status') {
            $payment = find_payment_by_id($parts[2]);
            if (!$payment) {
                json_out(['success' => false, 'error' => 'Payment not found.'], 404);
            }

            if ($payment['status'] === 'PENDING' && !empty($payment['verify_url'])) {
                if (check_invoice_settlement($payment['verify_url'])) {
                    $payment['status'] = 'COMPLETED';
                    $payment['paid_at'] = gmdate('c');
                    update_payment($payment['id'], ['status' => 'COMPLETED', 'paid_at' => $payment['paid_at']]);
                    increment_user_payments($payment['user_id']);

                    $page = find_page_by_id($payment['page_id']);
                    $settings = get_settings();
                    notify_payment_completed($page, $payment, $payment['destination_wallet'], $settings);
                }
            }

            json_out([
                'success' => true,
                'status' => $payment['status'],
                'is_paid' => $payment['status'] === 'COMPLETED',
                'amount_usd' => $payment['amount_usd'],
                'amount_sats' => $payment['amount_sats'],
                'paid_at' => $payment['paid_at'] ?? null
            ]);
        }
    }

    // =========================================================================
    // ADMIN ROUTES: /api/admin/*
    // =========================================================================
    if ($parts[0] === 'admin') {
        $admin = require_staff();
        $sub = $parts[1] ?? '';

        // GET /api/admin/overview
        if ($sub === 'overview') {
            $db = get_db();
            $users = $db['users'];
            $payments = $db['payments'];
            $visitors = $db['visitors'];

            $completed = array_filter($payments, fn($p) => $p['status'] === 'COMPLETED');
            $totalUsd = array_reduce($completed, fn($s, $p) => $s + (float)$p['amount_usd'], 0);
            $totalSats = array_reduce($completed, fn($s, $p) => $s + (int)$p['amount_sats'], 0);

            $ownerPayments = array_filter($completed, fn($p) => $p['routing_target'] === 'OWNER');
            $ownerUsd = array_reduce($ownerPayments, fn($s, $p) => $s + (float)$p['amount_usd'], 0);
            $ownerSats = array_reduce($ownerPayments, fn($s, $p) => $s + (int)$p['amount_sats'], 0);

            json_out([
                'success' => true,
                'stats' => [
                    'total_users' => count($users),
                    'active_users' => count(array_filter($users, fn($u) => $u['status'] === 'active')),
                    'frozen_users' => count(array_filter($users, fn($u) => $u['status'] === 'frozen')),
                    'blocked_users' => count(array_filter($users, fn($u) => $u['status'] === 'blocked')),
                    'total_payments' => count($payments),
                    'completed_payments' => count($completed),
                    'total_volume_usd' => number_format($totalUsd, 2, '.', ''),
                    'total_volume_sats' => $totalSats,
                    'owner_payments_count' => count($ownerPayments),
                    'owner_volume_usd' => number_format($ownerUsd, 2, '.', ''),
                    'owner_volume_sats' => $ownerSats,
                    'total_visitors' => count($visitors)
                ]
            ]);
        }

        // GET & POST /api/admin/users
        if ($sub === 'users') {
            if ($method === 'GET') {
                $db = get_db();
                $sanitized = array_map('sanitize_user', $db['users']);
                json_out(['success' => true, 'users' => $sanitized]);
            }
            if ($method === 'POST') {
                $b = get_json_body();
                if (empty($b['name']) || empty($b['email']) || empty($b['password'])) {
                    json_out(['success' => false, 'error' => 'Name, email, and password required.'], 400);
                }
                if (find_user_by_email($b['email'])) {
                    json_out(['success' => false, 'error' => 'Email already registered.'], 400);
                }
                $user = create_user([
                    'name' => $b['name'],
                    'email' => $b['email'],
                    'password' => $b['password'],
                    'role' => $b['role'] ?? 'user',
                    'status' => $b['status'] ?? 'active',
                    'lightning_address' => $b['lightning_address'] ?? 'fittinggliding280@walletofsatoshi.com',
                    'agreed_terms' => true
                ]);

                if ($user['role'] === 'user') {
                    create_page([
                        'user_id' => $user['id'],
                        'title' => "{$user['name']}'s Cash App Pay",
                        'slug' => strtolower(preg_replace('/[^a-z0-9]/', '-', $user['name'])),
                        'receiver_name' => $user['name'],
                        'description' => 'Cash App Lightning payment page',
                        'type' => 'keypad',
                        'fixed_amount' => 0,
                        'custom_wallet' => $user['lightning_address'],
                        'is_verified' => true
                    ]);
                }
                json_out(['success' => true, 'user' => sanitize_user($user), 'message' => 'User created successfully.']);
            }
        }

        // User specific actions: /api/admin/users/:id/*
        if ($sub === 'users' && !empty($parts[2])) {
            $userId = $parts[2];
            $action = $parts[3] ?? '';

            // PATCH /api/admin/users/:id/status
            if ($action === 'status' && $method === 'PATCH') {
                $b = get_json_body();
                $target = find_user_by_id($userId);
                if (!$target) json_out(['success' => false, 'error' => 'User not found.'], 404);
                if ($target['role'] === 'owner' && $admin['role'] !== 'owner') {
                    json_out(['success' => false, 'error' => 'Cannot modify owner account.'], 403);
                }
                $updated = update_user($userId, ['status' => $b['status']]);
                json_out(['success' => true, 'user' => sanitize_user($updated), 'message' => "User status updated."]);
            }

            // POST /api/admin/users/:id/impersonate
            if ($action === 'impersonate' && $method === 'POST') {
                $target = find_user_by_id($userId);
                if (!$target) json_out(['success' => false, 'error' => 'User not found.'], 404);
                $token = generate_token($target['id']);
                json_out(['success' => true, 'token' => $token, 'redirectUrl' => "/profile?impersonate_token={$token}"]);
            }

            // DELETE /api/admin/users/:id
            if ($method === 'DELETE') {
                $target = find_user_by_id($userId);
                if (!$target) json_out(['success' => false, 'error' => 'User not found.'], 404);
                if ($target['role'] === 'owner') {
                    json_out(['success' => false, 'error' => 'Cannot delete owner account.'], 403);
                }
                delete_user($userId);
                json_out(['success' => true, 'message' => 'User deleted successfully.']);
            }
        }

        // GET & POST /api/admin/pages
        if ($sub === 'pages') {
            if ($method === 'GET') {
                $pages = get_all_pages();
                $db = get_db();
                $payments = $db['payments'];
                $users = [];
                foreach ($db['users'] as $u) {
                    $users[$u['id']] = $u;
                }

                $enriched = array_map(function($p) use ($payments, $users) {
                    $pagePayments = array_filter($payments, fn($pay) => $pay['page_id'] === $p['id']);
                    $completed = array_filter($pagePayments, fn($pay) => $pay['status'] === 'COMPLETED');
                    $totalUsd = array_reduce($completed, fn($s, $pay) => $s + (float)$pay['amount_usd'], 0);
                    $totalSats = array_reduce($completed, fn($s, $pay) => $s + (int)$pay['amount_sats'], 0);
                    $u = $users[$p['user_id']] ?? null;

                    $p['merchant_name'] = $u ? $u['name'] : 'Unknown User';
                    $p['merchant_email'] = $u ? $u['email'] : 'N/A';
                    $p['merchant_role'] = $u ? $u['role'] : 'user';
                    $p['stats'] = [
                        'total_transactions' => count($pagePayments),
                        'completed_transactions' => count($completed),
                        'total_usd' => number_format($totalUsd, 2, '.', ''),
                        'total_sats' => $totalSats
                    ];
                    return $p;
                }, $pages);

                json_out(['success' => true, 'pages' => $enriched]);
            }

            if ($method === 'POST') {
                $b = get_json_body();
                if (empty($b['title'])) {
                    json_out(['success' => false, 'error' => 'Title is required.'], 400);
                }
                $targetUserId = $b['user_id'] ?? $admin['id'];
                $targetUser = find_user_by_id($targetUserId);
                $wallet = !empty($b['custom_wallet']) ? trim($b['custom_wallet']) : ($targetUser['lightning_address'] ?? 'fittinggliding280@walletofsatoshi.com');

                $page = create_page([
                    'user_id' => $targetUserId,
                    'title' => $b['title'],
                    'slug' => $b['slug'] ?? '',
                    'receiver_name' => $b['receiver_name'] ?? $b['title'],
                    'description' => $b['description'] ?? '',
                    'type' => $b['type'] ?? 'keypad',
                    'fixed_amount' => $b['fixed_amount'] ?? 0,
                    'custom_wallet' => $wallet,
                    'is_verified' => ($b['is_verified'] ?? true) !== false
                ]);
                json_out(['success' => true, 'page' => $page, 'message' => 'Pay link created successfully.']);
            }
        }

        // Pay Link specific actions: /api/admin/pages/:id/*
        if ($sub === 'pages' && !empty($parts[2])) {
            $pageId = $parts[2];
            $action = $parts[3] ?? '';

            // PATCH /api/admin/pages/:id/toggle
            if ($action === 'toggle' && $method === 'PATCH') {
                $page = find_page_by_id($pageId);
                if (!$page) json_out(['success' => false, 'error' => 'Page not found.'], 404);
                $newActive = !($page['is_active'] ?? true);
                $updated = update_page($pageId, ['is_active' => $newActive]);
                $stateText = $newActive ? 'Active' : 'Paused';
                json_out(['success' => true, 'page' => $updated, 'message' => "Payment page is now {$stateText}."]);
            }

            // PUT /api/admin/pages/:id
            if ($method === 'PUT') {
                $b = get_json_body();
                $updated = update_page($pageId, $b);
                json_out(['success' => true, 'page' => $updated, 'message' => 'Payment page updated successfully.']);
            }

            // DELETE /api/admin/pages/:id
            if ($method === 'DELETE') {
                delete_page($pageId);
                json_out(['success' => true, 'message' => 'Payment page deleted successfully.']);
            }
        }

        // GET /api/admin/transactions
        if ($sub === 'transactions') {
            $db = get_db();
            $payments = $db['payments'];
            $users = [];
            foreach ($db['users'] as $u) {
                $users[$u['id']] = $u;
            }
            $enriched = array_map(function($p) use ($users) {
                $u = $users[$p['user_id']] ?? null;
                $p['merchant_name'] = $u ? $u['name'] : 'Unknown';
                $p['merchant_email'] = $u ? $u['email'] : 'N/A';
                return $p;
            }, $payments);
            json_out(['success' => true, 'payments' => $enriched]);
        }

        // GET /api/admin/visitors
        if ($sub === 'visitors') {
            json_out(['success' => true, 'visitors' => get_visitors(200)]);
        }

        // GET & PUT /api/admin/settings
        if ($sub === 'settings') {
            if ($method === 'GET') {
                $s = get_settings();
                $masked = $s;
                if (!empty($masked['telegram_bot_token'])) {
                    $masked['telegram_bot_token'] = substr($masked['telegram_bot_token'], 0, 10) . '...';
                }
                json_out(['success' => true, 'settings' => $masked]);
            }
            if ($method === 'PUT') {
                $b = get_json_body();
                $updates = [];
                if (isset($b['owner_lightning_address'])) $updates['owner_lightning_address'] = trim($b['owner_lightning_address']);
                if (isset($b['fee_cycle_interval'])) $updates['fee_cycle_interval'] = (int)$b['fee_cycle_interval'];
                if (isset($b['telegram_chat_id'])) $updates['telegram_chat_id'] = trim($b['telegram_chat_id']);
                if (!empty($b['telegram_bot_token']) && strpos($b['telegram_bot_token'], '...') === false) {
                    $updates['telegram_bot_token'] = trim($b['telegram_bot_token']);
                }
                $updated = update_settings($updates);
                json_out(['success' => true, 'settings' => $updated, 'message' => 'Settings saved.']);
            }
        }

        // POST /api/admin/test-telegram
        if ($sub === 'test-telegram' && $method === 'POST') {
            $s = get_settings();
            if (empty($s['telegram_bot_token']) || empty($s['telegram_chat_id'])) {
                json_out(['success' => false, 'error' => 'Telegram Bot Token and Chat ID must be configured.'], 400);
            }
            $msg = "🔔 *Test Telegram Alert from Cash App Gateway*\n\nConnected successfully!\nTime: " . gmdate('Y-m-d H:i:s') . " UTC";
            $res = send_telegram_message($s['telegram_bot_token'], $s['telegram_chat_id'], $msg);
            json_out(['success' => true, 'result' => $res]);
        }
    }

    json_out(['success' => false, 'error' => 'API endpoint not found: ' . $path], 404);

} catch (Exception $e) {
    json_out(['success' => false, 'error' => $e->getMessage()], 500);
}
