const DEFAULT_API_BASE = "https://prozharim-oreder-api.polihov-alexey-a.workers.dev";

const state = {
  apiBase: DEFAULT_API_BASE,
  adminToken: localStorage.getItem("proz_admin_token") || "",
  menu: [],
  currentMenuIndex: -1,
  zones: null,
  selectedZoneIndex: -1,
  zoneObjects: [],
  zoneMap: null,
  currentZonePath: "data/zones_day.geojson"
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

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
function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('isOn');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('isOn'), 2600);
}
function setConnectionState(text, mode = '') {
  const el = $('#connectState');
  if (!el) return;
  el.textContent = text;
  el.className = `connectState ${mode}`.trim();
}
function setAuthBusy(isBusy) {
  const btn = $('#saveAuthBtn');
  btn.disabled = isBusy;
  btn.textContent = isBusy ? 'Проверка...' : 'Подключиться';
}
async function verifyConnection(token) {
  const res = await fetch(`${state.apiBase}/admin/ping`, { headers: { 'X-Admin-Token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка API');
  if (!data.hasGithub) throw new Error('Worker не видит GitHub: проверь GH_TOKEN, GH_OWNER, GH_REPO');
  return data;
}
async function saveAuth() {
  const token = $('#adminToken').value.trim();
  if (!token) return showToast('Введите ADMIN_TOKEN');
  setAuthBusy(true);
  setConnectionState('Проверка подключения...', 'pending');
  try {
    const ping = await verifyConnection(token);
    state.adminToken = token;
    localStorage.setItem('proz_admin_token', state.adminToken);
    setConnectionState(`Подключено · ${ping.githubOwner}/${ping.githubRepo}`, 'success');
    showToast('Подключение подтверждено');
    await bootstrapData();
  } catch (err) {
    setConnectionState(err.message || 'Ошибка подключения', 'error');
    showToast(err.message || 'Ошибка подключения');
  } finally {
    setAuthBusy(false);
  }
}
async function api(path, options = {}) {
  if (!state.adminToken) throw new Error('Сначала введи ADMIN_TOKEN');
  const res = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': state.adminToken,
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка API');
  return data;
}
async function bootstrapData() {
  await loadMenu();
  await loadZones();
}
function initNav() {
  $$('.nav__btn').forEach(btn => btn.addEventListener('click', () => {
    $$('.nav__btn').forEach(x => x.classList.remove('isOn'));
    $$('.tab').forEach(x => x.classList.remove('isOn'));
    btn.classList.add('isOn');
    $(`#tab-${btn.dataset.tab}`).classList.add('isOn');
  }));
}
async function loadMenu() {
  const data = await api('/admin/github/file?path=data/menu.json');
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
      <td>${item.id || ''}</td>
      <td>${item.name || ''}</td>
      <td>${item.category || ''}</td>
      <td>${item.price || ''}</td>
      <td>${item.weight || ''}</td>
      <td><button class="btn">Открыть</button></td>
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
      <label>Вес/объём ${index + 1}<input class="variantWeight" value="${variant.weight ?? ''}" /></label>
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
  await api('/admin/github/save-json', { method: 'POST', body: JSON.stringify({ path: 'data/menu.json', content: state.menu, message: 'Update menu.json from admin panel' }) });
  showToast('menu.json сохранён в GitHub');
}
async function uploadMenuImage() {
  const file = $('#menuImageFile').files[0];
  if (!file) return showToast('Выбери файл изображения');
  const base64 = await fileToBase64(file);
  const safeName = translitFilename(file.name);
  const data = await api('/admin/github/upload-image', { method: 'POST', body: JSON.stringify({ filename: safeName, contentBase64: base64, folder: 'assets/photos' }) });
  $('#menuImg').value = data.publicPath;
  $('#menuPreview').src = data.publicPath;
  showToast('Фото загружено в GitHub');
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
async function initZones() {
  await new Promise((resolve) => ymaps.ready(resolve));
  state.zoneMap = new ymaps.Map('zonesMap', { center: [51.7682, 55.0968], zoom: 11, controls: ['zoomControl'] });
}
async function loadZones() {
  state.currentZonePath = $('#zoneFileSelect').value;
  const data = await api(`/admin/github/file?path=${encodeURIComponent(state.currentZonePath)}`);
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
    div.innerHTML = `<strong>${feature.properties?.zone || `Зона ${index + 1}`}</strong><div>${feature.properties?.restaurant || '—'} · ${feature.properties?.deliveryPrice || 0} ₽</div>`;
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
async function saveZones() { syncSelectedZoneGeometry(); await api('/admin/github/save-json', { method: 'POST', body: JSON.stringify({ path: state.currentZonePath, content: state.zones, message: `Update ${state.currentZonePath} from admin panel` }) }); showToast('GeoJSON сохранён в GitHub'); }
function bindEvents() {
  $('#adminToken').value = state.adminToken;
  $('#saveAuthBtn').addEventListener('click', saveAuth);
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
(async function init(){
  initNav();
  bindEvents();
  await initZones();
  if(state.adminToken){
    setConnectionState('Проверка сохранённого токена...', 'pending');
    verifyConnection(state.adminToken)
      .then((ping)=>{
        setConnectionState(`Подключено · ${ping.githubOwner}/${ping.githubRepo}`, 'success');
        return bootstrapData();
      })
      .catch((err)=>{
        setConnectionState(err.message || 'Ошибка подключения', 'error');
        showToast(err.message || 'Ошибка подключения');
      });
  } else {
    setConnectionState('Введите ADMIN_TOKEN для загрузки меню и зон', '');
  }
})();
