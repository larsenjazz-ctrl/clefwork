/* Clefwork Rhythm — the rhythm grid. Students see (or hear) a rhythm and show on a grid where each
   note starts and how long it lasts: one row a measure, the beats across the top, each beat split
   into boxes of a sixteenth, eighth or quarter note. They write the note's value in the box where it
   starts, then drag its arrow across the boxes it lasts — a half note on sixteenth-note boxes starts
   in one box and reaches across eight.
   A student's grid is, for each measure, a list of entries {c: first box, n: boxes, v, d, r} — value,
   dot and rest as in rhythm.js. Rests may be left blank, or marked and graded as the teacher chooses. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const NS = 'http://www.w3.org/2000/svg';
  const BOX_NAMES = { 3: 'sixteenth', 6: 'eighth', 12: 'quarter' };
  const BEAT_NAMES = { q: 'quarter notes', h: 'half notes', 'q.': 'dotted quarter notes', e: 'eighth notes' };
  const VALUE_NAMES = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'];
  const MAX_CELLS = 24;                           // 6/4, 12/8 and 3/2 in sixteenths

  // ---------- the grid ----------
  // The boxes of one measure, and where each beat starts — or null when the beats don't split into
  // whole boxes (a dotted-quarter beat can't hold quarter-note boxes).
  function gridSpec(meter, box) {
    const info = MQ.rhythmMeter(meter);
    if (info.beats.some((b) => b.len % box)) return null;
    return { info, box, cells: info.len / box, beats: info.beats.map((b, k) => ({ from: b.at / box, n: b.len / box, k })) };
  }
  const boxName = (box) => BOX_NAMES[box] || 'sixteenth';
  const noteName = (e) => `${e.d ? 'dotted ' : ''}${VALUE_NAMES[e.v]} ${e.r ? 'rest' : 'note'}`;
  const an = (word) => (/^[aeiou]/.test(word) ? 'an ' : 'a ') + word;

  // What stops an example from being a rhythm grid, in words.
  function gridProblems(ex, grid) {
    const box = MQ.rhythmGrid(Object.assign({}, grid)).box;
    const spec = gridSpec(ex.meter, box);
    if (!spec) {
      const info = MQ.rhythmMeter(ex.meter);
      return [`${info.label} has beats of ${BEAT_NAMES[info.tempo]}${info.grouping ? ` (${info.grouping})` : ''}, which don’t split into ${boxName(box)}-note boxes. Choose smaller boxes or another time signature.`];
    }
    const out = [];
    for (let m = 0; m < ex.measures; m++) {
      const events = (ex.layers[0] && ex.layers[0][m]) || [];
      const trip = events.find((e) => e.t);
      const odd = events.find((e) => !e.t && MQ.rhythmDur(e) % box);
      const bar = `m. ${(ex.first || 1) + m}`;
      if (trip) out.push(`${bar} has a triplet — triplets don’t fit a grid of boxes.`);
      else if (odd) out.push(`${bar}: ${an(noteName(odd))} ${MQ.rhythmDur(odd) < box ? 'is shorter than a box' : 'doesn’t fill whole boxes'} (each box is ${an(boxName(box))} note).`);
    }
    return out;
  }

  // ---------- questions ----------
  const bars = (first, n) => (n > 1 ? `m. ${first}–${first + n - 1}` : `m. ${first}`);
  function gridQuestion(ex, info, i, grid) {
    const g = MQ.rhythmGrid(Object.assign({}, grid));
    const heard = g.show > 0, seen = g.show !== 1;
    return {
      type: 'rgrid', clef: 'treble',
      text: `Example ${i + 1}: ${seen ? '' : 'listen, then '}show where each note starts and how long it lasts.`,
      hint: `Write the note value in the box where it starts, and draw an arrow across the boxes it lasts.${g.rests ? ' Mark the rests too.' : ' Leave rests blank.'} `
        + `${bars(ex.first, ex.measures)}, ${info.label}${info.grouping ? ` (${info.grouping})` : ''}. Each box is ${an(boxName(g.box))} note.`
        + (heard ? ` Tempo: ${MQ.rhythmTempoText(info, ex.tempo)}.` : ''),
      rh: {
        n: i, meter: Object.assign({}, ex.meter), measures: ex.measures, tempo: ex.tempo, parts: 1, first: ex.first,
        layers: [ex.layers[0].slice(0, ex.measures).map((m) => MQ.rhythmCleanEvents(m))],
        grid: { box: g.box, show: g.show, rests: g.rests },
      },
      sig: 'rg' + i, tags: [],
    };
  }

  // ---------- answers ----------
  // Tidies a student's grid: whole numbers, inside the measure, in order, never overlapping.
  function cleanGrid(resp, measures, cells) {
    const out = [];
    for (let m = 0; m < measures; m++) {
      const list = ((resp && resp[m]) || []).map((e) => ({
        c: e.c | 0, n: Math.max(1, e.n | 0), v: Math.max(0, Math.min(4, e.v | 0)), d: e.d ? 1 : 0, r: e.r ? 1 : 0,
      })).filter((e) => e.c >= 0 && e.c < cells).sort((a, b) => a.c - b.c);
      const keep = [];
      list.forEach((e) => {
        const prev = keep[keep.length - 1];
        if (prev && e.c < prev.c + prev.n) return;
        keep.push(e);
      });
      keep.forEach((e, k) => { e.n = Math.min(e.n, (keep[k + 1] ? keep[k + 1].c : cells) - e.c); });
      out.push(keep);
    }
    return out;
  }
  // The answer's notes (and rests, when they're marked): where each starts and how many boxes it lasts.
  function itemsOf(events, box, rests) {
    const out = [];
    let t = 0;
    (events || []).forEach((e, i) => {
      const d = MQ.rhythmDur(e);
      if (!e.r || rests) out.push({ c: t / box, n: d / box, v: e.v, d: e.d ? 1 : 0, r: e.r ? 1 : 0, i });
      t += d;
    });
    return out;
  }
  // A note of the answer is right when the student's entry starts in the same box, has the same value
  // (and dot), and covers the same number of boxes. A note missing or wrong is a wrong note, and so is
  // every extra entry. Rests count only when the teacher asks for them to be marked.
  // {notes, wrong, measures: [{want, got, ok}], mine} — want marks the answer's notes and rests, got the
  // student's entries: true right, false wrong, null not graded.
  function compareGrid(q, resp) {
    const R = q.rh, g = R.grid, spec = gridSpec(R.meter, g.box);
    const mine = cleanGrid(resp, R.measures, spec ? spec.cells : 0);
    let notes = 0, wrong = 0;
    const measures = R.layers[0].slice(0, R.measures).map((events, m) => {
      const want = events.map(() => null), got = mine[m].map(() => null);
      let bad = 0;
      itemsOf(events, g.box, g.rests).forEach((a) => {
        notes++;
        const k = mine[m].findIndex((x) => x.c === a.c && x.r === a.r);
        const x = mine[m][k];
        const ok = !!x && x.v === a.v && x.d === a.d && x.n === a.n;
        want[a.i] = ok;
        if (x) got[k] = ok;
        if (!ok) bad++;
      });
      mine[m].forEach((x, k) => { if (got[k] == null && (!x.r || g.rests)) { got[k] = false; bad++; } });
      wrong += bad;
      return { want, got, ok: !bad };
    });
    return { notes, wrong, measures, mine };
  }
  function gradeGrid(q, resp) {
    const c = compareGrid(q, resp);
    if (!c.notes) return c.wrong ? 0 : 1;
    return Math.max(0, c.notes - c.wrong) / c.notes;
  }
  const hasGridAnswer = (q, resp) => !!resp && resp.some((m) => m && m.length);
  // The answer as text: the rhythm, and the size of the boxes.
  const describeGrid = (q) => `${MQ.rhythmMeter(q.rh.meter).label}  ${MQ.rhythmText(q.rh.layers, q.rh.meter)}  (${boxName(q.rh.grid.box)}-note boxes)`;
  // The answer as grid entries, to draw.
  const answerEntries = (q) => q.rh.layers[0].slice(0, q.rh.measures).map((events) => itemsOf(events, q.rh.grid.box, true).map((x) => ({ c: x.c, n: x.n, v: x.v, d: x.d, r: x.r, i: x.i })));
  // A student's grid as something to play: each note lasts the boxes its arrow covers.
  function gridLayers(entries, measures, box) {
    const L = [];
    for (let m = 0; m < measures; m++) {
      const ev = [];
      let t = 0;
      ((entries && entries[m]) || []).forEach((e) => {
        if (e.c * box > t) ev.push({ v: 2, d: 0, t: 0, r: 1, u: e.c * box - t });
        ev.push({ v: e.v, d: e.d, t: 0, r: e.r, u: e.n * box });
        t = (e.c + e.n) * box;
      });
      L.push(ev);
    }
    return [L];
  }

  // ---------- the picture ----------
  const LW = 64, HH = 28, RH = 48;
  const cellW = (cells) => (cells <= 4 ? 64 : cells <= 6 ? 54 : cells <= 9 ? 46 : cells <= 12 ? 40 : cells <= 16 ? 35 : 29);
  // A note or rest, as it would be written — the head at (0, 0), drawn at 80% of the staff's size.
  function glyph(e) {
    const D = MQ.rhythmDraw;
    let s = '';
    if (e.r) {
      const pos = { rest: -9, wholeTop: -12, halfBottom: -7 };
      if (e.v === 0) s += D.lineSVG(-9, -12, 9, -12, 1.2);
      if (e.v === 1) s += D.lineSVG(-9, -7, 9, -7, 1.2);
      s += D.restSVG(e.v, 0, pos);
      if (e.d) s += D.dotSVG(9, -9);
    } else {
      s += D.headSVG(e.v, 0, 0);
      if (e.v >= 1) s += D.lineSVG(5.7, -1.5, 5.7, -30, 1.3);
      if (e.v >= 3) s += D.flagsSVG(5.1, -30, true, e.v - 2);
      if (e.d) s += D.dotSVG(e.v === 0 ? 12 : 11, -2.5);
    }
    return s;
  }
  // model: {meter, measures, first, box, entries}. opts: print, cur {m, c, n}, sel {m, k}, marks
  // {side: 'got'|'want', measures}, playing, editing.
  function build(model, opts) {
    const o = Object.assign({ print: false, cur: null, sel: null, marks: null, playing: -1, editing: false, dimRests: false }, opts);
    const D = MQ.rhythmDraw, r1 = D.r1;
    const spec = gridSpec(model.meter, model.box) || gridSpec(model.meter, 3);
    const cells = spec.cells, CW = cellW(cells);
    const W = 2 + LW + cells * CW, H = 2 + HH + model.measures * RH;
    const x0 = 1 + LW, y0 = 1 + HH;
    const X = (c) => x0 + c * CW, Y = (m) => y0 + m * RH;
    const beatAt = new Set(spec.beats.map((b) => b.from));
    let s = '';
    // ---------- the table ----------
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
    s += `<rect x="1" y="1" width="${W - 2}" height="${HH}" fill="#c9ccd2"/>`;
    const marks = o.marks && o.marks.measures;
    if (!o.print) {
      for (let m = 0; m < model.measures; m++) {
        const tint = marks && o.marks.side === 'got' ? (marks[m].ok ? ' is-right' : ' is-wrong') : '';
        s += `<rect class="g-row halo${o.playing === m ? ' is-playing' : ''}${tint}" data-m="${m}" fill="transparent" x="${x0}" y="${Y(m)}" width="${cells * CW}" height="${RH}"/>`;
      }
    }
    // Boxes a note lasts through are tinted; the box or boxes chosen for the next note are outlined.
    const entries = model.entries || [];
    if (!o.print) {
      entries.forEach((list, m) => (list || []).forEach((e, k) => {
        const sel = o.sel && o.sel.m === m && o.sel.k === k;
        // Rests that aren't graded stay untinted.
        const flags = marks && marks[m] ? (o.marks.side === 'got' ? marks[m].got : marks[m].want) : null;
        if (e.r && !sel && (o.dimRests || (flags && (o.marks.side === 'got' ? flags[k] : flags[e.i]) == null))) return;
        s += `<rect class="g-span halo${sel ? ' is-sel' : ''}" fill="transparent" x="${X(e.c) + 1}" y="${Y(m) + 1}" width="${e.n * CW - 2}" height="${RH - 2}"/>`;
      }));
      if (o.editing && o.cur && !o.sel) s += `<rect class="g-cur halo" fill="transparent" x="${X(o.cur.c) + 2}" y="${Y(o.cur.m) + 2}" width="${o.cur.n * CW - 4}" height="${RH - 4}" rx="4"/>`;
    }
    // Lines: thin between boxes, thicker between beats, measures and around the edge.
    for (let m = 1; m < model.measures; m++) s += D.lineSVG(1, Y(m), W - 1, Y(m), 1.1);
    for (let c = 1; c < cells; c++) {
      const beat = beatAt.has(c);
      s += D.lineSVG(X(c), beat ? 1 : y0, X(c), H - 1, beat ? 1.6 : 0.6);
    }
    s += D.lineSVG(x0, 1, x0, H - 1, 1.6);
    s += D.lineSVG(1, y0, W - 1, y0, 1.6);
    s += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="currentColor" stroke-width="2"/>`;
    // ---------- labels ----------
    spec.beats.forEach((b) => {
      const label = b.n * CW >= 58 ? `Beat ${b.k + 1}` : String(b.k + 1);
      s += `<text class="clabel g-beat" x="${X(b.from) + 7}" y="${1 + HH / 2 + 5}" font-size="13" fill="currentColor">${label}</text>`;
    });
    for (let m = 0; m < model.measures; m++) {
      s += `<text class="clabel g-mlabel" x="10" y="${Y(m) + RH / 2 + 5}" font-size="13" fill="currentColor">m. ${(model.first || 1) + m}</text>`;
    }
    // ---------- the notes ----------
    const geo = { x0, y0, CW, RH, cells, measures: model.measures, W, H };
    entries.forEach((list, m) => (list || []).forEach((e, k) => {
      const flags = marks && marks[m] ? (o.marks.side === 'got' ? marks[m].got : marks[m].want) : null;
      const f = flags ? (o.marks.side === 'got' ? flags[k] : flags[e.i]) : null;
      const mark = f == null ? ((flags || o.dimRests) && e.r ? ' is-dim' : '') : f ? (o.marks.side === 'got' ? ' is-right' : '') : o.marks.side === 'got' ? ' is-wrong' : ' is-missed';
      const sel = !o.print && o.sel && o.sel.m === m && o.sel.k === k;
      const hx = X(e.c) + Math.min(13, CW / 2 - 2), hy = Y(m) + 34;
      let g = `<g transform="translate(${r1(hx)} ${hy}) scale(0.8)">${glyph(e)}</g>`;
      const end = X(e.c + e.n) - 6, from = hx + 16;
      if (e.n > 1 && end - from > 6) {
        const y = hy - 8;
        g += D.lineSVG(from, y, end, y, 1.6) + `<path d="M${r1(end - 7)} ${y - 4.5}L${r1(end)} ${y}L${r1(end - 7)} ${y + 4.5}" fill="none" stroke="currentColor" stroke-width="1.6"/>`;
      }
      if (sel && !model.readOnly) g += `<circle class="g-grip halo" cx="${r1(X(e.c + e.n) - 3)}" cy="${Y(m) + RH / 2}" r="4.5"/>`;
      s += `<g class="g-ent${sel ? ' is-sel' : ''}${mark}" data-m="${m}" data-k="${k}">${g}</g>`;
    }));
    return { W, H, inner: s, geo, spec };
  }
  // For paper and Word: the grid as its own SVG, `wIn` inches wide at most.
  function gridArt(model, opts) {
    const b = build(model, Object.assign({ print: true }, opts));
    const wIn = Math.min((opts && opts.wIn) || 7, b.W / 86);
    // Sized by its own width on the printed page, not the staff height the other pictures use.
    const markup = `<svg xmlns="${NS}" class="rgrid" viewBox="0 0 ${b.W} ${b.H}" width="${b.W}" height="${b.H}" style="color:#000;font-family:Georgia,'Times New Roman',serif;width:${Math.round(wIn * 100) / 100}in;height:auto;max-width:100%">${b.inner}</svg>`;
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    return { svg, markup, wIn, hIn: (wIn * b.H) / b.W };
  }

  // ---------- the interactive grid ----------
  // opts: {meter, measures, first, box, entries, readOnly, marks, answer (entries with the answer's
  // note numbers, to show it marked), dimRests (rests that aren't graded, drawn faint), onChange(entries), onMove()}
  class RhythmGrid {
    constructor(host, opts) {
      this.o = Object.assign({ readOnly: false, marks: null, onChange: null, onMove: null }, opts);
      // Sixteenth-note boxes fit every meter; a teacher's draft may ask for boxes that don't.
      const box = gridSpec(this.o.meter, this.o.box) ? this.o.box : 3;
      this.spec = gridSpec(this.o.meter, box);
      this.model = { meter: this.o.meter, measures: this.o.measures, first: this.o.first || 1, box, readOnly: !!this.o.readOnly };
      this.model.entries = cleanGrid(this.o.entries, this.model.measures, this.spec.cells);
      if (this.o.answer) this.model.entries = this.o.answer;      // the answer, drawn with its marks
      this.cur = { m: 0, c: 0, n: 1 };
      this.sel = null;
      this.playing = -1;
      this.drag = null;
      // Start where the answer stops: the first empty box.
      if (!this.o.readOnly) this.toFirstFree();
      const svg = (this.svg = document.createElementNS(NS, 'svg'));
      svg.setAttribute('class', 'rgrid' + (this.o.readOnly ? ' is-readonly' : ''));
      this.svg = svg;
      svg.setAttribute('role', this.o.readOnly ? 'img' : 'application');
      if (!this.o.readOnly) svg.setAttribute('tabindex', '0');
      host.append(svg);
      if (!this.o.readOnly) this.bind();
      this.render();
      // Too wide for its box (a phone): the grid scrolls sideways, so a swipe scrolls it rather than
      // stretching a note — the Longer and Shorter buttons do that.
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.fit()).observe(host);
    }
    fit() {
      const host = this.svg.parentNode;
      if (host) this.svg.classList.toggle('is-wide', host.clientWidth > 0 && host.clientWidth - 12 < parseFloat(this.svg.style.minWidth || 0));
    }
    entries() { return this.model.entries.map((L) => L.map((e) => ({ c: e.c, n: e.n, v: e.v, d: e.d, r: e.r }))); }
    toFirstFree() {
      for (let m = 0; m < this.model.measures; m++) {
        for (let c = 0; c < this.spec.cells; c++) if (this.entryAt(m, c) < 0) { this.cur = { m, c, n: 1 }; return; }
      }
    }
    render() {
      const b = build(this.model, {
        cur: this.cur, sel: this.sel, marks: this.o.marks, playing: this.playing, editing: !this.o.readOnly, dimRests: !!this.o.dimRests,
      });
      this.geo = b.geo;
      this.svg.setAttribute('viewBox', `0 0 ${b.W} ${b.H}`);
      this.svg.style.minWidth = Math.round(b.W * 0.66) + 'px';
      this.svg.style.maxWidth = Math.round(b.W * 1.45) + 'px';
      this.svg.innerHTML = b.inner;
      this.svg.setAttribute('aria-label', this.describe());
    }
    describe() {
      const info = this.spec.info, M = this.model;
      const rows = M.entries.map((L, m) => `m. ${M.first + m}: ${L.length ? L.map((e) => `${noteName(e)} in box ${e.c + 1}${e.n > 1 ? `, lasting ${e.n} boxes` : ''}`).join('; ') : 'empty'}`).join('. ');
      const how = this.o.readOnly ? '' : ` ${this.where()} Choose a note value to write it there; Shift with the arrow keys makes the selected note last longer or shorter.`;
      return `Rhythm grid: ${M.measures} measure${M.measures > 1 ? 's' : ''} of ${info.label}, ${this.spec.cells} ${boxName(M.box)}-note boxes a measure. ${rows}.${how}`;
    }
    // Where the cursor is, in words.
    where() {
      const M = this.model;
      if (this.sel) {
        const e = M.entries[this.sel.m][this.sel.k];
        return `Selected: the ${noteName(e)} in m. ${M.first + this.sel.m}, box ${e.c + 1}, lasting ${e.n} box${e.n > 1 ? 'es' : ''}.`;
      }
      const c = this.cur, beat = this.spec.beats.filter((b) => b.from <= c.c).pop();
      return `m. ${M.first + c.m}, box ${c.c + 1}${c.n > 1 ? `–${c.c + c.n}` : ''} (beat ${beat.k + 1}).`;
    }
    changed() {
      this.render();
      if (this.o.onChange) this.o.onChange(this.entries());
      if (this.o.onMove) this.o.onMove();
    }
    moved() { this.render(); if (this.o.onMove) this.o.onMove(); }
    focus() { try { this.svg.focus({ preventScroll: true }); } catch (e) { /* not focusable */ } }
    entryAt(m, c) { return this.model.entries[m].findIndex((e) => c >= e.c && c < e.c + e.n); }
    // How many boxes an entry may cover: up to the next entry, or the end of the measure.
    room(m, k) {
      const L = this.model.entries[m], e = L[k];
      return (L[k + 1] ? L[k + 1].c : this.spec.cells) - e.c;
    }
    // Empty boxes from c onward, up to the next entry.
    free(m, c) {
      let n = 0;
      while (c + n < this.spec.cells && this.entryAt(m, c + n) < 0) n++;
      return n;
    }

    // ---------- editing ----------
    // Writes a note or rest in the chosen box (lasting the boxes chosen with it), or changes the
    // selected one's value and keeps its length.
    place(sym) {
      const e = { v: sym.v, d: sym.d ? 1 : 0, r: sym.r ? 1 : 0 };
      if (this.sel) {
        Object.assign(this.model.entries[this.sel.m][this.sel.k], e);
      } else {
        const { m, c, n } = this.cur;
        const L = this.model.entries[m];
        const k = L.filter((x) => x.c < c).length;
        L.splice(k, 0, Object.assign({ c, n: Math.max(1, Math.min(n, this.free(m, c))) }, e));
        this.sel = { m, k };
      }
      this.changed();
    }
    // The selected note lasts one box more or less (or the boxes chosen for the next note grow).
    resize(delta) {
      if (this.sel) {
        const e = this.model.entries[this.sel.m][this.sel.k];
        const n = Math.max(1, Math.min(this.room(this.sel.m, this.sel.k), e.n + delta));
        if (n === e.n) return false;
        e.n = n;
        this.changed();
        return true;
      }
      const n = Math.max(1, Math.min(this.free(this.cur.m, this.cur.c), this.cur.n + delta));
      if (n === this.cur.n) return false;
      this.cur.n = n;
      this.moved();
      return true;
    }
    // Onto box c of measure m: a note there is selected, an empty box becomes the cursor.
    goTo(m, c) {
      const k = this.entryAt(m, c);
      if (k >= 0) { this.sel = { m, k }; this.cur = { m, c: this.model.entries[m][k].c, n: 1 }; } else { this.sel = null; this.cur = { m, c, n: 1 }; }
      this.moved();
    }
    move(dir) {
      const cells = this.spec.cells, M = this.model;
      const at = this.sel ? M.entries[this.sel.m][this.sel.k] : this.cur;
      let m = this.sel ? this.sel.m : this.cur.m;
      let c = dir > 0 ? at.c + at.n : at.c - 1;
      if (c >= cells) { if (m + 1 >= M.measures) return; m++; c = 0; }
      if (c < 0) { if (m === 0) return; m--; c = cells - 1; }
      this.goTo(m, c);
    }
    moveRow(dir) {
      const m = Math.max(0, Math.min(this.model.measures - 1, (this.sel ? this.sel.m : this.cur.m) + dir));
      const c = this.sel ? this.model.entries[this.sel.m][this.sel.k].c : this.cur.c;
      this.goTo(m, c);
    }
    remove() {
      if (!this.sel) return false;
      const { m, k } = this.sel, e = this.model.entries[m][k];
      this.model.entries[m].splice(k, 1);
      this.sel = null;
      this.cur = { m, c: e.c, n: 1 };
      this.changed();
      return true;
    }
    clearRow() {
      const m = this.sel ? this.sel.m : this.cur.m;
      if (!this.model.entries[m].length) return false;
      this.model.entries[m] = [];
      this.sel = null;
      this.cur = { m, c: 0, n: 1 };
      this.changed();
      return true;
    }
    deselect() { if (this.sel) { this.sel = null; this.moved(); } }
    setPlaying(m) {
      this.playing = m;
      this.svg.querySelectorAll('.g-row').forEach((el) => el.classList.toggle('is-playing', +el.dataset.m === m));
    }
    // ---------- pointer: click a box, drag across boxes, drag a note's arrow ----------
    pt(cx, cy) {
      const k = this.svg.getScreenCTM();
      if (!k) return { x: -1, y: -1 };
      const p = new DOMPoint(cx, cy).matrixTransform(k.inverse());
      return { x: p.x, y: p.y };
    }
    boxAt(p, m) {
      const g = this.geo;
      const c = Math.max(0, Math.min(g.cells - 1, Math.floor((p.x - g.x0) / g.CW)));
      if (m != null) return { m, c };
      const row = Math.floor((p.y - g.y0) / g.RH);
      if (row < 0 || row >= g.measures || p.x < g.x0) return null;
      return { m: row, c };
    }
    bind() {
      const svg = this.svg;
      svg.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        const hit = this.boxAt(this.pt(e.clientX, e.clientY));
        if (!hit) return;
        e.preventDefault();
        this.focus();
        const k = this.entryAt(hit.m, hit.c);
        if (k >= 0) {
          this.sel = { m: hit.m, k };
          this.drag = { size: true, m: hit.m, k, from: this.model.entries[hit.m][k].n, moved: false };
        } else {
          this.sel = null;
          this.cur = { m: hit.m, c: hit.c, n: 1 };
          this.drag = { size: false, m: hit.m, a: hit.c };
        }
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        this.moved();
      });
      svg.addEventListener('pointermove', (e) => {
        const d = this.drag;
        if (!d) return;
        const { c } = this.boxAt(this.pt(e.clientX, e.clientY), d.m);
        if (d.size) {
          const en = this.model.entries[d.m][d.k];
          const n = Math.max(1, Math.min(this.room(d.m, d.k), c - en.c + 1));
          if (n !== en.n) { en.n = n; d.moved = true; this.render(); }
        } else {
          let a = d.a, b = c;
          if (b >= a) b = a + Math.min(b - a + 1, this.free(d.m, a)) - 1;
          else { let lo = a; while (lo > b && this.entryAt(d.m, lo - 1) < 0) lo--; b = a; a = lo; }
          if (a !== this.cur.c || b - a + 1 !== this.cur.n) { this.cur = { m: d.m, c: a, n: b - a + 1 }; this.render(); }
        }
      });
      const end = () => {
        const d = this.drag;
        this.drag = null;
        if (d && d.size && d.moved) this.changed();
        else if (d) this.moved();
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
    }
  }

  Object.assign(MQ, {
    RhythmGrid, gridSpec, gridProblems, gridQuestion, cleanGrid, compareGrid, gradeGrid, hasGridAnswer, describeGrid,
    gridAnswerEntries: answerEntries, gridLayers, gridArt, gridBoxName: boxName, GRID_MAX_CELLS: MAX_CELLS,
  });
})(typeof window !== 'undefined' ? window : globalThis);
