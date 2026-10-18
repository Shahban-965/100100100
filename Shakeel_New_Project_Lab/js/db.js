/* ═══════════════════════════════════════════════════
   LabDesk — JSON database engine
   data/db.json (seed) → localStorage (live persistence)
   ═══════════════════════════════════════════════════ */
'use strict';

const DB = (() => {
  const LS_KEY = 'snpl.db.v1';
  const SEED_VERSION = 1;
  const listeners = new Set();

  const seed = () => {
    if (window.SEED_DATA) return JSON.parse(JSON.stringify(window.SEED_DATA));
    return {
      meta: { app: 'LabDesk', org: 'Shakeel New Project Lab', version: 1, created: new Date().toISOString().slice(0, 10) },
      categories: [], records: [], tickets: [], activity: [],
    };
  };

  const blank = () => ({ meta: { app: 'LabDesk', org: 'Shakeel New Project Lab', version: 1 }, categories: [], records: [], tickets: [], activity: [] });

  const Store = {
    state: null,
    ready: false,
    source: '—',

    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(kind, payload) { listeners.forEach(f => { try { f(kind, payload); } catch (e) { console.error('[db]', e); } }); },

    async load() {
      // 1) try the saved working copy first (fast, offline-first)
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { /* corrupt → reseed */ }

      if (saved && saved.meta && saved.meta.v === SEED_VERSION && Array.isArray(saved.records)) {
        this.state = saved;
        this.source = 'local';
        this.ready = true;
        // refresh the seed file in the background (silent)
        return this.state;
      }

      // 2) otherwise fetch the JSON seed database
      let fresh = null;
      try {
        const r = await fetch('data/db.json', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (j && Array.isArray(j.records)) fresh = j;
        }
      } catch (e) { /* file:// or offline */ }

      this.state = fresh || seed();
      this.state.meta = Object.assign({ app: 'LabDesk', version: 1 }, this.state.meta, { v: SEED_VERSION });
      if (!Array.isArray(this.state.tickets)) this.state.tickets = [];
      if (!Array.isArray(this.state.activity)) this.state.activity = [];
      if (!Array.isArray(this.state.categories)) this.state.categories = [];
      this.source = fresh ? 'json' : 'embedded';
      this.persist();
      this.ready = true;
      return this.state;
    },

    /* persistence — debounced write, immediate flush available */
    _saveTimer: null,
    save() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.persist(), 220);
      this.emit('change', { silent: true });
    },
    persist() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); }
      catch (e) { console.warn('[db] persist failed', e); }
    },

    /* ── collection helpers ── */
    all(kind) { return this.state[kind] || []; },
    byId(kind, id) { return this.all(kind).find(r => r.id === id); },
    nextId(kind, prefix) {
      let max = 0;
      this.all(kind).forEach(r => {
        const m = /(\d+)\s*$/.exec(r.id || '');
        if (m) max = Math.max(max, +m[1]);
      });
      return prefix + '-' + (max + 1);
    },

    insert(kind, obj, actor = 'You') {
      obj.id = obj.id || this.nextId(kind, kind === 'tickets' ? 'T' : 'L');
      obj._ts = new Date().toISOString();
      this.state[kind].unshift(obj);
      this.log('＋', `Added <b>${esc(obj.name || obj.id)}</b> to ${kind === 'tickets' ? 'fault desk' : 'inventory'}`, actor);
      this.save();
      return obj;
    },
    update(kind, id, patch, actor = 'You') {
      const i = this.all(kind).findIndex(r => r.id === id);
      if (i < 0) return null;
      this.state[kind][i] = Object.assign({}, this.state[kind][i], patch, { _ts: new Date().toISOString() });
      this.log('✎', `Updated <b>${esc(patch.name || id)}</b>`, actor);
      this.save();
      return this.state[kind][i];
    },
    remove(kind, id, actor = 'You') {
      const rec = this.byId(kind, id);
      this.state[kind] = this.all(kind).filter(r => r.id !== id);
      if (rec) this.log('✕', `Removed <b>${esc(rec.name || id)}</b>`, actor);
      this.save();
      return !!rec;
    },
    removeMany(kind, ids, actor = 'You') {
      const set = new Set(ids);
      const before = this.all(kind).length;
      this.state[kind] = this.all(kind).filter(r => !set.has(r.id));
      this.log('✕', `Bulk-deleted <b>${before - this.all(kind).length}</b> item(s)`, actor);
      this.save();
    },

    log(icon, text, by) {
      this.state.activity.unshift({ t: new Date().toISOString(), icon, text, by });
      if (this.state.activity.length > 200) this.state.activity.length = 200;
    },

    /* ── whole-database ops ── */
    exportJSON() {
      return JSON.stringify({ ...this.state, exportedAt: new Date().toISOString() }, null, 1);
    },
    importJSON(text) {
      const j = JSON.parse(text);
      if (!j || !Array.isArray(j.records) || !Array.isArray(j.tickets))
        throw new Error('Not a valid LabDesk database file');
      this.state = {
        meta: Object.assign(blank().meta, j.meta, { v: SEED_VERSION }),
        categories: Array.isArray(j.categories) ? j.categories : [],
        records: j.records, tickets: j.tickets,
        activity: Array.isArray(j.activity) ? j.activity : [],
      };
      this.log('⇅', 'Database imported', 'System');
      this.persist();
      this.emit('reload');
    },
    reset() {
      this.state = seed();
      this.state.meta = Object.assign({ v: SEED_VERSION }, this.state.meta);
      this.log('↺', 'Database reset to factory seed', 'System');
      this.persist();
      this.emit('reload');
    },

    stats() {
      const recs = this.all('records');
      const total = recs.length;
      const active = recs.filter(r => r.status === 'Active' || r.status === 'In Use').length;
      const repair = recs.filter(r => r.status === 'In Repair').length;
      const fault = recs.filter(r => r.status === 'Fault').length;
      const value = recs.reduce((a, r) => a + (Number(r.price) || 0) * (Number(r.qty) || 0), 0);
      const openT = this.all('tickets').filter(t => t.status === 'Open' || t.status === 'In Progress').length;
      return { total, active, repair, fault, value, openT, tickets: this.all('tickets').length };
    },

    storageKB() {
      try { return Math.round((localStorage.getItem(LS_KEY) || '').length / 1024); }
      catch (e) { return 0; }
    },
  };

  window.DB = Store;
})();
