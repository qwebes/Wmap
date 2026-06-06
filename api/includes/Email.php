<?php
class Email {
    public static function send($to, $subject, $message) {
        $headers = "From: noreply@wmap.pp.ua\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";

        return mail($to, $subject, $message, $headers);
    }

    public static function sendVerificationCode($email, $code) {
        $subject = "Код підтвердження реєстрації - WMap";
        $message = "
        <div style='font-family: Arial, sans-serif; padding: 20px;'>
            <h2>Підтвердження реєстрації</h2>
            <p>Ваш код для реєстрації на WMap:</p>
            <p style='font-size: 24px; font-weight: bold; letter-spacing: 3px; color: #0056b3;'>{$code}</p>
        </div>";

        return self::send($email, $subject, $message);
    }

    public static function sendPasswordReset($email, $resetLink) {
        $subject = "Відновлення паролю - WMap";

        $message = "
        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;'>
            <h2 style='color: #333; text-align: center;'>Відновлення паролю WMap</h2>
            <p style='font-size: 16px; color: #555; line-height: 1.5;'>
                Ви зробили запит на відновлення паролю для акаунту <b>{$email}</b>.
            </p>
            <p style='font-size: 16px; color: #555; line-height: 1.5;'>
                Щоб створити новий пароль, натисніть на кнопку нижче:
            </p>
            
            <div style='text-align: center; margin: 30px 0;'>
                <a href='{$resetLink}' style='display: inline-block; padding: 14px 28px; background-color: #0F2A3F; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;'>
                    Відновити пароль
                </a>
            </div>
            
            <p style='font-size: 14px; color: #999; margin-top: 20px; text-align: center;'>
                Якщо ви не робили цей запит, просто проігноруйте цей лист. Ваш акаунт у безпеці.
            </p>
            
            <hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'>
            
            <p style='font-size: 12px; color: #aaa; text-align: center;'>
                Якщо кнопка не працює, скопіюйте це посилання та вставте його в браузер:<br>
                <a href='{$resetLink}' style='color: #0056b3; word-break: break-all;'>{$resetLink}</a>
            </p>
        </div>
        ";

        return self::send($email, $subject, $message);
    }
}