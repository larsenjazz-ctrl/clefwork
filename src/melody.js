/* Clefwork Melody — melodic dictation. The teacher writes melodies of one to eight measures, or lets
   Clefwork make them; the computer plays each one on the piano and students write it on a staff.
   A note is {v, d, t, r} as in Clefwork Rhythm, plus p = {step, oct, alt} when it isn't a rest.
   Grading is note by note: a note's rhythm is right when the student has a note starting at the
   same moment and lasting as long; its pitch is right when the student's note sounding at that
   moment has the same pitch (so a rhythm slip doesn't also cost the pitch). */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const LETTERS = 'CDEFGAB';
  const SHARP_STEPS = [3, 0, 4, 1, 5, 2, 6];            // F C G D A E B
  const MAX_MEASURES = 8, MAX_EXAMPLES = 12;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- keys ----------
  function keyAlts(fifths) {
    const a = [0, 0, 0, 0, 0, 0, 0];
    if (fifths > 0) SHARP_STEPS.slice(0, fifths).forEach((s) => (a[s] = 1));
    else SHARP_STEPS.slice().reverse().slice(0, -fifths).forEach((s) => (a[s] = -1));
    return a;
  }
  // {fifths, mode} → the key's tonic, name and the alteration its signature gives each letter.
  function melodyKey(key) {
    const k = key || {};
    const fifths = clamp(k.fifths | 0, -7, 7), mode = k.mode === 'minor' ? 'minor' : 'major';
    const name = (mode === 'minor' ? MQ.MINOR_KEYS : MQ.MAJOR_KEYS)[fifths + 7];
    return { fifths, mode, name, alts: keyAlts(fifths), tonic: { step: LETTERS.indexOf(name[0]), alt: name.includes('♯') ? 1 : name.includes('♭') ? -1 : 0 } };
  }
  const melodyKeyName = (key) => { const K = melodyKey(key); return `${K.name} ${K.mode}`; };
  // The note on a line or space (a diatonic index, as MQ.dia gives), as the key signature spells it.
  const pitchAt = (K, dia) => { const step = ((dia % 7) + 7) % 7; return { step, oct: Math.floor(dia / 7), alt: K.alts[step] }; };

  // ---------- examples ----------
  function melodyExample(ex) {
    const e = ex || {};
    if (!e.meter || !MQ.RHYTHM_METERS.some((m) => m.n === e.meter.n && m.d === e.meter.d)) e.meter = { n: 4, d: 4, g: 0 };
    const groups = MQ.rhythmGroupings(e.meter);
    if (!groups || !groups[e.meter.g]) e.meter.g = 0;
    e.measures = clamp(e.measures | 0 || 4, 1, MAX_MEASURES);
    e.tempo = clamp(Math.round(e.tempo || 72), 40, 240);
    e.key = { fifths: clamp((e.key && e.key.fifths) | 0, -7, 7), mode: e.key && e.key.mode === 'minor' ? 'minor' : 'major' };
    e.clef = e.clef === 'bass' ? 'bass' : 'treble';
    e.parts = 1;
    if (!Array.isArray(e.layers) || !Array.isArray(e.layers[0])) e.layers = [[]];
    e.layers.length = 1;
    while (e.layers[0].length < MAX_MEASURES) e.layers[0].push([]);
    return e;
  }
  const newMelody = (from) => melodyExample(from
    ? { meter: Object.assign({}, from.meter), measures: from.measures, tempo: from.tempo, key: Object.assign({}, from.key), clef: from.clef } : {});
  // Automatic melodies: how many, how long, the level (7: the teacher's own rules), the quarter-note
  // tempo, which keys (1 major, 2 minor, 3 both; up to keyMax sharps or flats), whether chromatic
  // notes may appear, which clefs (1 treble, 2 bass, 3 both), and the custom rules — the rhythm's,
  // plus the range (a fifth, sixth, octave, tenth or twelfth) and the largest leap (a third … an octave).
  function melodyAuto(a) {
    const o = a || {};
    o.on = !!o.on;
    o.gen = clamp(o.gen | 0 || MQ.MELODY_GEN || 1, 1, 7);
    o.count = clamp(o.count | 0 || 4, 1, 20);
    o.measures = clamp(o.measures | 0 || 4, 1, MAX_MEASURES);
    o.level = clamp(o.level | 0 || 2, 1, 7);
    o.tempo = clamp(Math.round(o.tempo || 72), 40, 240);
    o.keyMode = clamp(o.keyMode | 0 || 1, 1, 3);
    o.keyMax = clamp(o.keyMax == null ? 2 : o.keyMax | 0, 0, 7);
    o.chromatic = o.chromatic ? 1 : 0;
    o.clefs = clamp(o.clefs | 0 || 1, 1, 3);
    // Filled in place: the builder keeps hold of this object while the teacher edits it.
    const c = (o.custom = o.custom || {});
    const D = { lo: 2, hi: 4, compound: 0, cut: 0, uneven: 0, shortest: 3, dotted: 1, triplets: 0, offbeats: 1, rests: 1, range: 2, leap: 2 };
    Object.keys(D).forEach((k) => { if (c[k] == null) c[k] = D[k]; });
    c.lo = clamp(c.lo | 0, 2, 6); c.hi = clamp(c.hi | 0, c.lo, 6);
    c.shortest = clamp(c.shortest | 0, 2, 4); c.offbeats = clamp(c.offbeats | 0, 0, 2); c.rests = clamp(c.rests | 0, 0, 3);
    c.range = clamp(c.range | 0, 0, 4); c.leap = clamp(c.leap | 0, 0, 4);
    return o;
  }
  // score and outOf as in Clefwork Rhythm; first: tell students the first note; split: pitch and
  // rhythm are half a point each, instead of a note being right only when both are.
  function melodySettings(block) {
    const b = block || {};
    if (!Array.isArray(b.examples)) b.examples = [];
    b.examples.forEach(melodyExample);
    if (b.playsEx == null) b.playsEx = 0;
    if (b.playsAns == null) b.playsAns = 0;
    if (b.score !== 'percent') b.score = 'notes';
    b.outOf = clamp(Math.round(b.outOf || 100), 1, 1000);
    b.first = b.first == null ? 1 : b.first ? 1 : 0;
    b.split = b.split ? 1 : 0;
    b.auto = melodyAuto(b.auto);
    return b;
  }
  function melodyProblems(block) {
    const b = melodySettings(block), out = [];
    if (b.auto.on) return out;
    b.examples.forEach((ex, n) => {
      const info = MQ.rhythmMeter(ex.meter);
      for (let m = 0; m < ex.measures; m++) {
        const events = ex.layers[0][m], s = MQ.measureState(events, info);
        if (s.ok) continue;
        const note = MQ.measureNote(events, info);
        out.push({ ex: n, text: `Melody ${n + 1}: measure ${m + 1} ${!s.total ? 'is empty.' : `— ${note}${/[.)]$/.test(note) ? '' : '.'}`}` });
      }
      if (!out.some((x) => x.ex === n) && !ex.layers[0].slice(0, ex.measures).some((m) => m.some((e) => !e.r))) out.push({ ex: n, text: `Melody ${n + 1} has only rests — add at least one note.` });
    });
    return out;
  }

  // ---------- questions ----------
  function firstNote(layers) {
    for (const m of layers[0]) for (const e of m) if (!e.r && e.p) return Object.assign({}, e.p);
    return null;
  }
  function melodyHint(ex, info, first) {
    return `${ex.measures} measure${ex.measures > 1 ? 's' : ''} of ${info.label}${info.grouping ? ` (${info.grouping})` : ''} in ${melodyKeyName(ex.key)}, ${ex.clef} clef. `
      + `Tempo: ${MQ.rhythmTempoText(info, ex.tempo)}.` + (first ? ` The first note is ${MQ.fullName(first)}.` : '');
  }
  function melodyQuestions(cfg) {
    const b = melodySettings(cfg.melody);
    const list = b.auto.on && MQ.generateMelodies ? MQ.generateMelodies(cfg.seed, b.auto) : b.examples;
    const n = b.auto.on ? list.length : Math.min(list.length, cfg.counts && cfg.counts.melody != null ? cfg.counts.melody : list.length);
    return list.slice(0, n).map((raw, i) => {
      const ex = melodyExample(raw), info = MQ.rhythmMeter(ex.meter);
      const layers = [ex.layers[0].slice(0, ex.measures).map((m) => m.map(MQ.rhythmEvent))];
      const first = b.first ? firstNote(layers) : null;
      return {
        type: 'melody', clef: ex.clef,
        text: `Melody ${i + 1}: write the melody you hear.`,
        hint: melodyHint(ex, info, first),
        mel: { n: i, meter: Object.assign({}, ex.meter), measures: ex.measures, tempo: ex.tempo, key: Object.assign({}, ex.key), clef: ex.clef, parts: 1, layers, first, split: b.split },
        sig: 'ml' + i, tags: [],
      };
    });
  }
  const blankMelody = (q) => [q.mel.layers[0].map(() => [])];

  // ---------- grading ----------
  function notesOf(events) {
    const out = [];
    let at = 0;
    (events || []).forEach((e, i) => { const d = MQ.rhythmDur(e); if (!e.r) out.push({ t: at, d, i, p: e.p }); at += d; });
    return out;
  }
  const samePitch = (a, b) => !!a && !!b && MQ.midi(a) === MQ.midi(b);
  // {notes, wrong, pw, rw, parts}: how many notes the answer has; how many are wrong (pitch or
  // rhythm, plus each extra note); pitch mistakes; rhythm mistakes (extra notes count here); and
  // for each measure the answer's and the student's notes marked right or wrong, as compareRhythm.
  function compareMelody(q, resp) {
    const M = q.mel;
    let notes = 0, wrong = 0, pw = 0, rw = 0;
    const measures = M.layers[0].map((answer, m) => {
      const mine = (resp && resp[0] && resp[0][m]) || [];
      const want = answer.map(() => null), got = mine.map(() => null);
      const theirs = notesOf(mine);
      let bad = 0;
      notesOf(answer).forEach((a) => {
        notes++;
        const s = theirs.find((x) => x.t === a.t);
        const sounding = theirs.find((x) => x.t <= a.t && a.t < x.t + x.d);
        const rOk = !!s && s.d === a.d, pOk = !!sounding && samePitch(sounding.p, a.p);
        if (!rOk) rw++;
        if (!pOk) pw++;
        const ok = rOk && pOk;
        want[a.i] = ok;
        if (s) got[s.i] = ok;
        if (!ok) bad++;
      });
      theirs.forEach((s) => { if (got[s.i] == null) { got[s.i] = false; bad++; rw++; } });
      wrong += bad;
      return { want, got, ok: !bad };
    });
    return { notes, wrong, pw, rw, parts: [{ measures }] };
  }
  // Points lost: a whole point for each wrong note, or half a point for each pitch or rhythm mistake.
  const melodyLost = (c, split) => (split ? (c.pw + c.rw) / 2 : c.wrong);
  function gradeMelody(q, resp) {
    const c = compareMelody(q, resp);
    if (!c.notes) return c.wrong ? 0 : 1;
    return Math.max(0, c.notes - melodyLost(c, q.mel.split)) / c.notes;
  }
  const hasMelodyAnswer = (q, resp) => !!resp && resp.some((L) => L && L.some((m) => m && m.some((e) => e)));
  const DUR_SIGNS = ['𝅝', '𝅗𝅥', '♩', '♪', '𝅘𝅥𝅯'];
  const REST_SIGNS = ['𝄻', '𝄼', '𝄽', '𝄾', '𝄿'];
  function describeMelody(q) {
    const M = q.mel;
    const bar = (m) => m.map((e) => (e.r ? REST_SIGNS[e.v] : MQ.fullName(e.p) + DUR_SIGNS[e.v]) + (e.d ? '.' : '') + (e.t ? '³' : '')).join(' ') || '—';
    return `${melodyKeyName(M.key)}  | ${M.layers[0].map(bar).join(' | ')} |`;
  }

  // ---------- hearing the key ----------
  // The tonic chord in the melody's register — broken, then together — before the melody.
  function keyEvents(M, tempo) {
    const K = melodyKey(M.key);
    const mid = MQ.CLEFS[M.clef === 'bass' ? 'bass' : 'treble'].bottom + 4;
    let t = K.tonic.step;
    while (t + 7 <= mid) t += 7;
    const midi = (d) => MQ.midi(pitchAt(K, t + d));
    const step = Math.max(0.3, Math.min(0.6, 60 / (tempo || 72)));
    const events = [0, 2, 4, 7].map((d, j) => ({ at: j * step, dur: step, voice: 'piano', midi: midi(d) }));
    [0, 2, 4, 7].forEach((d) => events.push({ at: 4 * step, dur: 1.4, voice: 'piano', midi: midi(d) }));
    return { events, total: 4 * step + 1.5, marks: [] };
  }

  Object.assign(MQ, {
    MELODY_MAX: MAX_EXAMPLES, MELODY_MEASURES: MAX_MEASURES,
    melodyKey, melodyKeyName, melodyPitchAt: pitchAt, melodyKeyAlts: keyAlts,
    melodyExample, newMelody, melodyAuto, melodySettings, melodyProblems, melodyQuestions, melodyBlank: blankMelody, melodyFirstNote: firstNote,
    compareMelody, melodyLost, gradeMelody, hasMelodyAnswer, describeMelody, melodyKeyEvents: keyEvents,
  });
})(typeof window !== 'undefined' ? window : globalThis);
