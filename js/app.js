'use strict';

// â¬‡ï¸ Ø¨Ø¹Ø¯ Ø§Ø² deploy Ø±ÙˆÛŒ RailwayØŒ Ø§ÛŒÙ† Ø¢Ø¯Ø±Ø³ Ø±Ùˆ Ø¨Ø§ Ø¢Ø¯Ø±Ø³ Ø³Ø±ÙˆØ±Øª Ø¹ÙˆØ¶ Ú©Ù†
const BACKEND_URL = 'web-production-43483.up.railway.app'; // Ù…Ø«Ø§Ù„: https://tl-backend.up.railway.app

const PRICE_URL = 'https://tldb.info/api/ah/prices';
const DATA_URL  = 'https://tldb.info/auction-house/__data.json';
const PROXIES = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
];

const DEFAULT_ITEMS = [{
  id: 'chest_leather_aa_t3_normal_004_blueprint',
  name: 'Blood Hunter Garb Lithograph',
  icon: 'ðŸ—¡ï¸', alertBelow: 500, region: 'eu', enabled: true,
  lastPrice: null, avgPrice: null, lastEntries: [],
}];

const STATE = {
  items: [], priceHistory: [], alertLog: [],
  alertCount: 0, monitoring: false, intervalId: null,
  settings: { interval: 30, sound: true, notifications: false },
  chart: null,
};

// â”€â”€ compress-json: Ú©ØªØ§Ø¨Ø®ÙˆÙ†Ù‡ ÙˆØ§Ù‚Ø¹ÛŒ Ø§Ø² CDN Ù„ÙˆØ¯ Ù…ÛŒâ€ŒØ´Ù‡ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Ø§Ú¯Ù‡ window.compressJSON ÙˆØ¬ÙˆØ¯ Ø¯Ø§Ø´Øª Ø§Ø³ØªÙØ§Ø¯Ù‡ Ù…ÛŒâ€ŒÚ©Ù†ÛŒÙ…
// ÙˆÚ¯Ø±Ù†Ù‡ fallback Ø¯Ø³ØªÛŒ

function cjDecompress(data) {
  // Ø±ÙˆØ´ Û±: Ú©ØªØ§Ø¨Ø®ÙˆÙ†Ù‡ compress-json
  try {
    if (window.compressJSON) return window.compressJSON.decompress(data);
  } catch(e) {}

  // Ø±ÙˆØ´ Û²: ÙØ±Ù…Øª compress-json Ø¯Ø³ØªÛŒ
  // Ø³Ø§Ø®ØªØ§Ø±: {"0":["key1","key2",...], "1":[val1,val2,...], ...}
  if (data && typeof data === 'object' && !Array.isArray(data) && data['0']) {
    try {
      const keys = data['0'];
      const rows = [];
      let i = 1;
      while (data[String(i)] !== undefined) {
        const row = data[String(i)];
        const obj = {};
        keys.forEach((k, j) => { obj[k] = row[j]; });
        rows.push(obj);
        i++;
      }
      if (rows.length > 0) return rows;
    } catch(e) {}
  }

  // Ø±ÙˆØ´ Û³: Ø¢Ø±Ø§ÛŒÙ‡ Ø¨Ø§ header row
  if (Array.isArray(data) && data.length > 1) {
    const first = data[0];
    // Ø§Ú¯Ù‡ Ø§ÙˆÙ„ÛŒÙ† Ø§Ù„Ù…Ø§Ù† Ø¢Ø±Ø§ÛŒÙ‡â€ŒØ§ÛŒ Ø§Ø² stringÙ‡Ø§Ø³Øª (header)
    if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'string') {
      return data.slice(1).map(row => {
        if (!Array.isArray(row)) return row;
        const obj = {};
        first.forEach((k, j) => { if (row[j] !== undefined) obj[k] = row[j]; });
        return obj;
      });
    }
    // Ø§Ú¯Ù‡ Ø§Ù„Ù…Ø§Ù†â€ŒÙ‡Ø§ Ø¢Ø¨Ø¬Ú©Øª Ù‡Ø³ØªÙ†ØŒ Ù‡Ù…ÙˆÙ†Ø·ÙˆØ± Ø¨Ø±Ú¯Ø±Ø¯ÙˆÙ†
    if (typeof first === 'object' && !Array.isArray(first)) return data;
  }

  return Array.isArray(data) ? data : [];
}

// â”€â”€ Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchURL(url) {
  // Ø¨Ø¯ÙˆÙ† proxy
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (r.ok) return { ok: true, data: await r.json() };
  } catch(e) {}

  // Ø¨Ø§ Ù‡Ø± proxy
  for (const mkProxy of PROXIES) {
    try {
      const r = await fetch(mkProxy(url), { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text.length < 10) continue;
      return { ok: true, data: JSON.parse(text) };
    } catch(e) { continue; }
  }
  return { ok: false, data: null };
}

// â”€â”€ Ø¯Ø±ÛŒØ§ÙØª Ùˆ parse Ù‚ÛŒÙ…Øªâ€ŒÙ‡Ø§ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadPrices() {
  const { ok, data } = await fetchURL(PRICE_URL);
  if (!ok || !data) return null;

  const result = {}; // server -> [{id, price, qty}]
  const { list = {}, regions = {} } = data;

  // parse Ù‡Ø± Ø³Ø±ÙˆØ± Ø§Ø² list
  for (const [server, raw] of Object.entries(list)) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const rows = cjDecompress(parsed);
      if (Array.isArray(rows)) result[server] = rows;
    } catch(e) {}
  }

  // regions
  for (const [region, items] of Object.entries(regions)) {
    if (Array.isArray(items)) result[region] = items;
  }

  return result;
}

// â”€â”€ Ù¾ÛŒØ¯Ø§ Ú©Ø±Ø¯Ù† Ù‚ÛŒÙ…Øª Ø¢ÛŒØªÙ… â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function findPrice(pricesMap, itemId, region) {
  const hits = [];
  for (const [server, rows] of Object.entries(pricesMap)) {
    if (region && !server.startsWith(region)) continue;
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      if (!row) continue;
      let id, price, qty;

      if (Array.isArray(row)) {
        [id, price, qty] = row;
      } else if (typeof row === 'object') {
        id    = row.id    ?? row.item_id ?? row.itemId  ?? row.i;
        price = row.price ?? row.min_price ?? row.minPrice ?? row.p;
        qty   = row.quantity ?? row.qty ?? row.q ?? 0;
      }

      if (String(id) === String(itemId) && price && +price > 0) {
        hits.push({ server, price: +price, qty: +(qty || 0) });
      }
    }
  }
  return hits;
}

// â”€â”€ ØªØ§Ø±ÛŒØ®Ú†Ù‡ Ù‚ÛŒÙ…Øª Û· Ø±ÙˆØ²Ù‡ Ø¯Ø± localStorage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function logPrice(itemId, price) {
  const KEY = 'tl_log_' + itemId;
  let log = [];
  try { log = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) {}
  const now = Date.now();
  log.push([now, price]);
  const week = 7 * 24 * 3600 * 1000;
  log = log.filter(([t]) => now - t < week);
  try { localStorage.setItem(KEY, JSON.stringify(log)); } catch(e) {}
  return log;
}

function avg7d(itemId) {
  const KEY = 'tl_log_' + itemId;
  let log = [];
  try { log = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) {}
  if (!log.length) return null;
  return Math.round(log.reduce((s, [, p]) => s + p, 0) / log.length);
}

// â”€â”€ Storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function save() {
  try {
    localStorage.setItem('tl_items',   JSON.stringify(STATE.items));
    localStorage.setItem('tl_cfg',     JSON.stringify(STATE.settings));
    localStorage.setItem('tl_alerts',  JSON.stringify(STATE.alertLog.slice(-50)));
    localStorage.setItem('tl_history', JSON.stringify(STATE.priceHistory.slice(-200)));
  } catch(e) {}
}

