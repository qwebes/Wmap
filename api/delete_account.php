<?php
require_once 'config.php';
require_once 'middleware/cors.php';
require_once 'includes/Database.php';
require_once 'includes/Response.php';
require_once 'includes/Validator.php';

try {
    $db   = Database::getInstance();
    $conn = $db->getConnection();

    $data = json_decode(file_get_contents("php://input"), true);

    Validator::required(['user_id', 'password'], $data);

    $userId   = (int)$data['user_id'];
    $password = $data['password'];

    // ФІХ: Перевіряємо Bearer токен — видалення акаунту є критичною дією
    $bearerToken = getBearerToken();
    if (!$bearerToken) Response::error('Unauthorized', 401);

    $tokenStmt = $db->query(
        "SELECT id FROM user WHERE id = ? AND token = ? AND token_expires_at > NOW() AND is_verified = 1",
        [$userId, hash('sha256', $bearerToken)],
        "is"
    );
    if ($tokenStmt->get_result()->num_rows === 0) {
        Response::error('Unauthorized', 401);
    }

    // Перевіряємо пароль
    $stmt   = $db->query("SELECT password_hash FROM user WHERE id = ?", [$userId], "i");
    $result = $stmt->get_result();

    if ($result->num_rows === 0) Response::error("Користувача не знайдено", 404);

    $user = $result->fetch_assoc();
    if (!password_verify($password, $user['password_hash'])) {
        Response::error("Невірний пароль", 401);
    }

    $db->query("DELETE FROM user WHERE id = ?", [$userId], "i");

    // Знищуємо refresh_token куку
    setcookie('refresh_token', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Strict'
    ]);

    Response::success([], "Акаунт успішно видалено");

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