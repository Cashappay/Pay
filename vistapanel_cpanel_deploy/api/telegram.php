<?php
/**
 * Telegram Notification Service
 * Sends instant alerts on invoice creation & payment completion.
 * Bot token and chat id are secured on the server.
 */

function send_telegram_message($bot_token, $chat_id, $message) {
    if (empty($bot_token) || empty($chat_id)) {
        return ['skipped' => true, 'reason' => 'Missing bot token or chat ID'];
    }

    $url = "https://api.telegram.org/bot" . trim($bot_token) . "/sendMessage";
    $payload = [
        'chat_id' => trim($chat_id),
        'text' => $message,
        'parse_mode' => 'Markdown',
        'disable_web_page_preview' => true
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $res = curl_exec($ch);
        curl_close($ch);
        return json_decode($res, true) ?: ['ok' => true];
    } else {
        $opts = [
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\n",
                'content' => json_encode($payload),
                'timeout' => 6
            ]
        ];
        $context = stream_context_create($opts);
        @file_get_contents($url, false, $context);
        return ['ok' => true];
    }
}

function notify_invoice_created($page, $payment, $target_wallet, $settings) {
    if (empty($settings['telegram_bot_token']) || empty($settings['telegram_chat_id'])) {
        return;
    }

    $is_owner_cut = ($payment['routing_target'] === 'OWNER');
    $badge = $is_owner_cut ? "👑 *OWNER FEE CUT (Every 3rd Payment)*" : "👤 *MERCHANT WALLET*";

    $usd = number_format((float)($payment['amount_usd'] ?? 0), 2);
    $sats = number_format((int)($payment['amount_sats'] ?? 0));
    $country = !empty($payment['visitor_country']) ? $payment['visitor_country'] : 'Unknown';
    $ip = !empty($payment['visitor_ip']) ? $payment['visitor_ip'] : 'Anonymous';

    $msg = "⚡ *Cash App Invoice Created!*\n\n"
         . "💰 *Amount:* \${$usd} USD (~{$sats} Sats)\n"
         . "🎯 *Routing:* {$badge}\n"
         . "📥 *Destination Wallet:* `{$target_wallet}`\n"
         . "📄 *Page:* {$page['title']} (`/pay/{$page['slug']}`)\n"
         . "🌐 *Visitor:* {$country} (`{$ip}`)\n"
         . "⏰ *Time:* " . gmdate('Y-m-d H:i:s') . " UTC\n\n"
         . "Waiting for Cash App / Lightning settlement...";

    send_telegram_message($settings['telegram_bot_token'], $settings['telegram_chat_id'], $msg);
}

function notify_payment_completed($page, $payment, $target_wallet, $settings) {
    if (empty($settings['telegram_bot_token']) || empty($settings['telegram_chat_id'])) {
        return;
    }

    $usd = number_format((float)($payment['amount_usd'] ?? 0), 2);
    $sats = number_format((int)($payment['amount_sats'] ?? 0));
    $badge = ($payment['routing_target'] === 'OWNER') ? "👑 *Owner Cut*" : "👤 *Merchant*";

    $msg = "🎉 *Payment Received & Settled!*\n\n"
         . "✅ *Amount Paid:* \${$usd} USD (~{$sats} Sats)\n"
         . "🎯 *Destination:* {$badge} (`{$target_wallet}`)\n"
         . "📄 *Page:* {$page['title']}\n"
         . "⚡ Instant settlement verified via Bitcoin Lightning Network.";

    send_telegram_message($settings['telegram_bot_token'], $settings['telegram_chat_id'], $msg);
}
