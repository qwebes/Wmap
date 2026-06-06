<?php
require_once 'config.php';
require_once 'middleware/cors.php';
require_once 'includes/Database.php';
require_once 'includes/Response.php';
require_once 'includes/Validator.php';

try {
    $db   = Database::getInstance();
    $conn = $db->getConnection();

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

// ── Перевірка токена адміна ──────────────────────────────
    $token = getBearerToken();
    if (!$token) {
        Response::error('Unauthorized: Missing token', 401);
    }

    // Шукаємо користувача ТІЛЬКИ за токеном
    $userStmt = $db->query(
        "SELECT id, status, token_expires_at, is_verified FROM user WHERE token = ? LIMIT 1",
        [hash('sha256', $token)],
        "s"
    );
    $userRes = $userStmt->get_result();

    if ($userRes->num_rows === 0) {
        // Токена немає в базі (невірний або хтось розлогінився)
        Response::error('Unauthorized: Invalid token', 401);
    }

    $user = $userRes->fetch_assoc();

    // 1. Перевіряємо, чи токен не протермінований
    if (strtotime($user['token_expires_at']) < time()) {
        Response::error('Unauthorized: Token expired', 401); // ТУТ ВАЖЛИВО 401!
    }

    // 2. Перевіряємо, чи підтверджений акаунт (опціонально, але у вас було)
    if ($user['is_verified'] != 1) {
        Response::error('Forbidden: Account not verified', 403);
    }

    // 3. Перевіряємо роль
    if ($user['status'] !== 'admin') {
        Response::error('Forbidden: Admin access required', 403); // А ось тут 403
    }

    // ════════════════════════════════════════════════════════
    // GET ?action=pending
    // ════════════════════════════════════════════════════════
    if ($method === 'GET' && $action === 'pending') {

        $stmt = $db->query(
            "SELECT
                a.id,
                l.address,
                l.latitude     AS lat,
                l.longitude    AS lng,
                s.name         AS company,
                a.supplier_id,
                a.description,
                a.photo,
                a.status
             FROM avtomat a
             LEFT JOIN location  l ON a.location_id = l.id
             LEFT JOIN suppliers s ON a.supplier_id = s.id
             WHERE a.status = 'pending'
             ORDER BY a.id DESC",
            [],
            ""
        );

        $result  = $stmt->get_result();
        $pending = [];
        while ($row = $result->fetch_assoc()) {
            if (!empty($row['photo']) && !str_starts_with($row['photo'], 'http')) {
                $row['photo'] = 'https://wmap.pp.ua/' . ltrim($row['photo'], '/');
            }
            $pending[] = $row;
        }

        Response::json(['success' => true, 'data' => $pending]);
        exit;
    }

    // ════════════════════════════════════════════════════════
    // POST — approve / reject
    // ════════════════════════════════════════════════════════
    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $id   = (int)($body['id']    ?? 0);
        $act  = trim($body['action'] ?? '');

        if (!$id || !in_array($act, ['approve', 'reject'], true)) {
            Response::error('Invalid parameters', 400);
        }

        $status   = ($act === 'approve') ? 'approved' : 'rejected';
        $isActive = ($act === 'approve') ? 1 : 0;

        $db->beginTransaction();

        $stmt = $db->query(
            "UPDATE avtomat SET status = ?, is_active = ? WHERE id = ? AND status = 'pending'",
            [$status, $isActive, $id],
            "sii"
        );

        if ($conn->affected_rows === 0) {
            $db->rollback();
            Response::error('Record not found or already moderated', 404);
        }

        $db->commit();
        Response::json(['success' => true, 'id' => $id, 'status' => $status]);
        exit;
    }

    Response::error('Method or action not allowed', 405);

} catch (Exception $e) {
    if (isset($db)) { try { $db->rollback(); } catch (Exception $_) {} }
    Response::error($e->getMessage(), 500);
}

// ── Helper ───────────────────────────────────────────────────
function getBearerToken(): ?string {
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s+(.+)$/i', $auth, $m)) {
        return trim($m[1]);
    }
    return null;
}