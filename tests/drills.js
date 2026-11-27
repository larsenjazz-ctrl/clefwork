// Clefwork Drills: every kind makes its questions, the answer key grades as right, typed answers are
// read the ways students type them, quiz codes keep the drills (alongside the blocks before them), and
// report codes keep the answers. Also the intervals, chromatic scale and alto clef added with them.
// Run with:  node tests/drills.js   No dependencies; exits non-zero on any failure.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'blockchords', 'cadences', 'partwriting', 'nht', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'chorale', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'drills', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

let fails = 0, passes = 0;
const ok = (cond, label, extra) => { if (cond) passes++; else { fails++; console.log('✗ ' + label + (extra ? '\n    ' + extra : '')); } };
let seeds = 1;
const blank = () => { const c = MQ.defaultConfig(); Object.keys(c.counts).forEach((k) => (c.counts[k] = 0)); c.flags.shuffle = false; c.seed = 1000 + 7919 * seeds++; return c; };
const texts = (qs) => JSON.stringify(qs.map((q) => [q.text, q.dropdowns, q.choices, q.texts, q.columns]));
const P = (step, alt) => ({ step, alt, oct: 4 });

// The right answer to a question, as a student would enter it.
function keyOf(q) {
  if (q.texts) {
    return q.texts.map((f) => {
      if (f.mode === 'note') return MQ.pcName(P(f.pcs[0][0], f.pcs[0][1]));
      if (f.mode === 'notes') return f.seq.map((x) => MQ.pcName(P(x[0], x[1]))).join(' ');
      if (f.mode === 'num') return String(f.n);
      if (f.mode === 'nums') return f.ns.join(' ');
      if (f.mode === 'sym') return f.sym;
      if (f.mode === 'rn' || f.mode === 'word') return f.accept[0];
      return (f.accept && f.accept[0]) || 'Any answer at all';
    });
  }
  if (q.dropdowns) return q.dropdowns.map((d) => d.answer);
  return q.answer;
}

// ---------- every kind ----------
const all = blank();
all.seed = 4242;
MQ.DRILL_KINDS.forEach((k) => (all.counts[k.id] = 6));
all.drill = { written: [{ p: 'What is a cadence?', a: '' }, { p: 'Name the tonic of G major.', a: 'G | G major' }] };
const qs = MQ.generateQuiz(all);
MQ.DRILL_KINDS.forEach((k) => {
  const mine = qs.filter((q) => q.dr && q.dr.kind === k.id);
  ok(mine.length === (k.written ? 2 : 6), `${k.label}: makes every question it is asked for`, `got ${mine.length}`);
  mine.forEach((q) => {
    ok(q.type === 'drill' && !!q.text, `${k.label}: a drill question with its text`);
    ok(!!(q.texts || q.dropdowns || q.choices), `${k.label}: something to answer with`);
    if (q.dropdowns) ok(q.dropdowns.every((d) => d.answer >= 0 && d.answer < d.options.length), `${k.label}: every menu holds its answer`, q.text);
    if (q.choices) ok(q.answer >= 0 && new Set(q.choices).size === q.choices.length, `${k.label}: the answer is one of the choices, none twice`, q.text);
    ok(MQ.gradeQuestion(q, keyOf(q), all) === 1, `${k.label}: the answer key is right`, q.text + ' → ' + JSON.stringify(keyOf(q)));
    ok(MQ.hasAnswer(q, keyOf(q)) && !!MQ.describeAnswer(q, all), `${k.label}: answered, with an answer key`);
    ok(!MQ.hasAnswer(q, q.texts ? q.texts.map(() => '') : q.dropdowns ? q.dropdowns.map(() => null) : null), `${k.label}: blank counts as unanswered`);
  });
});
// The kinds a staff is printed for draw notes on it.
qs.filter((q) => q.columns).forEach((q) => ok(q.columns.every((c) => c.given.length && c.given.every((p) => p.step >= 0 && p.oct > 0)), `${MQ.drillLabel(q)}: printed notes`));
ok(qs.some((q) => q.clef === 'alto'), 'the alto clef drill prints on the alto clef');
ok(MQ.generateQuiz(all).length === qs.length && texts(MQ.generateQuiz(all)) === texts(qs), 'the same seed makes the same questions');
const other = Object.assign({}, all, { seed: 99 });
ok(texts(MQ.generateQuiz(other)) !== texts(qs), 'another seed makes other questions');

