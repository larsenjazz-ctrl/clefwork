/* Clefwork Rhythm — the one-line staff. Draws a rhythm in one or two parts (stems up, and stems
   down) with beams, flags, dots, rests and triplet brackets, and lets students and teachers write
   one: a caret marks where the next note goes, a clicked note is selected and can be replaced.
   Everything is drawn as plain paths, lines and rectangles so the same picture prints and goes
   into PDFs and Word documents. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const NS = 'http://www.w3.org/2000/svg';
  const LINE = 66, RX = 6.3, RY = 4.4, STEM = 32, BEAM = 4.6, BEAM_STEP = 7.5, X0 = 58, PAD_L = 14, PAD_R = 12;
  const COS = 0.9397, SIN = 0.342;                  // note heads lean 20°
  const r1 = (n) => Math.round(n * 10) / 10;
  const ell = (rx, ry) => `M${-rx} 0A${rx} ${ry} 0 1 0 ${rx} 0A${rx} ${ry} 0 1 0 ${-rx} 0Z`;
  const tilt = (x, y) => `matrix(${COS} ${-SIN} ${SIN} ${COS} ${r1(x)} ${r1(y)})`;
  const wholeHead = () => (MQ.HEAD_SVG.match(/ d="([^"]+)"/) || [])[1] || ell(7.6, 5.4);
  const QREST = 'M-2.2 -12L4 -5.2C1.6 -2.8 1.2 0.2 4.4 3.8L3.6 4.6C0.6 2.8 -2.6 4 0.4 9.6C-4.6 6.6 -3.4 1.8 1.4 2.4L-3.8 -3.6C-1.2 -6 -0.6 -9 -2.2 -12Z';
  const NAMES = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'];

  function headSVG(v, x, y) {
    if (v === 0) return `<path transform="translate(${r1(x)} ${r1(y)})" fill="currentColor" fill-rule="evenodd" d="${wholeHead()}"/>`;
    if (v === 1) return `<path transform="${tilt(x, y)}" fill="currentColor" fill-rule="evenodd" d="${ell(RX, RY)}${ell(4.4, 1.9)}"/>`;
    return `<path transform="${tilt(x, y)}" fill="currentColor" d="${ell(RX, RY)}"/>`;
  }
  const lineSVG = (x1, y1, x2, y2, w, cls) => `<line${cls ? ` class="${cls}"` : ''} x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="currentColor" stroke-width="${w}"/>`;
  const rectSVG = (x, y, w, h) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="currentColor"/>`;
  const dotSVG = (x, y) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="1.9" fill="currentColor"/>`;
  // Flags hang from the end of the stem: down and right for stems up, up and right for stems down.
  function flagsSVG(sx, sy, up, n) {
    let s = '';
    const d = up ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const y = sy + k * 7 * d;
      s += `<path fill="currentColor" d="M${r1(sx)} ${r1(y)}C${r1(sx)} ${r1(y + 6 * d)} ${r1(sx + 10)} ${r1(y + 9 * d)} ${r1(sx + 8.6)} ${r1(y + 20 * d)}`
        + `C${r1(sx + 9.2)} ${r1(y + 12.5 * d)} ${r1(sx + 3)} ${r1(y + 10.5 * d)} ${r1(sx)} ${r1(y + 9.5 * d)}Z"/>`;
    }
    return s;
  }
  function restSVG(v, x, pos) {
    if (v === 0) return rectSVG(x - 6, pos.wholeTop, 12, 5.2);
    if (v === 1) return rectSVG(x - 6, pos.halfBottom - 5.2, 12, 5.2);
    const at = `translate(${r1(x)} ${r1(pos.rest)})`;
    if (v === 2) return `<path transform="${at}" fill="currentColor" d="${QREST}"/>`;
    const tail = v === 3 ? 'M-2.2 -3.6C-0.4 -1.6 2.4 -2 4.4 -5.4L0 8' : 'M-2.2 -3.6C-0.4 -1.6 2.4 -2 4.4 -5.4L-1.4 12M-3.6 2.4C-1.8 4.4 0.8 4 2.3 1';
    return `<g transform="${at}"><circle cx="-2.2" cy="-3.6" r="2.1" fill="currentColor"/>${v === 4 ? '<circle cx="-3.6" cy="2.4" r="2.1" fill="currentColor"/>' : ''}`
      + `<path d="${tail}" fill="none" stroke="currentColor" stroke-width="1.4"/></g>`;
  }
  // Where each part sits: on the line alone, or above (stems up) and below (stems down) it.
  function partPos(l, two) {
    if (!two) return { head: LINE, up: true, rest: LINE, wholeTop: LINE, halfBottom: LINE, dot: LINE - 3.5 };
    return l === 0
      ? { head: LINE - 6, up: true, rest: LINE - 15, wholeTop: LINE - 17, halfBottom: LINE - 11, dot: LINE - 7 }
      : { head: LINE + 6, up: false, rest: LINE + 15, wholeTop: LINE + 11, halfBottom: LINE + 17, dot: LINE + 5 };
  }
  const spacing = (dt) => 13 + 23 * Math.pow(Math.max(1, dt) / 12, 0.62);
  // Each note's start and length, and which flagged notes share a beam: those that start within
  // the same beat (in 3/8, the same bar), with no rest between them.
  function beamPlan(events, info) {
    const list = [];
    let t = 0;
    events.forEach((e, i) => { const d = MQ.rhythmDur(e); list.push({ e, i, t, d }); t += d; });
    const windowOf = (at) => info.beams.findIndex((b) => at >= b.at && at < b.at + b.len);
    const beamed = [];
    let run = [];
    const flush = () => { if (run.length > 1) beamed.push(run); run = []; };
    list.forEach((n) => {
      if (n.e.r || n.e.v < 3) { flush(); return; }
      if (run.length && windowOf(run[0].t) !== windowOf(n.t)) flush();
      run.push(n);
    });
    flush();
    const inBeam = new Map();
    beamed.forEach((grp, k) => grp.forEach((n) => inBeam.set(n.i, k)));
    return { list, beamed, inBeam };
  }

  // ---------- the picture ----------
  // model: {meter, measures, parts, layers}. opts: print, first (number of the first measure shown),
  // showTime, measureW (a fixed width per measure, for blank paper staves), caret {l, m, i},
  // sel {l, m, i}, active, marks [[bool]], playing, editing.
  function build(model, opts) {
    const o = Object.assign({ print: false, first: 0, showTime: true, measureW: null, caret: null, sel: null, active: 0, marks: null, playing: -1, editing: false }, opts);
    const info = MQ.rhythmMeter(model.meter);
    const two = model.parts > 1;
    const H = two ? 124 : 92;
    const layers = [];
    for (let l = 0; l < model.parts; l++) layers.push((model.layers[l] || []).slice(0, model.measures).map((m) => m || []));
    const x0 = o.showTime ? X0 : 34;
    const geo = { measures: [], ev: layers.map(() => []) };
    const plans = layers.map((L) => L.map((events) => beamPlan(events, info)));
    let x = x0, s = '';
    // ---------- horizontal layout: one position for every moment either part starts a note ----------
    for (let m = 0; m < model.measures; m++) {
      const times = new Set([0, info.len]);
      const dotted = new Set(), flagged = new Set();
      plans.forEach((P, l) => {
        let end = 0;
        P[m].list.forEach((n) => {
          times.add(n.t);
          if (n.e.d) dotted.add(n.t);
          // A flag on a stem-up note reaches to the right, so it needs a little more room.
          if (!n.e.r && n.e.v >= 3 && !P[m].inBeam.has(n.i) && partPos(l, two).up) flagged.add(n.t);
          end = n.t + n.d;
        });
        times.add(end);
      });
      const ts = [...times].sort((a, b) => a - b);
      const seg = ts.slice(0, -1).map((t, k) => spacing(ts[k + 1] - t) + (dotted.has(t) ? 6 : 0) + (flagged.has(t) ? 6 : 0));
      const content = seg.reduce((a, b) => a + b, 0);
      const nominal = o.measureW ? o.measureW - PAD_L - PAD_R : (info.len / 6) * 24;
      const k = Math.max(1, nominal / content);
      const xs = new Map();
      let at = x + PAD_L;
      ts.forEach((t, j) => { xs.set(t, at); if (j < seg.length) at += seg[j] * k; });
      const end = at + PAD_R;
      geo.measures.push({ x0: x, x1: end, xs, ts });
      x = end;
    }
    const W = x + 8;
    const xOf = (m, t) => {
      const g = geo.measures[m];
      if (g.xs.has(t)) return g.xs.get(t);
      let lo = 0, hi = g.ts.length - 1;
      g.ts.forEach((u, j) => { if (u <= t) lo = j; });
      hi = Math.min(g.ts.length - 1, lo + 1);
      const a = g.ts[lo], b = g.ts[hi];
      return b === a ? g.xs.get(a) : g.xs.get(a) + ((t - a) / (b - a)) * (g.xs.get(b) - g.xs.get(a));
    };
    geo.xOf = xOf;

    // ---------- measure backgrounds (screen only): clicking, the playing highlight, marks ----------
    const barH = two ? 17 : 13;
    if (!o.print) {
      geo.measures.forEach((g, m) => {
        const marks = o.marks ? o.marks.map((pm) => pm[m]) : null;
        const cls = ['r-meas',
          o.playing === m ? 'is-playing' : '',
          o.editing && o.caret && o.caret.m === m ? 'is-cur' : '',
          marks ? (marks.every(Boolean) ? 'is-right' : 'is-wrong') : ''].filter(Boolean).join(' ');
        s += `<rect class="${cls}" data-m="${m}" x="${r1(g.x0 + 1)}" y="4" width="${r1(g.x1 - g.x0 - 2)}" height="${H - 8}" rx="6"/>`;
      });
    }
    // ---------- staff line, clef, time signature, bar lines, measure numbers ----------
    s += lineSVG(4, LINE, W - 3, LINE, 1.1);
    s += rectSVG(12, LINE - 9, 3.4, 18) + rectSVG(19, LINE - 9, 3.4, 18);
    if (o.showTime) {
      s += `<text class="clabel r-tsig" x="40" y="${LINE - 2.5}" font-size="21" text-anchor="middle" fill="currentColor">${info.n}</text>`;
      s += `<text class="clabel r-tsig" x="40" y="${LINE + 17.5}" font-size="21" text-anchor="middle" fill="currentColor">${info.d}</text>`;
    }
    geo.measures.forEach((g, m) => {
      s += `<text class="r-mnum" x="${r1(g.x0 + 4)}" y="12" font-size="9.5" fill="currentColor">${o.first + m + 1}</text>`;
      if (m < model.measures - 1) s += lineSVG(g.x1, LINE - barH, g.x1, LINE + barH, 1.1);
    });
    s += lineSVG(W - 11, LINE - barH, W - 11, LINE + barH, 1.1) + rectSVG(W - 8, LINE - barH, 3.6, barH * 2);

    // ---------- each part's notes ----------
    layers.forEach((L, l) => {
      const pos = partPos(l, two);
      const up = pos.up;
      L.forEach((events, m) => {
        const g = geo.measures[m];
        const trips = MQ.tripletGroups(events, info);
        const st = MQ.measureState(events, info);
        const badAt = new Set();
        st.bad.forEach((tg) => { if (!tg.finishable || st.full) for (let i = tg.from; i <= tg.to; i++) badAt.add(i); });
        const mark = o.marks && o.marks[l] ? (o.marks[l][m] ? ' is-right' : ' is-wrong') : '';
        const dim = o.editing && two && l !== o.active ? ' is-dim' : '';
        const { list, beamed, inBeam } = plans[l][m];
        list.forEach((n) => { n.hx = xOf(m, n.t) + RX + 1; });
        geo.ev[l][m] = list.map((n) => ({ x: n.hx, t: n.t }));
        // A measure of silence is a whole rest in the middle of the bar, whatever the meter.
        const barRest = events.length === 1 && events[0].r && list[0].d === info.len;
        const stemEnd = (n) => pos.head + (up ? -1 : 1) * (STEM + (!inBeam.has(n.i) && n.e.v === 4 ? 5 : 0));
        const stemX = (n) => n.hx + (up ? 5.7 : -5.7);
        list.forEach((n) => {
          const e = n.e;
          const sel = o.sel && o.sel.l === l && o.sel.m === m && o.sel.i === n.i;
          const cls = 'r-ev' + (sel && !o.print ? ' is-sel' : '') + (badAt.has(n.i) ? ' is-bad' : '') + mark + dim;
          let body = '';
          if (e.r) {
            const rx = barRest ? (g.x0 + g.x1) / 2 : n.hx;
            body += restSVG(barRest ? 0 : e.v, rx, pos);
            if (e.d && !barRest) body += dotSVG(rx + (e.v <= 1 ? 10 : 8), e.v <= 1 ? (e.v === 0 ? pos.wholeTop + 2.5 : pos.halfBottom - 2.5) : pos.rest - 3);
          } else {
            body += headSVG(e.v, n.hx, pos.head);
            if (e.v >= 1) body += lineSVG(stemX(n), pos.head + (up ? -1.5 : 1.5), stemX(n), stemEnd(n), 1.3);
            if (e.v >= 3 && !inBeam.has(n.i)) body += flagsSVG(stemX(n) + (up ? -0.6 : 0.6), stemEnd(n), up, e.v - 2);
            if (e.d) body += dotSVG(n.hx + (e.v === 0 ? 12 : 10.5), pos.dot);
          }
          const next = list[n.i + 1];
          const right = next ? next.hx - RX - 2 : Math.max(n.hx + RX + 8, xOf(m, n.t + n.d) - 2);
          const hit = o.print ? '' : `<rect class="r-hit" x="${r1(n.hx - RX - 3)}" y="${two ? (up ? 6 : LINE) : 6}" width="${r1(Math.max(16, right - n.hx + RX + 3))}" height="${two ? LINE - 6 : H - 12}"/>`;
          s += `<g class="${cls}" data-l="${l}" data-m="${m}" data-i="${n.i}">${hit}${body}</g>`;
        });
        // ---------- beams ----------
        beamed.forEach((grp) => {
          const cls = grp.some((n) => badAt.has(n.i)) ? ' is-bad' : '';
          let b = '';
          const y0 = pos.head + (up ? -STEM : STEM - BEAM);
          const a = stemX(grp[0]) - 0.65, z = stemX(grp[grp.length - 1]) + 0.65;
          b += rectSVG(a, y0, z - a, BEAM);
          const y1 = y0 + (up ? BEAM_STEP : -BEAM_STEP);
          // Sixteenths get a second beam; a lone one gets a short stub pointing into the group.
          for (let j = 0; j < grp.length; j++) {
            if (grp[j].e.v !== 4) continue;
            let k = j;
            while (k + 1 < grp.length && grp[k + 1].e.v === 4) k++;
            if (k > j) b += rectSVG(stemX(grp[j]) - 0.65, y1, stemX(grp[k]) - stemX(grp[j]) + 1.3, BEAM);
            else {
              const left = j > 0;
              const sx = stemX(grp[j]);
              b += rectSVG(left ? sx - 8 : sx - 0.65, y1, 8.65, BEAM);
            }
            j = k;
          }
          s += `<g class="r-beam${cls}${mark}${dim}">${b}</g>`;
        });
        // ---------- triplet numbers and brackets ----------
        trips.forEach((tg) => {
          const notes = list.slice(tg.from, tg.to + 1);
          if (!notes.length) return;
          const bad = badAt.has(tg.from) ? ' is-bad' : '';
          const grp = beamed.find((b) => b[0].i === tg.from && b[b.length - 1].i === tg.to);
          const xa = notes[0].hx - RX, xb = notes[notes.length - 1].hx + RX;
          const mid = grp ? (stemX(grp[0]) + stemX(grp[grp.length - 1])) / 2 : (xa + xb) / 2;
          const ny = up ? pos.head - STEM - 3.5 : pos.head + STEM + 12;
          let b = `<text class="clabel r-trip" x="${r1(mid)}" y="${r1(ny)}" font-size="11" text-anchor="middle" fill="currentColor">3</text>`;
          if (!grp) {
            const by = up ? ny - 4 : ny - 4.5, hook = up ? 4 : -4;
            b += lineSVG(xa, by + hook, xa, by, 0.9) + lineSVG(xa, by, mid - 6, by, 0.9) + lineSVG(mid + 6, by, xb, by, 0.9) + lineSVG(xb, by, xb, by + hook, 0.9);
          }
          s += `<g class="r-tripg${bad}${mark}${dim}">${b}</g>`;
        });
      });
    });

    // ---------- the caret: where the next note goes ----------
    if (o.editing && o.caret && !o.sel && layers[o.active]) {
      const cx = caretX(geo, layers, info, o.active, o.caret.m, o.caret.i);
      const pos = partPos(o.active, two);
      const y1 = two ? (pos.up ? 10 : LINE - 2) : 18, y2 = two ? (pos.up ? LINE + 2 : H - 6) : LINE + 16;
      s += `<g class="r-caret">${lineSVG(cx, y1, cx, y2, 2)}<path d="M${r1(cx - 4.5)} ${y1 - 1}h9l-4.5 5z" fill="currentColor"/></g>`;
    }
    return { inner: s, W, H, geo, info };
  }
  function caretX(geo, layers, info, l, m, i) {
    const g = geo.measures[m];
    const list = geo.ev[l][m] || [];
    if (i < list.length) return list[i].x - RX - 4;
    if (!list.length) return g.x0 + PAD_L - 5;
    const end = MQ.rhythmTotal(layers[l][m]);
    return Math.min(g.x1 - 4, Math.max(list[list.length - 1].x + RX + 8, geo.xOf(m, Math.min(end, info.len)) - 2));
  }
  // A standalone picture, for printing: {svg, markup, wIn, hIn}.
  function rhythmArt(model, opts) {
    const o = Object.assign({ print: true }, opts);
    const b = build(model, o);
    const markup = `<svg xmlns="${NS}" class="rstaff" viewBox="0 0 ${r1(b.W)} ${b.H}" width="${r1(b.W)}" height="${b.H}" style="color:#000">${b.inner}</svg>`;
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    const hIn = (o.heightIn || 1) * (model.parts > 1 ? 1.25 : 1);
    return { svg, markup, wIn: (b.W / b.H) * hIn, hIn };
  }

  // ---------- small pictures for the note buttons ----------
  function icon(kind) {
    let s = '';
    if (kind === 'dot') s = dotSVG(12, 14).replace('r="1.9"', 'r="3"');
    else if (kind === 'triplet') s = `<text x="12" y="19" font-size="15" font-weight="700" font-style="italic" text-anchor="middle" fill="currentColor" font-family="Georgia, serif">3</text><path d="M3 9V5h6M15 5h6v4" fill="none" stroke="currentColor" stroke-width="1.3"/>`;
    else if (kind === 'rest') s = `<path transform="translate(12 13) scale(0.85)" fill="currentColor" d="${QREST}"/>`;
    else {
      const v = NAMES.indexOf(kind);
      s = headSVG(v, v === 0 ? 12 : 9, 20);
      if (v >= 1) s += lineSVG(9 + 5.7, 18.5, 9 + 5.7, 1.5, 1.3);
      if (v >= 3) s += flagsSVG(9 + 5.1, 1.5, true, v - 2);
    }
    return `<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true">${s}</svg>`;
  }

  // ---------- the interactive staff ----------
  class RhythmStaff {
    // opts: {meter, measures, parts, layers, readOnly, active, marks, onChange(layers), onMove()}
    constructor(host, opts) {
      this.o = Object.assign({ readOnly: false, active: 0, marks: null, onChange: null, onMove: null }, opts);
      this.model = { meter: this.o.meter, measures: this.o.measures, parts: this.o.parts || 1, layers: copyLayers(this.o.layers, this.o.parts || 1) };
      this.active = Math.min(this.o.active || 0, this.model.parts - 1);
      this.caret = { m: 0, i: 0 };
      this.sel = null;
      this.playing = -1;
      // Start writing where the rhythm stops: the first measure that isn't full.
      if (!this.o.readOnly) this.caretToEnd();
      const svg = (this.svg = document.createElementNS(NS, 'svg'));
      svg.setAttribute('class', 'rstaff' + (this.o.readOnly ? ' is-readonly' : ''));
      svg.setAttribute('role', this.o.readOnly ? 'img' : 'application');
      if (!this.o.readOnly) svg.setAttribute('tabindex', '0');
      host.append(svg);
      if (!this.o.readOnly) this.bind();
      this.render();
    }
    info() { return MQ.rhythmMeter(this.model.meter); }
    layers() { return copyLayers(this.model.layers, this.model.parts); }
    caretToEnd() {
      const info = this.info(), L = this.model.layers[this.active];
      let m = 0;
      while (m < this.model.measures - 1 && MQ.rhythmTotal(L[m]) >= info.len) m++;
      this.caret = { m, i: L[m].length };
    }
    render() {
      const b = build(this.model, {
        caret: this.o.readOnly ? null : this.caret, sel: this.sel, active: this.active, marks: this.o.marks,
        playing: this.playing, editing: !this.o.readOnly,
      });
      this.geo = b.geo;
      this.svg.setAttribute('viewBox', `0 0 ${r1(b.W)} ${b.H}`);
      this.svg.style.minWidth = Math.round(b.W * 0.78) + 'px';
      this.svg.style.maxWidth = Math.round(b.W * 1.5) + 'px';
      this.svg.innerHTML = b.inner;
      this.svg.setAttribute('aria-label', this.describe(b.info));
    }
    describe(info) {
      const what = (e) => `${e.t ? 'triplet ' : ''}${e.d ? 'dotted ' : ''}${NAMES[e.v]} ${e.r ? 'rest' : 'note'}`;
      const parts = this.model.layers.slice(0, this.model.parts).map((L, l) => {
        const bars = L.slice(0, this.model.measures).map((m, k) => `measure ${k + 1}: ${m.length ? m.map(what).join(', ') : 'empty'}`).join('; ');
        return (this.model.parts > 1 ? (l ? 'Stems down part — ' : 'Stems up part — ') : '') + bars;
      });
      const how = this.o.readOnly ? '' : ` Writing in measure ${this.caret.m + 1}. Choose a note value to add it; W, H, Q, E and S also add notes, R, period and T switch rests, dots and triplets, arrow keys move, Backspace deletes.`;
      return `One-line rhythm staff in ${info.label}, ${this.model.measures} measure${this.model.measures > 1 ? 's' : ''}. ${parts.join('. ')}.${how}`;
    }
    changed() {
      this.render();
      if (this.o.onChange) this.o.onChange(this.layers());
      if (this.o.onMove) this.o.onMove();
    }
    moved() { this.render(); if (this.o.onMove) this.o.onMove(); }
    focus() { try { this.svg.focus({ preventScroll: true }); } catch (e) { /* not focusable */ } }

    // ---------- editing ----------
    // Adds ev at the caret, or puts it in place of the selected note. Returns a message when it can't.
    enter(ev) {
      const info = this.info(), l = this.active, L = this.model.layers[l];
      const replace = !!(this.sel && this.sel.l === l);
      let m = replace ? this.sel.m : this.caret.m, i = replace ? this.sel.i : this.caret.i;
      let next = L[m].slice();
      next.splice(i, replace ? 1 : 0, ev);
      let prob = MQ.rhythmEditProblem(L[m], next, info);
      // At the end of a full measure, carry on in the next one.
      if (prob && prob.kind === 'over' && !replace && i === L[m].length && MQ.rhythmTotal(L[m]) >= info.len && m + 1 < this.model.measures) {
        m += 1; i = L[m].length;
        next = L[m].concat([ev]);
        prob = MQ.rhythmEditProblem(L[m], next, info);
      }
      if (prob) {
        if (prob.kind !== 'over') return prob.text;
        const room = info.len - MQ.rhythmTotal(L[m]) + (replace ? MQ.rhythmDur(L[m][i]) : 0);
        return room > 0 ? `That’s too long — measure ${m + 1} has room for ${MQ.rhythmAmount(room, info)}.`
          : `Measure ${m + 1} is full. Select a note to change it, or delete one.`;
      }
      L[m] = next;
      this.sel = null;
      this.caret = { m, i: i + 1 };
      // A full measure moves the caret on to the next one.
      if (this.caret.i === next.length && MQ.rhythmTotal(next) === info.len && m + 1 < this.model.measures) {
        this.caret = { m: m + 1, i: L[m + 1].length };
      }
      this.changed();
      return null;
    }
    remove(back) {
      const L = this.model.layers[this.active];
      if (this.sel && this.sel.l === this.active) {
        const { m, i } = this.sel;
        L[m].splice(i, 1);
        this.sel = null;
        this.caret = { m, i };
        this.changed();
        return true;
      }
      let { m, i } = this.caret;
      if (back) {
        if (i === 0 && m > 0 && !L[m].length) { m -= 1; i = L[m].length; }
        if (i === 0) return false;
        L[m].splice(i - 1, 1);
        this.caret = { m, i: i - 1 };
      } else {
        if (i >= L[m].length) return false;
        L[m].splice(i, 1);
      }
      this.changed();
      return true;
    }
    clearMeasure() {
      const L = this.model.layers[this.active], m = this.sel ? this.sel.m : this.caret.m;
      if (!L[m].length) return false;
      L[m] = [];
      this.sel = null;
      this.caret = { m, i: 0 };
      this.changed();
      return true;
    }
    setActive(l) {
      if (l === this.active || l >= this.model.parts) return;
      this.active = l;
      const m = this.sel ? this.sel.m : this.caret.m;
      this.sel = null;
      this.caret = { m, i: this.model.layers[l][m].length };
      this.moved();
    }
    move(dir) {
      const L = this.model.layers[this.active];
      let { m, i } = this.sel ? { m: this.sel.m, i: this.sel.i + (dir > 0 ? 1 : 0) } : this.caret;
      if (!this.sel) {
        if (dir > 0) { if (i < L[m].length) i++; else if (m + 1 < this.model.measures) { m++; i = 0; } }
        else if (i > 0) i--;
        else if (m > 0) { m--; i = L[m].length; }
      }
      this.sel = null;
      this.caret = { m, i };
      this.moved();
    }
    select(l, m, i) {
      if (l !== this.active) this.active = l;
      this.sel = { l, m, i };
      this.caret = { m, i: i + 1 };
      this.moved();
    }
    // The measure being played gets a highlight, without redrawing anything else.
    setPlaying(m) {
      this.playing = m;
      this.svg.querySelectorAll('.r-meas').forEach((el) => el.classList.toggle('is-playing', +el.dataset.m === m));
    }
    pt(cx, cy) {
      const k = this.svg.getScreenCTM();
      if (!k) return { x: -1, y: -1 };
      const p = new DOMPoint(cx, cy).matrixTransform(k.inverse());
      return { x: p.x, y: p.y };
    }
    bind() {
      this.svg.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        const hit = e.target.closest && e.target.closest('.r-ev');
        if (hit) {
          e.preventDefault();
          this.focus();
          this.select(+hit.dataset.l, +hit.dataset.m, +hit.dataset.i);
          return;
        }
        const p = this.pt(e.clientX, e.clientY);
        const m = this.geo.measures.findIndex((g) => p.x >= g.x0 && p.x < g.x1);
        if (m < 0) return;
        e.preventDefault();
        this.focus();
        // In a two-part staff, clicking above or below the line picks the part.
        if (this.model.parts > 1) this.active = p.y < LINE ? 0 : 1;
        const list = this.geo.ev[this.active][m] || [];
        let i = list.length;
        for (let j = 0; j < list.length; j++) if (p.x < list[j].x) { i = j; break; }
        this.sel = null;
        this.caret = { m, i };
        this.moved();
      });
    }
  }
  function copyLayers(layers, parts) {
    const out = [];
    for (let l = 0; l < Math.max(1, parts); l++) {
      const L = (layers && layers[l]) || [];
      const c = [];
      for (let m = 0; m < 4; m++) c.push((L[m] || []).map(MQ.rhythmEvent));
      out.push(c);
    }
    return out;
  }

  Object.assign(MQ, { RhythmStaff, rhythmArt, rhythmIcon: icon, rhythmMarkup: build });
})(window);
