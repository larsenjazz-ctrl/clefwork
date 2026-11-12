/* Clefwork Voice Leading — the grand staff for four-part writing. Soprano and alto share the treble
   staff, tenor and bass the bass staff; soprano and tenor stems always point up, alto and bass stems down,
   so each voice can be followed even when two land on the same note. Every voice has its own rhythm —
   whole notes to sixteenths, dots, ties, eighth- and quarter-note triplets — and the four are lined up in
   time, measure by measure.
   Writing goes one voice at a time: the student picks a voice, picks a note value, and then places the
   pitch — pressing on the staff shows a light note head that follows the pointer up and down until it is
   let go, or a letter key writes that note nearest the one before it, inside the voice's range. A caret
   marks where the next note of the voice goes; a written note can be clicked to select it, dragged to a
   new pitch, replaced, or deleted. Printed voices (a given melody or bass) can't be changed.
   Drawn with the plain shapes Clefwork Rhythm draws with, so the same picture prints. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const NS = 'http://www.w3.org/2000/svg';
  const { RX, STEM, BEAM, BEAM_STEP, PAD_L, PAD_R, r1, headSVG, lineSVG, rectSVG, dotSVG, flagsSVG, restSVG, tieSVG, spacing, beamPlan, NAMES } = MQ.rhythmDraw;
  const HALF = 5, ACC_SCALE = 0.85, ACC_W = 11;
  // One system: chord symbols, the treble staff, the bass staff, Roman numerals.
  const T_TOP = 70, B_TOP = 180, SYS_H = 304, SYM_Y = 24, RN_Y = B_TOP + 40 + 66;
  const STAFF = [0, 0, 1, 1], UP = [true, false, true, false];
  const topOf = (st) => (st ? B_TOP : T_TOP);
  const bottomDia = (st) => MQ.CLEFS[st ? 'bass' : 'treble'].bottom;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const accSpan = (s) => esc(s).replace(/([♯♭♮𝄪𝄫])/g, '<tspan class="sacc">$1</tspan>');
  const accSVG = (alt, x, y) => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${ACC_SCALE})">${MQ.ACC_SVG[alt]}</g>`;
  const keyTag = (K) => (K.mode === 'minor' ? K.name.charAt(0).toLowerCase() + K.name.slice(1) : K.name) + ':';
  // A Roman numeral with its figures stacked beside it.
  function rnSVG(x, y, d) {
    const figs = d.figs || [];
    let t = `<text class="c-rn" x="${r1(x)}" y="${y}" font-size="14" font-weight="bold" text-anchor="middle" fill="currentColor">${accSpan(d.pre || '')}${esc(d.num)}${d.mark ? esc(d.mark) : ''}`;
    if (figs.length === 1) t += `<tspan font-size="9.5" dy="-6">${accSpan(figs[0])}</tspan>`;
    if (figs.length === 2) t += `<tspan font-size="9.5" dy="-6">${esc(figs[0])}</tspan><tspan font-size="9.5" dx="-6" dy="10">${esc(figs[1])}</tspan>`;
    if (d.sec) t += `<tspan dy="${figs.length === 2 ? -4 : figs.length === 1 ? 6 : 0}">${accSpan(d.sec)}</tspan>`;
    return t + '</text>';
  }

  // ---------- the picture ----------
  // model: {meter, measures, layers [4 voices][measure][event], key}. opts: print, perLine, first (the
  // number of the first measure shown, less one), showTime, measureW, editing, active (the voice being
  // written), caret {m, i}, sel {l, m, i}, ghost {p, v, d} (the light note at the caret), locked [4]
  // (printed voices), bad (a Set of "l:m:i" notes to mark), labels ([{m, t, rn, sym}]), show (1 Roman
  // numerals, 2 chord symbols, 3 both), keyTag (print the key before the numerals), open (more follows).
  function build(model, opts) {
    const o = Object.assign({ print: false, perLine: 2, first: 0, showTime: true, measureW: null, editing: false, active: -1, caret: null, sel: null, ghost: null, locked: [false, false, false, false], bad: null, labels: null, show: 0, keyTag: true, open: false, playing: -1 }, opts);
    const info = MQ.rhythmMeter(model.meter), K = MQ.melodyKey(model.key), M = model.measures, len = info.len;
    const L = [0, 1, 2, 3].map((l) => Array.from({ length: M }, (_, m) => ((model.layers[l] || [])[m]) || []));
    const plans = L.map((layer) => layer.map((ev) => beamPlan(ev, info)));
    const showSym = (o.show & 2) !== 0 && !!o.labels, showRn = (o.show & 1) !== 0 && !!o.labels;
    // Notes a tie leads to: they keep their accidental without showing it again.
    const tiedTo = new Set();
    L.forEach((layer, l) => layer.forEach((ev, m) => ev.forEach((e, i) => {
      if (!e.tie || e.r) return;
      const to = MQ.rhythmTieNext(layer, m, i, len, M);
      if (to) tiedTo.add(l + ':' + to.m + ':' + to.i);
    })));
    // Accidentals: what the key signature, and earlier notes on that line or space of the staff in the
    // measure, don't already say.
    for (let m = 0; m < M; m++) {
      [0, 1].forEach((st) => {
        const all = [];
        [0, 1, 2, 3].filter((l) => STAFF[l] === st).forEach((l) => plans[l][m].list.forEach((n) => { if (!n.e.r && n.e.p) all.push({ l, n }); }));
        all.sort((a, b) => a.n.t - b.n.t || a.l - b.l);
        const cur = {};
        all.forEach(({ l, n }) => {
          const d = MQ.dia(n.e.p), was = d in cur ? cur[d] : K.alts[n.e.p.step];
          n.acc = tiedTo.has(l + ':' + m + ':' + n.i) || n.e.p.alt === was ? null : n.e.p.alt;
          cur[d] = n.e.p.alt;
        });
      });
    }
    // ---------- widths: one place for every moment any voice starts a note ----------
    const ksW = Math.abs(K.fifths) * 9 + (K.fifths ? 8 : 0);
    const headW = (k) => 60 + ksW + (k === 0 && o.showTime ? 28 : 0) + 6;
    const natural = [];
    for (let m = 0; m < M; m++) {
      const times = new Set([0, len]), pre = new Map(), post = new Map();
      const bump = (map, t, x) => map.set(t, Math.max(map.get(t) || 0, x));
      (o.labels || []).forEach((lb) => { if (lb.m === m) times.add(lb.t); });
      plans.forEach((P, l) => {
        let end = 0;
        P[m].list.forEach((n) => {
          times.add(n.t);
          if (n.acc != null) bump(pre, n.t, ACC_W);
          let x = n.e.d ? 6 : 0;
          if (!n.e.r && n.e.v >= 3 && !P[m].inBeam.has(n.i) && UP[l]) x += 6;
          bump(post, n.t, x);
          end = n.t + n.d;
        });
        times.add(Math.min(len, end));
      });
      // Two voices of a staff a second apart (or on one note with different heads): the lower one moves right.
      [[0, 1], [2, 3]].forEach(([a, b]) => plans[a][m].list.forEach((na) => {
        const nb = plans[b][m].list.find((x) => x.t === na.t);
        if (!nb || na.e.r || nb.e.r) return;
        const gap = MQ.dia(na.e.p) - MQ.dia(nb.e.p);
        if (Math.abs(gap) === 1 || (gap === 0 && (na.e.v < 2) !== (nb.e.v < 2))) { nb.shift = 13; bump(post, na.t, 13 + (nb.e.d ? 6 : 0)); }
      }));
      const ts = [...times].filter((t) => t <= len).sort((a, b) => a - b);
      const seg = ts.slice(0, -1).map((t, k) => spacing(ts[k + 1] - t) + (pre.get(t) || 0) + (post.get(t) || 0));
      const content = seg.reduce((a, b) => a + b, 0);
      const nominal = o.measureW ? o.measureW - PAD_L - PAD_R : (len / 6) * 20;
      natural.push({ ts, seg, pre, width: Math.max(content, nominal) + PAD_L + PAD_R, content });
    }
    const nSys = Math.ceil(M / o.perLine);
    const sysMeasures = [];
    for (let k = 0; k < nSys; k++) sysMeasures.push(Array.from({ length: Math.min(o.perLine, M - k * o.perLine) }, (_, j) => k * o.perLine + j));
    const W = Math.max(...sysMeasures.map((ms, k) => headW(k) + ms.reduce((t, m) => t + natural[m].width, 0))) + 10;
    const H = nSys * SYS_H;
    const geo = { measures: [], ev: [[], [], [], []], W, H, systems: [] };
    sysMeasures.forEach((ms, k) => {
      const sy = k * SYS_H, x0 = headW(k);
      const total = ms.reduce((t, m) => t + natural[m].width, 0);
      const stretch = (W - 10 - x0) / total;
      let x = x0;
      geo.systems.push({ y0: sy, y1: sy + SYS_H, x0 });
      ms.forEach((m) => {
        const nat = natural[m], w = nat.width * stretch;
        const k2 = Math.max(1, (w - PAD_L - PAD_R) / Math.max(1, nat.content));
        const xs = new Map();
        let at = x + PAD_L;
        nat.ts.forEach((t, j) => { xs.set(t, at); if (j < nat.seg.length) at += nat.seg[j] * k2; });
        geo.measures[m] = { x0: x, x1: x + w, xs, ts: nat.ts, pre: nat.pre, sys: k, sy };
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
    const headX = (m, t) => xOf(m, t) + (geo.measures[m].pre.get(t) || 0) + RX + 1;
    const yOf = (sy, st, pos) => sy + topOf(st) + 40 - pos * HALF;
    let s = '';
    // ---------- measure backgrounds ----------
    if (!o.print) {
      geo.measures.forEach((g, m) => {
        const cls = ['r-meas', o.playing === m ? 'is-playing' : '', o.editing && o.caret && o.caret.m === m ? 'is-cur' : ''].filter(Boolean).join(' ');
        s += `<rect class="${cls}" data-m="${m}" x="${r1(g.x0 + 1)}" y="${g.sy + T_TOP - 34}" width="${r1(g.x1 - g.x0 - 2)}" height="${B_TOP + 40 + 34 - (T_TOP - 34)}" rx="6"/>`;
      });
    }
    // ---------- staves, brace, clefs, key and time signatures, bar lines ----------
    sysMeasures.forEach((ms, k) => {
      const sy = k * SYS_H, top = sy + T_TOP, bot = sy + B_TOP + 40, mid = (top + bot) / 2;
      [0, 1].forEach((st) => {
        const y0 = sy + topOf(st), by = y0 + 40, clef = st ? 'bass' : 'treble';
        for (let i = 0; i < 5; i++) s += lineSVG(16, y0 + i * 10, W - 3, y0 + i * 10, 1);
        s += `<g class="clef" transform="translate(22 ${by}) scale(0.8333) translate(-22 ${-by})">${MQ.clefSVG(clef, by, 22)}</g>`;
        MQ.keySigDias(K.fifths, clef).forEach((d, j) => { s += accSVG(K.fifths > 0 ? 1 : -1, 60 + j * 9, by - (d - bottomDia(st)) * HALF); });
        if (k === 0 && o.showTime) {
          const tx = 60 + ksW + 12;
          s += `<text class="clabel r-tsig" x="${tx}" y="${y0 + 19}" font-size="22" font-weight="bold" text-anchor="middle" fill="currentColor">${info.n}</text>`;
          s += `<text class="clabel r-tsig" x="${tx}" y="${by - 1}" font-size="22" font-weight="bold" text-anchor="middle" fill="currentColor">${info.d}</text>`;
        }
      });
      s += lineSVG(16, top, 16, bot, 1);
      s += `<path class="brace" fill="currentColor" d="M14 ${top}C5 ${top + 28} 13 ${mid - 38} 4 ${mid}C13 ${mid + 38} 5 ${bot - 28} 14 ${bot}C10 ${bot - 28} 17 ${mid + 38} 7.5 ${mid}C17 ${mid - 38} 10 ${top + 28} 14 ${top}Z"/>`;
      ms.forEach((m) => {
        const g = geo.measures[m];
        s += `<text class="r-mnum" x="${r1(g.x0 + 4)}" y="${sy + 11}" font-size="9.5" fill="currentColor">${o.first + m + 1}</text>`;
        const last = m === M - 1 && !o.open;
        if (!last) s += lineSVG(g.x1, top, g.x1, bot, 1);
        else s += lineSVG(g.x1 - 7, top, g.x1 - 7, bot, 1) + rectSVG(g.x1 - 4, top, 3.6, bot - top);
      });
      if (showRn && k === 0 && o.keyTag) s += `<text class="c-rn" x="20" y="${sy + RN_Y}" font-size="14" font-weight="bold" fill="currentColor">${accSpan(keyTag(K))}</text>`;
    });
    // ---------- chord symbols above, Roman numerals below ----------
    (o.labels || []).forEach((lb) => {
      if (lb.m < 0 || lb.m >= M) return;
      const g = geo.measures[lb.m], x = headX(lb.m, lb.t);
      if (showSym && lb.sym) s += `<text class="c-sym" x="${r1(x)}" y="${g.sy + SYM_Y}" font-size="13.5" font-weight="bold" text-anchor="middle" fill="currentColor">${accSpan(lb.sym)}</text>`;
      if (showRn && lb.rn) s += rnSVG(x, g.sy + RN_Y, lb.rn);
    });
    // ---------- the notes, voice by voice ----------
    const drawn = [[], [], [], []], ties = [];
    L.forEach((layer, l) => {
      const st = STAFF[l], up = UP[l];
      const voiceCls = ` c-v${l}` + (o.locked[l] ? ' is-given' : '') + (o.editing && l === o.active ? ' is-active' : '');
      layer.forEach((evs, m) => {
        const g = geo.measures[m], sy = g.sy, y0 = sy + topOf(st);
        const { list, beamed, inBeam } = plans[l][m];
        const state = MQ.measureState(evs, info);
        const badAt = new Set();
        state.bad.forEach((tg) => { if (!tg.finishable || state.full) for (let i = tg.from; i <= tg.to; i++) badAt.add(i); });
        list.forEach((n) => {
          n.hx = headX(m, n.t) + (n.shift || 0);
          if (!n.e.r) { n.pos = MQ.dia(n.e.p) - bottomDia(st); n.hy = yOf(sy, st, n.pos); }
        });
        geo.ev[l][m] = list.map((n) => ({ x: n.hx, t: n.t }));
        const stemX = (n) => n.hx + (up ? 5.7 : -5.7);
        const stemEnd = (n) => (up ? n.hy - STEM : n.hy + STEM) + (up ? -1 : 1) * (!inBeam.has(n.i) && n.e.v === 4 ? 5 : 0);
        beamed.forEach((grp) => {
          const y = up ? Math.min(...grp.map(stemEnd)) : Math.max(...grp.map(stemEnd));
          grp.forEach((n) => { n.beamY = y; });
        });
        const restPos = up ? { rest: y0 + 8, wholeTop: y0, halfBottom: y0 + 10 } : { rest: y0 + 32, wholeTop: y0 + 30, halfBottom: y0 + 40 };
        list.forEach((n) => {
          const e = n.e;
          const sel = o.sel && o.sel.l === l && o.sel.m === m && o.sel.i === n.i;
          const wrong = o.bad && o.bad.has(l + ':' + m + ':' + n.i);
          const cls = 'r-ev' + voiceCls + (sel && !o.print ? ' is-sel' : '') + (badAt.has(n.i) ? ' is-bad' : '') + (wrong ? ' is-wrong' : '');
          let body = '';
          if (e.r) {
            body += restSVG(e.v, n.hx, restPos);
            if (e.d) body += dotSVG(n.hx + (e.v <= 1 ? 10 : 8), restPos.rest - 3);
          } else {
            for (let k = -2; k >= n.pos; k -= 2) body += lineSVG(n.hx - 11, yOf(sy, st, k), n.hx + 11, yOf(sy, st, k), 1.3);
            for (let k = 10; k <= n.pos; k += 2) body += lineSVG(n.hx - 11, yOf(sy, st, k), n.hx + 11, yOf(sy, st, k), 1.3);
            if (n.acc != null) body += accSVG(n.acc, n.hx - RX - 9 - (n.acc === -2 ? 4 : 0), n.hy);
            body += headSVG(e.v, n.hx, n.hy);
            if (e.v >= 1) {
              const end = inBeam.has(n.i) ? n.beamY : stemEnd(n);
              body += lineSVG(stemX(n), n.hy + (up ? -1.5 : 1.5), stemX(n), end, 1.3);
              if (e.v >= 3 && !inBeam.has(n.i)) body += flagsSVG(stemX(n) + (up ? -0.6 : 0.6), end, up, e.v - 2);
            }
            if (e.d) body += dotSVG(n.hx + (e.v === 0 ? 12 : 10.5), n.hy - (n.pos % 2 === 0 ? HALF : 0));
          }
          const hit = o.print || !o.editing || o.locked[l] ? '' : `<rect class="r-hit" x="${r1(n.hx - RX - 4)}" y="${r1((e.r ? restPos.rest : n.hy) - 9)}" width="${r1(2 * RX + 8)}" height="18"/>`;
          s += `<g class="${cls}" data-l="${l}" data-m="${m}" data-i="${n.i}">${hit}${body}</g>`;
          if (e.tie && !e.r) ties.push({ l, m, n });
        });
        drawn[l][m] = list;
        // Beams.
        beamed.forEach((grp) => {
          const y0b = up ? grp[0].beamY : grp[0].beamY - BEAM;
          const a = stemX(grp[0]) - 0.65, z = stemX(grp[grp.length - 1]) + 0.65;
          let b = rectSVG(a, y0b, z - a, BEAM);
          const y1 = y0b + (up ? BEAM_STEP : -BEAM_STEP);
          for (let j = 0; j < grp.length; j++) {
            if (grp[j].e.v !== 4) continue;
            let k = j;
            while (k + 1 < grp.length && grp[k + 1].e.v === 4) k++;
            if (k > j) b += rectSVG(stemX(grp[j]) - 0.65, y1, stemX(grp[k]) - stemX(grp[j]) + 1.3, BEAM);
            else { const sx = stemX(grp[j]); b += rectSVG(j > 0 ? sx - 8 : sx - 0.65, y1, 8.65, BEAM); }
            j = k;
          }
          s += `<g class="r-beam${voiceCls}${grp.some((n) => badAt.has(n.i)) ? ' is-bad' : ''}">${b}</g>`;
        });
        // Triplets: the number on the stem side, with a bracket when the notes aren't all under one beam.
        MQ.tripletGroups(evs, info).forEach((tg) => {
          const notes = list.slice(tg.from, tg.to + 1);
          if (!notes.length) return;
          const pitched = notes.filter((n) => !n.e.r);
          const ends = pitched.map((n) => (inBeam.has(n.i) ? n.beamY : n.e.v >= 1 ? stemEnd(n) : n.hy));
          const grp = beamed.find((b) => b[0].i === tg.from && b[b.length - 1].i === tg.to);
          const xa = notes[0].hx - RX, xb = notes[notes.length - 1].hx + RX;
          const mid = grp ? (stemX(grp[0]) + stemX(grp[grp.length - 1])) / 2 : (xa + xb) / 2;
          const ny = up ? Math.min(y0 - 6, ...ends.map((y) => y - 5)) : Math.max(y0 + 54, ...ends.map((y) => y + 13));
          let b = `<text class="clabel r-trip" x="${r1(mid)}" y="${r1(ny)}" font-size="11" font-weight="bold" text-anchor="middle" fill="currentColor">3</text>`;
          if (!grp) {
            const by = ny - 4, hook = up ? 4 : -4;
            b += lineSVG(xa, by + hook, xa, by, 0.9) + lineSVG(xa, by, mid - 6, by, 0.9) + lineSVG(mid + 6, by, xb, by, 0.9) + lineSVG(xb, by, xb, by + hook, 0.9);
          }
          s += `<g class="r-tripg${voiceCls}${badAt.has(tg.from) ? ' is-bad' : ''}">${b}</g>`;
        });
      });
    });
    // ---------- ties: above the stems-up voices, below the stems-down ones ----------
    ties.forEach(({ l, m, n }) => {
      const to = MQ.rhythmTieNext(L[l], m, n.i, len, M);
      const nx = to ? drawn[l][to.m][to.i] : null;
      const after = n.i + 1 < L[l][m].length ? L[l][m][n.i + 1] : L[l][m + 1] && L[l][m + 1][0];
      const down = !UP[l], dy = down ? 6.5 : -6.5;
      const x1 = n.hx + (n.e.d ? 13 : 3);
      const bad = !nx && after && !(n.i + 1 >= L[l][m].length && MQ.rhythmTotal(L[l][m]) < len) ? ' is-bad' : '';
      let arc;
      if (nx && geo.measures[to.m].sys !== geo.measures[m].sys) {
        arc = tieSVG(x1, geo.measures[m].x1 + 4, n.hy + dy, down) + tieSVG(geo.measures[to.m].x0 + 2, nx.hx - 3 - (nx.acc != null ? ACC_W : 0), nx.hy + dy, down);
      } else arc = tieSVG(x1, nx ? nx.hx - 3 : x1 + 15, n.hy + dy, down);
      s += `<g class="r-tie c-v${l}${o.locked[l] ? ' is-given' : ''}${o.editing && l === o.active ? ' is-active' : ''}${bad}">${arc}</g>`;
    });
    // ---------- the caret of the voice being written, and the light note that shows the next pitch ----------
    if (o.editing && o.caret && o.active >= 0 && !o.sel) {
      const l = o.active, st = STAFF[l], g = geo.measures[o.caret.m];
      const list = geo.ev[l][o.caret.m] || [], evs = L[l][o.caret.m];
      let cx;
      if (o.caret.i < list.length) cx = list[o.caret.i].x - RX - 5;
      else if (!list.length) cx = g.x0 + PAD_L - 5;
      else cx = Math.min(g.x1 - 16, Math.max(list[list.length - 1].x + RX + 8, xOf(o.caret.m, Math.min(MQ.rhythmTotal(evs), len)) - 2));
      const y0 = g.sy + topOf(st);
      s += `<g class="r-caret c-caret">${lineSVG(cx, y0 - 16, cx, y0 + 56, 2)}<path d="M${r1(cx - 4.5)} ${y0 - 17}h9l-4.5 5z" fill="currentColor"/></g>`;
      if (o.ghost && o.ghost.p) {
        const pos = MQ.dia(o.ghost.p) - bottomDia(st), gx = cx + RX + 6, gy = yOf(g.sy, st, pos), v = o.ghost.v;
        let b = '';
        for (let k = -2; k >= pos; k -= 2) b += lineSVG(gx - 11, yOf(g.sy, st, k), gx + 11, yOf(g.sy, st, k), 1.3);
        for (let k = 10; k <= pos; k += 2) b += lineSVG(gx - 11, yOf(g.sy, st, k), gx + 11, yOf(g.sy, st, k), 1.3);
        if (o.ghost.p.alt !== K.alts[o.ghost.p.step]) b += accSVG(o.ghost.p.alt, gx - RX - 9, gy);
        b += headSVG(v, gx, gy);
        if (v >= 1) {
          const sx = gx + (UP[l] ? 5.7 : -5.7), end = UP[l] ? gy - STEM : gy + STEM;
          b += lineSVG(sx, gy + (UP[l] ? -1.5 : 1.5), sx, end, 1.3);
          if (v >= 3) b += flagsSVG(sx + (UP[l] ? -0.6 : 0.6), end, UP[l], v - 2);
        }
        if (o.ghost.d) b += dotSVG(gx + 10.5, gy - (pos % 2 === 0 ? HALF : 0));
        s += `<g class="c-ghost">${b}</g>`;
      }
    }
    geo.xOf = xOf;
    return { inner: s, W, H, geo, info };
  }

  // How many measures fit a line `avail` pixels wide; 0 while there's no width to measure.
  function lineFit(model, avail) {
    if (!avail) return 0;
    const info = MQ.rhythmMeter(model.meter), K = MQ.melodyKey(model.key);
    const head = 60 + Math.abs(K.fifths) * 9 + (K.fifths ? 8 : 0) + 34;
    const bar = (info.len / 6) * 20 + PAD_L + PAD_R;
    for (let n = 4; n > 1; n--) if ((head + n * bar + 10) * 0.78 <= avail) return n;
    return 1;
  }
  // Pictures for paper, a line of music each: [{svg, markup, wIn, hIn}]. layers: what to print (the given
  // voices; the rest is left for the student to write in, so the measures are drawn wide).
  function chorArt(model, opts) {
    const o = opts || {}, per = o.perLine || 2, out = [];
    const was = MQ.clefFont;
    if (o.drawnClefs) MQ.clefFont = false;
    for (let a = 0; a < model.measures; a += per) {
      const n = Math.min(per, model.measures - a);
      const sub = { meter: model.meter, measures: n, key: model.key, layers: model.layers.map((L) => (L || []).slice(a, a + n)) };
      const labels = (o.labels || []).filter((lb) => lb.m >= a && lb.m < a + n).map((lb) => Object.assign({}, lb, { m: lb.m - a }));
      const b = build(sub, { print: true, perLine: n, first: a, showTime: a === 0, keyTag: a === 0, open: a + n < model.measures, measureW: o.measureW || 250, labels, show: o.show || 0 });
      const markup = `<svg xmlns="${NS}" class="cstaff c-art" viewBox="0 0 ${r1(b.W)} ${b.H}" width="${r1(b.W)}" height="${b.H}" style="color:#000">${b.inner}</svg>`;
      const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
      const hIn = (o.height || 1.25) * 2.4;
      out.push({ svg, markup, wIn: (b.W / b.H) * hIn, hIn });
    }
    MQ.clefFont = was;
    return out;
  }

  // ---------- the interactive staff ----------
  class ChoraleStaff extends MQ.RhythmStaff {
    // opts: as RhythmStaff (parts: 4), plus key, locked [4] (printed voices), labels, show, bad, value
    // ({v, d, t}: the next note's value), sound, perLine, onMessage(text), onNeedValue().
    setup() {
      this.K = MQ.melodyKey(this.o.key);
      this.model.key = this.o.key;
      this.locked = this.o.locked || [false, false, false, false];
      this.value = this.o.value || null;
      this.ghost = null;           // the pitch under the pointer, while a note is being placed
      this.lastAt = null;          // the note just written: arrow keys and ♯ ♭ ♮ act on it
      this.fit = 0;
      if (!this.o.perLine && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
          const n = lineFit(this.model, this.svg.parentNode ? this.svg.parentNode.clientWidth : 0);
          if (n && n !== this.fit) { this.fit = n; this.render(); }
        }).observe(this.svg.parentNode);
      }
    }
    render() {
      const ro = !!this.o.readOnly;
      const showGhost = !ro && this.value && !this.sel && !this.locked[this.active];
      const b = build(this.model, {
        caret: ro ? null : this.caret, sel: this.sel, active: ro ? -1 : this.active, editing: !ro, playing: this.playing,
        perLine: this.o.perLine || this.fit || 2, locked: this.locked, bad: this.o.bad || null, labels: this.o.labels || null, show: this.o.show || 0,
        ghost: showGhost ? { p: this.ghost || this.cursorPitch(), v: this.value.v, d: this.value.d } : null,
      });
      this.geo = b.geo;
      this.svg.setAttribute('class', 'rstaff cstaff' + (ro ? ' is-readonly' : ''));
      this.svg.setAttribute('viewBox', `0 0 ${r1(b.W)} ${b.H}`);
      this.svg.style.minWidth = Math.round(b.W * 0.72) + 'px';
      this.svg.style.maxWidth = Math.round(b.W * 1.5) + 'px';
      this.svg.innerHTML = b.inner;
      this.svg.setAttribute('aria-label', this.describeChorale(b.info));
    }
    describeChorale(info) {
      const V = MQ.CHOR_VOICES;
      const what = (e) => (e.r ? `${e.d ? 'dotted ' : ''}${NAMES[e.v]} rest` : `${MQ.fullName(e.p)} ${e.t ? 'triplet ' : ''}${e.d ? 'dotted ' : ''}${NAMES[e.v]}${e.tie ? ', tied' : ''}`);
      const parts = this.model.layers.map((L, l) => `${V[l]}${this.locked[l] ? ' (printed)' : ''}: ` + L.slice(0, this.model.measures).map((m, k) => `measure ${k + 1}, ${m.length ? m.map(what).join(', ') : 'empty'}`).join('; '));
      const how = this.o.readOnly ? '' : ` Writing the ${V[this.active]}, measure ${this.caret.m + 1}. Choose a note value, then press on the staff and move up or down to choose the pitch, or type a letter A to G.`;
      return `Grand staff for four voices in ${MQ.melodyKeyName(this.o.key)}, ${info.label}, ${this.model.measures} measures. ${parts.join('. ')}.${how}`;
    }
    setValue(val) { this.value = val; this.render(); }
    // ---------- pitch ----------
    noteAt(at, l) { const L = this.model.layers[l == null ? this.active : l]; const e = at && L[at.m] && L[at.m][at.i]; return e && !e.r ? e : null; }
    target() { return this.locked[this.active] ? null : this.sel ? this.noteAt(this.sel) : this.noteAt(this.lastAt); }
    // The voice's note before the caret: the note a new one starts from.
    before() {
      const L = this.model.layers[this.active];
      let { m, i } = this.caret;
      for (;;) {
        for (let j = Math.min(i, L[m].length) - 1; j >= 0; j--) if (!L[m][j].r) return L[m][j].p;
        if (m === 0) return null;
        m--; i = L[m].length;
      }
    }
    // The note of the key nearest the middle of the voice's practical octave.
    defaultPitch() {
      const want = MQ.CHOR_CENTERS[this.active];
      let best = null;
      for (let d = 12; d < 50; d++) { const p = MQ.melodyPitchAt(this.K, d); if (!best || Math.abs(MQ.midi(p) - want) < Math.abs(MQ.midi(best) - want)) best = p; }
      return best;
    }
    cursorPitch() { return this.before() || this.defaultPitch(); }
    sound(p) { if (this.o.sound !== false && MQ.Audio && p) MQ.Audio.play([[MQ.midi(p)]], 0.6); }
    // ---------- ties ----------
    after(at) {
      const L = this.model.layers[this.active];
      if (at.i + 1 < L[at.m].length) return { m: at.m, i: at.i + 1 };
      if (at.m + 1 < this.model.measures && L[at.m + 1].length && MQ.rhythmTotal(L[at.m]) === this.info().len) return { m: at.m + 1, i: 0 };
      return null;
    }
    before1(at) {
      const L = this.model.layers[this.active];
      if (at.i > 0) return { m: at.m, i: at.i - 1 };
      return at.m > 0 && L[at.m - 1].length && MQ.rhythmTotal(L[at.m - 1]) === this.info().len ? { m: at.m - 1, i: L[at.m - 1].length - 1 } : null;
    }
    // Tied notes are one pitch: a note that changes takes the notes tied to it along.
    syncTies(at) {
      const L = this.model.layers[this.active], e = at && L[at.m] && L[at.m][at.i];
      if (!e || e.r || !e.p) return;
      for (let b = this.before1(at); b && L[b.m][b.i].tie && !L[b.m][b.i].r; b = this.before1(b)) L[b.m][b.i].p = Object.assign({}, e.p);
      for (let c = at; L[c.m][c.i].tie;) {
        const n = this.after(c);
        if (!n || L[n.m][n.i].r) break;
        L[n.m][n.i].p = Object.assign({}, e.p);
        c = n;
      }
    }
    tied(at) { this.syncTies(at); this.lastAt = at; }
    // ---------- writing ----------
    // Writes ev at the caret of the voice being written, or in place of its selected note. pitch: where the
    // pointer or a letter key put it; without one a replaced note keeps its pitch. Returns a message when
    // it can't.
    enter(ev, pitch) {
      const V = MQ.CHOR_VOICES, l = this.active;
      if (this.locked[l]) return `The ${V[l]} is printed for you — choose another voice.`;
      const vp = MQ.chorValueProblem(ev);
      if (vp) return vp;
      const info = this.info(), L = this.model.layers[l];
      const replace = !!(this.sel && this.sel.l === l);
      let m = replace ? this.sel.m : this.caret.m, i = replace ? this.sel.i : this.caret.i;
      if (!ev.r) {
        const was = replace ? L[m][i] : null;
        const prev = !replace && this.tieAt() ? this.noteAt(this.tieAt()) : null;
        ev.p = Object.assign({}, pitch || (was && was.p) || (prev && prev.tie ? prev.p : this.cursorPitch()));
      }
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
        return room > 0 ? `That’s too long — measure ${m + 1} of the ${V[l]} has room for ${MQ.rhythmAmount(room, info)}.`
          : m + 1 >= this.model.measures ? `The ${V[l]} is full. Select a note to change it, or choose another voice.` : `Measure ${m + 1} of the ${V[l]} is full. Select a note to change it, or delete one.`;
      }
      const trip = MQ.chorTripletProblem(next, info);
      if (trip) return trip;
      L[m] = next;
      this.enteredAt = { m, i };
      this.sel = null;
      this.caret = { m, i: i + 1 };
      if (this.caret.i === next.length && MQ.rhythmTotal(next) === info.len && m + 1 < this.model.measures) this.caret = { m: m + 1, i: L[m + 1].length };
      this.ghost = null;
      this.lastAt = this.enteredAt;
      if (!ev.r) { this.syncTies(this.enteredAt); this.sound(ev.p); }
      this.changed();
      return null;
    }
    // A note by its letter: the nearest one to the voice's note before, kept inside the voice's range.
    enterLetter(step, ev) {
      const from = this.cursorPitch(), base = MQ.dia(from), r = MQ.CHOR_RANGES[this.active];
      let d = base - ((((base % 7) - step) % 7) + 7) % 7;
      if (base - d > 3) d += 7;
      while (MQ.midi(MQ.melodyPitchAt(this.K, d)) > r[1]) d -= 7;
      while (MQ.midi(MQ.melodyPitchAt(this.K, d)) < r[0]) d += 7;
      return this.enter(ev, MQ.melodyPitchAt(this.K, d));
    }
    // Up or down by steps: the note picked, or the note just written.
    nudge(steps) {
      const e = this.target();
      if (!e) return false;
      e.p = MQ.melodyPitchAt(this.K, MQ.dia(e.p) + steps);
      this.syncTies(this.sel || this.lastAt);
      this.sound(e.p);
      this.changed();
      return true;
    }
    setAlt(alt) {
      const e = this.target();
      if (!e) return false;
      e.p.alt = alt;
      this.syncTies(this.sel || this.lastAt);
      this.sound(e.p);
      this.changed();
      return true;
    }
    remove(back) { if (this.locked[this.active]) return false; this.lastAt = null; return super.remove(back); }
    clearMeasure() { if (this.locked[this.active]) return false; this.lastAt = null; return super.clearMeasure(); }
    toggleTie() { return this.locked[this.active] ? 'That voice is printed for you — choose another voice.' : super.toggleTie(); }
    select(l, m, i) { if (this.locked[l]) return; super.select(l, m, i); this.lastAt = { m, i }; }
    move(dir) { this.lastAt = null; super.move(dir); }
    // Another voice: the caret goes to where that voice's writing stops.
    setActive(l) {
      if (l === this.active || this.locked[l]) return;
      this.active = l;
      this.sel = null;
      this.lastAt = null;
      this.ghost = null;
      this.caretToEnd();
      this.moved();
    }
    pitchAtY(y, sys) {
      const st = STAFF[this.active];
      const pos = Math.max(-9, Math.min(17, Math.round((sys * SYS_H + topOf(st) + 40 - y) / HALF)));
      return MQ.melodyPitchAt(this.K, bottomDia(st) + pos);
    }
    bind() {
      const svg = this.svg;
      let drag = null;
      const sysAt = (y) => Math.max(0, Math.min(this.geo.systems.length - 1, Math.floor(y / SYS_H)));
      svg.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        const p = this.pt(e.clientX, e.clientY);
        const hit = e.target.closest && e.target.closest('.r-ev');
        e.preventDefault();
        this.focus();
        if (hit && !this.locked[+hit.dataset.l]) {
          const l = +hit.dataset.l, m = +hit.dataset.m, i = +hit.dataset.i;
          this.ghost = null;
          this.select(l, m, i);
          // Dragging a note moves it up or down the staff.
          if (this.noteAt({ m, i })) {
            drag = { note: { m, i }, sys: this.geo.measures[m].sys, moved: false };
            try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
          }
          return;
        }
        if (this.locked[this.active]) return;
        if (!this.value) { if (this.o.onNeedValue) this.o.onNeedValue(); return; }
        // A new note: the light note head follows the pointer up and down until it is let go.
        this.sel = null;
        drag = { place: true, sys: this.geo.measures[this.caret.m].sys };
        this.ghost = this.pitchAtY(p.y, sysAt(p.y) === drag.sys ? drag.sys : sysAt(p.y));
        drag.sys = sysAt(p.y);
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        this.render();
      });
      svg.addEventListener('pointermove', (e) => {
        const p = this.pt(e.clientX, e.clientY);
        if (drag && drag.note) {
          const note = this.noteAt(drag.note), to = this.pitchAtY(p.y, drag.sys);
          if (note && MQ.dia(to) !== MQ.dia(note.p)) {
            note.p = to;
            this.syncTies(drag.note);
            drag.moved = true;
            this.sound(to);
            this.render();
          }
        } else if ((drag && drag.place) || (e.pointerType === 'mouse' && this.value && !this.sel && !this.locked[this.active])) {
          const to = this.pitchAtY(p.y, drag ? drag.sys : sysAt(p.y));
          if (!this.ghost || MQ.dia(to) !== MQ.dia(this.ghost)) { this.ghost = to; this.render(); }
        }
      });
      const end = (e, cancel) => {
        const d = drag;
        drag = null;
        if (!d) return;
        if (d.note) { if (d.moved) this.changed(); return; }
        if (cancel || !this.ghost || !this.value) { this.ghost = null; this.render(); return; }
        const msg = this.enter({ v: this.value.v, d: this.value.d ? 1 : 0, t: this.value.t ? 1 : 0, r: 0 }, this.ghost);
        if (msg) { this.ghost = null; this.render(); if (this.o.onMessage) this.o.onMessage(msg); }
      };
      svg.addEventListener('pointerup', (e) => end(e, false));
      svg.addEventListener('pointercancel', (e) => end(e, true));
      svg.addEventListener('pointerleave', () => { if (!drag && this.ghost) { this.ghost = null; this.render(); } });
    }
  }

  Object.assign(MQ, { ChoraleStaff, chorMarkup: build, chorArt, CHOR_SYS_H: SYS_H });
})(window);
