/* ═══════════════════════════════════════════════════
   LabDesk — ExcelGrid
   Excel-grade data grid: virtual fast-scroll, sort,
   per-column filters, search, CRUD, CSV, print.
   ═══════════════════════════════════════════════════ */
'use strict';

const rowH = () => (document.documentElement.dataset.density === 'compact' ? 34 : 46);

class ExcelGrid {
  /**
   * cfg = {
   *   name, exportName, columns: [{key,title,w,type,options?,required?,readonly?,chip?,m?}],
   *   rows(), onSave(rec, isNew), onDelete(id), onDeleteMany(ids)
   * }
   * column types: text | number | money | date | select | textarea
   * m: 'hide' → hidden under 900px
   */
  constructor(root, cfg) {
    this.root = typeof root === 'string' ? $(root) : root;
    this.cfg = cfg;
    this.q = '';
    this.filters = {};
    this.sortKey = null;
    this.sortDir = 1;
    this.sel = new Set();
    this._raf = 0;
    this.render();
  }

  /* ── data pipeline ── */
  get rows() {
    let rows = this.cfg.rows().slice();
    const q = this.q.trim().toLowerCase();
    if (q) rows = rows.filter(r =>
      this.cfg.columns.some(c => !c.readonly && String(r[c.key] ?? '').toLowerCase().includes(q)));
    for (const [k, v] of Object.entries(this.filters)) {
      if (!v) continue;
      rows = rows.filter(r => String(r[k] ?? '').toLowerCase().includes(String(v).toLowerCase()));
    }
    if (this.sortKey) {
      const k = this.sortKey, d = this.sortDir;
      rows.sort((a, b) => {
        let x = a[k], y = b[k];
        if (x == null) x = ''; if (y == null) y = '';
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * d;
        return String(x).localeCompare(String(y), undefined, { numeric: true }) * d;
      });
    }
    return rows;
  }

