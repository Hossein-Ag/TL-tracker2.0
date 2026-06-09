'use strict';

const STATE = {
  items: [], priceHistory: [], alertLog: [],
  alertCount: 0, monitoring: false, intervalId: null,
  settings: { interval: 30, sound: true, notifications: false },
  chart: null,
  allItems: [],   // آیتم‌های کامل از API
  allPrices: {},  // قیمت‌های کامل از API
};

const CORS = 'https://corsproxy.io/?url=';
const DATA_URL  = 'https://tldb.info/auction-house/__data.json';
const PRICE_URL = 'https://tldb.info/api/ah/prices';

// تاریخچه قیمت ۷ روزه — ذخیره شده در localStorage
// هر بار که قیمت می‌گیریم، اضافه می‌کنیم
// میانگین = میانگین تمام نقاط ۷ روز اخیر

const DEFAULT_ITEMS = [{
  id: 'chest_leather_aa_t3_normal_004_blueprint',
  name: 'Blood Hunter Garb Lithograph',
  icon: '🗡️', alertBelow: 500, region: 'eu', enabled: true,
  lastPrice: null, avgPrice: null,
}];

// ── compress-json decompress (پیاده‌سازی ساده) ──────────────
function decompressCJ(compressed) {
  if (!Array.isArray(compressed)) return compressed;
  const [keys, ...rows] = compressed;
  return rows.map(row => {
    if (!Array.isArray(row)) return row;
    const obj = {};
    row.forEach((val, i) => { if (keys[i] !== undefined) obj[keys[i]] = val; });
    return obj;
  });
}

// ── devalue unflatten (ساده) ─────────────────────────────────
function simpleUnflatten(nodes) {
  // پیدا کردن node با type=data
  const dataNode = nodes.find(n => n && n.type === 'data');
  if (!dataNode) return null;
  return dataNode.data;
}

// ── Storage ──────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem('tl_items',    JSON.stringify(STATE.items));
    localStorage.setItem('tl_settings', JSON.stringify(STATE.settings));
    localStorage.setItem('tl_alerts',   JSON.stringify(STATE.alertLog.slice(-50)));
    localStorage.setItem('tl_history',  JSON.stringify(STATE.priceHistory.slice(-200)));
  } catch(e) {}
}

function load() {
  try {
    const i = localStorage.getItem('tl_items');
    const s = localStorage.getItem('tl_settings');
    const a = localStorage.getItem('tl_alerts');
    const h = localStorage.getItem('tl_history');
    if (i) STATE.items = JSON.parse(i);
    if (s) Object.assign(STATE.settings, JSON.parse(s));
    if (a) STATE.alertLog = JSON.parse(a);
    if (h) STATE.priceHistory = JSON.parse(h);
    document.getElementById('inpInterval').value = STATE.settings.interval;
    document.getElementById('toggleSound').className = 'toggle' + (STATE.settings.sound ? ' on' : '');
    renderAlertLog();
  } catch(e) {}
}

