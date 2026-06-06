<?php
require_once 'config.php';
require_once 'middleware/cors.php';
require_once 'includes/Database.php';
require_once 'includes/Response.php';
require_once 'includes/Validator.php';
require_once 'includes/GoogleAuthenticator.php';

// ФІХ: Прибрано error_reporting/display_errors — не для продакшену
// ФІХ: Прибрано всі error_log з чутливими даними (secret, OTPAuth URL)

try {
    $db   = Database::getInstance();
    $conn = $db->getConnection();
    $ga   = new GoogleAuthenticator();

    $data   = json_decode(file_get_contents("php://input"), true);
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'setup':   setupTwoFactor($db, $conn, $ga, $data);         break;
        case 'enable':  enableTwoFactor($db, $conn, $ga, $data);        break;
        case 'disable': disableTwoFactor($db, $conn, $data);            break;
        case 'verify':  verifyTwoFactorCode($db, $conn, $ga, $data);    break;
        case 'status':  getTwoFactorStatus($db, $conn, $data);          break;
        default:        Response::error('Invalid action');
    }

} catch (Exception $e) {
    error_log("2FA Error: " . $e->getMessage());
    Response::error($e->getMessage(), 500);
}

function getTwoFactorStatus($db, $conn, $data) {
    Validator::required(['user_id'], $data);
    $userId = (int)$data['user_id'];

    $stmt   = $db->query("SELECT two_factor_enabled FROM user WHERE id = ?", [$userId], "i");
    $result = $stmt->get_result();

    if ($result->num_rows === 0) Response::error("Користувача не знайдено", 404);

    $user = $result->fetch_assoc();
    Response::success(["enabled" => (bool)$user['two_factor_enabled']]);
}

function setupTwoFactor($db, $conn, $ga, $data) {
    Validator::required(['user_id'], $data);
    $userId = (int)$data['user_id'];

    $stmt   = $db->query("SELECT email, nickname, two_factor_enabled FROM user WHERE id = ?", [$userId], "i");
    $result = $stmt->get_result();

    if ($result->num_rows === 0) Response::error("Користувача не знайдено", 404);

    $user   = $result->fetch_assoc();
    $secret = $ga->createSecret();

    $db->query("UPDATE user SET two_factor_secret = ? WHERE id = ?", [$secret, $userId], "si");

    $otpauthUrl = sprintf(
        "otpauth://totp/%s:%s?secret=%s&issuer=%s",
        urlencode("WMap"),
        urlencode($user['email']),
        $secret,
        urlencode("WMap")
    );

    $qrCodeUrl = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" . urlencode($otpauthUrl);

    Response::success([
        "secret"           => $secret,
        "qr_code_url"      => $qrCodeUrl,
        "otpauth_url"      => $otpauthUrl,
        "manual_entry_key" => $secret,
        "enabled"          => (bool)$user['two_factor_enabled']
    ]);
}

function enableTwoFactor($db, $conn, $ga, $data) {
    Validator::required(['user_id', 'code'], $data);
    $userId = (int)$data['user_id'];
    $code   = trim($data['code']);

    $stmt   = $db->query("SELECT two_factor_secret, two_factor_enabled FROM user WHERE id = ?", [$userId], "i");
    $result = $stmt->get_result();

    if ($result->num_rows === 0) Response::error("Користувача не знайдено", 404);

    $user   = $result->fetch_assoc();
    $secret = $user['two_factor_secret'];

    if (!$secret) Response::error("2FA не налаштовано. Спочатку викличте setup");

    if (!$ga->verifyCode($secret, $code, 2)) {
        Response::error("Невірний код. Спробуйте ще раз", 401);
    }

    $db->query("UPDATE user SET two_factor_enabled = 1 WHERE id = ?", [$userId], "i");
    Response::success([], "2FA успішно увімкнено");
}

function disableTwoFactor($db, $conn, $data) {
    Validator::required(['user_id', 'password'], $data);
    $userId   = (int)$data['user_id'];
    $password = $data['password'];

    $stmt   = $db->query("SELECT password_hash FROM user WHERE id = ?", [$userId], "i");
    $result = $stmt->get_result();

    if ($result->num_rows === 0) Response::error("Користувача не знайдено", 404);

    $user = $result->fetch_assoc();
    if (!password_verify($password, $user['password_hash'])) {
        Response::error("Невірний пароль", 401);
    }

    $db->query(
        "UPDATE user SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?",
        [$userId], "i"
    );
    Response::success([], "2FA успішно вимкнено");
}

function verifyTwoFactorCode($db, $conn, $ga, $data) {
    Validator::required(['user_id', 'code'], $data);
    $userId = (int)$data['user_id'];
    $code   = trim($data['code']);

    $stmt   = $db->query("SELECT two_factor_secret, two_factor_enabled FROM user WHERE id = ?", [$userId], "i");
    $result = $stmt->get_result();

    if ($result->num_rows === 0) Response::error("Користувача не знайдено", 404);

    $user = $result->fetch_assoc();
    if (!$user['two_factor_enabled']) Response::error("2FA не увімкнено");
    if (!$ga->verifyCode($user['two_factor_secret'], $code, 2)) Response::error("Невірний код", 401);

    $token         = bin2hex(random_bytes(32));
    $refresh_token = bin2hex(random_bytes(32));

    // ФІХ: Зберігаємо хеші токенів + термін дії (як в auth.php)
    $tokenExpires   = date('Y-m-d H:i:s', strtotime('+15 minutes'));
    $refreshExpires = date('Y-m-d H:i:s', strtotime('+30 days'));

    $db->query(
        "UPDATE user SET token = ?, token_expires_at = ?, refresh_token = ?, refresh_token_expires_at = ? WHERE id = ?",
        [hash('sha256', $token), $tokenExpires, hash('sha256', $refresh_token), $refreshExpires, $userId],
        "ssssi"
    );

    setcookie('refresh_token', $refresh_token, [
        'expires'  => time() + (30 * 24 * 60 * 60),
        'path'     => '/',
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Strict'
    ]);

    Response::success(["token" => $token], "Код підтверджено");
}