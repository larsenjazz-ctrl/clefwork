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

  // ---------- singing it in your own range ----------
  // A student may move a melody up or down by as much as an octave, and read it in the other clef —
  // two octaves away — so it sits in their voice. The melody keeps its shape: every note moves the
  // same interval, and the key signature moves with it.
  const MAX_SHIFT = 12, CLEF_SHIFT = 24;
  const singShift = (M, resp) => {
    const r = resp || {};
    const tr = clamp(Math.round(r.tr || 0), -MAX_SHIFT, MAX_SHIFT);
    const swap = r.bass ? 1 : 0;
    return { tr, swap, semis: tr + (swap ? (M && M.clef === 'bass' ? CLEF_SHIFT : -CLEF_SHIFT) : 0) };
  };
  // The key a melody lands in when it moves n semitones: a semitone is seven steps round the circle
  // of fifths, and of the two spellings the one with fewer sharps or flats wins (C major up one
  // semitone is D♭ major, not C♯ major).
  function singKeyAfter(key, semis) {
    const K = MQ.melodyKey(key);
    let f = K.fifths + 7 * (((semis % 12) + 12) % 12);
    while (f > 7) f -= 12;
    while (f < -7) f += 12;
    const other = f > 0 ? f - 12 : f + 12;
    if (Math.abs(other) < Math.abs(f)) f = other;
    return { fifths: f, mode: K.mode };
  }
  // The melody as the student reads and sings it.
  function singTransposed(M, resp) {
    const { semis, swap } = singShift(M, resp);
    if (!semis && !swap) return M;
    const key = singKeyAfter(M.key, semis);
    const from = MQ.melodyKey(M.key), to = MQ.melodyKey(key);
    // How far the letters move: from the old tonic to the new one, in the octave the shift lands in.
    const p0 = { step: from.tonic.step, alt: from.tonic.alt, oct: 4 };
    const target = MQ.midi(p0) + semis;
    const tonicAt = (o) => ({ step: to.tonic.step, alt: to.tonic.alt, oct: o });
    let oct = 4;
    while (MQ.midi(tonicAt(oct)) < target) oct++;
    while (MQ.midi(tonicAt(oct)) > target) oct--;
    const letters = MQ.dia(tonicAt(oct)) - MQ.dia(p0);
    const move = (p) => {
      const base = MQ.fromDia(MQ.dia(p) + letters, 0);
      return { step: base.step, oct: base.oct, alt: MQ.midi(p) + semis - MQ.midi(base) };
    };
    const layers = [M.layers[0].map((bar) => bar.map((e) => (e.r || !e.p ? Object.assign({}, e) : Object.assign({}, e, { p: move(e.p) }))))];
    const out = Object.assign({}, M, { key, layers, first: M.first ? move(M.first) : M.first });
    if (swap) out.clef = M.clef === 'bass' ? 'treble' : 'bass';
    return out;
  }
  // How a student sang it, for the teacher: "G major · up 2 semitones · bass clef".
  function singSungText(M, resp) {
    const { tr, swap } = singShift(M, resp);
    const t = singTransposed(M, resp);
    if (!tr && !swap) return `${MQ.melodyKeyName(M.key)} · as written`;
    const parts = [MQ.melodyKeyName(t.key)];
    if (tr) parts.push(`${tr > 0 ? 'up' : 'down'} ${Math.abs(tr)} semitone${Math.abs(tr) === 1 ? '' : 's'}`);
    if (swap) parts.push(`${t.clef} clef, two octaves ${t.clef === 'bass' ? 'lower' : 'higher'}`);
    return parts.join(' · ');
  }

  // ---------- what students may hear ----------
  // Do, in the octave the melody itself sits in — so a student who has moved the melody down hears
  // Do and the scale down there too, where they are going to sing them.
  function doPitch(M, minor) {
    const K = MQ.melodyKey(M.key);
    const name = K.mode === 'minor' && !minor ? MQ.MAJOR_KEYS[K.fifths + 7] : null;
    const step = name ? LETTERS.indexOf(name[0]) : K.tonic.step;
    const notes = [].concat(...(M.layers && M.layers[0] ? M.layers[0] : [])).filter((e) => e && !e.r && e.p).map((e) => MQ.midi(e.p)).sort((a, b) => a - b);
    const anchor = notes.length ? notes[Math.floor(notes.length / 2)]
      : MQ.midi(MQ.melodyPitchAt(K, MQ.CLEFS[M.clef === 'bass' ? 'bass' : 'treble'].bottom + 4));
    // The highest Do at or just below the melody's middle, so its scale covers the melody.
    let d = step;
    while (MQ.midi(MQ.melodyPitchAt(K, d + 7)) <= anchor + 2) d += 7;
    while (MQ.midi(MQ.melodyPitchAt(K, d)) > anchor + 2) d -= 7;
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
    SING_MAX_SHIFT: MAX_SHIFT,
    singSettings, singCount, singQuestions, singPick, singDo, singAidEvents, singScaleName,
    singShift, singKeyAfter, singTransposed, singSungText,
    singDone, gradeSing, hasSingAnswer, describeSing,
  });
})(typeof window !== 'undefined' ? window : globalThis);