  /* ── shell ── */
  render() {
    const cols = this.cfg.columns;
    const template = `34px 44px ${cols.map(c => c.w || '1fr').join(' ')} 96px`;
    this.root.innerHTML = `
      <div class="sheet">
        <div class="sheet-tools">
          <input type="search" class="g-search" placeholder="Search ${esc(this.cfg.name)}…  ( / )" value="${esc(this.q)}">
          <span class="sheet-count" data-count></span>
          <span class="grow"></span>
          <button class="btn btn-sm g-csv"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM14 3v5h5"/></svg><span>CSV</span></button>
          <button class="btn btn-sm g-print"><svg viewBox="0 0 24 24"><path d="M7 8V4h10v4m-9 8H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2m-8 4h10v-4H7v4z"/></svg><span>Print</span></button>
          <button class="btn btn-sm btn-ink g-add">${I.plus}<span>New</span></button>
        </div>
        <div class="grid-wrap">
          <div class="grid-scroll" tabindex="0">
            <div class="grid-sticky" style="grid-template-columns:${template}">
              <div class="grid-head" style="grid-template-columns:${template}">
                <div class="gh" style="cursor:default"><input type="checkbox" class="row-check g-selall" title="Select all"></div>
                <div class="gh" style="cursor:default">#</div>
                ${cols.map(c => `<div class="gh ${c.m === 'hide' ? 'col-m' : ''} ${this.sortKey === c.key ? 'sorted' : ''}" data-k="${c.key}" style="${c.sortable === false ? 'cursor:default' : ''}">${esc(c.title)}<span class="arr">${this.sortKey === c.key ? (this.sortDir > 0 ? '▲' : '▼') : '▲'}</span></div>`).join('')}
                <div class="gh" style="cursor:default">Actions</div>
              </div>
              <div class="grid-filter" style="grid-template-columns:${template}">
                <div class="gf"></div><div class="gf"></div>
                ${cols.map(c => {
                  if (c.filter === false || c.readonly) return `<div class="gf ${c.m === 'hide' ? 'col-m' : ''}"></div>`;
                  if (c.type === 'select' && c.options) {
                    return `<div class="gf ${c.m === 'hide' ? 'col-m' : ''}"><select data-f="${c.key}"><option value="">All</option>${c.options.map(o => `<option ${this.filters[c.key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
                  }
                  return `<div class="gf ${c.m === 'hide' ? 'col-m' : ''}"><input type="text" data-f="${c.key}" placeholder="…" value="${esc(this.filters[c.key] || '')}"></div>`;
                }).join('')}
                <div class="gf"></div>
              </div>
            </div>
            <div class="grid-scroll-body">
              <div class="grid-spacer" data-spacer>
                <div class="grid-window" data-window></div>
              </div>
              <div class="grid-empty" data-empty hidden>
                <b>Nothing here</b>
                Try clearing the search or filters — or add a new record.
              </div>
            </div>
          </div>
          <div class="grid-foot">
            <label class="g-selinfo" style="display:flex;align-items:center;gap:8px"></label>
            <span class="spacer"></span>
            <span data-hint>Click a row to edit · click headers to sort · scroll is virtualized &amp; instant</span>
          </div>
        </div>
      </div>`;

    this.scrollEl = $('[data-spacer]', this.root).closest('.grid-scroll');
    this.windowEl = $('[data-window]', this.root);
    this.spacerEl = $('[data-spacer]', this.root);

    /* events */
    $('.g-search', this.root).addEventListener('input', debounce(e => { this.q = e.target.value; this.refresh(); }, 140));
    $('.g-add', this.root).addEventListener('click', () => this.openForm());
    $('.g-csv', this.root).addEventListener('click', () => this.exportCSV());
    $('.g-print', this.root).addEventListener('click', () => this.printReport());
    $('.g-selall', this.root).addEventListener('change', e => this.toggleAll(e.target.checked));

    $$('.gh[data-k]', this.root).forEach(h => h.addEventListener('click', () => {
      const k = h.dataset.k;
      if (this.sortKey === k) this.sortDir *= -1;
      else { this.sortKey = k; this.sortDir = 1; }
      this.refresh();
    }));

    $$('[data-f]', this.root).forEach(f => f.addEventListener('input', debounce(() => {
      $$('[data-f]', this.root).forEach(el => { this.filters[el.dataset.f] = el.value.trim(); });
      this.refresh();
    }, 200)));

    this.scrollEl.addEventListener('scroll', () => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.renderRows(); });
    }, { passive: true });

    this.windowEl.addEventListener('click', e => {
      const act = e.target.closest('[data-act]');
      const rowEl = e.target.closest('[data-id]');
      if (act) {
        e.stopPropagation();
        const id = act.dataset.id;
        if (act.dataset.act === 'edit') this.openForm(this.rows.find(r => r.id === id));
        if (act.dataset.act === 'del') this.deleteOne(id);
        return;
      }
      if (rowEl) this.openForm(this.rows.find(r => r.id === rowEl.dataset.id));
    });

    this.windowEl.addEventListener('change', e => {
      if (e.target.matches('[data-sel]')) {
        const id = e.target.dataset.sel;
        e.target.checked ? this.sel.add(id) : this.sel.delete(id);
        this.updateFoot();
      }
    });

