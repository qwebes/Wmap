document.addEventListener('DOMContentLoaded', () => {
    window.showNotification = function(message, type = 'success') {
        document.querySelector('.wmap-notification')?.remove();
        const el = document.createElement('div');
        el.className = 'wmap-notification';
        el.textContent = message;
        Object.assign(el.style, {
            position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
            padding: '12px 24px', borderRadius: '8px', fontSize: '14px', zIndex: '99999',
            background: type === 'success' ? '#22c55e' : '#ef4444', color: '#fff', transition: 'opacity 0.3s'
        });
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
    };

    const userId         = Auth.getUserId();
    const currentEmail   = localStorage.getItem('email');
    const currentNickname = localStorage.getItem('nickname');

    let is2faCurrentlyEnabled = false;

    const emailInput       = document.getElementById('settings-email');
    const nicknameDisplay  = document.querySelector('.nickname-display');
    const twoFaToggle      = document.getElementById('settings-2fa-toggle');
    const modalSettings    = document.getElementById('modal-settings');
    const oldPassInput     = document.getElementById('settings-old-pass');
    const newPassInput     = document.getElementById('settings-new-pass');
    const confirmPassInput = document.getElementById('settings-confirm-pass');
    const btnSaveSettings  = document.querySelector('.btn-save-changes');

    if (emailInput && currentEmail) {
        emailInput.value    = currentEmail;
        emailInput.readOnly = true;
        emailInput.style.color = "#666";
    }

    if (nicknameDisplay && currentNickname) {
        nicknameDisplay.textContent = currentNickname;
    }

    document.getElementById('open-settings')?.addEventListener('click', () => {
        load2FAStatus();
    });

    // ФІХ №2: Auth.fetch() для всіх захищених запитів — передає Authorization + авто-refresh
    async function load2FAStatus() {
        if (!userId) return;
        try {
            const res = await Auth.fetch('/api/two_factor.php?action=status', {
                method: 'POST',
                body: JSON.stringify({ user_id: userId })
            });
            const responseData = await res.json();

            if (responseData.success === true || responseData.status === 'success') {
                const rawEnabled = responseData.data ? responseData.data.enabled : responseData.enabled;
                is2faCurrentlyEnabled = (rawEnabled === true || rawEnabled === 1 || rawEnabled === "1");
                if (twoFaToggle) twoFaToggle.checked = is2faCurrentlyEnabled;
            }
        } catch (e) {
            console.error("Не вдалося завантажити статус 2FA", e);
        }
    }

    const modal2faSetup   = document.getElementById('modal-2fa-setup');
    const modal2faDisable = document.getElementById('modal-2fa-disable');
    const qrCodeImg       = document.getElementById('qr-code-img');

    if (twoFaToggle) {
        twoFaToggle.addEventListener('click', async (e) => {
            e.preventDefault();

            if (!is2faCurrentlyEnabled) {
                try {
                    const res = await Auth.fetch('/api/two_factor.php?action=setup', {
                        method: 'POST',
                        body: JSON.stringify({ user_id: userId })
                    });
                    const responseData = await res.json();

                    if (responseData.success === true || responseData.status === 'success') {
                        const dataPayload = responseData.data || responseData;
                        const qrUrl = dataPayload.qr_code_url;

                        qrCodeImg.src = qrUrl;

                        let rawAuthLink = dataPayload.otpauth_url || dataPayload.setup_uri;

                        if (!rawAuthLink && qrUrl.includes('chl=')) {
                            try {
                                const urlObj = new URL(qrUrl);
                                rawAuthLink = decodeURIComponent(urlObj.searchParams.get('chl'));
                            } catch (e) {
                                console.warn('Не вдалося витягнути otpauth посилання з QR');
                            }
                        }

                        // Вішаємо подію кліку для відкриття додатку на телефоні
                        if (rawAuthLink && rawAuthLink.startsWith('otpauth://')) {
                            qrCodeImg.style.cursor = 'pointer';
                            qrCodeImg.onclick = () => { window.location.href = rawAuthLink; };
                        } else {
                            qrCodeImg.style.cursor = 'default';
                            qrCodeImg.onclick = null;
                        }

                        // ─────────────────────────────────────────────────────────────
                        // ВИТЯГУЄМО СЕКРЕТНИЙ КЛЮЧ ДЛЯ РУЧНОГО ВВОДУ
                        // ─────────────────────────────────────────────────────────────
                        // Якщо бекенд віддає ключ напряму, беремо його. Якщо ні - парсимо з посилання.
                        let secretKey = dataPayload.secret || '';

                        if (!secretKey && rawAuthLink) {
                            // Шукаємо параметр secret= у посиланні otpauth://
                            const match = rawAuthLink.match(/[?&]secret=([^&]+)/);
                            if (match && match[1]) {
                                secretKey = match[1];
                            }
                        }

                        // Виводимо ключ в HTML
                        const secretEl = document.getElementById('manual-2fa-secret');
                        if (secretEl) {
                            secretEl.textContent = secretKey || 'Не знайдено';
                        }
                        // ─────────────────────────────────────────────────────────────

                        modal2faSetup.style.display = 'flex';
                    }
                } catch (e) {
                    showNotification('Помилка генерації QR-коду', 'error');
                }
            } else {
                document.getElementById('disable-2fa-password').value = '';
                modal2faDisable.style.display = 'flex';
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // ЛОГІКА КНОПКИ КОПІЮВАННЯ СЕКРЕТНОГО КЛЮЧА
    // ─────────────────────────────────────────────────────────────
    const copySecretBtn = document.getElementById('copy-secret-btn');
    if (copySecretBtn) {
        copySecretBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const secretEl = document.getElementById('manual-2fa-secret');
            const secretText = secretEl ? secretEl.textContent : '';

            if (secretText && secretText !== 'Не знайдено') {
                navigator.clipboard.writeText(secretText).then(() => {
                    showNotification('Ключ скопійовано в буфер обміну', 'success');
                }).catch(() => {
                    showNotification('Не вдалося скопіювати', 'error');
                });
            }
        });
    }

    document.getElementById('confirm-2fa-setup-btn')?.addEventListener('click', async () => {
        const code = document.getElementById('setup-2fa-code').value;
        if (code.length !== 6) {
            showNotification('Введіть 6-значний код', 'error');
            return;
        }

        try {
            // ФІХ №2: Auth.fetch() замість fetch()
            const res = await Auth.fetch('/api/two_factor.php?action=enable', {
                method: 'POST',
                body: JSON.stringify({ user_id: userId, code })
            });
            const responseData = await res.json();

            if (res.ok && (responseData.success === true || responseData.status === 'success')) {
                showNotification('2FA успішно увімкнено!', 'success');
                modal2faSetup.style.display = 'none';
                document.getElementById('setup-2fa-code').value = '';
                is2faCurrentlyEnabled = true;
                twoFaToggle.checked   = true;
            } else {
                showNotification(responseData.message || 'Невірний код', 'error');
            }
        } catch (e) {
            showNotification('Помилка сервера', 'error');
        }
    });

    document.getElementById('confirm-2fa-disable-btn')?.addEventListener('click', async () => {
        const pass = document.getElementById('disable-2fa-password').value;
        if (!pass) {
            showNotification('Введіть пароль', 'error');
            return;
        }

        const btn = document.getElementById('confirm-2fa-disable-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Перевірка...';
        btn.disabled    = true;

        try {
            // ФІХ №2: Auth.fetch() замість fetch()
            const res = await Auth.fetch('/api/two_factor.php?action=disable', {
                method: 'POST',
                body: JSON.stringify({ user_id: userId, password: pass })
            });
            const responseData = await res.json();

            if (res.ok && (responseData.success === true || responseData.status === 'success')) {
                showNotification('2FA вимкнено', 'success');
                modal2faDisable.style.display = 'none';
                is2faCurrentlyEnabled = false;
                twoFaToggle.checked   = false;
            } else {
                showNotification(responseData.message || 'Невірний пароль', 'error');
            }
        } catch (e) {
            showNotification('Помилка сервера', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled    = false;
        }
    });

    document.getElementById('close-2fa-setup-btn')  ?.addEventListener('click', () => modal2faSetup.style.display   = 'none');
    document.getElementById('close-2fa-disable-btn') ?.addEventListener('click', () => modal2faDisable.style.display = 'none');

    // document.querySelectorAll('.eye-icon-inside').forEach(icon => {
    //     icon.style.cursor = 'pointer';
    //     icon.addEventListener('click', function() {
    //         const input = this.parentElement.querySelector('input');
    //         if (input) {
    //             input.type         = input.type === 'password' ? 'text' : 'password';
    //             this.style.opacity = input.type === 'text' ? '0.5' : '1';
    //         }
    //     });
    // });

    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', async (e) => {
            e.preventDefault();

            const oldPass    = oldPassInput?.value;
            const newPass    = newPassInput?.value;
            const confirmPass = confirmPassInput?.value;

            if (oldPass || newPass || confirmPass) {
                if (!oldPass || !newPass || !confirmPass) {
                    showNotification('Заповніть всі поля для зміни паролю', 'error');
                    return;
                }
                if (newPass !== confirmPass) {
                    showNotification('Нові паролі не співпадають', 'error');
                    return;
                }
                if (newPass.length < 8) {
                    showNotification('Новий пароль має бути не коротшим за 8 символів', 'error');
                    return;
                }

                const originalText = btnSaveSettings.textContent;
                btnSaveSettings.textContent = 'Збереження...';
                btnSaveSettings.disabled    = true;

                try {
                    // ФІХ №2: Auth.fetch() замість fetch()
                    const res = await Auth.fetch('/api/password.php?action=change', {
                        method: 'POST',
                        body: JSON.stringify({
                            email:        currentEmail,
                            old_password: oldPass,
                            new_password: newPass
                        })
                    });
                    const data = await res.json();

                    if (res.ok && (data.success === true || data.status === 'success')) {
                        showNotification('Пароль успішно змінено!', 'success');
                        oldPassInput.value     = '';
                        newPassInput.value     = '';
                        confirmPassInput.value = '';
                    } else {
                        showNotification(data.message || 'Помилка зміни паролю', 'error');
                    }
                } catch (err) {
                    showNotification("Помилка з'єднання з сервером", 'error');
                } finally {
                    btnSaveSettings.textContent = originalText;
                    btnSaveSettings.disabled    = false;
                }
            } else {
                showNotification('Налаштування збережено', 'success');
                setTimeout(() => modalSettings.style.display = 'none', 1000);
            }
        });
    }

    const triggerDeleteBtn   = document.querySelector('.settings-action-footer .btn-delete-acc');
    const modalDeleteAccount = document.getElementById('modal-delete-account');

    if (triggerDeleteBtn) {
        triggerDeleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('delete-account-password').value = '';
            modalDeleteAccount.style.display = 'flex';
        });
    }

    document.getElementById('confirm-delete-account-btn')?.addEventListener('click', async () => {
        const pass = document.getElementById('delete-account-password').value;
        if (!pass) {
            showNotification('Введіть пароль для підтвердження', 'error');
            return;
        }

        const btn = document.getElementById('confirm-delete-account-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Видалення...';
        btn.disabled    = true;

        try {
            // ФІХ №3: Auth.fetch() — додає Authorization header + credentials
            const res = await Auth.fetch('/api/delete_account.php', {
                method: 'POST',
                body: JSON.stringify({ user_id: userId, password: pass })
            });
            const data = await res.json();

            if (res.ok && (data.success === true || data.status === 'success')) {
                showNotification('Акаунт видалено. Прощавайте!', 'success');
                modalDeleteAccount.style.display = 'none';
                // ФІХ: Auth.logout() інвалідує сесію на сервері, потім чистить localStorage
                await Auth.logout();
            } else {
                showNotification(data.message || 'Невірний пароль', 'error');
            }
        } catch (e) {
            showNotification('Помилка сервера', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled    = false;
        }
    });

    document.getElementById('close-delete-account-btn')?.addEventListener('click', () => {
        modalDeleteAccount.style.display = 'none';
    });
});