// ── تاریخچه قیمت برای هر آیتم ──────────────────────────────
function getPriceLog(itemId) {
  try {
    const raw = localStorage.getItem('tl_pricelog_' + itemId);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function addPriceLog(itemId, price) {
  const log = getPriceLog(itemId);
  const now = Date.now();
  log.push({ t: now, p: price });
  // فقط ۷ روز اخیر نگه داریم
  const week = 7 * 24 * 60 * 60 * 1000;
  const filtered = log.filter(e => now - e.t < week);
  try {
    localStorage.setItem('tl_pricelog_' + itemId, JSON.stringify(filtered));
  } catch(e) {}
  return filtered;
}

function calcAvg7d(itemId) {
  const log = getPriceLog(itemId);
  if (log.length === 0) return null;
  const sum = log.reduce((a, b) => a + b.p, 0);
  return Math.round(sum / log.length);
}

// ── Fetch با CORS proxy ──────────────────────────────────────
async function fetchWithProxy(url) {
  // اول بدون proxy
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (r.ok) return await r.json();
  } catch(e) {}
  // با proxy
  try {
    const r = await fetch(CORS + encodeURIComponent(url));
    if (r.ok) return await r.json();
  } catch(e) {}
  return null;
}

// ── دریافت آیتم‌ها از API ─────────────────────────────────────
async function fetchItems() {
  const data = await fetchWithProxy(DATA_URL);
  if (!data) return null;
  try {
    // روش ۱: nodes با devalue
    if (data.nodes) {
      const dataNode = data.nodes.find(n => n && n.type === 'data');
      if (dataNode && dataNode.data) {
        const d = dataNode.data;
        if (d.items) return decompressCJ(d.items);
      }
    }
    // روش ۲: مستقیم
    if (data.items) return decompressCJ(data.items);
    return null;
  } catch(e) { return null; }
}

// ── دریافت قیمت‌ها از API ────────────────────────────────────
async function fetchPrices() {
  const data = await fetchWithProxy(PRICE_URL);
  if (!data) return null;
  try {
    const { list = {}, regions = {} } = data;
    const result = {};
    // decompress هر سرور
    for (const [server, raw] of Object.entries(list)) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        result[server] = decompressCJ(parsed);
      } catch(e) {
        result[server] = Array.isArray(raw) ? raw : [];
      }
    }
    // regions هم اضافه
    for (const [region, items] of Object.entries(regions)) {
      if (Array.isArray(items)) result[region] = items;
    }
    return result;
  } catch(e) { return null; }
}

// ── پیدا کردن قیمت آیتم از داده‌ها ──────────────────────────
function findItemPrice(pricesMap, itemId, region) {
  const prices = [];
  for (const [server, items] of Object.entries(pricesMap)) {
    if (region && !server.startsWith(region)) continue;
    if (!Array.isArray(items)) continue;
    for (const entry of items) {
      if (!entry) continue;
      let id, price, qty;
      if (typeof entry === 'object' && !Array.isArray(entry)) {
        id = entry.id || entry.item_id || entry.itemId;
        price = entry.price || entry.min_price || entry.minPrice || entry.p;
        qty = entry.quantity || entry.qty || entry.q || 0;
      } else if (Array.isArray(entry)) {
        [id, price, qty] = entry;
      }
      if (String(id) === String(itemId) && price && +price > 0) {
        prices.push({ server, price: +price, qty: +(qty || 0) });
      }
    }
  }
  return prices;
}

// ── اصلی: بررسی همه آیتم‌ها ──────────────────────────────────
async function checkAll() {
  const active = STATE.items.filter(i => i.enabled);
  if (!active.length) return;

  setStatus('در حال بررسی...', true);
  updateTicker('🔄 دریافت اطلاعات از tldb.info...');

  const pricesMap = await fetchPrices();

  if (!pricesMap) {
    setStatus('خطا در اتصال', false);
    updateTicker('⚠️ خطا در دریافت قیمت — بررسی بعدی به زودی');
    return;
  }

  let minOverall = Infinity, avgOverall = null, buyFound = false;

  for (const item of active) {
    const entries = findItemPrice(pricesMap, item.id, item.region);

    if (entries.length === 0) {
      // آیتم در بازار نیست
      item.lastEntries = [];
      continue;
    }

    const minPrice = Math.min(...entries.map(e => e.price));
    item.lastPrice = minPrice;
    item.lastEntries = entries;

    // ذخیره در لاگ ۷ روزه و محاسبه میانگین
    addPriceLog(item.id, minPrice);
    item.avgPrice = calcAvg7d(item.id);

    if (minPrice < minOverall) {
      minOverall = minPrice;
      avgOverall = item.avgPrice;
    }

    // هشدار
    if (minPrice <= item.alertBelow) {
      triggerAlert(item);
      buyFound = true;
    }
  }

  const now = new Date();
  const t = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (minOverall < Infinity) {
    STATE.priceHistory.push({ time: t, price: minOverall, avg: avgOverall || minOverall });
    if (STATE.priceHistory.length > 200) STATE.priceHistory.shift();
  }

  updateDashboard(minOverall < Infinity ? minOverall : null, avgOverall);
  updateChart();
  renderItems();
  save();

  const ticker = active
    .filter(i => i.lastPrice)
    .map(i => {
      const avg = i.avgPrice;
      const diff = avg ? Math.round(((i.lastPrice - avg) / avg) * 100) : null;
      const sign = diff !== null ? (diff > 0 ? `▲${diff}%` : `▼${Math.abs(diff)}%`) : '';
      return `${i.name}: ${i.lastPrice.toLocaleString()} L ${sign}`;
    }).join('  ·  ');

  updateTicker(ticker || 'آیتمی در بازار یافت نشد');
  setStatus(`آخرین بررسی: ${t}`, true);

  if (buyFound) {
    document.getElementById('statCur').classList.add('alert-card');
    setTimeout(() => document.getElementById('statCur').classList.remove('alert-card'), 5000);
  }
}

