// Typed answers, in every Clefwork section that takes them. Run with:  node tests/typed-answers.js
//
// Generates real questions (through the quiz code, as students get them) and grades
//   1. exactly what the app shows as the answer — it must always be right;
//   2. the common ways students type that answer (b and # for ♭ and ♯, m or - for mi, o for °,
//      ø for mi7♭5, 6/5 for 65 …) — they must be right too;
//   3. wrong answers, including confusable ones (B° for Bø7, sus2 for sus4) — they must stay wrong.
// No dependencies; exits non-zero when anything fails. A number after the command shows more examples.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

const R = {};
const sec = (name) => (R[name] = R[name] || { questions: 0, answers: 0, shown: [], variant: [], wrongOk: [], vChecked: 0, nChecked: 0 });
const note = (list, item) => { list.push(item); };
const ascii = (s) => String(s).replace(/♭/g, 'b').replace(/♯/g, '#');
const blank = () => { const c = MQ.defaultConfig(); Object.keys(c.counts).forEach((k) => (c.counts[k] = 0)); c.flags.shuffle = false; c.accMode = 3; return c; };
const quiz = (cfg) => { const d = MQ.decodeQuiz(MQ.encodeQuiz(cfg)); return { d, qs: MQ.generateQuiz(d) }; };
const right = (q, resp, cfg) => { try { return MQ.gradeQuestion(q, resp, cfg) === 1; } catch (e) { return 'ERROR ' + e.message; } };
const uniq = (list, base) => { const seen = new Set([base]); return list.filter(([, t]) => t && !seen.has(t) && seen.add(t)); };

