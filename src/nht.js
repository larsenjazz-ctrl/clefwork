/* Clefwork Harmony — Non-Harmonic Tones. Clefwork writes a short progression in four voices
   (the part-writing engine, MQ.PW, voices it by the common-practice rules), two chords to a bar of 4/4
   in half notes, then adds non-harmonic tones the way the course textbook classifies them (Harmony in
   Contemporary Music, "Non-Harmonic Tones"): by how a note is approached, how it is left, and where it
   falls in the beat.
     Passing tone (PT)             step → step, same direction, between the beats
     Accented passing tone (APT)   the same, landing on the chord change
     Chromatic passing tone (CPT)  a half step filling in a whole step
     Neighbor tone (NT)            step away and back, between the beats
     Chromatic neighbor (CN)       a lower neighbor raised to a half step
     Suspension (SUS)              held over into the new chord, resolving down by step — named 9–8, 7–6,
                                   4–3 by its intervals above the bass; 2–3 when the bass is suspended
     Retardation (RET)             held over, resolving up by step
     Appoggiatura (APP)            leapt to on the beat, left by step the other way
     Escape tone (ET)              step away, then a leap the other way, between the beats
     Anticipation (ANT)            the next chord's note arriving early
     Pedal point (PED)             the bass held while the chord above it changes
   Each non-harmonic tone is highlighted and lettered; students choose what it is from a menu. Two voices
   may take a figure at the same time (double suspensions, passing tones in thirds), or two different
   figures may sound together, when the teacher allows it.
   Time is counted in eighth notes: a chord lasts SPAN = 4. A voice's notes over one chord are a segment
   {durs (eighths, adding up to 4), notes (pitches), tie (per note: tied over from the note before it)}.
   cfg.nht holds the settings; cfg.counts.nht is how many examples the quiz asks. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const { dia, midi } = MQ;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mod = (n, m) => ((n % m) + m) % m;
  const NH_MAX = 15;             // examples in a quiz
  const SPAN = 4;                 // eighths in a chord
  const MAX_SPOTS = 8;            // lettered notes in an example (a–h)
  const LETTERS = 'abcdefgh';

  // What a student can answer. The order never changes: report codes store the index.
  // pick: a kind the teacher can ask for; sus: a suspension named by its intervals, which stands in for
  // SUS when the teacher asks for suspensions by name.
  const KINDS = [
    { id: 'PT', name: 'Passing tone', pick: true, how: 'Step → step, same direction. Between the beats.' },
    { id: 'APT', name: 'Accented passing tone', pick: true, how: 'A passing tone that lands on the beat, as the chord changes.' },
    { id: 'CPT', name: 'Chromatic passing tone', pick: true, how: 'A half step filling in a whole step.' },
    { id: 'NT', name: 'Neighbor tone', pick: true, how: 'Step away from a note and back to it. Between the beats.' },
    { id: 'CN', name: 'Chromatic neighbor tone', pick: true, how: 'A lower neighbor raised to sit a half step below its note.' },
    { id: 'SUS', name: 'Suspension', pick: true, how: 'Held (tied) over from the chord before, then down a step. On the beat.' },
    { id: 'RET', name: 'Retardation', pick: true, how: 'Held over from the chord before, then up a step. On the beat.' },
    { id: 'APP', name: 'Appoggiatura', pick: true, how: 'Leapt to on the beat, left by step the other way.' },
    { id: 'ET', name: 'Escape tone', pick: true, how: 'Step away, then a leap the other way. Between the beats.' },
    { id: 'ANT', name: 'Anticipation', pick: true, how: 'The next chord’s note, arriving early.' },
    { id: 'PED', name: 'Pedal point', pick: true, how: 'The bass holds its note while the chord above it changes.' },
    { id: '9–8', name: '9–8 suspension', sus: true },
    { id: '7–6', name: '7–6 suspension', sus: true },
    { id: '4–3', name: '4–3 suspension', sus: true },
    { id: '2–3', name: '2–3 suspension (bass)', sus: true },
  ];
  const PICKS = KINDS.filter((k) => k.pick);
  const SUS_KINDS = KINDS.map((k, i) => (k.sus ? i : -1)).filter((i) => i >= 0);
  const kindIndex = (id) => KINDS.findIndex((k) => k.id === id);
  const pickMask = (ids) => ids.reduce((m, id) => m | (1 << PICKS.findIndex((k) => k.id === id)), 0);
  const DEFAULT_KINDS = pickMask(['PT', 'NT', 'SUS', 'APP', 'ET', 'ANT']);
  const kindLabel = (i) => (KINDS[i].sus ? KINDS[i].name : `${KINDS[i].name} (${KINDS[i].id})`);

  // length: chords in an example (4, 6 or 8 — two to a bar); mode: 1 major, 2 minor, 3 either; maxSig: up
  // to this many sharps or flats; per: non-harmonic tones in an example (1–4); kinds: a mask over PICKS;
  // dbl: two voices may take the same figure at once; mix: two different figures may sound together;
  // susNames: suspensions are named by their intervals (9–8, 7–6, 4–3, 2–3) rather than just "suspension";
  // show: the chord labels students see — 0 none, 1 Roman numerals, 2 chord symbols, 3 both; menu: 0 the
  // menu lists the kinds this quiz asks for, 1 every kind; hear: students may play the example; score:
  // 'question' (each example one question), 'notes' (each tone a point), 'percent' (share of outOf);
  // gen: the generator's version, so a quiz code keeps its examples.
  function nhSettings(s) {
    s = s || {};
    s.gen = clamp(s.gen | 0 || 1, 1, 7);
    s.length = [4, 6, 8].includes(s.length) ? s.length : 6;
    s.mode = clamp(s.mode | 0 || 1, 1, 3);
    s.maxSig = clamp(s.maxSig == null ? 3 : s.maxSig | 0, 0, 7);
    s.per = clamp(s.per | 0 || 3, 1, 4);
    s.kinds = s.kinds == null ? DEFAULT_KINDS : s.kinds & ((1 << PICKS.length) - 1);
    if (!s.kinds) s.kinds = DEFAULT_KINDS;
    s.dbl = s.dbl ? 1 : 0;
    s.mix = s.mix ? 1 : 0;
    s.susNames = s.susNames == null ? 1 : s.susNames ? 1 : 0;
    s.show = clamp(s.show == null ? 1 : s.show | 0, 0, 3);
    s.menu = s.menu ? 1 : 0;
    s.hear = s.hear == null ? 1 : s.hear ? 1 : 0;
    if (!['question', 'notes', 'percent'].includes(s.score)) s.score = 'question';
    s.outOf = clamp(Math.round(s.outOf || 100), 1, 1000);
    // pick: how many of the examples each student gets (0: all of them). Fewer makes the examples a bank.
    s.pick = clamp(s.pick | 0, 0, NH_MAX);
    return s;
  }
  // How many examples one student gets, of a bank of `total`.
  const nhAsked = (s, total) => (!s.pick || s.pick >= total ? total : s.pick);
  // The questions a student gets: every question that isn't a non-harmonic tone example, and a random draw
  // of the examples — as indices into the quiz's questions, in order; null when everyone gets them all.
  function nhPick(cfg, qs, rnd) {
    const s = nhSettings(cfg.nht);
    const idx = qs.map((q, i) => (q.type === 'nht' ? i : -1)).filter((i) => i >= 0);
    if (!s.pick || s.pick >= idx.length) return null;
    const keep = new Set(shuffle(idx, rnd || Math.random).slice(0, s.pick));
    return qs.map((q, i) => (q.type !== 'nht' || keep.has(i) ? i : -1)).filter((i) => i >= 0);
  }
  const kindOn = (s, id) => !!(s.kinds & (1 << PICKS.findIndex((k) => k.id === id)));
  // The menu students choose from: KINDS indices, in order, with the named suspensions in SUS's place.
  function menuOf(s) {
    const out = [];
    PICKS.forEach((k, i) => {
      if (!s.menu && !(s.kinds & (1 << i))) return;
      if (k.id === 'SUS' && s.susNames) SUS_KINDS.forEach((j) => out.push(j));
      else out.push(kindIndex(k.id));
    });
    return out;
  }
  // What a spot's answer is, given the settings: a named suspension, or plain SUS.
  const answerOf = (s, kind) => kindIndex(KINDS[kindIndex(kind)].sus && !s.susNames ? 'SUS' : kind);

  // ---------- pitches ----------
  const same = (a, b) => !!a && !!b && a.step === b.step && a.oct === b.oct && a.alt === b.alt;
  const gen = (a, b) => dia(b) - dia(a);
  const semi = (a, b) => midi(b) - midi(a);
  const isStep = (a, b) => Math.abs(gen(a, b)) === 1 && Math.abs(semi(a, b)) >= 1 && Math.abs(semi(a, b)) <= 2;
  const inChord = (ch, p) => ch.tones.some((t, i) => ch.degs[i] > 0 && t.step === p.step && t.alt === p.alt);
  const inChordPc = (ch, p) => ch.tones.some((t, i) => ch.degs[i] > 0 && mod(midi({ step: t.step, oct: 4, alt: t.alt }) - midi(p), 12) === 0);
  const P = (p) => ({ step: p.step, oct: p.oct, alt: p.alt });
  const half = (p) => ({ durs: [SPAN], notes: [P(p)], tie: [false] });
  const seg = (durs, notes, tie) => ({ durs: durs.slice(), notes: notes.map(P), tie: tie ? tie.slice() : durs.map(() => false) });
  const shuffle = (list, rng) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  // The diatonic note a step above (dir 1) or below (−1) p, spelled the way the chords around it spell that
  // letter, else the key signature's way.
  function stepFrom(p, dir, kd, chords) {
    const d = MQ.fromDia(dia(p) + dir);
    let alt = MQ.PW.sigAlts(kd.fifths)[d.step];
    for (const ch of chords) {
      const t = ch && ch.tones.find((x, i) => ch.degs[i] > 0 && x.step === d.step);
      if (t) { alt = t.alt; break; }
    }
    return { step: d.step, oct: d.oct, alt };
  }
  // p raised or lowered a half step, keeping its letter (null past a double sharp or flat).
  const chroma = (p, dir) => (Math.abs(p.alt + dir) > 2 ? null : { step: p.step, oct: p.oct, alt: p.alt + dir });
  const inRange = (v, p) => { const r = MQ.PW.TEXTURES.satb.ranges[v]; return midi(p) >= r[0] && midi(p) <= r[1]; };

  // ---------- candidates ----------
  // Every place a figure fits the voiced progression. A candidate: {kind, voice, cols (the chords whose
  // segment it rewrites), segs ({col: segment}), spots ([{col, k}]: which notes are the figure), t (the
  // eighth the figure starts on, in its first column)}.
  function candidates(ex, s, rng) {
    const V = ex.answer, C = ex.chords, n = C.length, kd = ex.key;
    const on = (id) => kindOn(s, id);
    const out = [];
    const add = (kind, voice, col, sg, k, t) => out.push({ kind, voice, cols: [col], segs: { [col]: sg }, spots: [{ col, k }], t });
    for (let i = 0; i < n; i++) {
      for (let v = 0; v < 4; v++) {
        const p = V[i][v], ch = C[i];
        const q = i + 1 < n ? V[i + 1][v] : null, nx = C[i + 1];
        if (!q) continue;
        const d = gen(p, q);
        // Passing tones fill a third (one) or a fourth (two).
        if (on('PT') && Math.abs(d) === 2) {
          const x = stepFrom(p, Math.sign(d), kd, [ch, nx]);
          if (!inChord(ch, x) && isStep(p, x) && isStep(x, q) && inRange(v, x)) add('PT', v, i, seg([2, 2], [p, x]), 1, 2);
        }
        if (on('PT') && Math.abs(d) === 3) {
          const x1 = stepFrom(p, Math.sign(d), kd, [ch, nx]), x2 = stepFrom(x1, Math.sign(d), kd, [ch, nx]);
          if (!inChord(ch, x1) && !inChord(ch, x2) && isStep(p, x1) && isStep(x1, x2) && isStep(x2, q) && inRange(v, x1) && inRange(v, x2)) {
            out.push({ kind: 'PT', voice: v, cols: [i], segs: { [i]: seg([2, 1, 1], [p, x1, x2]) }, spots: [{ col: i, k: 1 }, { col: i, k: 2 }], t: 2 });
          }
        }
        // An accented passing tone lands on the next chord, a step from both sides.
        if (on('APT') && Math.abs(d) === 2) {
          const x = stepFrom(p, Math.sign(d), kd, [nx, ch]);
          if (!inChord(nx, x) && isStep(p, x) && isStep(x, q) && inRange(v, x)) add('APT', v, i + 1, seg([2, 2], [x, q]), 0, 0);
        }
        // A chromatic passing tone splits a whole step.
        if (on('CPT') && Math.abs(d) === 1 && Math.abs(semi(p, q)) === 2) {
          const x = semi(p, q) > 0 ? chroma(p, 1) : chroma(p, -1);
          if (x && !inChordPc(ch, x)) add('CPT', v, i, seg([2, 2], [p, x]), 1, 2);
        }
        // Neighbors decorate a held note. The bass goes down first; the upper voices try both ways.
        if (on('NT') && same(p, q)) {
          const dirs = v === 3 ? [-1, 1] : rng() < 0.5 ? [1, -1] : [-1, 1];
          for (const dd of dirs) {
            const x = stepFrom(p, dd, kd, [ch, nx]);
            if (!inChord(ch, x) && isStep(p, x) && inRange(v, x)) { add('NT', v, i, seg([2, 2], [p, x]), 1, 2); break; }
          }
        }
        // A chromatic neighbor: the lower neighbor raised to a half step, when the scale's is a whole step.
        if (on('CN') && same(p, q)) {
          const lo = stepFrom(p, -1, kd, [ch, nx]);
          if (semi(lo, p) === 2) {
            const x = chroma(lo, 1);
            if (x && !inChordPc(ch, x) && inRange(v, x)) add('CN', v, i, seg([2, 2], [p, x]), 1, 2);
          }
        }
        // Suspensions and retardations: the note held over into the next chord, where it's dissonant,
        // then resolving by step. The resolution isn't already sounding in another upper voice.
        if (!inChord(nx, p) && isStep(p, q)) {
          const bass = V[i + 1][3];
          const doubled = V[i + 1].slice(0, 3).some((u, w) => w !== v && u.step === q.step && u.alt === q.alt);
          if (on('SUS') && d === -1 && v < 3 && !doubled) {
            const iv = mod(gen(bass, p), 7);
            const fig = iv === 3 ? '4–3' : iv === 6 ? '7–6' : iv === 1 && semi(bass, p) > 12 ? '9–8' : null;
            if (fig) add(fig, v, i + 1, seg([2, 2], [p, q], [true, false]), 0, 0);
          }
          if (on('SUS') && d === -1 && v === 3 && V[i + 1].slice(0, 3).some((u) => mod(gen(p, u), 7) === 1)) {
            add('2–3', 3, i + 1, seg([2, 2], [p, q], [true, false]), 0, 0);
          }
          if (on('RET') && d === 1 && v < 3 && !doubled) add('RET', v, i + 1, seg([2, 2], [p, q], [true, false]), 0, 0);
        }
        // An appoggiatura: leapt to on the beat, then a step the other way to the chord note.
        if (on('APP')) {
          for (const dd of shuffle([1, -1], rng)) {
            const x = stepFrom(q, dd, kd, [nx, ch]);
            if (!inChord(nx, x) && isStep(x, q) && Math.abs(gen(p, x)) >= 2 && Math.sign(gen(p, x)) === dd && inRange(v, x)) {
              add('APP', v, i + 1, seg([2, 2], [x, q]), 0, 0);
              break;
            }
          }
        }
        // An escape tone: a step away from the line, then a leap the other way to the next note.
        if (on('ET') && d !== 0 && Math.abs(d) <= 3) {
          const x = stepFrom(p, -Math.sign(d), kd, [ch, nx]);
          if (!inChord(ch, x) && isStep(p, x) && Math.abs(gen(x, q)) >= 2 && inRange(v, x)) add('ET', v, i, seg([3, 1], [p, x]), 1, 3);
        }
        // An anticipation: the next chord's note, early.
        if (on('ANT') && d !== 0 && !inChord(ch, q)) add('ANT', v, i, seg([3, 1], [p, q]), 1, 3);
      }
      // A pedal point: the bass of this chord held under the next, which doesn't contain it, and on into
      // the chord after, whose bass it is again.
      if (on('PED') && i + 2 < n) {
        const b = V[i][3];
        if (midi(V[i + 2][3]) === midi(b) && !inChord(C[i + 1], b) && midi(b) < midi(V[i + 1][2]) - 2) {
          out.push({ kind: 'PED', voice: 3, cols: [i + 1, i + 2], segs: { [i + 1]: seg([SPAN], [b], [true]), [i + 2]: seg([SPAN], [b], [true]) }, spots: [{ col: i + 1, k: 0 }], t: 0 });
        }
      }
    }
    return out;
  }
  // Whether the voices still keep their order (no crossing, no unison between neighbours) at every
  // eighth of a column, with these segments in place of the plain half notes.
  function fits(V, col, segsAt) {
    const at = (v, t) => {
      const sg = segsAt[v] || half(V[col][v]);
      let acc = 0;
      for (let k = 0; k < sg.durs.length; k++) { acc += sg.durs[k]; if (t < acc) return sg.notes[k]; }
      return sg.notes[sg.notes.length - 1];
    };
    for (let t = 0; t < SPAN; t++) {
      for (let v = 0; v < 3; v++) if (midi(at(v, t)) <= midi(at(v + 1, t))) return false;
    }
    return true;
  }
  const segsOf = (cands, col) => { const m = {}; cands.forEach((c) => { if (c.segs[col]) m[c.voice] = c.segs[col]; }); return m; };
  // Up to `want` lettered notes: a pair of figures at once when the teacher allows it, then one figure at
  // a time, as many kinds as fit, never two in neighbouring chords of the same voice.
  function choose(ex, s, want, rng) {
    const all = candidates(ex, s, rng).filter((c) => c.cols.every((col) => fits(ex.answer, col, { [c.voice]: c.segs[col] })));
    const bag = shuffle(all, rng);
    const used = new Set(), chosen = [];
    let count = 0;
    const key = (col, v) => col + ':' + v;
    const free = (c) => c.cols.every((col) => [col - 1, col, col + 1].every((cc) => !used.has(key(cc, c.voice))) && !used.has('col:' + col));
    const take = (list) => {
      list.forEach((c) => { c.cols.forEach((col) => { used.add(key(col, c.voice)); used.add('col:' + col); }); chosen.push(c); count += c.spots.length; });
    };
    // Pairs: two single-chord figures in the same chord, in different voices, that keep the voices in order.
    if ((s.dbl || s.mix) && want >= 2 && rng() < 0.75) {
      const singles = bag.filter((c) => c.cols.length === 1 && c.kind !== '2–3');
      const pairs = [];
      singles.forEach((a, i) => singles.slice(i + 1).forEach((b) => {
        if (a.cols[0] !== b.cols[0] || a.voice === b.voice) return;
        const dbl = a.kind === b.kind || (KINDS[kindIndex(a.kind)].sus && KINDS[kindIndex(b.kind)].sus);
        if (dbl ? !s.dbl || a.t !== b.t : !s.mix) return;
        if (!fits(ex.answer, a.cols[0], { [a.voice]: a.segs[a.cols[0]], [b.voice]: b.segs[b.cols[0]] })) return;
        pairs.push([a, b]);
      }));
      if (pairs.length) take(pick(rng, pairs));
    }
    // Then singles, a new kind first.
    const kinds = shuffle([...new Set(bag.map((c) => c.kind))], rng);
    kinds.forEach((k) => {
      if (count >= want) return;
      const c = bag.find((x) => x.kind === k && free(x) && count + x.spots.length <= MAX_SPOTS);
      if (c) take([c]);
    });
    bag.forEach((c) => { if (count < want && free(c) && count + c.spots.length <= MAX_SPOTS) take([c]); });
    return chosen;
  }

  // ---------- an example ----------
  // Returns {key, chords, segs, spots} or null.
  function makeExample(s, rng) {
    const PW = MQ.PW;
    let best = null;
    const mode = s.mode === 1 ? 'major' : s.mode === 2 ? 'minor' : 'either';
    for (let attempt = 0; attempt < 6; attempt++) {
      const ex = PW.generate({ type: 'roman', length: s.length, mode, maxSig: s.maxSig, sevenths: true, inversions: true, sixFour: true, secondary: false, every: 'mixed', show: ['roman'] }, rng);
      if (!ex || ex.error || ex.texture !== 'satb') continue;
      const chosen = choose(ex, s, s.per, rng);
      const count = chosen.reduce((n, c) => n + c.spots.length, 0);
      const kinds = new Set(chosen.map((c) => c.kind)).size;
      if (!best || count > best.count || (count === best.count && kinds > best.kinds)) best = { ex, chosen, count, kinds };
      if (count >= s.per) break;
    }
    if (!best || !best.count) return null;
    const { ex, chosen } = best;
    const segs = ex.answer.map((V) => V.map(half));
    const paren = new Set();
    chosen.forEach((c) => {
      Object.entries(c.segs).forEach(([col, sg]) => (segs[+col][c.voice] = seg(sg.durs, sg.notes, sg.tie)));
      if (c.kind === 'PED') paren.add(c.cols[0]);
    });
    const tAt = (sg, k) => sg.durs.slice(0, k).reduce((a, b) => a + b, 0);
    const spots = [];
    chosen.forEach((c) => c.spots.forEach((sp) => spots.push({ col: sp.col, voice: c.voice, k: sp.k, kind: c.kind, t: tAt(segs[sp.col][c.voice], sp.k) })));
    spots.sort((a, b) => a.col - b.col || a.t - b.t || a.voice - b.voice);
    spots.forEach((sp) => { sp.ans = answerOf(s, sp.kind); delete sp.t; });
    const chords = ex.chords.map((ch, i) => ({ rn: Object.assign({}, ch.disp), sym: ch.symbol, paren: paren.has(i) }));
    return { key: { fifths: ex.key.fifths, mode: ex.key.mode, tonic: { step: ex.key.tonic.step, alt: ex.key.tonic.alt }, name: PW.keyName(ex.key) }, chords, segs, spots };
  }

  // The questions, made from the quiz's seed (so every student gets the same examples) — and kept, so the
  // builder doesn't redo them at every change of another setting.
  const cache = new Map();
  function nhQuestions(cfg) {
    const n = clamp((cfg.counts && cfg.counts.nht) | 0, 0, NH_MAX);
    if (!n || !MQ.PW) return [];
    const s = nhSettings(cfg.nht);
    const keyOf = JSON.stringify([cfg.seed, n, s.gen, s.length, s.mode, s.maxSig, s.per, s.kinds, s.dbl, s.mix]);
    let list = cache.get(keyOf);
    if (!list) {
      list = [];
      for (let k = 0; k < n; k++) {
        const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ Math.imul(k + 1, 0x9e3779b1) ^ 0x0ac3e5) >>> 0);
        let ex = null;
        for (let tries = 0; tries < 4 && !ex; tries++) ex = makeExample(s, rng);
        if (ex) list.push(ex);
      }
      if (cache.size > 40) cache.clear();
      cache.set(keyOf, list);
    }
    const menu = menuOf(s);
    return list.map((ex, k) => {
      const spots = ex.spots.map((sp) => Object.assign({}, sp, { ans: answerOf(s, sp.kind) }));
      // Every answer is on the menu, even one the teacher turned off after the examples were made.
      const m = menu.slice();
      spots.forEach((sp) => { if (!m.includes(sp.ans)) m.push(sp.ans); });
      m.sort((a, b) => a - b);
      const pairs = spots.some((a, i) => spots.some((b, j) => j !== i && a.col === b.col && a.voice !== b.voice));
      return {
        type: 'nht', clef: 'grand', grand: true,
        text: `Name each highlighted non-harmonic tone${spots.length > 1 ? ` (${LETTERS[0]}–${LETTERS[spots.length - 1]})` : ''}.`,
        hint: `In ${ex.key.name}, four voices, two chords a measure. Find the chord first, then choose what each lettered note is.` + (pairs ? ' Two voices may take a figure at the same time.' : ''),
        nh: { n: k, key: ex.key, chords: ex.chords, segs: ex.segs, spots, menu: m, show: s.show, hear: s.hear },
        sig: 'nh' + k, tags: [],
      };
    });
  }

  // ---------- answers ----------
  // A response is one choice per lettered note, in order: a KINDS index, or −1 for blank.
  const cleanNh = (q, resp) => q.nh.spots.map((_, j) => { const v = resp && resp[j]; return typeof v === "number" && v >= 0 && v < KINDS.length ? v | 0 : -1; });
  const markNh = (q, resp) => { const r = cleanNh(q, resp); return q.nh.spots.map((sp, j) => r[j] === sp.ans); };
  const gradeNh = (q, resp) => { const n = q.nh.spots.length; return n ? markNh(q, resp).filter(Boolean).length / n : 1; };
  const hasNhAnswer = (q, resp) => cleanNh(q, resp).some((v) => v >= 0);
  const compareNh = (q, resp) => { const mk = markNh(q, resp); return { notes: mk.length, wrong: mk.filter((x) => !x).length }; };
  const describeNh = (q) => q.nh.spots.map((sp, j) => `${LETTERS[j]}: ${KINDS[sp.ans].name}`).join(' · ');

  // ---------- playback ----------
  // Sound events for MQ.Audio.sequence: every voice's notes in rhythm (tied notes sound once).
  // eighth: seconds per eighth note.
  function nhEvents(nh, eighth) {
    const events = [];
    for (let v = 0; v < 4; v++) {
      let last = null;
      nh.segs.forEach((col, c) => {
        const sg = col[v];
        let t = c * SPAN;
        sg.notes.forEach((p, k) => {
          const d = sg.durs[k], m = midi(p);
          if (sg.tie[k] && last && last.midi === m && last.end === t) { last.dur += d; last.end = t + d; }
          else { last = { at: t, dur: d, midi: m, end: t + d }; events.push(last); }
          t += d;
        });
      });
    }
    return { events: events.map((e) => ({ at: e.at * eighth, dur: e.dur * eighth * 0.95, midi: e.midi, voice: 'piano', vel: 0.22 })), total: nh.segs.length * SPAN * eighth };
  }

  Object.assign(MQ, {
    NH_MAX, NH_SPAN: SPAN, NH_KINDS: KINDS, NH_PICKS: PICKS, NH_LETTERS: LETTERS, nhKindLabel: kindLabel, nhSettings, nhMenu: menuOf,
    nhQuestions, nhAsked, nhPick, cleanNh, markNh, gradeNh, hasNhAnswer, compareNh, describeNh, nhEvents,
  });
})(typeof window !== 'undefined' ? window : globalThis);
