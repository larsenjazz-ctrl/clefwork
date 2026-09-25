/* Clefwork Melody — the staff students and teachers write melodies on: five lines, a treble or bass
   clef, the key signature, and up to eight measures, four to a line. Notes have pitches: ledger
   lines, accidentals (shown only where the key signature and earlier notes in the measure don't
   already say so), stems that turn down from the middle line, and beams. Editing works as on the
   rhythm staff — a caret, a selected note to replace — plus pitch: click where the next note goes,
   drag a note up or down, or use the arrow keys and ♯ ♭ ♮. Drawn with plain shapes so it prints. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const NS = 'http://www.w3.org/2000/svg';
  const { RX, STEM, BEAM, BEAM_STEP, PAD_L, PAD_R, r1, headSVG, lineSVG, rectSVG, dotSVG, flagsSVG, restSVG, spacing, beamPlan, NAMES } = MQ.rhythmDraw;
  const HALF = 5, TOP = 46, SYS_H = 138;               // a staff space is 10; one line of music is SYS_H tall
  const MID = TOP + 20, BOT = TOP + 40;                 // the middle and bottom lines, within a system
  const ACC_SCALE = 0.85, ACC_W = 11;
  const bottomOf = (clef) => MQ.CLEFS[clef === 'bass' ? 'bass' : 'treble'].bottom;

  // The accidental each note shows: only what the key signature, and earlier notes on the same line
  // or space in this measure, don't already give it.
  function shownAccidentals(events, alts) {
    const cur = {};
    return events.map((e) => {
      if (e.r || !e.p) return null;
      const d = MQ.dia(e.p);
      const was = d in cur ? cur[d] : alts[e.p.step];
      cur[d] = e.p.alt;
      return e.p.alt === was ? null : e.p.alt;
    });
  }
  const accSVG = (alt, x, y) => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${ACC_SCALE})">${MQ.ACC_SVG[alt]}</g>`;

  // ---------- the picture ----------
  // model: {meter, measures, layers: [[measure…]], key {fifths, mode}, clef}. opts as for the rhythm
  // staff (caret, sel, marks, playing, editing, print, measureW, first, showTime), plus perLine and
  // cursor (a pitch to show at the caret: where the next note goes).
  function build(model, opts) {
    const o = Object.assign({ print: false, first: 0, showTime: true, measureW: null, caret: null, sel: null, marks: null, playing: -1, editing: false, perLine: 4, cursor: null }, opts);
    const info = MQ.rhythmMeter(model.meter);
    const K = MQ.melodyKey(model.key);
    const clef = model.clef === 'bass' ? 'bass' : 'treble', bottom = bottomOf(clef);
    const events = (model.layers[0] || []).slice(0, model.measures).map((m) => m || []);
    const posOf = (p) => MQ.dia(p) - bottom;
    const plans = events.map((ev) => beamPlan(ev, info));
    const accs = events.map((ev) => shownAccidentals(ev, K.alts));
    const nSys = Math.ceil(model.measures / o.perLine);
    const ksW = Math.abs(K.fifths) * 9 + (K.fifths ? 8 : 0);
    const headW = (k) => 38 + ksW + (k === 0 && o.showTime ? 28 : 0) + 6;
    // ---------- widths: one position for every moment a note starts ----------
    const natural = events.map((ev, m) => {
      const P = plans[m];
      const times = new Set([0, info.len]);
      const extra = new Map();
      P.list.forEach((n) => {
        times.add(n.t);
        let x = n.e.d ? 6 : 0;
        if (!n.e.r && n.e.v >= 3 && !P.inBeam.has(n.i)) x += 6;          // a flag reaching right
        if (accs[m][n.i] != null) x += ACC_W;                             // an accidental in front
        extra.set(n.t, Math.max(extra.get(n.t) || 0, x));
      });
      const end = MQ.rhythmTotal(ev);
      times.add(end);
      const ts = [...times].sort((a, b) => a - b);
      const seg = ts.slice(0, -1).map((t, k) => spacing(ts[k + 1] - t) + (extra.get(t) || 0));
      const content = seg.reduce((a, b) => a + b, 0);
      const nominal = o.measureW ? o.measureW - PAD_L - PAD_R : (info.len / 6) * 24;
      return { ts, seg, width: Math.max(content, nominal) + PAD_L + PAD_R, content };
    });
    const sysMeasures = [];
    for (let k = 0; k < nSys; k++) sysMeasures.push(Array.from({ length: Math.min(o.perLine, model.measures - k * o.perLine) }, (_, j) => k * o.perLine + j));
    // Every line is as wide as the widest, its measures stretched to fill it.
    const W = Math.max(...sysMeasures.map((ms, k) => headW(k) + ms.reduce((t, m) => t + natural[m].width, 0))) + 10;
    const H = nSys * SYS_H;
    const geo = { measures: [], ev: [[]], W, H, systems: [] };
    sysMeasures.forEach((ms, k) => {
      const sy = k * SYS_H;
      const x0 = headW(k);
      const total = ms.reduce((t, m) => t + natural[m].width, 0);
      const stretch = (W - 10 - x0) / total;
      let x = x0;
      geo.systems.push({ y0: sy, y1: sy + SYS_H, x0 });
      ms.forEach((m) => {
        const nat = natural[m], w = nat.width * stretch;
        const inner = w - PAD_L - PAD_R;
        const k2 = inner / Math.max(1, nat.content);
        const xs = new Map();
        let at = x + PAD_L;
        nat.ts.forEach((t, j) => { xs.set(t, at); if (j < nat.seg.length) at += nat.seg[j] * Math.max(1, k2); });
        geo.measures[m] = { x0: x, x1: x + w, xs, ts: nat.ts, sys: k, sy };
        x += w;
      });
    });
    const xOf = (m, t) => {
      const g = geo.measures[m];
      if (g.xs.has(t)) return g.xs.get(t);
      let lo = 0;
      g.ts.forEach((u, j) => { if (u <= t) lo = j; });
      const hi = Math.min(g.ts.length - 1, lo + 1), a = g.ts[lo], b = g.ts[hi];
      return b === a ? g.xs.get(a) : g.xs.get(a) + ((t - a) / (b - a)) * (g.xs.get(b) - g.xs.get(a));
    };
    geo.xOf = xOf;
    let s = '';
    // ---------- measure backgrounds: clicking, the playing highlight, marks ----------
    if (!o.print) {
      geo.measures.forEach((g, m) => {
        const pm = o.marks && o.marks.side === 'got' ? o.marks.parts[0].measures[m] : null;
        const cls = ['r-meas', o.playing === m ? 'is-playing' : '', o.editing && o.caret && o.caret.m === m ? 'is-cur' : '', pm ? (pm.ok ? 'is-right' : 'is-wrong') : ''].filter(Boolean).join(' ');
        s += `<rect class="${cls}" data-m="${m}" x="${r1(g.x0 + 1)}" y="${g.sy + 4}" width="${r1(g.x1 - g.x0 - 2)}" height="${SYS_H - 8}" rx="6"/>`;
      });
    }
    // ---------- staff lines, clef, key signature, time signature, bar lines ----------
    sysMeasures.forEach((ms, k) => {
      const sy = k * SYS_H;
      for (let i = 0; i < 5; i++) s += lineSVG(4, sy + TOP + i * 10, W - 3, sy + TOP + i * 10, 1);
      s += `<g class="clef" transform="translate(8 ${sy + BOT}) scale(0.8333) translate(-8 ${-(sy + BOT)})">${MQ.clefSVG(clef, sy + BOT, 8)}</g>`;
      MQ.keySigDias(K.fifths, clef).forEach((d, j) => { s += accSVG(K.fifths > 0 ? 1 : -1, 44 + j * 9, sy + BOT - (d - bottom) * HALF); });
      if (k === 0 && o.showTime) {
        const tx = 44 + ksW + 10;
        s += `<text class="clabel r-tsig" x="${tx}" y="${sy + MID - 1}" font-size="22" text-anchor="middle" fill="currentColor">${info.n}</text>`;
        s += `<text class="clabel r-tsig" x="${tx}" y="${sy + BOT - 1}" font-size="22" text-anchor="middle" fill="currentColor">${info.d}</text>`;
      }
      s += lineSVG(4, sy + TOP, 4, sy + BOT, 1);
      ms.forEach((m, j) => {
        const g = geo.measures[m];
        s += `<text class="r-mnum" x="${r1(g.x0 + 4)}" y="${sy + 14}" font-size="9.5" fill="currentColor">${o.first + m + 1}</text>`;
        const last = m === model.measures - 1;
        if (!last) s += lineSVG(g.x1, sy + TOP, g.x1, sy + BOT, 1);
        else s += lineSVG(g.x1 - 7, sy + TOP, g.x1 - 7, sy + BOT, 1) + rectSVG(g.x1 - 4, sy + TOP, 3.6, 40);
        if (!last && j === ms.length - 1) { /* the line ends at its bar line */ }
      });
    });

    // ---------- the notes ----------
    events.forEach((evs, m) => {
      const g = geo.measures[m], sy = g.sy;
      const { list, beamed, inBeam } = plans[m];
      const st = MQ.measureState(evs, info);
      const badAt = new Set();
      st.bad.forEach((tg) => { if (!tg.finishable || st.full) for (let i = tg.from; i <= tg.to; i++) badAt.add(i); });
      const pm = o.marks && o.marks.parts[0] && o.marks.parts[0].measures[m];
      const flags = pm ? pm[o.marks.side] : null;
      const wrongCls = o.marks && o.marks.side === 'want' ? ' is-missed' : ' is-wrong';
      const markOf = (i) => (!flags || flags[i] == null ? '' : flags[i] ? (o.marks.side === 'got' ? ' is-right' : '') : wrongCls);
      list.forEach((n) => {
        n.acc = accs[m][n.i];
        n.hx = xOf(m, n.t) + (n.acc != null ? ACC_W : 0) + RX + 1;
        if (!n.e.r) { n.pos = posOf(n.e.p); n.hy = sy + BOT - n.pos * HALF; }
      });
      geo.ev[0][m] = list.map((n) => ({ x: n.hx, t: n.t }));
      // Stems turn down from the middle line; a beamed group follows its note farthest from it.
      const dirOf = (grp) => {
        const notes = grp.filter((n) => !n.e.r);
        if (!notes.length) return true;
        const above = Math.max(...notes.map((n) => n.pos - 4)), below = Math.max(...notes.map((n) => 4 - n.pos));
        return below > above;
      };
      const stemEnd = (n, up) => (up ? Math.min(n.hy - STEM, sy + MID) : Math.max(n.hy + STEM, sy + MID)) + (up ? -1 : 1) * (!inBeam.has(n.i) && n.e.v === 4 ? 5 : 0);
      list.forEach((n) => { n.up = inBeam.has(n.i) ? null : dirOf([n]); });
      beamed.forEach((grp) => {
        const up = dirOf(grp);
        const y = up ? Math.min(...grp.map((n) => stemEnd(n, true))) : Math.max(...grp.map((n) => stemEnd(n, false)));
        grp.forEach((n) => { n.up = up; n.beamY = y; });
      });
      const stemX = (n) => n.hx + (n.up ? 5.7 : -5.7);
      const barRest = evs.length === 1 && evs[0].r && list[0].d === info.len;
      const restPos = { rest: sy + MID, wholeTop: sy + TOP + 10, halfBottom: sy + MID };
      list.forEach((n) => {
        const e = n.e;
        const sel = o.sel && o.sel.m === m && o.sel.i === n.i;
        const cls = 'r-ev' + (sel && !o.print ? ' is-sel' : '') + (badAt.has(n.i) ? ' is-bad' : '') + markOf(n.i);
        let body = '';
        if (e.r) {
          const rx = barRest ? (g.x0 + g.x1) / 2 : n.hx;
          body += restSVG(barRest ? 0 : e.v, rx, restPos);
          if (e.d && !barRest) body += dotSVG(rx + (e.v <= 1 ? 10 : 8), sy + MID - (e.v <= 1 ? 5 : 3));
        } else {
          // Ledger lines above and below the staff.
          for (let L = -2; L >= n.pos; L -= 2) body += lineSVG(n.hx - 11, sy + BOT - L * HALF, n.hx + 11, sy + BOT - L * HALF, 1.3);
          for (let L = 10; L <= n.pos; L += 2) body += lineSVG(n.hx - 11, sy + BOT - L * HALF, n.hx + 11, sy + BOT - L * HALF, 1.3);
          if (n.acc != null) body += accSVG(n.acc, n.hx - RX - 9 - (n.acc === -2 ? 4 : 0), n.hy);
          body += headSVG(e.v, n.hx, n.hy);
          if (e.v >= 1) {
            const end = inBeam.has(n.i) ? n.beamY : stemEnd(n, n.up);
            body += lineSVG(stemX(n), n.hy + (n.up ? -1.5 : 1.5), stemX(n), end, 1.3);
            if (e.v >= 3 && !inBeam.has(n.i)) body += flagsSVG(stemX(n) + (n.up ? -0.6 : 0.6), end, n.up, e.v - 2);
          }
          if (e.d) body += dotSVG(n.hx + (e.v === 0 ? 12 : 10.5), n.hy - (n.pos % 2 === 0 ? HALF : 0));
        }
        const next = list[n.i + 1];
        const right = next ? next.hx - RX - 2 - (next.acc != null ? ACC_W : 0) : Math.max(n.hx + RX + 8, xOf(m, n.t + n.d) - 2);
        const hit = o.print ? '' : `<rect class="r-hit" x="${r1(n.hx - RX - 3)}" y="${sy + TOP - 30}" width="${r1(Math.max(16, right - n.hx + RX + 3))}" height="100"/>`;
        s += `<g class="${cls}" data-l="0" data-m="${m}" data-i="${n.i}">${hit}${body}</g>`;
      });
      // ---------- beams ----------
      beamed.forEach((grp) => {
        const up = grp[0].up, y0 = up ? grp[0].beamY : grp[0].beamY - BEAM;
        const a = stemX(grp[0]) - 0.65, z = stemX(grp[grp.length - 1]) + 0.65;
        let b = rectSVG(a, y0, z - a, BEAM);
        const y1 = y0 + (up ? BEAM_STEP : -BEAM_STEP);
        for (let j = 0; j < grp.length; j++) {
          if (grp[j].e.v !== 4) continue;
          let k = j;
          while (k + 1 < grp.length && grp[k + 1].e.v === 4) k++;
          if (k > j) b += rectSVG(stemX(grp[j]) - 0.65, y1, stemX(grp[k]) - stemX(grp[j]) + 1.3, BEAM);
          else { const sx = stemX(grp[j]); b += rectSVG(j > 0 ? sx - 8 : sx - 0.65, y1, 8.65, BEAM); }
          j = k;
        }
        const all = grp.map((n) => flags && flags[n.i]).filter((x) => x != null);
        const gm = !all.length ? '' : all.every(Boolean) ? markOf(grp[0].i) : all.every((x) => !x) ? wrongCls : '';
        s += `<g class="r-beam${grp.some((n) => badAt.has(n.i)) ? ' is-bad' : ''}${gm}">${b}</g>`;
      });
      // ---------- triplets: the number on the stem side ----------
      MQ.tripletGroups(evs, info).forEach((tg) => {
        const notes = list.slice(tg.from, tg.to + 1);
        if (!notes.length) return;
        const pitched = notes.filter((n) => !n.e.r);
        const up = pitched.length ? pitched[0].up !== false : true;
        const ends = pitched.map((n) => (inBeam.has(n.i) ? n.beamY : n.e.v >= 1 ? stemEnd(n, n.up) : n.hy));
        const grp = beamed.find((b) => b[0].i === tg.from && b[b.length - 1].i === tg.to);
        const xa = notes[0].hx - RX, xb = notes[notes.length - 1].hx + RX;
        const mid = grp ? (stemX(grp[0]) + stemX(grp[grp.length - 1])) / 2 : (xa + xb) / 2;
        const ny = up ? Math.min(sy + TOP - 6, ...ends.map((y) => y - 5)) : Math.max(sy + BOT + 14, ...ends.map((y) => y + 13));
        let b = `<text class="clabel r-trip" x="${r1(mid)}" y="${r1(ny)}" font-size="11" text-anchor="middle" fill="currentColor">3</text>`;
        if (!grp) {
          const by = ny - 4, hook = up ? 4 : -4;
          b += lineSVG(xa, by + hook, xa, by, 0.9) + lineSVG(xa, by, mid - 6, by, 0.9) + lineSVG(mid + 6, by, xb, by, 0.9) + lineSVG(xb, by, xb, by + hook, 0.9);
        }
        s += `<g class="r-tripg${badAt.has(tg.from) ? ' is-bad' : ''}">${b}</g>`;
      });
    });

    // ---------- the caret, and where the next note will go ----------
    if (o.editing && o.caret && !o.sel) {
      const g = geo.measures[o.caret.m];
      const list = geo.ev[0][o.caret.m] || [];
      let cx;
      if (o.caret.i < list.length) cx = list[o.caret.i].x - RX - 4 - (accs[o.caret.m][o.caret.i] != null ? ACC_W : 0);
      else if (!list.length) cx = g.x0 + PAD_L - 5;
      else cx = Math.min(g.x1 - 4, Math.max(list[list.length - 1].x + RX + 8, xOf(o.caret.m, Math.min(MQ.rhythmTotal(events[o.caret.m]), info.len)) - 2));
      s += `<g class="r-caret">${lineSVG(cx, g.sy + TOP - 14, cx, g.sy + BOT + 14, 2)}<path d="M${r1(cx - 4.5)} ${g.sy + TOP - 15}h9l-4.5 5z" fill="currentColor"/>`;
      if (o.cursor) {
        const y = g.sy + BOT - posOf(o.cursor) * HALF;
        s += `<ellipse cx="${r1(cx + 9)}" cy="${r1(y)}" rx="5.4" ry="3.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.6"/>`;
      }
      s += '</g>';
    }
    return { inner: s, W, H, geo, info };
  }

  // A standalone picture, for printing: {svg, markup, wIn, hIn}. Drawn clefs, since a PDF can't
  // use the music font.
  function melodyArt(model, opts) {
    const was = MQ.clefFont;
    if (opts && opts.drawnClefs) MQ.clefFont = false;
    const b = build(model, Object.assign({ print: true }, opts));
    MQ.clefFont = was;
    const markup = `<svg xmlns="${NS}" class="mstaff" viewBox="0 0 ${r1(b.W)} ${b.H}" width="${r1(b.W)}" height="${b.H}" style="color:#000">${b.inner}</svg>`;
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    const hIn = ((opts && opts.heightIn) || 1.25) * (b.H / SYS_H);
    return { svg, markup, wIn: (b.W / b.H) * hIn, hIn };
  }

  // How many empty measures fit a line `avail` pixels wide, drawn no smaller than the staff's
  // minimum scale; 0 while there's no width to measure.
  function lineFit(model, avail) {
    if (!avail) return 0;
    const info = MQ.rhythmMeter(model.meter), K = MQ.melodyKey(model.key);
    const head = 38 + Math.abs(K.fifths) * 9 + (K.fifths ? 8 : 0) + 34;
    const bar = (info.len / 6) * 24 + PAD_L + PAD_R;
    for (let n = 4; n > 1; n--) if ((head + n * bar + 10) * 0.72 <= avail) return n;
    return 1;
  }

  // ---------- the interactive staff ----------
  class MelodyStaff extends MQ.RhythmStaff {
    // opts: as RhythmStaff, plus key {fifths, mode}, clef, first (the pitch new notes start from),
    // perLine, sound (play each note as it's written or moved).
    setup() {
      this.K = MQ.melodyKey(this.o.key);
      this.clef = this.o.clef === 'bass' ? 'bass' : 'treble';
      this.cursor = null;          // a pitch picked by clicking the staff, for the next note
      this.lastAt = null;          // the note just written: arrow keys and ♯ ♭ ♮ act on it
      this.model.key = this.o.key;
      this.model.clef = this.clef;
      // As many measures a line as the space holds (up to four), from the empty-measure widths so
      // the layout doesn't jump while notes go in — redrawn when the width changes.
      this.fit = 0;
      if (!this.o.perLine && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
          const n = lineFit(this.model, this.svg.parentNode ? this.svg.parentNode.clientWidth : 0);
          if (n && n !== this.fit) { this.fit = n; this.render(); }
        }).observe(this.svg.parentNode);
      }
    }
    render() {
      const b = build(this.model, {
        caret: this.o.readOnly ? null : this.caret, sel: this.sel, marks: this.o.marks, playing: this.playing,
        editing: !this.o.readOnly, perLine: this.o.perLine || this.fit || 4, cursor: this.o.readOnly ? null : this.cursorPitch(),
      });
      this.geo = b.geo;
      this.svg.setAttribute('class', 'rstaff mstaff' + (this.o.readOnly ? ' is-readonly' : ''));
      this.svg.setAttribute('viewBox', `0 0 ${r1(b.W)} ${b.H}`);
      this.svg.style.minWidth = Math.round(b.W * 0.7) + 'px';
      this.svg.style.maxWidth = Math.round(b.W * 1.4) + 'px';
      this.svg.innerHTML = b.inner;
      this.svg.setAttribute('aria-label', this.describeMelody(b.info));
    }
    describeMelody(info) {
      const what = (e) => (e.r ? `${e.d ? 'dotted ' : ''}${NAMES[e.v]} rest` : `${MQ.fullName(e.p)} ${e.t ? 'triplet ' : ''}${e.d ? 'dotted ' : ''}${NAMES[e.v]}`);
      const bars = this.model.layers[0].slice(0, this.model.measures).map((m, k) => `measure ${k + 1}: ${m.length ? m.map(what).join(', ') : 'empty'}`).join('; ');
      const how = this.o.readOnly ? '' : ` Writing in measure ${this.caret.m + 1}. Choose a note value to add a note; letters A to G add that note, the up and down arrows move a note, and plus, minus and equals make it sharp, flat or natural.`;
      return `${this.clef === 'bass' ? 'Bass' : 'Treble'} clef staff in ${MQ.melodyKeyName(this.o.key)}, ${info.label}, ${this.model.measures} measure${this.model.measures > 1 ? 's' : ''}. ${bars}.${how}`;
    }
    // ---------- pitch ----------
    noteAt(at) { const e = at && this.model.layers[0][at.m] && this.model.layers[0][at.m][at.i]; return e && !e.r ? e : null; }
    target() { return this.sel ? this.noteAt(this.sel) : this.noteAt(this.lastAt); }
    // The pitch before the caret: the note a new one starts from.
    before() {
      const L = this.model.layers[0];
      let { m, i } = this.caret;
      for (;;) {
        for (let j = Math.min(i, L[m].length) - 1; j >= 0; j--) if (!L[m][j].r) return L[m][j].p;
        if (m === 0) return null;
        m--; i = L[m].length;
      }
    }
    defaultPitch() {
      if (this.o.first) return Object.assign({}, this.o.first);
      // The tonic nearest the middle of the staff.
      const mid = bottomOf(this.clef) + 4;
      let d = this.K.tonic.step;
      while (d + 7 <= mid + 3) d += 7;
      while (d > mid + 3) d -= 7;
      return MQ.melodyPitchAt(this.K, d);
    }
    cursorPitch() { return this.cursor || this.before() || this.defaultPitch(); }
    sound(p) { if (this.o.sound !== false && MQ.Audio && p) MQ.Audio.play([[MQ.midi(p)]], 0.6); }
    // Writes a note (or rest) of the given value: in place of the selected note, keeping its pitch,
    // or at the caret with the cursor's pitch.
    enter(ev) {
      const was = this.noteAt(this.sel);
      if (!ev.r) ev.p = Object.assign({}, was ? was.p : this.cursorPitch());
      const msg = super.enter(ev);
      if (!msg) {
        this.cursor = null;
        this.lastAt = this.enteredAt;
        if (!ev.r) this.sound(ev.p);
        this.render();
      }
      return msg;
    }
    // A note by its letter, the nearest one to the note before.
    enterLetter(step, ev) {
      const from = this.cursorPitch();
      const base = MQ.dia(from);
      let d = base - ((((base % 7) - step) % 7) + 7) % 7;
      if (base - d > 3) d += 7;
      this.cursor = MQ.melodyPitchAt(this.K, d);
      return this.enter(ev);
    }
    // Up or down by steps: the note picked, the note just written, or the cursor.
    nudge(steps) {
      const e = this.target();
      if (e) {
        e.p = MQ.melodyPitchAt(this.K, MQ.dia(e.p) + steps);
        this.sound(e.p);
        this.changed();
        return true;
      }
      this.cursor = MQ.melodyPitchAt(this.K, MQ.dia(this.cursorPitch()) + steps);
      this.moved();
      return true;
    }
    setAlt(alt) {
      const e = this.target();
      if (!e) return false;
      e.p.alt = alt;
      this.sound(e.p);
      this.changed();
      return true;
    }
    select(l, m, i) { super.select(0, m, i); this.lastAt = { m, i }; }
    move(dir) { this.lastAt = null; super.move(dir); }
    pitchAtY(y, sys) {
      const pos = Math.max(-6, Math.min(14, Math.round((sys * SYS_H + BOT - y) / HALF)));
      return MQ.melodyPitchAt(this.K, bottomOf(this.clef) + pos);
    }
    bind() {
      const svg = this.svg;
      let drag = null;
      svg.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        const p = this.pt(e.clientX, e.clientY);
        const sys = Math.max(0, Math.min(this.geo.systems.length - 1, Math.floor(p.y / SYS_H)));
        const hit = e.target.closest && e.target.closest('.r-ev');
        e.preventDefault();
        this.focus();
        if (hit) {
          const m = +hit.dataset.m, i = +hit.dataset.i;
          this.select(0, m, i);
          // Dragging a note moves it up or down the staff.
          if (this.noteAt({ m, i })) {
            drag = { m, i, sys, moved: false };
            try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
          }
          return;
        }
        const m = this.geo.measures.findIndex((g) => g.sys === sys && p.x >= g.x0 && p.x < g.x1);
        if (m < 0) return;
        const list = this.geo.ev[0][m] || [];
        let i = list.length;
        for (let j = 0; j < list.length; j++) if (p.x < list[j].x) { i = j; break; }
        this.sel = null;
        this.lastAt = null;
        this.caret = { m, i };
        // Where on the staff was clicked is where the next note goes.
        this.cursor = this.pitchAtY(p.y, sys);
        this.moved();
      });
      svg.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const p = this.pt(e.clientX, e.clientY);
        const note = this.noteAt(drag);
        const to = this.pitchAtY(p.y, drag.sys);
        if (note && MQ.dia(to) !== MQ.dia(note.p)) {
          note.p = to;
          drag.moved = true;
          this.sound(to);
          this.render();
        }
      });
      const end = () => { if (drag && drag.moved) this.changed(); drag = null; };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
    }
  }

  Object.assign(MQ, { MelodyStaff, melodyArt, melodyMarkup: build, MELODY_SYS_H: SYS_H });
})(window);