// ---------- the ways students type things ----------
function symbolVariants(s) {
  const v = [['plain b and #', ascii(s)]];
  const swap = (label, re, to) => { if (re.test(s)) v.push([label, s.replace(re, to)]); };
  swap('m for mi', /mi(?!n)/, 'm'); swap('min for mi', /mi(?!n)/, 'min'); swap('- for mi', /mi(?!n)(?!7♭5)/, '-');
  swap('maj for ma', /ma(?=\d)/, 'maj'); swap('M for ma', /ma(?=\d)/, 'M'); swap('Δ for ma', /ma(?=\d)/, 'Δ');
  swap('dim7 for °7', /°7/, 'dim7'); swap('o7 for °7', /°7/, 'o7');
  swap('dim for °', /°(?!7)/, 'dim'); swap('o for °', /°(?!7)/, 'o');
  swap('ø7 for mi7♭5', /mi7♭5/, 'ø7'); swap('ø for mi7♭5', /mi7♭5/, 'ø'); swap('m7b5', /mi7♭5/, 'm7b5'); swap('-7b5', /mi7♭5/, '-7b5');
  swap('+ for aug', /aug/, '+'); swap('sus for sus4', /sus4/, 'sus');
  swap('no brackets', /[()]/g, '');
  v.slice().forEach(([l, t]) => v.push([l + ', plain b/#', ascii(t)]));
  return uniq(v, s);
}
function romanVariants(s) {
  const v = [['plain b and #', ascii(s)]];
  const swap = (label, re, to) => { if (re.test(s)) v.push([label, s.replace(re, to)]); };
  swap('o for °', /°/, 'o'); swap('/o for ø', /ø/, '/o');
  swap('slash figures', /(\d)(\d)(?=$|\/)/, '$1/$2'); swap('2 for 42', /42(?=$|\/)/, '2');
  swap('space before figures', /^([^\d/]*?[IViv°øo+]+)(?=\d)/, '$1 ');
  swap('maj7 for ma7', /ma7/, 'maj7'); swap('M7 for ma7', /ma7/, 'M7'); swap('Δ7 for ma7', /ma7/, 'Δ7');
  v.slice().forEach(([l, t]) => v.push([l + ', plain b/#', ascii(t)]));
  return uniq(v, s);
}
function noteVariants(s) {
  const m = s.match(/^([A-G])([♯♭]*)(-?\d)$/);
  const v = [['plain b and #', ascii(s)]];
  if (m) {
    v.push(['lowercase letter', m[1].toLowerCase() + ascii(m[2]) + m[3]]);
    v.push(['space before octave', m[1] + ascii(m[2]) + ' ' + m[3]]);
    if (m[2]) v.push(['space after letter', m[1] + ' ' + m[2] + m[3]]);
  }
  return uniq(v, s);
}
// Wrong answers: the root a step up, or the next numeral.
const LET = 'CDEFGAB';
const wrongSymbol = (s) => s.replace(/^[A-G]/, (c) => LET[(LET.indexOf(c) + 1) % 7]);
const NUMS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
function wrongRoman(s) {
  const m = s.match(/^([♭♯b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (!m) return null;
  const low = m[2] === m[2].toLowerCase(), n = NUMS[(NUMS.indexOf(m[2].toUpperCase()) + 1) % 7];
  return m[1] + (low ? n.toLowerCase() : n) + m[3];
}
const wrongNote = (s) => s.replace(/(-?\d)$/, (d) => String(+d + 1));

// ---------- one question: shown answer, its variants, a wrong one ----------
// build(text) → the response with that text in the slot being tested (others left right).
function check(name, q, cfg, shown, build, variants, wrong, where) {
  const S = sec(name);
  S.answers++;
  const ok = right(q, build(shown), cfg);
  if (ok !== true) { note(S.shown, `${where}: shown "${shown}" → ${ok === false ? 'marked wrong' : ok}`); return; }
  variants(shown).forEach(([label, t]) => {
    S.vChecked++;
    const r = right(q, build(t), cfg);
    if (r !== true) note(S.variant, `${label}: "${t}" (answer shown as "${shown}")`);
  });
  const w = wrong && wrong(shown);
  if (w && w !== shown) { S.nChecked++; if (right(q, build(w), cfg) === true) note(S.wrongOk, `"${w}" accepted for "${shown}"`); }
}

// ---------- Build a Chord: name the chord ----------
for (let seed = 1; seed <= 60; seed++) {
  const c = blank(); c.seed = seed * 7919;
  Object.assign(c, { chordAsk: 2, chordQual: 0b11111, chordSize: 0b111111, chordAlt: 3, chordStaff: 7, inversions: 15 });
  c.counts.chord = 20;
  const { d, qs } = quiz(c);
  qs.filter((q) => q.symbolAnswer).forEach((q, i) => {
    sec('Build a Chord — chord symbols').questions++;
    check('Build a Chord — chord symbols', q, d, q.symbolAnswer.shown, (t) => t, symbolVariants, wrongSymbol, `seed ${seed} q${i}`);
  });
}

// ---------- Voicings: name the voiced chord, and every chord of a voiced progression ----------
const TECH = { thirds: 3, chorale: 3, block: 3, drop2: 3, drop24: 3, planes: 3, pophorn: 3, inner7: 3 };
for (let seed = 1; seed <= 30; seed++) {
  const c = blank(); c.seed = seed * 104729;
  c.vc = { sizes: 7, quals: 31, alts: 1, key: 0, slash: 1, ask: 2, tech: Object.assign({}, TECH), opts: { thirdsStaff: 0, thirdsOmitRoot: 0, blockStaff: 0, planesOpen: 0, popNotes: 3, popStaff: 0, inner2: 0 } };
  c.vp = { sizes: 7, quals: 31, alts: 1, key: 0, slash: 1, ask: 2, len: 4, tech: { thirds: 2, chorale: 2, drop2: 2, block: 2 }, opts: { thirdsStaff: 0, thirdsOmitRoot: 0, blockStaff: 0, planesOpen: 0, popNotes: 3, popStaff: 0, inner2: 0 } };
  const { d, qs } = quiz(c);
  qs.forEach((q, i) => {
    if (q.type === 'voicing' && q.symbolAnswer) {
      sec('Voicings — name the chord').questions++;
      check('Voicings — name the chord', q, d, q.symbolAnswer.shown, (t) => t, symbolVariants, wrongSymbol, `seed ${seed} q${i}`);
    }
    if (q.type === 'vprog' && q.symbolAnswers) {
      sec('Voiced progressions — name each chord').questions++;
      const all = q.symbolAnswers.map((a) => a.shown);
      all.forEach((shown, k) => check('Voiced progressions — name each chord', q, d, shown, (t) => all.map((x, j) => (j === k ? t : x)), symbolVariants, wrongSymbol, `seed ${seed} q${i} chord ${k + 1}`));
    }
  });
}

// ---------- Chord progressions: Roman numerals and chord symbols ----------
const KEYS = [['major', 0], ['major', -3], ['major', 4], ['minor', 0], ['minor', -2], ['minor', 3], ['major', -6], ['minor', 5]];
for (let seed = 1; seed <= 25; seed++) {
  const c = blank(); c.seed = seed * 31337;
  c.progMode = 2;
  c.progs = KEYS.map(([mode, f], k) => ({ kind: 'auto', staff: 'grand', key: MQ.makeKey(mode, f, null, k % 2 ? 'melodic' : 'harmonic'), voicing: 'closed', len: 4 + (k % 5), sevenths: k % 3, deceptive: !!(k % 2), qcount: 2 }));
  c.counts.progression = 16;
  const { d, qs } = quiz(c);
  qs.filter((q) => q.type === 'progression' && q.prog && !q.colSpecs).forEach((q, i) => {
    sec('Chord progressions — Roman numerals').questions++;
    sec('Chord progressions — chord symbols').questions++;
    const P = q.prog, both = { r: P.romans.slice(), s: P.symbols.slice() };
    P.romans.forEach((shown, k) => check('Chord progressions — Roman numerals', q, d, shown, (t) => ({ r: both.r.map((x, j) => (j === k ? t : x)), s: both.s }), romanVariants, wrongRoman, `seed ${seed} q${i} ${MQ.keyLabel(P.key)} chord ${k + 1}`));
    P.symbols.forEach((shown, k) => check('Chord progressions — chord symbols', q, d, shown, (t) => ({ r: both.r, s: both.s.map((x, j) => (j === k ? t : x)) }), symbolVariants, wrongSymbol, `seed ${seed} q${i} chord ${k + 1}`));
  });
}

// ---------- Figured bass: one chord, and a progression ----------
for (let seed = 1; seed <= 40; seed++) {
  const c = blank(); c.seed = seed * 6007;
  Object.assign(c, { figAsk: 1, figKey: 3, figMax: 7, figAlt: 3, figSize: 3, figPos: 15, figClefs: 3, figpAsk: 1, figpKey: 3, figpMax: 7, figpAlt: 0, figpSize: 3, figpPos: 15, figpClefs: 3, figLen: 5 });
  c.counts.figured = 15; c.counts.figprog = 4;
  const { d, qs } = quiz(c);
  qs.forEach((q, i) => {
    if (q.type === 'figured' && q.figured.ask === 'analyse') {
      sec('Figured bass — one chord').questions++;
      const a = q.figured.answer, shown = a.numeral + a.figure;
      // typed all in the box …
      check('Figured bass — one chord', q, d, shown, (t) => ({ text: t, fig: '' }), romanVariants, wrongRoman, `seed ${seed} q${i}`);
      // … or the numeral typed and the figure chosen from the menu
      const S = sec('Figured bass — one chord');
      S.vChecked++;
      if (right(q, { text: a.numeral, fig: a.figure }, d) !== true) note(S.variant, `numeral "${a.numeral}" + menu "${a.figure}"`);
      if (a.figure) { S.vChecked++; if (right(q, { text: ascii(a.numeral), fig: a.figure }, d) !== true) note(S.variant, `numeral "${ascii(a.numeral)}" + menu "${a.figure}"`); }
    }
    if (q.type === 'figprog' && !q.colSpecs) {
      sec('Figured bass — progression').questions++;
      const all = q.figuredList.map((f) => f.numeral + f.figure);
      all.forEach((shown, k) => check('Figured bass — progression', q, d, shown, (t) => all.map((x, j) => ({ text: j === k ? t : x, fig: '' })), romanVariants, wrongRoman, `seed ${seed} q${i} chord ${k + 1}`));
    }
  });
}

// ---------- Clefwork Keys: type the note's name ----------
for (let seed = 1; seed <= 40; seed++) {
  const c = blank(); c.seed = seed * 911;
  c.keys = { prompts: 0b111, answers: 0b010, low: 36, high: 84 };
  c.counts.keys = 30;
  const { d, qs } = quiz(c);
  qs.filter((q) => q.type === 'keys' && q.keys.answer === 'name').forEach((q, i) => {
    sec('Keys — note names').questions++;
    MQ.describeKeys(q).split(' or ').forEach((shown) => check('Keys — note names', q, d, shown, (t) => t, noteVariants, wrongNote, `seed ${seed} q${i} (${q.keys.prompt})`));
  });
}

// ---------- Clefwork Chord Graph: the tables ----------
const GRAPHS = [{ sevenths: 0, minor: 1, findMinor: 0, romans: 1 }, { sevenths: 1, minor: 1, findMinor: 1, romans: 1 }, { sevenths: 0, minor: 0, romans: 0 }, { sevenths: 1, minor: 1, findMinor: 1, romans: 0, subs: 1 }];
GRAPHS.forEach((g, gi) => {
  for (let seed = 1; seed <= 12; seed++) {
    const c = blank(); c.seed = seed * 2741 + gi;
    c.graph = Object.assign(MQ.graphSettings({}), g, { keys: 4095 });
    c.counts.cgtable = 2; c.counts.cgtritone = 1;
    const { d, qs } = quiz(c);
    qs.filter((q) => q.cg && q.cg.slots).forEach((q, i) => {
      const name = q.type === 'cgtritone' ? 'Chord Graph — tritone substitution tables' : 'Chord Graph — diatonic tables';
      sec(name).questions++;
      const all = q.cg.slots.map((s) => s.shown);
      q.cg.slots.forEach((slot, k) => {
        const vars = slot.kind === 'rn' ? romanVariants : symbolVariants;
        const wrong = slot.kind === 'rn' ? wrongRoman : wrongSymbol;
        check(name, q, d, slot.shown, (t) => all.map((x, j) => (j === k ? t : x)), vars, wrong, `graph ${gi} seed ${seed} q${i} ${slot.kind} "${slot.label || ''}"`);
      });
    });
  }
});

// ---------- Clefwork Analysis: the answers teachers commonly write ----------
const AN_ROMAN = ['I', 'i', 'V', 'V7', 'V65', 'V6/5', 'V43', 'V42', 'V2', 'V64', 'I64', 'I6', 'ii6', 'ii65', 'iiø7', 'iiø65', 'vii°', 'vii°6', 'vii°7', 'viiø7', 'viio7', 'vii/o7', 'IV', 'iv6', 'bVI', '♭VII', 'N6', 'It+6', 'Fr+6', 'Ger+6', 'V7/V', 'V65/V', 'vii°7/V', 'V/IV', 'IVma7', 'IM7', 'Cad64', 'III+'];
const AN_SYM = ['C', 'Cmi', 'Cm', 'C-', 'Cma7', 'Cmaj7', 'CΔ7', 'C7', 'Cmi7', 'Cm7', 'C°', 'Cdim', 'C°7', 'Cdim7', 'Cø7', 'Cmi7♭5', 'Cm7b5', 'Caug', 'C+', 'Csus4', 'Csus', 'C7sus4', 'C/E', 'G7/B', 'F♯mi7', 'B♭ma7', 'E♭7(♭9)', 'G7b9', 'Cmi(ma7)', 'C6', 'Cmi6', 'C9', 'Cmi9', 'C13'];
const anBox = (roman, symbol, ask) => ({ x: 0.1, y: 0.2, w: 0.05, h: 0.4, ask, roman, symbol, link: 0 });
function analysisCheck(list, part) {
  const name = part === 'r' ? 'Analysis — Roman numerals' : 'Analysis — chord symbols';
  list.forEach((ans) => {
    const c = blank();
    c.analysis = MQ.analysisSettings({ regions: [anBox(part === 'r' ? ans : '', part === 's' ? ans : '', part === 'r' ? 'roman' : 'symbol')], img: { hash: 1 } });
    c.counts.analysis = 1;
    const q = MQ.analysisQuestions(c)[0];
    sec(name).questions++;
    const shown = part === 'r' ? MQ.romanAnswerText(q) : MQ.symbolAnswerText(q);
    check(name, q, c, shown, (t) => ({ [part]: t }), part === 'r' ? romanVariants : symbolVariants, part === 'r' ? wrongRoman : wrongSymbol, `teacher wrote "${ans}"`);
  });
}
analysisCheck(AN_ROMAN, 'r');
analysisCheck(AN_SYM, 's');

// ---------- report ----------
const MAX = +(process.argv[2] || 6);
let problems = 0;
Object.entries(R).forEach(([name, S]) => {
  const bad = S.shown.length + S.variant.length + S.wrongOk.length;
  problems += bad;
  console.log(`\n${bad ? '✗' : '✓'} ${name}: ${S.questions} questions, ${S.answers} answers shown, ${S.vChecked} other spellings, ${S.nChecked} wrong answers`);
  const show = (label, list) => {
    if (!list.length) return;
    const counts = {};
    list.forEach((x) => { const k = x.replace(/".*?"/g, '…'); counts[k] = (counts[k] || 0) + 1; });
    console.log(`   ${label} (${list.length}):`);
    list.filter((x, i, a) => a.findIndex((y) => y.replace(/".*?"/g, '…') === x.replace(/".*?"/g, '…')) === i).slice(0, MAX)
      .forEach((x) => console.log('     - ' + x + (counts[x.replace(/".*?"/g, '…')] > 1 ? `   (×${counts[x.replace(/".*?"/g, '…')]})` : '')));
  };
  show('the shown answer marked wrong', S.shown);
  show('a common spelling marked wrong', S.variant);
  show('a wrong answer marked right', S.wrongOk);
});
// ---------- confusable answers: near misses a lenient reader could let through ----------
{
const cfg = { flags: { enharmonic: false } };
// [answer, typed] pairs that must be marked WRONG
const SYM = [['B°', 'Bø'], ['B°', 'Bø7'], ['B°7', 'Bø7'], ['B°7', 'Bø'], ['Cmi', 'Co'], ['C°', 'Cmi'], ['C7', 'Cma7'], ['Cma7', 'C7'], ['C7', 'C'], ['C', 'C7'],
  ['C7(♯5)', 'C7'], ['C7', 'C7(♯5)'], ['Caug', 'C'], ['Csus4', 'Csus2'], ['Csus4', 'C'], ['C6', 'Cmi6'], ['C9', 'C7'], ['Cmi7', 'Cmi(ma7)'], ['C/E', 'C/G'], ['G7/B', 'G7/D'],
  ['Cmi7♭5', 'Cmi7'], ['Cmi7♭5', 'C°7'], ['E♭', 'D♯'], ['B♭7', 'A♯7']];
// Build a Chord, voicings and analysis all mark chord symbols
const buildChord = (ans) => { const m = ans.match(/^(.*?)(?:\/([A-G][♯♭]?))?$/); return { type: 'chord', symbolAnswer: { q: m[1], bass: m[2] ? { step: 'CDEFGAB'.indexOf(m[2][0]), alt: /♯/.test(m[2]) ? 1 : /♭/.test(m[2]) ? -1 : 0 } : null, shown: ans } }; };
let bad = 0;
SYM.forEach(([a, t]) => {
  const bc = MQ.gradeChordSymbol(buildChord(a), t, cfg), vc = MQ.gradeVoiceSymbol(a, t, cfg);
  if (bc === 1 || vc === 1) { bad++; console.log(`✗ chord symbol "${t}" accepted for "${a}" —`, bc === 1 ? 'Build a Chord' : '', vc === 1 ? 'voicings/analysis' : ''); }
});
const RN = [['vii°7', 'viiø7'], ['viiø7', 'vii°7'], ['vii°7', 'vii/o7'], ['vii°', 'vii°7'], ['V7', 'V'], ['V65', 'V43'], ['V64', 'V6'], ['ii', 'II'], ['iv', 'IV'], ['V7/V', 'V7'], ['N6', 'bII'], ['It+6', 'Ger+6']];
RN.forEach(([a, t]) => {
  const an = MQ.sameRoman(MQ.parseAnalysisRoman(a), MQ.parseAnalysisRoman(t));
  const fp = MQ.parseFigured(a), ft = MQ.parseFigured(t);
  const fig = !!fp && MQ.sameFigured(ft, fp);
  if (an || fig) { bad++; console.log(`✗ Roman numeral "${t}" accepted for "${a}" —`, an ? 'analysis' : '', fig ? 'figured bass' : ''); }
});
// and the right ones still right
const OK = [['Bø7', 'Bmi7♭5'], ['Bø7', 'Bø'], ['B°7', 'Bo7'], ['B°', 'Bo'], ['B°', 'Bdim'], ['Cma7', 'CΔ7'], ['Cmi', 'C-'], ['Caug', 'C+'], ['Csus4', 'Csus']];
OK.forEach(([a, t]) => { if (MQ.gradeVoiceSymbol(a, t, cfg) !== 1 || MQ.gradeChordSymbol(buildChord(a), t, cfg) !== 1) { bad++; console.log(`✗ "${t}" should be right for "${a}"`, MQ.gradeVoiceSymbol(a, t, cfg), MQ.gradeChordSymbol(buildChord(a), t, cfg)); } });
console.log(`\n${bad ? '✗' : '✓'} Confusable answers: ${SYM.length + RN.length} pairs that must be wrong, ${OK.length} spellings that must be right` + (bad ? ` — ${bad} problem(s) above` : ''));
problems += bad;
}
console.log(`\n${problems} problem${problems === 1 ? '' : 's'} in all`);
process.exitCode = problems ? 1 : 0;
