/* Clefwork Voice Leading — the picture of a non-harmonic tone example: four voices on the grand staff in
   4/4, two chords a bar, half notes split into quarters and eighths where a voice takes a figure, with
   beams, dots and ties. Soprano and alto share the treble staff (stems up and down), tenor and bass the
   bass staff. The non-harmonic tones are coloured, ringed and lettered — the letters above the music for
   the treble voices and below it for the bass voices — and the chord symbols sit above, the Roman
   numerals below. Drawn with plain shapes (paths, lines, circles, text) so it prints and exports.
   A long example is drawn a line at a time: build() takes a range of chords. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const NS = 'http://www.w3.org/2000/svg';
  const G = 12, HALF = 6, STEM = 34, EW = 24, SPAN = 4;
  const TREBLE_BY = 120, BASS_BY = 246;
  const STAFF = [0, 0, 1, 1], UP = [true, false, true, false];
  const SHARP_STEPS = [3, 0, 4, 1, 5, 2, 6], FLAT_STEPS = [6, 2, 5, 1, 4, 0, 3];
  const r1 = (n) => Math.round(n * 10) / 10;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const accSpan = (s) => esc(s).replace(/([♯♭♮𝄪𝄫])/g, '<tspan class="sacc">$1</tspan>');
  const FILLED = '<g transform="rotate(-22)"><path class="head" fill="currentColor" d="M-6.6 0A6.6 4.6 0 1 0 6.6 0A6.6 4.6 0 1 0 -6.6 0Z"/></g>';
  const OPEN = '<g transform="rotate(-22)"><path class="head" fill="currentColor" fill-rule="evenodd" d="M-6.6 0A6.6 4.6 0 1 0 6.6 0A6.6 4.6 0 1 0 -6.6 0ZM-5.2 0A5.2 1.9 0 1 0 5.2 0A5.2 1.9 0 1 0 -5.2 0Z"/></g>';
  const STAVES = [{ clef: 'treble', by: TREBLE_BY, bottom: MQ.CLEFS.treble.bottom }, { clef: 'bass', by: BASS_BY, bottom: MQ.CLEFS.bass.bottom }];
  const posOf = (p, st) => MQ.dia(p) - STAVES[st].bottom;
  const yOf = (st, pos) => STAVES[st].by - pos * HALF;
  // What the key signature does to each letter.
  function sigAlts(f) {
    const a = [0, 0, 0, 0, 0, 0, 0];
    (f > 0 ? SHARP_STEPS.slice(0, f) : FLAT_STEPS.slice(0, -f)).forEach((s) => (a[s] = f > 0 ? 1 : -1));
    return a;
  }
  // "C:" for C major, "a:" for A minor.
  const keyTag = (key) => { const n = MQ.pcName(key.tonic); return (key.mode === 'minor' ? n.charAt(0).toLowerCase() + n.slice(1) : n) + ':'; };

  // nh: a question's nh ({key, chords, segs, spots, show}). opts: from/to (the chords drawn, to exclusive),
  // showTime (the 4/4), letters (true: letter the spots), marks (per spot: true, false or null), print,
  // color (the highlight colour), sel (a spot index to emphasise). Returns {inner, W, H, top}.
  function build(nh, opts) {
    const o = Object.assign({ from: 0, to: nh.segs.length, showTime: true, letters: true, marks: null, print: false, color: '#2f3fbf', sel: -1 }, opts);
    const from = o.from, to = Math.min(nh.segs.length, o.to), n = to - from;
    const showSym = (nh.show & 2) !== 0, showRn = (nh.show & 1) !== 0;
    const ks = nh.key.fifths || 0, nks = Math.abs(ks);
    const topTags = nh.spots.some((sp) => sp.voice < 2), botTags = nh.spots.some((sp) => sp.voice >= 2);
    // Rows: chord symbols, then the treble letters, above the music; the bass letters, then the Roman
    // numerals, below it.
    const symY = 16, tagTopY = showSym ? 40 : 20;
    const top = 0;
    const tagBotY = BASS_BY + 66;
    const rnY = (botTags ? tagBotY + 24 : BASS_BY + 70);
    const H = showRn ? rnY + 16 : botTags ? tagBotY + 8 : BASS_BY + 56;
    const x0 = 14 + (nks ? 56 + nks * 11 + 10 : 62) + (o.showTime ? 26 : 0) + 10;
    const colW = SPAN * EW + 20;
    const W = x0 + n * colW + 10;
    const noteX = (col, t) => x0 + (col - from) * colW + 12 + t * EW;
    const sTop = TREBLE_BY - 4 * G, sBot = BASS_BY;
    let s = '';
    // Staves, clefs, key signatures, the time signature, bar lines, the brace.
    STAVES.forEach((st) => {
      for (let i = 0; i < 5; i++) s += `<line class="sl" x1="18" x2="${r1(W - 4)}" y1="${st.by - i * G}" y2="${st.by - i * G}" stroke="currentColor" stroke-width="1.1"/>`;
      s += `<g class="clef">${MQ.clefSVG(st.clef, st.by, 22)}</g>`;
      MQ.keySigDias(ks, st.clef).forEach((d, k) => {
        s += `<g class="ks" transform="translate(${70 + k * 11} ${st.by - (d - st.bottom) * HALF})">${MQ.ACC_SVG[ks > 0 ? 1 : -1]}</g>`;
      });
      if (o.showTime) {
        const tx = x0 - 20;
        s += `<text class="nh-time" x="${tx}" y="${st.by - 25}" font-size="22" font-weight="bold" text-anchor="middle" fill="currentColor">4</text><text class="nh-time" x="${tx}" y="${st.by - 1}" font-size="22" font-weight="bold" text-anchor="middle" fill="currentColor">4</text>`;
      }
    });
    s += `<line class="sl" x1="18" x2="18" y1="${sTop}" y2="${sBot}" stroke="currentColor" stroke-width="1.1"/>`;
    for (let c = from + 1; c < to; c++) {
      if ((c % 2) || c === to) continue;
      const x = x0 + (c - from) * colW - 6;
      s += `<line class="sl" x1="${r1(x)}" x2="${r1(x)}" y1="${sTop}" y2="${sBot}" stroke="currentColor" stroke-width="1.1"/>`;
    }
    if (to === nh.segs.length) s += `<line class="sl" x1="${r1(W - 9)}" x2="${r1(W - 9)}" y1="${sTop}" y2="${sBot}" stroke="currentColor" stroke-width="1.1"/><rect class="nh-final" x="${r1(W - 6)}" y="${sTop}" width="3.5" height="${sBot - sTop}" fill="currentColor"/>`;
    else s += `<line class="sl" x1="${r1(W - 4)}" x2="${r1(W - 4)}" y1="${sTop}" y2="${sBot}" stroke="currentColor" stroke-width="1.1"/>`;
    const m = (sTop + sBot) / 2;
    s += `<path class="brace" fill="currentColor" d="M17 ${sTop}C7 ${sTop + 30} 16 ${m - 40} 6 ${m}C16 ${m + 40} 7 ${sBot - 30} 17 ${sBot}C12 ${sBot - 30} 20 ${m + 40} 9.5 ${m}C20 ${m - 40} 12 ${sTop + 30} 17 ${sTop}Z"/>`;
    // Chord labels.
    if (showRn && from === 0) s += `<text class="nh-rn nh-key" x="24" y="${rnY}" font-size="15" font-weight="bold" fill="currentColor">${accSpan(keyTag(nh.key))}</text>`;
    for (let c = from; c < to; c++) {
      const ch = nh.chords[c], x = noteX(c, 0);
      if (showSym && ch.sym) s += `<text class="nh-sym" x="${r1(x)}" y="${symY}" font-size="14" font-weight="bold" text-anchor="middle" fill="currentColor">${accSpan(ch.sym)}</text>`;
      if (showRn && ch.rn) s += rnSVG(x, rnY, ch.rn, ch.paren);
    }
    // The notes: every voice's segments in this range, placed in time.
    const items = [];
    for (let c = from; c < to; c++) {
      for (let v = 0; v < 4; v++) {
        const sg = nh.segs[c][v];
        let t = 0;
        sg.notes.forEach((p, k) => {
          const spot = nh.spots.findIndex((sp) => sp.col === c && sp.voice === v && sp.k === k);
          items.push({ c, v, k, t, d: sg.durs[k], p, tie: !!sg.tie[k], spot, st: STAFF[v], pos: posOf(p, STAFF[v]) });
          t += sg.durs[k];
        });
      }
    }
    items.forEach((it) => { it.y = yOf(it.st, it.pos); it.dx = 0; it.x = noteX(it.c, it.t); });
    // Two voices a second apart at the same moment: the upper one moves right.
    items.forEach((a) => {
      if (a.v % 2) return;
      const b = items.find((x) => x.c === a.c && x.v === a.v + 1 && x.t <= a.t && a.t < x.t + x.d);
      if (b && MQ.dia(a.p) - MQ.dia(b.p) === 1) { a.dx = 12.5; a.x += a.dx; }
    });
    // Accidentals: only what the key signature, and earlier notes on that line or space in the measure on
    // that staff, don't already say. A tied note repeats its accidental silently.
    const sig = sigAlts(ks);
    const state = [{}, {}];
    let bar = -1;
    items.slice().sort((a, b) => a.c - b.c || a.t - b.t || a.v - b.v).forEach((it) => {
      const thisBar = Math.floor(it.c / 2);
      if (thisBar !== bar) { bar = thisBar; state[0] = {}; state[1] = {}; }
      const key = MQ.dia(it.p), was = key in state[it.st] ? state[it.st][key] : sig[it.p.step];
      it.acc = it.tie || it.p.alt === was ? null : it.p.alt;
      state[it.st][key] = it.p.alt;
    });
    // Eighths beamed in pairs within a beat.
    const beams = [];
    items.forEach((a) => {
      if (a.d !== 1 || a.t % 2) return;
      const b = items.find((x) => x.c === a.c && x.v === a.v && x.t === a.t + 1 && x.d === 1);
      if (b) { a.beam = b.beam = true; beams.push([a, b]); }
    });
    const color = (it) => {
      if (it.spot < 0) return '';
      const mk = o.marks && it.spot < o.marks.length ? o.marks[it.spot] : null;
      return mk === true ? ' is-right' : mk === false ? ' is-wrong' : ' is-spot';
    };
    const fillOf = (it) => (o.print || it.spot < 0 ? 'currentColor' : o.marks && o.marks[it.spot] === true ? '#137a4b' : o.marks && o.marks[it.spot] === false ? '#bf3139' : o.color);
    // Ties, under the notes.
    for (let v = 0; v < 4; v++) {
      const line = items.filter((x) => x.v === v).sort((a, b) => a.c - b.c || a.t - b.t);
      const dir = UP[v] ? 1 : -1;
      line.forEach((it, i) => {
        if (!it.tie) return;
        const y = it.y + dir * 6;
        const x1 = i ? line[i - 1].x + 6 : it.x - 24, x2 = it.x - 6;
        s += `<path class="tie" fill="none" stroke="currentColor" stroke-width="1.5" d="M${r1(x1)} ${r1(y)} C${r1(x1 + 8)} ${r1(y + dir * 9)} ${r1(x2 - 8)} ${r1(y + dir * 9)} ${r1(x2)} ${r1(y)}"/>`;
      });
      // A note at the end of this line tied into the next line.
      const last = line[line.length - 1];
      if (last && to < nh.segs.length) {
        const next = nh.segs[to][v];
        if (next && next.tie[0]) { const y = last.y + dir * 6; s += `<path class="tie" fill="none" stroke="currentColor" stroke-width="1.5" d="M${r1(last.x + 6)} ${r1(y)} C${r1(last.x + 14)} ${r1(y + dir * 9)} ${r1(last.x + 20)} ${r1(y + dir * 9)} ${r1(last.x + 26)} ${r1(y)}"/>`; }
      }
    }
    const stemEnd = new Map();
    beams.forEach(([a, b]) => {
      const up = UP[a.v];
      const y = up ? Math.min(a.y, b.y) - STEM : Math.max(a.y, b.y) + STEM;
      stemEnd.set(a, y); stemEnd.set(b, y);
      const xa = a.x + (up ? 6.1 : -6.1), xb = b.x + (up ? 6.1 : -6.1), th = up ? 4.5 : -4.5;
      s += `<path class="beam" fill="currentColor" d="M${r1(xa - 0.65)} ${r1(y)} L${r1(xb + 0.65)} ${r1(y)} L${r1(xb + 0.65)} ${r1(y + th)} L${r1(xa - 0.65)} ${r1(y + th)} Z"/>`;
    });
    items.forEach((it) => {
      const up = UP[it.v], pos = it.pos;
      let g = `<g class="note nh-note${color(it)}" transform="translate(${r1(it.x)} ${r1(it.y)})" style="color:${fillOf(it)}">`;
      for (let L = -2; L >= pos; L -= 2) g += `<line class="ledger" x1="-11" x2="11" y1="${(pos - L) * HALF}" y2="${(pos - L) * HALF}" stroke="currentColor" stroke-width="1.3"/>`;
      for (let L = 10; L <= pos; L += 2) g += `<line class="ledger" x1="-11" x2="11" y1="${(pos - L) * HALF}" y2="${(pos - L) * HALF}" stroke="currentColor" stroke-width="1.3"/>`;
      if (it.acc != null) g += `<g transform="translate(${-18 - it.dx - (it.acc === -2 ? 5 : 0)} 0)">${MQ.ACC_SVG[it.acc]}</g>`;
      if (it.spot >= 0) g += `<circle class="nh-ring${o.sel === it.spot ? ' is-sel' : ''}" cx="0" cy="0" r="10" fill="none" stroke="currentColor" stroke-width="${o.sel === it.spot ? 2.2 : 1.2}"/>`;
      g += it.d >= 4 ? OPEN : FILLED;
      if (it.d === 3) g += `<circle class="dot" cx="11.5" cy="${pos % 2 === 0 ? -3 : 0}" r="1.9" fill="currentColor"/>`;
      const end = stemEnd.has(it) ? stemEnd.get(it) - it.y : up ? -STEM : STEM;
      g += up ? `<line class="stem" x1="6.1" x2="6.1" y1="-1.5" y2="${r1(end)}" stroke="currentColor" stroke-width="1.3"/>` : `<line class="stem" x1="-6.1" x2="-6.1" y1="1.5" y2="${r1(end)}" stroke="currentColor" stroke-width="1.3"/>`;
      if (it.d === 1 && !it.beam) g += up ? `<path class="flag" fill="currentColor" d="M6.1 ${-STEM}C6.1 ${-STEM + 6} 16.1 ${-STEM + 9} 14.7 ${-STEM + 20}C15.3 ${-STEM + 12.5} 9.1 ${-STEM + 10.5} 6.1 ${-STEM + 9.5}Z"/>`
        : `<path class="flag" fill="currentColor" d="M-6.1 ${STEM}C-6.1 ${STEM - 6} 3.9 ${STEM - 9} 2.5 ${STEM - 20}C3.1 ${STEM - 12.5} -3.1 ${STEM - 10.5} -6.1 ${STEM - 9.5}Z"/>`;
      s += g + '</g>';
    });
    // The letters, in rows above and below the music; two at the same place move apart.
    if (o.letters) {
      const placed = [[], []];
      nh.spots.forEach((sp, j) => {
        if (sp.col < from || sp.col >= to) return;
        const it = items.find((x) => x.spot === j);
        if (!it) return;
        const row = sp.voice < 2 ? 0 : 1;
        let x = it.x - it.dx;
        while (placed[row].some((px) => Math.abs(px - x) < 15)) x += 15;
        placed[row].push(x);
        const y = row ? tagBotY : tagTopY;
        s += `<text class="nh-tag${color(it)}${o.sel === j ? ' is-sel' : ''}" x="${r1(x)}" y="${y}" font-size="14" font-weight="bold" text-anchor="middle" fill="${fillOf(it)}">${MQ.NH_LETTERS[j]}</text>`;
      });
    }
    return { inner: s, W: r1(W), H, top, x0, colW, noteX };
  }
  // A Roman numeral with its figures stacked beside it — in parentheses over a pedal point.
  function rnSVG(x, y, d, paren) {
    const figs = d.figs || [];
    let t = `<text class="nh-rn" x="${r1(x)}" y="${y}" font-size="15" font-weight="bold" text-anchor="middle" fill="currentColor">${paren ? '(' : ''}${accSpan(d.pre)}${esc(d.num)}${d.mark ? `<tspan class="nh-mark">${esc(d.mark)}</tspan>` : ''}`;
    if (figs.length === 1) t += `<tspan class="nh-fig" font-size="10" dy="-7">${accSpan(figs[0])}</tspan>`;
    if (figs.length === 2) t += `<tspan class="nh-fig" font-size="10" dy="-7">${esc(figs[0])}</tspan><tspan class="nh-fig" font-size="10" dx="-6.3" dy="11">${esc(figs[1])}</tspan>`;
    const tail = (d.sec || '') + (paren ? ')' : '');
    if (tail) t += `<tspan dy="${figs.length === 2 ? -4 : figs.length === 1 ? 7 : 0}">${accSpan(tail)}</tspan>`;
    return t + '</text>';
  }

  // The lines of an example: ranges of chords, up to `per` a line (two bars).
  function lines(nh, per) {
    const n = nh.segs.length, out = [];
    for (let a = 0; a < n; a += per) out.push([a, Math.min(n, a + per)]);
    return out;
  }
  // The picture for paper: one line of the example as a standalone SVG, {svg, markup, wIn, hIn}.
  function nhArt(nh, range, opts) {
    const was = MQ.clefFont;
    if (opts && opts.drawnClefs) MQ.clefFont = false;
    const b = build(nh, { from: range[0], to: range[1], showTime: range[0] === 0, print: true, letters: true });
    MQ.clefFont = was;
    const markup = `<svg xmlns="${NS}" class="nh-art" viewBox="0 ${b.top} ${b.W} ${b.H}" width="${b.W}" height="${b.H}" style="color:#000">${b.inner}</svg>`;
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    const hIn = ((opts && opts.height) || 1.25) * 1.55 * (b.H / 330);
    return { svg, markup, wIn: (b.W / b.H) * hIn, hIn };
  }

  Object.assign(MQ, { nhMarkup: build, nhLines: lines, nhArt });
})(typeof window !== 'undefined' ? window : globalThis);
