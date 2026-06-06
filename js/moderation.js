const MODERATE_URL = 'https://wmap.pp.ua/api/moderate.php';

let pendingMachines = [];
let map, markersLayer;

const pendingIcon = L.divIcon({
    className: 'custom-water-drop',
    html: `<svg width="34" height="44" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C15 0 0 16 0 25C0 33.284 6.716 40 15 40C23.284 40 30 33.284 30 25C30 16 15 0 15 0Z" fill="#E67E22"/>
        <path d="M9 31C7 29 6 26 6.5 23" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>`,
    iconSize: [34,44], iconAnchor: [17,44], popupAnchor: [0,-46]
});

const activeIcon = L.divIcon({
    className: 'custom-water-drop',
    html: `<svg width="40" height="52" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C15 0 0 16 0 25C0 33.284 6.716 40 15 40C23.284 40 30 33.284 30 25C30 16 15 0 15 0Z" fill="#0F4C82"/>
        <path d="M9 31C7 29 6 26 6.5 23" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>`,
    iconSize: [40,52], iconAnchor: [20,52], popupAnchor: [0,-54]
});

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([49.842957, 24.031111], 13);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri', maxZoom: 19
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);

    document.getElementById('btn-zoom-in') ?.addEventListener('click', () => map.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => map.zoomOut());
    document.querySelector('.control-btn[aria-label="Місцезнаходження"]')
        ?.addEventListener('click', () => map.locate({ setView: true, maxZoom: 16 }));
}

async function loadPending() {
    showSkeleton();

    let res;
    try {
        // ФІХ №5: Auth.fetch() — авто-refresh при 401, передає Authorization header
        res = await Auth.fetch(`${MODERATE_URL}?action=pending`);
    } catch (err) {
        showError('Мережева помилка: ' + err.message); return;
    }

    // ФІХ №6: Auth.logout() тепер async — використовуємо await
    if (res.status === 401) { await Auth.logout(); return; }
    if (res.status === 403) { showError('Доступ заборонено. Потрібна роль admin.'); return; }

    const rawText = await res.text();
    let json;
    try { json = JSON.parse(rawText); }
    catch {
        showError(`Сервер повернув не JSON (HTTP ${res.status}).`);
        console.error('[moderate] raw:', rawText.substring(0, 300));
        return;
    }

    const data = json.data ?? json.items ?? (Array.isArray(json) ? json : null);
    if (!json.success && data === null) {
        showError('Помилка API: ' + (json.error ?? json.message ?? 'невідома')); return;
    }

    pendingMachines = data || [];
    renderAll();
}

function renderAll()  { renderList(); renderMarkers(); updateCount(); }

function renderList() {
    const list = document.getElementById('request-list');
    list.innerHTML = '';
    if (!pendingMachines.length) {
        list.innerHTML = '<p class="empty-state">Немає нових запитів</p>'; return;
    }
    pendingMachines.forEach(m => list.appendChild(createCard(m)));
}

