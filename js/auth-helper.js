const Auth = {
    getToken()    { return localStorage.getItem('token'); },
    getNickname() { return localStorage.getItem('nickname'); },
    getUserId()   { return parseInt(localStorage.getItem('user_id') || '0', 10); },
    getStatus()   { return localStorage.getItem('status'); },
    isLoggedIn()  { return !!this.getToken(); },
    isAdmin()     { return this.isLoggedIn() && this.getStatus() === 'admin'; },

    saveSession(data) {
        localStorage.setItem('token',    data.token    || '');
        localStorage.setItem('nickname', data.nickname || '');
        localStorage.setItem('user_id',  data.user_id  || '');
        localStorage.setItem('status',   data.status   || '');
        localStorage.setItem('email',    data.email    || '');
    },

    clearSession() {
        ['token', 'nickname', 'user_id', 'status', 'email'].forEach(k =>
            localStorage.removeItem(k)
        );
    },

    async refreshTokens() {
        try {
            const res  = await fetch('/api/auth.php?action=refresh', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            const data = await res.json();

            if (!res.ok) { this.clearSession(); return false; }

            localStorage.setItem('token', data.data.token);
            // ФІХ №4: Зберігаємо user_id з відповіді refresh
            if (data.data.user_id) localStorage.setItem('user_id', String(data.data.user_id));
            if (data.data.status)  localStorage.setItem('status',  data.data.status);
            return true;
        } catch { return false; }
    },

    async logout() {
        try {
            await fetch('/api/auth.php?action=logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch(e) { console.error("Помилка логауту", e); }

        this.clearSession();
        window.location.href = '/';
    },

    headers(extra = {}) {
        return {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${this.getToken()}`,
            ...extra
        };
    },

    // ФІХ №5: Централізований fetch з авто-refresh при 401
    async fetch(url, options = {}) {
        const makeRequest = () => fetch(url, {
            ...options,
            headers: { ...this.headers(), ...(options.headers || {}) },
            credentials: 'include'
        });

        let res = await makeRequest();

        if (res.status === 401) {
            const refreshed = await this.refreshTokens();
            if (!refreshed) {
                window.location.href = '/login';
                return res;
            }
            res = await makeRequest();
        }

        return res;
    }
};

window.Auth = Auth;