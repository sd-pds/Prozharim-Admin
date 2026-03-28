const DEFAULT_API_BASE = "https://api.полихов.рф";
const CONFIG_PATHS = {
  site: 'config/site.json',
  theme: 'config/theme.json',
  notifications: 'config/notifications.json',
  customCss: 'css/custom-theme.css'
};

const state = {
  apiBase: DEFAULT_API_BASE,
  adminToken: localStorage.getItem('proz_admin_token') || '',
  siteConfig: {},
  themeConfig: {},
  notificationsConfig: {},
  customCss: '',
  menu: [],
  currentMenuIndex: -1,
  zones: null,
  selectedZoneIndex: -1,
  zoneObjects: [],
  zoneMap: null,
  currentZonePath: 'data/zones_day.geojson'
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('isOn');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('isOn'), 2600);
}
function setConnectionState(text, mode = '') {
  const el = $('#connectState');
  el.textContent = text;
  el.className = `connectState ${mode}`.trim();
}
function setAuthBusy(isBusy) {
  const btn = $('#saveAuthBtn');
  btn.disabled = isBusy;
  btn.textContent = isBusy ? 'Проверка...' : 'Подключиться';
}
function safeJsonParse(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}
function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>\"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}
function nlToArray(value) {
  return String(value || '').split('\n').map(x => x.trim()).filter(Boolean);
}
function arrayToNl(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}
function pretty(value) {
  return JSON.stringify(value ?? {}, null, 2);
}
function ensureObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}
function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

