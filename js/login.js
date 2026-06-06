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
        box.className      = `auth-message ${type}`;
        box.textContent    = text;
        box.style.display  = 'block';
    }

    function setLoading(on) {
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled    = on;
        btn.textContent = on ? 'Завантаження...' : 'Увійти';
    }

    function show2FAModal(userId, nickname, status, email) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay-verify';
        overlay.innerHTML = `
            <div class="modal-verify-card">
                <h3>Двофакторна аутентифікація</h3>
                <p>Введіть код із вашого застосунку або email</p>
                <div class="input-group">
                    <input type="text" id="twofa-code" placeholder="Код"
                           maxlength="6" autocomplete="one-time-code" inputmode="numeric">
                </div>
                <div id="twofa-msg" class="auth-message" style="display:none"></div>
                <button id="twofa-btn" class="btn-register">Підтвердити</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('twofa-btn').addEventListener('click', async () => {
            const code = document.getElementById('twofa-code').value.trim();
            const msg  = document.getElementById('twofa-msg');
            const btn  = document.getElementById('twofa-btn');

            if (!code) {
                msg.textContent = 'Введіть код';
                msg.className   = 'auth-message error';
                msg.style.display = 'block';
                return;
            }

            btn.disabled = true; btn.textContent = 'Перевірка...';

            try {
                const res  = await fetch('/api/two_factor.php?action=verify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ user_id: userId, code })
                });
                const data = await res.json();

                if (!res.ok) {
                    msg.textContent   = data.message || 'Невірний код';
                    msg.className     = 'auth-message error';
                    msg.style.display = 'block';
                    btn.disabled = false; btn.textContent = 'Підтвердити';
                    return;
                }

                Auth.saveSession({ ...data.data, nickname, status, user_id: userId, email: email });
                window.location.href = '/';
            } catch {
                msg.textContent = "Помилка з'єднання";
                msg.className   = 'auth-message error';
                msg.style.display = 'block';
                btn.disabled = false; btn.textContent = 'Підтвердити';
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res  = await fetch('/api/auth.php?action=login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    email:    document.getElementById('email').value.trim(),
                    password: document.getElementById('password').value
                })
            });
            const data = await res.json();

            if (!res.ok) { showMessage(data.message || 'Помилка входу'); return; }

            const userEmail = document.getElementById('email').value.trim();

            if (data.data.requires_2fa) {
                show2FAModal(data.data.user_id, data.data.nickname, data.data.status, userEmail);
                return;
            }

            Auth.saveSession({ ...data.data, email: userEmail });
            window.location.href = '/';
        } catch {
            showMessage("Помилка з'єднання. Спробуйте ще раз");
        } finally {
            setLoading(false);
        }
    });
});