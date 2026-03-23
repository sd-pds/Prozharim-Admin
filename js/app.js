const state = {
  apiBase: localStorage.getItem('proz_admin_api_base') || '',
  adminToken: localStorage.getItem('proz_admin_token') || '',
  menu: [],
  currentMenuIndex: -1,
  orders: [],
  selectedOrderId: null,
  stats: null,
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

function saveAuth() {
  state.apiBase = $('#apiBase').value.trim().replace(/\/$/, '');
  state.adminToken = $('#adminToken').value.trim();
  localStorage.setItem('proz_admin_api_base', state.apiBase);
  localStorage.setItem('proz_admin_token', state.adminToken);
  showToast('Подключение сохранено');
}

async function api(path, options = {}) {
  if (!state.apiBase || !state.adminToken) throw new Error('Сначала введи Worker API URL и ADMIN_TOKEN');
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

function initNav() {
  $$('.nav__btn').forEach(btn => btn.addEventListener('click', () => {
    $$('.nav__btn').forEach(x => x.classList.remove('isOn'));
    $$('.tab').forEach(x => x.classList.remove('isOn'));
    btn.classList.add('isOn');
    $(`#tab-${btn.dataset.tab}`).classList.add('isOn');
  }));
}

async function loadStats() {
  const data = await api('/admin/stats');
  state.stats = data.stats;
  const items = [
    ['Всего заказов', state.stats.totalOrders],
    ['Выручка', `${Math.round(state.stats.totalRevenue)} ₽`],
    ['Новых', state.stats.byStatus?.new || 0],
    ['Готово', state.stats.byStatus?.done || 0]
  ];
  $('#statsGrid').innerHTML = items.map(([label, value]) => `<div class="statCard panel"><div class="statCard__label">${label}</div><div class="statCard__value">${value}</div></div>`).join('');
}

async function loadOrders() {
  const q = encodeURIComponent($('#orderSearch').value.trim());
  const status = encodeURIComponent($('#orderStatusFilter').value);
  const site = encodeURIComponent($('#orderSiteFilter').value);
  const data = await api(`/admin/orders?limit=100&q=${q}&status=${status}&site=${site}`);
  state.orders = data.items || [];
  renderOrdersList();
  if (state.selectedOrderId) {
    await openOrder(state.selectedOrderId).catch(() => {});
  }
}

function renderOrdersList() {
  const wrap = $('#ordersList');
  if (!state.orders.length) {
    wrap.innerHTML = '<div class="emptyState">Заказов пока нет.</div>';
    return;
  }
  wrap.innerHTML = state.orders.map(order => `
    <div class="orderCard ${order.id === state.selectedOrderId ? 'isOn' : ''}" data-order-id="${order.id}">
      <div class="orderCard__top">
        <strong>#${order.id}</strong>
        <span class="badge badge--${order.status}">${order.status}</span>
      </div>
      <div>${order.customer?.name || '—'} · ${order.customer?.phone || '—'}</div>
      <div>${order.delivery?.address || order.delivery?.restaurant || '—'}</div>
      <div>${new Date(order.createdAt).toLocaleString('ru-RU')} · ${order.total} ₽ · ${order.site || '—'}</div>
    </div>
  `).join('');
  $$('.orderCard').forEach(card => card.addEventListener('click', () => openOrder(card.dataset.orderId)));
}

async function openOrder(orderId) {
  state.selectedOrderId = orderId;
  renderOrdersList();
  const data = await api(`/admin/orders/${encodeURIComponent(orderId)}`);
  const order = data.order;
  const items = (order.items || []).map(it => `<li>${it.name}${it.weight ? ` (${it.weight})` : ''} ×${it.qty} — ${it.sum} ₽</li>`).join('');
  $('#orderDetails').innerHTML = `
    <div class="editorHead">
      <div>
        <h3 style="margin:0">#${order.id}</h3>
        <div style="opacity:.7">${new Date(order.createdAt).toLocaleString('ru-RU')} · ${order.site}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select id="statusSelect">
          ${['new','confirmed','cooking','delivery','done','cancelled'].map(status => `<option value="${status}" ${order.status===status?'selected':''}>${status}</option>`).join('')}
        </select>
        <button class="btn btn--primary" id="saveStatusBtn">Сохранить статус</button>
      </div>
    </div>
    <div class="detailGrid">
      <div class="detailBox"><strong>Клиент</strong><div>${order.customer?.name || '—'}</div><div>${order.customer?.phone || '—'}</div></div>
      <div class="detailBox"><strong>Получение</strong><div>${order.delivery?.type || '—'}</div><div>${order.delivery?.address || order.delivery?.restaurant || '—'}</div><div>${order.when?.type === 'later' ? order.when?.date : 'Ближайшее время'}</div></div>
      <div class="detailBox"><strong>Оплата</strong><div>${order.paymentLabel || order.payment || '—'}</div><div>Итого: ${order.total} ₽</div></div>
      <div class="detailBox"><strong>Комментарий</strong><div>${order.comment || '—'}</div></div>
    </div>
    <div class="detailBox" style="margin-top:12px"><strong>Состав</strong><ul>${items || '<li>—</li>'}</ul></div>
  `;
  $('#saveStatusBtn').addEventListener('click', async () => {
    const status = $('#statusSelect').value;
    await api(`/admin/orders/${encodeURIComponent(order.id)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    showToast('Статус обновлён');
    await loadOrders();
    await loadStats();
  });
}

async function loadMenu() {
  const data = await api('/admin/github/file?path=data/menu.json');
  state.menu = Array.isArray(data.parsed) ? data.parsed : [];
  renderMenuTable();
  if (state.menu.length) selectMenuItem(0);
}

function renderMenuTable() {
  const q = ($('#menuSearch').value || '').trim().toLowerCase();
  const body = $('#menuTable tbody');
  const filtered = state.menu
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !q || [item.id, item.name, item.category].filter(Boolean).join(' ').toLowerCase().includes(q));

  body.innerHTML = filtered.map(({ item, index }) => `
    <tr data-index="${index}" class="${index === state.currentMenuIndex ? 'isOn' : ''}">
      <td>${item.id || ''}</td>
      <td>${item.name || ''}</td>
      <td>${item.category || ''}</td>
      <td>${item.price || ''}</td>
      <td>${item.weight || ''}</td>
      <td><button class="btn" data-act="edit">Открыть</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => selectMenuItem(Number(tr.dataset.index))));
}

function selectMenuItem(index) {
  state.currentMenuIndex = index;
  const item = state.menu[index] || {};
  $('#menuEditorTitle').textContent = item.name ? `Редактирование: ${item.name}` : 'Новая позиция';
  $('#menuId').value = item.id || '';
  $('#menuCategory').value = item.category || '';
  $('#menuName').value = item.name || '';
  $('#menuDesc').value = item.desc || '';
  $('#menuPrice').value = item.price || '';
  $('#menuWeight').value = item.weight || '';
  $('#menuHit').value = String(Boolean(item.hit));
  $('#menuImg').value = item.img || '';
  $('#menuPreview').src = item.img || '';
  renderMenuTable();
}

function readMenuEditor() {
  return {
    id: $('#menuId').value.trim(),
    category: $('#menuCategory').value.trim(),
    name: $('#menuName').value.trim(),
    desc: $('#menuDesc').value.trim(),
    price: Number($('#menuPrice').value || 0),
    weight: $('#menuWeight').value.trim(),
    hit: $('#menuHit').value === 'true',
    img: $('#menuImg').value.trim()
  };
}

function applyMenuItem() {
  const item = readMenuEditor();
  if (!item.id || !item.name) {
    showToast('У позиции должны быть ID и название');
    return;
  }
  const duplicateIndex = state.menu.findIndex((x, i) => x.id === item.id && i !== state.currentMenuIndex);
  if (duplicateIndex >= 0) {
    showToast('Такой ID уже существует');
    return;
  }
  if (state.currentMenuIndex >= 0) state.menu[state.currentMenuIndex] = item;
  else {
    state.menu.unshift(item);
    state.currentMenuIndex = 0;
  }
  renderMenuTable();
  showToast('Позиция применена в локальный список');
}

function addMenuItem() {
  state.currentMenuIndex = -1;
  selectMenuItem(-1);
}

function deleteMenuItem() {
  if (state.currentMenuIndex < 0) return showToast('Сначала выбери позицию');
  state.menu.splice(state.currentMenuIndex, 1);
  state.currentMenuIndex = -1;
  renderMenuTable();
  addMenuItem();
  showToast('Позиция удалена из локального списка');
}

async function saveMenu() {
  await api('/admin/github/save-json', {
    method: 'POST',
    body: JSON.stringify({ path: 'data/menu.json', content: state.menu, message: 'Update menu.json from admin panel' })
  });
  showToast('menu.json сохранён в GitHub');
}

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

function translitFilename(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]+/g, '-');
}

async function initZones() {
  await new Promise((resolve) => ymaps.ready(resolve));
  state.zoneMap = new ymaps.Map('zonesMap', {
    center: [51.7682, 55.0968],
    zoom: 11,
    controls: ['zoomControl']
  });
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
    const coords = feature.geometry?.type === 'Polygon' ? feature.geometry.coordinates : [];
    const polygon = new ymaps.Polygon(coords, {
      hintContent: feature.properties?.zone || `Зона ${index + 1}`,
      balloonContent: feature.properties?.restaurant || ''
    }, {
      fillColor: index === state.selectedZoneIndex ? 'rgba(255,122,61,0.35)' : 'rgba(255,255,255,0.12)',
      strokeColor: '#ff7b3d',
      strokeWidth: 3,
      draggable: false
    });
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
  const feature = {
    type: 'Feature',
    properties: { zone: `Новая зона ${state.zones.features.length + 1}`, deliveryPrice: 0, restaurant: 'Театральная 1/1' },
    geometry: { type: 'Polygon', coordinates: [[]] }
  };
  state.zones.features.push(feature);
  state.selectedZoneIndex = state.zones.features.length - 1;
  renderZones();
  selectZone(state.selectedZoneIndex);
  startZoneDrawing();
}

function currentZoneObject() {
  return state.zoneObjects[state.selectedZoneIndex] || null;
}

function startZoneDrawing() {
  const obj = currentZoneObject();
  if (!obj) return showToast('Сначала выбери или создай полигон');
  obj.editor.startDrawing();
  showToast('Кликай по карте, чтобы рисовать полигон. Двойной клик завершит.');
}

function startZoneEditing() {
  const obj = currentZoneObject();
  if (!obj) return showToast('Сначала выбери полигон');
  obj.editor.startEditing();
  showToast('Перетаскивай точки границы, затем нажми "Завершить редактирование"');
}

function stopZoneEditing() {
  const obj = currentZoneObject();
  if (!obj) return;
  try { obj.editor.stopEditing(); } catch {}
  try { obj.editor.stopDrawing(); } catch {}
  syncSelectedZoneGeometry();
  showToast('Геометрия обновлена локально');
}

function syncSelectedZoneGeometry() {
  const obj = currentZoneObject();
  const feature = state.zones?.features?.[state.selectedZoneIndex];
  if (!obj || !feature) return;
  feature.geometry.coordinates = obj.geometry.getCoordinates();
}

function applyZoneProps() {
  const feature = state.zones?.features?.[state.selectedZoneIndex];
  if (!feature) return showToast('Сначала выбери зону');
  feature.properties = {
    ...(feature.properties || {}),
    zone: $('#zoneName').value.trim(),
    deliveryPrice: Number($('#zonePrice').value || 0),
    restaurant: $('#zoneRestaurant').value
  };
  renderZones();
  showToast('Свойства зоны применены');
}

function deleteZone() {
  if (state.selectedZoneIndex < 0) return showToast('Сначала выбери зону');
  state.zones.features.splice(state.selectedZoneIndex, 1);
  state.selectedZoneIndex = -1;
  renderZones();
  showToast('Зона удалена локально');
}

async function saveZones() {
  syncSelectedZoneGeometry();
  await api('/admin/github/save-json', {
    method: 'POST',
    body: JSON.stringify({ path: state.currentZonePath, content: state.zones, message: `Update ${state.currentZonePath} from admin panel` })
  });
  showToast('GeoJSON сохранён в GitHub');
}

function bindEvents() {
  $('#apiBase').value = state.apiBase;
  $('#adminToken').value = state.adminToken;
  $('#saveAuthBtn').addEventListener('click', saveAuth);
  $('#refreshStatsBtn').addEventListener('click', loadStats);
  $('#refreshOrdersBtn').addEventListener('click', loadOrders);
  $('#orderSearch').addEventListener('input', () => loadOrders().catch(err => showToast(err.message)));
  $('#orderStatusFilter').addEventListener('change', () => loadOrders().catch(err => showToast(err.message)));
  $('#orderSiteFilter').addEventListener('change', () => loadOrders().catch(err => showToast(err.message)));
  $('#loadMenuBtn').addEventListener('click', () => loadMenu().catch(err => showToast(err.message)));
  $('#saveMenuBtn').addEventListener('click', () => saveMenu().catch(err => showToast(err.message)));
  $('#addMenuItemBtn').addEventListener('click', addMenuItem);
  $('#applyMenuItemBtn').addEventListener('click', applyMenuItem);
  $('#deleteMenuItemBtn').addEventListener('click', deleteMenuItem);
  $('#uploadMenuImageBtn').addEventListener('click', () => uploadMenuImage().catch(err => showToast(err.message)));
  $('#menuSearch').addEventListener('input', renderMenuTable);
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
  if (state.apiBase && state.adminToken) {
    loadStats().catch(err => showToast(err.message));
    loadOrders().catch(err => showToast(err.message));
    loadMenu().catch(err => showToast(err.message));
    loadZones().catch(err => showToast(err.message));
  }
})();
