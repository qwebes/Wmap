document.addEventListener('DOMContentLoaded', () => {

    if (Auth.isLoggedIn()) { window.location.href = '/'; return; }

    const form = document.querySelector('form');

    function showMessage(text, type = 'error') {
        let box = document.getElementById('auth-message');
        if (!box) {
            box = document.createElement('div');
            box.id = 'auth-message';
            form.insertAdjacentElement('beforebegin', box);
        }
        box.className = `auth-message ${type}`;
        box.textContent = text;
        box.style.display = 'block';
    }

    function setLoading(on) {
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled    = on;
        btn.textContent = on ? 'Завантаження...' : 'Створити акаунт';
    }

    function showVerificationModal(email, nickname) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay-verify';
        overlay.innerHTML = `
            <div class="modal-verify-card">
                <h3>Підтвердження email</h3>
                <p>Ми надіслали код на <strong>${email}</strong></p>
                <p style="font-size: 0.85em; color: #666; margin-top: -5px; margin-bottom: 15px;">
                    (Якщо листа немає, перевірте папку "Спам")
                </p>
                <div class="input-group">
                    <input type="text" id="verify-code" placeholder="6-значний код"
                           maxlength="6" autocomplete="one-time-code" inputmode="numeric">
                </div>
                <div id="verify-msg" class="auth-message" style="display:none"></div>
                <button id="verify-btn" class="btn-register">Підтвердити</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('verify-btn').addEventListener('click', async () => {
            const code = document.getElementById('verify-code').value.trim();
            const msg  = document.getElementById('verify-msg');
            const btn  = document.getElementById('verify-btn');

            if (code.length !== 6) {
                msg.textContent = 'Введіть коректний 6-значний код';
                msg.className   = 'auth-message error';
                msg.style.display = 'block';
                return;
            }

            btn.disabled = true; btn.textContent = 'Перевірка...';

            try {
                const res  = await fetch('/api/auth.php?action=verify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, code })
                });
                const data = await res.json();

                if (!res.ok) {
                    msg.textContent   = data.message || 'Невірний код';
                    msg.className     = 'auth-message error';
                    msg.style.display = 'block';
                    btn.disabled = false; btn.textContent = 'Підтвердити';
                    return;
                }

                Auth.saveSession(data.data);
                window.location.href = '/';
            } catch {
                msg.textContent   = "Помилка з'єднання";
                msg.className     = 'auth-message error';
                msg.style.display = 'block';
                btn.disabled = false; btn.textContent = 'Підтвердити';
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nickname = document.getElementById('nickname').value.trim();
        const email    = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirm  = document.getElementById('password_confirm').value;

        if (password !== confirm) { showMessage('Паролі не співпадають'); return; }

        setLoading(true);
        try {
            const res  = await fetch('/api/auth.php?action=register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, nickname, password })
            });
            const data = await res.json();

            if (!res.ok) { showMessage(data.message || 'Помилка реєстрації'); return; }

            showMessage('Код відправлено на пошту!', 'success');
            showVerificationModal(email, nickname);
        } catch {
            showMessage("Помилка з'єднання. Спробуйте ще раз");
        } finally {
            setLoading(false);
        }
    });
});