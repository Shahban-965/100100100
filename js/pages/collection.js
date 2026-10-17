/* ==========================================================================
   collection.js — one engine, five modules.
   Table (virtualised) · Cards · Kanban board, all driven by schema.js, so a
   new module is 20 lines of schema and zero lines of markup.
   The page exposes rows() — the *filtered, sorted* set — which is what the
   Excel export and the print sheet use, so what you see is what you print.
   ========================================================================== */
(function (w) {
  'use strict';
  var SNL = w.SNL, U = SNL.U, esc = U.esc;
  var P = SNL.pages = SNL.pages || {};

  var state = { col: 'pcs', q: '', tab: 'All', sort: null, dir: 1, mode: 'table', sel: {}, filters: {}, cursor: -1 };
  var api = null, host = null, cache = [], off = null;

  P.collection = function (mount, col, opts) {
    opts = opts || {};
    if (P.collection.destroy) P.collection.destroy();     // unsubscribe the previous page before re-rendering
    host = mount;
    var sc = SNL.SCH[col];
    if (state.col !== col) { state = { col: col, q: '', tab: 'All', sort: sc.dateField ? { key: sc.dateField, dir: -1 } : null, dir: 1, mode: opts.mode || (sc.board ? 'board' : 'table'), sel: {}, filters: {}, cursor: -1 }; }
    state.col = col;

    var view = U.el('div');
    view.innerHTML = header(sc) + '<div data-tools></div><div data-list></div>';
    host.innerHTML = ''; host.appendChild(view);
    renderTools(sc);
    renderList(sc);
    off = SNL.db.on(function (c) {
      if (c === col || c === '*' || c === 'settings' || c === 'merge' || c === 'remote' || c === 'bulk' || c === 'store') {
        if (host.isConnected) { countTabs(sc); renderList(sc); }
      }
    });
    P.collection.destroy = function () {
      if (off) { off(); off = null; }
      if (api) { api.destroy(); api = null; }
      if (SNL.quick) SNL.quick.detach();
    };
    return {
      rows: function () { return cache; },
      state: state,
      destroy: P.collection.destroy
    };
  };

  /* ------------------------------- shell ------------------------------ */
  function header(sc) {
    var n = SNL.db.count(sc.id);
    return '<div class="ph"><div><h2>' + esc(sc.title) + '</h2><div class="ph-sub">' +
      n + ' record' + (n === 1 ? '' : 's') + ' · ' + esc(SNL.db.settings().org) + '</div></div>' +
      '<span class="sp"></span><div class="ph-row">' +
      '<button class="chip" data-act="import"><span class="gi gi-upload"></span><em>Import Excel</em></button>' +
      '<button class="chip" data-act="print"><span class="gi gi-print"></span><em>Print A4</em></button>' +
      '<button class="chip" data-act="excel"><span class="gi gi-xls"></span><em>Excel</em></button>' +
      (sc.readOnly ? '' : '<button class="chip chip-solid" data-act="new"><span class="gi gi-plus"></span><em>New ' + esc(sc.one) + '</em></button>') +
      '</div></div>';
  }

  function tabsOf(sc) {
    var gf = sc.groupField;
    if (!gf) return [{ k: 'All', n: SNL.db.count(sc.id) }];
    var all = SNL.db.all(sc.id), buckets = [{ k: 'All', n: all.length }];
    var opts = gf === 'lab' ? SNL.db.labs() : U.uniq(all.map(function (r) { return r[gf]; })).filter(Boolean);
    if (gf === 'lab') opts = U.uniq(all.map(function (r) { return r.lab; }).concat(opts)).filter(Boolean);
    opts.forEach(function (o) {
      var n = all.filter(function (r) { return U.norm(r[gf]) === U.norm(o); }).length;
      buckets.push({ k: o, n: n });
    });
    return buckets;
  }

  function renderTools(sc) {
    if (!host || !host.isConnected) return;
    var bar = host.querySelector('[data-tools]');
    var fs = SNL.fields(sc.id).filter(function (fd) { return fd.type === 'select' || fd.type === 'date' || fd.key === 'lab'; });
    bar.innerHTML = '<div class="tools">' +
      '<label class="finder"><span class="gi gi-search"></span><input placeholder="Find in ' + esc(sc.title.toLowerCase()) + '…" data-q value="' + esc(state.q) + '"><button class="act" data-clear hidden><span class="gi gi-close gi-sm"></span></button></label>' +
      '<span data-tabs class="ph-row"></span>' +
      '<span class="sp"></span>' +
      (fs.length ? '<button class="chip" data-act="filter"><span class="gi gi-filter gi-sm"></span><em>Filters</em>' + (Object.keys(state.filters).length ? ' <b class="tag">' + Object.keys(state.filters).length + '</b>' : '') + '</button>' : '') +
      '<span class="mini"><span>Sort</span><select data-sort>' + sortOptions(sc) + '</select></span>' +
      '<span class="seg" role="tablist">' + modeBtns(sc) + '</span>' +
      '<button class="chip" data-act="reset" title="Clear search, filters and sort"><span class="gi gi-refresh gi-sm"></span></button>' +
      '</div><div data-bulk></div>';

    // tabs
    var tb = bar.querySelector('[data-tabs]');
    tb.innerHTML = tabsOf(sc).map(function (t) {
      return '<button class="fchip" data-tab="' + esc(t.k) + '" style="' + (t.k === state.tab ? 'background:var(--ink);color:var(--paper);border-color:var(--ink)' : '') + '">' + esc(t.k) + ' <b class="num">' + t.n + '</b></button>';
    }).join('');
    U.on(tb, 'click', '[data-tab]', function (e, b) { state.tab = b.dataset.tab; renderTools(sc); renderList(sc); });

    var qi = bar.querySelector('[data-q]');
    qi.oninput = U.debounce(function () { state.q = qi.value; state.cursor = -1; renderList(sc); bar.querySelector('[data-clear]').hidden = !state.q; }, 110);
    bar.querySelector('[data-clear]').onclick = function () { qi.value = ''; state.q = ''; renderList(sc); this.hidden = true; qi.focus(); };
    var ss = bar.querySelector('[data-sort]');
    ss.value = (state.sort ? state.sort.key : '') + '|' + (state.sort ? state.sort.dir : 1);
    ss.onchange = function () { var p = this.value.split('|'); state.sort = p[0] ? { key: p[0], dir: +p[1] } : null; renderList(sc); };
    U.on(bar, 'click', '[data-mode]', function (e, b) { state.mode = b.dataset.mode; renderTools(sc); renderList(sc); });
    U.on(bar, 'click', '[data-act="filter"]', function () { filterPop(sc); });
    U.on(bar, 'click', '[data-act="reset"]', function () {
      state.q = ''; state.filters = {}; state.tab = 'All'; state.sort = sc.dateField ? { key: sc.dateField, dir: -1 } : null; state.sel = {};
      renderTools(sc); renderList(sc);
    });
    U.on(host, 'click', '[data-act]', function (e, b) { pageAction(b.dataset.act, sc); });
  }
  function countTabs(sc) {
    var tb = host.querySelector('[data-tabs]'); if (!tb || tb.children.length !== tabsOf(sc).length) { renderTools(sc); return; }
    tabsOf(sc).forEach(function (t, i) { var el = tb.children[i]; if (el) el.querySelector('b').textContent = t.n; });
    var h = host.querySelector('.ph-sub');
    if (h) { var cn = SNL.db.count(sc.id); h.textContent = cn + ' record' + (cn === 1 ? '' : 's') + ' · ' + SNL.db.settings().org; }
  }
  function modeBtns(sc) {
    var m = [['table', 'list', 'Ledger'], ['cards', 'grid', 'Cards']];
    if (sc.board) m.push(['board', 'board', 'Board']);
    return m.map(function (x) {
      return '<button class="seg-btn" data-mode="' + x[0] + '" role="tab" aria-selected="' + (state.mode === x[0]) + '"><span class="gi gi-' + x[1] + ' gi-sm"></span>' + x[2] + '</button>';
    }).join('');
  }
  function sortOptions(sc) {
    var o = ['<option value="">(natural order)</option>'];
    SNL.cols(sc.id).concat(SNL.fields(sc.id).filter(function (f) { return f.type === 'date' || f.type === 'number'; }))
      .filter(function (fd, i, a) { return a.findIndex(function (z) { return z.key === fd.key; }) === i; })
      .forEach(function (fd) {
        [1, -1].forEach(function (d) {
          o.push('<option value="' + fd.key + '|' + d + '">' + esc(fd.label) + (d > 0 ? ' ↑' : ' ↓') + '</option>');
        });
      });
    return o.join('');
  }

  function filterPop(sc) {
    var fs = SNL.fields(sc.id).filter(function (fd) { return fd.type === 'select' || fd.key === 'lab'; });
    var wrap = U.el('div', 'form');
    wrap.innerHTML = fs.map(function (fd) {
      var os = U.uniq(SNL.db.all(sc.id).map(function (r) { return r[fd.key]; }).concat(SNL.opts(fd))).filter(Boolean);
      return '<div class="fld w6"><label>' + esc(fd.label) + '</label><select class="inp" data-k="' + fd.key + '"><option value="">Any</option>' +
        os.map(function (o) { return '<option' + (state.filters[fd.key] === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div>';
    }).join('') + '<div class="fld w6"><label>Updated in the last</label><select class="inp" data-k="__days"><option value="">Any time</option><option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option></select></div>';
    uiModal('Filters', 'Everything here also drives the Excel export and the printed page', wrap, function () {
      state.filters = {};
      U.qa('[data-k]', wrap).forEach(function (i) { if (i.value) state.filters[i.dataset.k] = i.value; });
      renderTools(sc); renderList(sc);
    }, function () { state.filters = {}; renderTools(sc); renderList(sc); });
  }
  function uiModal(title, sub, node, onOk, onClear) {
    return SNL.ui.modal({
      title: title, sub: sub, node: node,
      foot: [{ label: 'Clear all', fn: function () { onClear && onClear(); return false; } }, { label: 'Apply', kind: 'primary', primary: true, fn: function () { onOk && onOk(); } }]
    });
  }

  /* ----------------------------- row pipeline ------------------------- */
  function rows(sc) {
    var q = U.norm(state.q), gf = sc.groupField, list = SNL.db.all(sc.id);
    var fKeys = Object.keys(state.filters).filter(function (k) { return k !== '__days'; });
    var days = state.filters.__days ? +state.filters.__days : 0;
    var cutAt = days ? new Date(Date.now() - days * 86400000).toISOString() : '';
    var tab = state.tab !== 'All' ? U.norm(state.tab) : '';
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (tab && gf && U.norm(r[gf]) !== tab) continue;
      if (q && !U.hit(SNL.db.hay(sc.id, r), q)) continue;
      if (fKeys.length) {
        var ok = true;
        for (var j = 0; j < fKeys.length; j++) { var v = state.filters[fKeys[j]]; if (v && U.norm(r[fKeys[j]]) !== U.norm(v)) { ok = false; break; } }
        if (!ok) continue;
      }
      if (cutAt && String(r.updatedAt || '') < cutAt) continue;
      out.push(r);
    }
    if (state.sort) {
      var fd = SNL.field(sc.id, state.sort.key), k = state.sort.key, d = state.sort.dir || 1;
      var numeric = fd && (fd.type === 'number' || fd.type === 'money');
      out.sort(function (a, b) {
        var x = a[k], y = b[k];
        if (numeric) return (U.num(x) - U.num(y)) * d;
        x = U.str(x); y = U.str(y);
        return (x > y ? 1 : x < y ? -1 : 0) * d || (a.id > b.id ? 1 : -1);
      });
    }
    return out;
  }

  /* ------------------------------- list ------------------------------- */
  function renderList(sc) {
    if (!host || !host.isConnected) return;
    var box = host.querySelector('[data-list]');
    cache = rows(sc);
    renderBulk(sc);
    if (!cache.length) {
      box.innerHTML = '<div class="sheet-wrap">' + SNL.ui.empty(
        SNL.db.count(sc.id) ? 'Nothing matches this filter' : 'No ' + esc(sc.title.toLowerCase()) + ' yet',
        SNL.db.count(sc.id) ? 'Loosen the search or clear the tabs to see all ' + SNL.db.count(sc.id) + ' records again.' : 'Add the first record, import your Excel sheet, or load the published JSON.',
        '<div style="display:flex;gap:8px">' + (sc.readOnly ? '' : '<button class="chip chip-solid" data-act="new"><span class="gi gi-plus"></span><em>New ' + esc(sc.one) + '</em></button>') +
        '<button class="chip" data-act="import"><span class="gi gi-xls"></span><em>Import Excel</em></button></div>') + '</div>';
      SNL.quick && SNL.quick.detach();
      U.on(box, 'click', '[data-act]', function (e, b) { pageAction(b.dataset.act, sc); });
      return;
    }
    if (state.mode === 'cards') { renderCards(sc, box); return; }
    if (state.mode === 'board') { renderBoard(sc, box); return; }
    renderTable(sc, box);
  }

  /* ------- table (virtualised) ------- */
  function renderTable(sc, box) {
    var ws = SNL.widths(sc.id);
    box.innerHTML = '<div class="sheet-wrap"><div class="sheet"><div class="sheet-head" data-head>' +
      '<span class="sh sh-cb"><input type="checkbox" data-all aria-label="Select all"></span>' +
      ws.map(function (x) {
        return '<span class="sh sortable" data-key="' + x.key + '" style="flex:' + x.pct + ' 1 ' + (x.col.num ? '40px' : '70px') + '"' +
          (state.sort && state.sort.key === x.key ? ' aria-sort="' + (state.sort.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '>' +
          esc(x.col.label) + '<span class="gi gi-up"></span></span>';
      }).join('') + '<span class="sh sh-act"></span></div>' +
      '<div class="sheet-body" data-body></div></div>' +
      '<div class="sheet-foot"><span class="num">' + cache.length + '</span> of ' + SNL.db.count(sc.id) + ' rows' +
      (state.q || state.tab !== 'All' || Object.keys(state.filters).length ? ' <span class="tag">filtered</span>' : '') +
      '<span class="sp"></span><span>Drag the rail on the right · <kbd>↑</kbd><kbd>↓</kbd> to walk rows · <kbd>Enter</kbd> to open</span></div></div>';

    var body = box.querySelector('[data-body]');
    var scroll = document.getElementById('scroll');
    if (api) { api.destroy(); api = null; }
    api = SNL.virt(body, {
      scroll: scroll, data: cache, key: sc.id + '|' + cache.length + '|' + state.q + '|' + state.tab,
      render: function (i, r) { return rowEl(sc, ws, r, i); }
    });
    SNL.quick && SNL.quick.attach({ scroll: scroll, api: api, sections: sectionsOf(sc, ws) });
    SNL.quick && SNL.quick.bump(Date.now());

    /* keyboard row cursor (↑ ↓ / PageUp PageDown / Enter) */
    state.cursorBox = function (d, jump) {
      if (!cache.length) return;
      var from = state.cursor < 0 ? (d > 0 ? -1 : 0) : state.cursor;
      state.cursor = U.clamp(from + d, 0, cache.length - 1);
      api.pin(state.cursor);
      api.ensure(state.cursor, !jump);
    };
    state.cursorOpen = function () {
      if (state.cursor >= 0 && cache[state.cursor]) openRow(sc, cache[state.cursor].id);
    };

    U.on(box, 'click', '.sh.sortable', function (e, el) {
      var k = el.dataset.key;
      state.sort = state.sort && state.sort.key === k ? (state.sort.dir > 0 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 };
      renderTools(sc); renderList(sc);
    });
    var all = box.querySelector('[data-all]');
    all.checked = cache.length > 0 && cache.every(function (r) { return state.sel[r.id]; });
    all.onchange = function () {
      cache.forEach(function (r) { if (all.checked) state.sel[r.id] = 1; else delete state.sel[r.id]; });
      api.refresh(); renderBulk(sc);
    };
    U.on(box, 'click', '[data-sel]', function (e, cb) {
      var id = cb.dataset.sel;
      if (cb.checked) state.sel[id] = 1; else delete state.sel[id];
      var row = cb.closest('.row'); row && row.classList.toggle('sel', cb.checked);
      renderBulk(sc);
    });
    U.on(box, 'click', '.row', function (e, row) {
      if (e.target.closest('[data-sel],.act,.cell-cb')) return;
      openRow(sc, row.dataset.id, e.metaKey || e.ctrlKey);
    });
    U.on(box, 'click', '[data-do]', function (e, b) {
      var id = b.closest('.row').dataset.id;
      rowAction(sc, b.dataset.do, id);
    });
    box.querySelector('.sheet').style.setProperty('--cols', ws.length);
  }

  function rowEl(sc, ws, r, i) {
    var el = U.el('div', 'row cell-render' + (state.sel[r.id] ? ' sel' : ''));
    el.dataset.id = r.id; el.dataset.i = i;
    el.innerHTML = '<span class="cell cell-cb"><input type="checkbox" data-sel="' + esc(r.id) + '"' + (state.sel[r.id] ? ' checked' : '') + '></span>' +
      ws.map(function (x) {
        var fd = x.col, v = r[fd.key], cls = 'cell', txt;
        if (fd.num || fd.type === 'number' || fd.type === 'money') cls += ' numc';
        if (fd.type === 'money') txt = '<span>' + esc(U.money(v)) + '</span>';
        else if (fd.type === 'number') txt = '<span>' + esc(v === '' || v == null ? '—' : U.num(v).toLocaleString('en-US')) + '</span>';
        else if (fd.type === 'date') txt = v ? '<span>' + esc(U.shortDate(v)) + '</span>' + (isOverdue(sc, r) ? '<span class="badge t-bad" style="padding:0 6px">late</span>' : '') : '<span class="muted">—</span>';
        else if (fd.type === 'select' && fd.tone) txt = v ? SNL.ui.badge(v) : '<span class="muted">—</span>';
        else if (fd.type === 'pw') txt = v ? '<span class="tag" data-pw="' + esc(v) + '" title="Click to reveal">••••</span>' : '<span class="muted">—</span>';
        else if (fd.type === 'select') txt = v ? '<span class="tag">' + esc(v) + '</span>' : '<span class="muted">—</span>';
        else if (fd.type === 'area') txt = '<span title="' + esc(v) + '">' + esc(U.dash(U.cut(v, 52))) + '</span>';
        else txt = v ? '<span>' + esc(v) + '</span>' : '<span class="muted">—</span>';
        if (fd.key === sc.dateField && !v) txt = '<span class="muted">—</span>';
        return '<span class="' + cls + '" style="flex:' + x.pct + ' 1 ' + (fd.num ? '40px' : '70px') + '" data-k="' + fd.key + '">' + txt + '</span>';
      }).join('') +
      '<span class="cell cell-act">' +
      (sc.readOnly ? '' : '<button class="act" data-do="edit" title="Edit"><span class="gi gi-edit gi-sm"></span></button>') +
      '<button class="act" data-do="view" title="Open"><span class="gi gi-chev gi-sm"></span></button>' +
      (sc.id === 'pcs' ? '<button class="act" data-do="fault" title="Report a fault"><span class="gi gi-wrench gi-sm"></span></button>' : '') +
      (sc.id === 'store' ? '<button class="act" data-do="move" title="Stock in / out"><span class="gi gi-swap gi-sm"></span></button>' : '') +
      (sc.id === 'purchases' ? '<button class="act" data-do="store" title="Add accessories to store"><span class="gi gi-box gi-sm"></span></button>' : '') +
      (sc.id === 'faults' && r.status !== 'Resolved' ? '<button class="act" data-do="resolve" title="Mark resolved"><span class="gi gi-check gi-sm"></span></button>' : '') +
      (sc.readOnly ? '' : '<button class="act del" data-do="del" title="Delete"><span class="gi gi-trash gi-sm"></span></button>') +
      '</span>';
    el.querySelector('.cell-act').onclick = function (e) { e.stopPropagation(); };
    U.on(el, 'click', '[data-pw]', function (e, b) { b.textContent = b.textContent === '••••' ? b.dataset.pw : '••••'; e.stopPropagation(); });
    return el;
  }
  function isOverdue(sc, r) {
    if (sc.id !== 'faults' || r.status === 'Resolved' || r.status === 'Cancelled') return false;
    return U.daysBetween(r.complaintDate, new Date()) > 3;
  }

  function sectionsOf(sc, ws) {
    var gf = sc.groupField || sc.statusField; if (!gf) return [];
    var seen = {}, out = [];
    cache.forEach(function (r, i) {
      var k = r[gf] || '—';
      if (!seen[k]) { seen[k] = 1; out.push({ label: k, i: i, n: 0 }); }
      out[out.length - 1].n++;
    });
    return out.slice(0, 6);
  }

  /* ------- cards ------- */
  function renderCards(sc, box) {
    box.innerHTML = '<div class="tools"><span class="eyebrow">' + cache.length + ' cards</span><span class="sp"></span>' +
      '<span class="mini">Order<select data-ord><option value="">default</option>' + (sc.groupField ? '<option value="' + sc.groupField + '">' + esc(sc.groupField) + '</option>' : '') + '<option value="id">id</option></select></span></div>' +
      '<div class="cards" data-cards></div>';
    var grid = box.querySelector('[data-cards]');
    var paint = function () {
      var ord = box.querySelector('[data-ord]').value, list = cache.slice();
      if (ord) list.sort(U.by(ord));
      grid.innerHTML = '';
      var frag = document.createDocumentFragment();
      list.forEach(function (r, i) { frag.appendChild(cardEl(sc, r, i)); });
      grid.appendChild(frag);
    };
    box.querySelector('[data-ord]').onchange = paint;
    paint();
    U.on(grid, 'click', '[data-card]', function (e, c) {
      if (e.target.closest('[data-do],input')) return;
      openRow(sc, c.dataset.card);
    });
    U.on(grid, 'click', '[data-do]', function (e, b) { e.stopPropagation(); rowAction(sc, b.dataset.do, b.closest('[data-card]').dataset.card); });
    U.on(grid, 'click', '[data-sel]', function (e, cb) { e.stopPropagation(); var id = cb.closest('[data-card]').dataset.card; if (cb.checked) state.sel[id] = 1; else delete state.sel[id]; cb.closest('.pc').classList.toggle('sel', cb.checked); renderBulk(sc); });
    SNL.quick && SNL.quick.detach();
  }
  function cardEl(sc, r, i) {
    var fs = SNL.cols(sc.id).filter(function (fd) { return !['id', sc.statusField, sc.groupField].includes(fd.key); }).slice(0, 4);
    var el = U.el('article', 'pc rise' + (state.sel[r.id] ? ' sel' : ''));
    el.dataset.card = r.id;
    el.style.animationDelay = Math.min(i, 14) * 12 + 'ms';
    el.innerHTML = '<div class="pc-h"><div style="min-width:0"><div class="pc-id">' + esc(r.id) + '</div><h4>' + esc(U.cut(SNL.labelOf(sc.id, r), 46)) + '</h4></div>' +
      '<span class="sp"></span><input type="checkbox" data-sel style="margin-top:3px"' + (state.sel[r.id] ? ' checked' : '') + '></div>' +
      (r[sc.groupField] ? '<div><span class="tag">' + esc(r[sc.groupField]) + '</span></div>' : '') +
      '<dl class="pc-spec">' + fs.map(function (fd) {
        var v = r[fd.key];
        if (v === '' || v == null) return '';
        return '<dt>' + esc(fd.label) + '</dt><dd title="' + esc(v) + '">' + esc(U.cut(v, 30)) + '</dd>';
      }).join('') + '</dl>' +
      '<div class="pc-f">' + (r[sc.statusField] ? SNL.ui.badge(r[sc.statusField]) : '') +
      '<span class="sp"></span>' +
      (sc.readOnly ? '' : '<button class="act" data-do="edit" title="Edit"><span class="gi gi-edit gi-sm"></span></button>') +
      '<button class="act" data-do="view" title="Open"><span class="gi gi-chev gi-sm"></span></button>' +
      (sc.id === 'store' ? '<button class="act" data-do="move" title="Stock in / out"><span class="gi gi-swap gi-sm"></span></button>' : '') +
      (sc.readOnly ? '' : '<button class="act del" data-do="del" title="Delete"><span class="gi gi-trash gi-sm"></span></button>') +
      '</div>';
    return el;
  }

  /* ------- kanban ------- */
  function renderBoard(sc, box) {
    var cols = (sc.board || SNL.opts(SNL.field(sc.id, sc.statusField)) || []).map(function (s) {
      return { label: s, rows: cache.filter(function (r) { return (r[sc.statusField] || sc.board0 || 'Pending') === s; }) };
    });
    if (!cols.length) { renderTable(sc, box); return; }
    box.innerHTML = '<div class="board" data-board>' + cols.map(function (c) {
      return '<section class="col" data-col="' + esc(c.label) + '"><header class="col-h">' + SNL.ui.badge(c.label) + '<span class="n">' + c.rows.length + '</span></header>' +
        '<div class="col-b">' + c.rows.map(function (r) { return ticEl(sc, r).outerHTML; }).join('') + (c.rows.length ? '' : '<p style="font-size:12px;color:var(--ink-4);padding:8px 2px;text-align:center">drop here</p>') + '</div></section>';
    }).join('') + '</div>';
    var board = box.querySelector('[data-board]');
    SNL.quick && SNL.quick.detach();
    // native drag & drop — no library
    U.qa('.tic', board).forEach(function (t) {
      t.draggable = true;
      t.addEventListener('dragstart', function (e) {
        if (e.dataTransfer) { e.dataTransfer.setData('text/plain', t.dataset.tic); e.dataTransfer.effectAllowed = 'move'; }
        w.__dragTic = t.dataset.tic; t.classList.add('drag');
      });
      t.addEventListener('dragend', function () { t.classList.remove('drag'); w.__dragTic = ''; });
    });
    U.qa('.col', board).forEach(function (c) {
      c.addEventListener('dragover', function (e) { e.preventDefault(); c.classList.add('over'); });
      c.addEventListener('dragleave', function () { c.classList.remove('over'); });
      c.addEventListener('drop', function (e) {
        e.preventDefault(); c.classList.remove('over');
        var id = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || w.__dragTic || (board.querySelector('.tic.drag') || {}).dataset && board.querySelector('.tic.drag').dataset.tic, st = c.dataset.col;
        var r = SNL.db.get(sc.id, id); if (!r || r[sc.statusField] === st) return;
        SNL.db.save(sc.id, Object.assign({}, r, mkPatch(sc, st)));
        SNL.ui.toast(id + ' → ' + st, 'ok');
      });
    });
    U.on(board, 'click', '.tic', function (e, t) { if (!e.target.closest('[data-do]')) openRow(sc, t.dataset.tic); });
    U.on(board, 'click', '[data-do]', function (e, b) { e.stopPropagation(); rowAction(sc, b.dataset.do, b.closest('.tic').dataset.tic); });
  }
  function ticEl(sc, r) {
    var el = U.el('div', 'tic'); el.dataset.tic = r.id;
    el.innerHTML = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span class="gi gi-drag gi-sm" style="color:var(--ink-4)"></span>' +
      '<b class="num" style="font-size:10.5px;color:var(--ink-3)">' + esc(r.id) + '</b><span class="sp" style="flex:1 1 auto"></span>' +
      (sc.readOnly ? '' : '<button class="act" data-do="edit"><span class="gi gi-edit gi-sm"></span></button>') + '</div>' +
      '<h5>' + esc(U.cut(r[sc.required[0]] || SNL.labelOf(sc.id, r), 74)) + '</h5>' +
      '<div class="tic-meta">' + (sc.groupField && r[sc.groupField] ? '<span>' + esc(r[sc.groupField]) + '</span>' : '') +
      (sc.dateField && r[sc.dateField] ? '<span>' + esc(U.shortDate(r[sc.dateField])) + '</span>' : '') +
      (r.category ? '<span class="tag">' + esc(r.category) + '</span>' : '') +
      (isOverdue(sc, r) ? '<span class="badge t-bad" style="padding:0 6px">late</span>' : '') +
      (r.technician ? '<span>· ' + esc(r.technician) + '</span>' : '') + '</div>';
    return el;
  }
  function mkPatch(sc, st) {
    var o = {}; o[sc.statusField] = st;
    if (sc.id === 'faults' && st === 'Resolved') o.repairDate = U.today();
    return o;
  }

  /* ------------------------------ bulk ------------------------------- */
  function renderBulk(sc) {
    var ids = Object.keys(state.sel).filter(function (k) { return state.sel[k]; });
    var bar = host.querySelector('[data-bulk]'); if (!bar) return;
    if (!ids.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = '<div class="bulk-bar"><b>' + ids.length + '</b> selected<span class="sp"></span>' +
      (sc.statusField ? '<span class="mini">Set status<select data-bulk-st>' + (SNL.SCH[sc.id].board || SNL.opts(SNL.field(sc.id, sc.statusField)) || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select><button class="chip" data-bulk="status"><em>Apply</em></button></span>' : '') +
      (sc.id === 'store' ? '<button class="chip" data-bulk="stockin"><span class="gi gi-download gi-sm"></span><em>Stock in</em></button>' : '') +
      '<button class="chip" data-bulk="xls"><span class="gi gi-xls gi-sm"></span><em>Excel (selected)</em></button>' +
      '<button class="chip" data-bulk="print"><span class="gi gi-print gi-sm"></span><em>Print (selected)</em></button>' +
      (sc.readOnly ? '' : '<button class="chip btn-danger" data-bulk="del"><span class="gi gi-trash gi-sm"></span><em>Delete</em></button>') +
      '<button class="chip" data-bulk="none"><em>Clear</em></button></div>';
    U.on(bar, 'click', '[data-bulk]', function (e, b) {
      var act = b.dataset.bulk;
      if (act === 'none') { state.sel = {}; renderBulk(sc); api && api.refresh(); return; }
      if (act === 'status') {
        var st = bar.querySelector('[data-bulk-st]').value;
        ids.forEach(function (id) { SNL.db.save(sc.id, Object.assign({}, SNL.db.get(sc.id, id), mkPatch(sc, st)), { silentLog: true }); });
        SNL.db.log(sc.id, 'Bulk status', ids.length + ' records', 'Status → ' + st);
        SNL.ui.toast(ids.length + ' record(s) set to ' + st, 'ok'); state.sel = {}; renderList(sc); return;
      }
      if (act === 'stockin') {
        ids.forEach(function (id) { try { SNL.db.stockMove(id, 'Stock In', 1, { reason: 'Bulk receive' }); } catch (e2) { } });
        SNL.ui.toast('Stocked in 1 × ' + ids.length, 'ok'); state.sel = {}; renderList(sc); return;
      }
      if (act === 'xls') { SNL.xls.exportCol(sc.id, SNL.db.all(sc.id).filter(function (r) { return state.sel[r.id]; }), {}); return; }
      if (act === 'print') { SNL.xls.printCol(sc.id, SNL.db.all(sc.id).filter(function (r) { return state.sel[r.id]; }), {}); return; }
      if (act === 'del') {
        SNL.ui.confirm({ title: 'Delete ' + ids.length + ' ' + esc(sc.title.toLowerCase()) + '?', kind: 'danger', ok: 'Delete ' + ids.length }).then(function (yes) {
          if (!yes) return;
          SNL.db.remove(sc.id, ids); state.sel = {}; renderTools(sc); renderList(sc);
          SNL.ui.toast(ids.length + ' record(s) deleted', 'ok');
        });
      }
    });
  }

  /* ----------------------------- actions ------------------------------ */
  function openRow(sc, id, direct) {
    if (direct) return editRow(sc, id);
    SNL.ui.viewer(sc.id, id, [
      { label: 'Edit', icon: 'edit', kind: 'primary', fn: function () { editRow(sc, id); } },
      sc.id === 'pcs' ? { label: 'Report fault', icon: 'wrench', fn: function () { faultFrom(sc, id); } } : null,
      sc.id === 'store' ? { label: 'Stock in / out', icon: 'swap', fn: function () { stockPop(sc, id); } } : null,
      sc.id === 'purchases' ? { label: 'Add to store', icon: 'box', fn: function () { toStore(sc, id); } } : null,
      sc.id === 'faults' ? { label: 'Use spare part', icon: 'cart', fn: function () { usePart(sc, id); } } : null,
      { label: 'Duplicate', icon: 'copy', fn: function () { dupRow(sc, id); } },
      sc.readOnly ? null : { label: 'Delete', icon: 'trash', kind: 'danger', fn: function () { delRow(sc, id); } }
    ].filter(Boolean));
  }
  function editRow(sc, id) {
    var rec = id ? SNL.db.get(sc.id, id) : null;
    if (sc.readOnly) { SNL.ui.toast('The activity log is read-only', 'err'); return; }
    var form = SNL.ui.form(sc.id, rec || {});
    SNL.ui.modal({
      title: (rec ? 'Edit ' : 'New ') + sc.one, sub: rec ? rec.id + ' · ' + (SNL.labelOf(sc.id, rec)) : sc.title + ' · ' + SNL.db.settings().org,
      node: form, wide: 1,
      foot: [
        { label: 'Cancel' },
        { label: rec ? 'Save changes' : 'Create record', kind: 'primary', primary: true, keep: true, fn: function (close) {
            if (!form.validate()) return false;
            var v = form.values();
            if (!rec) v.id = '';
            var saved = SNL.db.save(sc.id, Object.assign({}, rec || {}, v));
            SNL.ui.toast(saved.id + ' saved', 'ok');
            close();
            renderTools(sc); renderList(sc);
          } }
      ],
      onOpen: function (m) {
        m.el.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { m.el.querySelector('.modal-f .chip-solid').click(); } });
      }
    });
  }
  function dupRow(sc, id) {
    var r = Object.assign({}, SNL.db.get(sc.id, id)); delete r.id; r.updatedAt = null;
    r[sc.required[0] || 'remarks'] = (r[sc.required[0] || 'remarks'] || '') + ' (copy)';
    var s = SNL.db.save(sc.id, r);
    SNL.ui.toast('Duplicated as ' + s.id, 'ok'); renderTools(sc); renderList(sc);
  }
  function delRow(sc, id) {
    SNL.ui.confirm({ title: 'Delete ' + id + '?', msg: SNL.labelOf(sc.id, SNL.db.get(sc.id, id)) + ' will be removed. ' + id }).then(function (y) {
      if (!y) return;
      SNL.db.remove(sc.id, [id]); delete state.sel[id]; renderTools(sc); renderList(sc); SNL.ui.toast(id + ' deleted', 'ok');
    });
  }
  function faultFrom(sc, id) {
    var r = SNL.db.get('pcs', id);
    var rec = { pcName: r.pcName, pcId: r.id, lab: r.lab, status: 'Pending', complaintDate: U.today() };
    editRecord('faults', null, rec, 'Report fault · ' + r.pcName);
  }
  function editRecord(col, id, rec, title) {
    var sc = SNL.SCH[col], form = SNL.ui.form(col, rec || SNL.db.get(col, id) || {});
    SNL.ui.modal({
      title: title || ('New ' + sc.one), sub: sc.title, node: form,
      foot: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', primary: true, fn: function () {
          if (!form.validate()) throw 0;
          var v = form.values(); var saved = SNL.db.save(col, Object.assign({ id: id || '' }, v));
          SNL.ui.toast(saved.id + ' created', 'ok');
          if (SNL.app) SNL.app.go(col);
        } }]
    });
  }
  function usePart(sc, id) {
    var f = SNL.db.get('faults', id);
    var opts = SNL.db.all('store').map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.itemName) + ' · ' + SNL.db.storeStatus(s) + ' (' + U.num(s.quantity) + ')</option>'; }).join('');
    var wrap = U.el('div', 'form');
    wrap.innerHTML = '<div class="fld w6"><label>Spare part</label><select class="inp" data-k="itemId"><option value="">— none —</option>' + opts + '</select></div>' +
      '<div class="fld w6"><label>Quantity</label><input class="inp inp-num" type="number" data-k="quantity" value="1" min="1"></div>' +
      '<div class="fld w12"><label>Reason / remarks</label><input class="inp" data-k="reason" value="' + esc(U.cut(f.newPart || f.problem || '', 60)) + '"></div>';
    SNL.ui.modal({
      title: 'Issue a spare part', sub: f.id + ' · ' + U.cut(f.problem, 40), node: wrap,
      foot: [{ label: 'Cancel' }, { label: 'Take from store', kind: 'primary', primary: true, fn: function () {
          var itemId = wrap.querySelector('[data-k="itemId"]').value, qty = +wrap.querySelector('[data-k="quantity"]').value || 1;
          if (!itemId) { SNL.db.save('faults', Object.assign({}, f, { quantity: qty })); SNL.ui.toast('Part noted (no store item chosen)', 'ok'); return; }
          var it = SNL.db.get('store', itemId);
          try {
            var res = SNL.db.stockMove(itemId, 'Stock Out', qty, { reason: 'Fault repair ' + f.id, maintenanceId: f.id, date: U.today() });
            SNL.db.save('faults', Object.assign({}, f, { newPart: f.newPart || it.itemName, newPartItemId: itemId, quantity: qty, stockTxId: res.tx.id }), { silentLog: true });
            SNL.ui.toast(qty + ' × ' + it.itemName + ' issued · ' + res.item.quantity + ' left', 'ok');
            renderTools(sc); renderList(sc);
          } catch (e) { SNL.ui.toast(e.message, 'err'); throw e; }
        } }]
    });
  }
  function stockPop(sc, id) {
    var it = SNL.db.get('store', id);
    var wrap = U.el('div', 'form');
    wrap.innerHTML = '<div class="fld w6"><label>Movement</label><select class="inp" data-k="t"><option>Stock In</option><option>Stock Out</option><option>Adjustment</option><option>Return</option></select></div>' +
      '<div class="fld w6"><label>Quantity</label><input class="inp inp-num" type="number" data-k="q" value="1" min="0"></div>' +
      '<div class="fld w6"><label>Date</label><input class="inp mono" type="date" data-k="d" value="' + U.today() + '"></div>' +
      '<div class="fld w6"><label>Reason</label><input class="inp" data-k="r" placeholder="e.g. issued to Lab 2"></div>' +
      '<div class="fld w12"><span class="fld-hint">On hand now <b class="num">' + U.num(it.quantity) + ' ' + esc(it.unit || 'pcs') + '</b> · min <b class="num">' + U.num(it.minStock) + '</b>. New / Faulty / Hold items keep their manual status.</span></div>';
    SNL.ui.modal({
      title: 'Stock movement', sub: it.itemName, node: wrap,
      foot: [{ label: 'Cancel' }, { label: 'Post movement', kind: 'primary', primary: true, fn: function () {
          try {
            var res = SNL.db.stockMove(id, wrap.querySelector('[data-k="t"]').value, wrap.querySelector('[data-k="q"]').value, {
              date: wrap.querySelector('[data-k="d"]').value, reason: wrap.querySelector('[data-k="r"]').value
            });
            SNL.ui.toast(res.tx.id + ' posted · ' + res.item.quantity + ' ' + (res.item.unit || 'pcs') + ' on hand', 'ok');
            renderTools(sc); renderList(sc);
          } catch (e) { SNL.ui.toast(e.message, 'err'); throw e; }
        } }]
    });
  }
  function toStore(sc, id) {
    var p = SNL.db.get('purchases', id);
    var acc = [['keyboard', 'Keyboard'], ['mouse', 'Mouse'], ['lcd', 'LCD'], ['ethernetConnector', 'Ethernet Connector'], ['powerCable', 'Power Cable'], ['vgaCable', 'VGA Cable']]
      .filter(function (k) { return U.num(p[k[0]]) > 0; });
    if (!acc.length) { SNL.ui.toast('No accessory quantities on this purchase to add', 'err'); return; }
    SNL.ui.confirm({
      title: 'Add accessories to the store', kind: 'primary', ok: 'Add ' + acc.length + ' item(s)',
      html: 'This will create/refresh ' + acc.length + ' store item(s) and post a <b>Stock In</b> movement each:<br>' +
        acc.map(function (k) { return '• ' + esc(k[1]) + ' × ' + U.num(p[k[0]]); }).join('<br>')
    }).then(function (y) {
      if (!y) return;
      var made = [];
      acc.forEach(function (k) {
        var name = k[1] + (p.processor ? '' : ''), it = SNL.db.findStore(name);
        if (!it) it = SNL.db.save('store', { itemName: name, category: catOf(k[1]), quantity: 0, unit: 'Piece', minStock: 2, condition: 'New', purchaseDate: p.purchaseDate, remarks: 'From purchase ' + p.id }, { silentLog: true });
        var res = SNL.db.stockMove(it.id, 'Stock In', U.num(p[k[0]]), { reason: 'Purchase ' + p.id, purchaseId: p.id, date: p.purchaseDate || U.today() });
        made.push(k[1] + ' → ' + res.item.quantity);
      });
      SNL.db.save('purchases', Object.assign({}, p, { addedToStore: true, storeItemId: made.length ? 'bulk' : '' }), { silentLog: true });
      SNL.ui.toast('Store updated · ' + made.join(', '), 'ok', 5000);
      renderTools(sc); renderList(sc);
    });
  }
  function catOf(n) { return /lcd/i.test(n) ? 'LCD' : /keyboard/i.test(n) ? 'Keyboard' : /mouse/i.test(n) ? 'Mouse' : /ethernet/i.test(n) ? 'Ethernet' : /power/i.test(n) ? 'Cable' : /vga/i.test(n) ? 'Cable' : 'Accessories'; }

  function rowAction(sc, act, id) {
    if (act === 'edit') return editRow(sc, id);
    if (act === 'view') return openRow(sc, id);
    if (act === 'del') return delRow(sc, id);
    if (act === 'fault') return faultFrom(sc, id);
    if (act === 'move') return stockPop(sc, id);
    if (act === 'store') return toStore(sc, id);
    if (act === 'resolve') {
      var f = SNL.db.get('faults', id);
      SNL.db.save('faults', Object.assign({}, f, { status: 'Resolved', repairDate: f.repairDate || U.today() }));
      SNL.ui.toast(id + ' resolved', 'ok'); renderList(sc);
    }
  }

  function pageAction(act, sc) {
    if (act === 'new') return editRow(sc, null);
    if (act === 'excel') { SNL.xls.exportCol(sc.id, cache, {}); SNL.ui.toast(cache.length + ' filtered row(s) exported', 'ok'); return; }
    if (act === 'print') { var n = SNL.xls.printCol(sc.id, cache, {}); SNL.ui.toast('Printing ' + n + ' rows, one A4 page wide', 'ok'); return; }
    if (act === 'import') return importPop(sc);
  }

  /* ------------------------- Excel import (per page) ------------------ */
  function importPop(sc) {
    var box = U.el('div');
    box.innerHTML = '<div class="note"><b>How import works.</b> Lab Desk reads header words (PC Name, Serial No, Status…), so it finds your columns even when they move. ' +
      'One sheet can hold several blocks side by side — <b>Lab 1 | Lab 2 | Lab 3</b> from the Aptech workbook are read as three blocks.</div>' +
      '<div style="display:flex;gap:8px;margin:14px 0;flex-wrap:wrap;align-items:center">' +
      '<button class="chip chip-solid" data-pick><span class="gi gi-upload gi-sm"></span><em>Choose .xlsx / .xls / .csv</em></button>' +
      '<button class="chip" data-tpl><span class="gi gi-download gi-sm"></span><em>Download template</em></button>' +
      '<span data-st style="font-size:12.5px;color:var(--ink-3)"></span></div>' +
      '<div data-prev></div>';
    var m = SNL.ui.modal({ title: 'Import into ' + sc.title, sub: sc.sheet, node: box, wide: 1 });
    var prev = box.querySelector('[data-prev]'), st = box.querySelector('[data-st]'), rowsx = [];
    box.querySelector('[data-tpl]').onclick = function () { SNL.xls.template(sc.id); };
    box.querySelector('[data-pick]').onclick = function () {
      U.pick('.xlsx,.xls,.csv').then(function (f) {
        st.textContent = 'Reading ' + f.name + '…';
        return SNL.xls.readFile(f, sc.id).then(function (res) {
          rowsx = res.rows;
          st.textContent = f.name + ' · ' + res.sheets.length + ' sheet(s) · ' + rowsx.length + ' row(s) recognised';
          if (!rowsx.length) { prev.innerHTML = '<p class="note">Nothing readable was found. The sheet needs a header row containing at least two of: ' + sc.fields.slice(0, 6).map(function (fd) { return esc(fd.label); }).join(', ') + '.</p>'; return; }
          var byId = {};
          rowsx.forEach(function (r) {
            r.__mode = r.id && SNL.db.get(sc.id, r.id) ? 'update' : 'new';
            var key = dupKey(sc, r), dupe = key && SNL.db.all(sc.id).some(function (x) { return dupKey(sc, x) === key && x.id !== r.id; });
            r.__dupe = dupe; r.__key = key;
            if (r.id) byId[r.id] = (byId[r.id] || 0) + 1;
          });
          var rep = Object.keys(byId).filter(function (k) { return byId[k] > 1; });
          prev.innerHTML = previewTable(sc, rowsx, rep);
          U.on(prev, 'change', '[data-mode]', function (e, s2) { s2.closest('tr').dataset.mode = s2.value; });
        }).catch(function (e) { st.textContent = ''; SNL.ui.toast('Import failed · ' + e.message, 'err'); });
      }).catch(function () { });
    };
    var foot = U.el('div', 'modal-f');
    foot.innerHTML = '<span class="sp"></span><button class="chip" data-x2><em>Cancel</em></button><button class="chip chip-solid" data-go disabled><span class="gi gi-check gi-sm"></span><em>Import</em></button>';
    m.body.parentNode.appendChild(foot);
    foot.querySelector('[data-x2]').onclick = m.close;
    foot.querySelector('[data-go]').onclick = function () {
      var ins = [], upd = [];
      U.qa('tr[data-id]', prev).forEach(function (tr) {
        var r = rowsx[+tr.dataset.i], mode = tr.querySelector('[data-mode]') ? tr.querySelector('[data-mode]').value : r.__mode;
        if (mode === 'skip') return;
        if (mode === 'new') { var c = Object.assign({}, r); delete c.id; ins.push(c); }
        else upd.push(r);
      });
      var res = SNL.db.bulk(sc.id, ins, upd);
      SNL.db.log(sc.id, 'Imported', '', rowsx.length + ' row(s) read · ' + res.added + ' new, ' + res.updated + ' updated');
      SNL.ui.toast('Imported ' + res.added + ' new, ' + res.updated + ' updated', 'ok');
      m.close(); renderTools(sc); renderList(sc);
    };
    function previewTable(sc, list, repeats) {
      var cs = SNL.cols(sc.id).slice(0, 6);
      return (repeats.length ? '<p class="note" style="margin-bottom:10px"><b>' + repeats.length + ' repeated id(s) in this file</b> — they are merged into one record each.</p>' : '') +
        '<div style="max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:var(--r-m)"><table class="ps fixed" style="width:100%"><thead><tr><th style="position:sticky;top:0;background:var(--card)">#</th>' +
        cs.map(function (fd) { return '<th>' + esc(fd.label) + '</th>'; }).join('') + '<th>Found</th><th>Action</th></tr></thead><tbody>' +
        list.map(function (r, i) {
          var badge = r.__dupe ? '<span class="badge t-warn"><span class="bd"></span>similar exists</span>' : (r.id ? '<span class="badge t-info"><span class="bd"></span>known id</span>' : '');
          return '<tr data-id="' + esc(r.id || 'new-' + i) + '" data-i="' + i + '"><td class="numc">' + (i + 1) + '</td>' +
            cs.map(function (fd) { var v = r[fd.key]; if (fd.type === 'date') v = v ? U.shortDate(v) : ''; return '<td>' + esc(U.cut(v == null ? '' : String(v), 26)) + '</td>'; }).join('') +
            '<td>' + badge + '</td><td><select data-mode><option value="' + (r.id ? 'update' : 'new') + '"' + (r.id ? '' : ' selected') + '>' + (r.id ? 'update existing' : 'add as new') + '</option>' +
            '<option value="new">add as new</option><option value="skip">skip</option></select></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function dupKey(sc, r) {
      var dk = sc.dup && sc.dup[0]; if (!dk) return '';
      return dk.split('+').map(function (k) { return U.norm(r[k]); }).join('|');
    }
  }

  /** open the "new record" form for any module (used by the dashboard + palette) */
  P.newRecord = function (col) {
    var sc = SNL.SCH[col];
    if (sc.readOnly) { SNL.ui.toast('That table is read-only', 'err'); return; }
    if (state.col !== col) { SNL.app && SNL.app.go(col); state.col = col; }
    editRow(sc, null);
  };
  SNL.collectionState = function () { return state; };
  SNL.collectionRefresh = function () { var sc = SNL.SCH[state.col]; if (host && host.isConnected) { renderTools(sc); renderList(sc); } };
})(window);