function loadStorage() {
  try {
    const i = localStorage.getItem('tl_items');
    const s = localStorage.getItem('tl_cfg');
    const a = localStorage.getItem('tl_alerts');
    const h = localStorage.getItem('tl_history');
    if (i) STATE.items   = JSON.parse(i);
    if (s) Object.assign(STATE.settings, JSON.parse(s));
    if (a) STATE.alertLog = JSON.parse(a);
    if (h) STATE.priceHistory = JSON.parse(h);
    document.getElementById('inpInterval').value = STATE.settings.interval;
    document.getElementById('toggleSound').className = 'toggle' + (STATE.settings.sound ? ' on' : '');
    renderAlertLog();
  } catch(e) {}
}

// â”€â”€ Ú†Ú© Ú©Ø±Ø¯Ù† Ù‡Ù…Ù‡ Ø¢ÛŒØªÙ…â€ŒÙ‡Ø§ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchFromBackend(item) {
  // Ø§Ú¯Ù‡ BACKEND_URL ØªÙ†Ø¸ÛŒÙ… Ø´Ø¯Ù‡ØŒ Ø§Ø² Ø³Ø±ÙˆØ± Railway Ø§Ø³ØªÙØ§Ø¯Ù‡ Ù…ÛŒâ€ŒÚ©Ù†Ù‡
  if (BACKEND_URL && BACKEND_URL !== 'RAILWAY_URL_HERE') {
    try {
      const url = `${BACKEND_URL}/price/${item.id}?region=${item.region}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const d = await r.json();
        if (d.price) {
          return {
            price: d.price,
            avg: d.avg_7d,
            entries: d.entries || [],
            source: 'railway',
          };
        }
      }
    } catch(e) {}
  }
  return null;
}

async function checkAll() {
  const active = STATE.items.filter(i => i.enabled);
  if (!active.length) return;

  setStatus('Ø¯Ø± Ø­Ø§Ù„ Ø¨Ø±Ø±Ø³ÛŒ...', true);

  const useBackend = BACKEND_URL && BACKEND_URL !== 'RAILWAY_URL_HERE';
  updateTicker(useBackend ? 'ðŸ”„ Ø¯Ø±ÛŒØ§ÙØª Ø§Ø² Ø³Ø±ÙˆØ±...' : 'ðŸ”„ Ø¯Ø±ÛŒØ§ÙØª Ù‚ÛŒÙ…Øª Ø§Ø² tldb.info...');

  // Ø§Ú¯Ù‡ backend Ø¯Ø§Ø±ÛŒÙ…ØŒ Ø§Ø² Ø§ÙˆÙ† Ø§Ø³ØªÙØ§Ø¯Ù‡ Ú©Ù†
  if (useBackend) {
    let minAll = Infinity, avgAll = null, buyFound = false;
    for (const item of active) {
      const result = await fetchFromBackend(item);
      if (!result) { item.lastEntries = []; continue; }
      item.lastPrice   = result.price;
      item.lastEntries = result.entries;
      item.avgPrice    = result.avg || avg7d(item.id);
      logPrice(item.id, result.price);
      if (result.price < minAll) { minAll = result.price; avgAll = item.avgPrice; }
      if (result.price <= item.alertBelow) { triggerAlert(item); buyFound = true; }
    }
    finishCheck(minAll, avgAll, buyFound, active);
    return;
  }

  // fallback: Ù…Ø³ØªÙ‚ÛŒÙ… Ø§Ø² tldb.info
  const pricesMap = await loadPrices();
  if (!pricesMap) {
    setStatus('Ø®Ø·Ø§ Ø¯Ø± Ø§ØªØµØ§Ù„', false);
    updateTicker('âš ï¸ Ø³Ø±ÙˆØ± Railway ØªÙ†Ø¸ÛŒÙ… Ù†Ø´Ø¯Ù‡ â€” Ù‚ÛŒÙ…Øª Ø¯Ø± Ø¯Ø³ØªØ±Ø³ Ù†ÛŒØ³Øª');
    return;
  }

  let minAll = Infinity, avgAll = null, buyFound = false;

  for (const item of active) {
    const hits = findPrice(pricesMap, item.id, item.region);

    if (!hits.length) {
      item.lastEntries = [];
      continue;
    }

    const minPrice = Math.min(...hits.map(h => h.price));
    item.lastPrice   = minPrice;
    item.lastEntries = hits;

    logPrice(item.id, minPrice);
    item.avgPrice = avg7d(item.id);

    if (minPrice < minAll) { minAll = minPrice; avgAll = item.avgPrice; }
    if (minPrice <= item.alertBelow) { triggerAlert(item); buyFound = true; }
  }

  finishCheck(minAll, avgAll, buyFound, active);
}

function finishCheck(minAll, avgAll, buyFound, active) {
  const t = new Date().toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  if (minAll < Infinity) {
    STATE.priceHistory.push({ time: t, price: minAll, avg: avgAll || minAll });
    if (STATE.priceHistory.length > 200) STATE.priceHistory.shift();
  }

  updateDashboard(minAll < Infinity ? minAll : null, avgAll);
  updateChart();
  renderItems();
  save();

  const tickerText = active
    .filter(i => i.lastPrice)
    .map(i => {
      const d = i.avgPrice ? Math.round(((i.lastPrice - i.avgPrice) / i.avgPrice) * 100) : null;
      return `${i.name}: ${i.lastPrice.toLocaleString()} L${d !== null ? ` (${d > 0 ? '+' : ''}${d}%)` : ''}`;
    }).join('  Â·  ');

  updateTicker(tickerText || 'Ø¢ÛŒØªÙ…ÛŒ Ø¯Ø± Ø¨Ø§Ø²Ø§Ø± ÛŒØ§ÙØª Ù†Ø´Ø¯');
  setStatus(`Ø¢Ø®Ø±ÛŒÙ† Ø¨Ø±Ø±Ø³ÛŒ: ${t}`, true);

  if (buyFound) {
    document.getElementById('statCur').classList.add('alert-card');
    setTimeout(() => document.getElementById('statCur').classList.remove('alert-card'), 5000);
  }
}

// â”€â”€ Ù‡Ø´Ø¯Ø§Ø± â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function triggerAlert(item) {
  STATE.alertCount++;
  document.getElementById('valAlerts').textContent = STATE.alertCount;
  const msg = `${item.name}: ${item.lastPrice.toLocaleString()} L`;
  STATE.alertLog.unshift({ time: new Date().toLocaleTimeString('fa-IR'), msg, price: item.lastPrice, item: item.name });
  if (STATE.alertLog.length > 50) STATE.alertLog.pop();
  renderAlertLog();
  showToast(`ðŸ”” ÙØ±ØµØª Ø®Ø±ÛŒØ¯! ${msg}`, true);
  if (STATE.settings.sound) playBeep();
  if (STATE.settings.notifications && Notification?.permission === 'granted')
    new Notification('ðŸ”” TL Tracker', { body: msg, icon: 'icons/icon-192.png' });
}

// â”€â”€ Monitor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function autoStart() { if (STATE.items.some(i => i.enabled)) startMonitor(); }

function startMonitor() {
  if (STATE.monitoring) return;
  STATE.monitoring = true;
  document.getElementById('toggleMonitor').classList.add('on');
  document.getElementById('monitorSub').textContent = 'ÙØ¹Ø§Ù„';
  checkAll();
  STATE.intervalId = setInterval(checkAll, STATE.settings.interval * 1000);
  save();
}

function stopMonitor() {
  STATE.monitoring = false;
  clearInterval(STATE.intervalId);
  document.getElementById('toggleMonitor').classList.remove('on');
  document.getElementById('monitorSub').textContent = 'Ù…ØªÙˆÙ‚Ù';
  setStatus('Ù…ØªÙˆÙ‚Ù', false);
  save();
}

function toggleMonitor() { STATE.monitoring ? stopMonitor() : startMonitor(); }

// â”€â”€ Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initChart() {
  const ctx = document.getElementById('priceChart').getContext('2d');
  STATE.chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Ù‚ÛŒÙ…Øª', data: [], borderColor: '#3d7fff', backgroundColor: 'rgba(61,127,255,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#3d7fff', borderWidth: 1.5 },
      { label: 'Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† Û· Ø±ÙˆØ²Ù‡', data: [], borderColor: '#00d4aa', backgroundColor: 'transparent', tension: 0.4, borderDash: [5,5], pointRadius: 0, borderWidth: 1.5 },
    ]},
    options: {
      responsive: false, animation: { duration: 300 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color:'#4a5a80', font:{size:9,family:'JetBrains Mono'}, maxRotation:0, maxTicksLimit:6 }, grid:{color:'rgba(30,45,80,0.6)'}, border:{display:false} },
        y: { ticks: { color:'#4a5a80', font:{size:9,family:'JetBrains Mono'} }, grid:{color:'rgba(30,45,80,0.6)'}, border:{display:false} },
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

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateDashboard(cur, avg) {
  const elCur    = document.getElementById('valCur');
  const elAvg    = document.getElementById('valAvg');
  const elProfit = document.getElementById('valProfit');

  elAvg.textContent = avg ? avg.toLocaleString() : 'â€”';

  if (cur) {
    elCur.textContent = cur.toLocaleString();
    if (avg) {
      // Ù‚Ø±Ù…Ø² = Ø²ÛŒØ± Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† (ÙØ±ØµØª Ø®Ø±ÛŒØ¯) | Ø³Ø¨Ø² = Ø¨Ø§Ù„Ø§ÛŒ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†
      elCur.className = cur < avg ? 'stat-value red' : 'stat-value green';
    } else {
      elCur.className = 'stat-value accent';
    }
  } else {
    elCur.textContent = 'â€”';
    elCur.className = 'stat-value accent';
  }

  if (cur && avg) {
    const profit = avg - cur;
    elProfit.textContent = (profit > 0 ? '+' : '') + profit.toLocaleString();
    elProfit.className = 'stat-value ' + (profit > 0 ? 'green' : 'red');
  } else {
    elProfit.textContent = 'â€”';
    elProfit.className = 'stat-value green';
  }
}

// â”€â”€ Render Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderItems() {
  const list = document.getElementById('itemsList');
  if (!STATE.items.length) {
    list.innerHTML = '<div style="text-align:center;padding:30px;font-size:13px;color:var(--text3)">Ù‡Ù†ÙˆØ² Ø¢ÛŒØªÙ…ÛŒ Ø§Ø¶Ø§ÙÙ‡ Ù†Ø´Ø¯Ù‡</div>';
    return;
  }
  list.innerHTML = STATE.items.map((item, i) => {
    const p   = item.lastPrice;
    const avg = item.avgPrice;
    const isBuy = p && p <= item.alertBelow;
    const diff  = (p && avg) ? Math.round(((p - avg) / avg) * 100) : null;
    const diffStr = diff !== null ? (diff > 0 ? `+${diff}%` : `${diff}%`) : (p ? 'Ø¯Ø§Ø¯Ù‡ Ú©Ø§ÙÛŒ Ù†ÛŒØ³Øª' : 'â€”');

    // Ø±Ù†Ú¯ Ø¨Ø± Ø§Ø³Ø§Ø³ Ù…Ù‚Ø§ÛŒØ³Ù‡ Ø¨Ø§ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†
    let col = 'var(--text)';
    let badge = '';
    if (p && avg) {
      if (p < avg) {
        col = 'var(--red)';
        badge = isBuy ? '<span class="badge buy">BUY</span>' : '<span class="badge watch">WATCH</span>';
      } else {
        col = 'var(--green)';
        badge = '<span class="badge ok">OK</span>';
      }
    }

    const qty = item.lastEntries ? item.lastEntries.reduce((s, e) => s + (e.qty || 0), 0) : 0;

    return `<div class="item-card ${isBuy ? 'buy-signal' : ''}" onclick="toggleItemEnabled(${i})">
      <div class="item-icon">${item.icon || 'ðŸŽ¯'}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-meta" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span>${item.region.toUpperCase()}</span>
          <span>Ø­Ø¯: ${item.alertBelow.toLocaleString()}</span>
          ${avg ? `<span>Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†: ${avg.toLocaleString()}</span>` : ''}
          ${qty ? `<span>qty: ${qty}</span>` : ''}
          ${badge}
        </div>
      </div>
      <div class="item-price">
        <div class="item-price-val" style="color:${col}">${p ? p.toLocaleString() : 'â€”'}</div>
        <div class="item-price-diff" style="color:${col};opacity:0.8">${diffStr}</div>
      </div>
      <button onclick="event.stopPropagation();removeItem(${i})" style="background:none;border:none;color:var(--text3);font-size:18px;padding:4px 8px;cursor:pointer;flex-shrink:0">Ã—</button>
    </div>`;
  }).join('');
}

function renderAlertLog() {
  const list = document.getElementById('alertList');
  if (!STATE.alertLog.length) {
    list.innerHTML = '<div class="alert-empty">Ù‡Ù†ÙˆØ² Ù‡Ø´Ø¯Ø§Ø±ÛŒ Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡</div>';
    return;
  }
  list.innerHTML = STATE.alertLog.slice(0, 15).map(e =>
    `<div class="alert-entry">
      <div class="alert-time">${e.time}</div>
      <div class="alert-msg"><strong>ðŸ”” ${e.item}</strong> â€” ${e.price.toLocaleString()} L</div>
    </div>`
  ).join('');
}

// â”€â”€ Item management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function addItem() {
  const name   = document.getElementById('inpName').value.trim();
  const id     = document.getElementById('inpId').value.trim();
  const alert  = parseInt(document.getElementById('inpAlert').value) || 500;
  const region = document.getElementById('inpRegion').value;
  if (!name || !id) { showToast('Ù†Ø§Ù… Ùˆ ID Ø¢ÛŒØªÙ… Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯'); return; }
  const icons = ['âš”ï¸','ðŸ›¡ï¸','ðŸ¹','ðŸ—¡ï¸','ðŸ”®','ðŸ’Ž','ðŸŽ¯','âš¡'];
  STATE.items.push({ id, name, icon: icons[STATE.items.length % icons.length], alertBelow: alert, region, enabled: true, lastPrice: null, avgPrice: null, lastEntries: [] });
  ['inpName','inpId','inpAlert'].forEach(id => document.getElementById(id).value = '');
  renderItems(); save();
  showToast(`${name} Ø§Ø¶Ø§ÙÙ‡ Ø´Ø¯ âœ“`);
}

function removeItem(i) { STATE.items.splice(i, 1); renderItems(); save(); }
function toggleItemEnabled(i) { STATE.items[i].enabled = !STATE.items[i].enabled; renderItems(); save(); }

// â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function saveSettings() {
  const s = parseInt(document.getElementById('inpInterval').value) || 30;
  STATE.settings.interval = s;
  document.getElementById('intervalSub').textContent = `Ù‡Ø± ${s} Ø«Ø§Ù†ÛŒÙ‡`;
  if (STATE.monitoring) { clearInterval(STATE.intervalId); STATE.intervalId = setInterval(checkAll, s * 1000); }
  save();
}

function toggleSetting(key) {
  STATE.settings[key] = !STATE.settings[key];
  const id = 'toggle' + key.charAt(0).toUpperCase() + key.slice(1);
  document.getElementById(id).className = 'toggle' + (STATE.settings[key] ? ' on' : '');
  save();
}

function toggleNotification() {
  if (!('Notification' in window)) { showToast('Ù…Ø±ÙˆØ±Ú¯Ø± Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ Ù†Ù…ÛŒâ€ŒÚ©Ù†Ø¯'); return; }
  if (Notification.permission === 'granted') {
    STATE.settings.notifications = !STATE.settings.notifications;
    document.getElementById('toggleNotif').className = 'toggle' + (STATE.settings.notifications ? ' on' : '');
    save();
  } else {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        STATE.settings.notifications = true;
        document.getElementById('toggleNotif').classList.add('on');
        save(); showToast('Ù†ÙˆØªÛŒÙÛŒÚ©ÛŒØ´Ù† ÙØ¹Ø§Ù„ Ø´Ø¯ âœ“');
      } else showToast('Ø¯Ø³ØªØ±Ø³ÛŒ Ø±Ø¯ Ø´Ø¯');
    });
  }
}

function requestNotifPerm() {
  if (Notification?.permission === 'granted') {
    STATE.settings.notifications = true;
    document.getElementById('toggleNotif').classList.add('on');
  }
}

function clearData() {
  if (!confirm('Ù‡Ù…Ù‡ Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ Ù¾Ø§Ú© Ø´ÙˆÙ†Ø¯ØŸ')) return;
  // Ù„Ø§Ú¯ Ù‚ÛŒÙ…Øªâ€ŒÙ‡Ø§ Ù‡Ù… Ù¾Ø§Ú© Ø¨Ø´Ù‡
  STATE.items.forEach(item => {
    try { localStorage.removeItem('tl_log_' + item.id); } catch(e) {}
  });
  localStorage.clear();
  STATE.priceHistory = []; STATE.alertLog = []; STATE.alertCount = 0;
  STATE.items = [...DEFAULT_ITEMS];
  renderItems(); renderAlertLog(); updateChart();
  showToast('Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ Ù¾Ø§Ú© Ø´Ø¯Ù†Ø¯');
}

// â”€â”€ View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function switchView(n) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + n).classList.add('active');
  document.getElementById('nav-' + n).classList.add('active');
}

// â”€â”€ UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setStatus(t, live) {
  document.getElementById('statusText').textContent = t;
  document.getElementById('pulseDot').className = 'pulse-dot' + (live ? ' live' : '');
}
function updateTicker(t) { document.getElementById('tickerText').textContent = t; }
function showToast(msg, isAlert = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isAlert ? ' alert-toast' : '') + ' show';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 3500);
}
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.25);
    });
  } catch(e) {}
}

// â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.addEventListener('DOMContentLoaded', () => {
  loadStorage();
  if (!STATE.items.length) STATE.items = [...DEFAULT_ITEMS];
  renderItems();
  initChart();
  updateChart();
  autoStart();
  requestNotifPerm();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});  if (data && typeof data === 'object' && !Array.isArray(data) && data['0']) {
    try {
      const keys = data['0'];
      const rows = [];
      let i = 1;
      while (data[String(i)] !== undefined) {
        const row = data[String(i)];
        const obj = {};
        keys.forEach((k, j) => { obj[k] = row[j]; });
        rows.push(obj);
        i++;
      }
      if (rows.length > 0) return rows;
    } catch(e) {}
  }

  // Ø±ÙˆØ´ Û³: Ø¢Ø±Ø§ÛŒÙ‡ Ø¨Ø§ header row
  if (Array.isArray(data) && data.length > 1) {
    const first = data[0];
    // Ø§Ú¯Ù‡ Ø§ÙˆÙ„ÛŒÙ† Ø§Ù„Ù…Ø§Ù† Ø¢Ø±Ø§ÛŒÙ‡â€ŒØ§ÛŒ Ø§Ø² stringÙ‡Ø§Ø³Øª (header)
    if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'string') {
      return data.slice(1).map(row => {
        if (!Array.isArray(row)) return row;
        const obj = {};
        first.forEach((k, j) => { if (row[j] !== undefined) obj[k] = row[j]; });
        return obj;
      });
    }
    // Ø§Ú¯Ù‡ Ø§Ù„Ù…Ø§Ù†â€ŒÙ‡Ø§ Ø¢Ø¨Ø¬Ú©Øª Ù‡Ø³ØªÙ†ØŒ Ù‡Ù…ÙˆÙ†Ø·ÙˆØ± Ø¨Ø±Ú¯Ø±Ø¯ÙˆÙ†
    if (typeof first === 'object' && !Array.isArray(first)) return data;
  }

  return Array.isArray(data) ? data : [];
}

// â”€â”€ Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchURL(url) {
  // Ø¨Ø¯ÙˆÙ† proxy
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (r.ok) return { ok: true, data: await r.json() };
  } catch(e) {}

  // Ø¨Ø§ Ù‡Ø± proxy
  for (const mkProxy of PROXIES) {
    try {
      const r = await fetch(mkProxy(url), { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text.length < 10) continue;
      return { ok: true, data: JSON.parse(text) };
    } catch(e) { continue; }
  }
  return { ok: false, data: null };
}

// â”€â”€ Ø¯Ø±ÛŒØ§ÙØª Ùˆ parse Ù‚ÛŒÙ…Øªâ€ŒÙ‡Ø§ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadPrices() {
  const { ok, data } = await fetchURL(PRICE_URL);
  if (!ok || !data) return null;

  const result = {}; // server -> [{id, price, qty}]
  const { list = {}, regions = {} } = data;

  // parse Ù‡Ø± Ø³Ø±ÙˆØ± Ø§Ø² list
  for (const [server, raw] of Object.entries(list)) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const rows = cjDecompress(parsed);
      if (Array.isArray(rows)) result[server] = rows;
    } catch(e) {}
  }

  // regions
  for (const [region, items] of Object.entries(regions)) {
    if (Array.isArray(items)) result[region] = items;
  }

  return result;
}

// â”€â”€ Ù¾ÛŒØ¯Ø§ Ú©Ø±Ø¯Ù† Ù‚ÛŒÙ…Øª Ø¢ÛŒØªÙ… â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function findPrice(pricesMap, itemId, region) {
  const hits = [];
  for (const [server, rows] of Object.entries(pricesMap)) {
    if (region && !server.startsWith(region)) continue;
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      if (!row) continue;
      let id, price, qty;

      if (Array.isArray(row)) {
        [id, price, qty] = row;
      } else if (typeof row === 'object') {
        id    = row.id    ?? row.item_id ?? row.itemId  ?? row.i;
        price = row.price ?? row.min_price ?? row.minPrice ?? row.p;
        qty   = row.quantity ?? row.qty ?? row.q ?? 0;
      }

      if (String(id) === String(itemId) && price && +price > 0) {
        hits.push({ server, price: +price, qty: +(qty || 0) });
      }
    }
  }
  return hits;
}

// â”€â”€ ØªØ§Ø±ÛŒØ®Ú†Ù‡ Ù‚ÛŒÙ…Øª Û· Ø±ÙˆØ²Ù‡ Ø¯Ø± localStorage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function logPrice(itemId, price) {
  const KEY = 'tl_log_' + itemId;
  let log = [];
  try { log = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) {}
  const now = Date.now();
  log.push([now, price]);
  const week = 7 * 24 * 3600 * 1000;
  log = log.filter(([t]) => now - t < week);
  try { localStorage.setItem(KEY, JSON.stringify(log)); } catch(e) {}
  return log;
}

function avg7d(itemId) {
  const KEY = 'tl_log_' + itemId;
  let log = [];
  try { log = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) {}
  if (!log.length) return null;
  return Math.round(log.reduce((s, [, p]) => s + p, 0) / log.length);
}

// â”€â”€ Storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function save() {
  try {
    localStorage.setItem('tl_items',   JSON.stringify(STATE.items));
    localStorage.setItem('tl_cfg',     JSON.stringify(STATE.settings));
    localStorage.setItem('tl_alerts',  JSON.stringify(STATE.alertLog.slice(-50)));
    localStorage.setItem('tl_history', JSON.stringify(STATE.priceHistory.slice(-200)));
  } catch(e) {}
}

function loadStorage() {
  try {
    const i = localStorage.getItem('tl_items');
    const s = localStorage.getItem('tl_cfg');
    const a = localStorage.getItem('tl_alerts');
    const h = localStorage.getItem('tl_history');
    if (i) STATE.items   = JSON.parse(i);
    if (s) Object.assign(STATE.settings, JSON.parse(s));
    if (a) STATE.alertLog = JSON.parse(a);
    if (h) STATE.priceHistory = JSON.parse(h);
    document.getElementById('inpInterval').value = STATE.settings.interval;
    document.getElementById('toggleSound').className = 'toggle' + (STATE.settings.sound ? ' on' : '');
    renderAlertLog();
  } catch(e) {}
}

// â”€â”€ Ú†Ú© Ú©Ø±Ø¯Ù† Ù‡Ù…Ù‡ Ø¢ÛŒØªÙ…â€ŒÙ‡Ø§ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function checkAll() {
  const active = STATE.items.filter(i => i.enabled);
  if (!active.length) return;

  setStatus('Ø¯Ø± Ø­Ø§Ù„ Ø¨Ø±Ø±Ø³ÛŒ...', true);
  updateTicker('ðŸ”„ Ø¯Ø±ÛŒØ§ÙØª Ù‚ÛŒÙ…Øª Ø§Ø² tldb.info...');

  const pricesMap = await loadPrices();

  if (!pricesMap) {
    setStatus('Ø®Ø·Ø§ Ø¯Ø± Ø§ØªØµØ§Ù„ â€” ØªÙ„Ø§Ø´ Ù…Ø¬Ø¯Ø¯...', false);
    updateTicker('âš ï¸ Ø³Ø±ÙˆÛŒØ³â€ŒÙ‡Ø§ÛŒ proxy Ø¯Ø± Ø¯Ø³ØªØ±Ø³ Ù†ÛŒØ³ØªÙ†Ø¯');
    return;
  }

  let minAll = Infinity, avgAll = null, buyFound = false;

  for (const item of active) {
    const hits = findPrice(pricesMap, item.id, item.region);

    if (!hits.length) {
      item.lastEntries = [];
      continue;
    }

    const minPrice = Math.min(...hits.map(h => h.price));
    item.lastPrice   = minPrice;
    item.lastEntries = hits;

    // Ø°Ø®ÛŒØ±Ù‡ Ø¯Ø± Ù„Ø§Ú¯ Û· Ø±ÙˆØ²Ù‡
    logPrice(item.id, minPrice);
    item.avgPrice = avg7d(item.id);

    if (minPrice < minAll) { minAll = minPrice; avgAll = item.avgPrice; }
    if (minPrice <= item.alertBelow) { triggerAlert(item); buyFound = true; }
  }

  const t = new Date().toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  if (minAll < Infinity) {
    STATE.priceHistory.push({ time: t, price: minAll, avg: avgAll || minAll });
    if (STATE.priceHistory.length > 200) STATE.priceHistory.shift();
  }

  updateDashboard(minAll < Infinity ? minAll : null, avgAll);
  updateChart();
  renderItems();
  save();

  const tickerText = active
    .filter(i => i.lastPrice)
    .map(i => {
      const d = i.avgPrice ? Math.round(((i.lastPrice - i.avgPrice) / i.avgPrice) * 100) : null;
      return `${i.name}: ${i.lastPrice.toLocaleString()} L${d !== null ? ` (${d > 0 ? '+' : ''}${d}%)` : ''}`;
    }).join('  Â·  ');

  updateTicker(tickerText || 'Ø¢ÛŒØªÙ…ÛŒ Ø¯Ø± Ø¨Ø§Ø²Ø§Ø± ÛŒØ§ÙØª Ù†Ø´Ø¯');
  setStatus(`Ø¢Ø®Ø±ÛŒÙ† Ø¨Ø±Ø±Ø³ÛŒ: ${t}`, true);

  if (buyFound) {
    document.getElementById('statCur').classList.add('alert-card');
    setTimeout(() => document.getElementById('statCur').classList.remove('alert-card'), 5000);
  }
}

// â”€â”€ Ù‡Ø´Ø¯Ø§Ø± â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function triggerAlert(item) {
  STATE.alertCount++;
  document.getElementById('valAlerts').textContent = STATE.alertCount;
  const msg = `${item.name}: ${item.lastPrice.toLocaleString()} L`;
  STATE.alertLog.unshift({ time: new Date().toLocaleTimeString('fa-IR'), msg, price: item.lastPrice, item: item.name });
  if (STATE.alertLog.length > 50) STATE.alertLog.pop();
  renderAlertLog();
  showToast(`ðŸ”” ÙØ±ØµØª Ø®Ø±ÛŒØ¯! ${msg}`, true);
  if (STATE.settings.sound) playBeep();
  if (STATE.settings.notifications && Notification?.permission === 'granted')
    new Notification('ðŸ”” TL Tracker', { body: msg, icon: 'icons/icon-192.png' });
}

// â”€â”€ Monitor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function autoStart() { if (STATE.items.some(i => i.enabled)) startMonitor(); }

function startMonitor() {
  if (STATE.monitoring) return;
  STATE.monitoring = true;
  document.getElementById('toggleMonitor').classList.add('on');
  document.getElementById('monitorSub').textContent = 'ÙØ¹Ø§Ù„';
  checkAll();
  STATE.intervalId = setInterval(checkAll, STATE.settings.interval * 1000);
  save();
}

function stopMonitor() {
  STATE.monitoring = false;
  clearInterval(STATE.intervalId);
  document.getElementById('toggleMonitor').classList.remove('on');
  document.getElementById('monitorSub').textContent = 'Ù…ØªÙˆÙ‚Ù';
  setStatus('Ù…ØªÙˆÙ‚Ù', false);
  save();
}

function toggleMonitor() { STATE.monitoring ? stopMonitor() : startMonitor(); }

// â”€â”€ Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initChart() {
  const ctx = document.getElementById('priceChart').getContext('2d');
  STATE.chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Ù‚ÛŒÙ…Øª', data: [], borderColor: '#3d7fff', backgroundColor: 'rgba(61,127,255,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#3d7fff', borderWidth: 1.5 },
      { label: 'Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† Û· Ø±ÙˆØ²Ù‡', data: [], borderColor: '#00d4aa', backgroundColor: 'transparent', tension: 0.4, borderDash: [5,5], pointRadius: 0, borderWidth: 1.5 },
    ]},
    options: {
      responsive: false, animation: { duration: 300 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color:'#4a5a80', font:{size:9,family:'JetBrains Mono'}, maxRotation:0, maxTicksLimit:6 }, grid:{color:'rgba(30,45,80,0.6)'}, border:{display:false} },
        y: { ticks: { color:'#4a5a80', font:{size:9,family:'JetBrains Mono'} }, grid:{color:'rgba(30,45,80,0.6)'}, border:{display:false} },
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

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateDashboard(cur, avg) {
  const elCur    = document.getElementById('valCur');
  const elAvg    = document.getElementById('valAvg');
  const elProfit = document.getElementById('valProfit');

  elAvg.textContent = avg ? avg.toLocaleString() : 'â€”';

  if (cur) {
    elCur.textContent = cur.toLocaleString();
    if (avg) {
      // Ù‚Ø±Ù…Ø² = Ø²ÛŒØ± Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† (ÙØ±ØµØª Ø®Ø±ÛŒØ¯) | Ø³Ø¨Ø² = Ø¨Ø§Ù„Ø§ÛŒ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†
      elCur.className = cur < avg ? 'stat-value red' : 'stat-value green';
    } else {
      elCur.className = 'stat-value accent';
    }
  } else {
    elCur.textContent = 'â€”';
    elCur.className = 'stat-value accent';
  }

  if (cur && avg) {
    const profit = avg - cur;
    elProfit.textContent = (profit > 0 ? '+' : '') + profit.toLocaleString();
    elProfit.className = 'stat-value ' + (profit > 0 ? 'green' : 'red');
  } else {
    elProfit.textContent = 'â€”';
    elProfit.className = 'stat-value green';
  }
}

// â”€â”€ Render Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderItems() {
  const list = document.getElementById('itemsList');
  if (!STATE.items.length) {
    list.innerHTML = '<div style="text-align:center;padding:30px;font-size:13px;color:var(--text3)">Ù‡Ù†ÙˆØ² Ø¢ÛŒØªÙ…ÛŒ Ø§Ø¶Ø§ÙÙ‡ Ù†Ø´Ø¯Ù‡</div>';
    return;
  }
  list.innerHTML = STATE.items.map((item, i) => {
    const p   = item.lastPrice;
    const avg = item.avgPrice;
    const isBuy = p && p <= item.alertBelow;
    const diff  = (p && avg) ? Math.round(((p - avg) / avg) * 100) : null;
    const diffStr = diff !== null ? (diff > 0 ? `+${diff}%` : `${diff}%`) : (p ? 'Ø¯Ø§Ø¯Ù‡ Ú©Ø§ÙÛŒ Ù†ÛŒØ³Øª' : 'â€”');

    // Ø±Ù†Ú¯ Ø¨Ø± Ø§Ø³Ø§Ø³ Ù…Ù‚Ø§ÛŒØ³Ù‡ Ø¨Ø§ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†
    let col = 'var(--text)';
    let badge = '';
    if (p && avg) {
      if (p < avg) {
        col = 'var(--red)';
        badge = isBuy ? '<span class="badge buy">BUY</span>' : '<span class="badge watch">WATCH</span>';
      } else {
        col = 'var(--green)';
        badge = '<span class="badge ok">OK</span>';
      }
    }

    const qty = item.lastEntries ? item.lastEntries.reduce((s, e) => s + (e.qty || 0), 0) : 0;

    return `<div class="item-card ${isBuy ? 'buy-signal' : ''}" onclick="toggleItemEnabled(${i})">
      <div class="item-icon">${item.icon || 'ðŸŽ¯'}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-meta" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span>${item.region.toUpperCase()}</span>
          <span>Ø­Ø¯: ${item.alertBelow.toLocaleString()}</span>
          ${avg ? `<span>Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†: ${avg.toLocaleString()}</span>` : ''}
          ${qty ? `<span>qty: ${qty}</span>` : ''}
          ${badge}
        </div>
      </div>
      <div class="item-price">
        <div class="item-price-val" style="color:${col}">${p ? p.toLocaleString() : 'â€”'}</div>
        <div class="item-price-diff" style="color:${col};opacity:0.8">${diffStr}</div>
      </div>
      <button onclick="event.stopPropagation();removeItem(${i})" style="background:none;border:none;color:var(--text3);font-size:18px;padding:4px 8px;cursor:pointer;flex-shrink:0">Ã—</button>
    </div>`;
  }).join('');
}

function renderAlertLog() {
  const list = document.getElementById('alertList');
  if (!STATE.alertLog.length) {
    list.innerHTML = '<div class="alert-empty">Ù‡Ù†ÙˆØ² Ù‡Ø´Ø¯Ø§Ø±ÛŒ Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡</div>';
    return;
  }
  list.innerHTML = STATE.alertLog.slice(0, 15).map(e =>
    `<div class="alert-entry">
      <div class="alert-time">${e.time}</div>
      <div class="alert-msg"><strong>ðŸ”” ${e.item}</strong> â€” ${e.price.toLocaleString()} L</div>
    </div>`
  ).join('');
}

// â”€â”€ Item management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function addItem() {
  const name   = document.getElementById('inpName').value.trim();
  const id     = document.getElementById('inpId').value.trim();
  const alert  = parseInt(document.getElementById('inpAlert').value) || 500;
  const region = document.getElementById('inpRegion').value;
  if (!name || !id) { showToast('Ù†Ø§Ù… Ùˆ ID Ø¢ÛŒØªÙ… Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯'); return; }
  const icons = ['âš”ï¸','ðŸ›¡ï¸','ðŸ¹','ðŸ—¡ï¸','ðŸ”®','ðŸ’Ž','ðŸŽ¯','âš¡'];
  STATE.items.push({ id, name, icon: icons[STATE.items.length % icons.length], alertBelow: alert, region, enabled: true, lastPrice: null, avgPrice: null, lastEntries: [] });
  ['inpName','inpId','inpAlert'].forEach(id => document.getElementById(id).value = '');
  renderItems(); save();
  showToast(`${name} Ø§Ø¶Ø§ÙÙ‡ Ø´Ø¯ âœ“`);
}

function removeItem(i) { STATE.items.splice(i, 1); renderItems(); save(); }
function toggleItemEnabled(i) { STATE.items[i].enabled = !STATE.items[i].enabled; renderItems(); save(); }

// â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function saveSettings() {
  const s = parseInt(document.getElementById('inpInterval').value) || 30;
  STATE.settings.interval = s;
  document.getElementById('intervalSub').textContent = `Ù‡Ø± ${s} Ø«Ø§Ù†ÛŒÙ‡`;
  if (STATE.monitoring) { clearInterval(STATE.intervalId); STATE.intervalId = setInterval(checkAll, s * 1000); }
  save();
}

function toggleSetting(key) {
  STATE.settings[key] = !STATE.settings[key];
  const id = 'toggle' + key.charAt(0).toUpperCase() + key.slice(1);
  document.getElementById(id).className = 'toggle' + (STATE.settings[key] ? ' on' : '');
  save();
}

function toggleNotification() {
  if (!('Notification' in window)) { showToast('Ù…Ø±ÙˆØ±Ú¯Ø± Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ Ù†Ù…ÛŒâ€ŒÚ©Ù†Ø¯'); return; }
  if (Notification.permission === 'granted') {
    STATE.settings.notifications = !STATE.settings.notifications;
    document.getElementById('toggleNotif').className = 'toggle' + (STATE.settings.notifications ? ' on' : '');
    save();
  } else {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        STATE.settings.notifications = true;
        document.getElementById('toggleNotif').classList.add('on');
        save(); showToast('Ù†ÙˆØªÛŒÙÛŒÚ©ÛŒØ´Ù† ÙØ¹Ø§Ù„ Ø´Ø¯ âœ“');
      } else showToast('Ø¯Ø³ØªØ±Ø³ÛŒ Ø±Ø¯ Ø´Ø¯');
    });
  }
}

function requestNotifPerm() {
  if (Notification?.permission === 'granted') {
    STATE.settings.notifications = true;
    document.getElementById('toggleNotif').classList.add('on');
  }
}

function clearData() {
  if (!confirm('Ù‡Ù…Ù‡ Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ Ù¾Ø§Ú© Ø´ÙˆÙ†Ø¯ØŸ')) return;
  // Ù„Ø§Ú¯ Ù‚ÛŒÙ…Øªâ€ŒÙ‡Ø§ Ù‡Ù… Ù¾Ø§Ú© Ø¨Ø´Ù‡
  STATE.items.forEach(item => {
    try { localStorage.removeItem('tl_log_' + item.id); } catch(e) {}
  });
  localStorage.clear();
  STATE.priceHistory = []; STATE.alertLog = []; STATE.alertCount = 0;
  STATE.items = [...DEFAULT_ITEMS];
  renderItems(); renderAlertLog(); updateChart();
  showToast('Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ Ù¾Ø§Ú© Ø´Ø¯Ù†Ø¯');
}

// â”€â”€ View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function switchView(n) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + n).classList.add('active');
  document.getElementById('nav-' + n).classList.add('active');
}

// â”€â”€ UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setStatus(t, live) {
  document.getElementById('statusText').textContent = t;
  document.getElementById('pulseDot').className = 'pulse-dot' + (live ? ' live' : '');
}
function updateTicker(t) { document.getElementById('tickerText').textContent = t; }
function showToast(msg, isAlert = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isAlert ? ' alert-toast' : '') + ' show';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 3500);
}
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.25);
    });
  } catch(e) {}
}

// â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.addEventListener('DOMContentLoaded', () => {
  loadStorage();
  if (!STATE.items.length) STATE.items = [...DEFAULT_ITEMS];
  renderItems();
  initChart();
  updateChart();
  autoStart();
  requestNotifPerm();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});// â”€â”€ ØªØ§Ø±ÛŒØ®Ú†Ù‡ Ù‚ÛŒÙ…Øª Ø¨Ø±Ø§ÛŒ Ù‡Ø± Ø¢ÛŒØªÙ… â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // ÙÙ‚Ø· Û· Ø±ÙˆØ² Ø§Ø®ÛŒØ± Ù†Ú¯Ù‡ Ø¯Ø§Ø±ÛŒÙ…
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

// â”€â”€ Fetch Ø¨Ø§ CORS proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchWithProxy(url) {
  // Ø§ÙˆÙ„ Ø¨Ø¯ÙˆÙ† proxy
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (r.ok) return await r.json();
  } catch(e) {}
  // Ø¨Ø§ proxy
  try {
    const r = await fetch(CORS + encodeURIComponent(url));
    if (r.ok) return await r.json();
  } catch(e) {}
  return null;
}

// â”€â”€ Ø¯Ø±ÛŒØ§ÙØª Ø¢ÛŒØªÙ…â€ŒÙ‡Ø§ Ø§Ø² API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchItems() {
  const data = await fetchWithProxy(DATA_URL);
  if (!data) return null;
  try {
    // Ø±ÙˆØ´ Û±: nodes Ø¨Ø§ devalue
    if (data.nodes) {
      const dataNode = data.nodes.find(n => n && n.type === 'data');
      if (dataNode && dataNode.data) {
        const d = dataNode.data;
        if (d.items) return decompressCJ(d.items);
      }
    }
    // Ø±ÙˆØ´ Û²: Ù…Ø³ØªÙ‚ÛŒÙ…
    if (data.items) return decompressCJ(data.items);
    return null;
  } catch(e) { return null; }
}

// â”€â”€ Ø¯Ø±ÛŒØ§ÙØª Ù‚ÛŒÙ…Øªâ€ŒÙ‡Ø§ Ø§Ø² API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchPrices() {
  const data = await fetchWithProxy(PRICE_URL);
  if (!data) return null;
  try {
    const { list = {}, regions = {} } = data;
    const result = {};
    // decompress Ù‡Ø± Ø³Ø±ÙˆØ±
    for (const [server, raw] of Object.entries(list)) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        result[server] = decompressCJ(parsed);
      } catch(e) {
        result[server] = Array.isArray(raw) ? raw : [];
      }
    }
    // regions Ù‡Ù… Ø§Ø¶Ø§ÙÙ‡
    for (const [region, items] of Object.entries(regions)) {
      if (Array.isArray(items)) result[region] = items;
    }
    return result;
  } catch(e) { return null; }
}

// â”€â”€ Ù¾ÛŒØ¯Ø§ Ú©Ø±Ø¯Ù† Ù‚ÛŒÙ…Øª Ø¢ÛŒØªÙ… Ø§Ø² Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Ø§ØµÙ„ÛŒ: Ø¨Ø±Ø±Ø³ÛŒ Ù‡Ù…Ù‡ Ø¢ÛŒØªÙ…â€ŒÙ‡Ø§ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function checkAll() {
  const active = STATE.items.filter(i => i.enabled);
  if (!active.length) return;

  setStatus('Ø¯Ø± Ø­Ø§Ù„ Ø¨Ø±Ø±Ø³ÛŒ...', true);
  updateTicker('ðŸ”„ Ø¯Ø±ÛŒØ§ÙØª Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø§Ø² tldb.info...');

  const pricesMap = await fetchPrices();

  if (!pricesMap) {
    setStatus('Ø®Ø·Ø§ Ø¯Ø± Ø§ØªØµØ§Ù„', false);
    updateTicker('âš ï¸ Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ù‚ÛŒÙ…Øª â€” Ø¨Ø±Ø±Ø³ÛŒ Ø¨Ø¹Ø¯ÛŒ Ø¨Ù‡ Ø²ÙˆØ¯ÛŒ');
    return;
  }

  let minOverall = Infinity, avgOverall = null, buyFound = false;

  for (const item of active) {
    const entries = findItemPrice(pricesMap, item.id, item.region);

    if (entries.length === 0) {
      // Ø¢ÛŒØªÙ… Ø¯Ø± Ø¨Ø§Ø²Ø§Ø± Ù†ÛŒØ³Øª
      item.lastEntries = [];
      continue;
    }

    const minPrice = Math.min(...entries.map(e => e.price));
    item.lastPrice = minPrice;
    item.lastEntries = entries;

    // Ø°Ø®ÛŒØ±Ù‡ Ø¯Ø± Ù„Ø§Ú¯ Û· Ø±ÙˆØ²Ù‡ Ùˆ Ù…Ø­Ø§Ø³Ø¨Ù‡ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†
    addPriceLog(item.id, minPrice);
    item.avgPrice = calcAvg7d(item.id);

    if (minPrice < minOverall) {
      minOverall = minPrice;
      avgOverall = item.avgPrice;
    }

    // Ù‡Ø´Ø¯Ø§Ø±
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
      const sign = diff !== null ? (diff > 0 ? `â–²${diff}%` : `â–¼${Math.abs(diff)}%`) : '';
      return `${i.name}: ${i.lastPrice.toLocaleString()} L ${sign}`;
    }).join('  Â·  ');

  updateTicker(ticker || 'Ø¢ÛŒØªÙ…ÛŒ Ø¯Ø± Ø¨Ø§Ø²Ø§Ø± ÛŒØ§ÙØª Ù†Ø´Ø¯');
  setStatus(`Ø¢Ø®Ø±ÛŒÙ† Ø¨Ø±Ø±Ø³ÛŒ: ${t}`, true);

  if (buyFound) {
    document.getElementById('statCur').classList.add('alert-card');
    setTimeout(() => document.getElementById('statCur').classList.remove('alert-card'), 5000);
  }
}

// â”€â”€ Ù‡Ø´Ø¯Ø§Ø± â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function triggerAlert(item) {
  STATE.alertCount++;
  document.getElementById('valAlerts').textContent = STATE.alertCount;
  const diff = item.avgPrice ? Math.round(((item.alertBelow - item.lastPrice) / item.alertBelow) * 100) : 0;
  const msg = `${item.name}: ${item.lastPrice.toLocaleString()} L (${diff}% Ø²ÛŒØ± Ø­Ø¯)`;
  STATE.alertLog.unshift({ time: new Date().toLocaleTimeString('fa-IR'), msg, price: item.lastPrice, item: item.name });
  if (STATE.alertLog.length > 50) STATE.alertLog.pop();
  renderAlertLog();
  showToast(`ðŸ”” ÙØ±ØµØª Ø®Ø±ÛŒØ¯! ${item.name} â€” ${item.lastPrice.toLocaleString()} L`, true);
  if (STATE.settings.sound) playBeep();
  if (STATE.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('ðŸ”” TL Tracker â€” ÙØ±ØµØª Ø®Ø±ÛŒØ¯!', { body: msg, icon: 'icons/icon-192.png' });
  }
}

// â”€â”€ Monitor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function autoStartMonitor() { if (STATE.items.some(i => i.enabled)) startMonitor(); }

function startMonitor() {
  if (STATE.monitoring) return;
  STATE.monitoring = true;
  document.getElementById('toggleMonitor').classList.add('on');
  document.getElementById('monitorSub').textContent = 'ÙØ¹Ø§Ù„';
  setStatus('Ø¯Ø± Ø­Ø§Ù„ Ù¾Ø§ÛŒØ´', true);
  checkAll();
  STATE.intervalId = setInterval(checkAll, STATE.settings.interval * 1000);
  save();
}

function stopMonitor() {
  STATE.monitoring = false;
  clearInterval(STATE.intervalId);
  document.getElementById('toggleMonitor').classList.remove('on');
  document.getElementById('monitorSub').textContent = 'Ù…ØªÙˆÙ‚Ù';
  setStatus('Ù…ØªÙˆÙ‚Ù', false);
  save();
}

function toggleMonitor() { STATE.monitoring ? stopMonitor() : startMonitor(); }

// â”€â”€ Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initChart() {
  const ctx = document.getElementById('priceChart').getContext('2d');
  STATE.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Ù‚ÛŒÙ…Øª', data: [], borderColor: '#3d7fff', backgroundColor: 'rgba(61,127,255,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#3d7fff', borderWidth: 1.5 },
        { label: 'Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† Û· Ø±ÙˆØ²Ù‡', data: [], borderColor: '#00d4aa', backgroundColor: 'transparent', tension: 0.4, borderDash: [5, 5], pointRadius: 0, borderWidth: 1.5 },
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

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateDashboard(cur, avg) {
  const elCur = document.getElementById('valCur');
  const elAvg = document.getElementById('valAvg');
  const elProfit = document.getElementById('valProfit');

  if (cur) {
    elCur.textContent = cur.toLocaleString();
    // Ø±Ù†Ú¯â€ŒØ¨Ù†Ø¯ÛŒ Ø¨Ø± Ø§Ø³Ø§Ø³ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†
    if (avg) {
      if (cur < avg) {
        elCur.className = 'stat-value red'; // Ø²ÛŒØ± Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† = Ù‚Ø±Ù…Ø² = ÙØ±ØµØª Ø®Ø±ÛŒØ¯
      } else {
        elCur.className = 'stat-value green'; // Ø¨Ø§Ù„Ø§ÛŒ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† = Ø³Ø¨Ø²
      }
    } else {
      elCur.className = 'stat-value accent';
    }
  } else {
    elCur.textContent = 'â€”';
    elCur.className = 'stat-value accent';
  }

  elAvg.textContent = avg ? avg.toLocaleString() : 'â€”';

  if (cur && avg) {
    const profit = avg - cur;
    elProfit.textContent = profit > 0 ? '+' + profit.toLocaleString() : profit.toLocaleString();
    elProfit.className = 'stat-value ' + (profit > 0 ? 'green' : 'red');
  } else {
    elProfit.textContent = 'â€”';
    elProfit.className = 'stat-value green';
  }
}

// â”€â”€ Render Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderItems() {
  const list = document.getElementById('itemsList');
  if (!STATE.items.length) {
    list.innerHTML = '<div style="text-align:center;padding:30px;font-size:13px;color:var(--text3)">Ù‡Ù†ÙˆØ² Ø¢ÛŒØªÙ…ÛŒ Ø§Ø¶Ø§ÙÙ‡ Ù†Ø´Ø¯Ù‡</div>';
    return;
  }

  list.innerHTML = STATE.items.map((item, i) => {
    const p = item.lastPrice;
    const avg = item.avgPrice;
    const isBuy = p && p <= item.alertBelow;

    // Ø±Ù†Ú¯â€ŒØ¨Ù†Ø¯ÛŒ Ø¨Ø± Ø§Ø³Ø§Ø³ Ù…Ù‚Ø§ÛŒØ³Ù‡ Ø¨Ø§ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† Û· Ø±ÙˆØ²Ù‡
    let priceColor = 'var(--text)';
    let diffStr = 'â€”';
    let badge = '';

    if (p && avg) {
      const diff = Math.round(((p - avg) / avg) * 100);
      diffStr = diff > 0 ? `+${diff}%` : `${diff}%`;
      if (p < avg) {
        priceColor = 'var(--red)';   // Ø²ÛŒØ± Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† = Ù‚Ø±Ù…Ø²
        badge = isBuy
          ? '<span class="badge buy">BUY</span>'
          : '<span class="badge watch">WATCH</span>';
      } else {
        priceColor = 'var(--green)'; // Ø¨Ø§Ù„Ø§ÛŒ Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† = Ø³Ø¨Ø²
        badge = '<span class="badge ok">OK</span>';
      }
    } else if (p && !avg) {
      diffStr = 'Ø¯Ø§Ø¯Ù‡ Ú©Ø§ÙÛŒ Ù†ÛŒØ³Øª';
      badge = '<span class="badge watch">NEW</span>';
    }

    // Ù†Ù…Ø§ÛŒØ´ ØªØ¹Ø¯Ø§Ø¯ Ù…ÙˆØ¬ÙˆØ¯ Ø¯Ø± Ø¨Ø§Ø²Ø§Ø±
    const totalQty = item.lastEntries ? item.lastEntries.reduce((s, e) => s + e.qty, 0) : 0;

    return `<div class="item-card ${isBuy ? 'buy-signal' : ''}" onclick="toggleItemEnabled(${i})">
      <div class="item-icon">${item.icon || 'ðŸŽ¯'}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span>${item.region.toUpperCase()}</span>
          <span>Ø­Ø¯: ${item.alertBelow.toLocaleString()}</span>
          ${avg ? `<span>Ù…ÛŒØ§Ù†Ú¯ÛŒÙ†: ${avg.toLocaleString()}</span>` : ''}
          ${totalQty ? `<span>qty: ${totalQty}</span>` : ''}
          ${badge}
        </div>
      </div>
      <div class="item-price">
        <div class="item-price-val" style="color:${priceColor}">${p ? p.toLocaleString() : 'â€”'}</div>
        <div class="item-price-diff" style="color:${priceColor};opacity:0.8">${diffStr}</div>
      </div>
      <button onclick="event.stopPropagation();removeItem(${i})" style="background:none;border:none;color:var(--text3);font-size:18px;padding:4px 8px;cursor:pointer;flex-shrink:0">Ã—</button>
    </div>`;
  }).join('');
}

function renderAlertLog() {
  const list = document.getElementById('alertList');
  if (!STATE.alertLog.length) {
    list.innerHTML = '<div class="alert-empty">Ù‡Ù†ÙˆØ² Ù‡Ø´Ø¯Ø§Ø±ÛŒ Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡</div>';
    return;
  }
  list.innerHTML = STATE.alertLog.slice(0, 15).map(e =>
    `<div class="alert-entry">
      <div class="alert-time">${e.time}</div>
      <div class="alert-msg"><strong>ðŸ”” ${e.item}</strong> â€” ${e.price.toLocaleString()} L</div>
    </div>`
  ).join('');
}

// â”€â”€ Item management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function addItem() {
  const name = document.getElementById('inpName').value.trim();
  const id   = document.getElementById('inpId').value.trim();
  const alert = parseInt(document.getElementById('inpAlert').value) || 500;
  const region = document.getElementById('inpRegion').value;
  if (!name || !id) { showToast('Ù†Ø§Ù… Ùˆ ID Ø¢ÛŒØªÙ… Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯'); return; }
  const icons = ['âš”ï¸','ðŸ›¡ï¸','ðŸ¹','ðŸ—¡ï¸','ðŸ”®','ðŸ’Ž','ðŸŽ¯','âš¡'];
  STATE.items.push({ id, name, icon: icons[STATE.items.length % icons.length], alertBelow: alert, region, enabled: true, lastPrice: null, avgPrice: null, lastEntries: [] });
  document.getElementById('inpName').value = '';
  document.getElementById('inpId').value = '';
  document.getElementById('inpAlert').value = '';
  renderItems();
  save();
  showToast(`${name} Ø§Ø¶Ø§ÙÙ‡ Ø´Ø¯ âœ“`);
}

function removeItem(i) { STATE.items.splice(i, 1); renderItems(); save(); }
function toggleItemEnabled(i) { STATE.items[i].enabled = !STATE.items[i].enabled; renderItems(); save(); }

// â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function saveSettings() {
  const s = parseInt(document.getElementById('inpInterval').value) || 30;
  STATE.settings.interval = s;
  document.getElementById('intervalSub').textContent = `Ù‡Ø± ${s} Ø«Ø§Ù†ÛŒÙ‡`;
  if (STATE.monitoring) { clearInterval(STATE.intervalId); STATE.intervalId = setInterval(checkAll, s * 1000); }
  save();
}

function toggleSetting(key) {
  STATE.settings[key] = !STATE.settings[key];
  document.getElementById('toggle' + key.charAt(0).toUpperCase() + key.slice(1)).className = 'toggle' + (STATE.settings[key] ? ' on' : '');
  save();
}

function toggleNotification() {
  if (!('Notification' in window)) { showToast('Ù…Ø±ÙˆØ±Ú¯Ø± Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ Ù†Ù…ÛŒâ€ŒÚ©Ù†Ø¯'); return; }
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
        showToast('Ù†ÙˆØªÛŒÙÛŒÚ©ÛŒØ´Ù† ÙØ¹Ø§Ù„ Ø´Ø¯ âœ“');
      } else { showToast('Ø¯Ø³ØªØ±Ø³ÛŒ Ø±Ø¯ Ø´Ø¯'); }
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
  if (!confirm('Ù‡Ù…Ù‡ Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ Ù¾Ø§Ú© Ø´ÙˆÙ†Ø¯ØŸ')) return;
  localStorage.clear();
  STATE.priceHistory = []; STATE.alertLog = []; STATE.alertCount = 0;
  STATE.items = [...DEFAULT_ITEMS];
  renderItems(); renderAlertLog(); updateChart();
  showToast('Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ Ù¾Ø§Ú© Ø´Ø¯Ù†Ø¯');
}

// â”€â”€ View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function switchView(n) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + n).classList.add('active');
  document.getElementById('nav-' + n).classList.add('active');
}

// â”€â”€ UI helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
