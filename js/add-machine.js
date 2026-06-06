/**
 * add-machine.js — форма додавання автомату.
 * Потребує auth-helper.js і location-picker.js
 */
document.addEventListener('DOMContentLoaded', () => {

    const form         = document.querySelector('.machine-add-form');
    const addressInput = document.getElementById('address-input-field');
    if (!form || !addressInput) return;

    const locationPicker = new LocationPicker();
    let selectedLocation = null;

    addressInput.setAttribute('readonly', 'readonly');
    addressInput.style.cursor = 'pointer';
    addressInput.placeholder  = 'Натисніть для вибору на карті';

    addressInput.addEventListener('click', () => {
        locationPicker.open((loc) => {
            selectedLocation        = loc;
            addressInput.value      = loc.address;
            addressInput.dataset.lat = loc.lat;
            addressInput.dataset.lng = loc.lng;
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }

        const inputs      = form.querySelectorAll('.form-input-field');
        const company     = inputs[0].value.trim();
        const description = inputs[2].value.trim();
        const photo       = document.getElementById('machine-photo-input')?.files[0];
        const submitBtn   = form.querySelector('.form-submit-btn');

        if (!company)          { alert('Введіть назву компанії'); return; }
        if (!selectedLocation) { alert('Виберіть локацію на карті'); return; }

        const formData = new FormData();
        formData.append('company',     company);
        formData.append('address',     addressInput.value.trim());
        formData.append('description', description);
        formData.append('lat',         selectedLocation.lat);
        formData.append('lng',         selectedLocation.lng);
        if (photo) formData.append('photo', photo);

        const originalText   = submitBtn.textContent;
        submitBtn.disabled   = true;
        submitBtn.textContent = 'Відправка...';

        try {
            const res    = await fetch('https://wmap.pp.ua/api/avtomats.php?action=add', {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
                body:    formData
            });
            const result = await res.json();

            if (res.ok && result.success) {
                // Перевіряємо, чи бекенд відхилив заявку через локацію
                if (result.message && result.message.includes('ВІДХИЛЕНО')) {
                    alert('⚠️ ' + result.message);
                } else {
                    alert('✓ ' + (result.message || 'Автомат відправлено на модерацію!'));
                }

                form.reset();
                selectedLocation = null;
                const fileStatus = document.querySelector('.file-status-info');
                if (fileStatus) fileStatus.textContent = 'Файл не вибрано';
                document.getElementById('modal-add-machine').style.display = 'none';
                window.loadMarkers?.();
            } else {
                alert('✗ ' + (result.message || 'Помилка при додаванні автомата'));
            }
        } catch (err) {
            console.error('[add-machine]', err);
            alert("Помилка з'єднання з сервером");
        } finally {
            submitBtn.disabled    = false;
            submitBtn.textContent = originalText;
        }
    });
});