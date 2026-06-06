<?php
require_once 'config.php';
require_once 'middleware/cors.php';
require_once 'includes/Database.php';
require_once 'includes/Response.php';
require_once 'includes/Validator.php';

try {
    $db = Database::getInstance();
    $conn = $db->getConnection();

    $action = $_GET['action'] ?? 'get';

    switch ($action) {
        case 'add':
            $token = getBearerToken();
            if (!$token) Response::error('Unauthorized', 401);

            $userId = validateToken($db, $token);
            if (!$userId) Response::error('Invalid or expired token', 401);

            addAvtomat($db, $conn, $userId);
            break;

        case 'get':
            $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
            getAvtomats($db, $conn, $userId);
            break;

        case 'report_status':
            $token = getBearerToken();
            if (!$token) Response::error('Unauthorized', 401);

            $userId = validateToken($db, $token);
            if (!$userId) Response::error('Invalid or expired token', 401);

            reportAvtomatStatus($db, $conn, $userId);
            break;

        default:
            Response::error('Invalid action');
    }

} catch (Exception $e) {
    if (isset($db)) $db->rollback();
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

function validateToken($db, $token): ?int {
    try {
        $stmt = $db->query(
            "SELECT id FROM user WHERE token = ? AND token_expires_at > NOW() AND is_verified = 1",
            [hash('sha256', $token)],
            "s"
        );
        $result = $stmt->get_result();
        if ($result->num_rows > 0) {
            return (int)$result->fetch_assoc()['id'];
        }
        return null;
    } catch (Exception $e) {
        error_log("Token validation error: " . $e->getMessage());
        return null;
    }
}

function addAvtomat($db, $conn, $userId) {
    if (empty($_POST['company']) || empty($_POST['lat']) || empty($_POST['lng'])) {
        Response::error("Заповніть обов'язкові поля");
    }

    $db->beginTransaction();

    try {
        $company     = Validator::sanitize($_POST['company'], $conn);
        $address     = Validator::sanitize($_POST['address'] ?? '', $conn);
        $description = Validator::sanitize($_POST['description'] ?? '', $conn);
        $lat         = (float)$_POST['lat'];
        $lng         = (float)$_POST['lng'];

        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            Response::error("Некоректні координати");
        }

        $photoUrl = null;
        $status = 'pending';
        $responseMessage = "Відправлено на модерацію";

        if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
            $allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
            if (!in_array($_FILES['photo']['type'], $allowedTypes)) {
                Response::error("Дозволені тільки JPG, PNG, WEBP");
            }
            if ($_FILES['photo']['size'] > 5 * 1024 * 1024) {
                Response::error("Файл занадто великий (макс 5MB)");
            }
            if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0777, true);

            $fileName   = time() . '_' . uniqid() . '_' . basename($_FILES['photo']['name']);
            $targetFile = UPLOAD_DIR . $fileName;

            if (move_uploaded_file($_FILES['photo']['tmp_name'], $targetFile)) {
                $photoUrl = BASE_URL . '/uploads/' . $fileName;

                // Автоматична модерація за EXIF
                $photoCoords = getExifCoordinates($targetFile);
                if ($photoCoords) {
                    $distance = calculateExifDistance($lat, $lng, $photoCoords['lat'], $photoCoords['lon']);
                    if ($distance > 500) {
                        $status = 'rejected';
                        $responseMessage = "Автомат додано, але ВІДХИЛЕНО: розбіжність локації " . round($distance) . " метрів.";
                    }
                }
            }
        }

        $db->query(
            "INSERT INTO location (address, latitude, longitude) VALUES (?, ?, ?)",
            [$address, $lat, $lng],
            "sdd"
        );
        $locationId = $db->getInsertId();

        $stmt   = $db->query("SELECT id FROM suppliers WHERE name = ? LIMIT 1", [$company], "s");
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            $supplierId = $result->fetch_assoc()['id'];
        } else {
            $db->query("INSERT INTO suppliers (name) VALUES (?)", [$company], "s");
            $supplierId = $db->getInsertId();
        }

        if ($photoUrl) {
            $db->query(
                "INSERT INTO avtomat (status, location_id, supplier_id, is_active, description, photo, created_by)
                 VALUES (?, ?, ?, 0, ?, ?, ?)",
                [$status, $locationId, $supplierId, $description, $photoUrl, $userId],
                "siissi"
            );
        } else {
            $db->query(
                "INSERT INTO avtomat (status, location_id, supplier_id, is_active, description, created_by)
                 VALUES (?, ?, ?, 0, ?, ?)",
                [$status, $locationId, $supplierId, $description, $userId],
                "siisi"
            );
        }

        $db->commit();
        Response::created([], $responseMessage);

    } catch (Exception $e) {
        $db->rollback();
        throw $e;
    }
}

