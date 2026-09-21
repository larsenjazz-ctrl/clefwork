/* Clefwork Keys — one note, shown one way and answered another: on the grand staff, as a
   name with its octave (F♯4, middle C = C4), or as a key on the piano. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const { midi, dia, fromDia, pcName } = MQ;

  const KINDS = [
    { id: 'staff', show: 'Note on the grand staff', answer: 'Write it on the grand staff' },
    { id: 'name', show: 'Note name with octave', answer: 'Type the name with its octave' },
    { id: 'piano', show: 'Highlighted piano key', answer: 'Play it on the piano' },
  ];
  const kindAt = (i) => KINDS[i].id;
  const on = (mask, i) => !!(mask & (1 << i));

  function keysSettings(block) {
    const b = block || {};
    if (b.prompts == null) b.prompts = 0b111;
    if (b.answers == null) b.answers = 0b111;
    if (b.low == null) b.low = 48;                 // C3
    if (b.high == null) b.high = 72;               // C5
    if (b.low > b.high) { const t = b.low; b.low = b.high; b.high = t; }
    return b;
  }
  // Every way of showing a note paired with every different way of answering.
  function keysCombos(b) {
    const s = keysSettings(b);
    const out = [];
    KINDS.forEach((p, i) => KINDS.forEach((a, j) => {
      if (i !== j && on(s.prompts, i) && on(s.answers, j)) out.push([p.id, a.id]);
    }));
    return out;
  }

  // ---------- names with octaves ----------
  const noteName = (p) => pcName(p) + p.oct;
  // "F#4", "f♯4", "Bb 3", "C4", "Ebb5", "Fx4" → {step, alt, oct}; anything else → null.
  function parseNoteName(str) {
    const m = String(str || '').trim().match(/^([A-Ga-g])\s*(##|x|𝄪|#|♯|bb|𝄫|b|♭|♮)?\s*(-?\d)$/);
    if (!m) return null;
    const acc = m[2] || '';
    const alt = { '#': 1, '♯': 1, '##': 2, x: 2, '𝄪': 2, b: -1, '♭': -1, bb: -2, '𝄫': -2, '♮': 0, '': 0 }[acc];
    const oct = +m[3];
    if (oct < 0 || oct > 8) return null;
    return { step: 'CDEFGAB'.indexOf(m[1].toUpperCase()), alt, oct };
  }
  const MIDDLE = 60;
  // The other everyday name for the same key: C♯4 ↔ D♭4. Null for a white key.
  function otherName(p) {
    const m = midi(p);
    const pcs = m % 12;
    if (![1, 3, 6, 8, 10].includes(pcs)) return null;
    const alt = p.alt === 1 ? -1 : 1;
    const step = (p.step + (alt === -1 ? 1 : -1) + 7) % 7;
    const q = { step, alt, oct: 0 };
    for (let oct = p.oct - 1; oct <= p.oct + 1; oct++) { q.oct = oct; if (midi(q) === m) return { step, alt, oct }; }
    return null;
  }

  // ---------- choosing the note ----------
  const ALT_SETS = [[0], [0, 1], [0, -1], [0, 1, -1]];
  function candidates(lo, hi, accMode) {
    const alts = ALT_SETS[accMode] || [0];
    const out = [];
    for (let d = dia({ step: 0, oct: 0 }); d <= dia({ step: 6, oct: 8 }); d++) {
      alts.forEach((alt) => {
        const p = fromDia(d, alt);
        const m = midi(p);
        // The everyday spellings only — no E♯, B♯, F♭ or C♭.
        if (m < lo || m > hi || (alt === 1 && (p.step === 2 || p.step === 6)) || (alt === -1 && (p.step === 3 || p.step === 0))) return;
        out.push({ p, name: pcName(p) });
      });
    }
    return out;
  }
  const onGrand = (p) => Object.assign({}, p, { st: dia(p) < 28 ? 1 : 0 });
  // The keyboard spans whole octaves: from the C at or below the lowest note to the B at or
  // above the highest.
  function keyboardRange(b) {
    const s = keysSettings(b);
    return { lo: s.low - (s.low % 12), hi: s.high + (11 - (s.high % 12)) };
  }

  const TEXT = {
    'staff:name': ['Name this note, with its octave.', 'Type it like F♯4 or B♭2. Middle C is C4.'],
    'staff:piano': ['Play this note on the piano.', 'Click the key. Middle C is marked with a dot.'],
    'name:staff': ['Write {n} on the grand staff.', 'Drag a note onto either staff. Middle C is C4.'],
    'name:piano': ['Play {n} on the piano.', 'Click the key. Middle C is marked with a dot.'],
    'piano:name': ['Name the highlighted key, with its octave.', 'Type it like F♯4 or B♭2 — either name works for a black key. Middle C is C4.'],
    'piano:staff': ['Write the highlighted key on the grand staff.', 'Either spelling works for a black key. Middle C is marked with a dot.'],
  };

  function keysQuestion(rng, cfg, b, combo) {
    const s = keysSettings(b);
    const list = candidates(s.low, s.high, cfg.accMode == null ? 3 : cfg.accMode);
    const pick = MQ.pickSpelled(rng, list, (x) => x.name) || { p: { step: 0, alt: 0, oct: 4 } };
    const pitch = pick.p;
    const [prompt, answer] = combo;
    const [text, hint] = TEXT[prompt + ':' + answer];
    const kb = keyboardRange(s);
    const q = {
      type: 'keys', clef: 'grand', grand: true,
      keys: { prompt, answer, pitch: onGrand(pitch), midi: midi(pitch), kbLo: kb.lo, kbHi: kb.hi },
      text: text.replace('{n}', noteName(pitch)),
      hint,
      columns: answer === 'staff' ? [{ given: [], cap: 1 }] : [],
      answer: answer === 'staff' ? [[onGrand(pitch)]] : [],
      tags: ['pc:' + pcName(pitch), 'kc:' + prompt + answer, 'oct:' + pitch.oct],
      sig: 'k' + prompt + answer + noteName(pitch),
    };
    return q;
  }
  // `varied` is the quiz's variety picker, so no note or octave is leaned on.
  function keysQuestions(cfg, rng, varied) {
    const n = (cfg.counts && cfg.counts.keys) || 0;
    if (!n) return [];
    const combos = keysCombos(cfg.keys);
    if (!combos.length) return [];
    const keep = varied || ((make) => make());
    const out = [];
    // Walk through the chosen combinations in turn from a random start, so each gets its share.
    const start = Math.floor(rng() * combos.length);
    for (let i = 0; i < n; i++) {
      const combo = combos[(start + i) % combos.length];
      out.push(keep(() => keysQuestion(rng, cfg, cfg.keys, combo)));
    }
    return out;
  }

  // ---------- grading ----------
  // A piano key has no spelling, so when a key is shown either name for it counts.
  function matches(q, p, cfg) {
    if (!p) return false;
    const k = q.keys;
    const loose = k.prompt === 'piano' || (cfg && cfg.flags && cfg.flags.enharmonic);
    if (loose) return midi(p) === k.midi && Math.abs(p.alt) <= 1;
    return p.step === k.pitch.step && p.alt === k.pitch.alt && p.oct === k.pitch.oct;
  }
  function gradeKeys(q, resp, cfg) {
    const k = q.keys;
    if (k.answer === 'piano') return resp === k.midi ? 1 : 0;
    if (k.answer === 'name') return matches(q, parseNoteName(resp), cfg) ? 1 : 0;
    const notes = ((resp && resp[0]) || []).filter(Boolean);
    return notes.length === 1 && matches(q, notes[0], cfg) ? 1 : 0;
  }
  function hasKeysAnswer(q, resp) {
    const k = q.keys;
    if (k.answer === 'piano') return typeof resp === 'number';
    if (k.answer === 'name') return !!String(resp || '').trim();
    return !!resp && resp.some((c) => c && c.some(Boolean));
  }
  function describeKeys(q) {
    const k = q.keys;
    const alt = k.prompt === 'piano' ? otherName(k.pitch) : null;
    return noteName(k.pitch) + (alt ? ' or ' + noteName(alt) : '');
  }
  // What the student put, as a name: a pressed key, a typed name, or a note on the staff.
  function keysResponsePitch(q, resp) {
    const k = q.keys;
    if (k.answer === 'piano') return typeof resp === 'number' ? resp : null;
    if (k.answer === 'name') return parseNoteName(resp);
    const notes = ((resp && resp[0]) || []).filter(Boolean);
    return notes[0] || null;
  }

  // The same question worded for paper: keys are circled, not played.
  function keysPrintText(q) {
    const k = q.keys, n = noteName(k.pitch);
    if (k.answer !== 'piano') return q.text;
    return k.prompt === 'name' ? `Circle ${n} on the keyboard.` : 'Circle this note on the keyboard.';
  }

  Object.assign(MQ, {
    keysPrintText,
    KEYS_KINDS: KINDS, keysSettings, keysCombos, keysQuestions, keysQuestion, gradeKeys, hasKeysAnswer, describeKeys,
    parseNoteName, noteName, otherName, keyboardRange, keysResponsePitch, MIDDLE_C: MIDDLE,
  });
})(typeof window !== 'undefined' ? window : globalThis);
