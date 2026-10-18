/* ═══════════════════════════════════════════════════
   LabDesk — Views (dashboard · inventory · tickets ·
   data manager · settings)
   ═══════════════════════════════════════════════════ */
'use strict';

const BABIES = [
  { src: 'assets/img/baby-1.jpg', cap: 'Joy — first laugh' },
  { src: 'assets/img/baby-2.jpg', cap: 'Nap time' },
  { src: 'assets/img/baby-3.jpg', cap: 'Big stretch' },
  { src: 'assets/img/baby-4.jpg', cap: 'Curious eyes' },
];

const LOCS = ['Lab A', 'Lab B', 'Lab C', 'Store Room', 'Office', 'Server Room'];
const REC_STATUS = ['Active', 'In Use', 'In Repair', 'Fault', 'Retired'];
const TKT_STATUS = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITY = ['Low', 'Medium', 'High', 'Critical'];

const Pages = {
  _timers: [],

  /* ─────────────── DASHBOARD ─────────────── */
  dashboard: {
    title: 'Dashboard', sub: 'Everything at a glance',
    mount(view) {
      const s = DB.stats();
      const name = DB.state.meta.name || 'Shakeel';
      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

      view.innerHTML = `
      <section class="hero" data-anchor="Overview">
        <div>
          <h2>${greet}, ${esc(name)}</h2>
          <p>${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Lab is ${s.openT ? 'busy — ' + s.openT + ' open ticket(s)' : 'running smooth'}</p>
        </div>
        <div class="hero-clock">
          <b id="clock">--:--:--</b><span>PKT · live</span>
        </div>
      </section>

      <div class="quick-row">
        <button class="quick" data-go="inventory" data-act="new">${I.plus}<span>New item<small>Add to inventory</small></span></button>
        <button class="quick" data-go="tickets" data-act="new">${I.ticket}<span>New ticket<small>Report a fault</small></span></button>
        <button class="quick" data-act="export-json">${I.db}<span>Backup JSON<small>Download database</small></span></button>
        <button class="quick" data-act="print">${I.csv}<span>Print report<small>Full-page A4</small></span></button>
      </div>

      <div class="stat-grid" data-anchor="Statistics">
        <div class="stat"><small>Inventory items</small><div class="num">${s.total}</div><div class="sub">across ${DB.state.categories.length} categories</div></div>
        <div class="stat"><small>Active / in use</small><div class="num">${s.active}</div><div class="sub">${s.total ? Math.round(s.active / s.total * 100) : 0}% of fleet healthy</div></div>
        <div class="stat"><small>In repair</small><div class="num">${s.repair}</div><div class="sub">technician queue</div></div>
        <div class="stat"><small>Faulty</small><div class="num">${s.fault}</div><div class="sub">needs attention</div></div>
        <div class="stat"><small>Open tickets</small><div class="num">${s.openT}</div><div class="sub">${s.tickets} total ever</div></div>
        <div class="stat"><small>Stock value</small><div class="num">${fmtMoney(s.value)}</div><div class="sub">estimated replacement</div></div>
      </div>

      <div class="dash-grid">
        <div class="panel" data-anchor="Inventory mix">
          <div class="panel-head"><h3>Inventory mix</h3><span class="chip">by category</span></div>
          <div class="panel-body"><div class="catbars" id="catBars"></div></div>
        </div>
        <div class="panel" data-anchor="Moments">
          <div class="panel-head"><h3>Cute moments</h3><span class="chip">baby wall</span></div>
          <div class="panel-body">
            <div class="moments">
              ${BABIES.map((b, i) => `<figure class="moment" data-lb="${i}"><img src="${b.src}" alt="${esc(b.cap)}" loading="lazy"><figcaption>${esc(b.cap)}</figcaption></figure>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="dash-grid" style="margin-top:14px">
        <div class="panel" data-anchor="Activity">
          <div class="panel-head"><h3>Recent activity</h3><button class="chip" data-go="data">Open data manager</button></div>
          <div class="panel-body"><div class="feed" id="actFeed"></div></div>
        </div>
        <div class="panel" data-anchor="Open tickets">
          <div class="panel-head"><h3>Open tickets</h3><button class="chip" data-go="tickets">Fault desk</button></div>
          <div class="panel-body"><div class="feed" id="tktFeed"></div></div>
        </div>
      </div>`;

      /* live clock */
      const tick = () => {
        const el = $('#clock', view);
        if (el) el.textContent = new Date().toLocaleTimeString('en-GB');
      };
      tick();
      const iv = setInterval(tick, 1000);
      Pages._timers.push(iv);

      /* category bars */
      const byCat = {};
      DB.all('records').forEach(r => byCat[r.category] = (byCat[r.category] || 0) + r.qty);
      const max = Math.max(1, ...Object.values(byCat));
      $('#catBars', view).innerHTML = Object.entries(byCat).sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `<div class="catbar"><span>${esc(c)}</span><div class="track"><div class="fill" data-w="${Math.round(n / max * 100)}"></div></div><span class="val">${n}</span></div>`).join('');
      requestAnimationFrame(() => $$('.fill', view).forEach(f => f.style.width = f.dataset.w + '%'));

      /* activity feed */
      const feed = $('#actFeed', view);
      feed.innerHTML = DB.state.activity.slice(0, 7).map(a =>
        `<div class="feed-item"><span class="fi">${esc(a.icon)}</span><p>${a.text}</p><time>${timeAgo(a.t)}</time></div>`).join('')
        || '<div class="feed-item"><p>No activity yet.</p></div>';

      /* open tickets feed */
      const tf = $('#tktFeed', view);
      const open = DB.all('tickets').filter(t => t.status === 'Open' || t.status === 'In Progress').slice(0, 6);
      tf.innerHTML = open.map(t =>
        `<div class="feed-item"><span class="fi">${esc(t.priority[0])}</span><p><b>${esc(t.id)}</b> — ${esc(t.issue)} <i style="color:var(--ink-3)">(${esc(t.system)})</i></p><span class="st s-${slug(t.priority)}" data-label="${esc(t.priority)}">${esc(t.priority)}</span></div>`).join('')
        || '<div class="feed-item"><p>No open tickets. All systems healthy.</p></div>';

      /* gallery lightbox */
      $$('.moment', view).forEach(m => m.addEventListener('click', () => {
        const b = BABIES[+m.dataset.lb];
        openModal({
          title: b.cap,
          body: `<img src="${b.src}" alt="${esc(b.cap)}" style="width:100%;border-radius:14px;filter:grayscale(1) contrast(1.05)">`,
          actions: [{ label: 'Close', kind: 'btn-ink' }],
        });
      }));

      /* quick actions */
      $$('[data-go]', view).forEach(b => b.addEventListener('click', () => {
        const act = b.dataset.act;
        App.go(b.dataset.go);
        if (act === 'new') setTimeout(() => App.currentGrid?.openForm(), 80);
      }));
      $$('[data-act]', view).forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'export-json') App.exportJSON();
        if (a === 'print') App.printCurrent();
      }));
    },
  },

  /* ─────────────── INVENTORY ─────────────── */
  inventory: {
    title: 'Inventory', sub: 'Excel-grade lab asset ledger',
    mount(view) {
      view.innerHTML = `<div class="sheet-holder"></div>`;
      App.currentGrid = new ExcelGrid($('.sheet-holder', view), {
        name: 'Inventory',
        store: 'records',
        prefix: 'L',
        exportName: 'labdesk-inventory',
        columns: [
          { key: 'id', title: 'ID', w: '86px', readonly: true },
          { key: 'name', title: 'Item', w: 'minmax(190px,1.6fr)', required: true },
          { key: 'category', title: 'Category', w: '130px', type: 'select', options: DB.state.categories },
          { key: 'brand', title: 'Brand', w: '110px' },
          { key: 'qty', title: 'Qty', w: '70px', type: 'number' },
          { key: 'price', title: 'Price', w: '110px', type: 'money' },
          { key: 'status', title: 'Status', w: '120px', type: 'select', options: REC_STATUS, chip: true },
          { key: 'location', title: 'Location', w: '120px', type: 'select', options: LOCS },
          { key: 'assignedTo', title: 'Assigned to', w: '150px' },
          { key: 'purchased', title: 'Purchased', w: '120px', type: 'date' },
          { key: 'warranty', title: 'Warranty', w: '100px' },
          { key: 'notes', title: 'Notes', w: 'minmax(160px,1fr)', type: 'textarea', m: 'hide' },
        ],
        rows: () => DB.all('records'),
        onSave(rec, isNew) { isNew ? DB.insert('records', rec) : DB.update('records', rec.id, rec); App.refresh(); },
        onDelete(id) { DB.remove('records', id); App.refresh(); },
        onDeleteMany(ids) { DB.removeMany('records', ids); App.refresh(); },
      });
    },
  },

  /* ─────────────── FAULT DESK ─────────────── */
  tickets: {
    title: 'Fault Desk', sub: 'Tickets, repairs & follow-ups',
    mount(view) {
      view.innerHTML = `<div class="sheet-holder"></div>`;
      App.currentGrid = new ExcelGrid($('.sheet-holder', view), {
        name: 'Tickets',
        store: 'tickets',
        prefix: 'T',
        exportName: 'labdesk-tickets',
        columns: [
          { key: 'id', title: 'Ticket', w: '82px', readonly: true },
          { key: 'system', title: 'System', w: 'minmax(170px,1.4fr)', required: true },
          { key: 'issue', title: 'Issue', w: 'minmax(170px,1.4fr)', required: true },
          { key: 'reportedBy', title: 'Reported by', w: '140px' },
          { key: 'priority', title: 'Priority', w: '110px', type: 'select', options: PRIORITY, chip: true },
          { key: 'status', title: 'Status', w: '125px', type: 'select', options: TKT_STATUS, chip: true },
          { key: 'opened', title: 'Opened', w: '115px', type: 'date' },
          { key: 'due', title: 'Due', w: '115px', type: 'date' },
          { key: 'assigned', title: 'Assigned', w: '140px' },
          { key: 'notes', title: 'Notes', w: 'minmax(150px,1fr)', type: 'textarea', m: 'hide' },
        ],
        rows: () => DB.all('tickets'),
        onSave(rec, isNew) { isNew ? DB.insert('tickets', rec) : DB.update('tickets', rec.id, rec); App.refresh(); },
        onDelete(id) { DB.remove('tickets', id); App.refresh(); },
        onDeleteMany(ids) { DB.removeMany('tickets', ids); App.refresh(); },
      });
    },
  },

  /* ─────────────── DATA MANAGER ─────────────── */
  data: {
    title: 'Data Manager', sub: 'JSON database — backup, restore, reset',
    mount(view) {
      const s = DB.stats();
      const kb = DB.storageKB();
      view.innerHTML = `
      <div class="db-cards">
        <div class="db-card"><small>Records</small><div class="big">${s.total}</div></div>
        <div class="db-card"><small>Tickets</small><div class="big">${s.tickets}</div></div>
        <div class="db-card"><small>Activity entries</small><div class="big">${DB.state.activity.length}</div></div>
        <div class="db-card"><small>Local storage used</small><div class="big">${kb} KB</div>
          <div class="storage-bar"><i style="width:${Math.min(100, kb / 512 * 100)}%"></i></div></div>
      </div>

      <div class="panel" style="margin-bottom:14px">
        <div class="panel-head"><h3>Backup & restore</h3><span class="chip">auto-saves every edit</span></div>
        <div class="panel-body">
          <div class="db-actions">
            <button class="btn" id="expJson">${I.db}<span>Download JSON backup</span></button>
            <button class="btn" id="impJson">${I.plus}<span>Import JSON backup</span></button>
            <button class="btn" id="expCsvAll">${I.csv}<span>Export inventory CSV</span></button>
            <button class="btn" id="resetDb">${I.trash}<span>Reset to seed data</span></button>
          </div>
          <input type="file" id="impFile" accept="application/json" hidden>
          <p style="margin-top:14px;font-size:12.5px;color:var(--ink-3)">
            The database lives in <b style="color:var(--ink)">data/db.json</b> on first load, then persists to your
            browser's local storage. Export a backup before switching devices.
          </p>
        </div>
      </div>

      <div class="panel" data-anchor="Activity log">
        <div class="panel-head"><h3>Full activity log</h3><span class="chip">${DB.state.activity.length} entries</span></div>
        <div class="panel-body">
          <div class="feed">
            ${DB.state.activity.map(a => `
              <div class="feed-item"><span class="fi">${esc(a.icon)}</span>
              <p>${a.text} <i style="color:var(--ink-3)">— ${esc(a.by)}</i></p>
              <time>${timeAgo(a.t)}</time></div>`).join('')
            || '<div class="feed-item"><p>No activity yet.</p></div>'}
          </div>
        </div>
      </div>`;

      $('#expJson', view).onclick = () => App.exportJSON();
      $('#expCsvAll', view).onclick = () => {
        const cols = ['id', 'name', 'brand', 'category', 'qty', 'price', 'status', 'location', 'assignedTo', 'purchased', 'warranty', 'notes'];
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [cols.map(q).join(',')].concat(DB.all('records').map(r => cols.map(c => q(r[c])).join(',')));
        download('labdesk-inventory-full.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
        toast('Full inventory CSV exported');
      };
      $('#impJson', view).onclick = () => $('#impFile', view).click();
      $('#impFile', view).addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try { DB.importJSON(rd.result); toast('Database imported'); App.refresh(); }
          catch (err) { toast('Import failed: ' + err.message, 'err'); }
        };
        rd.readAsText(f);
      });
      $('#resetDb', view).onclick = () =>
        confirmBox('Reset database', 'Restore the original factory seed? <b>All your edits will be lost.</b>', () => {
          DB.reset(); toast('Database reset'); App.refresh();
        }, 'Reset');
    },
  },

  /* ─────────────── SETTINGS ─────────────── */
  settings: {
    title: 'Settings', sub: 'Passcode, appearance & account',
    mount(view) {
      const st = JSON.parse(localStorage.getItem('snpl.settings.v1') || '{}');
      view.innerHTML = `
      <div class="panel" data-anchor="Security" style="margin-bottom:14px">
        <div class="panel-head"><h3>Security</h3></div>
        <div class="panel-body">
          <form id="pinForm" class="form-grid">
            <label class="fld"><span>Current passcode</span><input type="password" name="old" inputmode="numeric" required></label>
            <label class="fld"><span>New passcode (6–24 digits)</span><input type="password" name="nu" inputmode="numeric" pattern="\\d{6,24}" required></label>
            <label class="fld full"><span>Confirm new passcode</span><input type="password" name="nu2" inputmode="numeric" required></label>
          </form>
          <button class="btn btn-ink" id="savePin">Update passcode</button>
        </div>
      </div>

      <div class="panel" data-anchor="Appearance" style="margin-bottom:14px">
        <div class="panel-head"><h3>Appearance</h3></div>
        <div class="panel-body">
          <div class="set-row"><div class="lab"><b>Theme</b><span>Paper (white) or Graphite (black)</span></div>
            <div class="seg" id="segTheme">
              <button data-v="paper">Paper</button><button data-v="graphite">Graphite</button>
            </div></div>
          <div class="set-row"><div class="lab"><b>Row density</b><span>Comfortable or compact grid rows</span></div>
            <div class="seg" id="segDensity">
              <button data-v="comfortable">Comfortable</button><button data-v="compact">Compact</button>
            </div></div>
          <div class="set-row"><div class="lab"><b>Your display name</b><span>Shown on the dashboard</span></div>
            <div style="display:flex;gap:9px"><input id="dispName" type="text" value="${esc(st.name || 'Shakeel')}" style="padding:9px 13px;border-radius:10px;border:1px solid var(--line-2);background:var(--fill)">
            <button class="btn btn-sm btn-ink" id="saveName">Save</button></div></div>
        </div>
      </div>

      <div class="panel" data-anchor="About">
        <div class="panel-head"><h3>About LabDesk</h3></div>
        <div class="panel-body" style="font-size:13.5px;color:var(--ink-2);display:grid;gap:8px">
          <p><b style="color:var(--ink)">LabDesk</b> — Shakeel New Project Lab · v1.0</p>
          <p>A fast, offline-first lab ledger in pure black &amp; white. Excel-grade grids with virtual
          scrolling, a JSON database that saves every edit instantly, live cross-tab sync,
          full-page A4 printing, and a passcode gate.</p>
          <p style="font-family:var(--mono);font-size:11.5px">Default passcode: 45637189230 · Shortcuts: / search · N new · P print · T theme · L lock · J/K glide</p>
        </div>
      </div>`;

      /* theme + density segments */
      const seg = (id, key, apply) => {
        const box = $(id, view);
        const mark = () => $$('button', box).forEach(b => b.classList.toggle('on', b.dataset.v === apply()));
        mark();
        $$('button', box).forEach(b => b.addEventListener('click', () => {
          const s2 = JSON.parse(localStorage.getItem('snpl.settings.v1') || '{}');
          s2[key] = b.dataset.v;
          localStorage.setItem('snpl.settings.v1', JSON.stringify(s2));
          App.applySettings();
          mark();
          toast(`${key[0].toUpperCase() + key.slice(1)} updated`);
        }));
      };
      seg('#segTheme', 'theme', () => document.documentElement.dataset.theme);
      seg('#segDensity', 'density', () => document.documentElement.dataset.density);

      $('#saveName', view).onclick = () => {
        const s2 = JSON.parse(localStorage.getItem('snpl.settings.v1') || '{}');
        s2.name = $('#dispName', view).value.trim() || 'Shakeel';
        localStorage.setItem('snpl.settings.v1', JSON.stringify(s2));
        toast('Display name saved');
      };

      $('#savePin', view).onclick = async () => {
        const f = $('#pinForm', view);
        const old = f.old.value, nu = f.nu.value, nu2 = f.nu2.value;
        if (nu !== nu2) { toast('New passcodes do not match', 'err'); return; }
        const r = await Auth.changePin(old, nu);
        if (!r.ok) { toast(r.error, 'err'); return; }
        f.reset();
        toast('Passcode updated — use it next time');
      };
    },
  },
};
