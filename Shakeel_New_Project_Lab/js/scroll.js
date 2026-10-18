/* ═══════════════════════════════════════════════════
   LabDesk — VelocityRail
   New fast-scroll system: edge progress ring, section
   dots, hold-to-turbo boost, keyboard glide (j / k).
   ═══════════════════════════════════════════════════ */
'use strict';

class VelocityRail {
  constructor(scrollEl) {
    this.el = scrollEl;
    this.ring = $('#velRing');
    this.pct = $('#velPct');
    this.dotsBox = $('#velDots');
    this.CIRC = 2 * Math.PI * 16; // r=16 ring
    this.boost = 0;
    this._raf = 0;

    /* progress ring follows the scroll */
    this.el.addEventListener('scroll', () => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.update(); });
    }, { passive: true });

    /* turbo boost — hold to fly */
    const turbo = $('#velTurbo');
    let iv = 0;
    const start = e => {
      e.preventDefault();
      turbo.classList.add('boost');
      this.boost = 6;
      const step = () => {
        this.el.scrollTop += this.boost;
        this.boost = Math.min(this.boost * 1.18, 260);
        iv = requestAnimationFrame(step);
      };
      iv = requestAnimationFrame(step);
      const stop = () => { cancelAnimationFrame(iv); turbo.classList.remove('boost'); this.boost = 0;
        turbo.removeEventListener('pointerup', stop); turbo.removeEventListener('pointerleave', stop); };
      turbo.addEventListener('pointerup', stop);
      turbo.addEventListener('pointerleave', stop);
    };
    turbo.addEventListener('pointerdown', start);

    $('#velTop').addEventListener('click', () =>
      this.el.scrollTo({ top: 0, behavior: 'smooth' }));

    /* keyboard glide */
    document.addEventListener('keydown', e => {
      if (e.target.matches('input,textarea,select')) return;
      if (e.key === 'j') this.el.scrollBy({ top: 260, behavior: 'smooth' });
      if (e.key === 'k') this.el.scrollBy({ top: -260, behavior: 'smooth' });
    });

    this.update();
  }

  /* rebuild section dots from [data-anchor] in the current view */
  buildDots(onPick) {
    const anchors = $$('#view [data-anchor]');
    this.dotsBox.innerHTML = '';
    if (anchors.length < 2) return;
    anchors.forEach((a, i) => {
      const d = document.createElement('button');
      d.className = 'vel-dot';
      d.title = a.dataset.anchor;
      d.addEventListener('click', () => {
        const y = a.getBoundingClientRect().top + this.el.scrollTop - 70;
        this.el.scrollTo({ top: y, behavior: 'smooth' });
        onPick?.(i);
      });
      this.dotsBox.appendChild(d);
    });
    this._anchors = anchors;
  }

  update() {
    const max = this.el.scrollHeight - this.el.clientHeight;
    const p = max > 0 ? this.el.scrollTop / max : 0;
    this.ring.style.strokeDashoffset = String(this.CIRC * (1 - p));
    this.pct.textContent = Math.round(p * 100) + '%';
    /* fade the dock near the very bottom */
    $('#velocity').classList.toggle('faded', p > 0.985);
    /* highlight active section dot */
    if (this._anchors?.length) {
      const y = this.el.scrollTop + 120;
      let act = 0;
      this._anchors.forEach((a, i) => { if (a.offsetTop - 90 <= y) act = i; });
      $$('.vel-dot', this.dotsBox).forEach((d, i) => d.classList.toggle('on', i === act));
    }
  }
}

window.VelocityRail = VelocityRail;
