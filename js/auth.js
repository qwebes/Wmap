document.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = Auth.isLoggedIn();
    const nickname = Auth.getNickname();

    const loginBtn = document.querySelector('.btn_login');
    const userStatus = document.querySelector('.user-status');

    if (isLoggedIn) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (userStatus) userStatus.style.display = 'flex';
    } else {
        if (loginBtn) loginBtn.style.display = '';
        if (userStatus) userStatus.style.display = 'none';
    }

    const menuBtn = document.querySelector('.menu-btn');
    const navMenu = document.querySelector('.sidebar-nav');
    const closeBtn = document.getElementById('close-menu-btn');

    if (menuBtn) {
        if (isLoggedIn) {
            menuBtn.style.display = '';
            menuBtn.onclick = () => navMenu.classList.toggle('is-open');
        } else {
            menuBtn.style.display = 'none';
        }
    }

    if (closeBtn) {
        closeBtn.onclick = () => navMenu.classList.remove('is-open');
    }

    const sidebarNickname = document.querySelector('.sidebar-profile');
    if (sidebarNickname && nickname) {
        sidebarNickname.textContent = nickname;
    }

    document.querySelectorAll('.nickname-text, .nickname-row span, .nickname-display').forEach(el => {
        if (nickname) el.textContent = nickname;
    });

    const logoutLink = document.querySelector('.logout-link');
    if (logoutLink) {
        if (isLoggedIn) {
            logoutLink.style.display = '';
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                Auth.logout();
            });
        } else {
            logoutLink.style.display = 'none';
        }
    }

    const sidebarLoginLink = document.querySelector('.sidebar-footer .login-link');
    if (sidebarLoginLink) {
        sidebarLoginLink.style.display = isLoggedIn ? 'none' : '';
    }

    const modLink = document.getElementById('mod-link');
    if (modLink) {
        modLink.style.display = Auth.isAdmin() ? '' : 'none';
    }

    const modalAdd = document.getElementById('modal-add-machine');
    const openAddBtn = document.getElementById('open-add-machine');
    const closeAddBtn = document.getElementById('close-modal-btn');

    if (openAddBtn) {
        openAddBtn.onclick = (e) => {
            e.preventDefault();
            if (!isLoggedIn) { window.location.href = '/login'; return; }
            modalAdd.style.display = 'flex';
            navMenu.classList.remove('is-open');
        };
    }
    if (closeAddBtn) {
        closeAddBtn.onclick = () => { modalAdd.style.display = 'none'; };
    }

    const modalSettings = document.getElementById('modal-settings');
    const openSettingsBtn = document.getElementById('open-settings');
    const closeSettingsBtn = document.querySelector('.settings-top-nav .back-link');

    if (openSettingsBtn) {
        openSettingsBtn.onclick = (e) => {
            e.preventDefault();
            if (!isLoggedIn) { window.location.href = '/login'; return; }
            modalSettings.style.display = 'flex';
            navMenu.classList.remove('is-open');
        };
    }
    if (closeSettingsBtn) {
        closeSettingsBtn.onclick = (e) => {
            e.preventDefault();
            modalSettings.style.display = 'none';
        };
    }

    window.addEventListener('click', (e) => {
        if (modalAdd && e.target === modalAdd) modalAdd.style.display = 'none';
        if (modalSettings && e.target === modalSettings) modalSettings.style.display = 'none';
    });

    document.querySelectorAll('.eye-icon-inside').forEach(eye => {
        eye.replaceWith(eye.cloneNode(true));
    });

    document.querySelectorAll('.eye-icon-inside').forEach(eye => {
        eye.addEventListener('click', function() {
            const wrapper = this.closest('.input-group') || this.closest('.input-container') || this.parentElement;
            const input = wrapper ? wrapper.querySelector('input') : null;

            if (input) {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';

                this.style.opacity = isPassword ? '0.5' : '1';
            } else {
                console.error("Поле пароля не знайдено для цієї іконки!");
            }
        });
    });

    const photoInput = document.getElementById('machine-photo-input');
    const fileStatus = document.querySelector('.file-status-info');
    if (photoInput && fileStatus) {
        photoInput.addEventListener('change', () => {
            fileStatus.textContent = photoInput.files[0]?.name || 'Файл не вибрано';
        });
    }
});