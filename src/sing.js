/* Clefwork Sight Singing — the teacher sets the melodies exactly as in Clefwork Melody (written by
   hand, made by Clefwork, or taken from the library); students read one at a time and record
   themselves singing it away from Clefwork. Nothing here ever plays the melody to a student: the
   help they can ask for is Do, the scale of the key and the first note.
   A quiz can give everyone the same melodies, or hold a bank and give each student a few of them —
   so the quiz keeps, besides the student's name, which melodies they were given and which they say
   they recorded. The recordings themselves go to Canvas, not to Clefwork. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const LETTERS = 'CDEFGAB';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Which help a student may hear, as bits.
  const AID_DO = 1, AID_SCALE = 2, AID_FIRST = 4;

  // pick: how many of the melodies each student is given (0 = all of them, in order).
  // aids: the bits above. minor: 0 la-based (in a minor key Do is the relative major's tonic, and
  // the scale is that major scale), 1 do-based (Do is the key's own tonic). tick: students mark each
  // melody as recorded.
  function singSettings(block) {
    const b = block || {};
    b.pick = clamp(b.pick | 0, 0, 31);
    b.aids = b.aids == null ? AID_DO | AID_SCALE | AID_FIRST : clamp(b.aids | 0, 0, 7);
    b.minor = b.minor ? 1 : 0;
    b.tick = b.tick == null ? 1 : b.tick ? 1 : 0;
    return b;
  }
  // How many melodies a student actually sings, out of a bank of `total`.
  const singCount = (s, total) => (!s.pick || s.pick >= total ? total : s.pick);

  // ---------- the melodies ----------
  // The same melodies Clefwork Melody would use, asked for singing instead of dictation.
  function singQuestions(cfg) {
    const b = MQ.melodySettings(cfg.melody);
    const s = singSettings(cfg.sing);
    const list = b.auto.on && MQ.generateMelodies ? MQ.generateMelodies(cfg.seed, b.auto) : b.examples;
    const want = cfg.counts && cfg.counts.sing != null ? cfg.counts.sing : list.length;
    const n = b.auto.on ? list.length : Math.min(list.length, want);
    return list.slice(0, n).map((raw, i) => {
      const ex = MQ.melodyExample(raw), info = MQ.rhythmMeter(ex.meter);
      const layers = [ex.layers[0].slice(0, ex.measures).map((m) => m.map(MQ.rhythmEvent))];
      const first = MQ.melodyFirstNote(layers);
      return {
        type: 'sing', clef: ex.clef,
        text: 'Sing this melody and record yourself.',
        hint: `${ex.measures} measure${ex.measures > 1 ? 's' : ''} of ${info.label} in ${MQ.melodyKeyName(ex.key)}, ${ex.clef} clef.`,
        mel: { n: i, meter: Object.assign({}, ex.meter), measures: ex.measures, tempo: ex.tempo, key: Object.assign({}, ex.key), clef: ex.clef, parts: 1, layers, first: b.first ? first : null, split: 0 },
        sing: { n: i, first, aids: s.aids, minor: s.minor, tick: s.tick },
        sig: 'sg' + i, tags: [],
      };
    });
  }
  // Which melodies one student is given: all of them, or a few of the bank, kept in the bank's order
  // so a melody keeps its number. rnd() is the student's own — everyone gets a different draw.
  function singPick(cfg, total, rnd) {
    const s = singSettings(cfg.sing);
    const n = singCount(s, total);
    const all = [];
    for (let i = 0; i < total; i++) all.push(i);
    if (n >= total) return all;
    const random = rnd || Math.random;
    for (let i = all.length - 1; i > 0; i--) {         // Fisher–Yates, then back into the bank's order
      const j = Math.floor(random() * (i + 1));
      const t = all[i]; all[i] = all[j]; all[j] = t;
    }
    return all.slice(0, n).sort((a, b) => a - b);
  }

  // ---------- what students may hear ----------
  // Do, in the melody's own register.
  function doPitch(M, minor) {
    const K = MQ.melodyKey(M.key);
    const name = K.mode === 'minor' && !minor ? MQ.MAJOR_KEYS[K.fifths + 7] : null;
    const step = name ? LETTERS.indexOf(name[0]) : K.tonic.step;
    const mid = MQ.CLEFS[M.clef === 'bass' ? 'bass' : 'treble'].bottom + 4;
    let d = step;
    while (d + 7 <= mid) d += 7;
    while (d - 7 >= mid - 3) d -= 7;
    return { dia: d, pitch: MQ.melodyPitchAt(K, d) };
  }
  const singDo = (M, minor) => doPitch(M, minor).pitch;
  // 'do' one note, 'scale' the eight notes of the key from Do up, 'first' the melody's opening note.
  function singAidEvents(M, kind, minor) {
    const K = MQ.melodyKey(M.key);
    if (kind === 'first') {
      const p = M.first || MQ.melodyFirstNote(M.layers);
      if (!p) return null;
      return { events: [{ at: 0, dur: 1.4, voice: 'piano', midi: MQ.midi(p) }], total: 1.6, marks: [] };
    }
    const base = doPitch(M, minor);
    if (kind === 'do') return { events: [{ at: 0, dur: 1.4, voice: 'piano', midi: MQ.midi(base.pitch) }], total: 1.6, marks: [] };
    const step = 0.42;
    const events = [];
    for (let i = 0; i <= 7; i++) events.push({ at: i * step, dur: step, voice: 'piano', midi: MQ.midi(MQ.melodyPitchAt(K, base.dia + i)) });
    return { events, total: 8 * step + 0.4, marks: [] };
  }
  // What the scale button is called, which depends on the key and on how minor is counted.
  function singScaleName(M, minor) {
    const K = MQ.melodyKey(M.key);
    if (K.mode === 'major') return `${K.name} major scale`;
    return minor ? `${K.name} minor scale` : `${MQ.MAJOR_KEYS[K.fifths + 7]} major scale`;
  }

  // ---------- what the quiz keeps ----------
  // There is nothing to mark: the recording is graded by ear, in Canvas. A melody counts as done
  // when the student ticks it off (or at once, when the teacher turns ticking off).
  const singDone = (q, resp) => (q.sing.tick ? !!(resp && resp.done) : true);
  const gradeSing = (q, resp) => (singDone(q, resp) ? 1 : 0);
  const hasSingAnswer = (q, resp) => !!(resp && resp.done);
  const describeSing = (q) => MQ.describeMelody(q);

  Object.assign(MQ, {
    SING_AIDS: { DO: AID_DO, SCALE: AID_SCALE, FIRST: AID_FIRST },
    singSettings, singCount, singQuestions, singPick, singDo, singAidEvents, singScaleName,
    singDone, gradeSing, hasSingAnswer, describeSing,
  });
})(typeof window !== 'undefined' ? window : globalThis);
