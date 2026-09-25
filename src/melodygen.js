/* Clefwork Melody — melodies made automatically, the way simple tonal melodies are usually shaped.
   The numbers come from studies of folk-song collections and dictation curricula: Huron's melodic
   arch (1996) and its 2023 replication (phrases: arch ~30–40%, descending ~27%, ascending ~22%,
   U-shaped ~22%); Vos & Troost (1989: small intervals mostly fall, large ones rise); von Hippel &
   Huron (2000: after a leap the melody heads back toward its middle); Krumhansl & Kessler's key
   profiles; Temperley and Janssen et al. on openings, endings, beats and repetition; Karpinski,
   Ottman/Rogers, Kodály and the AP curriculum on the order leaps and chromatic notes are learned.
   - Phrases: a melody of five to eight measures is two phrases, often a parallel period — the same
     rhythm again with a new ending, the first phrase stopping on the dominant (a half cadence), the
     second on the tonic, with a breath (a rest) between them when the rhythm allows.
   - Rhythm: from Clefwork Rhythm's generator at the same level, with fewer rests inside phrases and
     a long note at each phrase end.
   - Pitch: mostly steps and repeated notes; leaps land on chord tones (only the tonic chord at the
     easiest levels) and are followed by a step back the other way; big leaps tend to go up and steps
     down; phrases rise and fall in an arch, or descend, to a cadence reached by step; strong beats
     and long notes take the chord's tones; the leading tone rises to the tonic, fa falls to mi.
   - Minor keys use the raised seventh as a leading tone, and the raised sixth on the way up to it.
   - Chromatic notes (when allowed) are approach tones and neighbours a half step from the note they
     lead to, on weak beats — more of them at the higher levels.
   The quiz's seed picks everything, and the generator is versioned like Clefwork Rhythm's. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const GEN = 1;
  const tone = (d) => ((d % 7) + 7) % 7;
  function pickWeighted(rng, items, weightOf) {
    const total = items.reduce((t, x) => t + weightOf(x), 0);
    if (!(total > 0)) return items[Math.floor(rng() * items.length)];
    let r = rng() * total;
    for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
    return items[items.length - 1];
  }

  // ---------- levels ----------
  // range and leap in scale steps (a fifth 4, sixth 5, octave 7, ninth 8, tenth 9, eleventh 10,
  // twelfth 11). leaps: which notes a leap may join — 'tonic' (do mi sol), 'chord' (the chord of the
  // moment), 'any'. steps: the share of steps and repeated notes aimed for. chroma: notes out of the
  // key per note, when chromatic notes are allowed.
  // tonic: leaps only within do-mi-sol; chord: within the chord of the moment (sol-ti-re, fa-la-do);
  // any: to any note, chord tones preferred. chromatic: which chromatic notes the level uses when
  // they're allowed — lower neighbours first, then half-step approaches (♯4→5, ♯1→2 …), then all.
  const LEVELS = [
    { name: 'Very easy', blurb: 'Do to sol: steps and repeated notes, with the odd skip within do-mi-sol. Rhythms of Rhythm level 1 — 4/4, quarter notes and longer.', rhythm: 1, range: 4, leap: 2, leaps: 'tonic', steps: 0.94, chroma: 0.03, chromatic: 'neighbour' },
    { name: 'Easy', blurb: 'Within a sixth: steps, and skips within the tonic chord (do-mi-sol). Rhythms of level 2 — 2/4 to 4/4, eighth notes and longer.', rhythm: 2, range: 5, leap: 4, leaps: 'tonic', steps: 0.85, chroma: 0.04, chromatic: 'neighbour' },
    { name: 'Medium easy', blurb: 'Within an octave: leaps in the tonic and dominant chords (sol-ti-re), and phrases that end on the dominant, then the tonic. Rhythms of level 3.', rhythm: 3, range: 7, leap: 4, leaps: 'chord', steps: 0.78, chroma: 0.06, chromatic: 'approach' },
    { name: 'Medium', blurb: 'Within a ninth: 4ths, 5ths and the odd 6th between chord tones, IV and V7 as well, and a sequence now and then. Rhythms of level 4, in simple and compound meters.', rhythm: 4, range: 8, leap: 5, leaps: 'chord', steps: 0.73, chroma: 0.08, chromatic: 'approach' },
    { name: 'Advanced', blurb: 'Up to a tenth: leaps up to a 6th, and octaves upward. Rhythms of level 5 — any meter, sixteenth notes.', rhythm: 5, range: 9, leap: 7, leaps: 'any', steps: 0.68, chroma: 0.07, chromatic: 'all' },
    { name: 'Very hard', blurb: 'Up to an eleventh: any leap up to an octave, 7ths in the dominant seventh. Rhythms of level 6 — any meter and rhythm, triplets included.', rhythm: 6, range: 10, leap: 7, leaps: 'any', steps: 0.62, chroma: 0.1, chromatic: 'all' },
  ];
  const RANGES = [4, 5, 7, 9, 11], LEAPS = [2, 3, 4, 5, 7];
  // Krumhansl & Kessler's key profiles for the scale degrees (minor: natural minor), as a gentle
  // preference for the notes that belong most.
  const PROFILE = { major: [6.35, 3.48, 4.38, 4.09, 5.19, 3.66, 2.88], minor: [6.33, 3.52, 5.38, 3.53, 4.75, 3.98, 3.34] };
  function levelOf(a) {
    const L = a.level <= 6 ? Object.assign({ level: a.level }, LEVELS[a.level - 1]) : {
      level: 7, rhythm: 7, range: RANGES[a.custom.range], leap: LEAPS[a.custom.leap], leaps: a.custom.leap >= 3 ? 'any' : 'chord', steps: 0.75, chroma: 0.08, chromatic: 'all',
    };
    // The rhythm level's rules. In melodies rests fall between phrases (breaths), so there are none
    // inside phrases at the easy levels and only a few at the harder ones.
    const base = MQ.rhythmRules({ level: L.rhythm, custom: a.custom });
    const inside = L.level <= 2 ? 0 : L.level <= 4 ? 0.3 : 0.5;
    L.rules = Object.assign({}, base, { rests: [base.rests[0] * inside, base.rests[1] * inside] });
    return L;
  }

  // ---------- rhythm ----------
  // Four bars are one phrase at the easy levels and 2 + 2 (a question and an answer) from level 3.
  const PHRASES = { 1: [1], 2: [2], 3: [3], 4: [4], 5: [2, 3], 6: [3, 3], 7: [3, 4], 8: [4, 4] };
  const phrasesOf = (n, level) => (n === 4 && level >= 3 ? [2, 2] : PHRASES[n]);
  const copyBar = (bar) => bar.map((e) => Object.assign({}, e));
  // A breath at the end of a phrase: its long last note shortened by a beat, and a rest in its place.
  const BREATHS = { 48: [{ v: 1, d: 1 }, { v: 2 }], 36: [{ v: 1 }, { v: 2 }], 24: [{ v: 2 }, { v: 2 }] };
  const BREATHS_COMPOUND = { 36: [{ v: 2, d: 1 }, { v: 2, d: 1 }] };
  function melodyRhythm(rng, L, n, meter) {
    const info = MQ.rhythmMeter(meter);
    const parts = phrasesOf(n, L.level), bars = [], ends = [];
    let first = null;
    parts.forEach((len, p) => {
      let phrase;
      // About 40% of folk phrases repeat an earlier phrase's rhythm.
      if (p > 0 && len === parts[0] && rng() < 0.55) {
        // A parallel phrase: the first phrase's rhythm with a new ending.
        phrase = first.slice(0, len - 1).map(copyBar).concat(MQ.rhythmPhrase(rng, L.rules, 1, meter, MQ.RHYTHM_GEN));
      } else phrase = MQ.rhythmPhrase(rng, L.rules, len, meter, MQ.RHYTHM_GEN);
      if (!p) first = phrase.map(copyBar);
      bars.push(...phrase);
      ends.push(bars.length - 1);
    });
    // Breathe between phrases, where the long note allows it.
    ends.slice(0, -1).forEach((m) => {
      const bar = bars[m], last = bar[bar.length - 1];
      if (!last || last.r || last.t || rng() > (L.level >= 2 ? 0.6 : 0.35)) return;
      const table = info.tempo === 'q.' ? BREATHS_COMPOUND : BREATHS;
      const swap = table[MQ.rhythmDur(last)];
      if (!swap) return;
      bar.splice(bar.length - 1, 1, { v: swap[0].v, d: swap[0].d || 0, t: 0, r: 0 }, { v: swap[1].v, d: swap[1].d || 0, t: 0, r: 1 });
    });
    return { bars, ends, info };
  }

  // ---------- harmony ----------
  // One chord a measure, as scale degrees (0 = the tonic). A melody's last phrase ends I (its last
  // measure: V, then I on the last note); an earlier phrase ends on V.
  const CHORDS = { I: [0, 2, 4], ii: [1, 3, 5], IV: [3, 5, 0], V: [4, 6, 1, 3], vi: [5, 0, 2] };
  function harmony(rng, len, final, level) {
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const middle = level >= 4 ? ['IV', 'ii', 'vi', 'IV', 'I'] : ['IV', 'I', 'IV'];
    if (len === 1) return [final ? 'I' : 'V'];
    const out = ['I'];
    for (let i = 1; i < len - 1; i++) out.push(i === len - 2 ? (final ? pick(level >= 4 ? ['V', 'IV', 'ii'] : ['V', 'IV']) : pick(['IV', 'I', level >= 4 ? 'ii' : 'IV'])) : pick(middle));
    out.push(final ? 'I' : 'V');
    return out;
  }

  // ---------- pitch ----------
  const STEP_W = [0.35, 1, 0.42, 0.2, 0.13, 0.06, 0.025, 0.05];     // unison, step, third … octave
  // Every note of the melody, with what shapes its pitch.
  function noteSlots(bars, ends, info, rng, level) {
    const slots = [];
    let phrase = 0, from = 0;
    const chordsOf = [];
    ends.forEach((end, p) => {
      const len = end - from + 1;
      harmony(rng, len, p === ends.length - 1, level).forEach((c) => chordsOf.push(c));
      from = end + 1;
    });
    bars.forEach((bar, m) => {
      let t = 0;
      bar.forEach((e, i) => {
        const d = MQ.rhythmDur(e);
        if (!e.r) {
          const onBeat = info.beats.some((b) => b.at === t);
          slots.push({ m, i, t, d, e, phrase, chord: chordsOf[m], strength: t === 0 ? 3 : onBeat ? 2 : t % 6 === 0 ? 1 : 0, long: d >= Math.min(24, info.beats[0].len * 2) });
        }
        t += d;
      });
      if (ends.includes(m)) phrase++;
    });
    // Phrase ends, and the final cadence: V before the last note, I on it.
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k], next = slots[k + 1];
      s.phraseEnd = !next || next.phrase !== s.phrase;
      s.final = !next;
      s.penult = !!next && !slots[k + 2];
    }
    const lastBar = slots.length ? slots[slots.length - 1].m : 0;
    slots.forEach((s) => { if (s.m === lastBar && !s.final && s.chord === 'I' && s.t > 0) s.chord = 'V'; });
    return slots;
  }
  const inChord = (d, ch) => CHORDS[ch].includes(tone(d));
  // Intervals as they're spelled: a step of three half steps, a third of five, a fourth of six … are
  // augmented or diminished — awkward to sing and to hear, so kept out (the tritone of V7 aside, at
  // the top level).
  const PLAIN = { 0: [0], 1: [1, 2], 2: [3, 4], 3: [5], 4: [7], 5: [8, 9], 6: [10, 11], 7: [12] };
  function oddInterval(steps, semis, level) {
    const a = Math.abs(steps), n = Math.abs(semis);
    if (a > 7 || PLAIN[a].includes(n)) return false;
    return !(level >= 6 && (a === 3 || a === 4) && n === 6);
  }
  const TONIC = [0, 2, 4];
  // One try at the pitches: a scale degree for every note.
  function tryPitches(rng, slots, L, bars) {
    const range = L.range;
    // The window the melody lives in: it holds the tonic, reaching below it at the wider levels.
    const lo = L.level <= 1 ? 0 : -Math.floor(rng() * Math.min(5, range - 3 + 1));
    const hi = lo + range;
    const center = (lo + hi) / 2;
    // Each phrase's contour, in about the proportions folk songs have: arch, descending, ascending,
    // U-shaped. First phrases lean toward rising, the last toward falling to the tonic.
    const phrases = [...new Set(slots.map((s) => s.phrase))];
    const shape = phrases.map((p) => {
      const last = p === phrases.length - 1, firstOfMany = !p && phrases.length > 1;
      const w = firstOfMany ? { arch: 0.4, down: 0.15, up: 0.3, u: 0.15 } : last ? { arch: 0.35, down: 0.4, up: 0.1, u: 0.15 } : { arch: 0.35, down: 0.27, up: 0.22, u: 0.16 };
      return pickWeighted(rng, Object.keys(w), (k) => w[k]);
    });
    const span = phrases.map((p) => { const idx = slots.map((s, k) => (s.phrase === p ? k : -1)).filter((k) => k >= 0); return [idx[0], idx[idx.length - 1]]; });
    const target = (k, s) => {
      const [a, b] = span[s.phrase], x = b > a ? (k - a) / (b - a) : 1;
      const top = Math.min(hi, lo + Math.round(range * 0.8)), end = s.phrase === phrases.length - 1 ? 0 : 4;
      if (shape[s.phrase] === 'arch') return x < 0.6 ? 0 + (top - 0) * Math.sin((x / 0.6) * Math.PI / 2) : top + (end - top) * ((x - 0.6) / 0.4);
      if (shape[s.phrase] === 'down') return top - (top - end) * x;
      if (shape[s.phrase] === 'u') return x < 0.5 ? 4 - (4 - lo) * (x / 0.5) : lo + (end - lo) * ((x - 0.5) / 0.5);
      return 0 + (Math.min(hi, 5) - 0) * x;
    };
    const seq = [];
    // A measure whose rhythm repeats an earlier one may repeat its melody, or move it up or down (a sequence).
    const key = (m) => JSON.stringify(bars[m].map((e) => [e.v, e.d, e.t, e.r]));
    const copyFrom = {};
    slots.forEach((s) => {
      if (copyFrom[s.m] != null || s.i !== bars[s.m].findIndex((e) => !e.r)) return;
      const earlier = slots.find((x) => x.m < s.m && key(x.m) === key(s.m));
      copyFrom[s.m] = earlier && rng() < 0.5 ? earlier.m : -1;
    });
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k], p = k ? seq[k - 1] : null;
      let options = [];
      for (let d = lo; d <= hi; d++) options.push(d);
      // Fixed points: the tonic at the end; the dominant's notes at a half cadence.
      if (s.final) options = options.filter((d) => tone(d) === 0);
      else if (s.phraseEnd) options = options.filter((d) => inChord(d, 'V') && tone(d) !== 3);
      // Openings: on do most of all, or mi or sol (1-2-3 and 3-4-5 are the commonest starts).
      if (!k) options = options.filter((d) => (L.level <= 1 ? d === 0 : TONIC.includes(tone(d)) && d >= 0 && d <= 4));
      if (p != null) options = options.filter((d) => Math.abs(d - p) <= L.leap);
      if (!options.length) options = [p == null ? 0 : p];
      // Copying an earlier measure's shape.
      const src = copyFrom[s.m];
      if (src != null && src >= 0 && k && !s.final && !s.phraseEnd) {
        const mine = slots.filter((x) => x.m === s.m), theirs = slots.filter((x) => x.m === src);
        const j = mine.indexOf(s);
        if (j > 0 && theirs[j] && theirs[j - 1]) {
          const iv = seq[slots.indexOf(theirs[j])] - seq[slots.indexOf(theirs[j - 1])];
          const d = p + iv;
          if (options.includes(d)) { seq.push(d); continue; }
        }
      }
      const prevIv = k >= 2 ? seq[k - 1] - seq[k - 2] : 0;
      const prevIv2 = k >= 3 ? seq[k - 2] - seq[k - 3] : 0;
      // How long the melody has been going one way.
      let run = 0;
      for (let j = k - 1; j >= 1 && Math.sign(seq[j] - seq[j - 1]) === Math.sign(prevIv) && prevIv; j--) run++;
      const profile = PROFILE[L.minor ? 'minor' : 'major'];
      const w = (d) => {
        if (p == null) return d === 0 ? 3 : 1.5;
        const iv = d - p, a = Math.abs(iv);
        let x = STEP_W[Math.min(7, a)];
        // Leaps: which notes they may join.
        if (a >= 2) {
          if (L.leaps === 'tonic' && !(TONIC.includes(tone(p)) && TONIC.includes(tone(d)))) return 0;
          if (L.leaps === 'chord' && !(inChord(p, s.chord) || inChord(p, slots[k - 1].chord)) || (L.leaps !== 'any' && !inChord(d, s.chord) && !TONIC.includes(tone(d)))) x *= 0.08;
          if (L.leaps === 'any' && !inChord(d, s.chord)) x *= 0.35;
          x *= iv > 0 ? 1.25 : 0.8;                                  // leaps more often rise
          // The augmented fourth (fa–ti) only at the top level.
          if (L.level < 6 && ((tone(p) === 3 && tone(d) === 6) || (tone(p) === 6 && tone(d) === 3)) && a === 3) return 0;
          if (L.level < 6 && (a === 6)) x *= 0.1;                      // sevenths are rare
          // Never three leaps running; two the same way only when they outline a chord.
          if (Math.abs(prevIv) >= 2 && Math.abs(prevIv2) >= 2) x *= 0.05;
          if (Math.abs(prevIv) >= 2 && Math.sign(iv) === Math.sign(prevIv) && !(a === 2 && Math.abs(prevIv) === 2 && inChord(d, s.chord) && inChord(p, s.chord))) x *= 0.2;
        } else if (iv < 0) x *= 1.1;                                  // steps more often fall (54% of intervals fall)
        // Steps keep going the way they were going (71% of the time) — for a while.
        if (a === 1 && Math.abs(prevIv) === 1) x *= Math.sign(iv) === Math.sign(prevIv) ? (run >= 4 ? 0.6 : 1.6) : (run >= 4 ? 1.8 : 0.7);
        // After a leap, head back toward the middle of the melody — usually by step the other way.
        if (Math.abs(prevIv) >= 3) {
          const toward = Math.abs(d - center) < Math.abs(p - center);
          x *= (toward ? 2 : 0.4) * (Math.sign(iv) === -Math.sign(prevIv) && a <= 1 ? 1.8 : 1);
        }
        // The notes of the key, weighted a little by how strongly they belong to it.
        x *= Math.pow(profile[tone(d)] / 4.5, 0.7);
        // Beats: do sits on the downbeat, fa and ti fall between beats.
        if (s.strength === 3) x *= tone(d) === 0 ? 1.4 : tone(d) === 3 || tone(d) === 6 ? 0.6 : 1;
        else if (s.strength <= 1 && (tone(d) === 3 || tone(d) === 6)) x *= 1.3;
        // No more than a few of the same note running.
        if (!iv && k >= 2 && seq[k - 2] === p) x *= L.level <= 1 ? 0.5 : 0.25;
        // Strong beats and long notes take the chord's notes.
        if (s.strength >= 2 || s.long) x *= inChord(d, s.chord) ? 2.4 : a === 1 ? 0.35 : 0.1;
        // Tendency tones: ti rises to do, fa falls to mi, la falls to sol.
        if (tone(p) === 6 && a === 1) x *= iv > 0 ? 4 : 0.4;
        if (tone(p) === 3 && a === 1 && iv < 0) x *= 1.8;
        if (tone(p) === 5 && a === 1 && iv < 0) x *= L.minor ? 1.6 : 1.3;
        // Toward the phrase's contour, and back toward the middle of the range.
        const tg = target(k, s);
        x *= Math.exp(-((d - tg) * (d - tg)) / (2 * 2.4 * 2.4));
        x *= 1 / (1 + 0.04 * Math.abs(d - center));
        // Into the cadence by step, mostly from above: 3-2-1 is the commonest ending, then ti-do.
        if (s.penult) x *= a <= 1 && tone(d) === 1 ? 5 : a <= 1 && tone(d) === 6 ? 2 : tone(d) === 4 ? 1 : 0.35;
        return x;
      };
      seq.push(pickWeighted(rng, options, w));
    }
    return { seq, lo, hi };
  }
  // How natural a try is, by the numbers above.
  function scorePitches(t, slots, L, midi) {
    const seq = t.seq;
    let sc = 0, steps = 0, n = 0;
    // As the key spells it (a minor key's raised sixth and seventh included): no odd intervals.
    if (midi) {
      const c = minorSpelling(seq, slots, L.minor ? 'minor' : 'major', (k) => midi(seq[k]));
      for (let k = 1; k < seq.length; k++) if (oddInterval(seq[k] - seq[k - 1], midi(seq[k]) + c[k] - midi(seq[k - 1]) - c[k - 1], L.level)) sc -= 8;
    }
    for (let k = 1; k < seq.length; k++) {
      const iv = seq[k] - seq[k - 1], a = Math.abs(iv);
      n++;
      if (a <= 1) steps++;
      const prev = k >= 2 ? seq[k - 1] - seq[k - 2] : 0;
      if (Math.abs(prev) >= 3 && Math.sign(iv) === Math.sign(prev)) sc -= 1.5;          // no gap fill
      if (Math.abs(prev) >= 2 && a >= 2 && Math.sign(iv) === Math.sign(prev) && !(inChord(seq[k - 2], slots[k].chord) && inChord(seq[k], slots[k].chord))) sc -= 1.5;
      if (k >= 3 && !iv && seq[k - 2] === seq[k] && seq[k - 3] === seq[k]) sc -= L.level <= 1 ? 0.5 : 1.5;
      if (k >= 2 && a >= 2 && Math.abs(prev) >= 2 && k >= 3 && Math.abs(seq[k - 2] - seq[k - 3]) >= 2) sc -= 3;   // three leaps in a row
    }
    if (n) sc -= Math.abs(steps / n - L.steps) * 12;
    const lo = Math.min(...seq), hi = Math.max(...seq);
    if (L.level >= 3 && hi - lo < L.range * 0.5) sc -= 2;
    if (hi === lo) sc -= 6;
    // Each phrase's high point somewhere inside it, not at an edge.
    [...new Set(slots.map((s) => s.phrase))].forEach((p) => {
      const idx = slots.map((s, k) => (s.phrase === p ? k : -1)).filter((k) => k >= 0);
      const vals = idx.map((k) => seq[k]), top = Math.max(...vals);
      if (idx.length >= 4 && (vals[0] === top || vals[vals.length - 1] === top) && vals.filter((v) => v === top).length === 1) sc -= 1;
    });
    // Chord tones on the strong beats.
    const strong = slots.filter((s) => s.strength >= 2);
    if (strong.length) sc += 3 * (strong.filter((s) => inChord(seq[slots.indexOf(s)], s.chord)).length / strong.length);
    // Into the final tonic by step.
    if (seq.length >= 2 && Math.abs(seq[seq.length - 1] - seq[seq.length - 2]) === 1) sc += 2;
    return sc;
  }

  // ---------- spelling: minor keys and chromatic notes ----------
  // Half steps up from the key signature's note, for each note.
  // midi(k): the note's pitch in the key, without any change. The minor key's own sixth and
  // seventh come first; chromatic notes are added to them.
  function chromas(seq, slots, mode, chroma, rng, level, midi) {
    const c = minorSpelling(seq, slots, mode, midi);
    return chroma ? addChromatic(c, seq, slots, chroma, rng, level, midi) : c;
  }
  function minorSpelling(seq, slots, mode, midi) {
    const c = seq.map(() => 0);
    const aug2 = (a, b) => Math.abs(seq[a] - seq[b]) === 1 && Math.abs(midi(a) + c[a] - midi(b) - c[b]) === 3;
    if (mode === 'minor') {
      // The leading tone: raised when it rises to the tonic or ends a half cadence; the sixth is
      // raised on its way up to a raised seventh.
      for (let k = 0; k < seq.length; k++) {
        const d = seq[k], next = seq[k + 1];
        if (tone(d) === 6 && ((next != null && next === d + 1) || slots[k].phraseEnd || (slots[k].chord === 'V' && next != null && tone(next) !== 5))) c[k] = 1;
      }
      for (let k = seq.length - 2; k >= 0; k--) if (tone(seq[k]) === 5 && seq[k + 1] === seq[k] + 1 && c[k + 1] === 1) c[k] = 1;
      // No augmented second: next to a sixth a step away, the raised seventh goes up with the sixth
      // raised too, or comes down natural.
      for (let k = 1; k < seq.length; k++) {
        if (!aug2(k - 1, k)) continue;
        const [a, b] = [k - 1, k];
        const up = seq[b] > seq[a];
        if (up && tone(seq[a]) === 5) c[a] = 1;
        else if (!up && tone(seq[a]) === 6) c[a] = 0;
        else if (up && tone(seq[b]) === 6) c[b] = 0;
      }
    }
    return c;
  }
  function addChromatic(c, seq, slots, chroma, rng, level, midi) {
    const odd = (a, b) => oddInterval(seq[b] - seq[a], midi(b) + c[b] - midi(a) - c[a], level);
    // Chromatic notes: weak-beat notes a whole step from the next note, made a half step from it —
    // sharps resolving up, flats down. Lower neighbours (G F♯ G) come first; then approaches, the
    // commonest ♯4→5, then ♯1→2 and ♯5→6; at the top levels flats too, above all ♭7→6.
    const wholeStep = (k, dir) => { const s = slots[k]; return s.whole && s.whole[dir]; };
    const kinds = slots[0] && slots[0].chromatic;
    const places = [];
    for (let k = 1; k < seq.length - 1; k++) {
      const s = slots[k];
      if (s.strength >= 2 || s.long || s.phraseEnd || c[k] || s.e.t) continue;
      const next = seq[k + 1] - seq[k], neighbour = seq[k + 1] === seq[k - 1];
      const to = tone(seq[k + 1]);
      if (next === 1 && wholeStep(k, 'up') && (neighbour || kinds !== 'neighbour')) places.push({ k, alt: 1, w: (neighbour ? 2 : 1) * (to === 4 ? 3 : to === 1 ? 1.5 : to === 5 ? 1.2 : 0.7) });
      // Flats borrow from the minor key (♭7, ♭6, ♭3), so only a major key has them to borrow.
      else if (next === -1 && wholeStep(k, 'down') && kinds === 'all' && !slots[0].minor && [6, 5, 2].includes(tone(seq[k]))) places.push({ k, alt: -1, w: tone(seq[k]) === 6 ? 1.2 : 0.6 });
    }
    const want = Math.max(1, Math.round(seq.length * chroma * (0.6 + rng() * 0.8)));
    for (let n = 0; n < want && places.length; n++) {
      const p = pickWeighted(rng, places, (x) => x.w);
      places.splice(places.indexOf(p), 1);
      c[p.k] = p.alt;
      // Not if it makes an augmented or diminished interval with the note before or after.
      if ((p.k > 0 && odd(p.k - 1, p.k)) || (p.k + 1 < seq.length && odd(p.k, p.k + 1))) { c[p.k] = 0; n--; continue; }
      for (let j = places.length - 1; j >= 0; j--) if (Math.abs(places[j].k - p.k) <= 1) places.splice(j, 1);
    }
    return c;
  }

  // ---------- one melody ----------
  function keyFor(rng, a) {
    const mode = a.keyMode === 2 ? 'minor' : a.keyMode === 3 ? (rng() < 0.5 ? 'major' : 'minor') : 'major';
    const all = [];
    for (let f = -a.keyMax; f <= a.keyMax; f++) all.push(f);
    const fifths = pickWeighted(rng, all, (f) => 1 / (1 + 0.45 * Math.abs(f)));
    return { fifths, mode };
  }
  function buildMelody(rng, a, L, meter, key, clef) {
    const { bars, ends, info } = melodyRhythm(rng, L, a.measures, meter);
    const K = MQ.melodyKey(key);
    L.minor = key.mode === 'minor';
    const slots = noteSlots(bars, ends, info, rng, L.level);
    if (slots[0]) Object.assign(slots[0], { chromatic: L.chromatic, minor: L.minor });
    let best = null;
    const at = (d) => MQ.midi(MQ.melodyPitchAt(K, K.tonic.step + 28 + d));
    for (let tries = 0; tries < 70; tries++) {
      const t = tryPitches(rng, slots, L, bars);
      const sc = scorePitches(t, slots, L, at);
      if (!best || sc > best.sc) best = Object.assign(t, { sc });
    }
    const seq = best.seq;
    // Where the tonic goes: the octave that keeps the melody on the staff, nearest its middle.
    const bottom = MQ.CLEFS[clef].bottom;
    const lo = Math.min(...seq), hi = Math.max(...seq);
    let tonicDia = K.tonic.step, bestFit = null;
    for (let oct = 0; oct <= 8; oct++) {
      const t = K.tonic.step + oct * 7;
      const a1 = t + lo - bottom, b1 = t + hi - bottom;
      const over = Math.max(0, -3 - a1) + Math.max(0, b1 - 11);
      const fit = over * 10 + Math.abs((a1 + b1) / 2 - 4);
      if (bestFit == null || fit < bestFit) { bestFit = fit; tonicDia = t; }
    }
    // Which steps are whole steps (for chromatic approaches and neighbours).
    slots.forEach((s, k) => {
      const here = MQ.midi(MQ.melodyPitchAt(K, tonicDia + seq[k]));
      const up = MQ.midi(MQ.melodyPitchAt(K, tonicDia + seq[k] + 1)), down = MQ.midi(MQ.melodyPitchAt(K, tonicDia + seq[k] - 1));
      s.whole = { up: up - here === 2, down: here - down === 2 };
    });
    const c = chromas(seq, slots, key.mode, a.chromatic ? L.chroma : 0, rng, L.level, (k) => MQ.midi(MQ.melodyPitchAt(K, tonicDia + seq[k])));
    slots.forEach((s, k) => {
      const p = MQ.melodyPitchAt(K, tonicDia + seq[k]);
      p.alt += c[k];
      bars[s.m][s.i].p = p;
    });
    return bars;
  }

  // The melodies of an automatic quiz, as the teacher would have written them.
  function generateMelodies(seed, auto) {
    const a = MQ.melodyAuto(auto), L = levelOf(a), out = [];
    for (let k = 0; k < a.count; k++) {
      const rng = MQ.mulberry32((Math.imul((seed >>> 0) + 1, 2246822519) ^ Math.imul(k + 1, 3266489917) ^ 0x27d4eb2f) >>> 0);
      const meter = MQ.rhythmPickMeter(rng, L.rules);
      const info = MQ.rhythmMeter(meter);
      const key = keyFor(rng, a);
      const clef = a.clefs === 2 ? 'bass' : a.clefs === 3 && rng() < 0.5 ? 'bass' : 'treble';
      const bars = buildMelody(rng, a, L, meter, key, clef);
      while (bars.length < MQ.MELODY_MEASURES) bars.push([]);
      const tempo = Math.max(40, Math.min(240, Math.round((a.tempo * 12) / MQ.RHYTHM_TEMPO_UNITS[info.tempo])));
      out.push(MQ.melodyExample({ meter, measures: a.measures, tempo, key, clef, layers: [bars] }));
    }
    return out;
  }

  Object.assign(MQ, { MELODY_LEVELS: LEVELS, MELODY_GEN: GEN, generateMelodies, melodyLevel: levelOf });
})(typeof window !== 'undefined' ? window : globalThis);
