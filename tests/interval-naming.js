// Naming intervals: the Intervals tab can print an interval (its two notes stacked) for students to
// name by quality and size. Run with:  node tests/interval-naming.js
// No dependencies; exits non-zero on any failure.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'blockchords', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

let fails = 0, passes = 0;
const ok = (cond, label, extra) => { if (cond) passes++; else { fails++; console.log('✗ ' + label + (extra ? '\n    ' + extra : '')); } };
const intervalsOnly = (ask, more) => {
  const c = MQ.defaultConfig();
  Object.keys(c.counts).forEach((k) => (c.counts[k] = 0));
  c.flags.shuffle = false;
  c.counts.interval = 12;
  c.intervals = (1 << MQ.INTERVALS.length) - 1;           // every interval, compound ones too
  c.intervalAsk = ask;
  return Object.assign(c, more || {});
};
const round = (c) => MQ.decodeQuiz(MQ.encodeQuiz(c));

// The setting travels in the quiz code, alone and beside the other things that write to its end.
[[2, 'alone'], [3, 'a mix']].forEach(([ask, what]) => ok(round(intervalsOnly(ask)).intervalAsk === ask, `quiz code: ${what}`));
const lim = round(intervalsOnly(2, { retakes: 3 }));
ok(lim.intervalAsk === 2 && lim.retakes === 3, 'quiz code: with a retake limit', JSON.stringify([lim.intervalAsk, lim.retakes]));
const deg = intervalsOnly(2);
deg.counts.degree = 2;
deg.deg = MQ.degreeSettings({});
const degBack = round(deg);
ok(degBack.intervalAsk === 2 && degBack.counts.degree === 2, 'quiz code: with scale degrees', JSON.stringify([degBack.intervalAsk, degBack.counts.degree]));
ok(MQ.generateQuiz(degBack).length === MQ.generateQuiz(deg).length, 'quiz code: the same questions with scale degrees');
// Writing intervals, as before: the code doesn't change.
const write = intervalsOnly(1);
ok(MQ.encodeQuiz(write) === MQ.encodeQuiz(Object.assign({}, write, { intervalAsk: undefined })), 'writing intervals keeps the code it always had');
ok(!round(write).intervalAsk || round(write).intervalAsk === 1, 'and reads back as writing');

// The questions.
const cfg = round(intervalsOnly(2));
const qs = MQ.generateQuiz(cfg);
ok(qs.length === 12 && qs.every((q) => q.type === 'ivname'), 'every question names an interval', qs.map((q) => q.type).join(','));
ok(qs.every((q) => q.columns.length === 1 && q.columns[0].given.length === 2 && q.columns[0].cap === 0), 'two printed notes in one column, nothing to write');
ok(qs.every((q) => MQ.midi(q.columns[0].given[0]) < MQ.midi(q.columns[0].given[1])), 'the lower note first');
ok(qs.every((q) => q.dropdowns[0].options.length === 5 && q.dropdowns[1].options.length === 13), 'every quality and every size in the menus');
// Each question's notes really are the interval it says.
const span = (q) => { const [a, b] = q.columns[0].given; return { n: MQ.dia(b) - MQ.dia(a) + 1, s: MQ.midi(b) - MQ.midi(a) }; };
ok(qs.every((q) => { const iv = MQ.INTERVALS.find((x) => x.name === q.ivName); const sp = span(q); return iv && iv.n === sp.n && iv.s === sp.s; }), 'the notes make the interval in the answer',
  qs.map((q) => `${q.ivName}: ${q.columns[0].given.map(MQ.fullName).join('–')}`).join('; '));
const mix = MQ.generateQuiz(round(intervalsOnly(3)));
ok(mix.some((q) => q.type === 'ivname') && mix.some((q) => q.type === 'interval'), 'a mix asks both ways', mix.map((q) => q.type).join(','));

// Marking.
const q = qs[0], right = q.dropdowns.map((d) => d.answer);
const wrongQ = [(right[0] + 1) % 5, right[1]], wrongS = [right[0], (right[1] + 1) % 13];
ok(MQ.gradeQuestion(q, right, cfg) === 1, 'the right quality and size');
ok(MQ.gradeQuestion(q, wrongQ, cfg) === 0.5 && MQ.gradeQuestion(q, wrongS, cfg) === 0.5, 'half for one of them');
ok(MQ.gradeQuestion(q, [null, null], cfg) === 0 && !MQ.hasAnswer(q, [null, null]) && MQ.hasAnswer(q, [right[0], null]), 'blank, and partly answered');
ok(/^(Diminished|Minor|Major|Perfect|Augmented) (unison|2nd|3rd|4th|5th|6th|7th|octave|9th|10th|11th|12th|13th)$/.test(MQ.describeAnswer(q, cfg)), 'the answer key reads as a name', MQ.describeAnswer(q, cfg));

// The report carries what each student chose.
const resp = qs.map((x, i) => (i === 0 ? right : i === 1 ? wrongS : i === 2 ? [right[0], null] : null));
const items = qs.map((x, i) => ({ type: x.type, clef: x.clef, credit: Math.round(MQ.gradeQuestion(x, resp[i], cfg) * 7), answered: MQ.hasAnswer(x, resp[i]), sec: 9 }));
const code = MQ.encodeQuiz(cfg);
const rep = MQ.decodeReport(MQ.encodeReport({ name: 'Test', submittedAt: Date.now(), totalSec: 100, partial: true, items, attempt: 1, answers: { qs, resp } }, cfg, code));
ok(rep.items.every((it) => it.type === 'ivname'), 'report: the question type');
const back = rep.answers.map((a, i) => MQ.answerFor(qs[i], a));
ok(JSON.stringify(back.slice(0, 4)) === JSON.stringify([right, wrongS, [right[0], null], [null, null]]), 'report: the choices come back', JSON.stringify(back.slice(0, 4)));
ok(rep.verifySeal(cfg), 'report: the seal matches');

console.log(`${passes} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