// ---------- typed answers ----------
const note = (name, list) => ({ mode: 'note', pcs: list });
const R = MQ.textRight;
ok(R(note('', [[3, 1]]), 'F#') && R(note('', [[3, 1]]), 'f♯') && R(note('', [[3, 1]]), ' F# '), 'a note name: # or ♯, any case');
ok(!R(note('', [[3, 1]]), 'Gb') && !R(note('', [[3, 1]]), 'F'), 'a note name: the wrong spelling is wrong');
ok(R(note('', [[6, -1]]), 'Bb') && R(note('', [[6, -1]]), 'bb') && !R(note('', [[6, -1]]), 'b'), 'B flat as Bb or bb, and b alone is B');
ok(R(note('', [[3, 2]]), 'Fx') && R(note('', [[3, 2]]), 'F##') && R(note('', [[6, -2]]), 'Bbb'), 'double sharps and flats');
const scale = { mode: 'notes', seq: [[2, -1], [3, 0], [4, 0], [5, -1], [6, -1], [0, 0], [1, 0], [2, -1]] };
ok(R(scale, 'Eb F G Ab Bb C D Eb') && R(scale, 'E♭, F, G, A♭, B♭, C, D, E♭') && R(scale, 'Eb-F-G-Ab-Bb-C-D-Eb'), 'a scale: spaces, commas or dashes');
ok(R(scale, 'EbFGAbBbCDEb'), 'a scale: letters run together');
ok(!R(scale, 'Eb F G Ab Bb C D') && !R(scale, 'Eb F G A Bb C D Eb'), 'a scale: a note left out or wrong');
const chord = { mode: 'notes', seq: [[0, 0], [2, 0], [4, 0]], order: false };
ok(R(chord, 'C E G') && R(chord, 'E G C') && !R(chord, 'C E G B'), 'a chord: any order, but every note and no more');
ok(R({ mode: 'num', n: 0.5, tol: 0.01 }, '.5') && R({ mode: 'num', n: 0.5, tol: 0.01 }, '0,5') && !R({ mode: 'num', n: 4 }, '5'), 'numbers');
ok(R({ mode: 'nums', ns: [1, 2, 3, 4, 1, 2, 5] }, '1-4, 1-2, 5') && R({ mode: 'nums', ns: [1, 2, 3, 4, 1, 2, 5] }, '1 2 3 4 1 2 5'), 'measure numbers, with ranges');
ok(R({ mode: 'sym', sym: 'Dmi7' }, 'Dm7') && R({ mode: 'sym', sym: 'Dmi7' }, 'D-7') && !R({ mode: 'sym', sym: 'Dmi7' }, 'D7'), 'chord symbols, any spelling of the quality');
ok(R({ mode: 'rn', accept: ['viiø7'] }, 'vii/o7') && R({ mode: 'rn', accept: ['Ima7'] }, 'Imaj7') && R({ mode: 'rn', accept: ['♭VII'] }, 'bVII') && !R({ mode: 'rn', accept: ['ii7'] }, 'II7'), 'Roman numerals');
ok(R({ mode: 'open', accept: [] }, 'anything') && !R({ mode: 'open', accept: [] }, '  '), 'a written answer with no key: any answer');
ok(R({ mode: 'open', accept: ['G'] }, 'It is G major') && !R({ mode: 'open', accept: ['G major'] }, 'D major'), 'a written answer with a key');

// ---------- quiz codes ----------
const same = (label, cfg) => {
  let back = null, err = null;
  try { back = MQ.decodeQuiz(MQ.encodeQuiz(cfg)); } catch (e) { err = e.message; }
  ok(!!back, `${label}: the code reads back`, err);
  if (back) ok(texts(MQ.generateQuiz(back)) === texts(MQ.generateQuiz(cfg)), `${label}: the same questions`);
  return back;
};
const one = blank();
one.counts.drsolf = 4;
one.drill = { drsolf: { chrom: 1, max: 6 } };
const back = same('a drill with its own settings', one);
ok(back && back.drill.drsolf.chrom === 1 && back.drill.drsolf.max === 6, 'the settings come back');
same('every kind', all);
// With each of the blocks that come before it in a quiz code.
[['students see their answers', (c) => (c.flags.answers = true)], ['a draw of questions', (c) => (c.pick = 3)],
  ['intervals to name', (c) => { c.counts.interval = 2; c.intervalAsk = 2; }], ['a retake limit', (c) => (c.retakes = 2)],
  ['Clefwork Terms', (c) => (c.counts.tmdyn = 2)], ['all of those', (c) => { c.flags.answers = true; c.pick = 5; c.counts.interval = 2; c.intervalAsk = 3; c.retakes = 1; c.counts.tmtempo = 2; }],
].forEach(([label, f]) => { const c = blank(); c.counts.drtempo = 2; c.counts.drvl = 2; f(c); const b = same('drills and ' + label, c); if (b) ok(b.pick === c.pick && !!b.flags.answers === !!c.flags.answers, `drills and ${label}: those settings come back`); });
// A quiz with no drills writes no drill block, so its code is what it always was.
const plain = blank();
plain.counts.place = 3;
ok(!/"c"/.test(MQ.encodeQuiz(plain)) && MQ.decodeQuiz(MQ.encodeQuiz(plain)).drill == null, 'no drills, no drill block');

