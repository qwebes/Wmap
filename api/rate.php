<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/middleware/cors.php';
require_once __DIR__ . '/includes/Database.php';
require_once __DIR__ . '/includes/Response.php';

function getBearerToken(): ?string {
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s+(.+)$/i', $auth, $m)) {
        return trim($m[1]);
    }
    return null;
}

$input = json_decode(file_get_contents("php://input"), true);

$user_id    = isset($input['user_id'])  ? (int)$input['user_id']  : null;
$avtomat_id = isset($input['machine_id']) ? (int)$input['machine_id'] : null;
$grade      = isset($input['rating'])   ? (int)$input['rating']   : null;

if (!$user_id) {
    Response::error('Не знайдено user_id. Будь ласка, переавторизуйтесь.', 401);
}

if (!$avtomat_id || !$grade || $grade < 1 || $grade > 5) {
    Response::error('Некоректні дані оцінки', 400);
}

// ФІХ: Перевіряємо Bearer токен перед збереженням оцінки
$bearerToken = getBearerToken();
if (!$bearerToken) Response::error('Unauthorized', 401);

try {
    $db = Database::getInstance();

    $tokenStmt = $db->query(
        "SELECT id FROM user WHERE id = ? AND token = ? AND token_expires_at > NOW() AND is_verified = 1",
        [$user_id, hash('sha256', $bearerToken)],
        "is"
    );
    if ($tokenStmt->get_result()->num_rows === 0) {
        Response::error('Unauthorized', 401);
    }

    $db->query(
        "INSERT INTO review (user_id, avtomat_id, grade, date)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE grade = VALUES(grade), date = NOW()",
        [$user_id, $avtomat_id, $grade],
        "iii"
    );

    $db->query(
        "UPDATE avtomat
         SET rating = (SELECT AVG(grade) FROM review WHERE avtomat_id = ?)
         WHERE id = ?",
        [$avtomat_id, $avtomat_id],
        "ii"
    );

    Response::json([
        'status'      => 'success',
        'message'     => 'Оцінку успішно збережено',
        'saved_grade' => $grade
    ]);

} catch (Exception $e) {
    Response::error('Помилка сервера: ' . $e->getMessage(), 500);
}