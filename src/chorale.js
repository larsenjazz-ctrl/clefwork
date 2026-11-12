/* Clefwork Voice Leading — Four-Part Writing. Students write chorale-style music for soprano, alto, tenor
   and bass on the grand staff, one voice at a time, in any rhythm down to a sixteenth note. An exercise
   is four to eight measures in a key and meter (4/4, 3/4, 2/4 or 6/8) the teacher chooses, and comes one of seven ways:
     a melody to harmonize, a bass line to write over, a melody and a bass to fill in between — each made
     by Clefwork from a progression it voices itself (the part-writing engine, MQ.PW) — or empty measures
     with chord symbols, with Roman numerals, with both, or with nothing at all.
   There is no single right answer, so the work is checked against the rules of the course textbook
   (Harmony in Contemporary Music, Unit 9 "Voice Leading" and the non-harmonic tones of Unit 10):
     Rule 1   Make every voice a good melody: no augmented leaps, sevenths or leaps past an octave; after a
              leap larger than a fourth, turn back by step; two leaps the same way outline a triad (the bass, which
              moves from root to root, is left its leaps).
     Rule 2   Keep each voice in its range: soprano C4–G5, alto G3–D5, tenor C3–G4, bass E2–C4.
     Rule 3   No more than an octave between soprano and alto, or alto and tenor.
     Rule 4   Do not cross voices.
     Rule 5   Double the root of a root-position triad (the third in V–vi; three roots at the end are fine).
     Rule 6   Never double the leading tone.
     Rule 7   Resolve the tendency tones: the leading tone in the soprano up to the tonic, the seventh of a
              chord down by step.
     Rule 8   No parallel fifths or octaves.
     Rule 9   No contrary fifths or octaves (but 5–1 in both outer voices at the last cadence).
     Rule 10  No direct fifths or octaves in the outer voices unless the soprano moves by step.
   Where the chords are known, every note must be a note of its chord or move like a non-harmonic tone
   (passing, neighbor, suspension, retardation, appoggiatura, escape tone, anticipation, pedal point), the
   bass must be the chord's bass note, and each chord needs its root and third (and seventh).
   Each chord — or, with no chords given, each measure — is a point, lost to any broken rule that touches
   it; lesser matters (doubling, direct fifths, how leaps are left) are noted without costing a point. That
   score is only Clefwork's suggestion: the teacher sees the music and the marks and sets the grade.
   Time is counted as in Clefwork Rhythm, 48 to a whole note. A voice is [measure][event], an event
   {v: 0 whole … 4 sixteenth, d: dotted, t: triplet, r: rest, p: pitch, tie}.
   cfg.chor holds the settings; cfg.counts.chorale is how many exercises the quiz asks. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const { dia, midi } = MQ;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mod = (n, m) => ((n % m) + m) % m;
  const CHOR_MAX = 10;
  const VOICES = ['soprano', 'alto', 'tenor', 'bass'];
  const RANGES = [[60, 79], [55, 74], [48, 67], [40, 60]];
  const RANGE_TEXT = ['C4–G5', 'G3–D5', 'C3–G4', 'E2–C4'];
  // Where a voice's first typed note goes: the middle of its practical octave.
  const CENTERS = [72, 65, 57, 50];
  const METERS = [{ n: 4, d: 4 }, { n: 3, d: 4 }, { n: 2, d: 4 }, { n: 6, d: 8 }];
  // The ways an exercise comes. gives: the voices printed; show: the labels (1 Roman numerals, 2 chord
  // symbols, 3 both; null: the teacher's choice for exercises with a given line); free: no chords at all.
  const KINDS = [
    { id: 'mel', label: 'A melody to harmonize', gives: [0], show: null },
    { id: 'bass', label: 'A bass line to write over', gives: [3], show: null },
    { id: 'both', label: 'A melody and a bass line', gives: [0, 3], show: null },
    { id: 'sym', label: 'Empty measures with chord symbols', gives: [], show: 2 },
    { id: 'rn', label: 'Empty measures with Roman numerals', gives: [], show: 1 },
    { id: 'rnsym', label: 'Empty measures with Roman numerals and chord symbols', gives: [], show: 3 },
    { id: 'blank', label: 'Completely blank measures', gives: [], show: 0, free: true },
  ];
  const HARMONY = [
    { label: 'Root-position triads' },
    { label: 'With inversions' },
    { label: 'With inversions and seventh chords' },
  ];

  // kinds: a mask over KINDS (the quiz takes them in turn); lines: the labels printed with a given melody
  // or bass (0 none, 1 Roman numerals, 2 chord symbols, 3 both); measures: 4–8; meter: an index into
  // METERS; mode: 1 major, 2 minor, 3 either; sig: the key signature as sharps + 7 (0 seven flats … 14
  // seven sharps), or 15 for Clefwork's choice of up to maxSig sharps or flats; harm: an index into
  // HARMONY; gen: the generator's version, so a quiz code keeps its exercises.
  function chorSettings(s) {
    s = s || {};
    s.gen = clamp(s.gen | 0 || 1, 1, 7);
    s.kinds = s.kinds == null ? 7 : s.kinds & ((1 << KINDS.length) - 1);
    if (!s.kinds) s.kinds = 7;
    s.lines = clamp(s.lines == null ? 1 : s.lines | 0, 0, 3);
    s.measures = clamp(s.measures | 0 || 4, 4, 8);
    s.meter = clamp(s.meter | 0, 0, METERS.length - 1);
    s.mode = clamp(s.mode | 0 || 1, 1, 3);
    s.sig = clamp(s.sig == null ? 15 : s.sig | 0, 0, 15);
    s.maxSig = clamp(s.maxSig == null ? 3 : s.maxSig | 0, 0, 7);
    s.harm = clamp(s.harm | 0, 0, HARMONY.length - 1);
    return s;
  }

  // ---------- rhythm rules ----------
  // Nothing shorter than a sixteenth, and triplets only of eighths and quarters. A triplet starts on a
  // beat (MQ.tripletGroups sees to that); a group of quarter-note triplets fills a half note, so it starts
  // on beat 1 or 3 of 4/4, beat 1 or 2 of 3/4, beat 1 of 2/4.
  function valueProblem(ev) {
    if (ev.t && ev.v !== 2 && ev.v !== 3) return 'Triplets here are eighth notes or quarter notes.';
    if (ev.t && ev.d) return 'A triplet note can’t be dotted.';
    if (ev.d && ev.v === 4) return 'A dotted sixteenth would need a thirty-second note — nothing here is shorter than a sixteenth.';
    return null;
  }
  function tripletProblem(events, info) {
    // In 6/8 the beat already divides in three: only eighth-note triplets, on a beat.
    if (info.d === 8) return MQ.tripletGroups(events, info).some((g) => !g.open && g.span >= 24) ? 'In 6/8, triplets are eighth notes that start on a beat.' : null;
    const bad = MQ.tripletGroups(events, info).find((g) => {
      if (g.open) return false;
      if (g.span === 24) return info.n === 3 ? g.at !== 0 && g.at !== 12 : g.at % 24 !== 0;
      return g.span > 24;
    });
    if (!bad) return null;
    return bad.span > 24 ? 'Triplets here are eighth notes or quarter notes.'
      : info.n === 3 ? 'Quarter-note triplets start on beat 1 or beat 2 of a 3/4 measure.'
        : info.n === 4 ? 'Quarter-note triplets start on beat 1 or beat 3 of a 4/4 measure.' : 'Quarter-note triplets start on beat 1.';
  }

  // ---------- pitches ----------
  const P = (p) => ({ step: p.step, oct: p.oct, alt: p.alt });
  const gen = (a, b) => dia(b) - dia(a);
  const semi = (a, b) => midi(b) - midi(a);
  const isStep = (a, b) => Math.abs(gen(a, b)) === 1 && Math.abs(semi(a, b)) >= 1 && Math.abs(semi(a, b)) <= 2;
  const samePc = (t, p) => t.step === p.step && t.alt === p.alt;
  const name = (p) => MQ.pcName(p);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const tonesOf = (ch) => ch.tones.filter((t, i) => ch.degs[i] > 0);
  const inChord = (ch, p) => tonesOf(ch).some((t) => samePc(t, p));
  const DEG = { 1: 'root', 3: 'third', 5: 'fifth', 7: 'seventh' };

  // ---------- the exercises ----------
  // The chords' places: two to a measure of 4/4 and 6/8 — a half note or a dotted quarter each — but one,
  // the whole measure, in the last; one a measure in 3/4 and 2/4.
  const twoChords = (meter) => (meter.n === 4 && meter.d === 4) || (meter.n === 6 && meter.d === 8);
  function spansOf(meter, measures) {
    const len = (48 / meter.d) * meter.n, half = len / 2, out = [];
    for (let m = 0; m < measures; m++) {
      if (twoChords(meter) && m < measures - 1) { out.push({ m, t: 0, d: half, g: m * len }); out.push({ m, t: half, d: half, g: m * len + half }); }
      else out.push({ m, t: 0, d: len, g: m * len });
    }
    return out;
  }
  // A note as long as a chord's place: a dotted quarter, a half, a dotted half or a whole note.
  const spanEvent = (d, p) => Object.assign(d === 48 ? { v: 0, d: 0 } : d === 36 ? { v: 1, d: 1 } : d === 18 ? { v: 2, d: 1 } : { v: 1, d: 0 }, { t: 0, r: 0, p: P(p) });
  // A progression of n chords in a key, voiced: one phrase, or two joined and voiced as one.
  function progression(n, s, rng, fifths, mode) {
    const PW = MQ.PW;
    const ask = (len) => PW.generate({ type: 'roman', length: len, mode, fifths, maxSig: 0, sevenths: s.harm >= 2, inversions: s.harm >= 1, sixFour: s.harm >= 1, secondary: false, every: 'mixed', show: ['roman'] }, rng);
    if (n <= 8) {
      const ex = ask(Math.max(3, n));
      return !ex || ex.error || ex.texture !== 'satb' ? null : { key: ex.key, chords: ex.chords.slice(0, n), voices: ex.answer.slice(0, n) };
    }
    const n1 = Math.ceil(n / 2), a = ask(n1), b = ask(n - n1);
    if (!a || a.error || !b || b.error || a.texture !== 'satb' || b.texture !== 'satb') return null;
    const chords = a.chords.concat(b.chords);
    let voices = a.answer.concat(b.answer);
    try {
      const sol = PW.solve({ type: 'roman', key: a.key, chords, texture: 'satb', given: chords.map(() => [null, null, null, null]) }, { rng, melody: true, rules: new Set(PW.PRESETS[0].rules) });
      if (sol && sol.cost < 1000) voices = sol.voices;
    } catch (e) { /* keep the two phrases as they were voiced */ }
    return { key: a.key, chords, voices };
  }
  function makeExercise(s, kind, rng) {
    const meter = METERS[s.meter], spans = spansOf(meter, s.measures);
    const mode = s.mode === 1 ? 'major' : s.mode === 2 ? 'minor' : rng() < 0.5 ? 'major' : 'minor';
    const fifths = s.sig < 15 ? s.sig - 7 : Math.floor(rng() * (2 * s.maxSig + 1)) - s.maxSig;
    const empty = () => Array.from({ length: s.measures }, () => []);
    const base = { kind: kind.id, meter: { n: meter.n, d: meter.d }, measures: s.measures, key: { fifths, mode }, gives: [0, 1, 2, 3].map((v) => kind.gives.includes(v)), given: [empty(), empty(), empty(), empty()] };
    if (kind.free) return Object.assign(base, { spans: null, chords: null, labels: null, show: 0, model: null });
    let pr = null;
    for (let tries = 0; tries < 6 && !pr; tries++) pr = progression(spans.length, s, rng, fifths, mode);
    if (!pr) return null;
    kind.gives.forEach((v) => spans.forEach((sp, c) => base.given[v][sp.m].push(spanEvent(sp.d, pr.voices[c][v]))));
    return Object.assign(base, {
      spans, chords: pr.chords, show: kind.show == null ? s.lines : kind.show,
      labels: pr.chords.map((ch) => ({ rn: Object.assign({}, ch.disp), sym: ch.symbol })),
      model: pr.voices.map((V) => V.map(P)),
    });
  }
  const TEXT = {
    mel: 'Harmonize this melody in four parts: write the alto, tenor and bass.',
    bass: 'Write the soprano, alto and tenor over this bass line.',
    both: 'Write the alto and tenor between this melody and bass line.',
    sym: 'Write these chords in four parts, chorale style.',
    rn: 'Write these chords in four parts, chorale style.',
    rnsym: 'Write these chords in four parts, chorale style.',
  };
  const cache = new Map();
  function chorQuestions(cfg) {
    const n = clamp((cfg.counts && cfg.counts.chorale) | 0, 0, CHOR_MAX);
    if (!n || !MQ.PW) return [];
    const s = chorSettings(cfg.chor);
    const kinds = KINDS.filter((k, i) => s.kinds & (1 << i));
    const keyOf = JSON.stringify([cfg.seed, n, s.gen, s.kinds, s.lines, s.measures, s.meter, s.mode, s.sig, s.maxSig, s.harm]);
    let list = cache.get(keyOf);
    if (!list) {
      list = [];
      for (let k = 0; k < n; k++) {
        const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ Math.imul(k + 1, 0x9e3779b1) ^ 0x0c401a1e) >>> 0);
        let ex = null;
        for (let tries = 0; tries < 4 && !ex; tries++) ex = makeExercise(s, kinds[k % kinds.length], rng);
        if (ex) list.push(ex);
      }
      if (cache.size > 40) cache.clear();
      cache.set(keyOf, list);
    }
    return list.map((ex, k) => {
      const keyName = MQ.melodyKeyName(ex.key), info = MQ.rhythmMeter(ex.meter);
      const mine = [0, 1, 2, 3].filter((v) => !ex.gives[v]);
      return {
        type: 'chorale', clef: 'grand', grand: true,
        text: TEXT[ex.kind] || `Write ${ex.measures} measures of four-part, chorale-style music in ${keyName}.`,
        hint: `${keyName}, ${info.label}, ${ex.measures} measures. Write one voice at a time — ${mine.map((v) => VOICES[v]).join(', ')} — in any rhythm down to a sixteenth note; every measure of every voice must be full.`
          + (ex.chords ? (!twoChords(ex.meter) ? ' The chords change every measure.' : ex.meter.d === 8 ? ' The chords change every dotted quarter note.' : ' The chords change every half note.') : ''),
        ch: Object.assign({ n: k }, ex),
        sig: 'ch' + k, tags: [],
      };
    });
  }

  // ---------- answers ----------
  // A response is the four voices, each [measure][event]; a printed voice's place is left empty.
  const blankVoice = (q) => Array.from({ length: q.ch.measures }, () => []);
  const chorBlank = (q) => [0, 1, 2, 3].map(() => blankVoice(q));
  const cleanChorale = (q, resp) => [0, 1, 2, 3].map((v) => (q.ch.gives[v] ? blankVoice(q)
    : blankVoice(q).map((_, m) => ((resp && resp[v] && resp[v][m]) || []).map(MQ.rhythmEvent).filter((e) => e.r || e.p))));
  // All four voices as they stand: the printed ones and the student's.
  const chorVoices = (q, resp) => { const mine = cleanChorale(q, resp); return [0, 1, 2, 3].map((v) => (q.ch.gives[v] ? q.ch.given[v] : mine[v])); };
  const hasChoraleAnswer = (q, resp) => cleanChorale(q, resp).some((L) => L.some((m) => m.length));

  // ---------- checking ----------
  // {units (chords, or measures when no chords are given), wrong, unitOk [bool], issues [{rule, sev
  // ('error' costs its unit, 'warn' doesn't), unit, m, text, notes [{l, m, i}]}], blank}.
  function checkChorale(q, resp) {
    const C = q.ch, info = MQ.rhythmMeter(C.meter), len = info.len;
    const L = chorVoices(q, resp);
    const units = C.spans || Array.from({ length: C.measures }, (_, m) => ({ m, t: 0, d: len, g: m * len }));
    const issues = [], seen = new Set();
    const unitAt = (g) => { let u = 0; units.forEach((sp, k) => { if (sp.g <= g) u = k; }); return u; };
    const add = (rule, sev, g, text, notes, key) => {
      const k = key || rule + '|' + text + '|' + unitAt(g);
      if (seen.has(k)) return;
      seen.add(k);
      issues.push({ rule, sev, unit: unitAt(g), m: Math.floor(g / len), text, notes: notes || [] });
    };
    const ref = (v, n) => n.evs.map((e) => ({ l: v, m: e.m, i: e.i }));
    const at = (g) => `m. ${Math.floor(g / len) + 1}`;
    // Each voice as it sounds, tied notes joined.
    const N = L.map((layer) => MQ.rhythmSounding(layer, len, C.measures).filter((n) => n.p));
    N.forEach((list, v) => list.forEach((n, k) => { n.v = v; n.k = k; n.end = n.g + n.d; }));
    const noteAt = (v, g) => N[v].find((n) => n.g <= g && g < n.end) || null;
    const blank = !hasChoraleAnswer(q, resp);
    // Every measure of every voice the student writes must be full.
    [0, 1, 2, 3].forEach((v) => {
      if (C.gives[v]) return;
      L[v].forEach((evs, m) => {
        const st = MQ.measureState(evs, info), trip = tripletProblem(evs, info);
        if (!st.ok || trip) {
          const why = trip || MQ.measureNote(evs, info) || 'not finished';
          units.forEach((sp, k) => { if (sp.m === m) add(0, 'error', sp.g, `${at(sp.g)}: the ${VOICES[v]} is ${why === 'empty' ? 'empty' : why}.`, [], `fill|${v}|${m}|${k}`); });
        }
      });
    });
    // Rule 2: ranges.
    N.forEach((list, v) => list.forEach((n) => {
      if (C.gives[v]) return;
      const mm = midi(n.p);
      if (mm < RANGES[v][0] || mm > RANGES[v][1]) add(2, 'error', n.g, `${at(n.g)}: ${MQ.fullName(n.p)} is ${mm < RANGES[v][0] ? 'below' : 'above'} the ${VOICES[v]}’s range (${RANGE_TEXT[v]}).`, ref(v, n), `range|${v}|${n.k}`);
    }));
    // Rule 1: each voice a good melody.
    N.forEach((list, v) => {
      if (C.gives[v]) return;
      list.forEach((n, k) => {
        const nx = list[k + 1];
        if (!nx) return;
        const g = Math.abs(gen(n.p, nx.p)), sm = Math.abs(semi(n.p, nx.p));
        const leap = `${name(n.p)} to ${name(nx.p)} in the ${VOICES[v]}`;
        const plain = [0, 2, 4, 5, 7, 9, 11, 12][Math.min(7, g)];
        if (sm > 12 || g > 7) add(1, 'error', nx.g, `${at(nx.g)}: ${leap} is a leap of more than an octave.`, ref(v, n).concat(ref(v, nx)), `leap|${v}|${k}`);
        else if (g === 6) add(1, 'error', nx.g, `${at(nx.g)}: ${leap} is a leap of a seventh.`, ref(v, n).concat(ref(v, nx)), `leap|${v}|${k}`);
        else if (g > 0 && sm > plain) add(1, 'error', nx.g, `${at(nx.g)}: ${leap} is an augmented interval.`, ref(v, n).concat(ref(v, nx)), `leap|${v}|${k}`);
        const after = list[k + 2];
        if (after && g >= 4 && v < 3) {
          const back = Math.sign(gen(nx.p, after.p)) === -Math.sign(gen(n.p, nx.p)) && isStep(nx.p, after.p);
          if (!back) add(1, 'warn', after.g, `${at(nx.g)}: after the leap ${leap}, turn back and move by step.`, ref(v, nx).concat(ref(v, after)), `turn|${v}|${k}`);
        }
        if (after && g >= 2 && g < 4 && v < 3) {
          const g2 = Math.abs(gen(nx.p, after.p));
          if (g2 >= 2 && Math.sign(gen(nx.p, after.p)) === Math.sign(gen(n.p, nx.p)) && !((g === 2 && (g2 === 2 || g2 === 3)) || (g === 3 && g2 === 2))) {
            add(1, 'warn', after.g, `${at(nx.g)}: two leaps the same way in the ${VOICES[v]} (${name(n.p)}–${name(nx.p)}–${name(after.p)}) should outline a triad.`, ref(v, n).concat(ref(v, nx), ref(v, after)), `two|${v}|${k}`);
          }
        }
      });
    });
    // Every moment a voice starts a note.
    const times = [...new Set([].concat(...N.map((list) => list.map((n) => n.g))))].sort((a, b) => a - b);
    // Rules 3 and 4: spacing and crossing, wherever the voices stand together.
    times.forEach((g) => {
      const V = [0, 1, 2, 3].map((v) => noteAt(v, g));
      for (let v = 0; v < 3; v++) {
        const a = V[v], b = V[v + 1];
        if (!a || !b) continue;
        const both = ref(v, a).concat(ref(v + 1, b));
        if (midi(a.p) < midi(b.p)) add(4, 'error', g, `${at(g)}: the ${VOICES[v + 1]} (${MQ.fullName(b.p)}) crosses above the ${VOICES[v]} (${MQ.fullName(a.p)}).`, both, `cross|${v}|${a.k}|${b.k}`);
        else if (v < 2 && midi(a.p) - midi(b.p) > 12) add(3, 'error', g, `${at(g)}: more than an octave between the ${VOICES[v]} (${MQ.fullName(a.p)}) and the ${VOICES[v + 1]} (${MQ.fullName(b.p)}).`, both, `space|${v}|${a.k}|${b.k}`);
      }
    });
    // Rules 8, 9 and 10: two voices moving together into a fifth or an octave.
    const lastStart = units[units.length - 1].g;
    for (let k = 0; k + 1 < times.length; k++) {
      const g1 = times[k], g2 = times[k + 1];
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) {
        const A1 = noteAt(a, g1), A2 = noteAt(a, g2), B1 = noteAt(b, g1), B2 = noteAt(b, g2);
        if (!A1 || !A2 || !B1 || !B2 || A1 === A2 || B1 === B2) continue;
        const da = Math.sign(semi(A1.p, A2.p)), db = Math.sign(semi(B1.p, B2.p));
        if (!da || !db) continue;
        const i1 = mod(semi(B1.p, A1.p), 12), i2 = mod(semi(B2.p, A2.p), 12);
        const what = i2 === 7 ? 'fifths' : 'octaves', pair = `the ${VOICES[a]} and the ${VOICES[b]}`;
        const notes = ref(a, A1).concat(ref(a, A2), ref(b, B1), ref(b, B2));
        if (i1 === i2 && (i2 === 7 || i2 === 0)) {
          if (da === db) add(8, 'error', g2, `${at(g2)}: parallel ${what} between ${pair} (${name(B1.p)}–${name(A1.p)} to ${name(B2.p)}–${name(A2.p)}).`, notes, `par|${a}|${b}|${A2.k}|${B2.k}`);
          else if (!(a === 0 && b === 3 && g2 >= lastStart)) add(9, 'error', g2, `${at(g2)}: contrary ${what} between ${pair} (${name(B1.p)}–${name(A1.p)} to ${name(B2.p)}–${name(A2.p)}).`, notes, `con|${a}|${b}|${A2.k}|${B2.k}`);
        } else if (a === 0 && b === 3 && da === db && (i2 === 7 || i2 === 0) && Math.abs(gen(A1.p, A2.p)) > 1) {
          add(10, 'warn', g2, `${at(g2)}: a direct ${i2 === 7 ? 'fifth' : 'octave'} in the outer voices — the soprano leaps into it.`, notes, `dir|${A2.k}|${B2.k}`);
        } else if (b === 3 && i1 === 6 && i2 === 7 && da === db) {
          add(8, 'warn', g2, `${at(g2)}: a diminished fifth moves to a perfect fifth between ${pair}.`, notes, `uneq|${a}|${A2.k}|${B2.k}`);
        }
      }
    }
    // With the chords known: the notes of each chord, its bass, what it doubles, and how its tendency
    // tones go on.
    if (C.chords) {
      const spans = C.spans, chordAt = (g) => C.chords[unitAt(g)];
      const lt = MQ.PW.leadingTone(C.chords[0].home || C.chords[0].key);
      const dominant = (ch) => ch.fn === 'D' || inChord(ch, lt);
      spans.forEach((sp, c) => {
        const ch = C.chords[c], end = sp.g + sp.d, sym = C.labels[c].sym;
        const there = [0, 1, 2, 3].map((v) => N[v].filter((n) => n.g < end && n.end > sp.g));
        const complete = there.every((list) => list.length);
        // Each note: in the chord, or moving like a non-harmonic tone.
        there.forEach((list, v) => list.forEach((n) => {
          if (C.gives[v] || inChord(ch, n.p)) return;
          const prev = N[v][n.k - 1], next = N[v][n.k + 1];
          let ok;
          if (n.g < sp.g) {
            // Held over from the chord before: a suspension or retardation resolves by step; a pedal point
            // is the bass holding a note that was in its chord.
            ok = (next && isStep(n.p, next.p)) || (v === 3 && inChord(chordAt(n.g), n.p));
          } else {
            const stepIn = prev && isStep(prev.p, n.p), stepOut = next && isStep(n.p, next.p);
            const early = (n.end > end && c + 1 < spans.length && inChord(C.chords[c + 1], n.p)) || (next && midi(next.p) === midi(n.p) && inChord(chordAt(next.g), next.p));
            ok = stepOut || (stepIn && !!next) || early;
          }
          if (!ok) add(0, 'error', Math.max(n.g, sp.g), `${at(Math.max(n.g, sp.g))}: ${name(n.p)} in the ${VOICES[v]} isn’t in ${sym} and doesn’t move like a non-harmonic tone (by step into or out of it).`, ref(v, n), `nct|${v}|${n.k}|${c}`);
        }));
        if (!complete) return;
        // The bass note of the chord, as its figures or its symbol say.
        const first = [0, 1, 2, 3].map((v) => noteAt(v, sp.g));
        const bassTone = ch.tones[ch.inv];
        if (first[3] && !C.gives[3] && !samePc(bassTone, first[3].p) && inChord(ch, first[3].p)) {
          add(0, 'error', sp.g, `${at(sp.g)}: the bass of ${sym} is ${name(bassTone)}, not ${name(first[3].p)}.`, ref(3, first[3]), `bass|${c}`);
        }
        // The notes the chord needs.
        ch.tones.forEach((t, i) => {
          if (!(ch.degs[i] > 0) || !(ch.req ? ch.req[i] : ch.degs[i] !== 5)) return;
          if (!there.some((list) => list.some((n) => samePc(t, n.p)))) add(0, 'error', sp.g, `${at(sp.g)}: ${sym} is missing its ${DEG[ch.degs[i]] || 'note'} (${name(t)}).`, [], `need|${c}|${i}`);
        });
        // Rules 5 and 6: doubling, as the chord stands when it begins.
        if (first.every((n) => n && inChord(ch, n.p))) {
          const count = (t) => first.filter((n) => samePc(t, n.p)).length;
          if (inChord(ch, lt) && count(lt) > 1) add(6, 'error', sp.g, `${at(sp.g)}: the leading tone (${name(lt)}) is doubled in ${sym}.`, [0, 1, 2, 3].filter((v) => samePc(lt, first[v].p)).reduce((a, v) => a.concat(ref(v, first[v])), []), `lt2|${c}`);
          const triad = tonesOf(ch).length === 3 && ch.inv === 0;
          const deceptive = c > 0 && dominant(C.chords[c - 1]) && mod(ch.root.step - C.chords[c - 1].root.step, 7) === 1;
          if (triad && count(ch.root) < 2 && !deceptive) add(5, 'warn', sp.g, `${at(sp.g)}: ${sym} is in root position — double its root (${name(ch.root)}).`, [], `dbl|${c}`);
        }
        // Rule 7: the leading tone in the soprano, and the seventh of the chord.
        const next = C.chords[c + 1];
        if (next) {
          const s = there[0][there[0].length - 1];
          if (s && !C.gives[0] && samePc(lt, s.p) && dominant(ch) && !dominant(next)) {
            const to = N[0][s.k + 1];
            if (to && !(semi(s.p, to.p) === 1 && gen(s.p, to.p) === 1)) add(7, 'error', to.g, `${at(to.g)}: the leading tone (${name(s.p)}) in the soprano should go up to the tonic.`, ref(0, s).concat(ref(0, to)), `ltres|${c}`);
          }
          const sevI = ch.degs.indexOf(7);
          if (sevI >= 0) {
            there.forEach((list, v) => {
              const n = list[list.length - 1];
              if (!n || C.gives[v] || !samePc(ch.tones[sevI], n.p) || inChord(next, n.p)) return;
              const to = N[v][n.k + 1];
              if (to && !(gen(n.p, to.p) === -1 && isStep(n.p, to.p))) add(7, 'error', to.g, `${at(to.g)}: the seventh of ${sym} (${name(n.p)}, in the ${VOICES[v]}) should go down by step.`, ref(v, n).concat(ref(v, to)), `sev|${c}|${v}`);
            });
          }
        }
      });
    }
    const unitOk = units.map((_, k) => !blank && !issues.some((x) => x.sev === 'error' && x.unit === k));
    issues.sort((a, b) => a.unit - b.unit || (a.sev === b.sev ? 0 : a.sev === 'error' ? -1 : 1));
    return { units: units.length, wrong: unitOk.filter((x) => !x).length, unitOk, issues, blank, word: C.chords ? 'chord' : 'measure' };
  }
  const gradeChorale = (q, resp) => { const c = checkChorale(q, resp); return c.units ? (c.units - c.wrong) / c.units : 0; };
  const compareChorale = (q, resp) => { const c = checkChorale(q, resp); return { notes: c.units, wrong: c.wrong }; };
  // For the answer key: the voicing Clefwork made the exercise from, or what the work is marked on.
  function describeChorale(q) {
    const C = q.ch;
    if (!C.model) return 'Any four-part writing that keeps the voice-leading rules — every measure is marked.';
    const mine = [0, 1, 2, 3].filter((v) => !C.gives[v]);
    return 'One way: ' + mine.map((v) => `${cap(VOICES[v])} ${C.model.map((V) => MQ.fullName(V[v])).join(' ')}`).join(' · ');
  }
  // The model answer as four voices of plain chord-length notes, to show on the staff.
  function chorModel(q) {
    const C = q.ch;
    if (!C.model) return null;
    return [0, 1, 2, 3].map((v) => {
      const out = Array.from({ length: C.measures }, () => []);
      C.spans.forEach((sp, c) => out[sp.m].push(spanEvent(sp.d, C.model[c][v])));
      return out;
    });
  }

  // ---------- playback ----------
  // Sound events for MQ.Audio.sequence: the four voices as written. unit: seconds per 48th of a whole note.
  function chorEvents(q, layers, unit) {
    const C = q.ch, len = MQ.rhythmMeter(C.meter).len, events = [];
    layers.forEach((layer) => MQ.rhythmSounding(layer, len, C.measures).forEach((n) => {
      if (n.p) events.push({ at: n.g * unit, dur: n.d * unit * 0.95, midi: midi(n.p), voice: 'piano', vel: 0.22 });
    }));
    return { events, total: C.measures * len * unit };
  }

  Object.assign(MQ, {
    CHOR_MAX, CHOR_KINDS: KINDS, CHOR_METERS: METERS, CHOR_HARMONY: HARMONY, CHOR_VOICES: VOICES, CHOR_RANGES: RANGES, CHOR_RANGE_TEXT: RANGE_TEXT, CHOR_CENTERS: CENTERS,
    chorSettings, chorQuestions, chorBlank, cleanChorale, chorVoices, hasChoraleAnswer, checkChorale, gradeChorale, compareChorale, describeChorale, chorModel,
    chorEvents, chorValueProblem: valueProblem, chorTripletProblem: tripletProblem,
  });
})(typeof window !== 'undefined' ? window : globalThis);
