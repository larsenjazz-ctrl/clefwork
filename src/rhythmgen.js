/* Clefwork Rhythm — examples made automatically. Each measure is built beat by beat from short
   rhythmic cells chosen for the level (a quarter, two eighths, a dotted quarter and eighth …), in a
   phrase shape that repeats measures (A A B A, A B A B …), and the best of many tries is kept:
   about four to eight notes in a 4/4 measure, long notes with short ones, only one or two notes off
   the beat at the easier levels, rests in a share of the measures that grows with the level, and a
   long note to end. The quiz's seed picks everything, so the same code always makes the same
   examples. The generator is versioned: a quiz keeps the version it was made with (version 1 had
   almost no rests), so its examples never change. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const LETTER = { w: 0, h: 1, q: 2, e: 3, s: 4 };
  // "q." a dotted quarter, "e3" an eighth-note triplet, "qr" a quarter rest.
  const parse = (str) => str.split(' ').map((tok) => {
    const m = tok.match(/^([whqes])(\.)?(3)?(r)?$/);
    return { v: LETTER[m[1]], d: m[2] ? 1 : 0, t: m[3] ? 1 : 0, r: m[4] ? 1 : 0 };
  });
  // A cell fills `span` beats of `beat` units (12: a quarter-note beat; 18: a dotted-quarter beat).
  // `off`: how many of its notes start off the beat. `w`: how often it is chosen. `unit`: a compound
  // meter's own beat (q., h., w.), allowed even when dotted notes aren't. `since`: the generator
  // version that first used it.
  const GEN = 2;
  function cell(str, beat, span, off, w, unit, since) {
    const ev = parse(str);
    return {
      str, beat, span, off, w, unit: !!unit, ev, since: since || 1,
      shortest: Math.max(...ev.map((e) => e.v)),
      dotted: ev.some((e) => e.d), halfDotsOnly: ev.every((e) => !e.d || e.v === 1),
      trip: ev.some((e) => e.t), rests: ev.filter((e) => e.r).length,
    };
  }
  const CELLS = [
    // one quarter-note beat
    cell('q', 12, 1, 0, 10), cell('qr', 12, 1, 0, 1), cell('e e', 12, 1, 0, 8), cell('e er', 12, 1, 0, 0.7), cell('er e', 12, 1, 1, 1.2),
    cell('s s s s', 12, 1, 0, 2.5), cell('e s s', 12, 1, 0, 3), cell('s s e', 12, 1, 0, 3), cell('e. s', 12, 1, 0, 3),
    cell('s e.', 12, 1, 1, 0.7), cell('s e s', 12, 1, 1, 1),
    cell('e3 e3 e3', 12, 1, 0, 4), cell('q3 e3', 12, 1, 0, 1.5), cell('s3 s3 s3 e', 12, 1, 0, 1), cell('e s3 s3 s3', 12, 1, 0, 0.8),
    // longer than a quarter-note beat
    cell('h', 12, 2, 0, 6), cell('hr', 12, 2, 0, 0.5), cell('q. e', 12, 2, 1, 4), cell('e q e', 12, 2, 2, 1.8), cell('q3 q3 q3', 12, 2, 0, 2),
    cell('h.', 12, 3, 0, 3), cell('w', 12, 4, 0, 2),
    // one dotted-quarter beat
    cell('q.', 18, 1, 0, 8, true), cell('q.r', 18, 1, 0, 1, true), cell('q e', 18, 1, 0, 9), cell('e q', 18, 1, 1, 2), cell('e e e', 18, 1, 0, 8),
    cell('q er', 18, 1, 0, 1), cell('er e e', 18, 1, 2, 0.8),
    cell('e. s e', 18, 1, 0, 3), cell('s s e e', 18, 1, 0, 2), cell('e s s e', 18, 1, 0, 2), cell('e e s s', 18, 1, 0, 2), cell('q s s', 18, 1, 0, 1.5),
    // longer than a dotted-quarter beat
    cell('h.', 18, 2, 0, 5, true), cell('w.', 18, 4, 0, 1.5, true),
    // Version 2: more rests, including ones that make a rhythm harder — a rest on the beat before an
    // entry, a sixteenth rest inside the beat, a rest in the middle of a triplet.
    cell('e. sr', 12, 1, 0, 0.8, false, 2), cell('sr e.', 12, 1, 1, 0.6, false, 2), cell('sr s s s', 12, 1, 1, 1, false, 2), cell('e sr s', 12, 1, 1, 1, false, 2),
    cell('e3 e3r e3', 12, 1, 0, 0.8, false, 2), cell('e3r e3 e3', 12, 1, 1, 0.6, false, 2),
    cell('q. er', 12, 2, 0, 1.2, false, 2), cell('er q e', 12, 2, 2, 0.6, false, 2),
    cell('e er e', 18, 1, 0, 1, false, 2), cell('e e er', 18, 1, 0, 1, false, 2), cell('er q', 18, 1, 1, 0.8, false, 2),
    cell('e. s er', 18, 1, 0, 0.8, false, 2), cell('sr s e e', 18, 1, 1, 0.6, false, 2),
  ];
  const FALLBACK = { 12: cell('q', 12, 1, 0, 1), 18: cell('q.', 18, 1, 0, 1, true) };

  // ---------- levels ----------
  const meters = (list) => list.split(' ').map((x) => { const [n, d] = x.split('/').map(Number); return { n, d }; });
  const ALL = 'all';
  // offbeats: 0 none, 1 one or two in an example, 2 more (never more than about one a measure).
  // rests: the share of an example's measures that have a rest, from none to 80%.
  const LEVELS = [
    { name: 'Very easy', blurb: '4/4 only. Quarter notes and longer, and every note starts on a beat. An occasional rest.', meters: meters('4/4'), shortest: 2, dotted: 'half', triplets: false, offbeats: 0, rests: [0, 0.2] },
    { name: 'Easy', blurb: '2/4 to 4/4. Eighth notes and longer; no note starts off the beat. A few rests.', meters: meters('2/4 3/4 4/4'), shortest: 3, dotted: 'half', triplets: false, offbeats: 0, rests: [0, 0.3] },
    { name: 'Medium easy', blurb: '2/4 to 4/4. Eighth notes and longer, with one or two notes off the beat, and some rests.', meters: meters('2/4 3/4 4/4'), shortest: 3, dotted: 'all', triplets: false, offbeats: 1, rests: [0.1, 0.4] },
    { name: 'Medium', blurb: '2/4 to 6/4, and 3/8, 6/8, 9/8 and 12/8. Eighth notes and longer, with one or two notes off the beat, and some rests.', meters: meters('2/4 3/4 4/4 5/4 6/4 3/8 6/8 9/8 12/8'), shortest: 3, dotted: 'all', triplets: false, offbeats: 1, rests: [0.2, 0.5] },
    { name: 'Advanced', blurb: 'Any time signature. Sixteenth notes and longer, notes off the beat, and rests that make the rhythm harder.', meters: ALL, shortest: 4, dotted: 'all', triplets: false, offbeats: 2, rests: [0.3, 0.7] },
    { name: 'Very hard', blurb: 'Any time signature and any rhythm, triplets included, with plenty of rests.', meters: ALL, shortest: 4, dotted: 'all', triplets: true, offbeats: 2, rests: [0.4, 0.8] },
  ];
  // Custom rules' rests: none, a few, some, many.
  const REST_RANGES = [[0, 0], [0, 0.25], [0.2, 0.5], [0.4, 0.8]];
  const COMPOUND = meters('3/8 6/8 9/8 12/8'), CUT = meters('2/2 3/2'), UNEVEN = meters('5/8 7/8 8/8 10/8 11/8');
  // The rules for an automatic quiz: a level's, or the teacher's own (level 7).
  function rulesOf(auto) {
    if (auto.level <= 6) return LEVELS[auto.level - 1];
    const c = auto.custom, list = [];
    for (let n = c.lo; n <= c.hi; n++) list.push({ n, d: 4 });
    if (c.compound) list.push(...COMPOUND);
    if (c.cut) list.push(...CUT);
    if (c.uneven) list.push(...UNEVEN);
    return { meters: list, shortest: c.shortest, dotted: c.dotted ? 'all' : 'none', triplets: !!c.triplets, offbeats: c.offbeats, rests: REST_RANGES[c.rests] || REST_RANGES[1] };
  }
  // Everyday meters come up more often.
  const METER_WEIGHT = { '4/4': 5, '3/4': 4, '2/4': 3, '6/8': 4, '12/8': 2, '9/8': 1.5, '3/8': 1.5, '5/4': 1, '6/4': 1.5, '2/2': 2, '3/2': 1, '5/8': 1, '7/8': 1, '4/8': 0.3, '8/8': 0.5, '10/8': 0.4, '11/8': 0.4 };
  function pickWeighted(rng, items, weightOf) {
    const total = items.reduce((t, x) => t + weightOf(x), 0);
    let r = rng() * total;
    for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
    return items[items.length - 1];
  }
  function pickMeter(rng, rules) {
    const list = rules.meters === ALL ? MQ.RHYTHM_METERS : rules.meters;
    const m = pickWeighted(rng, list, (x) => METER_WEIGHT[x.n + '/' + x.d] || 1);
    const groups = MQ.rhythmGroupings(m);
    return { n: m.n, d: m.d, g: groups ? Math.floor(rng() * groups.length) : 0 };
  }

  // ---------- one measure ----------
  // The beats a measure is built on. Cut time and 3/2 are built on quarter notes, long notes starting
  // on the half-note beat; 3/8 is one dotted-quarter beat.
  function planOf(info) {
    if (info.d === 2) return Array.from({ length: info.len / 12 }, (_, i) => ({ len: 12, strong: i % 2 === 0, pulse: true }));
    if (info.d === 8 && info.n === 3) return [{ len: 18, strong: true }];
    const strong = { 4: [0, 2], 5: [0, 3], 6: [0, 3], 12: [0, 2] }[info.d === 4 ? info.n : info.n === 12 ? 12 : 0] || [0];
    return info.beats.map((b, i) => ({ len: b.len, strong: strong.includes(i) }));
  }
  // How welcome a cell is at beat i: long notes belong on strong beats.
  function placeWeight(c, i, plan) {
    if (i + c.span > plan.length) return 0;
    for (let k = 0; k < c.span; k++) if (plan[i + k].len !== c.beat) return 0;
    if (c.span === 1) return 1;
    if (plan[0].pulse && i % 2) return 0;
    if (c.span >= 4) return i === 0 ? 1 : 0;
    if (c.span === 3 && !plan[0].pulse) return i === 0 ? 1 : 0.25;
    if (plan[i].strong) return 1;
    return plan.length === 3 ? 0.7 : 0.3;
  }
  function allowedCells(rules, gen) {
    return CELLS.filter((c) => {
      if (c.since > gen) return false;
      if (c.shortest > rules.shortest) return false;
      if (c.trip && !rules.triplets) return false;
      if (c.off && !rules.offbeats) return false;
      if (c.dotted && !c.unit && (rules.dotted === 'none' || (rules.dotted === 'half' && !c.halfDotsOnly))) return false;
      return true;
    });
  }
  // rests (version 2): 'none' leaves rests out; 'more' makes them several times likelier. `lead`: how
  // welcome a rest is at the very start of the example.
  function buildMeasure(rng, plan, cells, first, rests, lead) {
    const ev = [], used = [];
    let i = 0, off = 0;
    const restW = (c) => (!c.rests || !rests ? 1 : rests === 'none' ? 0 : 6);
    while (i < plan.length) {
      let opts = cells.map((c) => ({ c, w: c.w * placeWeight(c, i, plan) * restW(c) * (first && i === 0 && c.ev[0].r ? (lead == null ? 0.15 : lead) : 1) })).filter((x) => x.w > 0);
      if (!opts.length) opts = [{ c: FALLBACK[plan[i].len], w: 1 }];
      const c = pickWeighted(rng, opts, (x) => x.w).c;
      c.ev.forEach((e) => ev.push(Object.assign({}, e)));
      used.push(c.str);
      off += c.off;
      i += c.span;
    }
    return { ev, off, key: used.join('|') };
  }
  function measureScore(m, ctx, last, want) {
    const lens = m.ev.filter((e) => !e.r).map(MQ.rhythmDur);
    const n = lens.length, rests = m.ev.length - n;
    let s = 0;
    const lo = ctx.gen >= 2 && rests ? ctx.lo - 1 : ctx.lo;                   // a rest takes a note's place
    if (n < lo) s -= (lo - n) * 2.5;
    if (n > ctx.hi) s -= (n - ctx.hi) * 2;
    if (n && Math.max(...lens) >= 2 * Math.min(...lens)) s += 2;          // long notes with short ones
    if (ctx.gen < 2) s -= rests * 0.5 + Math.max(0, rests - 1) * 2;
    else {
      // Rests where they were wanted, never so many that the measure is mostly silence.
      const silent = m.ev.filter((e) => e.r).reduce((t, e) => t + MQ.rhythmDur(e), 0) / ctx.len;
      if (!n) s -= 20;
      if (silent > ctx.restCap) s -= (silent - ctx.restCap) * 12;
      if (want && !rests) s -= 6;
      s -= Math.max(0, rests - ctx.restMax) * 2;
    }
    if (m.off > 1) s -= (m.off - 1) * 3;                                    // no more than one syncopation a measure
    if (last) {
      const e = m.ev[m.ev.length - 1];
      s += !e.r && MQ.rhythmDur(e) >= 12 ? 3 : -1;                          // end on a long note
    }
    return s;
  }

  // ---------- one example ----------
  const FORMS = { 1: ['A'], 2: ['AB', 'AB', 'AA'], 3: ['AAB', 'ABA', 'ABB', 'ABC'], 4: ['AABA', 'ABAB', 'AABB', 'ABAC', 'AABC', 'ABCA'] };
  function buildExample(rng, rules, bars, meter, gen) {
    const info = MQ.rhythmMeter(meter), plan = planOf(info), cells = allowedCells(rules, gen);
    // About a note a quarter note to two (4 to 8 in 4/4); more at the hardest levels.
    const quarters = info.len / 12;
    const ctx = rules.shortest <= 2
      ? { lo: 2, hi: Math.max(2, Math.round(quarters)) }
      : { lo: Math.max(2, Math.round(quarters)), hi: Math.round(quarters * 2 * (rules.shortest >= 4 ? 1.5 : 1)) };
    ctx.gen = gen;
    // Version 2: how many measures get a rest — a share picked from the level's range — and how much
    // rest a measure may hold: easy levels a quarter of it and one rest, hard levels half and three.
    let target = 0, hard = false;
    if (gen >= 2) {
      const [lo, hi] = rules.rests;
      target = Math.min(bars, Math.floor((lo + rng() * (hi - lo)) * bars + rng()));
      hard = hi >= 0.5;
      Object.assign(ctx, { len: info.len, restCap: hard ? 0.5 : 0.3, restMax: hard ? 3 : 1 });
    }
    let best = null;
    for (let a = 0; a < 36; a++) {
      const form = FORMS[bars][Math.floor(rng() * FORMS[bars].length)];
      const lastL = form[form.length - 1];
      const bank = {};
      new Set(form).forEach((L) => {
        // Which measures carry the rests varies from try to try; the score keeps the right number.
        const want = gen >= 2 ? rng() < target / bars : null;
        const rests = gen >= 2 ? (want ? 'more' : 'none') : null;
        let top = null;
        for (let k = 0; k < 8; k++) {
          const m = buildMeasure(rng, plan, cells, L === 'A', rests, gen >= 2 ? (hard ? 0.8 : 0.1) : null);
          m.sc = measureScore(m, ctx, L === lastL, want);
          if (!top || m.sc > top.sc) top = m;
        }
        bank[L] = top;
      });
      const ms = form.split('').map((L) => bank[L]);
      let sc = ms.reduce((t, m) => t + m.sc, 0) / ms.length;
      const off = ms.reduce((t, m) => t + m.off, 0);
      // Easier levels: no more than two notes off the beat in the whole example (one is nice to have).
      // Harder ones: some, but no more than about one a measure.
      if (rules.offbeats === 1) sc -= (off ? 0 : 1.5) + Math.max(0, off - 2) * 8;
      else if (rules.offbeats === 2) sc -= (off ? 0 : 5) + Math.max(0, off - ms.length) * 4;
      if (gen < 2) {
        if (ms[0].ev[0].r) sc -= rules.shortest <= 3 ? 4 : 1.5;                           // start with a note
      } else {
        // Starting on a rest is a hard-level challenge; the right number of measures with rests.
        if (ms[0].ev[0].r) sc -= hard ? 0.5 : 4;
        sc -= Math.abs(ms.filter((m) => m.ev.some((e) => e.r)).length - target) * 3;
      }
      if (ms.length > 1 && new Set(ms.map((m) => m.key)).size === 1) sc -= 3;             // not one measure over and over
      if (!best || sc > best.sc) best = { sc, ms };
    }
    return best.ms.map((m) => m.ev.map((e) => Object.assign({}, e)));
  }

  // The examples of an automatic quiz, as the teacher would have written them.
  function generateRhythms(seed, auto) {
    const a = MQ.rhythmAuto(auto), rules = rulesOf(a), out = [];
    for (let k = 0; k < a.count; k++) {
      const rng = MQ.mulberry32((Math.imul((seed >>> 0) + 1, 2654435761) ^ Math.imul(k + 1, 40503) ^ 0x5bd1e995) >>> 0);
      const meter = pickMeter(rng, rules);
      const info = MQ.rhythmMeter(meter);
      const bars = buildExample(rng, rules, a.measures, meter, a.gen);
      while (bars.length < 4) bars.push([]);
      // The tempo is set as a quarter note; other beats keep the same speed of eighth notes.
      const tempo = Math.max(40, Math.min(240, Math.round((a.tempo * 12) / MQ.RHYTHM_TEMPO_UNITS[info.tempo])));
      out.push(MQ.exampleSettings({ meter, measures: a.measures, tempo, parts: 1, layers: [bars, [[], [], [], []]] }));
    }
    return out;
  }

  // For Clefwork Melody: a phrase's rhythm, a meter for the rules, and the meters' own beats.
  Object.assign(MQ, { RHYTHM_LEVELS: LEVELS, RHYTHM_GEN: GEN, rhythmRules: rulesOf, generateRhythms, rhythmPhrase: buildExample, rhythmPickMeter: pickMeter, rhythmPlan: planOf });
})(typeof window !== 'undefined' ? window : globalThis);
