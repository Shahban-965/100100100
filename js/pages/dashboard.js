/* ==========================================================================
   dashboard.js — the morning page: fleet health, faults, store and money.
   Every number is computed once per data change (SNL.stats.overview) and the
   cards are plain DOM strings — no chart library, no reflow storm.
   ========================================================================== */
(function (w) {
  'use strict';
  var SNL = w.SNL, U = SNL.U, esc = U.esc;
  var P = SNL.pages = SNL.pages || {};
  var ui = null, off = null, clock = null;

  /* --------------------------- the number engine ---------------------- */
  SNL.stats = {
    overview: function () {
      var db = SNL.db, pcs = db.all('pcs'), faults = db.all('faults'), store = db.all('store'), pur = db.all('purchases'), staff = db.all('staff');
      var o = {
        pcs: pcs.length, staff: staff.length,
        working: 0, pending: 0, faulty: 0, hold: 0, retired: 0,
        open: 0, inprog: 0, resolved: 0, late: 0, resolvedMonth: 0,
        health: 0, low: [], out: [], value: 0, spendMonth: 0,
        byLab: {}, byCat: {}, byStoreCat: {}, months: [], recent: [], alerts: []
      };
      var today = U.today(), month = today.slice(0, 7);
      pcs.concat(staff).forEach(function (r) {
        var s = U.norm(r.status);
        if (s === 'working') o.working++; else if (s === 'pending') o.pending++; else if (s === 'faulty') o.faulty++; else if (s === 'hold') o.hold++; else if (s === 'retired') o.retired++;
      });
      var fleet = pcs.length + staff.length;
      o.health = fleet ? Math.round((o.working / fleet) * 100) : 100;
      faults.forEach(function (f) {
        var s = U.norm(f.status);
        if (s === 'resolved') { o.resolved++; if (U.monthKey(f.repairDate || f.complaintDate) === month) o.resolvedMonth++; }
        else if (s === 'in progress') o.inprog++;
        else if (s === 'cancelled') return;
        else o.open++;
        if (s !== 'resolved' && s !== 'cancelled' && U.daysBetween(f.complaintDate, new Date()) > 3) o.late++;
        o.byCat[f.category || 'Other'] = (o.byCat[f.category || 'Other'] || 0) + 1;
      });
      pcs.forEach(function (r) {
        var k = r.lab || 'Unassigned';
        var b = o.byLab[k] || (o.byLab[k] = { total: 0, ok: 0, bad: 0, open: 0 });
        b.total++;
        if (U.norm(r.status) === 'working') b.ok++; else b.bad++;
      });
      faults.filter(function (f) { return U.norm(f.status) !== 'resolved' && U.norm(f.status) !== 'cancelled'; })
        .forEach(function (f) { var k = f.lab || 'Unassigned'; var b = o.byLab[k] || (o.byLab[k] = { total: 0, ok: 0, bad: 0, open: 0 }); b.open = (b.open || 0) + 1; });
      store.forEach(function (s) {
        o.byStoreCat[s.category || 'Other'] = (o.byStoreCat[s.category || 'Other'] || 0) + U.num(s.quantity);
        var st = db.storeStatus(s);
        if (st === 'Out of Stock') o.out.push(s); else if (st === 'Low Stock') o.low.push(s);
      });
      pur.forEach(function (p) {
        var v = U.num(p.unitPrice) * U.num(p.quantity);
        o.value += v;
        if (U.monthKey(p.purchaseDate) === month) o.spendMonth += v;
      });
      // 6-month trend
      var d = new Date();
      for (var i = 5; i >= 0; i--) {
        var m = new Date(d.getFullYear(), d.getMonth() - i, 1);
        var key = m.getFullYear() + '-' + U.pad(m.getMonth() + 1);
        var list = faults.filter(function (f) { return U.monthKey(f.complaintDate) === key; });
        o.months.push({ key: key, label: U.MSHORT[m.getMonth()], total: list.length, done: list.filter(function (f) { return U.norm(f.status) === 'resolved'; }).length });
      }
      o.recent = db.all('logs').slice(0, 8);
      o.alerts = [];
      pcs.filter(function (r) { return /faulty|hold/.test(U.norm(r.status)); }).slice(0, 6).forEach(function (r) {
        o.alerts.push({ tone: 'bad', ic: 'monitor', txt: r.pcName + ' — ' + r.status + (r.remarks ? ' · ' + U.cut(r.remarks, 40) : ''), go: 'pcs', id: r.id });
      });
      faults.filter(function (f) { return U.norm(f.status) !== 'resolved' && U.norm(f.status) !== 'cancelled' && U.daysBetween(f.complaintDate, new Date()) > 3; })
        .slice(0, 6).forEach(function (f) {
          o.alerts.push({ tone: 'warn', ic: 'wrench', txt: f.id + ' waiting ' + U.daysBetween(f.complaintDate, new Date()) + ' days · ' + U.cut(f.problem, 44), go: 'faults', id: f.id });
        });
      o.out.slice(0, 5).forEach(function (s) { o.alerts.push({ tone: 'bad', ic: 'box', txt: s.itemName + ' is out of stock', go: 'store', id: s.id }); });
      return o;
    }
  };

  /* ------------------------------ the page ----------------------------- */
  P.dashboard = function (mount) {
    ui = SNL.ui;
    if (off) off();
    hostRender(mount);
    off = SNL.db.on(function (c) { if (mount.isConnected && c !== 'logs') render(mount); if (mount.isConnected && c === 'logs') { var f = mount.querySelector('[data-feed]'); if (f) f.innerHTML = feed(SNL.stats.overview()); } });
    clock && clearInterval(clock);
    clock = setInterval(function () { var e = mount.querySelector('[data-clock]'); if (e) e.innerHTML = clockHtml(); else { clearInterval(clock); clock = null; } }, 1000);
    return { rows: function () { return []; }, destroy: function () { off(); off = null; clearInterval(clock); clock = null; } };
  };

  function hostRender(mount) {
    mount.innerHTML = '<div class="ph"><div><h2>Lab Dashboard</h2><div class="ph-sub" data-clock></div></div>' +
      '<span class="sp"></span><div class="ph-row">' +
      '<button class="chip" data-d="fault"><span class="gi gi-wrench"></span><em>Log a fault</em></button>' +
      '<button class="chip" data-d="new"><span class="gi gi-plus"></span><em>Add system</em></button>' +
      '<button class="chip" data-d="print"><span class="gi gi-print"></span><em>Print summary</em></button>' +
      '<button class="chip chip-solid" data-d="xls"><span class="gi gi-xls"></span><em>Full workbook</em></button>' +
      '</div></div><div data-body></div>';
    U.on(mount, 'click', '[data-d]', function (e, b) {
      var a = b.dataset.d;
      if (a === 'xls') { SNL.xls.workbook({}); return; }
      if (a === 'print') { P.dashboardSummary(true); return; }
      if (a === 'fault' || a === 'new') {
        var col = a === 'fault' ? 'faults' : 'pcs';
        if (SNL.pages.newRecord) SNL.pages.newRecord(col);
        return;
      }
    });
    render(mount);
  }
  function clockHtml() {
    var d = new Date();
    return esc(d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) +
      ' · <b class="num">' + esc(U.time(d, true)) + '</b> · rev ' + (SNL.db.meta.rev || 0) + (SNL.live && SNL.live.state().pending ? ' · ' + SNL.live.state().pending + ' waiting' : '');
  }

  function render(mount) {
    var o = SNL.stats.overview(), body = mount.querySelector('[data-body]');
    var set = SNL.db.settings();
    var sync = SNL.live.state(), live = SNL.live.cfg();
    var todos = SNL.db.kv('todos') || defaultTodos();
    body.innerHTML =
      // KPI row
      '<div class="grid-kpi">' +
      kpi('Systems in service', o.working + '<small>/' + (o.pcs + o.staff) + '</small>', (o.faulty + o.hold) + ' need attention', (o.pcs + o.staff) - o.working === 0 ? 'ok' : 'warn', 'monitor', 'pcs') +
      kpi('Open tickets', o.open + o.inprog, o.late ? o.late + ' older than 3 days' : 'nothing waiting', o.late ? 'bad' : 'ok', 'wrench', 'faults') +
      kpi('Fix rate this month', o.resolvedMonth, 'of ' + (o.resolvedMonth + o.open) + ' raised', 'ok', 'check', 'faults') +
      kpi('Store alerts', o.out.length + o.low.length, o.out.length ? o.out.length + ' out of stock' : 'all above minimum', o.out.length || o.low.length ? 'warn' : 'ok', 'box', 'store') +
      kpi('Purchase value', U.kbn(o.value), 'this month ' + U.money(o.spendMonth), 'mute', 'cart', 'purchases') +
      '</div>' +

      '<div class="split">' +
      // left column
      '<div class="stack">' +
      card('Fleet health', 'ring',
        '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' + ui.ring(o.health, { label: o.working + ' of ' + (o.pcs + o.staff) + ' working' }) +
        '<div style="flex:1 1 220px">' + ui.bars([
          { label: 'Working', value: o.working, color: 'var(--ok)' }, { label: 'Pending', value: o.pending, color: 'var(--warn)' },
          { label: 'Faulty', value: o.faulty, color: 'var(--bad)' }, { label: 'On hold', value: o.hold, color: 'var(--ink-4)' },
          { label: 'Retired', value: o.retired, color: 'var(--line)' }
        ]) + '</div></div>') +
      card('Lab load', 'open tickets per area',
        ui.bars(Object.keys(o.byLab).map(function (k) {
          var b = o.byLab[k];
          return { label: k + ' · ' + b.ok + '/' + b.total + ' ok', value: b.open || 0, color: b.open ? 'var(--clay)' : 'var(--ink-4)', text: (b.open || 0) + ' open' };
        }), { clay: true })) +
      card('Fault trend · last 6 months', 'raised vs fixed',
        ui.trend(o.months) + '<div class="legend" style="margin-top:10px"><span><i style="background:var(--ink)"></i>raised</span><span><i style="background:var(--clay)"></i>fixed</span>' +
        '<span style="margin-left:auto">peak ' + Math.max.apply(null, o.months.map(function (m) { return m.total; }).concat([0])) + ' in a month</span></div>') +
      card('Top fault types', 'all time', ui.bars(U.top(o.byCat, 7).map(function (x) { return { label: x[0], value: x[1], color: 'var(--ink)' }; }))) +
      '</div>' +

      // right column
      '<div class="stack">' +
      card('Needs you now', o.alerts.length + ' item(s)',
        (o.alerts.length ? '<div class="list-lite">' + o.alerts.map(function (a) {
          return '<div class="li" data-open="' + esc(a.go) + ':' + esc(a.id) + '" style="cursor:pointer"><span class="li-ic" style="color:var(--' + (a.tone === 'bad' ? 'bad' : 'warn') + ')"><span class="gi gi-' + a.ic + ' gi-sm"></span></span>' +
            '<span class="sp"><span class="nm">' + esc(a.txt) + '</span></span><span class="gi gi-chev gi-sm" style="color:var(--ink-4)"></span></div>';
        }).join('') + '</div>' : '<p style="font-size:13px;color:var(--ink-3)">Nothing urgent. The lab is clean.</p>') +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="chip" data-store-move><span class="gi gi-swap gi-sm"></span><em>Stock movement</em></button>' +
        '<button class="chip" data-goto="reports"><span class="gi gi-grid gi-sm"></span><em>Reports</em></button></div>') +
      card('Store at a glance', 'quantity by category',
        ui.donut(Object.keys(o.byStoreCat).slice(0, 6).map(function (k, i) {
          return { label: k, value: o.byStoreCat[k], color: ['var(--ink)', 'var(--clay)', 'var(--info)', 'var(--ok)', 'var(--warn)', 'var(--ink-4)'][i % 6] };
        })) +
        (o.low.length || o.out.length ? '<div class="rule" style="margin:12px 0"></div><div class="bars">' + o.out.concat(o.low).slice(0, 6).map(function (s) {
          return '<div class="bar-row"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.itemName) + '</span>' +
            '<span class="bt"><i style="width:' + U.clamp(Math.round(U.num(s.quantity) / Math.max(1, U.num(s.minStock) * 2) * 100), 3, 100) + '%;background:' + (U.num(s.quantity) <= 0 ? 'var(--bad)' : 'var(--warn)') + '"></i></span>' +
            '<span class="v">' + U.num(s.quantity) + '</span></div>';
        }).join('') + '</div>' : '')) +
      card('Today', set.org,
        '<div data-todos>' + todos.map(function (t, i) {
          return '<div class="check-row' + (t.done ? ' done' : '') + '"><input type="checkbox" data-todo="' + i + '"' + (t.done ? ' checked' : '') + '><span style="flex:1 1 auto">' + esc(t.txt) + '</span>' +
            '<button class="act" data-todo-del="' + i + '"><span class="gi gi-close gi-sm"></span></button></div>';
        }).join('') + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:10px"><input class="inp" placeholder="Add a checklist item…" data-todo-new><button class="chip" data-todo-add><em>Add</em></button></div>') +
      card('Live data', 'JSON sync · ' + (live.mode === 'github' ? 'read + write' : live.mode === 'url' ? 'read only' : 'off'),
        '<div class="kv"><dt>Status</dt><dd><span class="badge t-' + (sync.status === 'error' ? 'bad' : SNL.live.enabled() || SNL.live.readOnly() ? 'ok' : 'mute') + '"><span class="bd"></span>' + esc(SNL.live.label()) + '</span></dd>' +
        '<dt>Source</dt><dd>' + esc(live.mode === 'github' ? (live.repo || '—') + ' @ ' + (live.branch || 'main') : live.mode === 'url' ? (live.url || '—') : 'this browser') + '</dd>' +
        '<dt>Rows</dt><dd>' + SNL.db.COLS.reduce(function (n, c) { return n + SNL.db.count(c); }, 0) + ' in ' + SNL.db.COLS.length + ' tables · rev ' + (SNL.db.meta.rev || 0) + '</dd>' +
        '<dt>Last push</dt><dd>' + (sync.lastPush ? esc(U.age(sync.lastPush)) : 'never') + '</dd>' +
        '<dt>Last pull</dt><dd>' + (sync.lastPull ? esc(U.age(sync.lastPull)) : 'never') + '</dd></div>' +
        (sync.err ? '<p class="note" style="margin-top:10px"><b>Sync said:</b> ' + esc(sync.err) + '</p>' : '') +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="chip" data-sync="pull"><span class="gi gi-download gi-sm"></span><em>Pull now</em></button>' +
        '<button class="chip" data-sync="push"><span class="gi gi-upload gi-sm"></span><em>Push now</em></button>' +
        '<button class="chip" data-goto="data"><span class="gi gi-gear gi-sm"></span><em>Setup</em></button></div>') +
      card('Recent activity', 'last 8 changes', '<div class="list-lite" data-feed>' + feed(o) + '</div>') +
      '</div></div>';

    wire(body, todos, mount);
  }

  function feed(o) {
    return o.recent.length ? o.recent.map(function (l) {
      var t = SNL.tone(l.action);
      return '<div class="li"><span class="li-ic"><span class="gi gi-' + (l.action === 'Deleted' ? 'trash' : l.action === 'Created' ? 'plus' : l.action === 'Imported' ? 'upload' : 'edit') + ' gi-sm"></span></span>' +
        '<span class="sp"><span class="nm">' + esc(l.module) + ' · ' + esc(l.description || l.action) + '</span></span>' +
        '<span class="t">' + esc(l.recordId || U.time(l.at)) + '</span></div>';
    }).join('') : '<p style="font-size:13px;color:var(--ink-3)">No changes yet — the log fills up as you edit.</p>';
  }
  function kpi(label, value, foot, tone, ic, go) {
    return '<button class="kpi" data-goto="' + go + '" style="text-align:left;cursor:pointer">' +
      '<div style="display:flex;align-items:center;gap:8px"><span class="gi gi-' + ic + '" style="color:var(--ink-3)"></span><span class="lbl">' + esc(label) + '</span></div>' +
      '<div class="val">' + value + '</div><div class="foot">' + esc(foot) + '</div></button>';
  }
  function card(title, sub, html) {
    return '<section class="card rise"><header class="card-h"><h3>' + esc(title) + '</h3><span style="font-size:11.5px;color:var(--ink-3)">' + esc(sub || '') + '</span></header>' +
      '<div class="card-b">' + html + '</div></section>';
  }
  function defaultTodos() {
    return [
      { txt: 'Walk round: check every lab PC is booting', done: false },
      { txt: 'Update the fault board after each repair', done: false },
      { txt: 'Count LCD + keyboard stock against the sheet', done: false },
      { txt: 'Push the JSON so the other laptop is up to date', done: false }
    ];
  }

  function wire(body, todos, mount) {
    U.on(body, 'click', '[data-goto]', function (e, b) { SNL.app.go(b.dataset.goto); });
    U.on(body, 'click', '[data-open]', function (e, b) {
      var p = b.dataset.open.split(':');
      SNL.app.go(p[0]);
      setTimeout(function () { SNL.ui.viewer(p[0], p[1]); }, 120);
    });
    U.on(body, 'click', '[data-sync]', function (e, b) {
      var f = b.dataset.sync === 'push' ? SNL.live.push() : SNL.live.pull();
      b.disabled = true;
      f.then(function () { SNL.ui.toast('Sync ok', 'ok'); }).catch(function () { }).then(function () { b.disabled = false; });
    });
    U.on(body, 'click', '[data-store-move]', function () { SNL.app.go('tx'); });
    U.on(body, 'change', '[data-todo]', function (e, i) {
      todos[+i.dataset.todo].done = i.checked; SNL.db.kv('todos', todos);
    });
    U.on(body, 'click', '[data-todo-del]', function (e, b) { todos.splice(+b.dataset.todoDel, 1); SNL.db.kv('todos', todos); render(mount); });
    var addTodo = function () {
      var i = body.querySelector('[data-todo-new]');
      if (U.str(i.value)) { todos.push({ txt: U.str(i.value), done: false }); SNL.db.kv('todos', todos); render(mount); }
    };
    U.on(body, 'click', '[data-todo-add]', addTodo);
    U.on(body, 'keydown', '[data-todo-new]', function (e) { if (e.key === 'Enter') addTodo(); });
  }

  /* --------------------- the printable summary sheets ------------------ */
  function summarySheets() {
    var o = SNL.stats.overview(), set = SNL.db.settings();
    var kpiRow = [
      { label: 'SYSTEMS OK', value: o.working + '/' + (o.pcs + o.staff) }, { label: 'HEALTH', value: o.health + '%' },
      { label: 'OPEN FAULTS', value: o.open + o.inprog }, { label: 'LATE', value: o.late },
      { label: 'STORE ALERTS', value: o.out.length + o.low.length }, { label: 'ASSET VALUE', value: U.money(o.value) }
    ];
    var sheet = {
      name: 'Dashboard Summary', title: set.org + ' — LAB SUMMARY', meta: 'Generated ' + U.stamp(new Date()) + '  ·  Lab Desk (Shakeel New Project Lab)',
      kpis: kpiRow, note: 'A4 landscape · one page wide · header row repeats on every printed page',
      cols: [{ label: 'AREA', w: 16, kind: 's' }, { label: 'SYSTEMS', w: 10, kind: 'n' }, { label: 'WORKING', w: 10, kind: 'n' },
      { label: 'NEEDS ACTION', w: 12, kind: 'n' }, { label: 'OPEN TICKETS', w: 12, kind: 'n' }],
      rows: Object.keys(o.byLab).map(function (k) { var b = o.byLab[k]; return [k, b.total, b.ok, b.bad, b.open || 0]; }),
      totals: ['TOTAL', o.pcs + o.staff, o.working, o.faulty + o.hold + o.pending, o.open + o.inprog]
    };
    var faultSheet = SNL.xls.sheetFor('faults', SNL.db.all('faults').filter(function (f) { return U.norm(f.status) !== 'resolved'; }).slice(0, 60), {
      name: 'Open Faults', title: set.org + ' — OPEN FAULT LIST', meta: o.open + ' pending · ' + o.inprog + ' in progress · printed ' + U.date(new Date())
    });
    var storeSheet = SNL.xls.sheetFor('store', SNL.db.all('store'), { name: 'Store Stock', title: set.org + ' — STORE STOCK POSITION', meta: o.out.length + ' out of stock · ' + o.low.length + ' below minimum' });
    return [sheet, faultSheet, storeSheet].filter(function (s) { return s.rows.length || s === sheet; });
  }
  P.dashboardSummary = function (printIt) {
    var sh = summarySheets();
    if (printIt) SNL.xls.print(sh); else SNL.xls.book(sh, 'LabDesk_Summary_' + U.today() + '.xlsx');
  };
})(window);
