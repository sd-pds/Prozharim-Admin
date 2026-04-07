(() => {
  const cfg = window.ADMIN_CONFIG || {};
  const workerUrl = String(cfg.workerUrl || '').replace(/\/$/, '');
  const assetBaseUrl = String(cfg.assetBaseUrl || '').replace(/\/$/, '');
  const passwordStorageKey = cfg.passwordStorageKey || 'prozharim_admin_password';

  const els = {
    products: document.getElementById('products'),
    tabs: document.getElementById('categoryTabs'),
    search: document.getElementById('search'),
    toast: document.getElementById('toast'),
    productModal: document.getElementById('productModal'),
    productForm: document.getElementById('productForm'),
    modalTitle: document.getElementById('modalTitle'),
    authModal: document.getElementById('authModal'),
    authForm: document.getElementById('authForm'),
    authBtn: document.getElementById('authBtn'),
    saveBtn: document.getElementById('saveBtn'),
    addProductBtn: document.getElementById('addProductBtn'),
    reloadBtn: document.getElementById('reloadBtn'),
    addPromoCodeBtn: document.getElementById('addPromoCodeBtn'),
    passwordStatus: document.getElementById('passwordStatus'),
    workerStatus: document.getElementById('workerStatus'),
    repoStatus: document.getElementById('repoStatus'),
    statTotal: document.getElementById('statTotal'),
    statCategories: document.getElementById('statCategories'),
    statChanged: document.getElementById('statChanged'),
    lockScreen: document.getElementById('lockScreen'),
    imagePreview: document.getElementById('imagePreview'),
    imageFile: document.getElementById('imageFile'),
    imagePathHint: document.getElementById('imagePathHint'),
    promoGrid: document.getElementById('promoGrid'),
    promoFile: document.getElementById('promoFile'),
    promoCodeList: document.getElementById('promoCodeList'),
    statPromotions: document.getElementById('statPromotions'),
    statPromocodes: document.getElementById('statPromocodes'),
    deliveryModeTabs: document.getElementById('deliveryModeTabs'),
    deliveryModeHint: document.getElementById('deliveryModeHint'),
    deliveryZoneList: document.getElementById('deliveryZoneList'),
    zoneNameInput: document.getElementById('zoneNameInput'),
    zoneRestaurantInput: document.getElementById('zoneRestaurantInput'),
    zonePriceInput: document.getElementById('zonePriceInput'),
    zoneGeometryHint: document.getElementById('zoneGeometryHint'),
    addZoneBtn: document.getElementById('addZoneBtn'),
    editZoneGeometryBtn: document.getElementById('editZoneGeometryBtn'),
    finishZoneGeometryBtn: document.getElementById('finishZoneGeometryBtn'),
    deleteZoneBtn: document.getElementById('deleteZoneBtn'),
    deliveryMap: document.getElementById('deliveryMap')
  };

  const state = {
    menu: [],
    promotions: [],
    promocodes: [],
    originalMenuJson: '[]\n',
    originalPromocodesJson: '[]\n',
    category: 'Все',
    query: '',
    password: sessionStorage.getItem(passwordStorageKey) || '',
    sha: '',
    promoCodesSha: '',
    repoInfo: null,
    source: '',
    dirty: false,
    unlocked: false,
    deliveryMode: 'day',
    deliveryZonesDay: { type: 'FeatureCollection', features: [] },
    deliveryZonesNight: { type: 'FeatureCollection', features: [] },
    deliveryZonesDaySha: '',
    deliveryZonesNightSha: '',
    originalZonesDayJson: '{\n  "type": "FeatureCollection",\n  "features": []\n}\n',
    originalZonesNightJson: '{\n  "type": "FeatureCollection",\n  "features": []\n}\n',
    selectedZoneIndex: -1
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function showToast(message, isError = false) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('isShown');
    els.toast.style.borderColor = isError ? 'rgba(255,120,120,.35)' : '';
    els.toast.style.color = isError ? '#ffd6d6' : '';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      els.toast.classList.remove('isShown');
      els.toast.style.borderColor = '';
      els.toast.style.color = '';
    }, 2600);
  }

  function setBadge(el, text, kind = '') {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('isOk', 'isWarn');
    if (kind) el.classList.add(kind);
  }

  function normalizeImg(src) {
    const value = String(src || '').trim();
    if (!value) return 'assets/logo.png';
    if (/^https?:\/\//i.test(value)) return value;
    if (!assetBaseUrl) return value.replace(/^\.\//, '');
    return `${assetBaseUrl}/${value.replace(/^\.\//, '').replace(/^\//, '')}`;
  }

  function updateLockScreen() {
    if (!els.lockScreen) return;
    els.lockScreen.hidden = state.unlocked;
  }

  function calcDirty() {
    const currentMenu = JSON.stringify(state.menu, null, 2) + '\n';
    const currentCodes = JSON.stringify({ promocodes: state.promocodes }, null, 2) + '\n';
    const currentZonesDay = JSON.stringify(state.deliveryZonesDay, null, 2) + '\n';
    const currentZonesNight = JSON.stringify(state.deliveryZonesNight, null, 2) + '\n';
    state.dirty = currentMenu !== state.originalMenuJson || currentCodes !== state.originalPromocodesJson || currentZonesDay !== state.originalZonesDayJson || currentZonesNight !== state.originalZonesNightJson;
    if (els.statChanged) els.statChanged.textContent = state.dirty ? '1+' : '0';
    document.title = `${state.dirty ? '● ' : ''}ПРОЖАРИМ — панель управления меню`;
  }

  function updateStats() {
    if (els.statTotal) els.statTotal.textContent = state.menu.length;
    if (els.statCategories) els.statCategories.textContent = new Set(state.menu.map(item => item.category).filter(Boolean)).size;
    if (els.statPromotions) els.statPromotions.textContent = state.promotions.length;
    if (els.statPromocodes) els.statPromocodes.textContent = state.promocodes.length;
    calcDirty();
  }



  function emptyFeatureCollection() {
    return { type: 'FeatureCollection', features: [] };
  }

  function normalizeFeatureCollection(data) {
    const fc = data && typeof data === 'object' ? structuredClone(data) : emptyFeatureCollection();
    if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return emptyFeatureCollection();
    fc.features = fc.features.map((feature, index) => ({
      type: 'Feature',
      properties: {
        zone: feature?.properties?.zone || `Зона ${index + 1}`,
        restaurant: feature?.properties?.restaurant || '',
        deliveryPrice: Number(feature?.properties?.deliveryPrice || 0)
      },
      geometry: feature?.geometry?.type ? feature.geometry : { type: 'Polygon', coordinates: [[]] }
    }));
    return fc;
  }

  function getCurrentZones() {
    return state.deliveryMode === 'night' ? state.deliveryZonesNight : state.deliveryZonesDay;
  }

  function setCurrentZones(next) {
    if (state.deliveryMode === 'night') state.deliveryZonesNight = next;
    else state.deliveryZonesDay = next;
  }

  function zoneLabel(feature, index) {
    const price = Number(feature?.properties?.deliveryPrice || 0);
    return `${feature?.properties?.zone || `Зона ${index + 1}`} • ${price} ₽`;
  }

  function getSelectedZone() {
    return getCurrentZones().features?.[state.selectedZoneIndex] || null;
  }

  function setDeliveryMode(mode) {
    state.deliveryMode = mode === 'night' ? 'night' : 'day';
    state.selectedZoneIndex = -1;
    renderDeliveryModeTabs();
    renderDeliveryZoneList();
    fillZoneForm();
    renderDeliveryMap();
  }

  function renderDeliveryModeTabs() {
    if (!els.deliveryModeTabs) return;
    els.deliveryModeTabs.innerHTML = '';
    [['day', 'День'], ['night', 'Ночь']].forEach(([value, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab' + (state.deliveryMode === value ? ' isOn' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => setDeliveryMode(value));
      els.deliveryModeTabs.appendChild(btn);
    });
    if (els.deliveryModeHint) els.deliveryModeHint.textContent = state.deliveryMode === 'night' ? 'Ночные зоны доставки' : 'Дневные зоны доставки';
  }

  function renderDeliveryZoneList() {
    if (!els.deliveryZoneList) return;
    if (!state.unlocked) {
      els.deliveryZoneList.innerHTML = '<div class="emptyState emptyState--glass">Доступ заблокирован</div>';
      return;
    }
    const zones = getCurrentZones().features || [];
    if (!zones.length) {
      els.deliveryZoneList.innerHTML = '<div class="emptyState emptyState--glass">Зон пока нет. Добавьте первую зону кнопкой выше.</div>';
      return;
    }
    els.deliveryZoneList.innerHTML = zones.map((feature, index) => `
      <button class="deliveryZoneItem${index === state.selectedZoneIndex ? ' isOn' : ''}" type="button" data-zone-index="${index}">
        <span class="deliveryZoneItem__name">${escapeHtml(feature?.properties?.zone || `Зона ${index + 1}`)}</span>
        <span class="deliveryZoneItem__meta">${escapeHtml(feature?.properties?.restaurant || 'Без ресторана')} • ${Number(feature?.properties?.deliveryPrice || 0)} ₽</span>
      </button>
    `).join('');
  }

  function fillZoneForm() {
    const feature = getSelectedZone();
    const disabled = !feature;
    [els.zoneNameInput, els.zoneRestaurantInput, els.zonePriceInput, els.editZoneGeometryBtn, els.finishZoneGeometryBtn, els.deleteZoneBtn].forEach(el => { if (el) el.disabled = disabled; });
    if (!feature) {
      if (els.zoneNameInput) els.zoneNameInput.value = '';
      if (els.zoneRestaurantInput) els.zoneRestaurantInput.value = '';
      if (els.zonePriceInput) els.zonePriceInput.value = '';
      if (els.zoneGeometryHint) els.zoneGeometryHint.textContent = 'Выберите зону слева или добавьте новую.';
      return;
    }
    if (els.zoneNameInput) els.zoneNameInput.value = feature.properties?.zone || '';
    if (els.zoneRestaurantInput) els.zoneRestaurantInput.value = feature.properties?.restaurant || '';
    if (els.zonePriceInput) els.zonePriceInput.value = Number(feature.properties?.deliveryPrice || 0);
    const coords = feature.geometry?.coordinates?.[0]?.length || feature.geometry?.coordinates?.[0]?.[0]?.length || 0;
    if (els.zoneGeometryHint) els.zoneGeometryHint.textContent = coords ? `Точек в полигоне: ${coords}` : 'Полигон пока не нарисован. Нажмите «Править границы».';
  }

  function renderTabs() {
    if (!els.tabs) return;
    const cats = ['Все', ...Array.from(new Set(state.menu.map(item => item.category).filter(Boolean)))];
    els.tabs.innerHTML = '';
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab' + (cat === state.category ? ' isOn' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        state.category = cat;
        renderTabs();
        renderProducts();
      });
      els.tabs.appendChild(btn);
    });
  }

  function getFilteredMenu() {
    let list = state.menu.slice();
    const q = state.query.trim().toLowerCase();
    if (state.category !== 'Все') list = list.filter(item => item.category === state.category);
    if (q) list = list.filter(item => [item.name, item.desc, item.category, item.id].some(v => String(v || '').toLowerCase().includes(q)));
    return list;
  }

  function cardActions(itemIndex) {
    return `
      <div class="adminCardActions">
        <button class="iconMiniBtn" type="button" data-edit="${itemIndex}" title="Редактировать" aria-label="Редактировать">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58ZM20.71 5.63a1 1 0 0 0 0-1.41l-.93-.92a1 1 0 0 0-1.41 0l-1.17 1.17 2.34 2.34 1.17-1.18Z"/></svg>
        </button>
        <button class="iconMiniBtn iconMiniBtn--danger" type="button" data-delete="${itemIndex}" title="Удалить" aria-label="Удалить">
          <svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Zm3-4h6l1 2h4v2H4V5h4l1-2Z"/></svg>
        </button>
      </div>`;
  }

  function renderProducts() {
    if (!els.products) return;
    const list = getFilteredMenu();
    els.products.innerHTML = '';
    if (!state.unlocked) {
      els.products.innerHTML = '<div class="emptyState">Доступ заблокирован</div>';
      return;
    }
    if (!list.length) {
      els.products.innerHTML = '<div class="emptyState">Ничего не найдено. Попробуйте изменить фильтр или добавить новую позицию.</div>';
      return;
    }

    list.forEach(item => {
      const originalIndex = state.menu.indexOf(item);
      const card = document.createElement('article');
      card.className = 'card adminProductCard';
      card.innerHTML = `
        <div class="card__body adminProductCard__body">
          <div class="adminPreview">
            <img class="card__img adminProductCard__img" src="${escapeHtml(normalizeImg(item.img))}" alt="${escapeHtml(item.name)}" loading="lazy">
            <div class="adminProductCard__content">
              <div class="card__cat">${escapeHtml(item.category || 'Без категории')}</div>
              <div class="card__name">${escapeHtml(item.name || 'Без названия')}</div>
            </div>
            <div class="adminProductCard__bottom">
              <div class="adminProductCard__meta">
                <div class="card__desc">${escapeHtml(item.desc || 'Описание не заполнено')}</div>
                <div class="price">${Number(item.price || 0)} ₽</div>
                <div class="meta">${escapeHtml(item.weight || 'Без веса')}${item.hit ? ' • Хит' : ''}</div>
              </div>
              ${cardActions(originalIndex)}
            </div>
          </div>
        </div>`;
      els.products.appendChild(card);
    });
  }

  function renderPromotions() {
    if (!els.promoGrid) return;
    if (!state.unlocked) {
      els.promoGrid.innerHTML = '<div class="emptyState emptyState--glass">Доступ заблокирован</div>';
      return;
    }
    const cards = state.promotions.map((item, index) => `
      <article class="promoAdminCard">
        <img src="${escapeHtml(normalizeImg(item.path))}" alt="Акция ${index + 1}" loading="lazy">
        <button class="iconMiniBtn iconMiniBtn--danger promoAdminDelete" type="button" data-delete-promo="${escapeHtml(item.path)}" aria-label="Удалить баннер" title="Удалить баннер">
          <svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Zm3-4h6l1 2h4v2H4V5h4l1-2Z"/></svg>
        </button>
      </article>
    `).join('');
    els.promoGrid.innerHTML = cards + `
      <button class="promoAdminAdd" type="button" id="promoAddTile" aria-label="Добавить баннер">
        <span class="promoAdminAdd__icon">
          <svg viewBox="0 0 24 24"><path d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>
        </span>
      </button>
    `;
    document.getElementById('promoAddTile')?.addEventListener('click', () => els.promoFile?.click());
  }

  function renderPromocodes() {
    if (!els.promoCodeList) return;
    if (!state.unlocked) {
      els.promoCodeList.innerHTML = '<div class="emptyState emptyState--glass">Доступ заблокирован</div>';
      return;
    }
    if (!state.promocodes.length) {
      els.promoCodeList.innerHTML = '<div class="emptyState emptyState--glass">Промокодов пока нет. Добавьте первый код кнопкой выше.</div>';
      return;
    }
    els.promoCodeList.innerHTML = state.promocodes.map((item, index) => `
      <div class="promoCodeItem">
        <label>
          <span>Название</span>
          <input type="text" data-promo-field="title" data-promo-index="${index}" value="${escapeHtml(item.title || '')}" placeholder="День рождения">
        </label>
        <label>
          <span>Промокод</span>
          <input type="text" data-promo-field="code" data-promo-index="${index}" value="${escapeHtml(item.code || '')}" placeholder="birthday">
        </label>
        <label>
          <span>Скидка, %</span>
          <input type="number" min="1" max="100" step="1" data-promo-field="percent" data-promo-index="${index}" value="${Number(item.percent || 0)}">
        </label>
        <label>
          <span>Статус</span>
          <select data-promo-field="active" data-promo-index="${index}">
            <option value="true"${item.active !== false ? ' selected' : ''}>Активен</option>
            <option value="false"${item.active === false ? ' selected' : ''}>Выключен</option>
          </select>
        </label>
        <div class="promoCodeItem__actions">
          <button class="iconMiniBtn iconMiniBtn--danger" type="button" data-delete-promocode="${index}" aria-label="Удалить промокод" title="Удалить промокод">
            <svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Zm3-4h6l1 2h4v2H4V5h4l1-2Z"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }



  let deliveryMap = null;
  let deliveryCollection = null;

  function ymapsReadyAdmin() {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function wait() {
        if (window.ymaps && typeof window.ymaps.ready === 'function') {
          window.ymaps.ready(() => resolve(window.ymaps));
          return;
        }
        if (Date.now() - start > 20000) {
          reject(new Error('Yandex Maps не загрузилась'));
          return;
        }
        setTimeout(wait, 60);
      })();
    });
  }

  async function ensureDeliveryMap() {
    if (!els.deliveryMap || deliveryMap) return deliveryMap;
    const ymaps = await ymapsReadyAdmin();
    deliveryMap = new ymaps.Map('deliveryMap', { center: [51.7682, 55.0968], zoom: 11, controls: ['zoomControl'] }, { suppressMapOpenBlock: true });
    deliveryCollection = new ymaps.GeoObjectCollection();
    deliveryMap.geoObjects.add(deliveryCollection);
    renderDeliveryMap();
    return deliveryMap;
  }

  function convertCoordsLonLatToLatLon(input) {
    if (!Array.isArray(input)) return input;
    if (input.length >= 2 && typeof input[0] === 'number' && typeof input[1] === 'number') {
      return [input[1], input[0]];
    }
    return input.map(convertCoordsLonLatToLatLon);
  }

  function convertCoordsLatLonToLonLat(input) {
    if (!Array.isArray(input)) return input;
    if (input.length >= 2 && typeof input[0] === 'number' && typeof input[1] === 'number') {
      return [input[1], input[0]];
    }
    return input.map(convertCoordsLatLonToLonLat);
  }

  function getFeatureGeometry(feature) {
    return convertCoordsLonLatToLatLon(feature?.geometry?.coordinates || [[]]);
  }

  function buildZoneGeoObject(feature, index) {
    const ymaps = window.ymaps;
    const active = index === state.selectedZoneIndex;
    const fill = active ? 'rgba(255,106,61,0.34)' : (state.deliveryMode === 'night' ? 'rgba(85,145,255,0.22)' : 'rgba(71,195,110,0.20)');
    const stroke = active ? '#ff6a3d' : (state.deliveryMode === 'night' ? '#7da7ff' : '#4fd48f');
    const geo = new ymaps.Polygon(getFeatureGeometry(feature), { balloonContent: zoneLabel(feature, index) }, {
      fillColor: fill,
      strokeColor: stroke,
      strokeWidth: active ? 4 : 3,
      opacity: 0.95,
      editorDrawingCursor: 'crosshair'
    });
    geo.events.add('click', () => {
      state.selectedZoneIndex = index;
      renderDeliveryZoneList();
      fillZoneForm();
      renderDeliveryMap();
    });
    geo.geometry.events.add('change', () => {
      const zones = getCurrentZones();
      const target = zones.features[index];
      if (!target) return;
      target.geometry = { type: 'Polygon', coordinates: convertCoordsLatLonToLonLat(geo.geometry.getCoordinates()) };
      calcDirty();
      fillZoneForm();
    });
    return geo;
  }

  async function renderDeliveryMap() {
    if (!state.unlocked || !els.deliveryMap || !window.ymaps || !deliveryCollection) return;
    deliveryCollection.removeAll();
    const zones = getCurrentZones().features || [];
    const bounds = [];
    zones.forEach((feature, index) => {
      const geo = buildZoneGeoObject(feature, index);
      deliveryCollection.add(geo);
      try {
        const b = geo.geometry.getBounds();
        if (b) bounds.push(b[0], b[1]);
      } catch {}
    });
    if (bounds.length && deliveryMap) {
      try { deliveryMap.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 }); } catch {}
    }
  }

  function updateZoneField(field, value) {
    const feature = getSelectedZone();
    if (!feature) return;
    if (!feature.properties) feature.properties = {};
    feature.properties[field] = field === 'deliveryPrice' ? Number(value || 0) : value;
    calcDirty();
    renderDeliveryZoneList();
    renderDeliveryMap();
  }

  async function createZone() {
    if (!state.unlocked) return openModal('authModal');
    const zones = getCurrentZones();
    const feature = {
      type: 'Feature',
      properties: { zone: `Новая зона ${zones.features.length + 1}`, restaurant: '', deliveryPrice: 0 },
      geometry: { type: 'Polygon', coordinates: [[]] }
    };
    zones.features.push(feature);
    state.selectedZoneIndex = zones.features.length - 1;
    calcDirty();
    renderDeliveryZoneList();
    fillZoneForm();
    await ensureDeliveryMap();
    renderDeliveryMap();
    setTimeout(startGeometryEditing, 80);
  }

  function startGeometryEditing() {
    if (!deliveryCollection || state.selectedZoneIndex < 0) return;
    const geo = deliveryCollection.get(state.selectedZoneIndex);
    if (!geo?.editor) return;
    try {
      geo.editor.startDrawing();
    } catch {
      try { geo.editor.startEditing(); } catch {}
    }
  }

  function finishGeometryEditing() {
    if (!deliveryCollection || state.selectedZoneIndex < 0) return;
    const geo = deliveryCollection.get(state.selectedZoneIndex);
    if (!geo?.editor) return;
    try { geo.editor.stopDrawing(); } catch {}
    try { geo.editor.stopEditing(); } catch {}
  }

  function deleteSelectedZone() {
    const zones = getCurrentZones();
    const feature = getSelectedZone();
    if (!feature) return;
    if (!confirm(`Удалить зону «${feature.properties?.zone || 'Без названия'}»?`)) return;
    zones.features.splice(state.selectedZoneIndex, 1);
    state.selectedZoneIndex = -1;
    calcDirty();
    renderDeliveryZoneList();
    fillZoneForm();
    renderDeliveryMap();
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.removeAttribute('hidden');
    modal.classList.add('isOn');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('isOn');
    modal.setAttribute('hidden', 'hidden');
    document.body.style.overflow = '';
  }

  function updateImagePreview(value) {
    if (!els.imagePreview) return;
    const previewValue = String(value || '').trim();
    els.imagePreview.src = normalizeImg(previewValue || 'assets/logo.png');
  }

  function clearSelectedFile() {
    if (els.imageFile) els.imageFile.value = '';
  }

  function fillProductForm(item = {}, index = '') {
    els.productForm.reset();
    els.productForm.elements.index.value = index;
    els.productForm.elements.id.value = item.id || '';
    els.productForm.elements.category.value = item.category || '';
    els.productForm.elements.name.value = item.name || '';
    els.productForm.elements.desc.value = item.desc || '';
    els.productForm.elements.price.value = item.price ?? '';
    els.productForm.elements.weight.value = item.weight || '';
    els.productForm.elements.img.value = item.img || '';
    els.productForm.elements.imgPathManual.value = item.img || '';
    els.productForm.elements.hit.value = String(Boolean(item.hit));
    if (els.imagePathHint) els.imagePathHint.textContent = item.img || 'Файл ещё не выбран';
    clearSelectedFile();
    updateImagePreview(item.img || '');
  }

  function openCreateModal() {
    if (!state.unlocked) return openModal('authModal');
    if (els.modalTitle) els.modalTitle.textContent = 'Новая позиция';
    fillProductForm({}, '');
    openModal('productModal');
  }

  function openEditModal(index) {
    if (!state.unlocked) return openModal('authModal');
    const item = state.menu[index];
    if (!item) return;
    if (els.modalTitle) els.modalTitle.textContent = 'Редактирование позиции';
    fillProductForm(item, String(index));
    openModal('productModal');
  }

  function createIdFromName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/ё/g, 'e')
      .replace(/[^a-zа-я0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '');
  }

  function slugifyFileName(name) {
    return String(name || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Zа-яА-Я0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function convertImageToWebp(file, quality = 0.86) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.drawImage(bitmap, 0, 0);
    const dataUrl = canvas.toDataURL('image/webp', quality);
    const match = dataUrl.match(/^data:image\/webp;base64,(.+)$/);
    if (!match) throw new Error('Не удалось конвертировать изображение в WebP');
    return { mimeType: 'image/webp', contentBase64: match[1] };
  }

  async function uploadFileToFolder(file, baseName, folder) {
    if (!file) throw new Error('Файл не выбран');
    if (!state.password) throw new Error('Сначала введите пароль панели');
    const prepared = await convertImageToWebp(file);
    const filename = `${slugifyFileName(baseName || file.name || 'image')}.webp`;
    return fetchJson(`${workerUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': state.password
      },
      body: JSON.stringify({
        filename,
        folder,
        mimeType: prepared.mimeType,
        contentBase64: prepared.contentBase64
      })
    });
  }

  async function uploadImageIfNeeded(baseName) {
    const file = els.imageFile?.files?.[0];
    if (!file) return String(els.productForm.elements.imgPathManual.value || els.productForm.elements.img.value || '').trim();
    const data = await uploadFileToFolder(file, baseName || 'product', 'assets/photos');
    if (els.imagePathHint) els.imagePathHint.textContent = data.path || '';
    return data.path || `./assets/photos/${slugifyFileName(baseName || 'product')}.webp`;
  }

  async function saveProductFromForm(event) {
    event.preventDefault();
    if (!state.unlocked) {
      showToast('Сначала введите пароль панели', true);
      openModal('authModal');
      return;
    }
    const fd = new FormData(els.productForm);
    const rawName = String(fd.get('name') || '').trim();
    const imgPath = await uploadImageIfNeeded(rawName);
    const item = {
      id: String(fd.get('id') || '').trim() || createIdFromName(rawName),
      category: String(fd.get('category') || '').trim(),
      name: rawName,
      desc: String(fd.get('desc') || '').trim(),
      price: Number(fd.get('price') || 0),
      weight: String(fd.get('weight') || '').trim(),
      img: imgPath,
      hit: String(fd.get('hit')) === 'true'
    };

    if (!item.id || !item.category || !item.name || !item.price) {
      showToast('Заполните обязательные поля', true);
      return;
    }

    const indexValue = fd.get('index');
    const index = indexValue === '' ? -1 : Number(indexValue);
    const duplicateIndex = state.menu.findIndex((entry, i) => entry.id === item.id && i !== index);
    if (duplicateIndex !== -1) {
      showToast('ID уже существует, укажите другой', true);
      return;
    }

    if (!item.desc) delete item.desc;
    if (!item.weight) delete item.weight;
    if (!item.img) delete item.img;
    if (!item.hit) delete item.hit;

    if (index >= 0) state.menu[index] = item;
    else state.menu.unshift(item);

    updateStats();
    renderTabs();
    renderProducts();
    closeModal('productModal');
    showToast(index >= 0 ? 'Позиция обновлена локально' : 'Позиция добавлена локально');
  }

  function deleteItem(index) {
    const item = state.menu[index];
    if (!item) return;
    if (!confirm(`Удалить позицию «${item.name}»?`)) return;
    state.menu.splice(index, 1);
    updateStats();
    renderTabs();
    renderProducts();
    showToast('Позиция удалена локально');
  }

  function addPromoCode() {
    state.promocodes.push({
      title: 'Новый промокод',
      code: `promo${Date.now().toString().slice(-5)}`,
      percent: 10,
      active: true
    });
    updateStats();
    renderPromocodes();
  }

  function deletePromoCode(index) {
    if (!state.promocodes[index]) return;
    if (!confirm('Удалить промокод?')) return;
    state.promocodes.splice(index, 1);
    updateStats();
    renderPromocodes();
    showToast('Промокод удалён локально');
  }

  async function uploadPromotionFile(file) {
    try {
      const baseName = `promo-${Date.now()}`;
      await uploadFileToFolder(file, baseName, 'assets/promos');
      await loadPromotions();
      showToast('Баннер загружен');
    } catch (error) {
      showToast(error.message || 'Ошибка загрузки баннера', true);
    }
  }

  async function deletePromotion(path) {
    if (!path) return;
    if (!confirm('Удалить этот баннер акции?')) return;
    try {
      await fetchJson(`${workerUrl}/api/delete-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': state.password
        },
        body: JSON.stringify({ path, message: `Delete promo ${path}` })
      });
      await loadPromotions();
      showToast('Баннер удалён');
    } catch (error) {
      showToast(error.message || 'Ошибка удаления баннера', true);
    }
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const message = data?.error || data?.message || `Ошибка ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function loadMenu() {
    const data = await fetchJson(`${workerUrl}/api/menu`, {
      headers: { 'x-admin-password': state.password }
    });
    state.menu = Array.isArray(data.menu) ? data.menu : [];
    state.originalMenuJson = JSON.stringify(state.menu, null, 2) + '\n';
    state.sha = data.sha || '';
    state.repoInfo = data.repo || null;
    state.source = data.source || 'GitHub';
    renderTabs();
    renderProducts();
  }

  async function loadPromotions() {
    const data = await fetchJson(`${workerUrl}/api/promos`, {
      headers: { 'x-admin-password': state.password }
    });
    state.promotions = Array.isArray(data.items) ? data.items : [];
    updateStats();
    renderPromotions();
  }

  async function loadPromocodes() {
    const data = await fetchJson(`${workerUrl}/api/promocodes`, {
      headers: { 'x-admin-password': state.password }
    });
    state.promocodes = Array.isArray(data.promocodes) ? data.promocodes : [];
    state.originalPromocodesJson = JSON.stringify({ promocodes: state.promocodes }, null, 2) + '\n';
    state.promoCodesSha = data.sha || '';
    updateStats();
    renderPromocodes();
  }



  async function loadDeliveryZones() {
    const data = await fetchJson(`${workerUrl}/api/delivery-zones`, {
      headers: { 'x-admin-password': state.password }
    });
    state.deliveryZonesDay = normalizeFeatureCollection(data.day);
    state.deliveryZonesNight = normalizeFeatureCollection(data.night);
    state.deliveryZonesDaySha = data.daySha || '';
    state.deliveryZonesNightSha = data.nightSha || '';
    state.originalZonesDayJson = JSON.stringify(state.deliveryZonesDay, null, 2) + '\n';
    state.originalZonesNightJson = JSON.stringify(state.deliveryZonesNight, null, 2) + '\n';
    state.selectedZoneIndex = -1;
    renderDeliveryModeTabs();
    renderDeliveryZoneList();
    fillZoneForm();
    await ensureDeliveryMap();
    renderDeliveryMap();
  }

  async function loadAll() {
    if (!workerUrl || workerUrl.includes('REPLACE-WITH-YOUR-WORKER')) {
      setBadge(els.workerStatus, 'Укажите workerUrl в js/config.js', 'isWarn');
      showToast('Сначала настройте js/config.js', true);
      return;
    }
    if (!state.password) {
      state.unlocked = false;
      updateLockScreen();
      renderProducts();
      renderPromotions();
      renderPromocodes();
      renderDeliveryZoneList();
      fillZoneForm();
      renderDeliveryMap();
      setBadge(els.passwordStatus, 'Введите пароль для загрузки меню', 'isWarn');
      return;
    }
    setBadge(els.workerStatus, 'Проверка доступа...', 'isWarn');
    await Promise.all([loadMenu(), loadPromotions(), loadPromocodes(), loadDeliveryZones()]);
    state.unlocked = true;
    updateStats();
    updateLockScreen();
    renderProducts();
    renderPromotions();
    renderPromocodes();
    renderDeliveryZoneList();
    fillZoneForm();
    renderDeliveryMap();
    setBadge(els.passwordStatus, 'Пароль принят', 'isOk');
    setBadge(els.workerStatus, 'Worker отвечает', 'isOk');
    setBadge(els.repoStatus, `Источник: ${state.source}${state.repoInfo?.owner ? ` • ${state.repoInfo.owner}/${state.repoInfo.repo}` : ''}`, 'isOk');
    showToast('Данные загружены');
  }

  async function savePromocodes() {
    const currentCodes = JSON.stringify({ promocodes: state.promocodes }, null, 2) + '\n';
    if (currentCodes === state.originalPromocodesJson) return;
    const data = await fetchJson(`${workerUrl}/api/promocodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': state.password
      },
      body: JSON.stringify({
        promocodes: state.promocodes,
        sha: state.promoCodesSha,
        message: `Update promocodes from admin panel ${new Date().toISOString()}`
      })
    });
    state.promoCodesSha = data.sha || state.promoCodesSha;
    state.originalPromocodesJson = JSON.stringify({ promocodes: state.promocodes }, null, 2) + '\n';
  }

  async function saveMenu() {
    const currentMenu = JSON.stringify(state.menu, null, 2) + '\n';
    if (currentMenu === state.originalMenuJson) return;
    const data = await fetchJson(`${workerUrl}/api/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': state.password
      },
      body: JSON.stringify({
        menu: state.menu,
        sha: state.sha,
        message: `Update menu from admin panel ${new Date().toISOString()}`
      })
    });
    state.sha = data.sha || state.sha;
    state.originalMenuJson = JSON.stringify(state.menu, null, 2) + '\n';
  }



  async function saveDeliveryZones() {
    const currentDay = JSON.stringify(state.deliveryZonesDay, null, 2) + '\n';
    const currentNight = JSON.stringify(state.deliveryZonesNight, null, 2) + '\n';
    if (currentDay === state.originalZonesDayJson && currentNight === state.originalZonesNightJson) return;
    const data = await fetchJson(`${workerUrl}/api/delivery-zones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': state.password
      },
      body: JSON.stringify({
        day: state.deliveryZonesDay,
        night: state.deliveryZonesNight,
        daySha: state.deliveryZonesDaySha,
        nightSha: state.deliveryZonesNightSha,
        message: `Update delivery zones from admin panel ${new Date().toISOString()}`
      })
    });
    state.deliveryZonesDaySha = data.daySha || state.deliveryZonesDaySha;
    state.deliveryZonesNightSha = data.nightSha || state.deliveryZonesNightSha;
    state.originalZonesDayJson = JSON.stringify(state.deliveryZonesDay, null, 2) + '\n';
    state.originalZonesNightJson = JSON.stringify(state.deliveryZonesNight, null, 2) + '\n';
  }

  async function saveAll() {
    if (!state.password) {
      openModal('authModal');
      showToast('Сначала введите пароль', true);
      return;
    }
    if (!state.unlocked) {
      showToast('Сначала разблокируйте панель паролем', true);
      return;
    }
    if (!state.dirty) {
      showToast('Изменений нет');
      return;
    }
    if (!workerUrl || workerUrl.includes('REPLACE-WITH-YOUR-WORKER')) {
      showToast('Не настроен workerUrl', true);
      return;
    }
    els.saveBtn.disabled = true;
    try {
      await saveMenu();
      await savePromocodes();
      await saveDeliveryZones();
      updateStats();
      setBadge(els.repoStatus, 'Сохранено в GitHub', 'isOk');
      showToast('Изменения отправлены в GitHub');
    } catch (error) {
      showToast(error.message || 'Ошибка сохранения', true);
    } finally {
      els.saveBtn.disabled = false;
    }
  }

  function resetLockedState() {
    state.unlocked = false;
    state.menu = [];
    state.promotions = [];
    state.promocodes = [];
    state.sha = '';
    state.promoCodesSha = '';
    state.source = '';
    state.repoInfo = null;
    state.originalMenuJson = '[]\n';
    state.originalPromocodesJson = '[]\n';
    state.originalZonesDayJson = '{\n  "type": "FeatureCollection",\n  "features": []\n}\n';
    state.originalZonesNightJson = '{\n  "type": "FeatureCollection",\n  "features": []\n}\n';
    state.deliveryZonesDay = emptyFeatureCollection();
    state.deliveryZonesNight = emptyFeatureCollection();
    state.deliveryZonesDaySha = '';
    state.deliveryZonesNightSha = '';
    state.selectedZoneIndex = -1;
    state.category = 'Все';
    updateStats();
    renderTabs();
    renderProducts();
    renderPromotions();
    renderPromocodes();
    renderDeliveryModeTabs();
    renderDeliveryZoneList();
    fillZoneForm();
    renderDeliveryMap();
    updateLockScreen();
    setBadge(els.workerStatus, 'Ожидает авторизацию', 'isWarn');
    setBadge(els.repoStatus, 'Источник: не загружен', 'isWarn');
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const password = String(new FormData(els.authForm).get('password') || '').trim();
    if (!password) {
      sessionStorage.removeItem(passwordStorageKey);
      state.password = '';
      renderDeliveryModeTabs();
    resetLockedState();
      setBadge(els.passwordStatus, 'Пароль не введён', 'isWarn');
      closeModal('authModal');
      showToast('Пароль очищен');
      return;
    }

    state.password = password;
    sessionStorage.setItem(passwordStorageKey, password);
    try {
      await loadAll();
      closeModal('authModal');
      showToast('Пароль принят');
    } catch (error) {
      sessionStorage.removeItem(passwordStorageKey);
      state.password = '';
      resetLockedState();
      setBadge(els.passwordStatus, 'Неверный пароль', 'isWarn');
      showToast(error.message || 'Неверный пароль', true);
    }
  }

  function bindEvents() {
    els.search?.addEventListener('input', (e) => {
      state.query = e.target.value || '';
      renderProducts();
    });

    els.products?.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn) openEditModal(Number(editBtn.dataset.edit));
      if (deleteBtn) deleteItem(Number(deleteBtn.dataset.delete));
    });

    els.promoGrid?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-promo]');
      if (deleteBtn) deletePromotion(deleteBtn.dataset.deletePromo);
    });

    els.promoCodeList?.addEventListener('input', (e) => {
      const field = e.target.dataset.promoField;
      const index = Number(e.target.dataset.promoIndex);
      if (!field || Number.isNaN(index) || !state.promocodes[index]) return;
      let value = e.target.value;
      if (field === 'percent') value = Number(value || 0);
      if (field === 'active') value = String(value) === 'true';
      state.promocodes[index][field] = value;
      calcDirty();
    });

    els.deliveryZoneList?.addEventListener('click', (e) => {
      const zoneBtn = e.target.closest('[data-zone-index]');
      if (!zoneBtn) return;
      state.selectedZoneIndex = Number(zoneBtn.dataset.zoneIndex);
      renderDeliveryZoneList();
      fillZoneForm();
      renderDeliveryMap();
    });

    els.promoCodeList?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-promocode]');
      if (deleteBtn) deletePromoCode(Number(deleteBtn.dataset.deletePromocode));
    });

    document.getElementById('unlockBtn')?.addEventListener('click', () => openModal('authModal'));
    els.addPromoCodeBtn?.addEventListener('click', addPromoCode);
    els.addZoneBtn?.addEventListener('click', createZone);
    els.editZoneGeometryBtn?.addEventListener('click', startGeometryEditing);
    els.finishZoneGeometryBtn?.addEventListener('click', finishGeometryEditing);
    els.deleteZoneBtn?.addEventListener('click', deleteSelectedZone);
    els.zoneNameInput?.addEventListener('input', (e) => updateZoneField('zone', e.target.value));
    els.zoneRestaurantInput?.addEventListener('input', (e) => updateZoneField('restaurant', e.target.value));
    els.zonePriceInput?.addEventListener('input', (e) => updateZoneField('deliveryPrice', e.target.value));
    els.promoFile?.addEventListener('change', () => {
      const file = els.promoFile.files?.[0];
      if (file) uploadPromotionFile(file);
      els.promoFile.value = '';
    });

    els.imageFile?.addEventListener('change', () => {
      const file = els.imageFile.files?.[0];
      if (!file) {
        updateImagePreview(els.productForm.elements.img.value || '');
        return;
      }
      if (els.imagePathHint) els.imagePathHint.textContent = `Выбран файл: ${file.name} → будет .webp`;
      const tempUrl = URL.createObjectURL(file);
      els.imagePreview.src = tempUrl;
    });

    els.productForm?.addEventListener('submit', saveProductFromForm);
    els.authForm?.addEventListener('submit', handleAuthSubmit);
    els.authBtn?.addEventListener('click', () => openModal('authModal'));
    els.saveBtn?.addEventListener('click', saveAll);
    els.addProductBtn?.addEventListener('click', openCreateModal);
    els.reloadBtn?.addEventListener('click', loadAll);

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('productModal');
        closeModal('authModal');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAll();
      }
    });

    window.addEventListener('beforeunload', (e) => {
      if (!state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function init() {
    bindEvents();
    resetLockedState();
    if (state.password) loadAll().catch(() => {
      sessionStorage.removeItem(passwordStorageKey);
      state.password = '';
      resetLockedState();
    });
  }

  init();
})();
