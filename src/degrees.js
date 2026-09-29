/* Clefwork — Scale Degrees. A melody of one to eight measures, made by Clefwork Melody's generator,
   is printed on the staff with its key signature; students label each note with its scale degree,
   1 to 7. A note's degree comes from its letter name counted up from the tonic, so a minor key's
   raised sixth and seventh (the melodic and harmonic minor's) are still 6 and 7. The melodies use
   no chromatic notes. Each melody is one question, and each note is an equal share of its credit.
   cfg.deg holds the settings; cfg.counts.degree is how many melodies to ask. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const MAX_MELODIES = 20;

  // measures: 1–8 per melody; level: Clefwork Melody's levels 1–6 (how far it leaps, how busy the
  // rhythm is); keyMode: 1 major, 2 minor, 3 both; keyMax: up to this many sharps or flats; clefs:
  // 1 treble, 2 bass, 3 both; hear: students may play the melody and the key (1) or only read it (0);
  // gen: the melody generator's version, so a quiz code keeps its melodies.
  function degreeSettings(d) {
    const s = d || {};
    s.measures = clamp(s.measures | 0 || 2, 1, 8);
    s.level = clamp(s.level | 0 || 1, 1, 6);
    s.keyMode = clamp(s.keyMode | 0 || 1, 1, 3);
    s.keyMax = clamp(s.keyMax == null ? 3 : s.keyMax | 0, 0, 7);
    s.clefs = clamp(s.clefs | 0 || 1, 1, 3);
    s.hear = s.hear == null ? 1 : s.hear ? 1 : 0;
    s.gen = clamp(s.gen | 0 || MQ.MELODY_GEN || 1, 1, 7);
    return s;
  }

  // The scale degree of a pitch in a key: its letter counted up from the tonic's letter.
  const degreeOf = (K, p) => ((((p.step - K.tonic.step) % 7) + 7) % 7) + 1;

  function degreeQuestions(cfg) {
    const n = clamp((cfg.counts && cfg.counts.degree) | 0, 0, MAX_MELODIES);
    if (!n || !MQ.generateMelodies) return [];
    const s = degreeSettings(cfg.deg);
    const auto = { on: true, gen: s.gen, count: n, measures: s.measures, level: s.level, tempo: 72, keyMode: s.keyMode, keyMax: s.keyMax, chromatic: 0, clefs: s.clefs };
    // Its own seed, so these aren't the same melodies a dictation block on the same seed would make.
    const list = MQ.generateMelodies(((cfg.seed >>> 0) ^ 0x5ca1ede9) >>> 0, auto);
    return list.map((raw, k) => {
      const ex = MQ.melodyExample(raw), K = MQ.melodyKey(ex.key);
      const layers = [ex.layers[0].slice(0, ex.measures).map((m) => m.map(MQ.rhythmEvent))];
      const notes = [];
      layers[0].forEach((bar, m) => bar.forEach((e, i) => { if (!e.r && e.p) notes.push({ m, i, deg: degreeOf(K, e.p) }); }));
      const keyName = MQ.melodyKeyName(ex.key);
      return {
        type: 'degree', clef: ex.clef,
        text: 'Write the scale degree of each note of this melody.',
        hint: `In ${keyName}, the tonic (${K.name}) is 1.` + (ex.key.mode === 'minor' ? ' A raised 6th or 7th is still 6 or 7.' : ''),
        deg: { meter: Object.assign({}, ex.meter), measures: ex.measures, tempo: ex.tempo, key: Object.assign({}, ex.key), clef: ex.clef, parts: 1, layers, notes },
        sig: 'dg' + k, tags: [],
      };
    });
  }

  // A response is one number per note, in order: 1–7, or 0 / null for blank.
  const cleanDegrees = (q, resp) => q.deg.notes.map((_, j) => { const v = resp && resp[j]; return v >= 1 && v <= 7 ? v | 0 : 0; });
  const markDegrees = (q, resp) => { const r = cleanDegrees(q, resp); return q.deg.notes.map((n, j) => r[j] === n.deg); };
  function gradeDegrees(q, resp) {
    const n = q.deg.notes.length;
    return n ? markDegrees(q, resp).filter(Boolean).length / n : 1;
  }
  const hasDegreeAnswer = (q, resp) => cleanDegrees(q, resp).some((v) => v > 0);
  // "G major  | 1 2 3 1 | 5 4 3 2 |"
  function describeDegrees(q) {
    const D = q.deg, bars = D.layers[0].map(() => []);
    D.notes.forEach((n) => bars[n.m].push(n.deg));
    return `${MQ.melodyKeyName(D.key)}  | ${bars.map((b) => b.join(' ') || '—').join(' | ')} |`;
  }

  Object.assign(MQ, {
    DEGREE_MAX: MAX_MELODIES, degreeSettings, degreeOf, degreeQuestions, cleanDegrees, markDegrees, gradeDegrees, hasDegreeAnswer, describeDegrees,
  });
})(typeof window !== 'undefined' ? window : globalThis);
