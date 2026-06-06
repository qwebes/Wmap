<?php
require_once 'config.php';
require_once 'middleware/cors.php';
require_once 'includes/Database.php';
require_once 'includes/Response.php';
require_once 'includes/Validator.php';

try {
    $db   = Database::getInstance();
    $conn = $db->getConnection();

    $data   = json_decode(file_get_contents("php://input"), true) ?? [];
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'toggle':   toggleFavorite($db, $data);   break;
        case 'get_ids':  getFavoriteIds($db, $data);   break;
        case 'get_list': getFavorites($db, $data);     break;
        default:         Response::error('Invalid action', 400);
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

// ФІХ: Перевіряємо токен для операцій запису
function requireAuth($db, $userId): void {
    $token = getBearerToken();
    if (!$token) Response::error('Unauthorized', 401);

    $stmt = $db->query(
        "SELECT id FROM user WHERE id = ? AND token = ? AND token_expires_at > NOW() AND is_verified = 1",
        [$userId, hash('sha256', $token)],
        "is"
    );
    if ($stmt->get_result()->num_rows === 0) {
        Response::error('Unauthorized', 401);
    }
}

function toggleFavorite($db, $data) {
    Validator::required(['user_id', 'avtomat_id'], $data);

    $userId    = (int)$data['user_id'];
    $avtomatId = (int)$data['avtomat_id'];
    $add       = (bool)($data['add'] ?? true);

    // ФІХ: Перевіряємо токен перед зміною улюблених
    requireAuth($db, $userId);

    if ($add) {
        $check = $db->query(
            "SELECT id FROM favourite WHERE user_id = ? AND avtomat_id = ?",
            [$userId, $avtomatId], "ii"
        );
        if ($check->get_result()->num_rows > 0) {
            Response::success([], "Вже в улюблених");
            return;
        }
        $db->query("INSERT INTO favourite (user_id, avtomat_id) VALUES (?, ?)", [$userId, $avtomatId], "ii");
        Response::success([], "Додано в улюблені");
    } else {
        $db->query("DELETE FROM favourite WHERE user_id = ? AND avtomat_id = ?", [$userId, $avtomatId], "ii");
        Response::success([], "Видалено з улюблених");
    }
}

function getFavoriteIds($db, $data) {
    $userId = (int)($data['user_id'] ?? 0);
    if (!$userId) { Response::json(["favorite_ids" => []]); return; }

    $stmt   = $db->query("SELECT avtomat_id FROM favourite WHERE user_id = ?", [$userId], "i");
    $result = $stmt->get_result();
    $ids    = [];
    while ($row = $result->fetch_assoc()) {
        $ids[] = (int)$row['avtomat_id'];
    }
    Response::json(["favorite_ids" => $ids]);
}

function getFavorites($db, $data) {
    $userId = (int)($data['user_id'] ?? 0);
    if (!$userId) { Response::json(["favorites" => []]); return; }

    $stmt = $db->query(
        "SELECT
            a.id AS avtomat_id,
            a.description,
            a.photo,
            l.address,
            l.latitude,
            l.longitude,
            s.name AS company_name
         FROM favourite f
         JOIN avtomat a  ON f.avtomat_id = a.id
         JOIN location l ON a.location_id = l.id
         JOIN suppliers s ON a.supplier_id = s.id
         WHERE f.user_id = ? AND a.status = 'approved'
         ORDER BY f.id DESC",
        [$userId], "i"
    );

    $result    = $stmt->get_result();
    $favorites = [];
    while ($row = $result->fetch_assoc()) {
        if (!empty($row['photo']) && !str_starts_with($row['photo'], 'http')) {
            $row['photo'] = 'https://wmap.pp.ua/' . ltrim($row['photo'], '/');
        }
        $favorites[] = $row;
    }
    Response::json(["favorites" => $favorites]);
}