/* Clefwork — interactive SVG staff (single staff or piano grand staff). Notes snap to
   lines and spaces; students drag, click, or use the keyboard to place and adjust them.
   On a grand staff each note carries `st` (0 = treble staff, 1 = bass staff). */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const NS = 'http://www.w3.org/2000/svg';
  const G = 12, HALF = 6;
  const kindAlt = (k) => (k === 'sharp' ? 1 : k === 'flat' ? -1 : 0);

  const SHARPS_T = [38, 35, 39, 36, 33, 37, 34];
  const FLATS_T = [34, 37, 33, 36, 32, 35, 31];
  const keySigDias = (f, clef) =>
    (f > 0 ? SHARPS_T.slice(0, f) : FLATS_T.slice(0, -f)).map((d) => d + (clef === 'bass' ? -14 : 0));

  const HEAD = '<path class="head" fill-rule="evenodd" d="M-7.6 0A7.6 5.4 0 1 0 7.6 0A7.6 5.4 0 1 0 -7.6 0ZM2.75 -3.93A4.8 2.6 -55 1 0 -2.75 3.93A4.8 2.6 -55 1 0 2.75 -3.93Z"/>';
  const ACC = {
    1: '<path d="M-3.2 -12.5V11M2.6 -13.5V10" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M-5.6 -4L5.2 -7.2V-4.2L-5.6 -1ZM-5.6 4L5.2 0.8V3.8L-5.6 7Z" fill="currentColor"/>',
    '-1': '<path d="M-3.5 -17V5.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M-3.5 5.5C1 2 6.2 -1.5 5.2 -4.6C4.3 -7.2 0.4 -6.6 -3.5 -2.6V-0.8C-0.6 -3.8 2.6 -4.9 3 -3.2C3.4 -1.3 0.2 1.8 -3.5 3.6Z" fill="currentColor"/>',
    0: '<path d="M-3 -13V6.5M3 -6.5V13" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M-3 -4L3 -6.2V-3.2L-3 -1ZM-3 3L3 0.8V3.8L-3 6Z" fill="currentColor"/>',
  };
  ACC[2] = '<path d="M-3.6 -3.6L3.6 3.6M3.6 -3.6L-3.6 3.6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M-5 -5h3.2v3.2h-3.2zM1.8 -5h3.2v3.2h-3.2zM-5 1.8h3.2v3.2h-3.2zM1.8 1.8h3.2v3.2h-3.2z" fill="currentColor"/>';
  ACC[-2] = `<g transform="translate(-4.5 0)">${ACC[-1]}</g><g transform="translate(3.5 0)">${ACC[-1]}</g>`;
  const SHARP_STEPS = [3, 0, 4, 1, 5, 2, 6], FLAT_STEPS = [6, 2, 5, 1, 4, 0, 3];
  const svgText = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    // Accidentals in labels use the music font, raised a little so they sit like superscripts.
    .replace(/([♯♭♮]+)/g, '<tspan class="sacc" dy="-3">$1</tspan><tspan dy="3">\u200b</tspan>');
  // Noto Music draws clefs with the baseline on the bottom staff line and 1 em ≈ staff height.
  // Treble: the curl wraps the G line. Bass: nudged up so its dots flank the F line.
  // The drawn paths are a fallback for when the font can't load (offline).
  function clefSVG(clef, by, x) {
    if (MQ.clefFont === false) {
      return clef === 'treble'
        ? `<g transform="translate(${x + 23} ${by - 12})" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M-1 -3C3 -3 4 3 -1 4C-7 5 -9 -3 -6 -7C-2 -12 9 -10 10 -1C11 8 3 14 -5 13C-13 12 -16 2 -12 -5C-8 -12 0 -20 1 -32C2 -44 -2 -56 -6 -58C-10 -60 -9 -48 -4 -42C1 -36 2 -24 0 -10L-3 18C-4 26 6 28 6 21"/><circle cx="4" cy="21" r="3.6" fill="currentColor" stroke="none"/></g>`
        : `<g transform="translate(${x + 14} ${by - 36})" fill="currentColor"><circle cx="-2" cy="0" r="4.4"/><path d="M-2 -1C-2 -10 8 -12 13 -7C19 -1 16 10 -6 22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="-6" r="2.2"/><circle cx="22" cy="6" r="2.2"/></g>`;
    }
    return clef === 'treble'
      ? `<text class="clef-glyph" x="${x}" y="${by}" font-size="48">\u{1D11E}</text>`
      : `<text class="clef-glyph" x="${x}" y="${by - 5.5}" font-size="50">\u{1D122}</text>`;
  }

  function describePos(pos) {
    if (pos >= 0 && pos <= 8) return pos % 2 ? `space ${(pos + 1) / 2}` : `line ${pos / 2 + 1}`;
    if (pos === -1) return 'the space below the staff';
    if (pos === 9) return 'the space above the staff';
    if (pos < 0) return pos % 2 ? `below ledger line ${(-pos - 1) / 2} under the staff` : `ledger line ${-pos / 2} below the staff`;
    return pos % 2 ? `above ledger line ${(pos - 9) / 2} over the staff` : `ledger line ${(pos - 8) / 2} above the staff`;
  }
  const altWord = (a) => (a === 1 ? 'sharp ' : a === -1 ? 'flat ' : '');

  class Staff {
    constructor(host, opts) {
      this.opts = Object.assign({ clef: 'treble', grand: false, keySig: 0, keyAware: false, chordLabels: null, barlines: false, colW: null, columns: [], placed: null, readOnly: false, labels: false, reveal: null, revealPc: false, marks: null, onChange: null }, opts);
      const o = this.opts;
      // `by` is the y of the bottom staff line; min/max bound note positions on that staff.
      this.staves = o.grand
        ? [{ clef: 'treble', by: 108, min: -6, max: 16, name: 'treble staff' }, { clef: 'bass', by: 228, min: -8, max: 14, name: 'bass staff' }]
        : [{ clef: o.clef, by: 132, min: -9, max: 17, name: '' }];
      this.staves.forEach((s) => (s.bottom = MQ.CLEFS[s.clef].bottom));
      this.vbH = o.grand ? 292 : 206;
      this.xs = o.grand ? 14 : 0; // room for the brace
      this.placed = o.placed || o.columns.map(() => []);
      this.sel = null;
      this.hover = null;
      this.drag = null;
      const svg = (this.svg = document.createElementNS(NS, 'svg'));
      svg.setAttribute('class', 'staff' + (o.grand ? ' is-grand' : '') + (o.readOnly ? ' is-readonly' : ''));
      svg.setAttribute('role', o.readOnly ? 'img' : 'application');
      if (!o.readOnly) svg.setAttribute('tabindex', '0');
      host.append(svg);
      if (!o.readOnly) this.bind();
      this.render();
    }

    // ---------- geometry ----------
    stOf(p) { return this.opts.grand ? p.st || 0 : 0; }
    stAt(y) { return this.opts.grand && y >= (this.staves[0].by + this.staves[1].by - 48) / 2 ? 1 : 0; }
    posAt(y, st) { const s = this.staves[st]; return Math.max(s.min, Math.min(s.max, Math.round((s.by - y) / HALF))); }
    yOf(st, pos) { return this.staves[st].by - pos * HALF; }
    posOf(p) { return MQ.dia(p) - this.staves[this.stOf(p)].bottom; }
    mk(st, pos, alt) {
      const n = MQ.fromDia(this.staves[st].bottom + pos, alt || 0);
      if (this.opts.grand) n.st = st;
      return n;
    }
    topY() { return this.yOf(0, this.staves[0].max); }
    botY() { const i = this.staves.length - 1; return this.yOf(i, this.staves[i].min); }
    layout() {
      const cols = this.opts.columns;
      const ks = Math.abs(this.opts.keySig || 0);
      const x0 = (ks ? 54 + ks * 11 + 8 : 60) + this.xs;
      const n = cols.length;
      const colW = this.opts.colW || (n >= 6 ? 46 : n >= 3 ? 56 : 76);
      const W = Math.max(n ? 300 : 210, x0 + n * colW + 24);
      const start = x0 + (W - 24 - x0 - n * colW) / 2;
      return { W, colW, colX: cols.map((_, i) => start + colW * (i + 0.5)) };
    }
    editable() { return this.opts.columns.map((c, i) => (c.cap > 0 ? i : -1)).filter((i) => i >= 0); }
    nearestCol(x) {
      const { colX } = this.layout();
      let best = -1;
      this.editable().forEach((i) => { if (best < 0 || Math.abs(colX[i] - x) < Math.abs(colX[best] - x)) best = i; });
      return best;
    }
    pt(cx, cy) {
      const m = this.svg.getScreenCTM();
      if (!m) return { x: -1, y: -1 };
      const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    }
    inZone(p) { return p.x >= 0 && p.x <= this.layout().W && p.y >= this.topY() - 12 && p.y <= this.botY() + 12; }

    // ---------- editing ----------
    // Adds (or moves into place) a note in a column; returns its index.
    placeAt(col, st, pos, alt) {
      const cap = this.opts.columns[col].cap;
      const arr = (this.placed[col] = this.placed[col] || []);
      const note = this.mk(st, pos, alt);
      const d = MQ.dia(note);
      const idxSame = arr.findIndex((p) => p && MQ.dia(p) === d);
      if (idxSame >= 0) {
        if (alt !== null) arr[idxSame].alt = alt;
        if (this.opts.grand) arr[idxSame].st = st;
        return idxSame;
      }
      if (cap === 1) { arr[0] = note; return 0; }
      if (arr.length < cap) { arr.push(note); return arr.length - 1; }
      let near = 0;
      arr.forEach((p, i) => { if (Math.abs(MQ.dia(p) - d) < Math.abs(MQ.dia(arr[near]) - d)) near = i; });
      arr[near] = note;
      return near;
    }
    // Every note on the staff, per column: printed notes plus the ones placed.
    pitches() { return this.opts.columns.map((c, i) => c.given.concat((this.placed[i] || []).filter(Boolean))); }
    selNote() { return this.sel ? (this.placed[this.sel.col] || [])[this.sel.idx] : null; }
    dedupe(col) {
      const arr = this.placed[col];
      if (!arr) return;
      const keep = this.sel && this.sel.col === col ? arr[this.sel.idx] : null;
      const seen = new Map();
      arr.forEach((p) => { const d = MQ.dia(p); if (!seen.has(d) || p === keep) seen.set(d, p); });
      this.placed[col] = [...seen.values()];
      if (keep) this.sel = { col, idx: this.placed[col].indexOf(keep) };
    }
    focus() { try { this.svg.focus({ preventScroll: true }); } catch (e) { /* not focusable */ } }
    changed() {
      this.render();
      if (this.opts.onChange) this.opts.onChange(this.placed.map((c) => (c || []).map((p) => ({ ...p }))));
    }

    // ---------- public editing API (palette, toolbar, keyboard) ----------
    addNote() {
      const col = this.editable().find((i) => (this.placed[i] || []).length < this.opts.columns[i].cap);
      if (col === undefined) return false;
      this.sel = { col, idx: this.placeAt(col, 0, 4, 0) };
      this.changed();
      this.focus();
      return true;
    }
    setAlt(a) { const n = this.selNote(); if (!n) return false; n.alt = a; this.changed(); return true; }
    nudge(d) {
      const n = this.selNote();
      if (!n) return false;
      const st = this.stOf(n), s = this.staves[st];
      const pos = Math.max(s.min, Math.min(s.max, this.posOf(n) + d));
      Object.assign(n, this.mk(st, pos, n.alt));
      this.dedupe(this.sel.col);
      this.changed();
      return true;
    }
    remove() {
      if (!this.selNote()) return false;
      this.placed[this.sel.col].splice(this.sel.idx, 1);
      this.sel = null;
      this.changed();
      return true;
    }
    cycle(dir) {
      const all = [];
      this.placed.forEach((arr, col) => (arr || []).forEach((p, idx) => all.push({ col, idx, d: MQ.dia(p) })));
      if (!all.length) return;
      all.sort((a, b) => a.col - b.col || a.d - b.d);
      const cur = this.sel ? all.findIndex((s) => s.col === this.sel.col && s.idx === this.sel.idx) : -1;
      const next = all[(cur + dir + all.length) % all.length];
      this.sel = { col: next.col, idx: next.idx };
      this.render();
    }
    hoverAt(cx, cy, kind) {
      const p = this.pt(cx, cy);
      const col = this.inZone(p) ? this.nearestCol(p.x) : -1;
      let next = null;
      if (col >= 0) { const st = this.stAt(p.y); next = { col, st, pos: this.posAt(p.y, st), alt: kindAlt(kind) }; }
      if (JSON.stringify(next) !== JSON.stringify(this.hover)) { this.hover = next; this.render(); }
      return !!next;
    }
    clearHover() { if (this.hover) { this.hover = null; this.render(); } }
    dropAt(cx, cy, kind) {
      const p = this.pt(cx, cy);
      this.hover = null;
      const col = this.inZone(p) ? this.nearestCol(p.x) : -1;
      if (col < 0) { this.render(); return false; }
      const st = this.stAt(p.y), pos = this.posAt(p.y, st);
      if (kind !== 'note') {
        // An accidental dropped close to a note applies to it; otherwise it brings a new note.
        const arr = this.placed[col] || [];
        let hit = -1;
        arr.forEach((n, i) => {
          if (this.stOf(n) !== st) return;
          const dd = Math.abs(this.posOf(n) - pos);
          if (dd <= 1 && (hit < 0 || dd < Math.abs(this.posOf(arr[hit]) - pos))) hit = i;
        });
        if (hit >= 0) { arr[hit].alt = kindAlt(kind); this.sel = { col, idx: hit }; this.changed(); this.focus(); return true; }
      }
      this.sel = { col, idx: this.placeAt(col, st, pos, kindAlt(kind)) };
      this.changed();
      this.focus();
      return true;
    }

    bind() {
      const svg = this.svg;
      svg.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        const p = this.pt(e.clientX, e.clientY);
        if (!this.inZone(p)) return;
        const hit = e.target.closest('[data-col]');
        let col, idx;
        if (hit) { col = +hit.dataset.col; idx = +hit.dataset.idx; }
        else {
          col = this.nearestCol(p.x);
          if (col < 0) return;
          const st = this.stAt(p.y);
          idx = this.placeAt(col, st, this.posAt(p.y, st), 0);
        }
        e.preventDefault();
        this.focus();
        this.sel = { col, idx };
        this.hover = null;
        this.drag = { col, idx, out: false };
        try { svg.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
        this.changed();
      });
      svg.addEventListener('pointermove', (e) => {
        const p = this.pt(e.clientX, e.clientY);
        if (this.drag) {
          const n = (this.placed[this.drag.col] || [])[this.drag.idx];
          if (!n) return;
          // Dragging across the gap of a grand staff moves the note to the other staff.
          const st = this.stAt(p.y), pos = this.posAt(p.y, st);
          this.drag.out = p.y < this.topY() - 34 || p.y > this.botY() + 34;
          if (this.stOf(n) !== st || this.posOf(n) !== pos) Object.assign(n, this.mk(st, pos, n.alt));
          this.render();
        } else if (e.pointerType === 'mouse') {
          const col = this.inZone(p) && !e.target.closest('[data-col]') ? this.nearestCol(p.x) : -1;
          let next = null;
          if (col >= 0) { const st = this.stAt(p.y); next = { col, st, pos: this.posAt(p.y, st), alt: 0 }; }
          if (JSON.stringify(next) !== JSON.stringify(this.hover)) { this.hover = next; this.render(); }
        }
      });
      const end = () => {
        if (!this.drag) return;
        const { col, out } = this.drag;
        this.drag = null;
        if (out) { this.remove(); return; }
        this.dedupe(col);
        this.changed();
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('pointerleave', () => { if (!this.drag) this.clearHover(); });
      svg.addEventListener('keydown', (e) => {
        const k = e.key;
        let done = true;
        if (k === 'ArrowUp') this.nudge(1) || this.cycle(1);
        else if (k === 'ArrowDown') this.nudge(-1) || this.cycle(1);
        else if (k === 'ArrowRight') this.cycle(1);
        else if (k === 'ArrowLeft') this.cycle(-1);
        else if (k === 'Delete' || k === 'Backspace') this.remove();
        else if (k === '#' || k === 's' || k === 'S') this.setAlt(1);
        else if (k === 'b' || k === 'f' || k === 'F') this.setAlt(-1);
        else if (k === 'n' || k === 'N' || k === '=') this.setAlt(0);
        else if (k === 'Enter' || k === ' ' || k === '+') this.addNote();
        else if (k === 'Escape') { this.sel = null; this.render(); }
        else done = false;
        if (done) e.preventDefault();
      });
    }

    // ---------- drawing ----------
    labelName(p) { return MQ.fullName(p); }
    // The accidental to print: with keyAware, only what differs from the key signature (a natural
    // cancels a signature sharp or flat). Returns null when nothing is printed.
    shownAcc(p) {
      if (!this.opts.keyAware) return p.alt || null;
      const f = this.opts.keySig || 0;
      const inKey = f > 0 && SHARP_STEPS.slice(0, f).includes(p.step) ? 1 : f < 0 && FLAT_STEPS.slice(0, -f).includes(p.step) ? -1 : 0;
      return p.alt === inKey ? null : p.alt;
    }
    noteSVG(x, n, extraX, accLevel) {
      const st = this.stOf(n.p), pos = this.posOf(n.p);
      let s = `<g class="note ${n.cls}"${n.col != null ? ` data-col="${n.col}" data-idx="${n.idx}"` : ''} transform="translate(${x + extraX} ${this.yOf(st, pos)})">`;
      if (n.cls.includes('is-sel')) s += '<ellipse class="halo" rx="13" ry="10"/>';
      for (let L = -2; L >= pos; L -= 2) s += `<line class="ledger" x1="-12" x2="12" y1="${(pos - L) * HALF}" y2="${(pos - L) * HALF}"/>`;
      for (let L = 10; L <= pos; L += 2) s += `<line class="ledger" x1="-12" x2="12" y1="${(pos - L) * HALF}" y2="${(pos - L) * HALF}"/>`;
      const acc = this.shownAcc(n.p);
      if (acc != null) s += `<g transform="translate(${-19 - accLevel * 11 - extraX - (acc === -2 ? 5 : 0)} 0)">${ACC[acc]}</g>`;
      s += HEAD;
      if (n.col != null) s += '<ellipse class="hit" rx="12" ry="8"/>';
      if (n.label) s += `<text class="nlabel" y="${pos >= 4 ? 26 : -16}" text-anchor="middle">${n.label}</text>`;
      return s + '</g>';
    }
    column(x, notes) {
      let out = '';
      this.staves.forEach((_, st) => {
        const group = notes.filter((n) => this.stOf(n.p) === st).sort((a, b) => MQ.dia(a.p) - MQ.dia(b.p));
        let prev = null;
        const accs = [];
        group.forEach((n) => {
          const d = MQ.dia(n.p);
          n.shift = prev && d - prev.d === 1 && !prev.shift && prev.cls !== 'hover' ? 15 : 0;
          prev = { d, shift: n.shift, cls: n.cls };
          if (this.shownAcc(n.p) != null) accs.push(n);
        });
        // Stagger accidentals that would collide, highest note first.
        accs.sort((a, b) => MQ.dia(b.p) - MQ.dia(a.p));
        const placedAcc = [];
        accs.forEach((n) => {
          let lvl = 0;
          while (placedAcc.some((o) => o.lvl === lvl && Math.abs(MQ.dia(o.p) - MQ.dia(n.p)) < 6)) lvl++;
          n.lvl = lvl;
          placedAcc.push({ p: n.p, lvl });
        });
        group.forEach((n) => (out += this.noteSVG(x, n, n.shift, n.lvl || 0)));
      });
      return out;
    }

    render() {
      const o = this.opts, xs = this.xs;
      const { W, colW, colX } = this.layout();
      const top = this.staves[0].by - 4 * G, bottom = this.staves[this.staves.length - 1].by;
      this.svg.setAttribute('viewBox', `0 0 ${W} ${this.vbH}`);
      this.svg.style.maxWidth = Math.round(W * 1.75) + 'px';
      let s = '';
      if (!o.readOnly) {
        o.columns.forEach((c, i) => {
          if (c.cap > 0) s += `<rect class="slot${this.hover && this.hover.col === i ? ' is-hover' : ''}" x="${colX[i] - colW / 2 + 5}" y="${top - 34}" width="${colW - 10}" height="${bottom - top + 68}" rx="9"/>`;
        });
      }
      this.staves.forEach((st) => {
        for (let i = 0; i < 5; i++) s += `<line class="sl" x1="${4 + xs}" x2="${W - 4}" y1="${st.by - i * G}" y2="${st.by - i * G}"/>`;
        s += `<g class="clef">${clefSVG(st.clef, st.by, 8 + xs)}</g>`;
        keySigDias(o.keySig || 0, st.clef).forEach((d, k) => {
          s += `<g class="ks" transform="translate(${56 + xs + k * 11} ${st.by - (d - st.bottom) * HALF})">${ACC[o.keySig > 0 ? 1 : -1]}</g>`;
        });
      });
      s += `<line class="sl" x1="${4 + xs}" x2="${4 + xs}" y1="${top}" y2="${bottom}"/><line class="sl" x1="${W - 4}" x2="${W - 4}" y1="${top}" y2="${bottom}"/>`;
      if (o.grand) {
        const m = (top + bottom) / 2;
        s += `<path class="brace" d="M13 ${top}C3 ${top + 26} 12 ${m - 34} 3 ${m}C12 ${m + 34} 3 ${bottom - 26} 13 ${bottom}C8 ${bottom - 26} 16 ${m + 34} 6.5 ${m}C16 ${m - 34} 8 ${top + 26} 13 ${top}Z"/>`;
      }
      const n = o.columns.length;
      if (o.barlines) for (let i = 0; i < n - 1; i++) {
        const x = (colX[i] + colX[i + 1]) / 2;
        s += `<line class="sl" x1="${x}" x2="${x}" y1="${top}" y2="${bottom}"/>`;
      }
      if (o.chordLabels) {
        const { top: above, bottom: below } = o.chordLabels;
        (above || []).forEach((t, i) => (s += `<text class="clabel" x="${colX[i]}" y="${o.grand ? 18 : 24}" text-anchor="middle">${svgText(t)}</text>`));
        (below || []).forEach((t, i) => (s += `<text class="clabel" x="${colX[i]}" y="${this.vbH - (o.chordLabels.bottom2 ? 22 : 8)}" text-anchor="middle">${svgText(t)}</text>`));
        (o.chordLabels.bottom2 || []).forEach((t, i) => (s += t ? `<text class="clabel is-small" x="${colX[i]}" y="${this.vbH - 6}" text-anchor="middle">${svgText(t)}</text>` : ''));
      }
      const described = [];
      o.columns.forEach((c, i) => {
        const notes = [];
        c.given.forEach((p) => notes.push({ p, cls: 'given' }));
        (this.placed[i] || []).forEach((p, idx) => {
          if (!p) return;
          const sel = this.sel && this.sel.col === i && this.sel.idx === idx;
          const mark = o.marks && o.marks[i] ? (o.marks[i][idx] ? ' is-right' : ' is-wrong') : '';
          const dragging = this.drag && this.drag.col === i && this.drag.idx === idx;
          notes.push({
            p, col: i, idx,
            cls: 'placed' + (sel && !o.readOnly ? ' is-sel' : '') + mark + (dragging && this.drag.out ? ' is-leaving' : ''),
            label: o.labels && dragging ? this.labelName(p) : null,
          });
          const where = this.staves[this.stOf(p)].name;
          described.push(`${altWord(p.alt)}note on ${where ? where + ' ' : ''}${describePos(this.posOf(p))}`);
        });
        if (o.reveal && o.reveal[i]) {
          const mk = (o.marks && o.marks[i]) || [];
          o.reveal[i].forEach((p) => {
            const hit = (this.placed[i] || []).some((q, k) => mk[k] && (o.revealPc ? MQ.midi(q) % 12 === MQ.midi(p) % 12 : MQ.midi(q) === MQ.midi(p)));
            if (!hit) notes.push({ p, cls: 'expected' });
          });
        }
        if (this.hover && this.hover.col === i) {
          const h = this.hover, hp = this.mk(h.st, h.pos, h.alt);
          notes.push({ p: hp, cls: 'hover', label: o.labels ? this.labelName(hp) : null });
        }
        s += this.column(colX[i], notes);
      });
      this.svg.innerHTML = s;
      const name = o.grand ? 'Grand staff with treble and bass clefs' : MQ.CLEFS[o.clef].label + ' clef staff';
      const ks = o.keySig ? `, key signature with ${Math.abs(o.keySig)} ${o.keySig > 0 ? 'sharp' : 'flat'}${Math.abs(o.keySig) > 1 ? 's' : ''}` : '';
      const given = [].concat(...o.columns.map((c) => c.given)).map((p) => `printed note on ${describePos(this.posOf(p))}`);
      this.svg.setAttribute('aria-label', name + ks + (given.length ? '. ' + given.join(', ') : '') + (o.readOnly ? '' : '. Your notes: ' + (described.join(', ') || 'none yet') + '. Press Enter to add a note, arrow keys to move it, S or B for sharp or flat, Delete to remove.'));
    }
  }

  MQ.Staff = Staff;
  MQ.ACC_SVG = ACC;
  MQ.HEAD_SVG = HEAD;
})(window);
