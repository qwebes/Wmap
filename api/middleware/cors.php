<?php
// Отримуємо домен, з якого йде запит
$origin = $_SERVER['HTTP_ORIGIN'] ?? 'https://wmap.pp.ua';

// Дозволяємо ваш основний домен та локалхост для розробки
$allowed_origins = [
    'https://wmap.pp.ua'
];

if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header("Access-Control-Allow-Origin: https://wmap.pp.ua");
}

header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true"); // ДОЗВОЛЯЄМО COOKIES

header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

while (ob_get_level()) {
    ob_end_clean();
}