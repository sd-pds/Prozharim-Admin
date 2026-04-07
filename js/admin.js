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
    backToTop: document.getElementById('backToTop'),
    productModal: document.getElementById('productModal'),
    productForm: document.getElementById('productForm'),
    modalTitle: document.getElementById('modalTitle'),
    authModal: document.getElementById('authModal'),
    authForm: document.getElementById('authForm'),
    authBtn: document.getElementById('authBtn'),
    saveBtn: document.getElementById('saveBtn'),
    addProductBtn: document.getElementById('addProductBtn'),
    reloadBtn: document.getElementById('reloadBtn'),
    passwordStatus: document.getElementById('passwordStatus'),
    workerStatus: document.getElementById('workerStatus'),
    repoStatus: document.getElementById('repoStatus'),
    statTotal: document.getElementById('statTotal'),
    statCategories: document.getElementById('statCategories'),
    statChanged: document.getElementById('statChanged')
  };

  const state = {
    menu: [],
    originalMenuJson: '[]\n',
    category: 'Все',
    query: '',
    password: sessionStorage.getItem(passwordStorageKey) || '',
    sha: '',
    repoInfo: null,
    source: '',
    dirty: false
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

  function calcDirty() {
    const current = JSON.stringify(state.menu, null, 2) + '\n';
    state.dirty = current !== state.originalMenuJson;
    els.statChanged.textContent = state.dirty ? '1+' : '0';
    document.title = `${state.dirty ? '● ' : ''}ПРОЖАРИМ — панель управления меню`;
  }

  function updateStats() {
    els.statTotal.textContent = state.menu.length;
    els.statCategories.textContent = new Set(state.menu.map(item => item.category).filter(Boolean)).size;
    calcDirty();
  }

  function renderTabs() {
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
    if (q) {
      list = list.filter(item => [item.name, item.desc, item.category, item.id].some(v => String(v || '').toLowerCase().includes(q)));
    }
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
    const list = getFilteredMenu();
    els.products.innerHTML = '';
    if (!list.length) {
      els.products.innerHTML = '<div class="emptyState">Ничего не найдено. Попробуйте изменить фильтр или добавить новую позицию.</div>';
      return;
    }

    list.forEach(item => {
      const originalIndex = state.menu.indexOf(item);
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card__body">
          <div class="adminPreview">
            <img class="card__img" src="${escapeHtml(normalizeImg(item.img))}" alt="${escapeHtml(item.name)}" loading="lazy">
            <div>
              <div class="card__cat">${escapeHtml(item.category || 'Без категории')}</div>
              <div class="card__nameRow">
                <div class="card__name">${escapeHtml(item.name || 'Без названия')}</div>
                ${cardActions(originalIndex)}
              </div>
              <div class="card__desc">${escapeHtml(item.desc || 'Описание не заполнено')}</div>
              <div class="card__row">
                <div>
                  <div class="price">${Number(item.price || 0)} ₽</div>
                  <div class="meta">${escapeHtml(item.weight || 'Без веса')} ${item.hit ? '• Хит' : ''}</div>
                </div>
                <div class="muted">${escapeHtml(item.id || '')}</div>
              </div>
            </div>
          </div>
        </div>`;
      els.products.appendChild(card);
    });
  }

  function openModal(id) { document.getElementById(id)?.removeAttribute('hidden'); }
  function closeModal(id) { document.getElementById(id)?.setAttribute('hidden', 'hidden'); }

  function fillProductForm(item = {}, index = '') {
    els.productForm.elements.index.value = index;
    els.productForm.elements.id.value = item.id || '';
    els.productForm.elements.category.value = item.category || '';
    els.productForm.elements.name.value = item.name || '';
    els.productForm.elements.desc.value = item.desc || '';
    els.productForm.elements.price.value = item.price ?? '';
    els.productForm.elements.weight.value = item.weight || '';
    els.productForm.elements.img.value = item.img || '';
    els.productForm.elements.hit.value = String(Boolean(item.hit));
  }

  function openCreateModal() {
    els.modalTitle.textContent = 'Новая позиция';
    fillProductForm({}, '');
    openModal('productModal');
  }

  function openEditModal(index) {
    const item = state.menu[index];
    if (!item) return;
    els.modalTitle.textContent = 'Редактирование позиции';
    fillProductForm(item, String(index));
    openModal('productModal');
  }

  function createIdFromName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/ё/g, 'e');
  }

  function saveProductFromForm(event) {
    event.preventDefault();
    const fd = new FormData(els.productForm);
    const rawName = String(fd.get('name') || '').trim();
    const item = {
      id: String(fd.get('id') || '').trim() || createIdFromName(rawName),
      category: String(fd.get('category') || '').trim(),
      name: rawName,
      desc: String(fd.get('desc') || '').trim(),
      price: Number(fd.get('price') || 0),
      weight: String(fd.get('weight') || '').trim(),
      img: String(fd.get('img') || '').trim(),
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
    if (!workerUrl || workerUrl.includes('REPLACE-WITH-YOUR-WORKER')) {
      setBadge(els.workerStatus, 'Укажите workerUrl в js/config.js', 'isWarn');
      showToast('Сначала настройте js/config.js', true);
      return;
    }
    setBadge(els.workerStatus, 'Загрузка меню...', 'isWarn');
    const data = await fetchJson(`${workerUrl}/api/menu`);
    state.menu = Array.isArray(data.menu) ? data.menu : [];
    state.originalMenuJson = JSON.stringify(state.menu, null, 2) + '\n';
    state.sha = data.sha || '';
    state.repoInfo = data.repo || null;
    state.source = data.source || 'GitHub';
    updateStats();
    renderTabs();
    renderProducts();
    setBadge(els.workerStatus, 'Worker отвечает', 'isOk');
    setBadge(els.repoStatus, `Источник: ${state.source}${state.repoInfo?.owner ? ` • ${state.repoInfo.owner}/${state.repoInfo.repo}` : ''}`, 'isOk');
    showToast('Меню загружено');
  }

  async function saveMenu() {
    if (!state.password) {
      openModal('authModal');
      showToast('Сначала введите пароль', true);
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
      updateStats();
      setBadge(els.repoStatus, `Сохранено: ${data.commit?.slice(0, 7) || 'ok'}`, 'isOk');
      showToast('Изменения отправлены в GitHub');
    } catch (error) {
      showToast(error.message || 'Ошибка сохранения', true);
    } finally {
      els.saveBtn.disabled = false;
    }
  }

  function handleAuthSubmit(event) {
    event.preventDefault();
    const password = String(new FormData(els.authForm).get('password') || '').trim();
    state.password = password;
    sessionStorage.setItem(passwordStorageKey, password);
    setBadge(els.passwordStatus, password ? 'Пароль введён' : 'Пароль не введён', password ? 'isOk' : 'isWarn');
    closeModal('authModal');
    showToast(password ? 'Пароль сохранён в текущей сессии' : 'Пароль очищен');
  }

  function bindEvents() {
    els.search.addEventListener('input', (e) => {
      state.query = e.target.value || '';
      renderProducts();
    });

    els.products.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn) openEditModal(Number(editBtn.dataset.edit));
      if (deleteBtn) deleteItem(Number(deleteBtn.dataset.delete));
    });

    els.productForm.addEventListener('submit', saveProductFromForm);
    els.authForm.addEventListener('submit', handleAuthSubmit);
    els.authBtn.addEventListener('click', () => openModal('authModal'));
    els.saveBtn.addEventListener('click', saveMenu);
    els.addProductBtn.addEventListener('click', openCreateModal);
    els.reloadBtn.addEventListener('click', () => loadMenu().catch(err => showToast(err.message, true)));
    els.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => closeModal(el.dataset.close));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('productModal');
        closeModal('authModal');
      }
    });

    window.addEventListener('beforeunload', (e) => {
      if (!state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function init() {
    setBadge(els.passwordStatus, state.password ? 'Пароль введён' : 'Пароль не введён', state.password ? 'isOk' : 'isWarn');
    setBadge(els.workerStatus, workerUrl && !workerUrl.includes('REPLACE-WITH-YOUR-WORKER') ? 'Worker настроен' : 'Укажите workerUrl в js/config.js', workerUrl && !workerUrl.includes('REPLACE-WITH-YOUR-WORKER') ? 'isOk' : 'isWarn');
    setBadge(els.repoStatus, 'Источник: не загружен', 'isWarn');
    bindEvents();
    loadMenu().catch(error => showToast(error.message || 'Не удалось загрузить меню', true));
  }

  init();
})();
