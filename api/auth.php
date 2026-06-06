<?php
require_once 'config.php';
require_once 'middleware/cors.php';
require_once 'includes/Database.php';
require_once 'includes/Response.php';
require_once 'includes/Validator.php';
require_once 'includes/Email.php';

// Хелпер для встановлення куки
function setRefreshTokenCookie($token) {
    setcookie('refresh_token', $token, [
        'expires' => time() + (30 * 24 * 60 * 60),
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict'
    ]);
}

// ФІХ №1: Хешуємо токен перед збереженням у БД
function hashToken($token) {
    return hash('sha256', $token);
}

try {
    $db = Database::getInstance();
    $conn = $db->getConnection();

    $data = json_decode(file_get_contents("php://input"), true);
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'login':    login($db, $conn, $data);    break;
        case 'register': register($db, $conn, $data); break;
        case 'verify':   verifyEmail($db, $conn, $data); break;
        case 'refresh':  refreshTokens($db, $conn);   break;
        case 'logout':   logout($db, $conn);          break;
        default:         Response::error('Invalid action');
    }
} catch (Exception $e) {
    Response::error($e->getMessage(), 500);
}

function login($db, $conn, $data) {
    Validator::required(['email', 'password'], $data);
    $email = Validator::sanitize($data['email'], $conn);

    $stmt = $db->query(
        "SELECT id, nickname, status, password_hash, two_factor_enabled, is_verified FROM user WHERE email = ?",
        [$email], "s"
    );
    $result = $stmt->get_result();
    if ($result->num_rows === 0) Response::error("Користувача не знайдено", 404);

    $user = $result->fetch_assoc();
    if (!password_verify($data['password'], $user['password_hash'])) Response::error("Невірний пароль", 401);

    // ФІХ №2: Перевіряємо підтвердження email
    if (!$user['is_verified']) Response::error("Email не підтверджено. Перевірте свою пошту", 403);

    if ($user['two_factor_enabled']) {
        Response::success([
            "requires_2fa" => true,
            "user_id"      => $user['id'],
            "nickname"     => $user['nickname'],
            "status"       => $user['status']
        ], "Потрібен код 2FA");
    }

    $token         = bin2hex(random_bytes(32));
    $refresh_token = bin2hex(random_bytes(32));

    $tokenExpires   = date('Y-m-d H:i:s', strtotime('+15 minutes'));
    $refreshExpires = date('Y-m-d H:i:s', strtotime('+30 days'));

    // ФІХ №1: Зберігаємо хеші токенів, а не самі токени
    $db->query(
        "UPDATE user SET token = ?, token_expires_at = ?, refresh_token = ?, refresh_token_expires_at = ? WHERE id = ?",
        [hashToken($token), $tokenExpires, hashToken($refresh_token), $refreshExpires, $user['id']],
        "ssssi"
    );

    setRefreshTokenCookie($refresh_token);

    Response::success([
        "requires_2fa" => false,
        "token"        => $token, // Віддаємо оригінальний токен клієнту
        "nickname"     => $user['nickname'],
        "user_id"      => $user['id'],
        "status"       => $user['status']
    ]);
}

function verifyEmail($db, $conn, $data) {
    Validator::required(['email', 'code'], $data);
    $email = Validator::sanitize($data['email'], $conn);
    $code  = Validator::sanitize($data['code'], $conn);

    // ФІХ №3: Перевіряємо термін дії коду верифікації
    $stmt = $db->query(
        "SELECT id, nickname, status FROM user
         WHERE email = ? AND verification_code = ? AND is_verified = 0
         AND verification_code_expires_at > NOW()",
        [$email, $code], "ss"
    );

    $result = $stmt->get_result();
    if ($result->num_rows === 0) Response::error("Невірний код, пошта вже підтверджена або код протермінований");

    $user          = $result->fetch_assoc();
    $token         = bin2hex(random_bytes(32));
    $refresh_token = bin2hex(random_bytes(32));

    $tokenExpires   = date('Y-m-d H:i:s', strtotime('+15 minutes'));
    $refreshExpires = date('Y-m-d H:i:s', strtotime('+30 days'));

    // ФІХ №1: Зберігаємо хеші
    $db->query(
        "UPDATE user SET is_verified = 1, verification_code = NULL, verification_code_expires_at = NULL,
         token = ?, token_expires_at = ?, refresh_token = ?, refresh_token_expires_at = ? WHERE id = ?",
        [hashToken($token), $tokenExpires, hashToken($refresh_token), $refreshExpires, $user['id']],
        "ssssi"
    );

    setRefreshTokenCookie($refresh_token);

    Response::success([
        "token"   => $token,
        "user_id" => $user['id'],
        "nickname"=> $user['nickname'],
        "status"  => $user['status'],
        "message" => "Email успішно підтверджено"
    ]);
}

