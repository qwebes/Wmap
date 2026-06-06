const FAV_API = 'https://wmap.pp.ua/api/favorites.php';

async function loadFavorites() {
    const grid = document.getElementById('favorites-grid');

    if (!Auth.isLoggedIn()) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">♡</div>
                <p>Увійдіть, щоб переглядати улюблені автомати</p>
                <a href="login" class="btn-login-cta">Увійти</a>
            </div>`;
        return;
    }
    
    grid.innerHTML = '<div class="fav-skeleton"></div>'.repeat(3);

    let rawText;
    try {
        const res = await fetch(`${FAV_API}?action=get_list`, {
            method:  'POST',
            headers: Auth.headers(),
            body:    JSON.stringify({ user_id: Auth.getUserId() })
        });
        rawText = await res.text();

        if (res.status === 401 || res.status === 403) {
            Auth.logout(); return;
        }
    } catch (err) {
        grid.innerHTML = `<div class="empty-state error-state">⚠️ Мережева помилка: ${err.message}</div>`;
        return;
    }

    let json;
    try { json = JSON.parse(rawText); }
    catch {
        grid.innerHTML = `<div class="empty-state error-state">⚠️ Сервер повернув не JSON. Перевірте консоль.</div>`;
        console.error('[fav] raw:', rawText.substring(0, 300));
        return;
    }

    const list = json.favorites ?? json.data ?? (Array.isArray(json) ? json : []);
    grid.innerHTML = '';

    if (!list.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">♡</div>
                <p>У вас ще немає улюблених автоматів</p>
                <a href="index" class="btn-login-cta">На карту</a>
            </div>`;
        return;
    }

    list.forEach(item => grid.appendChild(createCard(item)));
}

function createCard(item) {
    const card = document.createElement('div');
    card.className  = 'card';
    card.dataset.id = item.avtomat_id;

    const photoUrl = item.photo
        ? (item.photo.startsWith('http') ? item.photo : `https://wmap.pp.ua/${item.photo}`)
        : null;

    const lat = parseFloat(item.latitude);
    const lng = parseFloat(item.longitude);
    const mapsUrl = (!isNaN(lat) && !isNaN(lng))
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
        : '#';

    card.innerHTML = `
        <div class="card-header">
            <h3>${item.address || 'Адреса не вказана'}</h3>
            <button class="heart-btn" title="Видалити з улюблених">
                <img src="/icons/Vector (17).svg" alt="favorite" class="heart-icon-img">
            </button>
        </div>
        <div class="card-content">
            <div class="card-info">
                <p class="supplier">
                    Постачальник:<br>
                    <strong>${item.company_name || '—'}</strong>
                </p>
                ${item.description ? `<p class="desc">${item.description}</p>` : ''}
                <a href="${mapsUrl}" target="_blank" rel="noopener" class="route-btn">
                    <span class="icon-wrapper">
                        <img src="/icons/Vector (20).svg" alt="arrow" class="icon-button">
                    </span>
                    Маршрут
                </a>
            </div>
            <div class="card-image">
                ${photoUrl
        ? `<img src="${photoUrl}" alt="Фото автомата">`
        : `<div class="no-photo">Немає<br>фото</div>`}
            </div>
        </div>`;

    card.querySelector('.heart-btn').addEventListener('click', async () => {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity    = '0';
        card.style.transform  = 'scale(0.9)';

        try {
            await fetch(`${FAV_API}?action=toggle`, {
                method:  'POST',
                headers: Auth.headers(),
                body:    JSON.stringify({ user_id: Auth.getUserId(), avtomat_id: item.avtomat_id, add: false })
            });
        } catch (err) {
            console.error('[fav toggle]', err);
            card.style.opacity   = '1';
            card.style.transform = 'none';
            return;
        }

        setTimeout(() => {
            card.remove();
            const grid = document.getElementById('favorites-grid');
            if (!grid.querySelector('.card')) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">♡</div>
                        <p>У вас ще немає улюблених автоматів</p>
                        <a href="index" class="btn-login-cta">На карту</a>
                    </div>`;
            }
        }, 300);
    });

    return card;
}

document.addEventListener('DOMContentLoaded', loadFavorites);