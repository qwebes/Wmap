document.addEventListener('DOMContentLoaded', () => {

    const lvivCoords = [49.842957, 24.031111];
    const initialZoom = 13;
    let userLatLng = null;
    let favoriteIds = new Set();
    let myRatings = {};

    const map = L.map('map', { zoomControl: false }).setView(lvivCoords, initialZoom);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 16, { animate: false }),
            () => {},
            { timeout: 5000, maximumAge: 60000 }
        );
    }

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri', maxZoom: 19
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);

    const waterDropSVG = `
        <svg width="34" height="44" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 0C15 0 0 16 0 25C0 33.284 6.716 40 15 40C23.284 40 30 33.284 30 25C30 16 15 0 15 0Z" fill="#00509f"/>
            <path d="M9 31C7 29 6 26 6.5 23" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        </svg>`;

    const waterMarkerIcon = L.divIcon({
        className: 'custom-water-drop',
        html: waterDropSVG,
        iconSize: [34,44], iconAnchor: [17,44], popupAnchor: [0,-48]
    });

    const userIcon = L.divIcon({
        className: 'user-location-dot',
        html: `<div class="user-dot-inner"></div>`,
        iconSize: [20,20], iconAnchor: [10,10]
    });

    let userMarker = null;

    function setUserLocation(lat, lng) {
        userLatLng = L.latLng(lat, lng);
        if (userMarker) userMarker.setLatLng(userLatLng);
        else userMarker = L.marker(userLatLng, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    }

    async function init() {
        await Promise.allSettled([
            new Promise(resolve => {
                if (!navigator.geolocation) { resolve(); return; }
                navigator.geolocation.getCurrentPosition(
                    (pos) => { setUserLocation(pos.coords.latitude, pos.coords.longitude); resolve(); },
                    () => resolve(),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
                );
            }),
            loadFavoriteIds()
        ]);
        window.loadMarkers?.();
    }

    async function loadFavoriteIds() {
        if (!window.Auth?.isLoggedIn()) return;
        try {
            const res  = await fetch('https://wmap.pp.ua/api/favorites.php?action=get_ids', {
                method:  'POST',
                headers: Auth.headers(),
                body:    JSON.stringify({ user_id: Auth.getUserId() })
            });
            const json = await res.json();
            const ids  = json.favorite_ids ?? json.data ?? [];
            favoriteIds = new Set(ids.map(Number));
        } catch (e) { console.error('[map] loadFavoriteIds:', e); }
    }

    init();

    const sheet        = document.getElementById('bottom-sheet');
    const sheetOverlay = document.getElementById('bottom-sheet-overlay');
    const sheetClose   = document.getElementById('bottom-sheet-close');
    const sheetBody    = document.getElementById('bottom-sheet-body');

    function openSheet(html) {
        sheetBody.innerHTML = html;
        sheet.classList.add('is-open');
        sheetOverlay.classList.add('is-visible');
        initInlineStars(sheetBody);
        initLikeButton(sheetBody);
    }

    function closeSheet() {
        sheet.classList.remove('is-open');
        sheetOverlay.classList.remove('is-visible');
    }

    sheetClose?.addEventListener('click', closeSheet);
    sheetOverlay?.addEventListener('click', closeSheet);

    let touchStartY = 0;
    sheet?.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
    sheet?.addEventListener('touchend',   e => { if (e.changedTouches[0].clientY - touchStartY > 60) closeSheet(); }, { passive: true });

    map.on('popupopen', (e) => {
        const node = e.popup?.getElement?.();
        if (node) { initInlineStars(node); initLikeButton(node); }
    });

    map.on('popupclose', () => {
        document.querySelectorAll('.inline-stars').forEach(c => delete c.dataset.initialized);
    });

    function initInlineStars(container) {
        container.querySelectorAll('.inline-stars').forEach(sc => {
            if (sc.dataset.initialized) return;
            sc.dataset.initialized = 'true';
            const machineId = Number(sc.dataset.id);
            const stars = sc.querySelectorAll('.inline-star');
            let saved = 0;

            stars.forEach(star => {
                const val = +star.dataset.value;

                star.addEventListener('mouseenter', () => stars.forEach(s => s.classList.toggle('hovered', +s.dataset.value <= val)));
                star.addEventListener('mouseleave', () => stars.forEach(s => s.classList.remove('hovered')));

                star.addEventListener('click', async () => {
                    if (!window.Auth?.isLoggedIn()) {
                        showHeartToast('Увійдіть, щоб поставити оцінку', 'error');
                        return;
                    }

                    saved = val;
                    myRatings[machineId] = saved;
                    stars.forEach(s => s.classList.toggle('selected', +s.dataset.value <= saved));

                    try {
                        const res = await fetch('https://wmap.pp.ua/api/rate.php', {
                            method: 'POST',
                            headers: Auth.headers(),
                            body: JSON.stringify({
                                user_id: Auth.getUserId(),
                                machine_id: machineId,
                                rating: saved
                            })
                        });

                        const responseData = await res.json();

                        if (res.ok && responseData.status === 'success') {
                            showHeartToast('Оцінку успішно збережено!', 'success');
                        } else {
                            const errorMsg = responseData.message || responseData.error || 'Невідома помилка';
                            console.error('Деталі помилки сервера:', responseData);
                            showHeartToast(`Помилка: ${errorMsg}`, 'error');
                        }
                    } catch (e) {
                        console.error('Помилка запиту оцінки:', e);
                        showHeartToast('Помилка з\'єднання з сервером', 'error');
                    }
                });
            });
        });
    }

    function getStatusIndicator(m) {
        if (!m.last_report_date) {
            return '<div style="color: #7f8c8d; font-size: 0.9em; margin: 4px 0;">⚪ Стан невідомий (немає відгуків)</div>';
        }

        const lastDate = new Date(m.last_report_date.replace(/-/g, '/'));
        const now = new Date();
        const hoursSinceLast = (now - lastDate) / (1000 * 60 * 60);

        const lastStatus = m.last_status !== null ? parseInt(m.last_status) : null;
        const prevStatus = m.prev_status !== null ? parseInt(m.prev_status) : null;

        if (lastStatus === 0 && prevStatus === 0) {
            return `<div style="color: #c0392b; font-weight: bold; font-size: 0.95em; margin: 4px 0;">🔴 Не працює / Немає води</div>`;
        }

        if (lastStatus === 0) {
            return `<div style="color: #f39c12; font-size: 0.9em; margin: 4px 0;">🟡 Є скарга на несправність <small>(чекає підтвердження)</small></div>`;
        }

        if (lastStatus === 1) {
            if (hoursSinceLast > 72) {
                const dateFormatted = lastDate.toLocaleDateString('uk-UA', { month: 'short', day: 'numeric' });
                return `<div style="color: #e67e22; font-size: 0.9em; margin: 4px 0;">🟠 Давно не підтверджувався<br><small>(останній звіт: ${dateFormatted})</small></div>`;
            } else {
                return `<div style="color: #27ae60; font-weight: bold; font-size: 0.95em; margin: 4px 0;">🟢 Працює</div>`;
            }
        }

        return '<div style="color: #7f8c8d; font-size: 0.9em; margin: 4px 0;">⚪ Стан невідомий</div>';
    }

    // Фоновий трекер геолокації користувача поруч з автоматами
    async function sendAvtomatStatus(avtomatId, isWorking) {
        try {
            const res = await fetch('https://wmap.pp.ua/api/avtomats.php?action=report_status', {
                method: 'POST',
                headers: { ...Auth.headers(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ avtomat_id: avtomatId, is_working: isWorking ? 1 : 0 })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem(`asked_status_${avtomatId}`, Date.now());
                showHeartToast('✓ Дякуємо за ваш відгук!', 'success');
                window.loadMarkers?.();
            }
        } catch (e) { console.error('[map] sendAvtomatStatus error:', e); }
    }

    function startProximityTracker(avtomatsArray) {
        if (!navigator.geolocation || !window.Auth?.isLoggedIn()) return;

        navigator.geolocation.watchPosition((position) => {
            const uLat = position.coords.latitude;
            const uLng = position.coords.longitude;
            const uLatLng = L.latLng(uLat, uLng);

            avtomatsArray.forEach(m => {
                const rawLat = m.lat || m.latitude;
                const rawLng = m.lng || m.longitude;
                if (!rawLat || !rawLng) return;

                const mLat = parseFloat(rawLat.toString().replace(',', '.'));
                const mLng = parseFloat(rawLng.toString().replace(',', '.'));

                if (uLatLng.distanceTo(L.latLng(mLat, mLng)) <= 50) {
                    const lastAsked = localStorage.getItem(`asked_status_${m.id}`);
                    const now = Date.now();

                    if (!lastAsked || (now - parseInt(lastAsked)) > 12 * 3600 * 1000) {
                        const isWorking = confirm(`Ви зараз біля автомата (${m.company_name || m.company || 'ID ' + m.id}). Підкажіть, будь ласка, він працює і чи є в ньому вода?`);
                        sendAvtomatStatus(m.id, isWorking);
                        localStorage.setItem(`asked_status_${m.id}`, Date.now());
                    }
                }
            });
        }, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 });
    }

    function initLikeButton(container) {
        const btn = container.querySelector('.avtomat-like-btn');
        if (!btn || btn.dataset.initialized) return;
        btn.dataset.initialized = 'true';

        const machineId = Number(btn.dataset.id);

        setHeartState(btn, favoriteIds.has(machineId));

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!window.Auth?.isLoggedIn()) {
                showHeartToast('Увійдіть, щоб додавати в улюблені');
                return;
            }

            const isFav  = favoriteIds.has(machineId);
            const newFav = !isFav;

            setHeartState(btn, newFav);
            if (newFav) favoriteIds.add(machineId);
            else        favoriteIds.delete(machineId);

            try {
                const res = await fetch('https://wmap.pp.ua/api/favorites.php?action=toggle', {
                    method: 'POST',
                    headers: Auth.headers(),
                    body: JSON.stringify({ user_id: Auth.getUserId(), avtomat_id: machineId, add: newFav })
                });

                if (!res.ok) {
                    let errorMsg = res.statusText;
                    const contentType = res.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const errData = await res.json();
                        errorMsg = errData.message || errData.error || errorMsg;
                    } else {
                        errorMsg = await res.text();
                    }
                    throw new Error(`Помилка ${res.status}: ${errorMsg}`);
                }

                showHeartToast(newFav ? '❤️ Додано в улюблені' : 'Видалено з улюблених', newFav ? 'success' : 'info');

            } catch (err) {
                setHeartState(btn, isFav);
                if (isFav) favoriteIds.add(machineId);
                else       favoriteIds.delete(machineId);

                console.error('❌ Помилка додавання в улюблені:', err.message);
                showHeartToast('Помилка сервера. Перевір консоль (F12)', 'error');
            }
        });
    }

    function setHeartState(btn, isFav) {
        const svg  = btn.querySelector('svg');
        const path = btn.querySelector('path');
        if (!path) return;

        if (isFav) {
            path.setAttribute('fill',   '#FF3B30');
            path.setAttribute('stroke', '#FF3B30');
            btn.classList.add('is-fav');
            btn.title = 'Видалити з улюблених';
        } else {
            path.setAttribute('fill',   'none');
            path.setAttribute('stroke', '#1A1A1A');
            btn.classList.remove('is-fav');
            btn.title = 'Додати в улюблені';
        }

        btn.classList.remove('heart-pop');
        requestAnimationFrame(() => btn.classList.add('heart-pop'));
    }

    function showHeartToast(msg, type = 'info') {
        const t = Object.assign(document.createElement('div'), {
            className: `heart-toast heart-toast--${type}`,
            textContent: msg
        });
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('heart-toast--show'));
        setTimeout(() => {
            t.classList.remove('heart-toast--show');
            setTimeout(() => t.remove(), 300);
        }, 2500);
    }

    function isMobile() { return window.innerWidth <= 768; }

    function buildPopupHTML(machine, distanceStr, photoUrl, cleanLat, cleanLng, starsHTML) {
        const isFav   = favoriteIds.has(Number(machine.id));
        const heartFill   = isFav ? '#FF3B30' : 'none';
        const heartStroke = isFav ? '#FF3B30' : '#1A1A1A';
        const heartTitle  = isFav ? 'Видалити з улюблених' : 'Додати в улюблені';

        const avgRating = parseFloat(machine.rating || 0).toFixed(1);
        const statusHtml = getStatusIndicator(machine);

        return `
        <div class="avtomat-popup">
            <div class="avtomat-popup-header">
                <h3 class="avtomat-address">${machine.address || 'Адреса не вказана'}</h3>
                <button class="avtomat-like-btn ${isFav ? 'is-fav' : ''}"
                        title="${heartTitle}"
                        data-id="${machine.id}">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                         stroke="#1A1A1A" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path fill="${heartFill}" stroke="${heartStroke}"
                              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
                                 a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
                                 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                </button>
            </div>
            <div class="avtomat-popup-body">
                <div class="avtomat-info">
                    <p><span class="info-label">Відстань:</span>
                       🚶 <span style="font-weight:600">${distanceStr}</span></p>
                    <p><span class="info-label">Постачальник:</span>
                       <span style="font-weight:600">${machine.company_name || machine.company || '—'}</span></p>
                    
                    <p><span class="info-label">Середня оцінка:</span>
                       <span style="font-weight:600; color: #f59e0b;">⭐ ${avgRating}</span></p>

                    <p><span class="info-label">Опис:</span>
                       <span class="desc-text">${machine.description || 'Немає опису'}</span></p>
                    
                    <div class="avtomat-status-container" style="margin: 6px 0;">
                        ${statusHtml}
                    </div>

                    <div class="inline-stars" data-id="${machine.id}">
                        <span class="star-label">Ваша оцінка:</span>
                        <div class="stars-row">${starsHTML}</div>
                    </div>
                </div>
                <div class="avtomat-image-wrapper">
                    ${photoUrl
            ? `<img src="${photoUrl}" alt="Фото автомата">`
            : `<div class="no-image">Немає<br>фото</div>`}
                </div>
            </div>
            <div class="avtomat-popup-actions">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${cleanLat},${cleanLng}"
                   target="_blank" class="btn-popup btn-route">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 18l6-6-6-6"/>
                    </svg>
                    Маршрут
                </a>
            </div>
        </div>`;
    }

    window.loadMarkers = async function () {
        try {
            const userId = window.Auth?.isLoggedIn() ? Auth.getUserId() : 0;
            const headers = window.Auth?.isLoggedIn() ? Auth.headers() : {};

            const response = await fetch(`https://wmap.pp.ua/api/avtomats.php?user_id=${userId}`, {
                method: 'GET',
                headers: headers
            });

            const data = await response.json();
            markersLayer.clearLayers();

            let avtomats = [];
            if (Array.isArray(data))                              avtomats = data;
            else if (data.data     && Array.isArray(data.data))   avtomats = data.data;
            else if (data.avtomats && Array.isArray(data.avtomats)) avtomats = data.avtomats;
            else if (data.items    && Array.isArray(data.items))  avtomats = data.items;

            const approvedAvtomats = avtomats.filter(m => m.status === 'approved');

            // Запускаємо трекер відстані
            startProximityTracker(approvedAvtomats);

            approvedAvtomats.forEach((machine) => {
                const rawLat = machine.lat || machine.latitude  || machine.x;
                const rawLng = machine.lng || machine.longitude || machine.y;
                if (!rawLat || !rawLng) return;

                const cleanLat = parseFloat(rawLat.toString().replace(',', '.'));
                const cleanLng = parseFloat(rawLng.toString().replace(',', '.'));
                if (isNaN(cleanLat) || isNaN(cleanLng)) return;

                const markerLatLng = L.latLng(cleanLat, cleanLng);
                const marker       = L.marker(markerLatLng, { icon: waterMarkerIcon });

                let distanceStr = '--- м';
                if (userLatLng) {
                    const d = Math.round(userLatLng.distanceTo(markerLatLng));
                    distanceStr = d > 1000 ? (d/1000).toFixed(1) + ' км' : d + ' м';
                }

                const photoUrl = machine.photo
                    ? (machine.photo.startsWith('http') ? machine.photo : `https://wmap.pp.ua/${machine.photo}`)
                    : null;

                const userRatingFromDB = parseFloat(machine.user_rating) || 0;
                if (userRatingFromDB > 0) {
                    myRatings[machine.id] = userRatingFromDB;
                }

                const getFreshPopupHTML = () => {
                    const currentRating = myRatings[machine.id] || 0;

                    const freshStarsHTML = [1,2,3,4,5].map(n => `
                        <svg data-value="${n}"
                             class="inline-star${n <= Math.round(currentRating) ? ' selected' : ''}"
                             viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>`).join('');

                    return buildPopupHTML(machine, distanceStr, photoUrl, cleanLat, cleanLng, freshStarsHTML);
                };

                marker.bindPopup(
                    getFreshPopupHTML,
                    { className: 'custom-leaflet-popup', minWidth: 320, maxWidth: 360, closeButton: false }
                );

                marker.on('click', () => {
                    if (isMobile()) {
                        map.closePopup();
                        map.panTo(markerLatLng, { animate: true, duration: 0.4 });
                        openSheet(getFreshPopupHTML());
                    }
                });

                markersLayer.addLayer(marker);
            });

        } catch (err) { console.error('Помилка завантаження маркерів:', err); }
    };

    document.getElementById('btn-zoom-in')
        ?.addEventListener('click', (e) => { L.DomEvent.stopPropagation(e); map.zoomIn(); });
    document.getElementById('btn-zoom-out')
        ?.addEventListener('click', (e) => { L.DomEvent.stopPropagation(e); map.zoomOut(); });

    const locationBtn = document.querySelector('.control-btn[aria-label="Місцезнаходження"]');
    locationBtn?.addEventListener('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (!navigator.geolocation) { alert('Ваш браузер не підтримує геолокацію'); return; }

        locationBtn.classList.add('locating');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                locationBtn.classList.remove('locating');
                setUserLocation(pos.coords.latitude, pos.coords.longitude);
                map.flyTo(userLatLng, 16, { animate: true, duration: 0.8 });
                window.loadMarkers();
            },
            (err) => {
                locationBtn.classList.remove('locating');
                const msgs = { 1:'Доступ заборонено. Дозвольте в налаштуваннях.', 2:'Не вдалося визначити.', 3:'Час вичерпано.' };
                alert(msgs[err.code] || 'Помилка геолокації');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
    });
});