function refreshTokens($db, $conn) {
    $old_refresh_token = $_COOKIE['refresh_token'] ?? null;

    if (!$old_refresh_token) {
        Response::error("Недійсний refresh token. Потрібна авторизація", 401);
    }

    // ФІХ №1: Шукаємо по хешу refresh токена
    $stmt = $db->query(
        "SELECT id FROM user WHERE refresh_token = ? AND refresh_token_expires_at > NOW()",
        [hashToken($old_refresh_token)], "s"
    );
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        // ФІХ №4: Знищуємо куку без виклику logout() щоб уникнути зайвого Response
        setcookie('refresh_token', '', [
            'expires'  => time() - 3600,
            'path'     => '/',
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Strict'
        ]);
        Response::error("Сесія закінчилась. Потрібна авторизація", 401);
    }

    $user              = $result->fetch_assoc();
    $new_access_token  = bin2hex(random_bytes(32));
    $new_refresh_token = bin2hex(random_bytes(32));

    $tokenExpires   = date('Y-m-d H:i:s', strtotime('+15 minutes'));
    $refreshExpires = date('Y-m-d H:i:s', strtotime('+30 days'));

    // ФІХ №1: Зберігаємо хеші
    $db->query(
        "UPDATE user SET token = ?, token_expires_at = ?, refresh_token = ?, refresh_token_expires_at = ? WHERE id = ?",
        [hashToken($new_access_token), $tokenExpires, hashToken($new_refresh_token), $refreshExpires, $user['id']],
        "ssssi"
    );

    setRefreshTokenCookie($new_refresh_token);

    Response::success([
        "token"   => $new_access_token,
        "user_id" => $user['id'] // ФІХ №5: Повертаємо user_id
    ], "Токени успішно оновлено");
}

function logout($db, $conn) {
    $refresh_token = $_COOKIE['refresh_token'] ?? null;

    // ФІХ №6: Інвалідуємо токени у БД при logout
    if ($refresh_token) {
        $db->query(
            "UPDATE user SET token = NULL, token_expires_at = NULL,
             refresh_token = NULL, refresh_token_expires_at = NULL
             WHERE refresh_token = ?",
            [hashToken($refresh_token)], "s"
        );
    }

    setcookie('refresh_token', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Strict'
    ]);
    Response::success([], "Вихід успішний");
}

function register($db, $conn, $data) {
    Validator::required(['nickname', 'email', 'password'], $data);
    if (!Validator::email($data['email'])) Response::error("Невірний формат email");
    Validator::passwordStrength($data['password']);

    $nickname = Validator::sanitize($data['nickname'], $conn);
    $email    = Validator::sanitize($data['email'], $conn);

    $passwordHash = password_hash($data['password'], PASSWORD_DEFAULT);

    // ФІХ №3: Використовуємо random_int() + термін дії коду 15 хвилин
    $code        = random_int(100000, 999999);
    $codeExpires = date('Y-m-d H:i:s', strtotime('+15 minutes'));

    // ФІХ №7: Покладаємось на UNIQUE constraint у БД, уникаємо race condition
    try {
        $db->query(
            "INSERT INTO user (nickname, email, password_hash, is_verified, verification_code, verification_code_expires_at)
             VALUES (?, ?, ?, 0, ?, ?)",
            [$nickname, $email, $passwordHash, $code, $codeExpires],
            "sssss" // код — рядок, бо може йти як ss в SELECT далі
        );
    } catch (mysqli_sql_exception $e) {
        // Код 1062 = Duplicate entry (порушення UNIQUE)
        if ($e->getCode() === 1062) {
            // Визначаємо що саме дублюється
            $stmt  = $db->query("SELECT email, nickname FROM user WHERE email = ? OR nickname = ?", [$email, $nickname], "ss");
            $existing = $stmt->get_result()->fetch_assoc();
            if ($existing['email'] === $email) Response::error("Цей Email вже зареєстровано!", 409);
            else Response::error("Цей Нікнейм вже зайнятий!", 409);
        }
        throw $e;
    }

    Email::sendVerificationCode($email, $code);
    Response::created([], "Код відправлено на пошту");
}