async function verifyConnection(token) {
  const res = await fetch(`${state.apiBase}/admin/ping`, { headers: { 'X-Admin-Token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Код ошибки API1. Обратитесь к разработчику.');
  if (!data.hasGithub) throw new Error('Код ошибки WGE1. Обратитесь к разработчику.');
  return data;
}
async function saveAuth() {
  const token = $('#adminToken').value.trim();
  if (!token) return showToast('Введите пароль');
  setAuthBusy(true);
  setConnectionState('Проверка подключения...', 'pending');
  try {
    await verifyConnection(token);
    state.adminToken = token;
    localStorage.setItem('proz_admin_token', token);
    setConnectionState('Подключение установлено.', 'success');
    showToast('Подключение установлено');
    await bootstrapData();
  } catch (err) {
    setConnectionState(err.message || 'Ошибка подключения', 'error');
    showToast(err.message || 'Ошибка подключения');
  } finally {
    setAuthBusy(false);
  }
}
async function api(path, options = {}) {
  if (!state.adminToken) throw new Error('Сначала введи пароль');
  const headers = { 'X-Admin-Token': state.adminToken, ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${state.apiBase}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Код ошибки API1. Обратитесь к разработчику.');
  return data;
}
async function saveFile(path, content, message) {
  return api('/admin/github/save-json', {
    method: 'POST',
    body: JSON.stringify({ path, content, message })
  });
}
async function saveTextFile(path, content, message) {
  return api('/admin/github/save-json', {
    method: 'POST',
    body: JSON.stringify({ path, content, message })
  });
}
async function getFile(path) {
  return api(`/admin/github/file?path=${encodeURIComponent(path)}`);
}

function initNav() {
  $$('.nav__btn').forEach(btn => btn.addEventListener('click', () => {
    $$('.nav__btn').forEach(x => x.classList.remove('isOn'));
    $$('.tab').forEach(x => x.classList.remove('isOn'));
    btn.classList.add('isOn');
    $(`#tab-${btn.dataset.tab}`).classList.add('isOn');
  }));
}

function renderThemePreview() {
  const preview = $('#themePreview');
  const preset = $('#themePresetInput').value;
  const mode = $('#themeModeInput').value;
  const gradients = {
    red: ['#ff2b2b', '#ff5a2b'], orange: ['#ff7a18', '#ff9f1a'], yellow: ['#e8b100', '#ffd000'],
    green: ['#12b76a', '#24d17e'], cyan: ['#00bcd4', '#22d3ee'], blue: ['#2563eb', '#3b82f6'],
    purple: ['#7c3aed', '#a855f7'], gray: ['#6b7280', '#9ca3af'], black: ['#111111', '#2b2b2b']
  };
  const bg = mode === 'light' ? 'linear-gradient(145deg,#ffffff,#eef2f7)' : 'linear-gradient(145deg,#181c24,#0d0f14)';
  const [c1, c2] = gradients[preset] || gradients.red;
  preview.style.background = `${bg}, linear-gradient(135deg, ${c1}, ${c2})`;
  preview.style.boxShadow = `inset 0 0 0 1px rgba(255,255,255,.06), 0 20px 50px rgba(0,0,0,.18)`;
  preview.style.borderColor = mode === 'light' ? 'rgba(15,23,42,.12)' : 'rgba(255,255,255,.08)';
}

function hydrateFormsFromConfigs() {
  const site = ensureObject(state.siteConfig);
  const theme = ensureObject(state.themeConfig);
  const notifications = ensureObject(state.notificationsConfig);

  setValue('seoTitleInput', site.seo?.title);
  setValue('seoDescriptionInput', site.seo?.description);
  setValue('seoKeywordsInput', site.seo?.keywords);
  setValue('canonicalInput', site.seo?.canonical);
  setValue('brandNameInput', site.brand?.name);
  setValue('brandSubInput', site.brand?.sub);
  setValue('brandLogoInput', site.brand?.logo);
  setValue('cityPillInput', site.brand?.cityPill);
  setValue('heroTitleInput', site.hero?.title);
  setValue('heroAccentInput', site.hero?.accent);
  setValue('heroDescInput', site.hero?.description);
  setValue('heroPrimaryInput', site.hero?.ctaPrimary);
  setValue('heroSecondaryInput', site.hero?.ctaSecondary);
  setValue('hitsBadgeInput', site.hero?.hitsBadge);
  setValue('hitsTitleInput', site.hero?.hitsTitle);
  setValue('hitsHintInput', site.hero?.hitsHint);
  setValue('statsInput', pretty(site.stats || []));
  setValue('footerTextInput', site.footer?.text);
  setValue('footerPolicyInput', site.footer?.policyLabel);
  setValue('minDeliverySubtotalInput', site.businessRules?.minDeliverySubtotal);
  setValue('smallOrderSurchargeInput', site.businessRules?.smallOrderDeliverySurcharge);
  setValue('nightStartInput', site.businessRules?.nightStart);
  setValue('nightEndInput', site.businessRules?.nightEnd);
  setValue('closedStartInput', site.businessRules?.closedStart);
  setValue('closedEndInput', site.businessRules?.closedEnd);
  setValue('preorderBlockedStartInput', site.businessRules?.preorderBlockedStart);
  setValue('preorderBlockedEndInput', site.businessRules?.preorderBlockedEnd);

  setValue('themePresetInput', theme.preset || 'red');
  setValue('themeModeInput', theme.mode || 'dark');
  setValue('themeRadiusInput', theme.radius ?? 18);
  setValue('themeRadiusLargeInput', theme.radiusLarge ?? 24);
  setValue('customCssPathInput', theme.customCssPath || 'css/custom-theme.css');

  setValue('navMenuInput', site.navigation?.menu);
  setValue('navPromotionsInput', site.navigation?.promotions);
  setValue('navDeliveryInput', site.navigation?.delivery);
  setValue('navContactsInput', site.navigation?.contacts);
  setValue('contactsTitleInput', site.contacts?.title);
  setValue('phonesInput', arrayToNl(site.contacts?.phones));
  setValue('socialButtonsInput', pretty(site.contacts?.socialButtons || []));
  setValue('deliveryTitleInput', site.delivery?.title);
  setValue('pickupTitleInput', site.delivery?.pickupTitle);
  setValue('deliveryCardTitleInput', site.delivery?.deliveryTitle);
  setValue('pickupTextInput', site.delivery?.pickupText);
  setValue('deliveryCardTextInput', site.delivery?.deliveryText);
  setValue('pickupPointsInput', arrayToNl(site.delivery?.pickupPoints));
  setValue('paymentTitleInput', site.delivery?.paymentTitle);
  setValue('paymentItemsInput', arrayToNl(site.delivery?.paymentItems));
  setValue('promotionsInput', pretty(site.promotions || []));
  setValue('seoBlockTitleInput', site.seoText?.title);
  setValue('seoParagraphsInput', arrayToNl(site.seoText?.paragraphs));

  setValue('orderApiUrlInput', notifications.orderApiUrl);
  setValue('routingNotesInput', notifications.routingNotes);
  setValue('channelsInput', pretty(notifications.channels || {}));

  setValue('rawSiteJson', pretty(site));
  setValue('rawThemeJson', pretty(theme));
  setValue('rawNotificationsJson', pretty(notifications));
  setValue('customCssInput', state.customCss || '');

  renderThemePreview();
}

function buildSiteConfigFromForms() {
  const prev = ensureObject(state.siteConfig);
  const stats = safeJsonParse($('#statsInput').value, prev.stats || []);
  if (!Array.isArray(stats)) throw new Error('Статистика должна быть JSON-массивом');
  const socials = safeJsonParse($('#socialButtonsInput').value, prev.contacts?.socialButtons || []);
  if (!Array.isArray(socials)) throw new Error('Кнопки контактов должны быть JSON-массивом');
  const promotions = safeJsonParse($('#promotionsInput').value, prev.promotions || []);
  if (!Array.isArray(promotions)) throw new Error('Акции должны быть JSON-массивом');

  return {
    ...prev,
    seo: {
      ...(prev.seo || {}),
      title: $('#seoTitleInput').value.trim(),
      description: $('#seoDescriptionInput').value.trim(),
      keywords: $('#seoKeywordsInput').value.trim(),
      canonical: $('#canonicalInput').value.trim()
    },
    brand: {
      ...(prev.brand || {}),
      name: $('#brandNameInput').value.trim(),
      sub: $('#brandSubInput').value.trim(),
      logo: $('#brandLogoInput').value.trim(),
      cityPill: $('#cityPillInput').value.trim()
    },
    hero: {
      ...(prev.hero || {}),
      title: $('#heroTitleInput').value.trim(),
      accent: $('#heroAccentInput').value.trim(),
      description: $('#heroDescInput').value.trim(),
      ctaPrimary: $('#heroPrimaryInput').value.trim(),
      ctaSecondary: $('#heroSecondaryInput').value.trim(),
      hitsBadge: $('#hitsBadgeInput').value.trim(),
      hitsTitle: $('#hitsTitleInput').value.trim(),
      hitsHint: $('#hitsHintInput').value.trim()
    },
    stats,
    footer: {
      ...(prev.footer || {}),
      text: $('#footerTextInput').value,
      policyLabel: $('#footerPolicyInput').value.trim()
    },
    businessRules: {
      ...(prev.businessRules || {}),
      minDeliverySubtotal: Number($('#minDeliverySubtotalInput').value || 0),
      smallOrderDeliverySurcharge: Number($('#smallOrderSurchargeInput').value || 0),
      nightStart: Number($('#nightStartInput').value || 0),
      nightEnd: Number($('#nightEndInput').value || 0),
      closedStart: Number($('#closedStartInput').value || 0),
      closedEnd: Number($('#closedEndInput').value || 0),
      preorderBlockedStart: Number($('#preorderBlockedStartInput').value || 0),
      preorderBlockedEnd: Number($('#preorderBlockedEndInput').value || 0)
    },
    navigation: {
      ...(prev.navigation || {}),
      menu: $('#navMenuInput').value.trim(),
      promotions: $('#navPromotionsInput').value.trim(),
      delivery: $('#navDeliveryInput').value.trim(),
      contacts: $('#navContactsInput').value.trim()
    },
    contacts: {
      ...(prev.contacts || {}),
      title: $('#contactsTitleInput').value.trim(),
      phones: nlToArray($('#phonesInput').value),
      socialButtons: socials
    },
    delivery: {
      ...(prev.delivery || {}),
      title: $('#deliveryTitleInput').value.trim(),
      pickupTitle: $('#pickupTitleInput').value.trim(),
      deliveryTitle: $('#deliveryCardTitleInput').value.trim(),
      pickupText: $('#pickupTextInput').value.trim(),
      deliveryText: $('#deliveryCardTextInput').value.trim(),
      pickupPoints: nlToArray($('#pickupPointsInput').value),
      paymentTitle: $('#paymentTitleInput').value.trim(),
      paymentItems: nlToArray($('#paymentItemsInput').value)
    },
    promotions,
    seoText: {
      ...(prev.seoText || {}),
      title: $('#seoBlockTitleInput').value.trim(),
      paragraphs: nlToArray($('#seoParagraphsInput').value)
    }
  };
}

function buildThemeConfigFromForms() {
  const prev = ensureObject(state.themeConfig);
  return {
    ...prev,
    preset: $('#themePresetInput').value,
    mode: $('#themeModeInput').value,
    radius: Number($('#themeRadiusInput').value || 18),
    radiusLarge: Number($('#themeRadiusLargeInput').value || 24),
    customCssPath: $('#customCssPathInput').value.trim() || 'css/custom-theme.css'
  };
}
function buildNotificationsConfigFromForms() {
  const prev = ensureObject(state.notificationsConfig);
  const channels = safeJsonParse($('#channelsInput').value, prev.channels || {});
  if (!channels || typeof channels !== 'object' || Array.isArray(channels)) throw new Error('Каналы должны быть объектом JSON');
  return {
    ...prev,
    orderApiUrl: $('#orderApiUrlInput').value.trim(),
    routingNotes: $('#routingNotesInput').value,
    channels
  };
}
function syncRawEditorsFromState() {
  setValue('rawSiteJson', pretty(state.siteConfig));
  setValue('rawThemeJson', pretty(state.themeConfig));
  setValue('rawNotificationsJson', pretty(state.notificationsConfig));
}
function syncStateFromRawEditors() {
  const site = safeJsonParse($('#rawSiteJson').value);
  const theme = safeJsonParse($('#rawThemeJson').value);
  const notifications = safeJsonParse($('#rawNotificationsJson').value);
  if (!site || !theme || !notifications) throw new Error('Проверь JSON: один из файлов содержит ошибку');
  state.siteConfig = site;
  state.themeConfig = theme;
  state.notificationsConfig = notifications;
  state.customCss = $('#customCssInput').value;
}
async function loadConfigs() {
  const [siteData, themeData, notificationsData, customCssData] = await Promise.all([
    getFile(CONFIG_PATHS.site),
    getFile(CONFIG_PATHS.theme),
    getFile(CONFIG_PATHS.notifications),
    getFile(CONFIG_PATHS.customCss)
  ]);
  state.siteConfig = siteData.parsed || {};
  state.themeConfig = themeData.parsed || {};
  state.notificationsConfig = notificationsData.parsed || {};
  state.customCss = customCssData.content || '';
  hydrateFormsFromConfigs();
}
async function saveOverview() {
  state.siteConfig = buildSiteConfigFromForms();
  syncRawEditorsFromState();
  await saveFile(CONFIG_PATHS.site, state.siteConfig, 'Update site config from admin panel');
  showToast('Общие настройки сохранены');
}
async function saveTheme() {
  state.themeConfig = buildThemeConfigFromForms();
  syncRawEditorsFromState();
  await saveFile(CONFIG_PATHS.theme, state.themeConfig, 'Update theme config from admin panel');
  showToast('Оформление сохранено');
}
async function saveContent() {
  state.siteConfig = buildSiteConfigFromForms();
  syncRawEditorsFromState();
  await saveFile(CONFIG_PATHS.site, state.siteConfig, 'Update content config from admin panel');
  showToast('Контент сохранён');
}
async function saveNotifications() {
  state.notificationsConfig = buildNotificationsConfigFromForms();
  syncRawEditorsFromState();
  await saveFile(CONFIG_PATHS.notifications, state.notificationsConfig, 'Update notifications config from admin panel');
  showToast('Уведомления сохранены');
}
async function saveAdvanced() {
  syncStateFromRawEditors();
  await Promise.all([
    saveFile(CONFIG_PATHS.site, state.siteConfig, 'Update raw site config from admin panel'),
    saveFile(CONFIG_PATHS.theme, state.themeConfig, 'Update raw theme config from admin panel'),
    saveFile(CONFIG_PATHS.notifications, state.notificationsConfig, 'Update raw notifications config from admin panel'),
    saveTextFile(CONFIG_PATHS.customCss, state.customCss, 'Update custom CSS from admin panel')
  ]);
  hydrateFormsFromConfigs();
  showToast('Продвинутые настройки сохранены');
}
function syncFromForms() {
  state.siteConfig = buildSiteConfigFromForms();
  state.themeConfig = buildThemeConfigFromForms();
  state.notificationsConfig = buildNotificationsConfigFromForms();
  state.customCss = $('#customCssInput').value;
  syncRawEditorsFromState();
  showToast('JSON обновлён из форм');
}

async function bootstrapData() {
  await Promise.all([loadConfigs(), loadMenu(), loadZones()]);
}

function flipLngLatToLatLng(coords) {
  if (!Array.isArray(coords)) return coords;
  if (coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') return [coords[1], coords[0]];
  return coords.map(flipLngLatToLatLng);
}
function flipLatLngToLngLat(coords) {
  if (!Array.isArray(coords)) return coords;
  if (coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') return [coords[1], coords[0]];
  return coords.map(flipLatLngToLngLat);
}

async function loadMenu() {
  const data = await getFile('data/menu.json');
  state.menu = Array.isArray(data.parsed) ? data.parsed : [];
  renderMenuTable();
  selectMenuItem(state.menu.length ? 0 : -1);
}
function renderMenuTable() {
  const q = ($('#menuSearch').value || '').trim().toLowerCase();
  const body = $('#menuTable tbody');
  const filtered = state.menu.map((item, index) => ({ item, index }))
    .filter(({ item }) => !q || [item.id, item.name, item.category].filter(Boolean).join(' ').toLowerCase().includes(q));
  body.innerHTML = filtered.map(({ item, index }) => `
    <tr data-index="${index}" class="${index === state.currentMenuIndex ? 'isOn' : ''}">
      <td>${htmlEscape(item.id || '')}</td>
      <td>${htmlEscape(item.name || '')}</td>
      <td>${htmlEscape(item.category || '')}</td>
      <td>${htmlEscape(item.price || '')}</td>
      <td>${htmlEscape(item.weight || '')}</td>
      <td><button class="btn" type="button">Открыть</button></td>
    </tr>`).join('');
  body.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => selectMenuItem(Number(tr.dataset.index))));
}
function getItemVariants(item = {}) {
  const variants = [];
  if (item.price !== undefined || item.weight !== undefined) variants.push({ price: item.price ?? '', weight: item.weight ?? '' });
  for (let i = 2; i <= 20; i++) {
    if (Object.prototype.hasOwnProperty.call(item, `price${i}`) || Object.prototype.hasOwnProperty.call(item, `weight${i}`)) {
      variants.push({ price: item[`price${i}`] ?? '', weight: item[`weight${i}`] ?? '' });
    }
  }
  return variants.length ? variants : [{ price: '', weight: '' }];
}
function renderVariantRows(variants) {
  const wrap = $('#menuVariants');
  wrap.innerHTML = (variants || []).map((variant, index) => `
    <div class="variantRow" data-variant-index="${index}">
      <label>Цена ${index + 1}<input class="variantPrice" type="number" value="${variant.price ?? ''}" /></label>
      <label>Вес/объём ${index + 1}<input class="variantWeight" value="${htmlEscape(variant.weight ?? '')}" /></label>
      <button class="btn ${index === 0 ? '' : 'btn--danger'} variantRemoveBtn" type="button" ${index === 0 ? 'disabled' : ''}>${index === 0 ? 'Основной' : 'Удалить'}</button>
    </div>`).join('');
  $$('.variantRemoveBtn').forEach(btn => btn.addEventListener('click', () => {
    const row = btn.closest('.variantRow');
    removeVariantRow(Number(row?.dataset.variantIndex));
  }));
}
function readVariantRows() {
  return $$('.variantRow').map(row => ({
    price: row.querySelector('.variantPrice')?.value ?? '',
    weight: row.querySelector('.variantWeight')?.value?.trim?.() ?? ''
  }));
}
function addVariantRow() {
  const variants = readVariantRows();
  variants.push({ price: '', weight: '' });
  renderVariantRows(variants);
}
function removeVariantRow(index) {
  const variants = readVariantRows();
  if (index <= 0 || variants.length <= 1) return;
  variants.splice(index, 1);
  renderVariantRows(variants);
}
function selectMenuItem(index) {
  state.currentMenuIndex = index;
  const item = state.menu[index] || {};
  $('#menuEditorTitle').textContent = item.name ? `Редактирование: ${item.name}` : 'Новая позиция';
  $('#menuId').value = item.id || '';
  $('#menuCategory').value = item.category || '';
  $('#menuName').value = item.name || '';
  $('#menuDesc').value = item.desc || '';
  renderVariantRows(getItemVariants(item));
  $('#menuHit').value = String(Boolean(item.hit));
  $('#menuImg').value = item.img || '';
  $('#menuPreview').src = item.img || '';
  renderMenuTable();
}
function readMenuEditor() {
  const variants = readVariantRows().map(v => ({ price: v.price === '' ? '' : Number(v.price), weight: String(v.weight || '').trim() }))
    .filter((v, index) => index === 0 || v.price !== '' || v.weight !== '');
  const item = {
    id: $('#menuId').value.trim(),
    category: $('#menuCategory').value.trim(),
    name: $('#menuName').value.trim(),
    desc: $('#menuDesc').value.trim(),
    hit: $('#menuHit').value === 'true',
    img: $('#menuImg').value.trim()
  };
  item.price = variants[0] ? (variants[0].price === '' ? 0 : variants[0].price) : 0;
  item.weight = variants[0]?.weight || '';
  for (let i = 1; i < variants.length; i++) {
    const suffix = i + 1;
    item[`price${suffix}`] = variants[i].price === '' ? 0 : variants[i].price;
    item[`weight${suffix}`] = variants[i].weight;
  }
  return item;
}
function applyMenuItem() {
  const item = readMenuEditor();
  if (!item.id || !item.name) return showToast('У позиции должны быть ID и название');
  const duplicateIndex = state.menu.findIndex((x, i) => x.id === item.id && i !== state.currentMenuIndex);
  if (duplicateIndex >= 0) return showToast('Такой ID уже существует');
  if (state.currentMenuIndex >= 0) state.menu[state.currentMenuIndex] = item;
  else {
    state.menu.unshift(item);
    state.currentMenuIndex = 0;
  }
  renderMenuTable();
  showToast('Позиция применена в локальный список');
}
function addMenuItem() { state.currentMenuIndex = -1; selectMenuItem(-1); }
function deleteMenuItem() {
  if (state.currentMenuIndex < 0) return showToast('Сначала выбери позицию');
  state.menu.splice(state.currentMenuIndex, 1);
  state.currentMenuIndex = -1;
  renderMenuTable();
  addMenuItem();
  showToast('Позиция удалена из локального списка');
}
async function saveMenu() {
  await saveFile('data/menu.json', state.menu, 'Update menu from admin panel');
  showToast('Меню сохранено на сервере');
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function translitFilename(name) { return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]+/g, '-'); }
async function uploadMenuImage() {
  const file = $('#menuImageFile').files[0];
  if (!file) return showToast('Выбери файл изображения');
  const base64 = await fileToBase64(file);
  const safeName = translitFilename(file.name);
  const data = await api('/admin/github/upload-image', {
    method: 'POST',
    body: JSON.stringify({ filename: safeName, contentBase64: base64, folder: 'assets/photos' })
  });
  $('#menuImg').value = data.publicPath;
  $('#menuPreview').src = data.publicPath;
  showToast('Фото загружено на сервер');
}

async function initZones() {
  await new Promise(resolve => ymaps.ready(resolve));
  state.zoneMap = new ymaps.Map('zonesMap', { center: [51.7682, 55.0968], zoom: 11, controls: ['zoomControl'] });
}
async function loadZones() {
  state.currentZonePath = $('#zoneFileSelect').value;
  const data = await getFile(state.currentZonePath);
  state.zones = data.parsed || { type: 'FeatureCollection', features: [] };
  renderZones();
}
function renderZones() {
  state.zoneObjects.forEach(obj => state.zoneMap.geoObjects.remove(obj));
  state.zoneObjects = [];
  const list = $('#zoneList');
  const features = state.zones?.features || [];
  list.innerHTML = features.length ? '' : '<div class="emptyState">Зоны не загружены</div>';
  features.forEach((feature, index) => {
    const rawCoords = feature.geometry?.type === 'Polygon' ? feature.geometry.coordinates : [];
    const ymapsCoords = flipLngLatToLatLng(rawCoords);
    const polygon = new ymaps.Polygon(ymapsCoords, { hintContent: feature.properties?.zone || `Зона ${index + 1}`, balloonContent: feature.properties?.restaurant || '' }, { fillColor: index === state.selectedZoneIndex ? 'rgba(255,122,61,0.35)' : 'rgba(255,255,255,0.12)', strokeColor: '#ff7b3d', strokeWidth: 3, draggable: false });
    polygon.events.add('click', () => selectZone(index));
    state.zoneMap.geoObjects.add(polygon);
    state.zoneObjects.push(polygon);
    const div = document.createElement('div');
    div.className = `zoneItem ${index === state.selectedZoneIndex ? 'isOn' : ''}`;
    div.innerHTML = `<strong>${htmlEscape(feature.properties?.zone || `Зона ${index + 1}`)}</strong><div>${htmlEscape(feature.properties?.restaurant || '—')} · ${htmlEscape(feature.properties?.deliveryPrice || 0)} ₽</div>`;
    div.addEventListener('click', () => selectZone(index));
    list.appendChild(div);
  });
}
function selectZone(index) {
  state.selectedZoneIndex = index;
  const feature = state.zones.features[index];
  if (!feature) return;
  $('#zoneName').value = feature.properties?.zone || '';
  $('#zonePrice').value = feature.properties?.deliveryPrice || 0;
  $('#zoneRestaurant').value = feature.properties?.restaurant || 'Театральная 1/1';
  renderZones();
}
function addZone() {
  if (!state.zones) state.zones = { type: 'FeatureCollection', features: [] };
  const feature = { type: 'Feature', properties: { zone: `Новая зона ${state.zones.features.length + 1}`, deliveryPrice: 0, restaurant: 'Театральная 1/1' }, geometry: { type: 'Polygon', coordinates: [[]] } };
  state.zones.features.push(feature);
  state.selectedZoneIndex = state.zones.features.length - 1;
  renderZones();
  selectZone(state.selectedZoneIndex);
  startZoneDrawing();
}
function currentZoneObject() { return state.zoneObjects[state.selectedZoneIndex] || null; }
function startZoneDrawing() { const obj = currentZoneObject(); if (!obj) return showToast('Сначала выбери или создай полигон'); obj.editor.startDrawing(); showToast('Кликай по карте, чтобы рисовать полигон. Двойной клик завершит.'); }
function startZoneEditing() { const obj = currentZoneObject(); if (!obj) return showToast('Сначала выбери полигон'); obj.editor.startEditing(); showToast('Перетаскивай точки границы, затем нажми «Завершить редактирование»'); }
function stopZoneEditing() { const obj = currentZoneObject(); if (!obj) return; try { obj.editor.stopEditing(); } catch {} try { obj.editor.stopDrawing(); } catch {} syncSelectedZoneGeometry(); showToast('Геометрия обновлена локально'); }
function syncSelectedZoneGeometry() { const obj = currentZoneObject(); const feature = state.zones?.features?.[state.selectedZoneIndex]; if (!obj || !feature) return; feature.geometry.coordinates = flipLatLngToLngLat(obj.geometry.getCoordinates()); }
function applyZoneProps() { const feature = state.zones?.features?.[state.selectedZoneIndex]; if (!feature) return showToast('Сначала выбери зону'); feature.properties = { ...(feature.properties || {}), zone: $('#zoneName').value.trim(), deliveryPrice: Number($('#zonePrice').value || 0), restaurant: $('#zoneRestaurant').value }; renderZones(); showToast('Свойства зоны применены'); }
function deleteZone() { if (state.selectedZoneIndex < 0) return showToast('Сначала выбери зону'); state.zones.features.splice(state.selectedZoneIndex, 1); state.selectedZoneIndex = -1; renderZones(); showToast('Зона удалена локально'); }
async function saveZones() { syncSelectedZoneGeometry(); await saveFile(state.currentZonePath, state.zones, `Update ${state.currentZonePath} from admin panel`); showToast('Файл зон сохранён на сервере'); }

function bindEvents() {
  $('#adminToken').value = state.adminToken;
  $('#saveAuthBtn').addEventListener('click', saveAuth);
  $('#loadConfigsBtn').addEventListener('click', () => loadConfigs().then(() => showToast('Настройки загружены')).catch(err => showToast(err.message)));
  $('#saveOverviewBtn').addEventListener('click', () => saveOverview().catch(err => showToast(err.message)));
  $('#saveThemeBtn').addEventListener('click', () => saveTheme().catch(err => showToast(err.message)));
  $('#saveContentBtn').addEventListener('click', () => saveContent().catch(err => showToast(err.message)));
  $('#saveNotificationsBtn').addEventListener('click', () => saveNotifications().catch(err => showToast(err.message)));
  $('#syncFromFormsBtn').addEventListener('click', () => { try { syncFromForms(); } catch (err) { showToast(err.message); } });
  $('#saveAdvancedBtn').addEventListener('click', () => saveAdvanced().catch(err => showToast(err.message)));
  $('#themePresetInput').addEventListener('change', renderThemePreview);
  $('#themeModeInput').addEventListener('change', renderThemePreview);

  $('#loadMenuBtn').addEventListener('click', () => loadMenu().catch(err => showToast(err.message)));
  $('#saveMenuBtn').addEventListener('click', () => saveMenu().catch(err => showToast(err.message)));
  $('#addMenuItemBtn').addEventListener('click', addMenuItem);
  $('#applyMenuItemBtn').addEventListener('click', applyMenuItem);
  $('#deleteMenuItemBtn').addEventListener('click', deleteMenuItem);
  $('#uploadMenuImageBtn').addEventListener('click', () => uploadMenuImage().catch(err => showToast(err.message)));
  $('#menuSearch').addEventListener('input', renderMenuTable);
  $('#addVariantBtn').addEventListener('click', addVariantRow);
  $('#menuImg').addEventListener('input', () => { $('#menuPreview').src = $('#menuImg').value.trim(); });

  $('#loadZonesBtn').addEventListener('click', () => loadZones().catch(err => showToast(err.message)));
  $('#saveZonesBtn').addEventListener('click', () => saveZones().catch(err => showToast(err.message)));
  $('#addZoneBtn').addEventListener('click', addZone);
  $('#editZoneBtn').addEventListener('click', startZoneEditing);
  $('#stopEditZoneBtn').addEventListener('click', stopZoneEditing);
  $('#deleteZoneBtn').addEventListener('click', deleteZone);
  $('#applyZonePropsBtn').addEventListener('click', applyZoneProps);
}

(async function init() {
  initNav();
  bindEvents();
  await initZones();
  if (state.adminToken) {
    setConnectionState('Проверка сохранённого пароля...', 'pending');
    verifyConnection(state.adminToken)
      .then(async () => {
        setConnectionState('Подключение установлено.', 'success');
        await bootstrapData();
      })
      .catch(() => setConnectionState('Сохранённый пароль недействителен. Введи пароль заново.', 'error'));
  }
})();
