/* ==========================================================================
   app.js — boot, router, rail, top bar, palette, shortcuts, live badge.
   Hash routing only, so the same build works from a file:// double-click,
   a static server, GitHub Pages or Netlify without any rewrite rules.
   ========================================================================== */
(function (w) {
  'use strict';
  var SNL = w.SNL, U = SNL.U, esc = U.esc;
  var app = SNL.app = {};
  var page = null, cur = 'dashboard', nav = [], lastFocus = null;

  var NAV = [
    { grp: 'Desk' },
    { k: 'dashboard', label: 'Dashboard', icon: 'chart', key: 'd' },
    { grp: 'Inventory' },
    { k: 'pcs', label: 'Lab Systems', icon: 'monitor', key: 'p' },
    { k: 'staff', label: 'Staff Systems', icon: 'users', key: 's' },
    { grp: 'Work' },
    { k: 'faults', label: 'Fault Desk', icon: 'wrench', key: 'f', alert: 'late' },
    { k: 'store', label: 'Store Room', icon: 'box', key: 'r', alert: 'low' },
    { k: 'tx', label: 'Movements', icon: 'swap', key: 'v' },
    { k: 'purchases', label: 'Purchases', icon: 'cart', key: 'u' },
    { grp: 'Output' },
    { k: 'data', label: 'Data & Live', icon: 'cloud', key: 'b' }
  ];

  /* ------------------------------- boot ------------------------------- */
  app.boot = function () {
    var boot = document.getElementById('boot');
    applyTheme();
    SNL.db.boot().then(function (res) {
      if (res.how === 'seeded') console.info('[Lab Desk] seeded ' + (res.rows || 0) + ' records from data/lab-data.json');
      buildRail();
      wire();
      SNL.live.start();
      SNL.live.on(liveBadge);
      SNL.db.on(function (c) { if (c === 'settings') { applyTheme(); buildRail(); } else buildRail(); });
      boot.classList.add('gone');
      setTimeout(function () { boot.remove(); }, 280);
      SNL.auth.require(function () {
        document.getElementById('app').hidden = false;
        route();
        w.addEventListener('hashchange', route);
        if ('serviceWorker' in navigator && w.isSecureContext) {
          window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function () { });
          });
        }
      });
    });
  };

  app.applyTheme = applyTheme;
  function applyTheme() {
    var s = SNL.db.settings(), d = document.documentElement;
    var theme = localStorage.getItem('snpl.theme') || 'paper';
    d.setAttribute('data-theme', theme);
    d.setAttribute('data-density', s.density === 'compact' ? 'compact' : 'comfy');
    d.setAttribute('data-motion', s.motion === 'off' ? 'off' : 'on');
    d.style.setProperty('--zoom', s.zoom || 1);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', theme === 'graphite' ? '#131211' : '#F3F1EA');
    var tb = document.getElementById('btn-theme'); if (tb) tb.querySelector('em').textContent = theme === 'graphite' ? 'Paper' : 'Graphite';
    var db2 = document.getElementById('btn-density'); if (db2) db2.querySelector('em').textContent = s.density === 'compact' ? 'Compact' : 'Comfortable';
    if (SNL.collectionRefresh && cur !== 'dashboard' && cur !== 'data') SNL.collectionRefresh();
  }
  function toggleTheme() {
    var next = (document.documentElement.getAttribute('data-theme') === 'graphite') ? 'paper' : 'graphite';
    localStorage.setItem('snpl.theme', next);
    applyTheme();
    SNL.ui.toast(next === 'graphite' ? 'Graphite — warm dark ink' : 'Paper — ivory & clay', 'ok', 1800);
  }
  function toggleDensity() {
    var s = SNL.db.settings();
    SNL.db.setSettings({ density: s.density === 'compact' ? 'comfy' : 'compact' });
    applyTheme();
  }

  /* ------------------------------- rail ------------------------------- */
  function buildRail() {
    var box = document.getElementById('rail-nav'); if (!box) return;
    var o = SNL.stats.overview();
    var counts = {
      dashboard: null, pcs: SNL.db.count('pcs'), staff: SNL.db.count('staff'), faults: o.open + o.inprog,
      store: SNL.db.count('store'), tx: SNL.db.count('tx'), purchases: SNL.db.count('purchases'), data: null
    };
    box.innerHTML = NAV.map(function (n) {
      if (n.grp) return '<div class="rail-grp">' + esc(n.grp) + '</div>';
      var cnt = counts[n.k];
      var alert = n.alert === 'late' ? o.late : n.alert === 'low' ? (o.out.length + o.low.length) : 0;
      return '<a class="rail-link' + (alert ? ' warn' : '') + '" href="#/' + n.k + '" data-k="' + n.k + '"' + (cur === n.k ? ' aria-current="page"' : '') + '>' +
        '<span class="gi gi-' + n.icon + '"></span><span>' + esc(n.label) + '</span>' +
        (cnt != null ? '<span class="count"' + (alert ? ' style="color:var(--bad)"' : '') + '>' + (alert && n.alert !== 'low' ? alert : cnt) + '</span>' : (alert ? '<span class="count" style="color:var(--bad)">' + alert + '</span>' : '')) +
        '</a>';
    }).join('');
    var org = document.querySelector('[data-org]'); if (org) org.textContent = SNL.db.settings().org;
  }

  /* ------------------------------- wire ------------------------------- */
  function wire() {
    U.on(document.getElementById('rail'), 'click', '.rail-link', function () { closeRail(); });
    document.getElementById('btn-rail').onclick = function () {
      var r = document.getElementById('rail'), sc = document.getElementById('scrim');
      r.classList.toggle('open'); sc.hidden = !r.classList.contains('open');
      sc.onclick = closeRail;
    };
    document.getElementById('btn-theme').onclick = toggleTheme;
    document.getElementById('btn-density').onclick = toggleDensity;
    document.getElementById('btn-search').onclick = palette;
    document.getElementById('btn-live').onclick = function () { app.go('data/live'); };
    document.getElementById('btn-print').onclick = function () { printHere(); };
    document.getElementById('btn-export').onclick = function () { exportHere(); };
    document.getElementById('btn-new').onclick = function () {
      if (SNL.pages.newRecord && SNL.SCH[cur]) SNL.pages.newRecord(cur);
      else SNL.ui.toast('Pick a table first — records live in Lab Systems, Fault Desk, Store or Purchases', 'ok', 4000);
    };
    document.getElementById('btn-acc').onclick = account;
    w.addEventListener('keydown', keys);
  }
  function closeRail() {
    var r = document.getElementById('rail'); r.classList.remove('open');
    var sc = document.getElementById('scrim'); sc.hidden = true;
  }

  function account() {
    var left = SNL.auth.left(), s = SNL.db.settings();
    var mins = Math.floor(left / 60000);
    SNL.ui.modal({
      narrow: true, title: 'Signed in', sub: SNL.auth.user() + ' · ' + s.org,
      html: '<dl class="kv"><dt>Session</dt><dd>' + (mins > 59 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min left' : mins + ' min left') + ' of 12 h</dd>' +
        '<dt>Data</dt><dd>' + SNL.db.COLS.reduce(function (n, c) { return n + SNL.db.count(c); }, 0) + ' rows in this browser · rev ' + (SNL.db.meta.rev || 0) + '</dd>' +
        '<dt>Live</dt><dd>' + esc(SNL.live.label()) + '</dd></dl>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">' +
        '<button class="chip" data-a="pw"><span class="gi gi-lock gi-sm"></span><em>Change the password</em></button>' +
        '<button class="chip" data-a="live"><span class="gi gi-cloud gi-sm"></span><em>Live sync settings</em></button>' +
        '<button class="chip" data-a="xls"><span class="gi gi-xls gi-sm"></span><em>Export the whole workbook</em></button>' +
        '<button class="chip btn-danger" data-a="out"><span class="gi gi-close gi-sm"></span><em>Sign out of this device</em></button></div>',
      onOpen: function (m) {
        U.on(m.el, 'click', '[data-a]', function (e, b) {
          var a = b.dataset.a; m.close();
          if (a === 'pw') SNL.auth.changePw();
          if (a === 'live') app.go('data/live');
          if (a === 'xls') SNL.xls.workbook({});
          if (a === 'out') SNL.auth.logout();
        });
      }
    });
  }

  /* ------------------------------ routing ----------------------------- */
  app.hash = function (h) { if (('#/' + h) !== w.location.hash) w.location.hash = '#/' + h; };
  app.go = function (r) { app.hash(r); setTimeout(route, 0); };
  app.currentPage = function () { return page; };

  function route() {
    var raw = (w.location.hash || '#/dashboard').replace(/^#\/?/, '');
    var p = raw.split('/'), key = p[0] || 'dashboard';
    if (!SNL.SCH[key] && ['dashboard', 'data'].indexOf(key) < 0) key = 'dashboard';
    if (key === 'reports') key = 'data';
    cur = key;
    var view = document.getElementById('view'), scroll = document.getElementById('scroll');
    if (page && page.destroy) { try { page.destroy(); } catch (e) { } }
    view.innerHTML = '';
    scroll.scrollTop = 0;
    if (key === 'dashboard') page = SNL.pages.dashboard(view);
    else if (key === 'data') page = SNL.pages.data(view, p[1] || 'excel');
    else page = SNL.pages.collection(view, key);
    var sc = SNL.SCH[key];
    document.getElementById('page-title').textContent = sc ? sc.title : (key === 'data' ? 'Data & Live' : 'Dashboard');
    document.getElementById('page-sub').textContent = sc ? (SNL.db.count(key) + ' records · ' + (sc.board ? 'table, cards and board' : 'ledger with quick scroll')) : (key === 'data' ? 'Excel, JSON, sync, settings' : 'Everything the lab needs today');
    var nb = document.getElementById('btn-new');
    nb.style.display = sc && !sc.readOnly ? '' : 'none';
    document.getElementById('btn-new-label').textContent = sc ? 'New ' + sc.one : 'New';
    buildRail();
    if (U.isMobile()) closeRail();
    view.focus({ preventScroll: true });
  }
  app.route = route;

  /* --------------------------- export / print ------------------------- */
  function exportHere() {
    if (cur === 'dashboard') { SNL.xls.workbook({}); SNL.ui.toast('Full workbook exported', 'ok'); return; }
    if (cur === 'data') { U.download('snpl.json', JSON.stringify(SNL.db.doc(), null, 1)); SNL.ui.toast('snpl.json downloaded', 'ok'); return; }
    var rows = page && page.rows ? page.rows() : SNL.db.all(cur);
    SNL.xls.exportCol(cur, rows, {});
    SNL.ui.toast(rows.length + ' row(s) exported · ' + (rows.length !== SNL.db.count(cur) ? 'filtered set' : 'all records'), 'ok');
  }
  function printHere() {
    if (cur === 'dashboard') { SNL.pages.dashboardSummary(true); return; }
    if (cur === 'data') { SNL.xls.print(SNL.mods().filter(function (c) { return SNL.db.count(c) && c !== 'logs'; }).map(function (c) { return SNL.xls.sheetFor(c, SNL.db.all(c), {}); })); return; }
    var st = SNL.collectionState(), rows = page && page.rows ? page.rows() : [];
    if (st && st.mode === 'board') {
      var groups = (SNL.SCH[cur].board || []).map(function (s) { return { label: s, rows: rows.filter(function (r) { return r[SNL.SCH[cur].statusField] === s; }) }; });
      SNL.xls.printBoard(cur, groups); return;
    }
    var n = SNL.xls.printCol(cur, rows, {});
    SNL.ui.toast('Printing ' + n + ' filtered row(s) · A4, one page wide', 'ok');
  }

  /* ------------------------------ palette ----------------------------- */
  function palette() {
    lastFocus = document.activeElement;
    var box = U.el('div', 'palette');
    box.innerHTML = '<div class="pal-in"><span class="gi gi-search"></span><input placeholder="Jump to a record, page or action…" data-focus><button class="chip btn-quiet" data-esc>Esc</button></div>' +
      '<div class="pal-list" data-list></div>' +
      '<div class="pal-f"><span>↑↓ move</span><span>Enter open</span><span>type to search every table</span></div>';
    var layer = U.el('div', 'layer anch'); layer.appendChild(box);
    var scrim = U.el('div', 'scrim');
    document.getElementById('layers').appendChild(scrim); document.getElementById('layers').appendChild(layer);
    var input = box.querySelector('input'), list = box.querySelector('[data-list]'), sel = 0, items = [];
    var close = function () { layer.remove(); scrim.remove(); input.blur(); if (lastFocus) lastFocus.focus && lastFocus.focus(); };
    scrim.onclick = close; box.querySelector('[data-esc]').onclick = close;

    var CMDS = [
      { t: 'page', ic: 'chart', label: 'Dashboard', sub: 'open', fn: function () { app.go('dashboard'); } },
      { t: 'page', ic: 'xls', label: 'Export the full Excel workbook', sub: 'action', fn: function () { SNL.xls.workbook({}); } },
      { t: 'page', ic: 'print', label: 'Print this page on A4', sub: 'action', fn: printHere },
      { t: 'page', ic: 'moon', label: 'Switch Paper / Graphite', sub: 'action', fn: toggleTheme },
      { t: 'page', ic: 'rows', label: 'Toggle compact rows', sub: 'action', fn: toggleDensity },
      { t: 'page', ic: 'cloud', label: 'Live sync — pull now', sub: 'action', fn: function () { SNL.live.pull().then(function () { SNL.ui.toast('Pulled', 'ok'); }, function (e) { SNL.ui.toast(e.message, 'err'); }); } },
      { t: 'page', ic: 'cloud', label: 'Live sync — push now', sub: 'action', fn: function () { SNL.live.push().then(function () { SNL.ui.toast('Published', 'ok'); }, function (e) { SNL.ui.toast(e.message, 'err'); }); } },
      { t: 'page', ic: 'box', label: 'Download snpl.json (the whole database)', sub: 'action', fn: function () { U.download('snpl.json', JSON.stringify(SNL.db.doc(), null, 1)); } },
      { t: 'page', ic: 'lock', label: 'Change the login password', sub: 'action', fn: function () { SNL.auth.changePw(); } },
      { t: 'page', ic: 'plus', label: 'New record…', sub: 'action', fn: function () { SNL.pages.newRecord(SNL.SCH[cur] ? cur : 'pcs'); } }
    ];
    var draw = function () {
      var q = U.norm(input.value);
      items = [];
      NAV.filter(function (n) { return !n.grp; }).forEach(function (n) {
        if (U.hit(U.norm(n.label + ' ' + n.k), q)) items.push({ t: 'page', ic: n.icon, label: n.label, sub: 'open · ' + SNL.db.count(n.k) + ' rows', fn: function () { app.go(n.k); } });
      });
      if (!q) CMDS.slice(0, 6).forEach(function (c) { items.push(c); });
      else CMDS.forEach(function (c) { if (U.hit(U.norm(c.label), q)) items.push(c); });
      ['pcs', 'staff', 'faults', 'store', 'tx', 'purchases'].forEach(function (col) {
        if (q.length < 2) return;
        var n = 0;
        SNL.db.all(col).forEach(function (r) {
          if (n >= 6) return;
          if (U.hit(SNL.db.hay(col, r), q)) {
            n++;
            items.push({
              t: 'rec', ic: SNL.SCH[col].icon, label: SNL.labelOf(col, r), sub: SNL.SCH[col].title + ' · ' + r.id,
              fn: function () { app.go(col); setTimeout(function () { SNL.ui.viewer(col, r.id); }, 140); }
            });
          }
        });
      });
      items = items.slice(0, 40);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.innerHTML = items.length ? items.map(function (it, i) {
        return '<button class="pal-item" data-i="' + i + '" aria-selected="' + (i === sel) + '"><span class="gi gi-' + it.ic + ' gi-sm"></span>' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.label) + '</span><span class="sp"></span><small>' + esc(it.sub) + '</small></button>';
      }).join('') : '<p style="padding:18px;font-size:13px;color:var(--ink-3)">No match for “' + esc(input.value) + '”.</p>';
    };
    var move = function (d) {
      sel = U.clamp(sel + d, 0, Math.max(0, items.length - 1));
      U.qa('.pal-item', list).forEach(function (b, i) { b.setAttribute('aria-selected', i === sel); });
      var on = list.querySelector('[aria-selected="true"]'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    input.oninput = function () { sel = 0; draw(); };
    input.onkeydown = function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); var it = items[sel]; if (it) { close(); it.fn(); } }
      else if (e.key === 'Escape') close();
    };
    U.on(list, 'click', '.pal-item', function (e, b) { var it = items[+b.dataset.i]; close(); it && it.fn(); });
    draw(); input.focus();
  }

  /* ----------------------------- shortcuts ---------------------------- */
  var gKey = 0;
  function keys(e) {
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (e.key === 'Escape') {
      if (SNL.ui.closeTop()) { e.preventDefault(); return; }
      closeRail(); return;
    }
    if ((e.ctrlKey || e.metaKey) && U.norm(e.key) === 'k') { e.preventDefault(); palette(); return; }
    if ((e.ctrlKey || e.metaKey) && U.norm(e.key) === 's') { e.preventDefault(); exportHere(); return; }
    if ((e.ctrlKey || e.metaKey) && U.norm(e.key) === 'p') { return; }              // let the browser print
    if (typing) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (U.norm(e.key) === 'arrowdown' || U.norm(e.key) === 'arrowup') {          // fast row stepping
      if (SNL.virtCursor(e.key === 'arrowdown' ? 1 : -1)) { e.preventDefault(); return; }
    }
    if (U.norm(e.key) === 'pageup' || U.norm(e.key) === 'pagedown') {
      var sc2 = document.getElementById('scroll'), st2 = SNL.collectionState();
      if (st2 && st2.cursorBox) { st2.cursorBox(e.key === 'pagedown' ? 12 : -12, true); e.preventDefault(); return; }
    }
    if (U.norm(e.key) === 'enter') {
      var st3 = SNL.collectionState();
      if (st3 && st3.cursorOpen) { st3.cursorOpen(); e.preventDefault(); return; }
    }
    var k = U.norm(e.key);
    if (Date.now() - gKey < 900) {
      gKey = 0;
      var hit = NAV.filter(function (n) { return !n.grp; }).filter(function (n) { return n.key === k; })[0];
      if (hit) { app.go(hit.k); e.preventDefault(); return; }
    }
    if (k === 'g') { gKey = Date.now(); SNL.ui.toast('Now press: d p s f r v u b', 'ok', 1600); return; }
    if (k === '/') { e.preventDefault(); palette(); return; }
    if (k === 'n') { e.preventDefault(); document.getElementById('btn-new').click(); return; }
    if (k === 'x') { e.preventDefault(); exportHere(); return; }
    if (k === 'p') { e.preventDefault(); printHere(); return; }
    if (k === 't') { toggleTheme(); return; }
    if (k === 'd') { toggleDensity(); return; }
    if (k === '?') { help(); return; }
    if (k === 'home' || k === 'end') {
      var sc = document.getElementById('scroll');
      sc.scrollTo({ top: k === 'home' ? 0 : sc.scrollHeight, behavior: 'smooth' });
      e.preventDefault();
    }
  }

  function help() {
    var rows = [
      ['Ctrl + K', 'command palette — jump to any record, page or action'],
      ['/', 'same as Ctrl + K'],
      ['g then d p s f r v u b', 'dashboard · lab PCs · staff · faults · store · movements · purchases · data'],
      ['n', 'new record in the open table'],
      ['x', 'Excel export of what is on screen'],
      ['p / Ctrl + P', 'print the current view on A4 (fit to one page wide)'],
      ['t', 'Paper ↔ Graphite theme'],
      ['d', 'compact ↔ comfortable rows'],
      ['↑ ↓ / Alt + ↑ ↓', 'walk the ledger rows'],
      ['Enter', 'open the highlighted record'],
      ['Home / End', 'top / bottom of the list'],
      ['Esc', 'close the dialog']
    ];
    SNL.ui.modal({
      title: 'Keyboard', sub: 'Lab Desk is built to be driven without a mouse',
      html: '<table class="ps fixed" style="width:100%"><tbody>' + rows.map(function (r) {
        return '<tr><td style="width:210px"><kbd>' + esc(r[0]) + '</kbd></td><td>' + esc(r[1]) + '</td></tr>';
      }).join('') + '</tbody></table>'
    });
  }
  /* row cursor shared with the collection page — returns true when it moved */
  SNL.virtCursor = function (d) {
    var st = SNL.collectionState();
    if (!st || !st.cursorBox) return false;
    st.cursorBox(d);
    return true;
  };

  /* ------------------------------ badge ------------------------------- */
  function liveBadge(s, cfg) {
    var el = document.getElementById('btn-live'); if (!el) return;
    var cls = s.status === 'error' ? 'err' : (cfg.mode === 'off' || !cfg.repo && !cfg.url) ? '' : 'on';
    el.innerHTML = '<span class="dot ' + cls + '"></span><em>' + esc(SNL.live.label()) + '</em>';
    el.title = 'Live JSON sync — ' + (s.msg || 'no source set') + (s.err ? ' · ' + s.err : '') + '\nOpen Data & Live to configure';
    el.style.borderColor = s.status === 'error' ? 'var(--bad)' : '';
    var chip = document.querySelector('[data-live-msg]'); if (chip) chip.textContent = s.msg || '';
  }
  app.liveBadge = liveBadge;

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', app.boot) : app.boot();
})(window);
