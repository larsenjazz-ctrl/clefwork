/* Clefwork — chord progressions: keys, chord qualities, Roman numeral and chord-symbol
   parsing, block-chord voicings, and the automatic progression rules.
   A chord is {root: {step, alt}, q: quality id}. A key is
   {mode: 'major' | 'minor' | 'custom', tonic: {step, alt}, fifths: -7..7, minorType: 'harmonic' | 'melodic'}. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const { dia, midi, pcName } = MQ;
  const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const SHARP_STEPS = [3, 0, 4, 1, 5, 2, 6];
  const FLAT_STEPS = [6, 2, 5, 1, 4, 0, 3];

  // ---------- keys ----------
  function keyAlts(fifths) {
    const a = [0, 0, 0, 0, 0, 0, 0];
    if (fifths > 0) SHARP_STEPS.slice(0, fifths).forEach((s) => (a[s] = 1));
    else FLAT_STEPS.slice(0, -fifths).forEach((s) => (a[s] = -1));
    return a;
  }
  const sigText = (f) => (f === 0 ? 'no sharps or flats' : `${Math.abs(f)} ${f > 0 ? 'sharp' : 'flat'}${Math.abs(f) > 1 ? 's' : ''}`);
  const parsePc = (name) => ({ step: 'CDEFGAB'.indexOf(name[0]), alt: /[♯#]/.test(name) ? 1 : /[♭b]/.test(name.slice(1)) ? -1 : 0 });
  const pcStr = (pc) => pcName({ step: pc.step, oct: 4, alt: pc.alt });
  // Major and minor keys are named by their tonic; custom keys pick tonic and signature separately.
  function makeKey(mode, fifths, tonic, minorType) {
    if (mode === 'major') return { mode, fifths, tonic: parsePc(MQ.MAJOR_KEYS[fifths + 7]), minorType: 'harmonic' };
    if (mode === 'minor') return { mode, fifths, tonic: parsePc(MQ.MINOR_KEYS[fifths + 7]), minorType: minorType === 'melodic' ? 'melodic' : 'harmonic' };
    return { mode: 'custom', fifths, tonic: { step: tonic.step, alt: tonic.alt }, minorType: 'harmonic' };
  }
  const keyPitch = (kd, deg) => {
    const step = (kd.tonic.step + deg) % 7;
    return { step, alt: deg === 0 ? kd.tonic.alt : keyAlts(kd.fifths)[step] };
  };
  const keyLabel = (kd) => (kd.mode === 'custom'
    ? `${pcStr(kd.tonic)} tonic, ${sigText(kd.fifths)}`
    : `${pcStr(kd.tonic)} ${kd.mode}${kd.mode === 'minor' ? ` (${kd.minorType})` : ''}`);

  // ---------- chord qualities ----------
  const T = (...pairs) => pairs;
  const QUALITIES = [
    { id: 'maj', tones: T([3, 4], [5, 7]), sym: '', rn: '', low: false },
    { id: 'min', tones: T([3, 3], [5, 7]), sym: 'mi', rn: '', low: true },
    { id: 'dim', tones: T([3, 3], [5, 6]), sym: '°', rn: '°', low: true },
    { id: 'aug', tones: T([3, 4], [5, 8]), sym: 'aug', rn: '+', low: false },
    { id: 'dom7', tones: T([3, 4], [5, 7], [7, 10]), sym: '7', rn: '7', low: false },
    { id: 'maj7', tones: T([3, 4], [5, 7], [7, 11]), sym: 'ma7', rn: 'ma7', low: false },
    { id: 'min7', tones: T([3, 3], [5, 7], [7, 10]), sym: 'mi7', rn: '7', low: true },
    { id: 'hdim7', tones: T([3, 3], [5, 6], [7, 10]), sym: 'mi7♭5', rn: 'ø7', low: true },
    { id: 'dim7', tones: T([3, 3], [5, 6], [7, 9]), sym: '°7', rn: '°7', low: true },
    { id: 'dom9', tones: T([3, 4], [5, 7], [7, 10], [9, 14]), sym: '9', rn: '9', low: false },
    { id: 'maj9', tones: T([3, 4], [5, 7], [7, 11], [9, 14]), sym: 'ma9', rn: 'ma9', low: false },
    { id: 'min9', tones: T([3, 3], [5, 7], [7, 10], [9, 14]), sym: 'mi9', rn: '9', low: true },
    { id: 'dom11', tones: T([3, 4], [5, 7], [7, 10], [9, 14], [11, 17]), sym: '11', rn: '11', low: false },
    { id: 'min11', tones: T([3, 3], [5, 7], [7, 10], [9, 14], [11, 17]), sym: 'mi11', rn: '11', low: true },
    { id: 'dom13', tones: T([3, 4], [5, 7], [7, 10], [9, 14], [13, 21]), sym: '13', rn: '13', low: false },
    { id: 'maj13', tones: T([3, 4], [5, 7], [7, 11], [9, 14], [13, 21]), sym: 'ma13', rn: 'ma13', low: false },
    { id: 'min13', tones: T([3, 3], [5, 7], [7, 10], [9, 14], [13, 21]), sym: 'mi13', rn: '13', low: true },
    // Added after the others so quiz codes keep their quality numbers.
    { id: 'sus4', tones: T([4, 5], [5, 7]), sym: 'sus4', rn: 'sus4', low: false },
    { id: 'dom7sus4', tones: T([4, 5], [5, 7], [7, 10]), sym: '7sus4', rn: '7sus4', low: false },
    { id: 'maj6', tones: T([3, 4], [5, 7], [6, 9]), sym: '6', rn: '6', low: false },
    { id: 'min6', tones: T([3, 3], [5, 7], [6, 9]), sym: 'mi6', rn: '6', low: true },
  ];
  const QUALITY_IDS = QUALITIES.map((q) => q.id);
  const Q = (id) => QUALITIES.find((q) => q.id === id) || QUALITIES[0];
  const DIM_FAMILY = ['dim', 'hdim7', 'dim7'];

  function tonesOf(ch) {
    const r = { step: ch.root.step, oct: 4, alt: ch.root.alt };
    const map = { 1: ch.root };
    Q(ch.q).tones.forEach(([n, s]) => { const t = MQ.transpose(r, n, s, 1); map[n] = { step: t.step, alt: t.alt }; });
    return map;
  }

  // ---------- names ----------
  function romanOf(ch, kd) {
    const qd = Q(ch.q);
    const deg = (((ch.root.step - kd.tonic.step) % 7) + 7) % 7;
    let diff = ch.root.alt - keyPitch(kd, deg).alt;
    // In minor, the leading-tone chord (raised 7th) is written vii° with no sharp.
    if (kd.mode === 'minor' && deg === 6 && diff === 1 && DIM_FAMILY.includes(ch.q)) diff = 0;
    const pre = diff < 0 ? '♭'.repeat(-diff) : '♯'.repeat(diff);
    return pre + (qd.low ? NUMERALS[deg].toLowerCase() : NUMERALS[deg]) + qd.rn;
  }
  const symbolOf = (ch) => pcStr(ch.root) + Q(ch.q).sym + (ch.bass ? '/' + pcStr(ch.bass) : '');

  // ---------- parsing (teacher input and student answers) ----------
  const SYM = {};
  const alias = (q, list) => list.forEach((s) => (SYM[s] = q));
  alias('maj', ['', 'M', 'maj', 'Maj', 'ma', 'major']);
  alias('min', ['m', 'min', 'mi', '-', 'minor']);
  alias('dim', ['dim', '°', 'o']);
  alias('aug', ['aug', '+', '#5']);
  alias('dom7', ['7', 'dom7']);
  alias('maj7', ['maj7', 'M7', 'Maj7', 'ma7', 'j7']);
  alias('min7', ['m7', 'min7', 'mi7', '-7']);
  alias('hdim7', ['m7b5', 'min7b5', 'mi7b5', '-7b5', 'ø', 'ø7']);
  alias('dim7', ['dim7', '°7', 'o7']);
  alias('dom9', ['9']);
  alias('maj9', ['maj9', 'M9', 'Maj9', 'ma9']);
  alias('min9', ['m9', 'min9', 'mi9', '-9']);
  alias('dom11', ['11']);
  alias('min11', ['m11', 'min11', 'mi11', '-11']);
  alias('dom13', ['13']);
  alias('maj13', ['maj13', 'M13', 'Maj13', 'ma13']);
  alias('min13', ['m13', 'min13', 'mi13', '-13']);
  alias('sus4', ['sus4', 'sus']);
  alias('dom7sus4', ['7sus4', '7sus']);
  alias('maj6', ['6', 'maj6', 'M6']);
  alias('min6', ['m6', 'min6', 'mi6', '-6']);
  // Suspended chords are neither major nor minor, so either case of numeral is accepted.
  const SUS = { sus4: 'sus4', sus: 'sus4', '7sus4': 'dom7sus4', '7sus': 'dom7sus4' };
  const RN_UP = Object.assign({ '': 'maj', '+': 'aug', aug: 'aug', 6: 'maj6', 7: 'dom7', maj7: 'maj7', M7: 'maj7', Maj7: 'maj7', 9: 'dom9', maj9: 'maj9', M9: 'maj9', 11: 'dom11', 13: 'dom13', maj13: 'maj13', M13: 'maj13' }, SUS);
  const RN_LOW = Object.assign({ '': 'min', '°': 'dim', o: 'dim', dim: 'dim', 6: 'min6', 7: 'min7', ø: 'hdim7', ø7: 'hdim7', '/o7': 'hdim7', '/o': 'hdim7', m7b5: 'hdim7', '°7': 'dim7', o7: 'dim7', dim7: 'dim7', 9: 'min9', 11: 'min11', 13: 'min13' }, SUS);
  const clean = (s) => String(s || '').trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[º˚]/g, '°').replace(/Ø/g, 'ø').replace(/\s+/g, '');

  // Chord symbols and Roman numerals accept mi/ma/-/+ spellings (see normalizeSuffix in theory.js).
  function parseSymbol(str) {
    let s = clean(str);
    // A slash chord names its bass note: C/E, Bb7/D …
    let bass = null;
    const slash = s.match(/^(.*)\/([A-Ga-g])([#b]?)$/);
    if (slash) {
      bass = { step: 'CDEFGAB'.indexOf(slash[2].toUpperCase()), alt: slash[3] === '#' ? 1 : slash[3] === 'b' ? -1 : 0 };
      s = slash[1];
    }
    const m = s.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!m) return null;
    const suf = MQ.normalizeSuffix(m[3]);
    if (!(suf in SYM)) return null;
    const ch = { root: { step: 'CDEFGAB'.indexOf(m[1].toUpperCase()), alt: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 }, q: SYM[suf] };
    if (bass && (bass.step !== ch.root.step || bass.alt !== ch.root.alt)) ch.bass = bass;
    return ch;
  }
  // Which chord member the bass note is: 0 root, 1 third, 2 fifth, 3 seventh.
  function inversionOf(ch) {
    if (!ch.bass) return 0;
    const t = tonesOf(ch);
    const order = [1, 3, 5, 7, 9, 11, 13].filter((n) => t[n]);
    const i = order.findIndex((n) => t[n].step === ch.bass.step && t[n].alt === ch.bass.alt);
    return i < 0 ? 0 : i;
  }
  const INV_TEXT = ['', '(1st inversion)', '(2nd inversion)', '(3rd inversion)'];
  function parseRoman(str, kd) {
    let s = clean(str).replace(/^-(?=[IViv])/, 'b').replace(/^\+(?=[IViv])/, '#');
    // A Roman numeral can name its bass note the same way: IV/A, V7/B …
    let bass = null;
    const slash = s.match(/^(.*)\/([A-G])([#b]?)$/);
    if (slash) {
      bass = { step: 'CDEFGAB'.indexOf(slash[2]), alt: slash[3] === '#' ? 1 : slash[3] === 'b' ? -1 : 0 };
      s = slash[1];
    }
    const m = s.match(/^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
    if (!m) return null;
    const upper = m[2] === m[2].toUpperCase();
    const q = (upper ? RN_UP : RN_LOW)[MQ.normalizeSuffix(m[3]).replace(/^m(?=\d|b5)/, '')];
    if (!q) return null;
    const deg = NUMERALS.indexOf(m[2].toUpperCase());
    const base = keyPitch(kd, deg);
    let alt = base.alt + (m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0);
    if (!m[1] && kd.mode === 'minor' && deg === 6 && DIM_FAMILY.includes(q)) alt += 1;
    const ch = { root: { step: base.step, alt }, q };
    if (bass && (bass.step !== ch.root.step || bass.alt !== ch.root.alt)) ch.bass = bass;
    return ch;
  }
  // Teacher input: symbols start with a capital letter A–G; everything else is read as a Roman numeral.
  const parseChordToken = (tok, kd) => (/^[A-G]/.test(tok) ? parseSymbol(tok) : parseRoman(tok, kd));
  function parseProgressionText(text, kd) {
    const chords = [], errors = [];
    String(text || '').split(/[\s,|]+/).filter(Boolean).forEach((t) => {
      const c = parseChordToken(t, kd);
      if (c && Object.values(tonesOf(c)).every((p) => Math.abs(p.alt) <= 2)) chords.push(c); else errors.push(t);
    });
    return { chords, errors };
  }

  // ---------- voicings ----------
  // Every chord is split into five planes, and one note is taken from each:
  //   root — the root, always the lowest note
  //   3p   — major 3rd (major, augmented), minor 3rd (minor, diminished), perfect 4th (suspended)
  //   7p   — octave (triads), major 7th, dominant (minor) 7th, or major 6th (sixth chords)
  //   5p   — the 11th or 13th in those chords, ♯5 (augmented), ♭5 (diminished), otherwise the 5th
  //   9p   — the 9th in ninth chords, otherwise the octave
  // When 7p and 9p are the same note (triads), the octave is used only once.
  // On the grand staff nothing above the root is lower than G3; single staves use close stacks.
  function planes(ch) {
    const t = tonesOf(ch);
    return { r: t[1], p3: t[3] || t[4], p7: t[7] || t[6] || t[1], p5: t[11] || t[13] || t[5], p9: t[9] || t[1] };
  }
  // Grand staff only: two layouts per style; a progression alternates between them chord by chord.
  const LAYOUTS = {
    open: [['r', 'p3', 'p7', 'p9', 'p5'], ['r', 'p7', 'p3', 'p5', 'p9']],
    closed: [['r', 'p3', 'p5', 'p7', 'p9'], ['r', 'p7', 'p9', 'p3', 'p5']],
  };
  function placeAbove(pc, minDia) {
    let d = Math.floor((minDia - pc.step) / 7) * 7 + pc.step;
    if (d < minDia) d += 7;
    return { step: pc.step, oct: Math.floor(d / 7), alt: pc.alt };
  }
  // Each note goes to the nearest spot above the one before, so neighbours are an octave apart at most.
  function stackFrom(pcs, rootDia) {
    const out = [];
    let m = rootDia;
    pcs.forEach((pc) => { const p = placeAbove(pc, m); out.push(p); m = dia(p) + 1; });
    return out;
  }
  const F2 = 17;
  // Every note above the root is G3 or higher (MIDI 55). That also keeps 3p at D3 or above and
  // 7p at F3 or above. When a note is too low, everything above the root moves up an octave
  // (the gap above the bottom note may be wider than an octave; the others keep their spacing).
  const UPPER_FLOOR = 55;
  function stackWithFloors(keys, pl, rootDia) {
    let v = stackFrom(keys.map((k) => pl[k]), rootDia);
    const low = () => v.some((p, i) => i > 0 && midi(p) < UPPER_FLOOR);
    for (let n = 0; n < 4 && low(); n++) v = [v[0]].concat(v.slice(1).map((p) => ({ step: p.step, oct: p.oct + 1, alt: p.alt })));
    return v;
  }
  function voiceChord(ch, staff, style, layout) {
    if (ch.bass) return bassVoicing(ch, staff);
    if (staff !== 'grand') return closeStack(ch, staff);
    const pl = planes(ch);
    let keys = (LAYOUTS[style] || LAYOUTS.closed)[layout ? 1 : 0];
    // In triads 7p and 9p are both the octave; use it once (drop whichever comes second).
    if (pl.p7.step === pl.p9.step && pl.p7.alt === pl.p9.alt) {
      const second = keys.indexOf('p7') > keys.indexOf('p9') ? 'p7' : 'p9';
      keys = keys.filter((k) => k !== second);
    }
    // Grand staff: root in the bass clef (F2–E3); each other note sits on whichever staff it falls in.
    return stackWithFloors(keys, pl, F2).map((p) => Object.assign(p, { st: dia(p) < 28 ? 1 : 0 }));
  }

  // A slash chord: its named bass note at the bottom, the rest close above it.
  function bassVoicing(ch, staff) {
    const t = tonesOf(ch);
    const pcs = [1, 3, 5, 7, 9, 11, 13].filter((n) => t[n]).map((n) => t[n]);
    const bass = ch.bass;
    const rest = pcs.filter((p) => p.step !== bass.step || p.alt !== bass.alt);
    const order = [bass].concat(rest.sort((a, b) => ((a.step - bass.step + 7) % 7) - ((b.step - bass.step + 7) % 7)));
    const bottom = staff === 'grand' ? F2 : MQ.CLEFS[staff].bottom;
    let best = null;
    for (let base = bottom - 7; base <= bottom + 10; base++) {
      const v = stackFrom(order, base);
      if (dia(v[0]) !== base) continue;
      const lo = dia(v[0]) - bottom, hi = dia(v[v.length - 1]) - bottom;
      const score = Math.abs((lo + hi) / 2 - (staff === 'grand' ? 10 : 4));
      if (!best || score < best.score) best = { v, score };
    }
    const out = best.v;
    return staff === 'grand' ? out.map((p) => Object.assign(p, { st: dia(p) < 28 ? 1 : 0 })) : out;
  }
  // One staff (treble or bass): the chord's notes stacked in close position (within an octave), in whichever
  // inversion and octave centres the stack best on the middle line. Root position wins ties.
  function closeStack(ch, staff) {
    const t = tonesOf(ch), pl = planes(ch);
    const members = [[1, pl.r], [t[3] ? 3 : 4, pl.p3], [t[11] ? 11 : t[13] ? 13 : 5, pl.p5]];
    if (t[7] || t[6]) members.push([t[7] ? 7 : 6, pl.p7]);
    if (t[9]) members.push([9, pl.p9]);
    const pcs = members.sort((a, b) => a[0] - b[0]).map((m) => m[1]);
    const bottom = MQ.CLEFS[staff].bottom;
    let best = null;
    const semis = (a, b) => (((midi({ step: b.step, oct: 4, alt: b.alt }) - midi({ step: a.step, oct: 4, alt: a.alt })) % 12) + 12) % 12;
    pcs.forEach((bass, k) => {
      // The other notes in rising order within the octave above the bass note.
      const rotated = [bass].concat(pcs.filter((_, i) => i !== k)
        .sort((a, b) => ((a.step - bass.step + 7) % 7) - ((b.step - bass.step + 7) % 7) || semis(bass, a) - semis(bass, b)));
      for (let base = 7; base <= 42; base += 7) {
        const v = stackFrom(rotated, base);
        const lo = dia(v[0]) - bottom, hi = dia(v[v.length - 1]) - bottom;
        const score = Math.abs((lo + hi) / 2 - 4) + k * 0.01;
        if (!best || score < best.score) best = { v, score };
      }
    });
    return best.v;
  }
  // For playback of a typed answer: the root low in the bass plus a close stack around B4.
  const hearChord = (ch) => [placeAbove(ch.root, F2)].concat(closeStack(ch, 'treble'));
  // The first chord's layout comes from the progression itself (same for every student); then it alternates.
  const firstLayout = (chords) => chords.reduce((h, c) => (h * 31 + c.root.step * 3 + c.root.alt + QUALITY_IDS.indexOf(c.q)) % 997, 7) % 2;
  const voiceProgression = (chords, staff, style) => {
    const start = firstLayout(chords);
    return chords.map((c, i) => voiceChord(c, staff, style, (start + i) % 2));
  };

  // ---------- automatic progressions ----------
  const MAJOR_Q = { 1: ['maj', 'maj7'], 2: ['min', 'min7'], 3: ['min', 'min7'], 4: ['maj', 'maj7'], 5: ['maj', 'dom7'], 6: ['min', 'min7'], 7: ['dim', 'hdim7'] };
  const MINOR_Q = {
    harmonic: { 1: ['min', 'min7'], 2: ['dim', 'hdim7'], 3: ['maj', 'maj7'], 4: ['min', 'min7'], 5: ['maj', 'dom7'], 6: ['maj', 'maj7'], 7: ['maj', 'dom7'] },
    melodic: { 1: ['min', 'min7'], 2: ['min', 'min7'], 3: ['maj', 'maj7'], 4: ['maj', 'dom7'], 5: ['maj', 'dom7'], 6: ['maj', 'maj7'], 7: ['maj', 'dom7'] },
  };
  // Custom keys: stack thirds from the key signature.
  function customQualities(kd, deg) {
    const pc = (k) => keyPitch(kd, (deg - 1 + k) % 7);
    const semis = (a, b) => (((midi({ step: b.step, oct: 4, alt: b.alt }) - midi({ step: a.step, oct: 4, alt: a.alt })) % 12) + 12) % 12;
    const r = pc(0), t = semis(r, pc(2)), f = semis(r, pc(4)), s = semis(r, pc(6));
    const triad = t === 4 && f === 7 ? 'maj' : t === 3 && f === 7 ? 'min' : t === 3 && f === 6 ? 'dim' : t === 4 && f === 8 ? 'aug' : 'maj';
    const sev = ({ maj: { 11: 'maj7', 10: 'dom7' }, min: { 10: 'min7' }, dim: { 10: 'hdim7', 9: 'dim7' }, aug: {} })[triad][s] || null;
    return [triad, sev];
  }
  function diatonicChord(kd, deg, seventh) {
    const pair = kd.mode === 'major' ? MAJOR_Q[deg] : kd.mode === 'minor' ? MINOR_Q[kd.minorType][deg] : customQualities(kd, deg);
    return { root: keyPitch(kd, deg - 1), q: seventh && pair[1] ? pair[1] : pair[0] };
  }

  // Scale degrees following the teacher's rules: roots move by perfect 4th through 7-3-6-2-5-1;
  // start anywhere; after 1, jump back anywhere; IV may replace ii or V; vii may replace V;
  // V-IV-I is allowed; a deceptive cadence swaps the arriving I for vi or iii and continues from there.
  const ORDER = [7, 3, 6, 2, 5, 1];
  function autoDegrees(rng, len, deceptive) {
    const sub = (d) => {
      if (d === 2 && rng() < 0.3) return 4;
      if (d === 5) { const r = rng(); if (r < 0.2) return 4; if (r < 0.35) return 7; }
      return d;
    };
    let best = null, bestScore = -1;
    for (let attempt = 0; attempt < 400 && bestScore < 6; attempt++) {
      let idx = Math.floor(rng() * ORDER.length);
      let deg = sub(ORDER[idx]);
      const seq = [deg];
      let toTonic = false, hadDeceptive = false, ok = true;
      while (seq.length < len) {
        let nIdx, nDeg;
        if (toTonic) { nIdx = 5; nDeg = 1; toTonic = false; }
        else if (idx === 5) { nIdx = Math.floor(rng() * 5); nDeg = sub(ORDER[nIdx]); }
        else if (deg === 5 && rng() < 0.2) { nIdx = 4; nDeg = 4; toTonic = true; }
        else {
          nIdx = idx + 1;
          nDeg = sub(ORDER[nIdx]);
          if (nIdx === 5 && deceptive && deg === 5 && rng() < 0.6) {
            nDeg = rng() < 0.5 ? 6 : 3;
            nIdx = ORDER.indexOf(nDeg);
            hadDeceptive = true;
          }
        }
        if (nDeg === deg) { ok = false; break; }
        seq.push(nDeg); idx = nIdx; deg = nDeg;
      }
      if (!ok) continue;
      const score = (seq[seq.length - 1] === 1 && !toTonic ? 2 : 0) + (!deceptive || hadDeceptive ? 4 : 0);
      if (score > bestScore) { best = seq; bestScore = score; }
    }
    return best;
  }
  function autoProgression(rng, e) {
    return autoDegrees(rng, e.len, e.deceptive).map((d) => diatonicChord(e.key, d, e.sevenths === 2 || (e.sevenths === 1 && rng() < 0.5)));
  }

  // ---------- questions ----------
  const MODES = [
    { answer: 'roman', label: 'Chords only — students write Roman numerals' },
    { answer: 'symbol', label: 'Chords only — students write chord symbols' },
    { answer: 'both', label: 'Chords only — students write both' },
    { answer: 'roman', show: 'symbol', label: 'Chord symbols printed — students write Roman numerals' },
    { answer: 'symbol', show: 'roman', label: 'Roman numerals printed — students write chord symbols' },
    { answer: 'spell', show: 'symbol', label: 'Chord symbols printed — students spell the chords' },
    { answer: 'spell', show: 'roman', label: 'Roman numerals printed — students spell the chords' },
    { answer: 'spell', show: 'both', label: 'Both printed — students spell the chords' },
  ];
  const HINTS = {
    roman: 'Capitals for major, lower case for minor and diminished — for example ii7, V7, vii°. Type b for ♭, # for ♯ and o for °.',
    symbol: 'For example Dmi7, G7, Cma7, Bmi7b5. You can also type m or - for minor and b or # for ♭ and ♯.',
    both: 'Roman numerals like ii7, V7, vii°; chord symbols like Dmi7, G7, Bmi7b5. Type b for ♭, # for ♯ and o for °.',
  };
  function progressionQuestion(entry, chords, cfg) {
    const kd = entry.key, mode = MODES[cfg.progMode || 0] || MODES[0];
    const romans = chords.map((c) => romanOf(c, kd)), symbols = chords.map(symbolOf);
    const keyText = kd.mode === 'custom' ? `built on ${pcStr(kd.tonic)} with a key signature of ${sigText(kd.fifths)}` : `in ${pcStr(kd.tonic)} ${kd.mode}`;
    const what = mode.answer === 'roman' ? 'the Roman numeral' : mode.answer === 'symbol' ? 'the chord symbol' : 'the Roman numeral and the chord symbol';
    const shown = mode.show === 'symbol' ? ' The chord symbols are printed above the staff.' : mode.show === 'roman' ? ' The Roman numerals are printed below the staff.' : '';
    if (mode.answer === 'spell') {
      // The labels are printed and the students write the chords.
      const voiced = voiceProgression(chords, entry.staff, entry.voicing || 'closed');
      const colSpecs = chords.map((c, i) => {
        const info = { has9: false, has11: false, has13: false, altered: new Set() };
        const spec = MQ.nameSpec(c.root, voiced[i].map((p) => ({ step: p.step, alt: p.alt })), info, null);
        return { spec, bassPc: c.bass ? { step: c.bass.step, alt: c.bass.alt } : null };
      });
      const invText = chords.map((c) => INV_TEXT[inversionOf(c)]);
      return {
        type: 'progression', clef: entry.staff, grand: entry.staff === 'grand', keySig: kd.fifths, keyAware: true, revealPc: true,
        text: `This progression is ${keyText}.${shown} Write each chord on the staff.`,
        hint: 'Write every note of each chord. Octave and order don’t matter, but a slash chord or an inversion needs its bass note at the bottom.',
        columns: chords.map((_, i) => ({ given: [], cap: colSpecs[i].spec.required.length + 3 })),
        chordLabels: {
          top: mode.show === 'symbol' || mode.show === 'both' ? symbols : null,
          bottom: mode.show === 'roman' || mode.show === 'both' ? romans : null,
          bottom2: mode.show === 'roman' || mode.show === 'both' ? invText : null,
        },
        colSpecs,
        prog: { key: kd, chords, romans, symbols, answer: 'spell' },
        answer: voiced,
        tags: chords.map((c) => 'pc:' + pcStr(c.root)),
        sig: 'gs' + romans.join(' ') + keyLabel(kd),
      };
    }
    return {
      type: 'progression', clef: entry.staff, grand: entry.staff === 'grand', keySig: kd.fifths, keyAware: true,
      text: `This progression is ${keyText}.${shown} Write ${what} for each chord.`,
      hint: HINTS[mode.answer],
      columns: voiceProgression(chords, entry.staff, entry.voicing || 'closed').map((notes) => ({ given: notes, cap: 0 })),
      chordLabels: { top: mode.show === 'symbol' ? symbols : null, bottom: mode.show === 'roman' ? romans : null },
      prog: { key: kd, chords, romans, symbols, answer: mode.answer },
      answer: { r: romans, s: symbols },
      sig: 'g' + romans.join(' ') + keyLabel(kd),
    };
  }
  const progPool = (cfg) => {
    const pool = [];
    (cfg.progs || []).forEach((e) => { const n = e.kind === 'auto' ? e.qcount || 1 : 1; for (let k = 0; k < n; k++) pool.push(e); });
    return pool;
  };
  function progressionQuestions(cfg, rng, draw) {
    const seen = new Set();
    return draw(progPool(cfg), Math.min(cfg.counts.progression || 0, 30)).map((e) => {
      let chords = e.chords;
      if (e.kind === 'auto') {
        for (let k = 0; k < 12; k++) {
          chords = autoProgression(rng, e);
          const sig = chords.map((c) => romanOf(c, e.key)).join(' ');
          if (!seen.has(sig)) { seen.add(sig); break; }
        }
      }
      return progressionQuestion(e, chords, cfg);
    });
  }

  // ---------- grading ----------
  function sameChord(a, b, enh) {
    if (!a || !b || a.q !== b.q) return false;
    if (!enh) return a.root.step === b.root.step && a.root.alt === b.root.alt;
    const m = (r) => midi({ step: r.step, oct: 4, alt: r.alt });
    return (((m(a.root) - m(b.root)) % 12) + 12) % 12 === 0;
  }
  // Per chord: {r, s} — true / false for each answer asked for, null when not asked.
  function markProgression(q, resp, cfg) {
    const P = q.prog, enh = cfg.flags.enharmonic;
    const get = (k, i) => (resp && resp[k] && resp[k][i]) || '';
    return P.chords.map((ch, i) => ({
      r: P.answer !== 'symbol' ? sameChord(parseRoman(get('r', i), P.key), ch, enh) : null,
      s: P.answer !== 'roman' ? sameChord(parseSymbol(get('s', i)), ch, enh) : null,
    }));
  }
  // Spelling mode: each chord is graded like any other spelled chord.
  const subFor = (q, i) => ({ nameSpec: q.colSpecs[i].spec, bassPc: q.colSpecs[i].bassPc, columns: [q.columns[i]] });
  function gradeProgSpell(q, placed, cfg) {
    const n = q.colSpecs.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += MQ.gradeSpelled(subFor(q, i), [(placed && placed[i]) || []], cfg);
    return n ? sum / n : 0;
  }
  const markProgSpell = (q, placed, cfg) => q.colSpecs.map((_, i) => MQ.markSpelled(subFor(q, i), [(placed && placed[i]) || []], cfg)[0]);
  function gradeProgression(q, resp, cfg) {
    if (q.colSpecs) return gradeProgSpell(q, resp, cfg);
    let need = 0, got = 0;
    markProgression(q, resp, cfg).forEach((m) => ['r', 's'].forEach((k) => { if (m[k] !== null) { need++; if (m[k]) got++; } }));
    return need ? got / need : 0;
  }
  const progAnswerCount = (q) => q.prog.chords.length * (q.prog.answer === 'both' ? 2 : 1);

  Object.assign(MQ, {
    keyAlts, sigText, makeKey, keyLabel, keyPitch, QUALITIES, QUALITY_IDS, romanOf, symbolOf, parseSymbol, parseRoman,
    parseProgressionText, planes, voiceChord, closeStack, hearChord, voiceProgression, autoDegrees, autoProgression, diatonicChord, PROG_MODES: MODES,
    progressionQuestion, progressionQuestions, progPool, markProgression, gradeProgression, progAnswerCount,
    gradeProgSpell, markProgSpell, inversionOf, INV_TEXT,
  });
})(typeof window !== 'undefined' ? window : globalThis);