// ---------- report codes ----------
const quiz = blank();
['dralto', 'drcons', 'drspellsc', 'drcad', 'drwrite'].forEach((k) => (quiz.counts[k] = 2));
quiz.drill = { written: [{ p: 'Why?', a: '' }, { p: 'What?', a: 'this' }] };
const code = MQ.encodeQuiz(quiz), rq = MQ.generateQuiz(MQ.decodeQuiz(code));
const resp = rq.map((q, i) => (i % 3 === 2 ? null : keyOf(q)));
const items = rq.map((q, i) => ({ type: q.type, clef: q.clef, credit: Math.round(MQ.gradeQuestion(q, resp[i], quiz) * 7), answered: MQ.hasAnswer(q, resp[i]), sec: 5 }));
const rep = MQ.decodeReport(MQ.encodeReport({ name: 'Sam', submittedAt: Date.now(), totalSec: 100, partial: true, items, answers: { qs: rq, resp } }, quiz, code));
ok(rep.items.length === rq.length && rep.items.every((it) => it.type === 'drill'), 'a report keeps every drill');
ok(rep.items.filter((it) => it.clef === 'alto').length === 2, 'a report keeps the alto clef');
rq.forEach((q, i) => {
  const got = MQ.answerFor ? MQ.answerFor(q, rep.answers[i]) : rep.answers[i].value;
  ok(JSON.stringify(got) === JSON.stringify(resp[i] == null ? (q.texts ? q.texts.map(() => '') : q.dropdowns ? q.dropdowns.map(() => null) : null) : resp[i]),
    `report answer ${i + 1} (${MQ.drillLabel(q)}) comes back`, JSON.stringify([got, resp[i]]));
});

// ---------- intervals, the chromatic scale and the alto clef ----------
const iv = blank();
iv.counts.interval = 12;
iv.intervals = MQ.maskOf(MQ.INTERVALS, ['A1', 'A2', 'd3', 'd4', 'A5', 'd6', 'A6', 'd7']);
const ivBack = same('the new intervals', iv);
ok(ivBack && ivBack.intervals === iv.intervals, 'the new intervals come back');
const ivq = MQ.generateQuiz(iv);
ok(ivq.length === 12 && ivq.every((q) => /augmented|diminished/.test(q.text)), 'interval questions use only the chosen intervals', ivq.map((q) => q.text).join(' / '));
ivq.forEach((q) => {
  const [a, b] = [q.columns[0].given[0], q.answer[1][0]];
  const ivl = MQ.INTERVALS.find((x) => q.text.includes(x.name));
  ok(Math.abs(MQ.midi(b) - MQ.midi(a)) === ivl.s, `${ivl.name}: the right number of half steps`);
});
const sc = blank();
sc.counts.scale = 3;
sc.scales = MQ.maskOf(MQ.SCALES, ['chromatic']);
const scBack = same('the chromatic scale', sc);
ok(scBack && scBack.scales === sc.scales, 'the chromatic scale comes back');
MQ.generateQuiz(sc).forEach((q) => {
  const notes = q.answer.map((c) => c[0] || q.columns[0].given[0]);
  ok(notes.length === 13 && notes.every((p, i) => !i || MQ.midi(p) - MQ.midi(notes[i - 1]) === 1), 'a chromatic scale climbs by half steps, 13 notes', q.text);
  ok(notes.every((p, i) => !i || p.step !== notes[i - 1].step || p.alt === notes[i - 1].alt + 1), 'a chromatic scale goes up by raising notes (sharps), not lowering them', q.text);
});
ok(MQ.CLEFS.alto.bottom === 24 && MQ.clefLabel('alto') === 'Alto clef', 'the alto clef: F3 on its bottom line');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
