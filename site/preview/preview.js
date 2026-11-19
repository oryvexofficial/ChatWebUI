'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let connected = false;
let route = 'Auto';
let filter = 'Core';
let foxHasAccount = false;
let foxEmail = 'fox@oryvex.dev';
let selectedCountry = 'de';
let sessionSeconds = 0;
let downBytes = 0;
let upBytes = 0;
let downRate = 0;
let upRate = 0;
let ticker = null;

const countries = {
  de: { code: 'de', name: 'Germany', gw: 'de-fra-wg-001' },
  nl: { code: 'nl', name: 'Netherlands', gw: 'nl-ams-wg-002' },
  us: { code: 'us', name: 'United States', gw: 'us-nyc-wg-004' },
  jp: { code: 'jp', name: 'Japan', gw: 'jp-tyo-wg-001' },
};

const descriptions = {
  Auto: 'Try each route and keep the first that connects.',
  WireGuard: 'Fast when UDP traffic is allowed.',
  MASQUE: 'Uses an HTTP/2 or HTTP/3 tunnel.',
  'MASQUE²': 'MASQUE carried inside MASQUE.',
  Gool: 'WireGuard carried inside MASQUE.',
  Tor: 'Connect directly through Tor, using bridges when needed.',
  Bypass: 'A direct route that reshapes packets. Your IP address does not change.',
  Fox: 'Unofficial Firefox Account client. Mozilla VPN service access is required.'
};

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatRate(n) {
  if (!connected || n <= 0) return '0 B/s';
  if (n < 1024) return `${n} B/s`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB/s`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatUptime(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function defaultGatewayForRoute(r) {
  const c = countries[selectedCountry] || countries.de;
  if (!connected) {
    if (r === 'Fox') return foxHasAccount ? `Fox (${c.code.toUpperCase()})` : 'Account required';
    if (r === 'Tor') return `Tor (${c.code.toUpperCase()})`;
    if (r === 'Bypass') return 'Direct · Bypass';
    if (r === 'Auto') return 'Auto scan';
    return `${r} ready`;
  }
  if (r === 'Fox') return c.gw;
  if (r === 'Tor') return `Tor exit · ${c.code.toUpperCase()}`;
  if (r === 'Bypass') return 'Direct (127.0.0.1:1819)';
  return `162.159.198.1:443`;
}

function updateStatsUI() {
  const c = countries[selectedCountry] || countries.de;
  $('#stat-down-rate').textContent = formatRate(downRate);
  $('#stat-down-total').textContent = `${formatBytes(downBytes)} total`;
  $('#stat-up-rate').textContent = formatRate(upRate);
  $('#stat-up-total').textContent = `${formatBytes(upBytes)} total`;
  $('#stat-session').textContent = connected ? formatUptime(sessionSeconds) : '00:00:00';
  const vpnOn = $('#vpn-toggle') ? $('#vpn-toggle').checked : true;
  $('#stat-session-foot').textContent = connected
    ? (vpnOn ? 'Whole-device VPN active' : 'Tunnel up')
    : 'Starts when you connect';

  $('#stat-gateway').textContent = defaultGatewayForRoute(route);
  const flagEl = $('#stat-gw-flag');
  const badgeEl = $('#connected-country-badge');
  if (connected) {
    flagEl.src = `../assets/flags/${c.code}.png`;
    flagEl.hidden = false;
    $('#stat-gateway-foot').textContent = `${c.name} (${c.code.toUpperCase()})`;
    $('#connected-country-flag').src = `../assets/flags/${c.code}.png`;
    $('#connected-country-text').textContent = `Connected to ${c.name}`;
    $('#connected-country-code').textContent = c.code.toUpperCase();
    badgeEl.hidden = false;
  } else {
    if (route === 'Tor' || (route === 'Fox' && foxHasAccount)) {
      flagEl.src = `../assets/flags/${c.code}.png`;
      flagEl.hidden = false;
      $('#stat-gateway-foot').textContent = `${c.name} (${c.code.toUpperCase()})`;
    } else {
      flagEl.hidden = true;
      $('#stat-gateway-foot').textContent = descriptions[route] || '';
    }
    badgeEl.hidden = true;
  }
}

function page(id) {
  $$('.page').forEach(e => e.classList.toggle('active', e.id === id));
  $$('.nav').forEach(e => e.classList.toggle('active', e.dataset.page === id));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

$$('.nav').forEach(b => b.addEventListener('click', () => page(b.dataset.page)));
$$('[data-goto]').forEach(b => b.addEventListener('click', () => page(b.dataset.goto)));

function showDialog(title, text) {
  $('#dialog-title').textContent = title;
  $('#dialog-text').textContent = text;
  $('#dialog').showModal();
}
$('#close-dialog').onclick = $('#dialog-done').onclick = () => $('#dialog').close();

function showFoxAccountModal() {
  const modal = $('#fox-account-modal');
  if (modal && typeof modal.showModal === 'function') {
    modal.showModal();
  }
}

function closeFoxAccountModal() {
  const modal = $('#fox-account-modal');
  if (modal && modal.open) modal.close();
}

$('#close-fox-modal').onclick = closeFoxAccountModal;
$('#fox-modal-cancel').onclick = closeFoxAccountModal;
$('#fox-modal-web').onclick = () => {
  foxHasAccount = true;
  closeFoxAccountModal();
  setRoute('Fox');
};
$('#fox-modal-direct').onclick = () => {
  foxHasAccount = true;
  closeFoxAccountModal();
  setRoute('Fox');
};

function renderRouteExtra() {
  let html = '';
  if (route === 'Tor') {
    html = `<div class="subcard"><h3>Tor exit country</h3><p>Choose an exit country. Bundled country flags appear on the Connect panel and Gateway card.</p><div class="country-grid">${Object.values(countries).map(c => `<button type="button" data-cc="${c.code}" class="${selectedCountry === c.code ? 'selected' : ''}"><img src="../assets/flags/${c.code}.png" alt="">${c.name}</button>`).join('')}</div></div>`;
  } else if (route === 'Fox') {
    if (!foxHasAccount) {
      html = `<div class="subcard"><h3>Firefox Account</h3><p>Unofficial client. Mozilla VPN service access is required. No accounts added yet.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="primary" id="fox-add-account-btn">Sign in with Mozilla</button><button type="button" class="outline" id="fox-direct-signin-btn">Other sign-in</button></div><p>Clicking Connect without an account opens the custom Account Required modal.</p></div>`;
    } else {
      html = `<div class="subcard"><h3>Firefox Account</h3><div class="fox-account-pill"><div><b>${foxEmail}</b><br><small>Active · Device key provisioned</small></div><button type="button" class="outline" id="fox-remove-account-btn">Remove</button></div><h3>Fox location</h3><div class="country-grid">${Object.values(countries).map(c => `<button type="button" data-cc="${c.code}" class="${selectedCountry === c.code ? 'selected' : ''}"><img src="../assets/flags/${c.code}.png" alt="">${c.name}</button>`).join('')}</div></div>`;
    }
  } else if (route === 'Bypass') {
    html = `<div class="subcard"><h3>Bypass list</h3><p>Choose services for direct, packet-reshaped connections in the app.</p><button type="button" class="outline demo-action">View services</button></div>`;

  }
  $('#route-extra').innerHTML = html;

  $$('[data-cc]').forEach(btn => {
    btn.onclick = () => {
      selectedCountry = btn.dataset.cc;
      renderRouteExtra();
      updateStatsUI();
      renderLogs();
    };
  });

  const addBtn = $('#fox-add-account-btn');
  if (addBtn) addBtn.onclick = () => { foxHasAccount = true; renderRouteExtra(); updateStatsUI(); };
  const directBtn = $('#fox-direct-signin-btn');
  if (directBtn) directBtn.onclick = () => { foxHasAccount = true; renderRouteExtra(); updateStatsUI(); };
  const removeBtn = $('#fox-remove-account-btn');
  if (removeBtn) {
    removeBtn.onclick = () => {
      foxHasAccount = false;
      if (connected) stopConnection();
      renderRouteExtra();
      updateStatsUI();
    };
  }
  $$('.demo-action').forEach(b => {
    b.onclick = () => showDialog('Preview only', 'This interactive preview simulates OryvexVPN controls in your browser.');
  });
}

function setRoute(v) {
  route = v;
  $('#route').value = v;
  $('#settings-route').value = v;
  $('#route-pill').textContent = v;
  $('#route-caption').textContent = v === 'Auto'
    ? 'Auto: WireGuard › MASQUE › MASQUE² › Gool'
    : `${v} · SOCKS5 127.0.0.1:1819`;
  $('#route-description').textContent = descriptions[v];
  renderRouteExtra();
  updateStatsUI();
  renderLogs();
}

$('#route').onchange = e => setRoute(e.target.value);
$('#settings-route').onchange = e => setRoute(e.target.value);
$('#about-route').onclick = () => showDialog(route, descriptions[route]);
$('#relay').onclick = () => showDialog(
  'Deploy Cloudflare relay',
  'In the real app you can open a Cloudflare token template, choose an account, and deploy a restricted Worker relay automatically.'
);
$$('.disabled-demo').forEach(b => {
  b.onclick = () => showDialog('Preview only', 'Updates are checked in the real app.');
});

function startConnection() {
  if (route === 'Fox' && !foxHasAccount) {
    showFoxAccountModal();
    return;
  }
  connected = true;
  sessionSeconds = 1;
  downRate = 2450000;
  upRate = 380000;
  downBytes = 4900000;
  upBytes = 760000;
  $('#status').textContent = '● Connected · VPN';
  $('#status').classList.add('connected');
  $('#hero-eyebrow').textContent = 'Encrypted & Active';
  $('#headline').textContent = "You're private.";
  $('#connect-button').textContent = 'Disconnect';
  $('#orb').classList.add('on');
  updateStatsUI();
  renderLogs();
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => {
    sessionSeconds += 1;
    downRate = 1800000 + ((sessionSeconds * 317903) % 4200000);
    upRate = 210000 + ((sessionSeconds * 97111) % 640000);
    downBytes += downRate;
    upBytes += upRate;
    updateStatsUI();
  }, 1000);
}

function stopConnection() {
  connected = false;
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  sessionSeconds = 0;
  downRate = 0;
  upRate = 0;
  downBytes = 0;
  upBytes = 0;
  $('#status').textContent = '● Off';
  $('#status').classList.remove('connected');
  $('#hero-eyebrow').textContent = 'Private by Design';
  $('#headline').textContent = 'Ready to connect.';
  $('#connect-button').textContent = 'Connect';
  $('#orb').classList.remove('on');
  updateStatsUI();
  renderLogs();
}

function toggleConnection() {
  if (connected) {
    stopConnection();
  } else {
    startConnection();
  }
}

$('#connect-button').onclick = toggleConnection;
$('#orb').onclick = toggleConnection;
if ($('#vpn-toggle')) $('#vpn-toggle').onchange = updateStatsUI;

function renderLogs() {
  const el = $('#logs');
  const c = countries[selectedCountry] || countries.de;
  if (!connected) {
    el.innerHTML = '<div class="empty"><span>▤</span><h2>No activity yet.</h2><p>Connect on any route to inspect simulated activity lines.</p></div>';
    return;
  }
  if (filter === 'Problems') {
    el.innerHTML = '<div class="empty"><span>✓</span><h2>No connection problems.</h2><p>All stages completed cleanly.</p></div>';
    return;
  }
  el.innerHTML = [
    `<div class="log-line"><b>INFO</b> &nbsp; [*] starting ${route} route</div>`,
    `<div class="log-line"><b>OK</b> &nbsp; [+] using gateway ${defaultGatewayForRoute(route)}</div>`,
    `<div class="log-line"><b>OK</b> &nbsp; [+] connected country ${c.code} (${c.name})</div>`,
    `<div class="log-line"><b>OK</b> &nbsp; [+] socks5 server listening on 127.0.0.1:1819</div>`
  ].join('');
}

$$('[data-filter]').forEach(b => {
  b.onclick = () => {
    filter = b.dataset.filter;
    $$('[data-filter]').forEach(x => x.classList.toggle('selected', x === b));
    renderLogs();
  };
});

$('#copy-log').onclick = () => showDialog('Activity log', 'In the real app, Copy activity copies your redacted diagnostic log to the clipboard.');
$('#dark').onchange = e => document.body.classList.toggle('light', !e.target.checked);
$$('.tor-modes button').forEach(b => {
  b.onclick = () => {
    $$('.tor-modes button').forEach(x => x.classList.toggle('selected', x === b));
  };
});

setRoute('Auto');
