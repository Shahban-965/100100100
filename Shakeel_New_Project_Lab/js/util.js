/* ═══════════════════════════════════════════════════
   LabDesk — shared utilities
   ═══════════════════════════════════════════════════ */
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const uid = () => 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const debounce = (fn, ms = 180) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

const fmtMoney = n => {
  const v = Number(n || 0);
  return (v === 0 ? 'Free' : '₨ ' + Math.round(v).toLocaleString('en-PK'));
};

const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const timeAgo = iso => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s) || s < 0) return fmtDate(iso);
  if (s < 60) return 'just now';
  const m = s / 60;   if (m < 60)  return Math.floor(m) + 'm ago';
  const h = m / 60;   if (h < 24)  return Math.floor(h) + 'h ago';
  const d = h / 24;   if (d < 30)  return Math.floor(d) + 'd ago';
  return fmtDate(iso);
};

const download = (filename, content, type = 'text/plain') => {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/* SHA-256 for the lab passcode (with a tiny sync fallback) */
async function sha256(text) {
  try {
    if (crypto?.subtle && window.isSecureContext !== false) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* fall through */ }
  // FNV-1a fallback (non-secure contexts)
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* ── Toast notifications ─────────────────────────────── */
const toast = (msg, type = 'ok') => {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
};

/* ── Modal helper ────────────────────────────────────── */
const openModal = ({ title, body, actions = [], wide = false }) => {
  const layers = $('#layers');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" ${wide ? 'style="width:min(720px,100%)"' : ''}>
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-close aria-label="Close">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot"></div>
    </div>`;
  const foot = $('.modal-foot', wrap);
  const close = () => { scrim.remove(); wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.kind || '');
    b.innerHTML = a.label;
    b.onclick = () => { const keep = a.onClick?.(); if (keep !== false) close(); };
    foot.appendChild(b);
  });
  scrim.onclick = close;
  wrap.onclick = e => { if (e.target === wrap) close(); };
  $('[data-close]', wrap).onclick = close;
  document.addEventListener('keydown', onKey);
  layers.append(scrim, wrap);
  return { close, el: wrap };
};

const confirmBox = (title, text, onYes, yesLabel = 'Delete') =>
  openModal({
    title,
    body: `<p style="color:var(--ink-2);font-size:14px">${text}</p>`,
    actions: [
      { label: 'Cancel', kind: 'btn-ghost' },
      { label: yesLabel, kind: 'btn-ink', onClick: onYes },
    ],
  });

/* ── SVG icon set (stroke, monochrome) ──────────────── */
const I = {
  dash:  '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/></svg>',
  box:   '<svg viewBox="0 0 24 24"><path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5zM3 8.5 12 14l9-5.5M12 14v7"/></svg>',
  ticket:'<svg viewBox="0 0 24 24"><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5z"/><path d="M13 6v2m0 3v2m0 3v2" stroke-dasharray="1 3"/></svg>',
  db:    '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5v13c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8v-13M4 12c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8"/></svg>',
  gear:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.36.95a7 7 0 0 0-2.42-1.4L13.7 2.6h-3.4l-.38 2.54a7 7 0 0 0-2.42 1.4l-2.36-.95-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.36-.95a7 7 0 0 0 2.42 1.4l.38 2.54h3.4l.38-2.54a7 7 0 0 0 2.42-1.4l2.36.95 2-3.46-2-1.55c.09-.46.14-.92.14-1.4z"/></svg>',
  plus:  '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  edit:  '<svg viewBox="0 0 24 24"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17zM13.5 6.5l3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8.5 0 1 13h9l1-13"/></svg>',
  csv:   '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM14 3v5h5"/><path d="M9 13h6M9 16h6M9 19h4"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
};