// ── هشدار ────────────────────────────────────────────────────
function triggerAlert(item) {
  STATE.alertCount++;
  document.getElementById('valAlerts').textContent = STATE.alertCount;
  const diff = item.avgPrice ? Math.round(((item.alertBelow - item.lastPrice) / item.alertBelow) * 100) : 0;
  const msg = `${item.name}: ${item.lastPrice.toLocaleString()} L (${diff}% زیر حد)`;
  STATE.alertLog.unshift({ time: new Date().toLocaleTimeString('fa-IR'), msg, price: item.lastPrice, item: item.name });
  if (STATE.alertLog.length > 50) STATE.alertLog.pop();
  renderAlertLog();
  showToast(`🔔 فرصت خرید! ${item.name} — ${item.lastPrice.toLocaleString()} L`, true);
  if (STATE.settings.sound) playBeep();
  if (STATE.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('🔔 TL Tracker — فرصت خرید!', { body: msg, icon: 'icons/icon-192.png' });
  }
}

// ── Monitor ───────────────────────────────────────────────────
function autoStartMonitor() { if (STATE.items.some(i => i.enabled)) startMonitor(); }

function startMonitor() {
  if (STATE.monitoring) return;
  STATE.monitoring = true;
  document.getElementById('toggleMonitor').classList.add('on');
  document.getElementById('monitorSub').textContent = 'فعال';
  setStatus('در حال پایش', true);
  checkAll();
  STATE.intervalId = setInterval(checkAll, STATE.settings.interval * 1000);
  save();
}

function stopMonitor() {
  STATE.monitoring = false;
  clearInterval(STATE.intervalId);
  document.getElementById('toggleMonitor').classList.remove('on');
  document.getElementById('monitorSub').textContent = 'متوقف';
  setStatus('متوقف', false);
  save();
}

function toggleMonitor() { STATE.monitoring ? stopMonitor() : startMonitor(); }

// ── Chart ─────────────────────────────────────────────────────
function initChart() {
  const ctx = document.getElementById('priceChart').getContext('2d');
  STATE.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'قیمت', data: [], borderColor: '#3d7fff', backgroundColor: 'rgba(61,127,255,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#3d7fff', borderWidth: 1.5 },
        { label: 'میانگین ۷ روزه', data: [], borderColor: '#00d4aa', backgroundColor: 'transparent', tension: 0.4, borderDash: [5, 5], pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: {
      responsive: false, animation: { duration: 300 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#4a5a80', font: { size: 9, family: 'JetBrains Mono' }, maxRotation: 0, maxTicksLimit: 6 }, grid: { color: 'rgba(30,45,80,0.6)' }, border: { display: false } },
        y: { ticks: { color: '#4a5a80', font: { size: 9, family: 'JetBrains Mono' } }, grid: { color: 'rgba(30,45,80,0.6)' }, border: { display: false } },
      },
    },
  });
}

function updateChart() {
  if (!STATE.chart) return;
  const last = STATE.priceHistory.slice(-20);
  STATE.chart.data.labels = last.map(p => p.time);
  STATE.chart.data.datasets[0].data = last.map(p => p.price);
  STATE.chart.data.datasets[1].data = last.map(p => p.avg);
  STATE.chart.update('none');
}

