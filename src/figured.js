/* Clefwork — figured bass: one chord, or a progression.
   Two directions: the chord is printed and the student writes the Roman numeral with its figures,
   or the numeral is printed and the student spells the chord on the staff in that inversion.
   Figures: triads — root (none), 6, 6/4; sevenths — 7, 6/5, 4/3, 4/2. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const { dia, midi, pcName, fromDia } = MQ;
  const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const pc = (p) => ({ step: p.step, alt: p.alt });

  // The figures a student can choose from.
  const FIGURES = [
    { fig: '', label: '— (root position)', inv: 0, seventh: false },
    { fig: '7', label: '7 (root position 7th)', inv: 0, seventh: true },
    { fig: '6', label: '6 (first inversion)', inv: 1, seventh: false },
    { fig: '64', label: '6/4 (second inversion)', inv: 2, seventh: false },
    { fig: '65', label: '6/5 (first inversion 7th)', inv: 1, seventh: true },
    { fig: '43', label: '4/3 (second inversion 7th)', inv: 2, seventh: true },
    { fig: '42', label: '4/2 (third inversion 7th)', inv: 3, seventh: true },
  ];
  const figureFor = (seventh, inv) => (seventh ? ['7', '65', '43', '42'][inv] : ['', '6', '64'][inv]);
  const POSITIONS = ['root position', 'first inversion', 'second inversion', 'third inversion'];

  // ---------- the chord a Roman numeral stands for ----------
  const LOWER = ['min', 'dim', 'min7', 'hdim7', 'dim7'];
  const MARK = { dim: '°', dim7: '°', hdim7: 'ø', aug: '+' };
  // Altered degrees: flats are major chords (♭II, ♭VI …), sharps are diminished ones (♯iv° …).
  const FLAT_DEGREES = [1, 2, 5, 6], SHARP_DEGREES = [0, 1, 3, 4];

  function chordAt(kd, deg, shift, seventh) {
    if (!shift) {
      const ch = MQ.diatonicChord(kd, deg + 1, seventh);
      return { root: ch.root, q: ch.q, deg, shift: 0 };
    }
    const base = MQ.keyPitch ? MQ.keyPitch(kd, deg) : null;
    const rootPc = { step: base.step, alt: base.alt + shift };
    const q = shift < 0 ? (seventh ? 'dom7' : 'maj') : seventh ? 'dim7' : 'dim';
    return { root: rootPc, q, deg, shift };
  }
  function romanOf(ch) {
    const qd = MQ.QUALITIES.find((q) => q.id === ch.q) || { id: 'maj' };
    const low = LOWER.includes(qd.id);
    const pre = ch.shift < 0 ? '♭' : ch.shift > 0 ? '♯' : '';
    return pre + (low ? NUMERALS[ch.deg].toLowerCase() : NUMERALS[ch.deg]) + (MARK[qd.id] || '');
  }
  const isSeventh = (q) => ['dom7', 'maj7', 'min7', 'hdim7', 'dim7'].includes(q);
  const tonesOf = (ch) => {
    const qd = MQ.QUALITIES.find((q) => q.id === ch.q);
    const r = { step: ch.root.step, oct: 4, alt: ch.root.alt };
    return [pc(ch.root)].concat(qd.tones.map(([n, s]) => pc(MQ.transpose(r, n, s, 1))));
  };

  // ---------- reading what a student types ----------
  // "V65", "V 6/5", "viio6", "bVII" … → {deg, shift, low, mark, seventh, inv}
  function parseFigured(str) {
    let s = String(str || '').trim().replace(/[♭]/g, 'b').replace(/[♯]/g, '#').replace(/[º˚]/g, '°').replace(/Ø/g, 'ø').replace(/\s|\//g, '');
    const m = s.match(/^([b#-+]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
    if (!m) return null;
    const shift = m[1] === '#' || m[1] === '+' ? 1 : m[1] === 'b' || m[1] === '-' ? -1 : 0;
    const low = m[2] === m[2].toLowerCase();
    let rest = m[3];
    let mark = '';
    const mk = rest.match(/^(°7?|o7?|dim7?|ø7?|\/o7?|\+)/);
    if (mk) {
      const t = mk[0];
      mark = /\+/.test(t) ? '+' : /ø|\/o/.test(t) ? 'ø' : '°';
      rest = rest.slice(t.length);
      if (/7$/.test(t)) rest = '7' + rest;
    }
    if (!/^(|7|6|64|65|43|42|63|53|2|7?)$/.test(rest)) return null;
    const figure = rest === '63' ? '6' : rest === '53' ? '' : rest === '2' ? '42' : rest;
    const seventh = ['7', '65', '43', '42'].includes(figure);
    const inv = { '': 0, 6: 1, 64: 2, 7: 0, 65: 1, 43: 2, 42: 3 }[figure];
    if (inv == null) return null;
    return { deg: NUMERALS.indexOf(m[2].toUpperCase()), shift, low, mark, seventh, inv, figure };
  }
  const expectedParts = (ch, inv) => ({
    deg: ch.deg, shift: ch.shift, low: LOWER.includes(ch.q), mark: MARK[ch.q] || '',
    seventh: isSeventh(ch.q), inv, figure: figureFor(isSeventh(ch.q), inv),
  });
  const sameFigured = (a, b) => !!a && a.deg === b.deg && a.shift === b.shift && a.low === b.low
    && a.mark === b.mark && a.seventh === b.seventh && a.inv === b.inv;
  // How Clefwork writes it: numeral plus figure, e.g. {numeral: 'V', figure: '65'}.
  const figuredText = (ch, inv) => romanOf(ch) + figureFor(isSeventh(ch.q), inv);

  // ---------- voicing ----------
  // Close position with the inversion's chord member in the bass, centred on the staff.
  function voiceFigured(ch, inv, clef, cfg) {
    const ledger = cfg && cfg.ledger != null ? cfg.ledger : 1;
    const loLimit = -1 - 2 * ledger, hiLimit = 9 + 2 * ledger;
    const tones = tonesOf(ch);
    const order = tones.slice(inv).concat(tones.slice(0, inv));
    const bottom = MQ.CLEFS[clef].bottom;
    const place = (p, min) => { let d = Math.floor((min - p.step) / 7) * 7 + p.step; if (d < min) d += 7; return fromDia(d, p.alt); };
    let best = null;
    for (let base = bottom - 6; base <= bottom + 10; base++) {
      let m = base;
      const v = order.map((p) => { const q = place(p, m); m = dia(q) + 1; return q; });
      if (dia(v[0]) !== base) continue;
      const lo = dia(v[0]) - bottom, hi = dia(v[v.length - 1]) - bottom;
      if (lo < loLimit || hi > hiLimit) continue;
      const score = Math.abs((lo + hi) / 2 - 4);
      if (!best || score < best.score) best = { v, score };
    }
    if (!best) { let m = bottom; best = { v: order.map((p) => { const q = place(p, m); m = dia(q) + 1; return q; }) }; }
    return best.v;
  }

  // ---------- questions ----------
  function pickKey(rng, cfg) {
    const max = Math.max(0, Math.min(7, cfg.figMax == null ? 4 : cfg.figMax));
    const mode = cfg.figKey === 2 ? 'minor' : cfg.figKey === 3 ? (rng() < 0.5 ? 'major' : 'minor') : 'major';
    const all = [];
    for (let f = -max; f <= max; f++) all.push(f);
    // Everyday keys come up far more often than remote ones.
    const fifths = MQ.spelledPick(cfg)
      ? MQ.pickSpelled(rng, all, (f) => (mode === 'minor' ? MQ.MINOR_KEYS : MQ.MAJOR_KEYS)[f + 7])
      : Math.floor(rng() * (2 * max + 1)) - max;
    return MQ.makeKey(mode, fifths, null, 'harmonic');
  }
  function pickChord(rng, cfg, kd) {
    const sizes = [];
    if (cfg.figSize & 1) sizes.push(false);
    if (cfg.figSize & 2) sizes.push(true);
    if (!sizes.length) sizes.push(false);
    const seventh = sizes[Math.floor(rng() * sizes.length)];
    const shifts = [0, 0, 0];
    if (cfg.figAlt & 1) shifts.push(-1);
    if (cfg.figAlt & 2) shifts.push(1);
    const shift = shifts[Math.floor(rng() * shifts.length)];
    const degs = shift < 0 ? FLAT_DEGREES : shift > 0 ? SHARP_DEGREES : [0, 1, 2, 3, 4, 5, 6];
    const deg = degs[Math.floor(rng() * degs.length)];
    const ch = chordAt(kd, deg, shift, seventh);
    const invs = [0, 1, 2, 3].filter((i) => (cfg.figPos || 1) & (1 << i)).filter((i) => i < (isSeventh(ch.q) ? 4 : 3));
    const inv = invs.length ? invs[Math.floor(rng() * invs.length)] : 0;
    return { ch, inv };
  }
  const keyText = (kd) => `${pcName({ ...kd.tonic, oct: 4 })} ${kd.mode}`;

  // The tab's staff setting wins over the quiz's clefs.
  function pickClef(rng, cfg, clefHint, which) {
    const ov = MQ.STAFF_NAMES[(cfg.staffOv && cfg.staffOv[which]) || 0];
    if (ov && ov !== 'quiz') return ov === 'grand' ? 'treble' : ov; // figured bass uses one staff
    const clefs = [];
    if ((cfg.figClefs || 3) & 1) clefs.push('treble');
    if ((cfg.figClefs || 3) & 2) clefs.push('bass');
    return clefs.length ? clefs[Math.floor(rng() * clefs.length)] : clefHint;
  }
  function figuredQuestion(rng, cfg, clefHint) {
    const clef = pickClef(rng, cfg, clefHint, 'figured');
    const kd = pickKey(rng, cfg);
    const { ch, inv } = pickChord(rng, cfg, kd);
    const tones = tonesOf(ch);
    if (!tones.every((p) => Math.abs(p.alt) <= 2)) return null;
    const notes = voiceFigured(ch, inv, clef, cfg);
    const ask = cfg.figAsk === 2 ? 'spell' : cfg.figAsk === 3 ? (rng() < 0.5 ? 'analyse' : 'spell') : 'analyse';
    const answer = { numeral: romanOf(ch), figure: figureFor(isSeventh(ch.q), inv) };
    const common = {
      clef, keySig: kd.fifths, keyAware: true, key: kd, figured: { ch, inv, ask, answer, parts: expectedParts(ch, inv) },
      sig: 'f' + keyText(kd) + answer.numeral + answer.figure + ask + clef,
    };
    if (ask === 'analyse') {
      return Object.assign({
        type: 'figured',
        text: `This chord is in ${keyText(kd)}. Write its Roman numeral with figured bass.`,
        hint: 'Type the numeral (V, vii°, ♭VI…) and choose the figure, or type them together such as V65.',
        columns: [{ given: notes, cap: 0 }],
        answer: [notes],
        tags: ['fdeg:' + ch.deg + inv, 'key:' + kd.fifths + kd.mode, 'pc:' + pcName({ ...ch.root, oct: 4 })],
      }, common);
    }
    // Spelling: the numeral is printed, the student writes the chord.
    const spec = MQ.nameSpec(ch.root, tones, { has9: false, has11: false, has13: false, altered: new Set() }, null);
    return Object.assign({
      type: 'figured', nameSpec: spec, revealPc: true, bassPc: pc(notes[0]),
      text: `Spell this chord in ${keyText(kd)}, with the right note in the bass.`,
      hint: 'Write every note of the chord. The figure tells you which note goes at the bottom.',
      columns: [{ given: [], cap: tones.length + 2 }],
      answer: [notes],
      tags: ['fdeg:' + ch.deg + inv, 'key:' + kd.fifths + kd.mode, 'pc:' + pcName({ ...ch.root, oct: 4 })],
    }, common);
  }

  // A progression of figured-bass chords, using the same root movement as chord progressions.
  // The figured bass progression tab has its own key, clefs, chord types and positions.
  const progSettings = (cfg) => ({
    figKey: cfg.figpKey == null ? cfg.figKey : cfg.figpKey,
    figMax: cfg.figpMax == null ? cfg.figMax : cfg.figpMax,
    figAlt: cfg.figpAlt == null ? cfg.figAlt : cfg.figpAlt,
    figSize: cfg.figpSize == null ? cfg.figSize : cfg.figpSize,
    figPos: cfg.figpPos == null ? cfg.figPos : cfg.figpPos,
    figClefs: cfg.figpClefs == null ? cfg.figClefs : cfg.figpClefs,
    figLen: cfg.figLen, figAsk: cfg.figpAsk == null ? 1 : cfg.figpAsk,
    ledger: cfg.ledger, accMode: cfg.accMode, flags: cfg.flags,
    staffOv: { chord: (cfg.staffOv && cfg.staffOv.figprog) || 0 },
  });
  function figProgQuestion(rng, outerCfg, clefHint) {
    const cfg = progSettings(outerCfg);
    const clef = pickClef(rng, cfg, clefHint, 'chord');
    const kd = pickKey(rng, cfg);
    const len = Math.max(3, Math.min(8, (cfg.figLen || 4)));
    const degrees = MQ.autoDegrees(rng, len, false);
    const chords = degrees.map((d) => {
      const seventh = (cfg.figSize & 2) && (!(cfg.figSize & 1) || rng() < 0.4);
      const ch = chordAt(kd, d - 1, 0, !!seventh);
      const invs = [0, 1, 2, 3].filter((i) => (cfg.figPos || 1) & (1 << i)).filter((i) => i < (isSeventh(ch.q) ? 4 : 3));
      const inv = invs.length ? invs[Math.floor(rng() * invs.length)] : 0;
      return { ch, inv };
    });
    if (!chords.every((c) => tonesOf(c.ch).every((p) => Math.abs(p.alt) <= 2))) return null;
    const ask = cfg.figAsk === 2 ? 'spell' : cfg.figAsk === 3 ? (rng() < 0.5 ? 'analyse' : 'spell') : 'analyse';
    if (ask === 'spell') {
      // The numerals and figures are printed; the students write each chord.
      const voiced = chords.map((c) => voiceFigured(c.ch, c.inv, clef, cfg));
      const colSpecs = voiced.map((notes, i) => ({
        spec: MQ.nameSpec(chords[i].ch.root, notes.map((p) => pc(p)), { has9: false, has11: false, has13: false, altered: new Set() }, null),
        bassPc: pc(notes[0]),
      }));
      return {
        type: 'figprog', clef, keySig: kd.fifths, keyAware: true, key: kd, revealPc: true,
        text: `Write each chord of this progression in ${keyText(kd)}. The Roman numerals and figures are printed.`,
        hint: 'Write every note of each chord, with the figure’s note at the bottom. Octave and order don’t matter.',
        columns: voiced.map((notes, i) => ({ given: [], cap: colSpecs[i].spec.required.length + 2 })),
        chordLabels: { bottom: chords.map((c) => figuredText(c.ch, c.inv)) },
        colSpecs,
        figuredList: chords.map((c) => ({ numeral: romanOf(c.ch), figure: figureFor(isSeventh(c.ch.q), c.inv), parts: expectedParts(c.ch, c.inv) })),
        answer: voiced,
        tags: chords.map((c) => 'fdeg:' + c.ch.deg + c.inv).concat(['key:' + kd.fifths + kd.mode]),
        sig: 'fps' + keyText(kd) + chords.map((c) => figuredText(c.ch, c.inv)).join(' '),
      };
    }
    return {
      type: 'figprog', clef, keySig: kd.fifths, keyAware: true, key: kd,
      text: `This progression is in ${keyText(kd)}. Write the Roman numeral and figured bass for each chord.`,
      hint: 'Type the numeral (V, vii°, ♭VI…) and choose the figure, or type them together such as V65.',
      columns: chords.map((c) => ({ given: voiceFigured(c.ch, c.inv, clef, cfg), cap: 0 })),
      tags: chords.map((c) => 'fdeg:' + c.ch.deg + c.inv).concat(['key:' + kd.fifths + kd.mode]),
      figuredList: chords.map((c) => ({ numeral: romanOf(c.ch), figure: figureFor(isSeventh(c.ch.q), c.inv), parts: expectedParts(c.ch, c.inv) })),
      answer: chords.map((c) => voiceFigured(c.ch, c.inv, clef, cfg)),
      sig: 'fp' + keyText(kd) + chords.map((c) => figuredText(c.ch, c.inv)).join(' '),
    };
  }

  // ---------- grading ----------
  // Analyse answers are {text, fig}; the typed text may already include the figure.
  const answerText = (a) => (a && typeof a === 'object' ? String(a.text || '') + (parseFigured(String(a.text || '')) && parseFigured(String(a.text || '')).figure ? '' : String(a.fig || '')) : String(a || ''));
  function markFiguredAnswer(expected, a) {
    return sameFigured(parseFigured(answerText(a)), expected);
  }
  function gradeFigured(q, resp, cfg) {
    if (q.colSpecs) return MQ.gradeProgSpell(q, resp, cfg);
    if (q.type === 'figprog') {
      const got = q.figuredList.filter((f, i) => markFiguredAnswer(f.parts, resp && resp[i])).length;
      return q.figuredList.length ? got / q.figuredList.length : 0;
    }
    if (q.figured.ask === 'analyse') return markFiguredAnswer(q.figured.parts, resp) ? 1 : 0;
    // Spelling: the right notes, with the figure's note at the bottom (shared with chord questions).
    return MQ.gradeSpelled(q, resp, cfg);
  }
  const markFigured = (q, placed, cfg) => MQ.markSpelled(q, placed, cfg);
  const hasFiguredAnswer = (q, resp) => {
    if (q.colSpecs) return !!resp && resp.some((c) => c && c.some(Boolean));
    if (q.type === 'figprog') return !!resp && resp.some((a) => answerText(a).trim());
    if (q.figured.ask === 'analyse') return !!answerText(resp).trim();
    return !!resp && resp.some((c) => c && c.some(Boolean));
  };
  function describeFigured(q) {
    if (q.colSpecs) return q.figuredList.map((f, i) => `${f.numeral}${f.figure}: ${q.answer[i].map(MQ.fullName).join(' ')}`).join(' · ');
    if (q.type === 'figprog') return q.figuredList.map((f) => f.numeral + f.figure).join('  ');
    if (q.figured.ask === 'analyse') return q.figured.answer.numeral + q.figured.answer.figure;
    return q.answer[0].map(MQ.fullName).join('  ');
  }

  Object.assign(MQ, {
    FIGURES, figureFor, POSITIONS, parseFigured, sameFigured, figuredText, romanFiguredOf: romanOf,
    figuredQuestion, figProgQuestion, gradeFigured, markFigured, hasFiguredAnswer, describeFigured, answerText,
  });
})(typeof window !== 'undefined' ? window : globalThis);
