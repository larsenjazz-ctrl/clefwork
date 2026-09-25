/* Clefwork — music theory model, question generation and grading.
   Pitches are {step: 0-6 (C..B), oct: scientific octave, alt: -1 flat / 0 / 1 sharp}. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMIS = [0, 2, 4, 5, 7, 9, 11];

  const dia = (p) => p.oct * 7 + p.step;
  const midi = (p) => (p.oct + 1) * 12 + SEMIS[p.step] + p.alt;
  const fromDia = (d, alt = 0) => ({ step: ((d % 7) + 7) % 7, oct: Math.floor(d / 7), alt });
  const accSym = (a) => (a === -1 ? '♭' : a === 1 ? '♯' : a === -2 ? '♭♭' : a === 2 ? 'x' : '');
  const pcName = (p) => LETTERS[p.step] + accSym(p.alt);
  const fullName = (p) => pcName(p) + p.oct;
  const samePitch = (a, b) => !!a && !!b && a.step === b.step && a.oct === b.oct && a.alt === b.alt;
  // Starting notes avoid E♯, B♯, F♭, C♭ and anything beyond a single sharp or flat.
  const isCommon = (p) =>
    Math.abs(p.alt) <= 1 &&
    !((p.step === 2 || p.step === 6) && p.alt === 1) &&
    !((p.step === 3 || p.step === 0) && p.alt === -1);
  const okAlt = (p) => Math.abs(p.alt) <= 1;

  // `bottom` is the diatonic index of the bottom staff line (E4 treble, G2 bass).
  const CLEFS = {
    treble: { id: 'treble', label: 'Treble', bottom: 30 },
    bass: { id: 'bass', label: 'Bass', bottom: 18 },
    grand: { id: 'grand', label: 'Grand', bottom: null },
  };
  const clefLabel = (c) => (c === 'grand' ? 'Grand staff' : CLEFS[c].label + ' clef');
  const posOf = (p, clef) => dia(p) - CLEFS[clef].bottom;

  const QUAL = { m: 'minor', M: 'major', P: 'perfect', A: 'augmented', d: 'diminished' };
  const ORD = ['', 'unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'octave', '9th', '10th', '11th', '12th', '13th'];
  const iv = (id, s) => ({ id, n: +id.slice(1), s, name: QUAL[id[0]] + ' ' + ORD[+id.slice(1)] });
  const INTERVALS = [
    iv('m2', 1), iv('M2', 2), iv('m3', 3), iv('M3', 4), iv('P4', 5), iv('A4', 6), iv('d5', 6),
    iv('P5', 7), iv('m6', 8), iv('M6', 9), iv('m7', 10), iv('M7', 11), iv('P8', 12),
    // Compound intervals (added after the others so older quiz codes keep their meaning).
    iv('m9', 13), iv('M9', 14), iv('m10', 15), iv('M10', 16), iv('P11', 17), iv('A11', 18),
    iv('P12', 19), iv('m13', 20), iv('M13', 21),
  ];
  const SIMPLE_INTERVALS = 13;

  // Chord and scale members are [interval number, semitones] above the root.
  const CHORDS = [
    { id: 'maj', label: 'Major', name: 'major triad', iv: [[3, 4], [5, 7]] },
    { id: 'min', label: 'Minor', name: 'minor triad', iv: [[3, 3], [5, 7]] },
    { id: 'dim', label: 'Diminished', name: 'diminished triad', iv: [[3, 3], [5, 6]] },
    { id: 'aug', label: 'Augmented', name: 'augmented triad', iv: [[3, 4], [5, 8]] },
    { id: 'dom7', label: 'Dominant 7', name: 'dominant 7th chord', iv: [[3, 4], [5, 7], [7, 10]] },
    { id: 'maj7', label: 'Major 7', name: 'major 7th chord', iv: [[3, 4], [5, 7], [7, 11]] },
    { id: 'min7', label: 'Minor 7', name: 'minor 7th chord', iv: [[3, 3], [5, 7], [7, 10]] },
    { id: 'hdim7', label: 'Half-dim 7', name: 'half-diminished 7th chord', iv: [[3, 3], [5, 6], [7, 10]] },
  ];
  const INVERSIONS = [
    { id: 'root', label: 'Root position', name: 'root position' },
    { id: 'inv1', label: '1st inversion', name: 'first inversion' },
    { id: 'inv2', label: '2nd inversion', name: 'second inversion' },
    { id: 'inv3', label: '3rd inversion', name: 'third inversion', title: '7th chords only' },
  ];
  const SCALES = [
    { id: 'major', label: 'Major', name: 'major scale', iv: [[2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 11], [8, 12]] },
    { id: 'natmin', label: 'Natural minor', name: 'natural minor scale', iv: [[2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10], [8, 12]] },
    { id: 'harmin', label: 'Harmonic minor', name: 'harmonic minor scale', iv: [[2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 11], [8, 12]] },
    { id: 'melmin', label: 'Melodic minor', name: 'melodic minor scale', iv: [[2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 11], [8, 12]] },
    // Added after the first four so older quiz codes keep their meaning.
    { id: 'majpent', label: 'Major pentatonic', name: 'major pentatonic scale', pent: true, iv: [[2, 2], [3, 4], [5, 7], [6, 9], [8, 12]] },
    { id: 'minpent', label: 'Minor pentatonic', name: 'minor pentatonic scale', pent: true, iv: [[3, 3], [4, 5], [5, 7], [7, 10], [8, 12]] },
    { id: 'ionian', label: 'Ionian', name: 'Ionian mode', mode: true, iv: [[2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 11], [8, 12]] },
    { id: 'dorian', label: 'Dorian', name: 'Dorian mode', mode: true, iv: [[2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 10], [8, 12]] },
    { id: 'phrygian', label: 'Phrygian', name: 'Phrygian mode', mode: true, iv: [[2, 1], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10], [8, 12]] },
    { id: 'lydian', label: 'Lydian', name: 'Lydian mode', mode: true, iv: [[2, 2], [3, 4], [4, 6], [5, 7], [6, 9], [7, 11], [8, 12]] },
    { id: 'mixolydian', label: 'Mixolydian', name: 'Mixolydian mode', mode: true, iv: [[2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 10], [8, 12]] },
    { id: 'aeolian', label: 'Aeolian', name: 'Aeolian mode', mode: true, iv: [[2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10], [8, 12]] },
    { id: 'locrian', label: 'Locrian', name: 'Locrian mode', mode: true, iv: [[2, 1], [3, 3], [4, 5], [5, 6], [6, 8], [7, 10], [8, 12]] },
  ];
  const SIMPLE_SCALES = 4;

  // Indexed by fifths + 7 (−7 = seven flats … +7 = seven sharps).
  const MAJOR_KEYS = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
  const MINOR_KEYS = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
  const keyName = (fifths, mode) => (mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS)[fifths + 7] + ' ' + mode;

  const TYPES = [
    { id: 'place', label: 'Place the Note', blurb: 'Drag a named note onto the staff.', est: 20 },
    { id: 'identify', label: 'Name the Note', blurb: 'Read a printed note and choose its name.', est: 15 },
    { id: 'interval', label: 'Write an Interval', blurb: 'Add a note a given interval from a printed note.', est: 30 },
    { id: 'chord', label: 'Build a Chord', blurb: 'Build a chord from its symbol — triads through 13ths, in root position or an inversion — above a printed bass note.', est: 45 },
    { id: 'scale', label: 'Write a Scale', blurb: 'Fill in a scale ascending from its first note.', est: 75 },
    { id: 'keysig', label: 'Name the Key', blurb: 'Identify a key from its key signature.', est: 20 },
    { id: 'custom', label: 'Custom Chord', blurb: 'Teacher-written chord symbol questions.', est: 40, custom: true },
    { id: 'voicing', label: 'Single Voiced Chords', blurb: 'Voice one chord with a named technique — stacked thirds, chorale, block, drops, planes, pop horn or inner sevenths — or read a voicing and name the chord.', est: 55, custom: true },
    { id: 'progression', label: 'Chord Progression', blurb: 'Name each chord of a progression with Roman numerals, chord symbols, or both.', est: 70, custom: true },
    { id: 'figured', label: 'Figured Bass Chord', blurb: 'Read a chord and write its Roman numeral with figures, or spell a numeral on the staff.', est: 35 },
    { id: 'figprog', label: 'Figured Bass Progression', blurb: 'Write the Roman numeral and figures for every chord of a progression.', est: 80 },
    // Added last so the numbers older report codes use keep their meaning.
    { id: 'vprog', label: 'Voiced Progressions', blurb: 'Voice a whole progression with one technique, or name each chord of a voiced progression.', est: 90, custom: true },
    { id: 'keys', label: 'Keys & Notes', blurb: 'One note, shown on the grand staff, as a name with its octave, or as a piano key — answered another of those ways.', est: 15, custom: true },
    { id: 'analysis', label: 'Analysis', blurb: 'Boxes on a picture of real music, each answered with a Roman numeral, a chord symbol, or both.', est: 30, custom: true },
    { id: 'rhythm', label: 'Rhythm Dictation', blurb: 'Listen to a rhythm of one to four measures — one part or two — and write it on a one-line staff.', est: 120, custom: true },
    // The last type a report code's 4-bit type number can hold.
    { id: 'melody', label: 'Melodic Dictation', blurb: 'Listen to a melody of one to eight measures and write it on the staff, pitches and rhythm.', est: 180, custom: true },
  ];
  const BUILT_IN = TYPES.filter((t) => !t.custom);
  const MAX_CUSTOM = 20, MAX_CUSTOM_NOTES = 6, MAX_VOICING_NOTES = 8;

  // "Bbmaj7" → "B♭maj7", "F#m7b5" → "F♯m7♭5", "C/Bb" → "C/B♭". A lowercase b is a flat
  // when it follows a note letter or comes before a number.
  // ---------- chord-symbol spelling ----------
  // What people may type after the root, turned into one plain form for reading:
  //   mi / min / -  → m (minor)      ma / Ma / M / Δ → maj      + → aug      dim → dim
  //   - or + just before 5, 9, 11 or 13 → ♭ or ♯ (C7-9 = C7♭9, C7+11 = C7♯11)
  function normalizeSuffix(rest) {
    let r = String(rest || '').replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[º˚]/g, '°').replace(/Ø/g, 'ø')
      .replace(/\s+/g, '').replace(/[()]/g, '');
    r = r.replace(/^-/, 'm').replace(/^\+/, 'aug');
    r = r.replace(/-(?=(5|9|11|13)(?!\d))/g, 'b').replace(/\+(?=(5|9|11|13)(?!\d))/g, '#');
    r = r.replace(/Δ(?=\d)/g, 'maj').replace(/Δ/g, 'maj7');
    r = r.replace(/mi(?!n)/g, 'm').replace(/Ma(?!j)|ma(?!j)|MA(?!J)/g, 'maj').replace(/Maj|MAJ/g, 'maj').replace(/M(?=\d|$)/g, 'maj');
    return r;
  }
  // How Clefwork writes a chord symbol: mi for minor, ma for major, aug, ° for diminished, ♭/♯ for
  // altered notes — never -, + or maj.
  function prettySymbol(sym) {
    const m = String(sym || '').trim().match(/^([A-Ga-g])([#b♯♭]?)(.*)$/);
    if (!m) return String(sym || '');
    const root = m[1].toUpperCase() + (/[#♯]/.test(m[2]) ? '♯' : m[2] ? '♭' : '');
    let r = normalizeSuffix(m[3]);
    r = r.replace(/dim/g, '°').replace(/maj/g, 'ma').replace(/min/g, 'mi').replace(/m(?![ai])/g, 'mi');
    r = r.replace(/b(?=\d)/g, '♭').replace(/#(?=\d)/g, '♯');
    return root + r;
  }
  const typeIndex = (id) => TYPES.findIndex((t) => t.id === id);

  function transpose(p, n, s, dir) {
    const t = fromDia(dia(p) + dir * (n - 1), 0);
    return { step: t.step, oct: t.oct, alt: midi(p) + dir * s - midi(t) };
  }

  // ---------- configuration ----------
  // The first six are in every version of the quiz code; later ones were added in version 9.
  const FLAG_KEYS = ['shuffle', 'partial', 'feedback', 'labels', 'enharmonic', 'strictOctave', 'noHelpers'];
  const FLAG_KEYS_V1 = FLAG_KEYS.slice(0, 6);
  const maskOf = (list, ids) => list.reduce((m, it, i) => (ids.includes(it.id) ? m | (1 << i) : m), 0);
  const randomSeed = () => Math.floor(Math.random() * 0x100000);

  function defaultConfig() {
    return {
      title: 'Note Reading & Theory Check',
      teacher: '',
      seed: randomSeed(),
      clefs: 3, // bit 0 treble, bit 1 bass, bit 2 grand staff
      // Per-tab staff override: 0 use the quiz setting, 1 treble, 2 bass, 3 grand staff.
      staffOv: { place: 0, identify: 0, interval: 0, scale: 0, keysig: 0, chord: 0, figured: 0, figprog: 0 },
      // Per-tab notes setting: 0 use the quiz setting, 1 print the helper note, 2 students write every note.
      helpOv: { interval: 0, chord: 0, custom: 2, voicing: 2, vprog: 2 },
      figpAsk: 1, // figured bass progression: 1 analyse, 2 spell, 3 both
      counts: { place: 4, identify: 3, interval: 3, chord: 2, scale: 1, keysig: 2, custom: 0, voicing: 0, vprog: 0, progression: 0, figured: 0, figprog: 0, keys: 0, analysis: 0, rhythm: 0, melody: 0 },
      ledger: 1,
      accMode: 3,
      intervals: maskOf(INTERVALS, ['M2', 'm3', 'M3', 'P4', 'P5', 'P8']),
      intervalDir: 1,
      chords: maskOf(CHORDS, ['maj', 'min']),
      inversions: 1,
      chordQual: 0b00011, // major, minor (then diminished, augmented, sus)
      chordSize: 0b000101, // triads, 7ths (bits: triad, 6, 7, 9, 11, 13)
      chordAlt: 0, // bit 0 flat, bit 1 sharp
      chordStaff: 0b011, // treble, bass (then grand staff)
      chordAsk: 1, // 1 print the symbol and spell it, 2 print the notes and name the chord, 3 both
      // Figured bass: key mode (1 major, 2 minor, 3 both), how many sharps/flats, altered degrees
      // (bit 0 flat, bit 1 sharp), sizes (bit 0 triads, bit 1 sevenths), inversions, clefs,
      // what students do (1 analyse, 2 spell, 3 both) and how many chords in a progression.
      figKey: 1, figMax: 3, figAlt: 0, figSize: 0b01, figPos: 0b0111, figClefs: 0b11, figAsk: 1, figLen: 4,
      // The figured bass progression keeps its own copies of those settings.
      figpKey: 1, figpMax: 3, figpAlt: 0, figpSize: 0b01, figpPos: 0b0111, figpClefs: 0b11,
      scales: maskOf(SCALES, ['major']),
      scaleLen: 0,
      scaleModes: 0, // modes are off until this is switched on
      scaleAsk: 1, // 1 write the scale, 2 name a printed scale, 3 both
      keyAsk: 1, // 1 name the key, 2 choose its key signature, 3 both
      keyMode: 1,
      keyMax: 4,
      timeLimit: 0,
      // The two voicing categories. `tech` holds how many questions use each technique; `opts` holds
      // the per-technique choices. sizes: bit 0 triads, 1 sevenths, 2 ninths and above.
      // quals: bit 0 major, 1 minor, 2 augmented, 3 diminished, 4 suspended.
      // key: 0 major, 1 minor, 2 dorian, 3 chromatic. ask: 1 print the symbol and voice it,
      // 2 print the voicing and name the chord, 3 both.
      vc: { sizes: 0b011, quals: 0b00011, alts: 0, key: 3, slash: 0, ask: 1, tech: {}, opts: { thirdsStaff: 0, thirdsOmitRoot: 0, blockStaff: 0, planesOpen: 0, popNotes: 3, popStaff: 0, inner2: 0 } },
      vp: { sizes: 0b011, quals: 0b00011, alts: 0, key: 0, slash: 0, ask: 1, len: 4, tech: {}, opts: { thirdsStaff: 0, thirdsOmitRoot: 0, blockStaff: 0, planesOpen: 0, popNotes: 3, popStaff: 0, inner2: 0 } },
      canvasPts: 0, // points the quiz is worth in Canvas; 0 = show the raw score only
      retakes: null, // retakes allowed after the first attempt; null = as many as a student likes
      // Keys & Notes: which ways a note is shown and answered (bit 0 grand staff, 1 name with
      // octave, 2 piano key), and the range of notes asked, as MIDI numbers.
      keys: { prompts: 0b111, answers: 0b111, low: 48, high: 72 },
      // Clefwork Analysis: boxes on a picture of the score, each with its answers (see analysis.js).
      analysis: { override: 0, notes: '', img: null, regions: [] },
      // Clefwork Rhythm: the examples students hear and write, and how often they may play them (see rhythm.js).
      rhythm: { examples: [], playsEx: 0, playsAns: 0 },
      // Clefwork Melody: its melodies, or the settings that make them, and how it's heard and scored (see melody.js).
      melody: { examples: [], playsEx: 0, playsAns: 0 },
      custom: [],
      customGrade: 0,
      voicings: [],
      progs: [],
      progMode: 0,
      flags: { shuffle: true, partial: true, feedback: false, labels: false, enharmonic: false, strictOctave: false, noHelpers: false },
    };
  }
  const zeroCounts = () => ({ place: 0, identify: 0, interval: 0, chord: 0, scale: 0, keysig: 0, custom: 0, voicing: 0, vprog: 0, progression: 0, figured: 0, figprog: 0, keys: 0, analysis: 0, rhythm: 0, melody: 0 });
  const withCfg = (c, patch) => Object.assign(JSON.parse(JSON.stringify(c)), patch);

  const PRESETS = [
    { id: 'treble', label: 'Treble note reading', apply: (c) => withCfg(c, { title: 'Treble Clef Note Reading', clefs: 1, ledger: 1, accMode: 0, counts: Object.assign(zeroCounts(), { place: 6, identify: 6 }) }) },
    { id: 'bass', label: 'Bass note reading', apply: (c) => withCfg(c, { title: 'Bass Clef Note Reading', clefs: 2, ledger: 1, accMode: 0, counts: Object.assign(zeroCounts(), { place: 6, identify: 6 }) }) },
    { id: 'intervals', label: 'Intervals', apply: (c) => withCfg(c, { title: 'Interval Writing', clefs: 3, ledger: 1, accMode: 3, intervalDir: 1, intervals: maskOf(INTERVALS, ['M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'm7', 'P8']), counts: Object.assign(zeroCounts(), { interval: 10 }) }) },
    { id: 'chords', label: 'Triads & 7ths', apply: (c) => withCfg(c, { title: 'Chord Building', clefs: 3, ledger: 1, accMode: 3, chords: maskOf(CHORDS, ['maj', 'min', 'dim', 'aug', 'dom7']), chordQual: 0b01111, chordSize: 0b000101, chordAlt: 0, counts: Object.assign(zeroCounts(), { chord: 8 }) }) },
    { id: 'scales', label: 'Scales & keys', apply: (c) => withCfg(c, { title: 'Scales and Key Signatures', clefs: 3, ledger: 1, accMode: 3, scales: maskOf(SCALES, ['major', 'natmin', 'harmin']), scaleLen: 0, keyMode: 3, keyMax: 5, counts: Object.assign(zeroCounts(), { scale: 4, keysig: 6 }) }) },
  ];

  // ---------- deterministic randomness ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- generators ----------
  const rangeOf = (cfg) => ({ lo: -1 - 2 * cfg.ledger, hi: 9 + 2 * cfg.ledger });
  const STAFF_NAMES = ['quiz', 'treble', 'bass', 'grand'];
  // Which staff a question uses: the tab's own setting, or the quiz's Staff & notes setting.
  function resolveStaff(cfg, type, rng) {
    const ov = (cfg.staffOv && cfg.staffOv[type]) || 0;
    if (ov) return STAFF_NAMES[ov];
    const opts = [];
    if (cfg.clefs & 1) opts.push('treble');
    if (cfg.clefs & 2) opts.push('bass');
    if (cfg.clefs & 4) opts.push('grand');
    return opts.length ? opts[Math.floor(rng() * opts.length)] : 'treble';
  }
  // Whether the question prints a starting or bass note.
  function helpersOn(cfg, type) {
    const ov = (cfg.helpOv && cfg.helpOv[type]) || 0;
    if (ov) return ov === 1;
    return !cfg.flags.noHelpers;
  }
  const onGrand = (p) => Object.assign({}, p, { st: dia(p) < 28 ? 1 : 0 });
  // Moves a question that was written for one clef onto the grand staff.
  function toGrand(q) {
    const out = Object.assign({}, q, { clef: 'grand', grand: true });
    out.columns = q.columns.map((c) => ({ given: c.given.map(onGrand), cap: c.cap }));
    if (Array.isArray(q.answer) && Array.isArray(q.answer[0])) out.answer = q.answer.map((col) => col.map(onGrand));
    if (q.bassPc) out.bassPc = q.bassPc;
    return out;
  }
  const ALT_SETS = [[0], [0, 1], [0, -1], [0, 1, -1]];
  // How often each spelling turns up when a note, chord root or key is chosen: plain letters half
  // the time, the four everyday flats most of the rest, and the remote spellings rarely.
  const PC_TIERS = [
    { weight: 50, names: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
    { weight: 40, names: ['B♭', 'E♭', 'A♭', 'D♭'] },
    { weight: 10, names: ['C♯', 'F♯', 'G♭', 'C♭'] },
  ];
  // Anything not listed (G♯, D♯, F♭ …) is as remote as the last group.
  const tierOf = (name) => {
    const i = PC_TIERS.findIndex((t) => t.names.includes(name));
    return i < 0 ? PC_TIERS.length - 1 : i;
  };
  // Pick from `items` by those weights; empty groups pass their share to the others.
  function pickSpelled(rng, items, nameOf) {
    if (!items.length) return null;
    const buckets = PC_TIERS.map(() => []);
    items.forEach((it) => buckets[tierOf(nameOf(it))].push(it));
    const total = PC_TIERS.reduce((n, t, i) => n + (buckets[i].length ? t.weight : 0), 0);
    if (!total) return items[Math.floor(rng() * items.length)];
    let r = rng() * total;
    for (let i = 0; i < buckets.length; i++) {
      if (!buckets[i].length) continue;
      r -= PC_TIERS[i].weight;
      if (r <= 0) return buckets[i][Math.floor(rng() * buckets[i].length)];
    }
    const last = buckets.filter((b) => b.length).pop();
    return last[Math.floor(rng() * last.length)];
  }
  function randAlt(rng, cfg) {
    const set = ALT_SETS[cfg.accMode] || [0];
    if (set.length === 1 || rng() < 0.5) return 0;
    return set[1 + Math.floor(rng() * (set.length - 1))];
  }
  // Quizzes made before version 7 keep their original questions (uniform note choice, older chord rules).
  const legacy = (cfg) => cfg.v != null && cfg.v < 7;
  const legacyPick = (cfg) => cfg.v != null && cfg.v < 9;
  // Quizzes from version 13 on weight how often each spelling is chosen.
  const spelledPick = (cfg) => cfg.v == null || cfg.v >= 13;
  // Positions near `center` (4 = the middle line) are much more likely than ones out on ledger lines.
  function centeredPos(rng, lo, hi, center) {
    const w = [];
    let total = 0;
    for (let p = lo; p <= hi; p++) { const x = Math.exp(-((p - center) * (p - center)) / (2 * 2.6 * 2.6)); w.push(x); total += x; }
    let r = rng() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return lo + i; }
    return hi;
  }
  function randPitch(rng, clef, cfg, lo, hi, center) {
    const bottom = CLEFS[clef].bottom;
    if (hi < lo) hi = lo;
    if (spelledPick(cfg)) {
      // Choose the note's name by how common it is, then a place on the staff for it.
      const alts = ALT_SETS[cfg.accMode] || [0];
      const names = [];
      LETTERS.forEach((l, step) => alts.forEach((alt) => {
        const p = { step, alt, oct: 4 };
        if (isCommon(p)) names.push({ step, alt, name: pcName(p) });
      }));
      for (let k = 0; k < 24; k++) {
        const want = pickSpelled(rng, names, (x) => x.name);
        const spots = [];
        for (let pos = lo; pos <= hi; pos++) if (((bottom + pos) % 7 + 7) % 7 === want.step) spots.push(pos);
        if (!spots.length) continue;
        const pos = center == null ? spots[Math.floor(rng() * spots.length)]
          : spots.reduce((best, p) => {
            // Favour the middle of the staff, as before, among the places this note can sit.
            const bias = (x) => Math.exp(-((x - center) * (x - center)) / (2 * 2.6 * 2.6));
            return bias(p) > bias(best) * (0.5 + rng()) ? p : best;
          }, spots[Math.floor(rng() * spots.length)]);
        return fromDia(bottom + pos, want.alt);
      }
    }
    for (let k = 0; k < 60; k++) {
      const pos = center == null || legacy(cfg) ? ri(rng, lo, hi) : centeredPos(rng, lo, hi, center);
      const p = fromDia(bottom + pos, randAlt(rng, cfg));
      if (isCommon(p)) return p;
    }
    return fromDia(bottom + lo, 0);
  }
  // "No sharps or flats", "1 sharp (F♯)" … for the key-signature dropdown.
  const SIG_OPTIONS = (() => {
    const names = (f) => (f > 0 ? 'F C G D A E B' : 'B E A D G C F').split(' ').slice(0, Math.abs(f)).map((l) => l + (f > 0 ? '♯' : '♭')).join(' ');
    const out = [];
    for (let f = -7; f <= 7; f++) out.push(f === 0 ? 'No sharps or flats' : `${Math.abs(f)} ${f > 0 ? 'sharp' : 'flat'}${Math.abs(f) > 1 ? 's' : ''} (${names(f)})`);
    return out;
  })();
  const scaleRoots = (cfg) => {
    const alts = ALT_SETS[cfg.accMode] || [0];
    const out = [];
    LETTERS.forEach((l, step) => alts.slice().sort((a, b) => a - b).forEach((a) => { const p = { step, alt: a, oct: 4 }; if (isCommon(p)) out.push(pcName(p)); }));
    return out.sort();
  };
  const article = (name) => ('AEF'.includes(name[0]) ? 'an' : 'a');
  const selected = (list, mask, fallback) => {
    const out = list.filter((_, i) => mask & (1 << i));
    return out.length ? out : [list.find((x) => x.id === fallback)];
  };

  // A chord in root position or an inversion, voiced in close position above its bass note.
  // The bass note is printed; students stack the rest.
  function invertedChord(rng, clef, cfg, chs, lo, hi) {
    const pairs = [];
    chs.forEach((ch) => [0, 1, 2, 3].forEach((k) => { if (cfg.inversions & (1 << k) && k <= ch.iv.length) pairs.push([ch, k]); }));
    if (!pairs.length) return null;
    const bottom = CLEFS[clef].bottom;
    const fits = (p) => okAlt(p) && dia(p) - bottom >= lo && dia(p) - bottom <= hi;
    for (let k = 0; k < 300; k++) {
      const [ch, inv] = pick(rng, pairs);
      const root = randPitch(rng, clef, cfg, lo - 7, hi);
      const members = [root].concat(ch.iv.map(([n, s]) => transpose(root, n, s, 1)));
      const voiced = members.slice(inv).concat(members.slice(0, inv).map((p) => ({ step: p.step, oct: p.oct + 1, alt: p.alt })));
      if (!voiced.every(fits)) continue;
      const [bass, ...rest] = voiced;
      return {
        type: 'chord', clef,
        text: `Complete the ${pcName(root)} ${ch.name} in ${INVERSIONS[inv].name}.`,
        hint: inv
          ? 'The bass note is printed. Stack the other chord tones above it in close position (within an octave).'
          : `The root is printed. Stack ${rest.length === 2 ? 'the 3rd and 5th' : 'the 3rd, 5th and 7th'} above it.`,
        columns: [{ given: [bass], cap: rest.length }],
        answer: [rest],
        sig: 'c' + fullName(root) + ch.id + inv,
      };
    }
    return null;
  }

  const GEN = {
    figured: (rng, clef, cfg) => MQ.figuredQuestion(rng, cfg, clef) || MQ.figuredQuestion(rng, cfg, clef),
    figprog: (rng, clef, cfg) => MQ.figProgQuestion(rng, cfg, clef) || MQ.figProgQuestion(rng, cfg, clef),
    place(rng, clef, cfg) {
      const { lo, hi } = rangeOf(cfg);
      const p = randPitch(rng, clef, cfg, lo, hi, 4);
      const strict = cfg.flags.strictOctave;
      return {
        type: 'place', clef, pcOnly: !strict,
        text: strict ? `Place ${fullName(p)} on the staff.` : `Place ${article(pcName(p))} ${pcName(p)} on the staff.`,
        hint: strict ? 'Middle C is C4.' : 'Any octave is fine.',
        columns: [{ given: [], cap: 1 }],
        answer: [[p]],
        tags: ['pc:' + pcName(p)],
        sig: 'p' + fullName(p),
      };
    },
    identify(rng, clef, cfg) {
      const { lo, hi } = rangeOf(cfg);
      const p = randPitch(rng, clef, cfg, lo, hi, 4);
      const correct = pcName(p);
      const cands = [];
      (ALT_SETS[cfg.accMode] || [0]).forEach((a) => cands.push({ step: p.step, alt: a, oct: 4 }));
      [-2, -1, 1, 2].forEach((d) => {
        cands.push({ step: (p.step + d + 7) % 7, alt: p.alt, oct: 4 });
        cands.push({ step: (p.step + d + 7) % 7, alt: 0, oct: 4 });
      });
      shuffle(cands, rng);
      const opts = [correct];
      for (const c of cands) {
        const n = pcName(c);
        if (opts.length < 4 && isCommon(c) && !opts.includes(n)) opts.push(n);
      }
      shuffle(opts, rng);
      return {
        type: 'identify', clef,
        text: 'Name the note shown on the staff.',
        hint: 'Choose one answer.',
        columns: [{ given: [p], cap: 0 }],
        choices: opts,
        answer: opts.indexOf(correct),
        tags: ['pc:' + pcName(p)],
        sig: 'i' + fullName(p),
      };
    },
    interval(rng, clef, cfg) {
      const { lo, hi } = rangeOf(cfg);
      const ivs = selected(INTERVALS, cfg.intervals, 'P5');
      const bare = !helpersOn(cfg, 'interval');
      let best = null;
      for (let k = 0; k < 200 && !best; k++) {
        const ivl = pick(rng, ivs);
        const dir = cfg.intervalDir === 2 ? -1 : cfg.intervalDir === 3 ? (rng() < 0.5 ? 1 : -1) : 1;
        const span = ivl.n - 1;
        // Centre the pair of notes on the staff.
        const start = randPitch(rng, clef, cfg, dir > 0 ? lo : lo + span, dir > 0 ? hi - span : hi, 4 - (dir * span) / 2);
        const tgt = transpose(start, ivl.n, ivl.s, dir);
        if (okAlt(tgt)) best = { ivl, dir, start, tgt };
      }
      const { ivl, dir, start, tgt } = best;
      if (bare) {
        // No printed note: the student writes both notes, in any octave.
        return {
          type: 'interval', clef, pcOnly: true,
          text: `Write a ${ivl.name} ${dir > 0 ? 'above' : 'below'} ${pcName(start)} — write both notes, ${pcName(start)} first.`,
          hint: 'Any octave is fine.',
          columns: [{ given: [], cap: 1 }, { given: [], cap: 1 }],
          answer: [[start], [tgt]],
          tags: ['iv:' + ivl.id, 'pc:' + pcName(start)],
          sig: 'v' + fullName(start) + ivl.id + dir,
        };
      }
      return {
        type: 'interval', clef,
        text: `Write a ${ivl.name} ${dir > 0 ? 'above' : 'below'} the given note.`,
        hint: 'Place your note in the empty space to the right.',
        columns: [{ given: [start], cap: 0 }, { given: [], cap: 1 }],
        answer: [[], [tgt]],
        tags: ['iv:' + ivl.id, 'pc:' + pcName(start)],
        sig: 'v' + fullName(start) + ivl.id + dir,
      };
    },
    chord(rng, clef, cfg) {
      const { lo, hi } = rangeOf(cfg);
      if (!legacy(cfg) && MQ.generatedChord) {
        const q = MQ.generatedChord(rng, cfg, clef, lo, hi);
        if (q) return q;
      }
      const chs = selected(CHORDS, cfg.chords, 'maj');
      const inv = (cfg.inversions || 1) === 1 ? null : invertedChord(rng, clef, cfg, chs, lo, hi);
      if (inv) return inv;
      let best = null;
      for (let k = 0; k < 200 && !best; k++) {
        const ch = pick(rng, chs);
        const span = Math.max(...ch.iv.map((x) => x[0])) - 1;
        const root = randPitch(rng, clef, cfg, lo, hi - span);
        const tones = ch.iv.map(([n, s]) => transpose(root, n, s, 1));
        if (tones.every(okAlt)) best = { ch, root, tones };
      }
      const { ch, root, tones } = best;
      return {
        type: 'chord', clef,
        text: `Complete the ${pcName(root)} ${ch.name} in root position.`,
        hint: `The root is printed. Stack ${tones.length === 2 ? 'the 3rd and 5th' : 'the 3rd, 5th and 7th'} above it.`,
        columns: [{ given: [root], cap: tones.length }],
        answer: [tones],
        sig: 'c' + fullName(root) + ch.id,
      };
    },
    scale(rng, clef, cfg) {
      const { lo, hi } = rangeOf(cfg);
      // Modes are only used when the teacher allows them.
      const scs = selected(SCALES, cfg.scales, 'major').filter((x) => cfg.scaleModes || !x.mode);
      if (!scs.length) scs.push(SCALES[0]);
      const len = cfg.scaleLen ? 5 : 8;
      let best = null;
      for (let k = 0; k < 200 && !best; k++) {
        const sc = pick(rng, scs);
        const len2 = sc.pent ? 6 : len;
        const tonic = randPitch(rng, clef, cfg, lo, hi - (len2 - 1), 4 - (len2 - 1) / 2);
        const tones = sc.iv.slice(0, len2 - 1).map(([n, s]) => transpose(tonic, n, s, 1));
        if (tones.every(okAlt)) best = { sc, tonic, tones };
      }
      const { sc, tonic, tones } = best;
      const tags = ['sc:' + sc.id, 'pc:' + pcName(tonic)];
      const ask = cfg.scaleAsk === 2 ? 'name' : cfg.scaleAsk === 3 ? (rng() < 0.5 ? 'write' : 'name') : 'write';
      if (ask === 'name') {
        // The scale is printed; the student picks its root and its type.
        const roots = scaleRoots(cfg);
        const kinds = selected(SCALES, cfg.scales, 'major').filter((x) => cfg.scaleModes || !x.mode);
        const list = kinds.length ? kinds : [SCALES[0]];
        return {
          type: 'scale', clef, scaleName: true,
          text: 'Name the scale shown on the staff.',
          hint: 'Choose its first note, then which scale it is.',
          columns: [{ given: [tonic], cap: 0 }].concat(tones.map((t) => ({ given: [t], cap: 0 }))),
          dropdowns: [
            { label: 'Starting note', options: roots, answer: roots.indexOf(pcName(tonic)) },
            { label: 'Scale', options: list.map((x) => x.label), answer: list.findIndex((x) => x.id === sc.id) },
          ],
          answer: [[tonic]].concat(tones.map((t) => [t])),
          tags, sig: 'sn' + fullName(tonic) + sc.id,
        };
      }
      if (!helpersOn(cfg, 'scale')) {
        return {
          type: 'scale', clef, pcOnly: true,
          text: `Write the ${pcName(tonic)} ${sc.name} ascending${len === 5 ? ' (first five notes)' : ''}, starting on ${pcName(tonic)}.`,
          hint: 'Write every note, in any octave. Use sharps and flats, not a key signature.',
          columns: [{ given: [], cap: 1 }].concat(tones.map(() => ({ given: [], cap: 1 }))),
          answer: [[tonic]].concat(tones.map((t) => [t])),
          tags, sig: 's' + fullName(tonic) + sc.id,
        };
      }
      return {
        type: 'scale', clef,
        text: `Write the ${pcName(tonic)} ${sc.name} ascending${len === 5 ? ' (first five notes)' : ''}.`,
        hint: 'The first note is printed. Use sharps and flats, not a key signature.',
        columns: [{ given: [tonic], cap: 0 }].concat(tones.map(() => ({ given: [], cap: 1 }))),
        answer: [[]].concat(tones.map((t) => [t])),
        tags, sig: 's' + fullName(tonic) + sc.id,
      };
    },
    keysig(rng, clef, cfg) {
      const max = Math.max(1, cfg.keyMax);
      const mode = cfg.keyMode === 2 ? 'minor' : cfg.keyMode === 3 ? (rng() < 0.5 ? 'major' : 'minor') : 'major';
      const all = [];
      for (let f = -max; f <= max; f++) all.push(f);
      const fifths = spelledPick(cfg) ? pickSpelled(rng, all, (f) => keyName(f, mode).split(' ')[0]) : ri(rng, -max, max);
      const correct = keyName(fifths, mode);
      const ask = cfg.keyAsk === 2 ? 'count' : cfg.keyAsk === 3 ? (rng() < 0.5 ? 'name' : 'count') : 'name';
      if (ask === 'count') {
        // The key is named; the student picks its key signature from one list.
        const opts = SIG_OPTIONS.slice(7 - max, 8 + max);
        return {
          type: 'keysig', clef, noStaff: true,
          text: `How many sharps or flats are in ${correct}?`,
          hint: 'Choose the key signature.',
          dropdowns: [{ label: 'Key signature', options: opts, answer: opts.indexOf(SIG_OPTIONS[fifths + 7]) }],
          tags: ['key:' + fifths + mode],
          sig: 'kc' + fifths + mode,
        };
      }
      const pool = [];
      [-2, -1, 1, 2, 3, -3].forEach((d) => { if (Math.abs(fifths + d) <= 7) pool.push(keyName(fifths + d, mode)); });
      // Common mix-up: naming the relative key with the wrong mode word.
      const other = mode === 'major' ? MINOR_KEYS : MAJOR_KEYS;
      pool.push(other[fifths + 7] + ' ' + mode);
      shuffle(pool, rng);
      const opts = [correct];
      for (const n of pool) if (opts.length < 4 && !opts.includes(n)) opts.push(n);
      shuffle(opts, rng);
      return {
        type: 'keysig', clef,
        text: `Name the ${mode} key with this key signature.`,
        hint: 'Choose one answer.',
        keySig: fifths,
        columns: [],
        choices: opts,
        answer: opts.indexOf(correct),
        tags: ['key:' + fifths + mode],
        sig: 'k' + fifths + mode,
      };
    },
  };

  // A teacher-defined chord: {symbol, clef, notes:[pitch…]}. Current quizzes grade it by note names
  // (see chords.js); quizzes made before version 7 keep the old exact / any-octave grading.
  function customQuestion(c, cfg) {
    if (!legacy(cfg) && MQ.customQuestionByNames) return MQ.customQuestionByNames(c, cfg);
    const notes = c.notes.slice().sort((a, b) => dia(a) - dia(b));
    const anyOctave = cfg.customGrade === 1;
    return {
      type: 'custom', clef: c.clef, pcOnly: anyOctave, symbol: c.symbol,
      text: `Build ${prettySymbol(c.symbol)} on the staff.`,
      hint: `Place ${notes.length} notes in one stack. ${anyOctave ? 'Any octave is fine — the note names count.' : 'Spelling and octave count.'}`,
      columns: [{ given: [], cap: notes.length }],
      answer: [notes],
      sig: 'x' + c.symbol,
    };
  }

  // A teacher-defined voicing: {symbol, staff: 'grand' | 'treble' | 'bass', notes:[pitch]}. On the
  // grand staff each note carries st (0 treble / 1 bass). Graded on exact pitches.
  function voicingQuestion(v, cfg) {
    const helper = cfg && MQ.helpersOn(cfg, 'voicing');
    const notes = v.notes.slice().sort((a, b) => dia(a) - dia(b));
    const staff = v.staff || 'grand';
    const info = MQ.analyzeSymbol ? MQ.analyzeSymbol(v.symbol) : null;
    const low = notes[0];
    const inverted = info && (low.step !== info.root.step || low.alt !== info.root.alt);
    const shown = prettySymbol(v.symbol) + (inverted ? '/' + pcName(low) : '');
    if (staff !== 'grand') {
      const plain = notes.map(({ st, ...p }) => p);
      return {
        type: 'voicing', clef: staff, symbol: v.symbol,
        text: `Voice ${shown} in the ${staff} clef.`,
        hint: helper ? `The lowest note is printed. Add the other ${plain.length - 1}. Exact pitches count.` : `Place ${plain.length} notes in one stack. Exact pitches count.`,
        columns: [{ given: helper ? [plain[0]] : [], cap: helper ? plain.length - 1 : plain.length }],
        answer: [helper ? plain.slice(1) : plain],
        sig: 'w' + v.symbol + staff,
      };
    }
    const nb = notes.filter((p) => p.st === 1).length, nt = notes.length - nb;
    const plural = (n) => `${n} note${n === 1 ? '' : 's'}`;
    return {
      type: 'voicing', clef: 'grand', grand: true, symbol: v.symbol,
      text: `Voice ${shown} on the grand staff.`,
      hint: `Place ${plural(nb)} in the bass clef and ${plural(nt)} in the treble clef. Exact pitches count.`,
      columns: [{ given: helper ? [notes[0]] : [], cap: helper ? notes.length - 1 : notes.length }],
      answer: [helper ? notes.slice(1) : notes],
      sig: 'w' + v.symbol,
    };
  }

  function generateQuiz(cfg) {
    const rng = mulberry32((Math.imul(cfg.seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0);
    const clefs = [];
    if (cfg.clefs & 1) clefs.push('treble');
    if (cfg.clefs & 2) clefs.push('bass');
    if (!clefs.length) clefs.push('treble');
    const qs = [];
    const seen = new Set();
    // Variety: no interval, chord type, root, key or scale more than twice in a short quiz
    // (three times past 20 questions). When the settings are narrow, the roots vary the most.
    const total = BUILT_IN.reduce((n, t) => n + (cfg.counts[t.id] || 0), 0)
      + ['custom', 'voicing', 'vprog', 'progression', 'keys', 'analysis', 'rhythm', 'melody'].reduce((n, k) => n + (cfg.counts[k] || 0), 0);
    const cap = total > 20 ? 3 : 2;
    const used = {};
    function pickVaried(make) {
      // Quizzes made before version 9 keep the questions they already had.
      if (legacyPick(cfg)) {
        let q = null;
        for (let k = 0; k < 25; k++) { q = make(); if (!seen.has(q.clef + q.sig)) break; }
        seen.add(q.clef + q.sig);
        return q;
      }
      let best = null;
      for (let k = 0; k < 14; k++) {
        const q = make();
        if (!q) continue;
        const tags = q.tags || [];
        let over = tags.reduce((n, t) => n + Math.max(0, (used[t] || 0) + 1 - cap), 0);
        if (seen.has(q.clef + q.sig)) over += 5; // never repeat the same question outright
        const rootLoad = tags.filter((t) => t.startsWith('pc:')).reduce((n, t) => n + (used[t] || 0), 0);
        if (!best || over < best.over || (over === best.over && rootLoad < best.rootLoad)) best = { q, over, rootLoad };
        if (over === 0 && rootLoad === 0) break;
      }
      const q = best.q;
      (q.tags || []).forEach((t) => (used[t] = (used[t] || 0) + 1));
      seen.add(q.clef + q.sig);
      return q;
    }
    let turn = rng() < 0.5 ? 0 : 1;
    BUILT_IN.forEach((t) => {
      for (let i = 0; i < (cfg.counts[t.id] || 0); i++) {
        qs.push(pickVaried(() => {
          if (legacyPick(cfg)) return GEN[t.id](rng, clefs[turn++ % clefs.length], cfg);
          const staff = resolveStaff(cfg, t.id, rng);
          const base = staff === 'grand' ? (rng() < 0.5 ? 'treble' : 'bass') : staff;
          const q = GEN[t.id](rng, base, cfg);
          // Chord and figured-bass questions choose their own staff inside their generator.
          return staff === 'grand' && !q.grand && q.clef !== 'grand' && !['chord', 'figured', 'figprog'].includes(t.id) ? toGrand(q) : q;
        }));
      }
    });
    // Teacher lists: ask `count` of them, picked at random from the list (everyone gets the same ones).
    const draw = (list, n) => {
      if (!list || !list.length || n <= 0) return [];
      if (n >= list.length) return list.slice();
      const idx = shuffle(list.map((_, i) => i), rng).slice(0, n).sort((a, b) => a - b);
      return idx.map((i) => list[i]);
    };
    draw(cfg.custom, cfg.counts.custom == null ? (cfg.custom || []).length : cfg.counts.custom).forEach((c) => qs.push(customQuestion(c, cfg)));
    // Quizzes made before version 12 keep the old teacher-written voicings; newer ones use the
    // voicing techniques.
    if (cfg.v != null && cfg.v < 12) draw(cfg.voicings, cfg.counts.voicing || 0).forEach((v) => qs.push(voicingQuestion(v, cfg)));
    else if (MQ.voicingQuestions) MQ.voicingQuestions(cfg, rng, draw, pickVaried).forEach((q) => qs.push(q));
    if (MQ.progressionQuestions) MQ.progressionQuestions(cfg, rng, draw).forEach((q) => qs.push(q));
    if (MQ.keysQuestions && cfg.counts.keys) MQ.keysQuestions(cfg, rng, pickVaried).forEach((q) => qs.push(q));
    if (MQ.analysisQuestions && cfg.counts.analysis) MQ.analysisQuestions(cfg).forEach((q) => qs.push(q));
    if (MQ.rhythmQuestions && cfg.counts.rhythm) MQ.rhythmQuestions(cfg).forEach((q) => qs.push(q));
    if (MQ.melodyQuestions && cfg.counts.melody) MQ.melodyQuestions(cfg).forEach((q) => qs.push(q));
    if (cfg.flags.shuffle) shuffle(qs, rng);
    return qs;
  }

  // ---------- grading ----------
  const pcMatch = (a, b, enh) => (enh ? (((midi(a) - midi(b)) % 12) + 12) % 12 === 0 : a.step === b.step && a.alt === b.alt);

  // Returns, for each column, a boolean per placed note (true = that note is right).
  function markResponse(q, placed, cfg) {
    if (q.colSpecs) return MQ.markProgSpell(q, placed, cfg);
    if (q.nameSpec) return q.bassPc ? MQ.markSpelled(q, placed, cfg) : MQ.markNames(q, placed, cfg);
    const enh = cfg.flags.enharmonic;
    const eq = (a, b) => (enh ? midi(a) === midi(b) : samePitch(a, b));
    return q.columns.map((col, i) => {
      const exp = q.answer[i] || [];
      const res = (placed && placed[i]) || [];
      const used = new Set();
      return res.map((r) => {
        if (!r) return false;
        const j = exp.findIndex((e, k) => !used.has(k) && (q.pcOnly ? pcMatch(r, e, enh) : eq(r, e)));
        if (j < 0) return false;
        used.add(j);
        return true;
      });
    });
  }

  // Fraction of the question answered correctly, 0..1.
  function gradeQuestion(q, response, cfg) {
    if (q.type === 'keys') return MQ.gradeKeys(q, response, cfg);
    if (q.type === 'analysis') return MQ.gradeAnalysis(q, response, cfg);
    if (q.type === 'rhythm') return MQ.gradeRhythm(q, response);
    if (q.type === 'melody') return MQ.gradeMelody(q, response);
    if (q.type === 'figured' || q.type === 'figprog') return MQ.gradeFigured(q, response, cfg);
    if (q.type === 'progression') return MQ.gradeProgression(q, response, cfg);
    if (q.symbolAnswers) {
      const got = q.symbolAnswers.filter((a, i) => MQ.gradeVoiceSymbol(a.q, (response || [])[i], cfg)).length;
      return got / q.symbolAnswers.length;
    }
    if (q.symbolAnswer) return MQ.gradeChordSymbol(q, response, cfg);
    if (q.choices) return response === q.answer ? 1 : 0;
    if (q.dropdowns) {
      const got = q.dropdowns.filter((d, i) => response && response[i] === d.answer).length;
      return got / q.dropdowns.length;
    }
    if (q.nameSpec) return MQ.gradeSpelled(q, response, cfg);
    const marks = markResponse(q, response, cfg);
    let need = 0, got = 0;
    q.columns.forEach((_, i) => {
      need += (q.answer[i] || []).length;
      got += marks[i].filter(Boolean).length;
    });
    return need ? got / need : 0;
  }

  const hasAnswer = (q, response) =>
    q.type === 'keys' ? MQ.hasKeysAnswer(q, response)
      : q.type === 'analysis' ? MQ.hasAnalysisAnswer(q, response)
      : q.type === 'rhythm' ? MQ.hasRhythmAnswer(q, response)
      : q.type === 'melody' ? MQ.hasMelodyAnswer(q, response)
      : q.type === 'figured' || q.type === 'figprog' ? MQ.hasFiguredAnswer(q, response)
      : q.colSpecs ? !!response && response.some((col) => col && col.some(Boolean))
        : q.type === 'progression' ? !!response && ['r', 's'].some((k) => (response[k] || []).some((x) => x && x.trim()))
      : q.symbolAnswers ? !!response && response.some((v) => String(v || '').trim())
        : q.symbolAnswer ? !!String(response || '').trim()
        : q.dropdowns ? !!response && response.some((v) => v != null)
        : q.choices ? response != null : !!response && response.some((col) => col && col.some(Boolean));

  function describeAnswer(q, cfg) {
    if (q.type === 'keys') return MQ.describeKeys(q);
    if (q.type === 'analysis') return MQ.describeAnalysis(q);
    if (q.type === 'rhythm') return MQ.describeRhythm(q);
    if (q.type === 'melody') return MQ.describeMelody(q);
    if (q.symbolAnswers) return q.symbolAnswers.map((a) => a.shown).join('  ');
    if (q.symbolAnswer) return q.symbolAnswer.shown;
    if (q.dropdowns) return q.dropdowns.map((d) => d.options[d.answer]).join(' · ');
    if (q.choices) return q.choices[q.answer];
    if (q.type === 'figured' || q.type === 'figprog') return MQ.describeFigured(q);
    if (q.type === 'progression') {
      const P = q.prog;
      if (P.answer === 'spell') return P.chords.map((_, i) => `${P.symbols[i]}: ${q.answer[i].map(fullName).join(' ')}`).join(' · ');
      if (P.answer === 'roman') return P.romans.join('  ');
      if (P.answer === 'symbol') return P.symbols.join('  ');
      return P.chords.map((_, i) => `${P.romans[i]} (${P.symbols[i]})`).join('  ');
    }
    if (q.nameSpec) return MQ.describeNames(q);
    const notes = [].concat(...q.answer);
    if (q.pcOnly) return notes.map(pcName).join('  ') + ' (any octave)';
    if (q.grand) {
      const part = (st) => notes.filter((p) => (p.st || 0) === st).map(fullName).join(' ');
      return `Bass: ${part(1)} · Treble: ${part(0)}`;
    }
    return notes.map(fullName).join('  ');
  }

  Object.assign(MQ, {
    LETTERS, CLEFS, clefLabel, INTERVALS, SIMPLE_INTERVALS, CHORDS, INVERSIONS, SCALES, SIMPLE_SCALES, SIG_OPTIONS, FLAG_KEYS_V1, TYPES, BUILT_IN, MAX_CUSTOM, MAX_CUSTOM_NOTES, MAX_VOICING_NOTES, prettySymbol, PRESETS, FLAG_KEYS, MAJOR_KEYS, MINOR_KEYS,
    normalizeSuffix, dia, midi, fromDia, transpose, pcName, fullName, samePitch, posOf, keyName, typeIndex,
    defaultConfig, randomSeed, maskOf, generateQuiz, resolveStaff, helpersOn, toGrand, STAFF_NAMES, gradeQuestion, markResponse, hasAnswer, describeAnswer,
    mulberry32, randPitchFor: randPitch, pickSpelled, spelledPick,
  });
})(typeof window !== 'undefined' ? window : globalThis);