// ── Dashboard ─────────────────────────────────────────────────
function updateDashboard(cur, avg) {
  const elCur = document.getElementById('valCur');
  const elAvg = document.getElementById('valAvg');
  const elProfit = document.getElementById('valProfit');

  if (cur) {
    elCur.textContent = cur.toLocaleString();
    // رنگ‌بندی بر اساس میانگین
    if (avg) {
      if (cur < avg) {
        elCur.className = 'stat-value red'; // زیر میانگین = قرمز = فرصت خرید
      } else {
        elCur.className = 'stat-value green'; // بالای میانگین = سبز
      }
    } else {
      elCur.className = 'stat-value accent';
    }
  } else {
    elCur.textContent = '—';
    elCur.className = 'stat-value accent';
  }

  elAvg.textContent = avg ? avg.toLocaleString() : '—';

  if (cur && avg) {
    const profit = avg - cur;
    elProfit.textContent = profit > 0 ? '+' + profit.toLocaleString() : profit.toLocaleString();
    elProfit.className = 'stat-value ' + (profit > 0 ? 'green' : 'red');
  } else {
    elProfit.textContent = '—';
    elProfit.className = 'stat-value green';
  }
}

// ── Render Items ──────────────────────────────────────────────
function renderItems() {
  const list = document.getElementById('itemsList');
  if (!STATE.items.length) {
    list.innerHTML = '<div style="text-align:center;padding:30px;font-size:13px;color:var(--text3)">هنوز آیتمی اضافه نشده</div>';
    return;
  }

  list.innerHTML = STATE.items.map((item, i) => {
    const p = item.lastPrice;
    const avg = item.avgPrice;
    const isBuy = p && p <= item.alertBelow;

    // رنگ‌بندی بر اساس مقایسه با میانگین ۷ روزه
    let priceColor = 'var(--text)';
    let diffStr = '—';
    let badge = '';

    if (p && avg) {
      const diff = Math.round(((p - avg) / avg) * 100);
      diffStr = diff > 0 ? `+${diff}%` : `${diff}%`;
      if (p < avg) {
        priceColor = 'var(--red)';   // زیر میانگین = قرمز
        badge = isBuy
          ? '<span class="badge buy">BUY</span>'
          : '<span class="badge watch">WATCH</span>';
      } else {
        priceColor = 'var(--green)'; // بالای میانگین = سبز
        badge = '<span class="badge ok">OK</span>';
      }
    } else if (p && !avg) {
      diffStr = 'داده کافی نیست';
      badge = '<span class="badge watch">NEW</span>';
    }

    // نمایش تعداد موجود در بازار
    const totalQty = item.lastEntries ? item.lastEntries.reduce((s, e) => s + e.qty, 0) : 0;

    return `<div class="item-card ${isBuy ? 'buy-signal' : ''}" onclick="toggleItemEnabled(${i})">
      <div class="item-icon">${item.icon || '🎯'}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span>${item.region.toUpperCase()}</span>
          <span>حد: ${item.alertBelow.toLocaleString()}</span>
          ${avg ? `<span>میانگین: ${avg.toLocaleString()}</span>` : ''}
          ${totalQty ? `<span>qty: ${totalQty}</span>` : ''}
          ${badge}
        </div>
      </div>
      <div class="item-price">
        <div class="item-price-val" style="color:${priceColor}">${p ? p.toLocaleString() : '—'}</div>
        <div class="item-price-diff" style="color:${priceColor};opacity:0.8">${diffStr}</div>
      </div>
      <button onclick="event.stopPropagation();removeItem(${i})" style="background:none;border:none;color:var(--text3);font-size:18px;padding:4px 8px;cursor:pointer;flex-shrink:0">×</button>
    </div>`;
  }).join('');
}

function renderAlertLog() {
  const list = document.getElementById('alertList');
  if (!STATE.alertLog.length) {
    list.innerHTML = '<div class="alert-empty">هنوز هشداری ثبت نشده</div>';
    return;
  }
  list.innerHTML = STATE.alertLog.slice(0, 15).map(e =>
    `<div class="alert-entry">
      <div class="alert-time">${e.time}</div>
      <div class="alert-msg"><strong>🔔 ${e.item}</strong> — ${e.price.toLocaleString()} L</div>
    </div>`
  ).join('');
}

