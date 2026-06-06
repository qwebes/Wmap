document.addEventListener('DOMContentLoaded', () => {

    const isLoggedIn = Auth.isLoggedIn();
    const nickname   = Auth.getNickname();
    const isAdmin    = Auth.isAdmin();

    const loginBtn   = document.querySelector('.btn_login');
    const userStatus = document.querySelector('.user-status');

    if (isLoggedIn) {
        if (loginBtn)   loginBtn.style.display   = 'none';
        if (userStatus) userStatus.style.display = 'flex';
    } else {
        if (loginBtn)   loginBtn.style.display   = '';
        if (userStatus) userStatus.style.display = 'none';
    }

    const modLink = document.getElementById('mod-link');
    if (modLink) {
        modLink.style.display = isAdmin ? 'flex' : 'none';
    }

    const menuBtn  = document.querySelector('.menu-btn');
    const navMenu  = document.querySelector('.sidebar-nav');
    const closeBtn = document.getElementById('close-menu-btn');

    if (menuBtn) {
        if (isLoggedIn) {
            menuBtn.style.display = '';
            menuBtn.addEventListener('click', () => navMenu.classList.add('is-open'));
        } else {
            menuBtn.style.display = 'none';
        }
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => navMenu.classList.remove('is-open'));
    }

    const sidebarNickname = document.querySelector('.sidebar-profile');
    if (sidebarNickname && nickname) {
        sidebarNickname.textContent = nickname;
    }

    document.querySelectorAll('.nickname-text, .nickname-row span').forEach(el => {
        if (nickname) el.textContent = nickname;
    });

    const logoutLink = document.querySelector('.logout-link');
    if (logoutLink) {
        if (isLoggedIn) {
            logoutLink.style.display = '';
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                // ФІХ: Auth.logout() замість localStorage.clear() — інвалідує токени на сервері
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

    const modalAdd    = document.getElementById('modal-add-machine');
    const openAddBtn  = document.getElementById('open-add-machine');
    const closeAddBtn = document.getElementById('close-modal-btn');

    if (openAddBtn) {
        openAddBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!isLoggedIn) { window.location.href = '/login'; return; }
            modalAdd.style.display = 'flex';
            navMenu.classList.remove('is-open');
        });
    }
    if (closeAddBtn) {
        closeAddBtn.addEventListener('click', () => {
            modalAdd.style.display = 'none';
        });
    }

    const modalSettings    = document.getElementById('modal-settings');
    const openSettingsBtn  = document.getElementById('open-settings');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!isLoggedIn) { window.location.href = '/login'; return; }
            modalSettings.style.display = 'flex';
            navMenu.classList.remove('is-open');
        });
    }
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            modalSettings.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (modalAdd && e.target === modalAdd)           modalAdd.style.display = 'none';
        if (modalSettings && e.target === modalSettings) modalSettings.style.display = 'none';
    });

    document.querySelectorAll('.eye-toggle').forEach(eye => {
        eye.addEventListener('click', () => {
            const input = eye.previousElementSibling;
            if (!input) return;
            input.type = input.type === 'password' ? 'text' : 'password';
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