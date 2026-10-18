/* ═══════════════════════════════════════════════════
   LabDesk — App core: boot · router · live sync ·
   search palette · global actions
   ═══════════════════════════════════════════════════ */
'use strict';

const App = (() => {
  const ROUTES = {
    '': Pages.dashboard, dashboard: Pages.dashboard,
    inventory: Pages.inventory, tickets: Pages.tickets,
    data: Pages.data, settings: Pages.settings,
  };
  let route = 'dashboard';
  let rail = null;      // VelocityRail
  let bc = null;        // BroadcastChannel
  const TAB = 'tab-' + Math.random().toString(36).slice(2, 8);

  /* ── settings ── */
  const settings = () => JSON.parse(localStorage.getItem('snpl.settings.v1') || '{}');
  function applySettings() {
    const st = settings();
    document.documentElement.dataset.theme = st.theme === 'graphite' ? 'graphite' : 'paper';
    document.documentElement.dataset.density = st.density === 'compact' ? 'compact' : 'comfortable';
    $('#btnTheme em').textContent = document.documentElement.dataset.theme === 'graphite' ? 'Paper' : 'Graphite';
    $('#btnDensity em').textContent = document.documentElement.dataset.density === 'compact' ? 'Comfortable' : 'Compact';
  }

  /* ── navigation rail ── */
  const NAV = [
    { r: 'dashboard', label: 'Dashboard', icon: I.dash },
    { r: 'inventory', label: 'Inventory', icon: I.box, badge: () => DB.all('records').length },
    { r: 'tickets', label: 'Fault Desk', icon: I.ticket, badge: () => DB.all('tickets').filter(t => t.status === 'Open' || t.status === 'In Progress').length },
    { r: 'data', label: 'Data Manager', icon: I.db },
    { r: 'settings', label: 'Settings', icon: I.gear },
  ];
  function renderNav() {
    $('#railNav').innerHTML = NAV.map(n => `
      <button class="nav-item ${n.r === route ? 'on' : ''}" data-r="${n.r}">
        ${n.icon}<span>${n.label}</span>${n.badge ? `<small>${n.badge()}</small>` : ''}
      </button>`).join('');
    $$('#railNav .nav-item').forEach(b => b.addEventListener('click', () => go(b.dataset.r)));
  }

  /* ── router ── */
  function go(r) {
    if (!ROUTES[r]) r = 'dashboard';
    if (location.hash !== '#' + r) location.hash = r;
    else render();
  }
  function currentRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    return ROUTES[h] ? h : 'dashboard';
  }
  function render() {
    route = currentRoute();
    const pg = ROUTES[route];
    const view = $('#view');
    Pages._timers.forEach(clearInterval); Pages._timers.length = 0;
    App.currentGrid = null;
    view.dataset.route = route;
    view.innerHTML = '';
    pg.mount(view);
    $('#pageTitle').textContent = pg.title;
    $('#pageSub').textContent = pg.sub;
    $('#btnNewLabel').textContent = route === 'tickets' ? 'New Ticket' : 'New Item';
    renderNav();
    rail?.buildDots();
    view.scrollIntoView({ block: 'start' });
    $('#scroll').scrollTop = 0;
    rail?.update();
  }
  function refresh() { render(); }

  /* ── global actions ── */
  function exportJSON() {
    download('labdesk-backup-' + new Date().toISOString().slice(0, 10) + '.json',
      DB.exportJSON(), 'application/json');
    toast('JSON backup downloaded');
  }
  function printCurrent() {
    if (App.currentGrid) App.currentGrid.printReport();
    else {
      const s = DB.stats();
      $('#printRoot').innerHTML = `
        <div class="pr-head"><div><h1>LabDesk — Summary Report</h1>
          <div class="org">${esc(DB.state.meta.org)}</div></div>
          <div class="pr-meta">Generated <b>${new Date().toLocaleString('en-GB')}</b></div></div>
        <div class="pr-summary">
          <div><small>Items</small><b>${s.total}</b></div>
          <div><small>Active / in use</small><b>${s.active}</b></div>
          <div><small>In repair</small><b>${s.repair}</b></div>
          <div><small>Faulty</small><b>${s.fault}</b></div>
          <div><small>Open tickets</small><b>${s.openT}</b></div>
          <div><small>Stock value</small><b>${fmtMoney(s.value)}</b></div>
        </div>
        <table class="pr"><thead><tr><th>ID</th><th>Item</th><th>Category</th><th>Qty</th><th>Price</th><th>Status</th><th>Location</th></tr></thead>
        <tbody>${DB.all('records').map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${esc(r.category)}</td><td>${r.qty}</td><td>${esc(fmtMoney(r.price))}</td><td>${esc(r.status)}</td><td>${esc(r.location)}</td></tr>`).join('')}</tbody></table>
        <div class="pr-foot"><span>LabDesk — Shakeel New Project Lab</span><span class="pageno"></span></div>`;
      window.print();
    }
  }

  /* ── search palette ── */
  function palette() {
    const items = [];
    DB.all('records').forEach(r => items.push({ t: r.name, s: r.id + ' · ' + r.category, go: 'inventory', q: r.id }));
    DB.all('tickets').forEach(t => items.push({ t: t.issue, s: t.id + ' · ' + t.system, go: 'tickets', q: t.id }));
    openModal({
      title: 'Search everything', wide: true,
      body: `<input type="text" id="palQ" placeholder="Type to search records & tickets…" style="width:100%;padding:12px 14px;border-radius:11px;border:1px solid var(--line-2);background:var(--fill)">
             <div class="palette-list" id="palList" style="margin-top:12px"></div>`,
      actions: [],
    });
    const inp = $('#palQ'), list = $('#palList');
    const draw = q => {
      const qq = q.trim().toLowerCase();
      const hits = (qq ? items.filter(i => (i.t + ' ' + i.s).toLowerCase().includes(qq)) : items.slice(0, 8)).slice(0, 14);
      list.innerHTML = hits.length ? hits.map((h, i) => `
        <button class="palette-item" data-i="${items.indexOf(h)}">
          ${I.box}<span>${esc(h.t)}<br><small style="color:var(--ink-3)">${esc(h.s)}</small></span>
          <span class="tag">${esc(h.go)}</span>
        </button>`).join('') : '<div class="palette-empty">No matches.</div>';
      $$('.palette-item', list).forEach(b => b.addEventListener('click', () => {
        const hit = hits[+b.dataset.i];
        if (!hit) return;
        close2(); go(hit.go);
        setTimeout(() => {
          const si = $('.g-search');
          if (si) { si.value = hit.q; si.dispatchEvent(new Event('input', { bubbles: true })); }
        }, 90);
      }));
    };
    const close2 = () => { $$('.scrim,.modal').forEach(e => e.remove()); };
    inp.addEventListener('input', () => draw(inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') $('.palette-item', list)?.click(); });
    draw('');
    inp.focus();
  }

  /* ── live sync (cross-tab) ── */
  function initLive() {
    try { bc = new BroadcastChannel('snpl-live'); } catch (e) { /* older browser */ }
    const onRemote = () => {
      DB.load().then(() => { toast('Live sync — data refreshed'); render(); });
    };
    bc && bc.addEventListener('message', e => { if (e.data && e.data.from !== TAB) onRemote(); });
    window.addEventListener('storage', e => { if (e.key === 'snpl.db.v1') onRemote(); });
    DB.on((kind) => { if (kind === 'change') bc?.postMessage({ from: TAB, t: Date.now() }); });
  }

  /* ── animated background dust ── */
  function dust() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#bgDust'), cx = cv.getContext('2d');
    let W, H, ps = [];
    const size = () => {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      ps = Array.from({ length: Math.min(70, innerWidth / 18) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.8 + .4, s: Math.random() * .35 + .08,
        o: Math.random() * .35 + .08, dx: (Math.random() - .5) * .2,
      }));
    };
    size();
    addEventListener('resize', debounce(size, 200));
    const dark = () => document.documentElement.dataset.theme === 'graphite';
    (function loop() {
      cx.clearRect(0, 0, W, H);
      const ink = dark() ? '255,255,255' : '23,23,22';
      ps.forEach(p => {
        p.y -= p.s; p.x += p.dx;
        if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
        if (p.x < -4) p.x = W + 4; if (p.x > W + 4) p.x = -4;
        cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7);
        cx.fillStyle = `rgba(${ink},${p.o})`; cx.fill();
      });
      requestAnimationFrame(loop);
    })();
  }

  /* ── boot ── */
  async function boot() {
    await DB.load();
    applySettings();

    const enter = () => {
      $('#login').hidden = true;
      $('#app').hidden = false;
      rail = new VelocityRail($('#scroll'));
      renderNav();
      initLive();
      dust();
      render();
      /* top tools */
      $('#btnPrint').onclick = printCurrent;
      $('#btnExcel').onclick = () => App.currentGrid ? App.currentGrid.exportCSV() : exportJSON();
      $('#btnNew').onclick = () => {
        if (route !== 'inventory' && route !== 'tickets') go('inventory');
        setTimeout(() => App.currentGrid?.openForm(), 80);
      };
      $('#btnSearch').onclick = palette;
      $('#btnAccount').onclick = () => go('settings');
      $('#btnTheme').onclick = () => {
        const st2 = settings();
        st2.theme = document.documentElement.dataset.theme === 'graphite' ? 'paper' : 'graphite';
        localStorage.setItem('snpl.settings.v1', JSON.stringify(st2));
        applySettings();
      };
      $('#btnDensity').onclick = () => {
        const st2 = settings();
        st2.density = document.documentElement.dataset.density === 'compact' ? 'comfortable' : 'compact';
        localStorage.setItem('snpl.settings.v1', JSON.stringify(st2));
        applySettings(); App.refresh();
      };
      $('#btnLock').onclick = () => { Auth.logout(); location.hash = ''; location.reload(); };
      $('#btnRail').onclick = () => $('#rail').classList.toggle('open');
      addEventListener('hashchange', render);
      document.addEventListener('keydown', e => {
        if (e.target.matches('input,textarea,select')) return;
        if (e.key === '/') { e.preventDefault(); palette(); }
        if (e.key === 'n') { e.preventDefault(); $('#btnNew').click(); }
        if (e.key === 'p') { e.preventDefault(); printCurrent(); }
        if (e.key === 't') { e.preventDefault(); $('#btnTheme').click(); }
        if (e.key === 'd') { e.preventDefault(); $('#btnDensity').click(); }
        if (e.key === 'l') { e.preventDefault(); Auth.logout(); location.hash = ''; location.reload(); }
      });
      /* service worker (live hosting) */
      if ('serviceWorker' in navigator && /^https?:/.test(location.protocol))
        navigator.serviceWorker.register('sw.js').catch(() => {});
    };

    if (Auth.isAuthed()) { enter(); return; }
    $('#login').hidden = false;
    Auth.init(enter);
    $('#pinInput').focus();
  }

  return { boot, go, render, refresh, applySettings, exportJSON, printCurrent, palette, currentGrid: null, _pendingQ: null };
})();

window.addEventListener('DOMContentLoaded', App.boot);