// ── Item management ───────────────────────────────────────────
function addItem() {
  const name = document.getElementById('inpName').value.trim();
  const id   = document.getElementById('inpId').value.trim();
  const alert = parseInt(document.getElementById('inpAlert').value) || 500;
  const region = document.getElementById('inpRegion').value;
  if (!name || !id) { showToast('نام و ID آیتم را وارد کنید'); return; }
  const icons = ['⚔️','🛡️','🏹','🗡️','🔮','💎','🎯','⚡'];
  STATE.items.push({ id, name, icon: icons[STATE.items.length % icons.length], alertBelow: alert, region, enabled: true, lastPrice: null, avgPrice: null, lastEntries: [] });
  document.getElementById('inpName').value = '';
  document.getElementById('inpId').value = '';
  document.getElementById('inpAlert').value = '';
  renderItems();
  save();
  showToast(`${name} اضافه شد ✓`);
}

function removeItem(i) { STATE.items.splice(i, 1); renderItems(); save(); }
function toggleItemEnabled(i) { STATE.items[i].enabled = !STATE.items[i].enabled; renderItems(); save(); }

// ── Settings ──────────────────────────────────────────────────
function saveSettings() {
  const s = parseInt(document.getElementById('inpInterval').value) || 30;
  STATE.settings.interval = s;
  document.getElementById('intervalSub').textContent = `هر ${s} ثانیه`;
  if (STATE.monitoring) { clearInterval(STATE.intervalId); STATE.intervalId = setInterval(checkAll, s * 1000); }
  save();
}

function toggleSetting(key) {
  STATE.settings[key] = !STATE.settings[key];
  document.getElementById('toggle' + key.charAt(0).toUpperCase() + key.slice(1)).className = 'toggle' + (STATE.settings[key] ? ' on' : '');
  save();
}

function toggleNotification() {
  if (!('Notification' in window)) { showToast('مرورگر پشتیبانی نمی‌کند'); return; }
  if (Notification.permission === 'granted') {
    STATE.settings.notifications = !STATE.settings.notifications;
    document.getElementById('toggleNotif').className = 'toggle' + (STATE.settings.notifications ? ' on' : '');
    save();
  } else {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        STATE.settings.notifications = true;
        document.getElementById('toggleNotif').classList.add('on');
        save();
        showToast('نوتیفیکیشن فعال شد ✓');
      } else { showToast('دسترسی رد شد'); }
    });
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'granted') {
    STATE.settings.notifications = true;
    document.getElementById('toggleNotif').classList.add('on');
  }
}

function clearData() {
  if (!confirm('همه داده‌ها پاک شوند؟')) return;
  localStorage.clear();
  STATE.priceHistory = []; STATE.alertLog = []; STATE.alertCount = 0;
  STATE.items = [...DEFAULT_ITEMS];
  renderItems(); renderAlertLog(); updateChart();
  showToast('داده‌ها پاک شدند');
}

// ── View ──────────────────────────────────────────────────────
function switchView(n) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + n).classList.add('active');
  document.getElementById('nav-' + n).classList.add('active');
}

// ── UI helpers ────────────────────────────────────────────────
function setStatus(t, live) {
  document.getElementById('statusText').textContent = t;
  document.getElementById('pulseDot').className = 'pulse-dot' + (live ? ' live' : '');
}
function updateTicker(t) { document.getElementById('tickerText').textContent = t; }
function showToast(msg, isAlert = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isAlert ? ' alert-toast' : '') + ' show';
  clearTimeout(t._to);
  t._to = setTimeout(() => { t.className = 'toast'; }, 3500);
}
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.25);
    });
  } catch(e) {}
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  load();
  if (STATE.items.length === 0) STATE.items = [...DEFAULT_ITEMS];
  renderItems();
  initChart();
  updateChart();
  autoStartMonitor();
  requestNotificationPermission();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});