function getAvtomats($db, $conn, $userId) {
    $stmt = $db->query(
        "SELECT
            a.id,
            a.description,
            a.status,
            a.photo,
            a.rating,
            l.address,
            l.latitude,
            l.longitude,
            s.name as company_name,
            (SELECT grade FROM review r WHERE r.avtomat_id = a.id AND r.user_id = ? LIMIT 1) as user_rating,
            (SELECT created_at FROM avtomat_reports ar WHERE ar.avtomat_id = a.id ORDER BY ar.created_at DESC LIMIT 1) as last_report_date,
            (SELECT is_working FROM avtomat_reports ar WHERE ar.avtomat_id = a.id ORDER BY ar.created_at DESC LIMIT 1) as last_status,
            (SELECT is_working FROM avtomat_reports ar WHERE ar.avtomat_id = a.id ORDER BY ar.created_at DESC LIMIT 1 OFFSET 1) as prev_status
         FROM avtomat a
         JOIN location l ON a.location_id = l.id
         JOIN suppliers s ON a.supplier_id = s.id
         WHERE a.status = 'approved'",
        [$userId],
        "i"
    );

    $result   = $stmt->get_result();
    $avtomats = [];
    while ($row = $result->fetch_assoc()) {
        $avtomats[] = $row;
    }

    Response::json(["avtomats" => $avtomats]);
}

function reportAvtomatStatus($db, $conn, $userId) {
    $body = json_decode(file_get_contents('php://input'), true);
    $avtomatId = (int)($body['avtomat_id'] ?? 0);
    $isWorking = isset($body['is_working']) ? (int)$body['is_working'] : null;

    if (!$avtomatId || $isWorking === null) {
        Response::error("Некоректні дані");
    }

    $db->query(
        "INSERT INTO avtomat_reports (avtomat_id, user_id, is_working) VALUES (?, ?, ?)",
        [$avtomatId, $userId, $isWorking],
        "iii"
    );

    Response::json(['success' => true, 'message' => 'Дякуємо за допомогу! Статус оновлено.']);
}

// Хелпери
function getExifCoordinates(string $imagePath): ?array {
    $exif = @exif_read_data($imagePath);
    if (isset($exif['GPSLatitude']) && isset($exif['GPSLongitude'])) {
        $lat = getGpsFromExif($exif['GPSLatitude'], $exif['GPSLatitudeRef'] ?? 'N');
        $lon = getGpsFromExif($exif['GPSLongitude'], $exif['GPSLongitudeRef'] ?? 'E');
        return ['lat' => $lat, 'lon' => $lon];
    }
    return null;
}

function getGpsFromExif(array $exifCoord, string $hemi): float {
    $degrees = count($exifCoord) > 0 ? gps2Num($exifCoord[0]) : 0;
    $minutes = count($exifCoord) > 1 ? gps2Num($exifCoord[1]) : 0;
    $seconds = count($exifCoord) > 2 ? gps2Num($exifCoord[2]) : 0;

    $flip = ($hemi == 'W' || $hemi == 'S') ? -1 : 1;
    return $flip * ($degrees + $minutes / 60 + $seconds / 3600);
}

function gps2Num(string $coordPart): float {
    $parts = explode('/', $coordPart);
    if (count($parts) <= 0) return 0;
    if (count($parts) == 1) return (float)$parts[0];
    return floatval($parts[0]) / floatval($parts[1]);
}

function calculateExifDistance(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $earthRadius = 6371000;
    $latFrom = deg2rad($lat1);
    $lonFrom = deg2rad($lon1);
    $latTo = deg2rad($lat2);
    $lonTo = deg2rad($lon2);

    $latDelta = $latTo - $latFrom;
    $lonDelta = $lonTo - $lonFrom;

    $a = sin($latDelta / 2) * sin($latDelta / 2) +
        cos($latFrom) * cos($latTo) *
        sin($lonDelta / 2) * sin($lonDelta / 2);

    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    return $earthRadius * $c;
}