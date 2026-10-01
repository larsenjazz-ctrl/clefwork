/* Clefwork Rhythm — rhythmic dictation. The teacher writes a rhythm of one to four measures in one
   part or two; the computer plays it (the part with stems up on the piano, the part with stems down
   on the oboe) and students write what they hear on a one-line staff.
   Durations are counted in 48ths of a whole note, so every value from a sixteenth to a dotted whole,
   and every triplet from sixteenths to whole notes, is a whole number.
   A note or rest is {v: 0 whole … 4 sixteenth, d: dotted, t: triplet, r: rest}, and a note may have
   tie: 1 — tied to the next note of its part, in the same measure or across the bar line. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const VALUES = [
    { id: 'w', name: 'whole', units: 48, flags: 0 },
    { id: 'h', name: 'half', units: 24, flags: 0 },
    { id: 'q', name: 'quarter', units: 12, flags: 0 },
    { id: 'e', name: 'eighth', units: 6, flags: 1 },
    { id: 's', name: 'sixteenth', units: 3, flags: 2 },
  ];
  const MAX_EXAMPLES = 12;
  const PIANO_NOTE = 72, OBOE_NOTE = 65;           // C5 and F4: the parts sound a 5th apart

  function dur(e) {
    if (e.u) return e.u;                          // a length of its own (a rhythm grid's note, when played)
    let u = VALUES[e.v] ? VALUES[e.v].units : 12;
    if (e.d) u = (u * 3) / 2;
    if (e.t) u = (u * 2) / 3;
    return u;
  }
  const total = (list) => (list || []).reduce((s, e) => s + dur(e), 0);
  // A note may carry a pitch (Clefwork Melody): p = {step, oct, alt}.
  function cleanEvent(e) {
    const out = { v: Math.max(0, Math.min(4, e.v | 0)), d: e.d ? 1 : 0, t: e.t ? 1 : 0, r: e.r ? 1 : 0 };
    if (e.p && !e.r) out.p = { step: e.p.step | 0, oct: e.p.oct | 0, alt: e.p.alt | 0 };
    if (e.tie && !e.r) out.tie = 1;
    return out;
  }

  // ---------- ties ----------
  // Where the note at L[m][i] is tied to: the next note of the measure, or across the bar line the
  // first note of the next one (when this measure is full) — or null. A tie to a rest, to nothing yet,
  // to a note past the `count` measures, or (with pitches) to a different note joins nothing.
  function tieNext(L, m, i, len, count) {
    const e = L[m] && L[m][i];
    if (!e || !e.tie || e.r) return null;
    let at = null;
    if (i + 1 < L[m].length) at = { m, i: i + 1 };
    else if (m + 1 < count && L[m + 1] && L[m + 1].length && total(L[m]) === len) at = { m: m + 1, i: 0 };
    if (!at) return null;
    const n = L[at.m][at.i];
    if (n.r || (e.p && n.p && MQ.midi(e.p) !== MQ.midi(n.p))) return null;
    return at;
  }
  // The notes of one part as they sound, tied notes joined: {m, i (the first note's measure and
  // place), t (its start in the measure), g (its start from the beginning), d (how long it sounds),
  // p, evs [{m, i} of every note written for it]}.
  function soundingNotes(L, len, count) {
    const out = [];
    let held = null;
    for (let m = 0; m < count; m++) {
      let at = 0;
      ((L && L[m]) || []).forEach((e, i) => {
        const d = dur(e);
        if (!e.r) {
          if (held) { held.d += d; held.evs.push({ m, i }); }
          else out.push(held = { m, i, t: at, g: m * len + at, d, p: e.p, evs: [{ m, i }] });
          if (!tieNext(L, m, i, len, count)) held = null;
        }
        at += d;
      });
    }
    return out;
  }
  // What's wrong with the ties of one part, in words: a tie that goes nowhere, or joins two pitches.
  function tieProblems(L, len, count, where) {
    const out = [];
    for (let m = 0; m < count; m++) {
      ((L && L[m]) || []).forEach((e, i) => {
        if (!e.tie || e.r || tieNext(L, m, i, len, count)) return;
        const last = i === L[m].length - 1;
        const n = last ? L[m + 1] && L[m + 1][0] : L[m][i + 1];
        out.push(`${where(m)}: ${n && n.r ? 'a note is tied to a rest' : n && e.p && n.p ? 'a tie joins two different notes' : last && m + 1 >= count ? 'the last note is tied to nothing' : 'a tie needs a note after it'}.`);
      });
    }
    return out;
  }
  // Ties for an automatic example, after it's made (so examples without them stay as they were): a
  // note held over the bar line, or an off-beat note held over the next beat. In a melody (pitch) the
  // tied note takes the next one's pitch — an anticipation — or the next takes its pitch, whichever
  // keeps the leaps within `leap` steps. Every note of a triplet is left alone.
  function addTies(L, count, info, rng, o) {
    const opt = o || {}, cands = [];
    const onBeat = (t) => info.beats.some((b) => b.at === t);
    const flat = [];
    for (let m = 0; m < count; m++) {
      let at = 0;
      (L[m] || []).forEach((e, i) => { flat.push({ e, m, i, t: at }); at += dur(e); });
    }
    for (let k = 0; k + 1 < flat.length; k++) {
      const a = flat[k], b = flat[k + 1];
      if (a.e.r || b.e.r || a.e.t || b.e.t || a.e.tie) continue;
      const bar = b.m === a.m + 1 && b.i === 0 && total(L[a.m]) === info.len;
      const sync = b.m === a.m && b.t > 0 && onBeat(b.t) && !onBeat(a.t);
      if (bar || sync) cands.push({ k, bar });
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const want = Math.max(1, Math.round(count / 2));
    let made = 0;
    const dia = (x) => x && x.e.p && MQ.dia(x.e.p);
    cands.forEach((c) => {
      if (made >= want || (made && rng() < 0.35)) return;
      const a = flat[c.k], b = flat[c.k + 1];
      if (b.e.tie || (flat[c.k - 1] && flat[c.k - 1].e.tie)) return;      // one tie at a time
      if (opt.pitch && MQ.midi(a.e.p) !== MQ.midi(b.e.p)) {
        const prev = flat.slice(0, c.k).reverse().find((x) => !x.e.r), next = flat.slice(c.k + 2).find((x) => !x.e.r);
        const fits = (x, d) => !x || Math.abs(dia(x) - d) <= (opt.leap || 7);
        if (fits(prev, dia(b))) a.e.p = Object.assign({}, b.e.p);
        else if (fits(next, dia(a))) b.e.p = Object.assign({}, a.e.p);
        else return;
      }
      a.e.tie = 1;
      made++;
    });
    return made;
  }

  // ---------- time signatures ----------
  const METERS = [
    ...[2, 3, 4, 5, 6].map((n) => ({ n, d: 4 })),
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ n, d: 8 })),
    ...[2, 3].map((n) => ({ n, d: 2 })),
  ];
  // How the eighths of an irregular x/8 bar group into beats. The first is the default.
  const GROUPINGS = {
    4: [[2, 2]], 5: [[2, 3], [3, 2]], 7: [[2, 2, 3], [3, 2, 2], [2, 3, 2]],
    8: [[3, 3, 2], [3, 2, 3], [2, 3, 3]], 10: [[3, 3, 2, 2], [2, 2, 3, 3], [3, 2, 2, 3]], 11: [[3, 3, 3, 2], [2, 3, 3, 3], [3, 2, 3, 3]],
  };
  const groupingsOf = (meter) => (meter.d === 8 && GROUPINGS[meter.n]) || null;
  // The note value the tempo counts, in units.
  const TEMPO_UNITS = { q: 12, h: 24, 'q.': 18, e: 6 };
  const TEMPO_NAMES = { q: 'quarter note', h: 'half note', 'q.': 'dotted quarter note', e: 'eighth note' };
  // x/4 counts quarter notes, x/2 half notes, 6/8 9/8 12/8 dotted quarters; 3/8 and the irregular
  // x/8 meters count eighths, clicking at the start of each group.
  function meterInfo(meter) {
    const n = meter.n, d = meter.d;
    const unit = 48 / d;
    const len = n * unit;
    let groups, tempo;
    if (d === 8 && n % 3 === 0 && n > 3) { groups = Array(n / 3).fill(18); tempo = 'q.'; }
    else if (groupingsOf(meter)) {
      const all = groupingsOf(meter);
      groups = (all[meter.g || 0] || all[0]).map((k) => k * 6);
      tempo = 'e';
    } else { groups = Array(n).fill(unit); tempo = d === 2 ? 'h' : d === 4 ? 'q' : 'e'; }
    const beats = [];
    let at = 0;
    groups.forEach((g) => { beats.push({ at, len: g }); at += g; });
    // Beams join the notes of one beat — or, in 3/8, of the whole bar.
    const beams = d === 8 && n === 3 ? [{ at: 0, len }] : beats;
    return {
      n, d, len, beats, beams, tempo, label: n + '/' + d,
      // What the measure checker counts in: beats, or eighths in x/8.
      count: d === 8 ? 6 : unit, countName: d === 8 ? 'eighth' : 'beat',
      grouping: groupingsOf(meter) ? groups.map((g) => g / 6).join('+') : '',
    };
  }

  // ---------- amounts in words ----------
  const DUR_NAMES = {
    72: 'a dotted whole note', 48: 'a whole note', 36: 'a dotted half note', 24: 'a half note', 18: 'a dotted quarter note',
    12: 'a quarter note', 9: 'a dotted eighth note', 6: 'an eighth note', 3: 'a sixteenth note',
  };
  const FRAC = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  // 18 units in 4/4 → "1½ beats"; in 6/8 → "3 eighths".
  function countText(units, info) {
    const c = info.count, whole = Math.floor(units / c), part = units % c;
    let frac = '';
    if (part) { const g = gcd(part, c), key = `${part / g}/${c / g}`; frac = FRAC[key] || key; }
    const num = (whole ? String(whole) : '') + frac || '0';
    const one = !part && whole === 1;
    return `${num} ${info.countName}${one ? '' : 's'}`;
  }
  const amountText = (units, info) => DUR_NAMES[units] || countText(units, info);

  // ---------- triplets ----------
  // A triplet group lasts an eighth, a quarter, a half or a whole note. It starts on a beat; a
  // group shorter than the beat may also start partway through, on its own length (sixteenth-note
  // triplets halfway through a quarter-note beat), as long as it stays inside the beat.
  const SPANS = [6, 12, 24, 48];
  function beatAt(info, at) {
    let b = info.beats[0];
    info.beats.forEach((x) => { if (x.at <= at) b = x; });
    return b;
  }
  function tripletStartOk(info, at, span) {
    if (at + span > info.len) return false;
    const b = beatAt(info, at);
    if (at === b.at) return true;
    return span < b.len && (at - b.at) % span === 0 && at + span <= b.at + b.len;
  }
  // The triplets in one measure: each run of triplet notes, closing as soon as its time adds up
  // to plain sixteenths again (three eighth-note triplets, or a quarter- and an eighth-note triplet).
  function tripletGroups(events, info) {
    const out = [];
    let at = 0, cur = null;
    events.forEach((e, i) => {
      const d = dur(e);
      if (e.t) {
        if (!cur) cur = { from: i, at, sum: 0 };
        cur.sum += d;
        if (cur.sum % 3 === 0) { cur.to = i; cur.span = cur.sum; out.push(cur); cur = null; }
      } else if (cur) { cur.to = i - 1; cur.open = true; cur.cut = true; out.push(cur); cur = null; }
      at += d;
    });
    if (cur) { cur.to = events.length - 1; cur.open = true; out.push(cur); }
    out.forEach((g) => {
      g.ok = !g.open && SPANS.includes(g.span) && tripletStartOk(info, g.at, g.span);
      // An unfinished triplet at the end of the measure is fine while it can still be finished.
      g.finishable = g.open && !g.cut && SPANS.some((s) => s > g.sum && tripletStartOk(info, g.at, s));
    });
    return out;
  }
  function tripletWhy(g, info) {
    if (g.cut) return 'A triplet needs all its notes before a note that isn’t a triplet.';
    if (g.open && g.finishable) return 'This triplet isn’t finished.';
    if (!g.open && !SPANS.includes(g.span)) return 'These triplet notes don’t make one triplet group.';
    return info.d === 8 && info.tempo === 'e'
      ? 'A triplet has to start at the beginning of a beat.'
      : 'A triplet has to start on a beat. (Sixteenth-note triplets may also start halfway through one.)';
  }

  // ---------- one measure ----------
  function measureState(events, info) {
    const sum = total(events);
    const trips = tripletGroups(events || [], info);
    const bad = trips.filter((g) => !g.ok);
    return { total: sum, full: sum === info.len, over: sum > info.len, short: info.len - sum, trips, bad, ok: sum === info.len && !bad.length };
  }
  // Whether an edit can be kept: it mustn't overflow the measure or break a triplet that was fine.
  function editProblem(before, after, info) {
    const s = measureState(after, info);
    if (s.over) return { kind: 'over' };
    const broken = (st) => st.bad.filter((g) => !g.finishable);
    const now = broken(s), was = broken(measureState(before, info));
    if (now.length > was.length) return { kind: 'triplet', text: tripletWhy(now.find((g) => !was.some((w) => w.at === g.at && w.sum === g.sum)) || now[0], info) };
    return null;
  }
  // What a measure still needs, in words — or '' when it is complete.
  function measureNote(events, info) {
    const s = measureState(events, info);
    if (s.over) return `${amountText(-s.short, info)} too long`;
    const broken = s.bad.find((g) => !g.finishable || s.full);
    if (broken) return tripletWhy(broken, info);
    if (!s.total) return 'empty';
    if (!s.full) return `${amountText(s.short, info)} short`;
    return '';
  }

  // ---------- examples ----------
  const emptyLayers = () => [[[], [], [], []], [[], [], [], []]];
  function exampleSettings(ex) {
    const e = ex || {};
    if (!e.meter || !METERS.some((m) => m.n === e.meter.n && m.d === e.meter.d)) e.meter = { n: 4, d: 4, g: 0 };
    if (e.meter.g == null) e.meter.g = 0;
    if (!groupingsOf(e.meter) || !groupingsOf(e.meter)[e.meter.g]) e.meter.g = 0;
    e.measures = Math.max(1, Math.min(4, e.measures | 0 || 2));
    e.tempo = Math.max(40, Math.min(240, Math.round(e.tempo || 80)));
    e.parts = e.parts === 2 ? 2 : 1;
    // The number of the first measure — a rhythm grid can show where an excerpt comes from (m. 46).
    e.first = Math.max(1, Math.min(999, e.first | 0 || 1));
    if (!Array.isArray(e.layers)) e.layers = emptyLayers();
    while (e.layers.length < 2) e.layers.push([[], [], [], []]);
    e.layers.forEach((L) => { while (L.length < 4) L.push([]); });
    return e;
  }
  // A new example like the one before: its meter, length and tempo — and in a rhythm grid, carrying
  // on the measure numbers from where it stopped.
  const newExample = (from, grid) => exampleSettings(from
    ? { meter: Object.assign({}, from.meter), measures: from.measures, tempo: from.tempo, parts: 1, first: grid ? Math.min(999, (from.first || 1) + from.measures) : 1 }
    : {});
  // How a quiz is scored: every note is a point ('notes'), or the share of notes right is scaled
  // to a total the teacher sets ('percent', out of `outOf`).
  // task: 'dictation' (students hear the rhythm and write it) or 'grid' (students show where each note
  // starts and how long it lasts on a grid of boxes — see rhythmgrid.js).
  function rhythmSettings(block) {
    const b = block || {};
    b.task = b.task === 'grid' ? 'grid' : 'dictation';
    b.grid = gridSettings(b.grid);
    if (!Array.isArray(b.examples)) b.examples = [];
    b.examples.forEach(exampleSettings);
    if (b.task === 'grid') b.examples.forEach((ex) => { ex.parts = 1; });
    if (b.playsEx == null) b.playsEx = 0;           // 0 = as many plays as students like
    if (b.playsAns == null) b.playsAns = 0;
    if (b.score !== 'percent') b.score = 'notes';
    b.outOf = Math.max(1, Math.min(1000, Math.round(b.outOf || 100)));
    b.auto = autoSettings(b.auto);
    return b;
  }
  // A rhythm grid: how long each box is (a sixteenth, eighth or quarter note, in units), what students
  // get — the rhythm shown in notation (0), played (1), or both (2) — and whether rests are marked too.
  const GRID_BOXES = [3, 6, 12];
  function gridSettings(g) {
    const o = g || {};
    o.box = GRID_BOXES.includes(o.box) ? o.box : 3;
    o.show = [0, 1, 2].includes(o.show) ? o.show : 0;
    o.rests = o.rests ? 1 : 0;
    return o;
  }
  // Automatic examples: how many, how long, the level (1–6, or 7 for the teacher's own rules), the
  // quarter-note tempo, and the custom rules.
  function autoSettings(a) {
    const o = a || {};
    o.on = !!o.on;
    o.count = Math.max(1, Math.min(20, o.count | 0 || 5));
    o.measures = Math.max(1, Math.min(4, o.measures | 0 || 2));
    o.level = Math.max(1, Math.min(7, o.level | 0 || 2));
    o.tempo = Math.max(40, Math.min(240, Math.round(o.tempo || 80)));
    // gen: the generator version the examples come from. A quiz keeps its own; new ones use the latest.
    o.gen = Math.max(1, Math.min(7, o.gen | 0 || MQ.RHYTHM_GEN || 1));
    o.ties = o.ties ? 1 : 0;                        // tie some notes, over a bar line or a beat
    // Filled in place: the builder keeps hold of this object while the teacher edits it.
    const c = (o.custom = o.custom || {});
    const D = { lo: 2, hi: 4, compound: 0, cut: 0, uneven: 0, shortest: 3, dotted: 1, triplets: 0, offbeats: 1, rests: 1 };
    Object.keys(D).forEach((k) => { if (c[k] == null) c[k] = D[k]; });
    c.lo = Math.max(2, Math.min(6, c.lo | 0));
    c.hi = Math.max(c.lo, Math.min(6, c.hi | 0));
    c.shortest = Math.max(2, Math.min(4, c.shortest | 0));
    c.offbeats = Math.max(0, Math.min(2, c.offbeats | 0));
    c.rests = Math.max(0, Math.min(3, c.rests | 0));
    return o;
  }
  const partName = (l) => (l ? 'oboe part (stems down)' : 'piano part (stems up)');
  // Everything that stops an example being shared, in words.
  // grid (optional): the rhythm-grid settings, when the example has to fit the grid's boxes too.
  function exampleProblems(ex, grid) {
    const e = exampleSettings(ex), info = meterInfo(e.meter), out = [];
    if (grid && MQ.gridProblems) MQ.gridProblems(e, grid).forEach((t) => out.push(t));
    if (out.length) return out;
    for (let l = 0; l < e.parts; l++) {
      for (let m = 0; m < e.measures; m++) {
        const s = measureState(e.layers[l][m], info);
        if (s.ok) continue;
        const where = `Measure ${m + 1}${e.parts > 1 ? ' of the ' + partName(l) : ''}`;
        const note = measureNote(e.layers[l][m], info);
        out.push(!s.total ? `${where} is empty.` : `${where}: ${note}${/[.)]$/.test(note) ? '' : '.'}`);
      }
    }
    if (!out.length) for (let l = 0; l < e.parts; l++) tieProblems(e.layers[l], info.len, e.measures, (m) => `Measure ${m + 1}${e.parts > 1 ? ' of the ' + partName(l) : ''}`).forEach((t) => out.push(t));
    // Scores count notes, so an example needs at least one.
    if (!out.length && !e.layers.slice(0, e.parts).some((L) => L.slice(0, e.measures).some((m) => m.some((x) => !x.r)))) out.push('There are only rests — add at least one note.');
    return out;
  }
  function rhythmProblems(block) {
    const b = rhythmSettings(block), out = [];
    if (b.auto.on) return out;                      // generated examples are always complete
    b.examples.forEach((ex, i) => exampleProblems(ex, b.task === 'grid' ? b.grid : null).forEach((text) => out.push({ ex: i, text: `Example ${i + 1}: ${text}` })));
    return out;
  }

  // ---------- questions ----------
  const tempoText = (info, bpm) => `${TEMPO_NAMES[info.tempo]} = ${bpm}`;
  function exampleHint(ex, info) {
    return `${ex.measures} measure${ex.measures > 1 ? 's' : ''} of ${info.label}${info.grouping ? ` (${info.grouping})` : ''}. Tempo: ${tempoText(info, ex.tempo)}.`
      + (ex.parts > 1 ? ' Two parts: piano (stems up) and oboe (stems down).' : '');
  }
  function rhythmQuestions(cfg) {
    const b = rhythmSettings(cfg.rhythm);
    // Automatic examples come from the quiz's seed, so everyone with the code gets the same ones.
    const grid = b.task === 'grid';
    const list = b.auto.on && MQ.generateRhythms ? MQ.generateRhythms(cfg.seed, b.auto, grid ? b.grid : null) : b.examples;
    const n = b.auto.on ? list.length : Math.min(list.length, cfg.counts && cfg.counts.rhythm != null ? cfg.counts.rhythm : list.length);
    return list.slice(0, n).map((raw, i) => {
      const ex = exampleSettings(raw), info = meterInfo(ex.meter);
      if (grid && MQ.gridQuestion) return MQ.gridQuestion(ex, info, i, b.grid);
      return {
        type: 'rhythm', clef: 'treble',
        text: `Example ${i + 1}: write the rhythm you hear.`,
        hint: exampleHint(ex, info),
        rh: {
          n: i, meter: Object.assign({}, ex.meter), measures: ex.measures, tempo: ex.tempo, parts: ex.parts,
          layers: ex.layers.slice(0, ex.parts).map((L) => L.slice(0, ex.measures).map((m) => m.map(cleanEvent))),
        },
        sig: 'rh' + i, tags: [],
      };
    });
  }
  const blankAnswer = (q) => q.rh.layers.map((L) => L.map(() => []));

  // ---------- grading ----------
  // Note by note, by what sounds. Each note of the answer is right when the student has a note that
  // starts at the same moment, in the same part, and lasts as long. A note of the answer that is
  // missing or the wrong length is a wrong note, and so is each extra note the student writes where
  // the answer has none. Rests only fill time, so a quarter rest and two eighth rests are the same;
  // tied notes are one note, so a half note and two tied quarters are the same too.
  // {notes, wrong, parts: [{measures: [{want: [..], got: [..], ok}]}]} — want and got mark each note
  // and rest of the answer and of the student's rhythm: true right, false wrong, null for rests.
  function compareRhythm(q, resp) {
    const R = q.rh, len = meterInfo(R.meter).len;
    let notes = 0, wrong = 0;
    const parts = R.layers.map((answer, l) => {
      const count = answer.length;
      const mine = answer.map((_, m) => (resp && resp[l] && resp[l][m]) || []);
      const want = answer.map((evs) => evs.map(() => null)), got = mine.map((evs) => evs.map(() => null));
      const mark = (flags, n, ok) => n.evs.forEach((x) => { flags[x.m][x.i] = ok; });
      const theirs = soundingNotes(mine, len, count);
      soundingNotes(answer, len, count).forEach((a) => {
        notes++;
        const s = theirs.find((x) => x.m === a.m && x.t === a.t);
        const ok = !!s && s.d === a.d;
        mark(want, a, ok);
        if (s) mark(got, s, ok);
        if (!ok) wrong++;
      });
      theirs.forEach((s) => { if (got[s.m][s.i] == null) { mark(got, s, false); wrong++; } });
      return { measures: answer.map((_, m) => ({ want: want[m], got: got[m], ok: !want[m].includes(false) && !got[m].includes(false) })) };
    });
    return { notes, wrong, parts };
  }
  function gradeRhythm(q, resp) {
    const c = compareRhythm(q, resp);
    if (!c.notes) return c.wrong ? 0 : 1;
    return Math.max(0, c.notes - c.wrong) / c.notes;
  }
  const hasRhythmAnswer = (q, resp) => !!resp && resp.some((L) => L && L.some((m) => m && m.length));

  // The rhythm as text, for tables and answer keys: ♩ ♪ 𝅗𝅥 … with rests, dots and (triplets)³.
  const NOTE_SIGNS = ['𝅝', '𝅗𝅥', '♩', '♪', '𝅘𝅥𝅯'];
  const REST_SIGNS = ['𝄻', '𝄼', '𝄽', '𝄾', '𝄿'];
  function measureText(events, info) {
    const groups = tripletGroups(events, info);
    return events.map((e, i) => {
      const s = (e.r ? REST_SIGNS : NOTE_SIGNS)[e.v] + (e.d ? '.' : '');
      const g = groups.find((x) => x.from === i || x.to === i);
      return (g && g.from === i ? '(' : '') + s + (g && g.to === i ? ')³' : '') + (e.tie && !e.r ? '‿' : '');
    }).join(' ');
  }
  function rhythmText(layers, meter) {
    const info = meterInfo(meter);
    const line = (L) => '| ' + L.map((m) => measureText(m || [], info) || '—').join(' | ') + ' |';
    return layers.length > 1 ? `Piano ${line(layers[0])}  ·  Oboe ${line(layers[1])}` : line(layers[0]);
  }
  const describeRhythm = (q) => `${meterInfo(q.rh.meter).label}  ${rhythmText(q.rh.layers, q.rh.meter)}`;

  // ---------- playback ----------
  // What to play for measures `from`–`to` (0-based, inclusive): each part's notes, and metronome
  // clicks for the count-off and, if asked, under the music. Times are in seconds.
  function playEvents(ex, layers, opts) {
    const o = Object.assign({ from: 0, to: ex.measures - 1, countIn: 0, metronome: false }, opts);
    const info = meterInfo(ex.meter);
    const sec = 60 / ex.tempo / TEMPO_UNITS[info.tempo];      // one unit, in seconds
    const events = [], marks = [];
    const bars = o.to - o.from + 1;
    const start = o.countIn * info.len;
    const clicks = (at0, n) => {
      for (let b = 0; b < n; b++) info.beats.forEach((bt, k) => events.push({ at: (at0 + b * info.len + bt.at) * sec, voice: 'click', accent: k === 0 }));
    };
    clicks(0, o.countIn);
    if (o.metronome) clicks(start, bars);
    (layers || []).slice(0, ex.parts).forEach((L, l) => {
      let held = null;                              // a note tied over: the next one only lengthens it
      for (let m = o.from; m <= o.to; m++) {
        let at = start + (m - o.from) * info.len;
        (L[m] || []).forEach((e, i) => {
          const d = dur(e);
          if (!e.r) {
            if (held) held.dur += d * sec;
            else events.push(held = { at: at * sec, dur: d * sec, voice: l ? 'oboe' : 'piano', midi: e.p ? MQ.midi(e.p) : l ? OBOE_NOTE : PIANO_NOTE });
            if (!tieNext(L, m, i, info.len, o.to + 1)) held = null;
          }
          at += d;
        });
      }
    });
    for (let b = 0; b < o.countIn; b++) info.beats.forEach((bt, k) => marks.push({ at: (b * info.len + bt.at) * sec, m: -1, beat: b * info.beats.length + k + 1 }));
    for (let m = o.from; m <= o.to; m++) marks.push({ at: (start + (m - o.from) * info.len) * sec, m });
    return { events, marks, total: (start + bars * info.len) * sec };
  }

  Object.assign(MQ, {
    RHYTHM_VALUES: VALUES, RHYTHM_MAX: MAX_EXAMPLES, RHYTHM_GRID_BOXES: GRID_BOXES, rhythmGrid: gridSettings, rhythmCleanEvents: (m) => m.map(cleanEvent), RHYTHM_METERS: METERS, RHYTHM_TEMPO_UNITS: TEMPO_UNITS, RHYTHM_TEMPO_NAMES: TEMPO_NAMES,
    rhythmDur: dur, rhythmTotal: total, rhythmEvent: cleanEvent, rhythmTieNext: tieNext, rhythmSounding: soundingNotes, rhythmTieProblems: tieProblems, rhythmAddTies: addTies, rhythmMeter: meterInfo, rhythmGroupings: groupingsOf,
    rhythmAmount: amountText, rhythmCount: countText, tripletGroups, tripletStartOk, tripletWhy, measureState, rhythmEditProblem: editProblem, measureNote,
    rhythmExample: newExample, exampleSettings, rhythmSettings, exampleProblems, rhythmProblems, rhythmQuestions, rhythmBlank: blankAnswer,
    compareRhythm, gradeRhythm, hasRhythmAnswer, rhythmAuto: autoSettings, describeRhythm, rhythmText, rhythmPlayEvents: playEvents, rhythmTempoText: tempoText,
  });
})(typeof window !== 'undefined' ? window : globalThis);
