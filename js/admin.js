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
    promoCodeList: document.getElementById('promoCodeList')
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
    unlocked: false
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
    state.dirty = currentMenu !== state.originalMenuJson || currentCodes !== state.originalPromocodesJson;
    if (els.statChanged) els.statChanged.textContent = state.dirty ? '1+' : '0';
    document.title = `${state.dirty ? '● ' : ''}ПРОЖАРИМ — панель управления меню`;
  }

  function updateStats() {
    if (els.statTotal) els.statTotal.textContent = state.menu.length;
    if (els.statCategories) els.statCategories.textContent = new Set(state.menu.map(item => item.category).filter(Boolean)).size;
    calcDirty();
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
      els.products.innerHTML = '<div class="emptyState">Введите пароль панели, чтобы загрузить и редактировать меню.</div>';
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
      els.promoGrid.innerHTML = '<div class="emptyState emptyState--glass">Введите пароль, чтобы увидеть и редактировать баннеры акций.</div>';
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
      els.promoCodeList.innerHTML = '<div class="emptyState emptyState--glass">Введите пароль, чтобы увидеть и редактировать промокоды.</div>';
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
          <span>Код</span>
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
    calcDirty();
    renderPromocodes();
  }

  function deletePromoCode(index) {
    if (!state.promocodes[index]) return;
    if (!confirm('Удалить промокод?')) return;
    state.promocodes.splice(index, 1);
    calcDirty();
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
    renderPromotions();
  }

  async function loadPromocodes() {
    const data = await fetchJson(`${workerUrl}/api/promocodes`, {
      headers: { 'x-admin-password': state.password }
    });
    state.promocodes = Array.isArray(data.promocodes) ? data.promocodes : [];
    state.originalPromocodesJson = JSON.stringify({ promocodes: state.promocodes }, null, 2) + '\n';
    state.promoCodesSha = data.sha || '';
    renderPromocodes();
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
      setBadge(els.passwordStatus, 'Введите пароль для загрузки меню', 'isWarn');
      return;
    }
    setBadge(els.workerStatus, 'Проверка доступа...', 'isWarn');
    await Promise.all([loadMenu(), loadPromotions(), loadPromocodes()]);
    state.unlocked = true;
    updateStats();
    updateLockScreen();
    renderProducts();
    renderPromotions();
    renderPromocodes();
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
    state.category = 'Все';
    updateStats();
    renderTabs();
    renderProducts();
    renderPromotions();
    renderPromocodes();
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

    els.promoCodeList?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-promocode]');
      if (deleteBtn) deletePromoCode(Number(deleteBtn.dataset.deletePromocode));
    });

    document.getElementById('unlockBtn')?.addEventListener('click', () => openModal('authModal'));
    els.addPromoCodeBtn?.addEventListener('click', addPromoCode);
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
