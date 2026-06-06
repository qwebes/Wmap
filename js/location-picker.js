class LocationPicker {
    constructor() {
        this.map            = null;
        this.selectedLat    = null;
        this.selectedLng    = null;
        this.selectedAddress = '';
        this.onConfirm      = null;
        this._geocodeTimer  = null;
        this.init();
    }

    init() {
        this.modal       = document.getElementById('modal-location-picker');
        this.confirmBtn  = document.getElementById('confirm-location-btn');
        this.cancelBtn   = document.getElementById('cancel-location-btn');
        this.closeBtn    = document.getElementById('close-location-picker-btn');
        this.addressText = document.getElementById('selected-address-text');
        this.coordsText  = document.getElementById('selected-coords-text');

        this.confirmBtn?.addEventListener('click', () => this.confirm());
        this.cancelBtn ?.addEventListener('click', () => this.close());
        this.closeBtn  ?.addEventListener('click', () => this.close());
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    open(callback) {
        this.onConfirm = callback;
        this.modal.style.display = 'flex';

        setTimeout(() => {
            if (!this.map) {
                this._initMap();
            } else {
                this.map.invalidateSize();
                this._goToUser(false);
            }
        }, 100);
    }

    close() {
        this.modal.style.display = 'none';
    }

    _initMap() {
        const fallbackLat = 49.842957;
        const fallbackLng = 24.031111;

        this.map = L.map('location-picker-map', { zoomControl: false })
            .setView([fallbackLat, fallbackLng], 13);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri',
            maxZoom: 19
        }).addTo(this.map);

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        const myLocCtrl = L.control({ position: 'bottomright' });
        myLocCtrl.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            div.innerHTML = `
                <button class="lp-my-location-btn" title="Моя позиція">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                        <circle cx="12" cy="12" r="8" stroke-dasharray="2 4"/>
                    </svg>
                </button>`;
            L.DomEvent.on(div, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                this._goToUser(true);
            });
            return div;
        };
        myLocCtrl.addTo(this.map);

        this.map.on('moveend', () => this._updateLocation());

        this._goToUser(true);
    }

    _goToUser(showError = false) {
        if (!navigator.geolocation) {
            if (showError) alert('Ваш браузер не підтримує геолокацію');
            this._updateLocation();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                this.map.flyTo([lat, lng], 17, { animate: true, duration: 0.6 });
            },
            (err) => {
                if (showError) {
                    const msgs = {
                        1: 'Доступ до геолокації заборонено.',
                        2: 'Не вдалося визначити місцезнаходження.',
                        3: 'Час очікування вичерпано.'
                    };
                    alert(msgs[err.code] || 'Помилка геолокації');
                }
                this._updateLocation();
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );
    }

    _updateLocation() {
        const center = this.map.getCenter();
        this.selectedLat = center.lat;
        this.selectedLng = center.lng;

        if (this.coordsText) {
            this.coordsText.textContent =
                `${this.selectedLat.toFixed(6)}, ${this.selectedLng.toFixed(6)}`;
        }
        if (this.addressText) {
            this.addressText.textContent = 'Завантаження адреси...';
        }
        
        clearTimeout(this._geocodeTimer);
        this._geocodeTimer = setTimeout(() => {
            this._geocode(this.selectedLat, this.selectedLng);
        }, 500);
    }

    async _geocode(lat, lng) {
        try {
            const res  = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                { headers: { 'Accept-Language': 'uk' } }
            );
            const data = await res.json();
            this.selectedAddress = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        } catch {
            this.selectedAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }

        if (this.addressText) {
            this.addressText.textContent = this.selectedAddress;
        }
    }

    confirm() {
        if (this.onConfirm && this.selectedLat && this.selectedLng) {
            this.onConfirm({
                lat:     this.selectedLat,
                lng:     this.selectedLng,
                address: this.selectedAddress
            });
        }
        this.close();
    }
}

window.LocationPicker = LocationPicker;