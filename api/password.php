<?php
require_once 'config.php';
require_once 'middleware/cors.php';
require_once 'includes/Database.php';
require_once 'includes/Response.php';
require_once 'includes/Validator.php';
require_once 'includes/Email.php';

try {
    $db   = Database::getInstance();
    $conn = $db->getConnection();

    $data   = json_decode(file_get_contents("php://input"), true);
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'change': changePassword($db, $conn, $data); break;
        case 'forgot': forgotPassword($db, $conn, $data); break;
        case 'reset':  resetPassword($db, $conn, $data);  break;
        default:       Response::error('Invalid action');
    }

} catch (Exception $e) {
    Response::error($e->getMessage(), 500);
}

function getBearerToken(): ?string {
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s+(.+)$/i', $auth, $m)) {
        return trim($m[1]);
    }
    return null;
}

function changePassword($db, $conn, $data) {
    Validator::required(['email', 'old_password', 'new_password'], $data);
    Validator::passwordStrength($data['new_password']);

    // ФІХ: Перевіряємо Bearer токен — зміна паролю є захищеною дією
    $bearerToken = getBearerToken();
    if (!$bearerToken) Response::error('Unauthorized', 401);

    $email = Validator::sanitize($data['email'], $conn);

    $stmt   = $db->query(
        "SELECT id, password_hash FROM user WHERE email = ? AND token = ? AND token_expires_at > NOW()",
        [$email, hash('sha256', $bearerToken)],
        "ss"
    );
    $result = $stmt->get_result();

    if ($result->num_rows === 0) Response::error("Користувача не знайдено або токен недійсний", 401);

    $user = $result->fetch_assoc();
    if (!password_verify($data['old_password'], $user['password_hash'])) {
        Response::error("Невірний старий пароль", 401);
    }

    $newHash = password_hash($data['new_password'], PASSWORD_DEFAULT);
    $db->query("UPDATE user SET password_hash = ? WHERE id = ?", [$newHash, $user['id']], "si");

    Response::success([], "Пароль успішно змінено");
}

function forgotPassword($db, $conn, $data) {
    Validator::required(['email'], $data);
    $email = Validator::sanitize($data['email'], $conn);

    $stmt   = $db->query("SELECT id FROM user WHERE email = ?", [$email], "s");
    $result = $stmt->get_result();

    // ФІХ: Не розкриваємо чи існує email — завжди повертаємо успіх (захист від enumeration)
    if ($result->num_rows === 0) {
        Response::success([], "Якщо такий email існує, посилання відправлено");
        return;
    }

    $token       = bin2hex(random_bytes(32));
    // ФІХ: Токен скидання паролю має термін дії 1 година
    $tokenExpiry = date('Y-m-d H:i:s', strtotime('+1 hour'));

    $db->query(
        "UPDATE user SET verification_code = ?, verification_code_expires_at = ? WHERE email = ?",
        [$token, $tokenExpiry, $email],
        "sss"
    );

    $resetLink = "https://wmap.pp.ua/reset-p.html?email=" . urlencode($email) . "&token=" . $token;
    Email::sendPasswordReset($email, $resetLink);

    Response::success([], "Якщо такий email існує, посилання відправлено");
}

function resetPassword($db, $conn, $data) {
    Validator::required(['email', 'token', 'new_password'], $data);
    Validator::passwordStrength($data['new_password']);

    $email = Validator::sanitize($data['email'], $conn);
    $token = Validator::sanitize($data['token'], $conn);

    // ФІХ: Перевіряємо термін дії токена скидання
    $stmt   = $db->query(
        "SELECT id FROM user WHERE email = ? AND verification_code = ? AND verification_code_expires_at > NOW()",
        [$email, $token],
        "ss"
    );
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        Response::error("Недійсне або застаріле посилання");
    }

    $user    = $result->fetch_assoc();
    $newHash = password_hash($data['new_password'], PASSWORD_DEFAULT);

    $db->query(
        "UPDATE user SET password_hash = ?, verification_code = NULL, verification_code_expires_at = NULL WHERE id = ?",
        [$newHash, $user['id']],
        "si"
    );

    Response::success([], "Пароль успішно скинуто");
}