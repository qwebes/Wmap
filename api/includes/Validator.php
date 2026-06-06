<?php
class Validator {
    public static function email($email) {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    public static function required($fields, $data) {
        foreach ($fields as $field) {
            if (empty($data[$field])) {
                Response::error("$field is required");
            }
        }
    }

    public static function minLength($value, $min) {
        return strlen($value) >= $min;
    }

    public static function passwordStrength($password) {
        if (strlen($password) < 6) {
            Response::error("Пароль має містити мінімум 6 символів");
        }
        return true;
    }

    public static function sanitize($value, $conn) {
        return $conn->real_escape_string(trim($value));
    }
}