function createCard(m) {
    const el = document.createElement('article');
    el.className  = 'request-card';
    el.dataset.id = m.id;

    const lat = parseFloat(m.lat), lng = parseFloat(m.lng);

    el.innerHTML = `
        <div class="card-main-content">
            <div class="card-details">
                <h3>ID ${m.id}</h3>
                <p><span class="detail-label">Адреса:</span> ${m.address || '—'}</p>
                <p><span class="detail-label">Координати:</span> ${isNaN(lat)?'—':lat.toFixed(6)}, ${isNaN(lng)?'—':lng.toFixed(6)}</p>
                <p><span class="detail-label">Постачальник:</span> ${m.company || m.supplier_id || '—'}</p>
                ${m.description ? `<p><span class="detail-label">Опис:</span> ${m.description}</p>` : ''}
                <p class="card-date">${formatDate(m.created_at)}</p>
            </div>
            <div class="card-actions">
                <button class="btn btn-confirm">✓ Підтвердити</button>
                <button class="btn btn-reject">✕ Відхилити</button>
            </div>
        </div>
        <div class="card-image-placeholder">
            ${m.photo
        ? `<img src="${m.photo}" alt="Фото">`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                       fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                       <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                       <polyline points="21 15 16 10 5 21"/></svg>`}
        </div>`;

    el.addEventListener('click', (e) => {
        if (e.target.closest('.btn')) return;
        highlightCard(m.id);
        if (!isNaN(lat) && !isNaN(lng)) map.flyTo([lat, lng], 17, { duration: 0.8 });
    });
    el.querySelector('.btn-confirm').addEventListener('click', (e) => { e.stopPropagation(); moderate(m.id, 'approve', el); });
    el.querySelector('.btn-reject') .addEventListener('click', (e) => { e.stopPropagation(); moderate(m.id, 'reject',  el); });
    return el;
}

function renderMarkers() {
    markersLayer.clearLayers();
    pendingMachines.forEach(m => {
        const lat = parseFloat(m.lat), lng = parseFloat(m.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const marker = L.marker([lat, lng], { icon: pendingIcon });
        marker.machineId = m.id;
        marker.bindPopup(`
            <div class="mod-popup">
                <p class="mod-popup-id">ID ${m.id}</p>
                <p class="mod-popup-addr">${m.address || '—'}</p>
                ${m.photo ? `<img src="${m.photo}" class="mod-popup-img" alt="Фото">` : ''}
                <div class="mod-popup-actions">
                    <button class="btn btn-confirm btn-sm" onclick="moderateFromMap(${m.id},'approve')">✓ Так</button>
                    <button class="btn btn-reject  btn-sm" onclick="moderateFromMap(${m.id},'reject')">✕ Ні</button>
                </div>
            </div>`, { className: 'mod-leaflet-popup', minWidth: 200 });

        marker.on('click', () => { highlightCard(m.id); scrollToCard(m.id); });
        markersLayer.addLayer(marker);
    });
}

async function moderate(id, action, cardEl) {
    cardEl.querySelectorAll('.btn').forEach(b => b.disabled = true);
    cardEl.classList.add('card--loading');

    try {
        // ФІХ №5: Auth.fetch() — авто-refresh при 401
        const res  = await Auth.fetch(MODERATE_URL, {
            method: 'POST',
            body: JSON.stringify({ id, action })
        });
        const json = await res.json();

        if (!json.success) {
            cardEl.querySelectorAll('.btn').forEach(b => b.disabled = false);
            cardEl.classList.remove('card--loading');
            showToast('Помилка: ' + (json.error ?? json.message ?? 'невідома'), 'error');
            return;
        }
    } catch (err) {
        cardEl.querySelectorAll('.btn').forEach(b => b.disabled = false);
        cardEl.classList.remove('card--loading');
        showToast("Помилка з'єднання: " + err.message, 'error');
        return;
    }

    cardEl.classList.add(action === 'approve' ? 'card--approved' : 'card--rejected');
    setTimeout(() => {
        pendingMachines = pendingMachines.filter(m => m.id !== id);
        cardEl.remove();
        removeMarker(id);
        updateCount();
        if (!pendingMachines.length) {
            document.getElementById('request-list').innerHTML = '<p class="empty-state">Немає нових запитів 🎉</p>';
        }
    }, 380);
}

window.moderateFromMap = (id, action) => {
    const card = document.querySelector(`.request-card[data-id="${id}"]`);
    if (card) { map.closePopup(); moderate(id, action, card); }
};

function highlightCard(id) {
    document.querySelectorAll('.request-card').forEach(c => c.classList.remove('card--active'));
    document.querySelector(`.request-card[data-id="${id}"]`)?.classList.add('card--active');
    markersLayer.eachLayer(l => l.setIcon(l.machineId === id ? activeIcon : pendingIcon));
}

function scrollToCard(id) {
    document.querySelector(`.request-card[data-id="${id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function removeMarker(id) {
    const rem = [];
    markersLayer.eachLayer(l => { if (l.machineId === id) rem.push(l); });
    rem.forEach(l => markersLayer.removeLayer(l));
}

function updateCount() {
    const n = pendingMachines.length;
    document.getElementById('pending-count').textContent = `(${n})`;
    document.title = n > 0 ? `(${n}) Модерація` : 'Модерація';
}

function formatDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleDateString('uk-UA', {
        day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
}

function showSkeleton() {
    document.getElementById('request-list').innerHTML = Array(4).fill(`
        <article class="request-card skeleton-card">
            <div class="card-main-content">
                <div class="skeleton skeleton-line w60"></div>
                <div class="skeleton skeleton-line w100"></div>
                <div class="skeleton skeleton-line w80"></div>
                <div class="skeleton skeleton-line w70"></div>
                <div class="skeleton skeleton-btns"></div>
            </div>
            <div class="skeleton skeleton-img"></div>
        </article>`).join('');
}

function showError(msg) {
    document.getElementById('request-list').innerHTML = `<p class="error-state">⚠️ ${msg}</p>`;
}

function showToast(msg, type = 'info') {
    const t = Object.assign(document.createElement('div'), {
        className: `toast toast--${type}`,
        textContent: msg
    });
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('toast--show'), 10);
    setTimeout(() => { t.classList.remove('toast--show'); setTimeout(() => t.remove(), 300); }, 4000);
}

document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.isAdmin()) { window.location.href = '/'; return; }
    initMap();
    loadPending();
});