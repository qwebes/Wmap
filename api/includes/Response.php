<?php
class Response {
    public static function success($data = [], $message = "Success", $code = 200) {
        http_response_code($code);
        echo json_encode([
            "success" => true,
            "message" => $message,
            "data" => $data
        ]);
        exit;
    }

    public static function error($message = "Error", $code = 400) {
        http_response_code($code);
        echo json_encode([
            "success" => false,
            "message" => $message
        ]);
        exit;
    }

    public static function created($data = [], $message = "Created") {
        self::success($data, $message, 201);
    }

    public static function json($data) {
        http_response_code(200);
        echo json_encode($data);
        exit;
    }
}