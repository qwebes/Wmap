document.addEventListener('DOMContentLoaded', () => {

    const backButton = document.querySelector('.back-link');
    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (document.referrer && document.referrer.includes(window.location.hostname)) {
                window.history.back();
            } else {
                window.location.href = 'index.html';
            }
        });
    }

    const isRecoveryPage = !!document.getElementById('email');
    const isResetPage    = !!document.getElementById('password');

    if (isRecoveryPage) initRecovery();
    if (isResetPage)    initReset();

    function initRecovery() {
        const form       = document.querySelector('form');
        const emailInput = document.getElementById('email');
        if (!form || !emailInput) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = emailInput.value.trim();
            if (!isValidEmail(email)) {
                showNotification('Введіть коректну електронну адресу.', 'error');
                return;
            }

            const btn = form.querySelector('button[type="submit"]');
            setLoading(btn, true, 'Надсилання...');

            try {
                const res  = await fetch('/api/password.php?action=forgot', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ email }),
                });
                const data = await res.json();

                if (res.ok && (data.status === 'success' || data.success === true)) {
                    showNotification('Посилання відправлено на вашу пошту.', 'success');
                    form.innerHTML = `
                        <div style="text-align: center; margin-top: 20px;">
                            <p style="font-size: 16px; color: #333; line-height: 1.5;">
                                Ми надіслали посилання для відновлення паролю на <br><b>${email}</b>.
                            </p>
                            <p style="font-size: 14px; color: #666; margin-top: 15px;">
                                Перейдіть за посиланням у листі, щоб створити новий пароль. Якщо листа немає, перевірте папку "Спам".
                            </p>
                        </div>
                    `;
                } else {
                    showNotification(data.message || 'Помилка. Спробуйте ще раз.', 'error');
                    setLoading(btn, false, 'Змінити пароль');
                }
            } catch {
                showNotification("Помилка мережі. Перевірте з'єднання.", 'error');
                setLoading(btn, false, 'Змінити пароль');
            }
        });
    }

    function initReset() {
        const form          = document.querySelector('form');
        const passwordInput = document.getElementById('password');
        const confirmInput  = document.getElementById('new-password');
        if (!form || !passwordInput || !confirmInput) return;

        const params = new URLSearchParams(window.location.search);
        const email  = params.get('email') || '';
        const token  = params.get('token') || '';

        if (!email || !token) {
            // ФІХ: Прибрано console.log з URL (дебаг-артефакт)
            showNotification('Помилка URL! Бракує email або token.', 'error');
            setTimeout(() => window.location.href = 'index.html', 4000);
            return;
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const password = passwordInput.value.trim();
            const confirm  = confirmInput.value.trim();

            if (!validatePassword(password)) {
                showNotification('Пароль має містити щонайменше 8 символів, велику літеру та цифру.', 'error');
                return;
            }

            if (password !== confirm) {
                showNotification('Паролі не співпадають.', 'error');
                return;
            }

            const btn = form.querySelector('button[type="submit"]');
            setLoading(btn, true, 'Збереження...');

            try {
                const res  = await fetch('/api/password.php?action=reset', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ email, token, new_password: password }),
                });
                const data = await res.json();

                if (res.ok && (data.status === 'success' || data.success === true)) {
                    showNotification('Пароль успішно змінено!', 'success');

                    let secondsLeft = 3;
                    btn.disabled    = true;
                    btn.textContent = `Перехід на сторінку входу (${secondsLeft}с)...`;

                    const countdown = setInterval(() => {
                        secondsLeft--;
                        if (secondsLeft > 0) {
                            btn.textContent = `Перехід на сторінку входу (${secondsLeft}с)...`;
                        } else {
                            clearInterval(countdown);
                            window.location.href = 'login';
                        }
                    }, 1000);

                } else {
                    showNotification(data.message || 'Щось пішло не так. Спробуйте ще раз.', 'error');
                    setLoading(btn, false, 'Змінити пароль');
                }
            } catch {
                showNotification("Помилка мережі. Перевірте з'єднання.", 'error');
                setLoading(btn, false, 'Змінити пароль');
            }
        });
    }

    document.querySelectorAll('.eye-icon-inside').forEach(icon => {
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            // ФІХ: Прибрано console.log("input", input)
            if (input) {
                input.type         = input.type === 'password' ? 'text' : 'password';
                this.style.opacity = input.type === 'text' ? '0.5' : '1';
            }
        });
    });

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validatePassword(pwd) {
        return pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd);
    }

    function setLoading(btn, isLoading, label = '') {
        if (!btn) return;
        btn.disabled    = isLoading;
        btn.textContent = label;
    }

    function showNotification(message, type = 'success') {
        document.querySelector('.wmap-notification')?.remove();

        const el = document.createElement('div');
        el.className = 'wmap-notification';
        el.textContent = message;

        Object.assign(el.style, {
            position:     'fixed',
            top:          '20px',
            left:         '50%',
            transform:    'translateX(-50%)',
            padding:      '12px 24px',
            borderRadius: '8px',
            fontSize:     '14px',
            fontWeight:   '500',
            zIndex:       '99999',
            boxShadow:    '0 4px 16px rgba(0,0,0,0.15)',
            opacity:      '1',
            transition:   'opacity 0.3s ease',
            background:   type === 'success' ? '#3b82f6' : '#ef4444',
            color:        '#fff',
            maxWidth:     '90vw',
            textAlign:    'center',
            whiteSpace:   'pre-wrap',
        });

        document.body.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, 4000);
    }
});