    this.refresh();
  }

  refresh() {
    this.renderHead();
    this.renderRows();
  }

  renderHead() {
    const template = `34px 44px ${this.cfg.columns.map(c => c.w || '1fr').join(' ')} 96px`;
    $$('.grid-sticky, .grid-head, .grid-filter', this.root).forEach(el => el.style.gridTemplateColumns = template);
    $$('.gh[data-k]', this.root).forEach(h => {
      const on = this.sortKey === h.dataset.k;
      h.classList.toggle('sorted', on);
      $('.arr', h).textContent = on ? (this.sortDir > 0 ? '▲' : '▼') : '▲';
    });
  }

  /* ── virtual rows ── */
  renderRows() {
    const rows = this.rows;
    const empty = $('[data-empty]', this.root);
    const total = rows.length;
    empty.hidden = total > 0;
    this.spacerEl.style.display = total ? '' : 'none';

    const h = rowH();
    const st = this.scrollEl.scrollTop;
    const vh = this.scrollEl.clientHeight || 480;
    const start = Math.max(0, Math.floor(st / h) - 8);
    const end = Math.min(total, Math.ceil((st + vh) / h) + 8);

    this.spacerEl.style.height = (total * h) + 'px';
    this.windowEl.style.transform = `translateY(${start * h}px)`;

    const cols = this.cfg.columns;
    let html = '';
    for (let i = start; i < end; i++) {
      const r = rows[i];
      html += `<div class="grow-row ${this.sel.has(r.id) ? 'sel' : ''}" data-id="${esc(r.id)}" style="grid-template-columns:34px 44px ${cols.map(c => c.w || '1fr').join(' ')} 96px">
        <div class="gc"><input type="checkbox" class="row-check" data-sel="${esc(r.id)}" ${this.sel.has(r.id) ? 'checked' : ''}></div>
        <div class="gc num mut">${i + 1}</div>
        ${cols.map(c => {
          const v = r[c.key];
          const m = c.m === 'hide' ? ' gc col-m' : '';
          if (c.chip) return `<div class="gc${m}"><span class="st s-${slug(v)}" data-label="${esc(v)}">${esc(v)}</span></div>`;
          if (c.type === 'money') return `<div class="gc num">${esc(fmtMoney(v))}</div>`;
          if (c.type === 'number') return `<div class="gc num">${esc(v ?? '—')}</div>`;
          if (c.type === 'date') return `<div class="gc mut">${esc(fmtDate(v))}</div>`;
          const cls = c.key === 'id' ? 'gc id' : 'gc';
          return `<div class="${cls}" title="${esc(v ?? '')}">${esc(v ?? '—')}</div>`;
        }).join('')}
        <div class="gc">
          <button class="icon-btn" data-act="edit" data-id="${esc(r.id)}" title="Edit" style="width:28px;height:28px">${I.edit}</button>
          <button class="icon-btn" data-act="del" data-id="${esc(r.id)}" title="Delete" style="width:28px;height:28px">${I.trash}</button>
        </div>
      </div>`;
    }
    this.windowEl.innerHTML = html;
    $('[data-count]', this.root).textContent = `${total} row${total === 1 ? '' : 's'}`;
    this.updateFoot();
  }

  updateFoot() {
    const n = this.sel.size;
    const info = $('.g-selinfo', this.root);
    info.innerHTML = n
      ? `<b>${n}</b> selected <button class="btn btn-sm btn-ink" data-bulk>Delete</button>`
      : `<span>${this.cfg.rows().length} total in database</span>`;
    const b = $('[data-bulk]', info);
    if (b) b.onclick = () => this.deleteMany();
  }

  toggleAll(on) {
    this.sel.clear();
    if (on) this.rows.forEach(r => this.sel.add(r.id));
    this.renderRows();
  }

  /* ── CRUD ── */
  openForm(rec) {
    const isNew = !rec;
    const cols = this.cfg.columns.filter(c => !c.readonly);
    const blank = {};
    cols.forEach(c => { blank[c.key] = rec ? rec[c.key] : (c.type === 'number' || c.type === 'money' ? 0 : ''); });
    const data = rec ? { ...rec } : { ...blank };

    openModal({
      title: (isNew ? 'New ' : 'Edit ') + this.cfg.name.replace(/s$/, ''),
      wide: true,
      body: `<form id="gridForm" class="form-grid" novalidate>
        ${cols.map(c => {
          if (c.key === 'id') return `<input type="hidden" name="id" value="${esc(data.id || '')}">`;
          const lab = `<span>${esc(c.title)}${c.required ? ' *' : ''}</span>`;
          const full = c.type === 'textarea' ? ' full' : '';
          if (c.type === 'select' && c.options)
            return `<label class="fld${full}">${lab}<select name="${c.key}">${c.options.map(o => `<option ${data[c.key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
          if (c.type === 'textarea')
            return `<label class="fld full">${lab}<textarea name="${c.key}">${esc(data[c.key] || '')}</textarea></label>`;
          const t = c.type === 'money' || c.type === 'number' ? 'number' : (c.type === 'date' ? 'date' : 'text');
          return `<label class="fld${full}">${lab}<input type="${t}" name="${c.key}" ${t === 'number' ? 'step="any" min="0"' : ''} value="${esc(data[c.key] ?? '')}" ${c.required ? 'required' : ''}></label>`;
        }).join('')}
      </form>`,
      actions: [
        { label: 'Cancel', kind: 'btn-ghost' },
        {
          label: isNew ? 'Create' : 'Save changes', kind: 'btn-ink', onClick: () => {
            const f = $('#gridForm');
            const out = {};
            $$('[name]', f).forEach(el => {
              let v = el.type === 'number' ? parseFloat(el.value) || 0 : el.value.trim();
              out[el.name] = v;
            });
            for (const c of cols) if (c.required && !String(out[c.key] ?? '').trim()) { toast(`${c.title} is required`, 'err'); return false; }
            out.id = rec ? rec.id : (out.id || this.cfg.nextId?.() || DB.nextId(this.cfg.store, this.cfg.prefix));
            this.cfg.onSave(out, isNew);
            toast(isNew ? `${out.id} created` : `${out.id} saved`);
          }
        },
      ],
    });
    setTimeout(() => $('[name]', $('#gridForm'))?.focus(), 60);
  }

  deleteOne(id) {
    confirmBox('Delete record', `Permanently delete <b>${esc(id)}</b>? This cannot be undone.`, () => {
      this.cfg.onDelete(id);
      this.sel.delete(id);
      toast(`${id} deleted`);
    });
  }

  deleteMany() {
    const ids = [...this.sel];
    confirmBox(`Delete ${ids.length} records`, `Permanently delete <b>${ids.length}</b> selected record(s)? This cannot be undone.`, () => {
      this.cfg.onDeleteMany(ids);
      this.sel.clear();
      toast(`${ids.length} record(s) deleted`);
    });
  }

  /* ── CSV / print ── */
  exportCSV() {
    const cols = this.cfg.columns;
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.map(c => q(c.title)).join(',')];
    this.rows.forEach(r => lines.push(cols.map(c => q(r[c.key])).join(',')));
    download(`${this.cfg.exportName || 'labdesk'}-${Date.now()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('CSV exported — opens in Excel');
  }

  printReport() {
    const cols = this.cfg.columns;
    const rows = this.rows;
    $('#printRoot').innerHTML = `
      <div class="pr-head">
        <div>
          <h1>${esc(this.cfg.name)}</h1>
          <div class="org">${esc(DB.state.meta.org)} · LabDesk report</div>
        </div>
        <div class="pr-meta">
          Generated <b>${new Date().toLocaleString('en-GB')}</b><br>
          Rows <b>${rows.length}</b> · Search <b>${esc(this.q || '—')}</b>
        </div>
      </div>
      <table class="pr"><thead><tr>${cols.map(c => `<th>${esc(c.title)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map(c => {
        const v = r[c.key];
        return `<td>${esc(c.type === 'money' ? fmtMoney(v) : c.type === 'date' ? fmtDate(v) : (v ?? '—'))}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>
      <div class="pr-foot"><span>LabDesk — Shakeel New Project Lab</span><span class="pageno"></span></div>`;
    window.print();
  }
}

const slug = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
