// Total points: a quiz the teacher gives a total is scored as each student's share of it, whatever
// the quiz counts underneath (questions, notes, chords, answers). Run with:  node tests/total-points.js
// No dependencies; exits non-zero on any failure.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'blockchords', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

let fails = 0, passes = 0;
const ok = (cond, label, extra) => { if (cond) passes++; else { fails++; console.log('✗ ' + label + (extra ? '\n    ' + extra : '')); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;
// A report as the app writes it: the items, and the scoring the quiz asks for (the total, as percent).
const roundTrip = (cfg, items, scoring) => {
  const code = MQ.encodeQuiz(cfg);
  return MQ.decodeReport(MQ.encodeReport({ name: 'Test', submittedAt: Date.now(), totalSec: 60, partial: true, items, attempt: 1, scoring }, cfg, code));
};

// The total travels in the quiz code.
const plain = MQ.defaultConfig();
plain.canvasPts = 10;
ok(MQ.decodeQuiz(MQ.encodeQuiz(plain)).canvasPts === 10, 'the quiz code carries the total');

// Plain questions: 3 of 5 right and one part right (4/7 credit) → 3.57 of 5 → 7.14 of 10.
const items = [7, 7, 7, 0].map((credit) => ({ type: 'place', clef: 'treble', credit, answered: true, sec: 10 }));
items[3] = { type: 'chord', clef: 'treble', credit: 0, answered: true, sec: 10 };
items.push({ type: 'scale', clef: 'treble', credit: 4, answered: true, sec: 10 });
let rep = roundTrip(plain, items, { mode: 'percent', outOf: 10, split: 0 });
let st = MQ.reportStats(rep);
ok(st.n === 10, 'plain questions: out of the total', String(st.n));
ok(near(st.points, (3 + 4 / 7) / 5 * 10), 'plain questions: the share of the total', String(st.points));
ok(st.noted === false, 'plain questions are still counted by question, not by note', JSON.stringify(st.noted));
ok(st.full === 3, 'fully correct questions are still counted', String(st.full));
// Without a total, the same quiz is a point a question, as before.
rep = roundTrip(Object.assign({}, plain, { canvasPts: 0 }), items, null);
st = MQ.reportStats(rep);
ok(st.n === 5 && st.mode === null, 'without a total: a point a question, as before', `${st.points}/${st.n}`);

// Block chords: 9 of 12 chords right, on a 5-point quiz → 3.75.
const bc = MQ.defaultConfig();
Object.keys(bc.counts).forEach((k) => (bc.counts[k] = 0));
bc.block = MQ.blockSettings({ voices: 4, ex: [{ chords: 'Dmi7 G7 Cma7 A7' }, { chords: 'Fmi7 Bb7 Ebma7 C7' }, { chords: 'Gmi7 C7 Fma7 D7' }] });
bc.counts.block = 3;
bc.canvasPts = 5;
const bItems = [0, 1, 2].map((k) => ({ type: 'block', clef: 'grand', credit: 0, answered: true, sec: 30, notes: 4, wrong: k }));
rep = roundTrip(bc, bItems, { mode: 'percent', outOf: 5, split: 0 });
st = MQ.reportStats(rep);
ok(st.n === 5 && near(st.points, 9 / 12 * 5), 'block chords: the share of the chords, out of the total', `${st.points}/${st.n}`);
ok(st.noted && st.block && st.notes === 12 && st.wrong === 3, 'block chords: still 9 of 12 chords underneath', JSON.stringify({ noted: st.noted, notes: st.notes, wrong: st.wrong }));
// A teacher accepting a chord changes the share.
rep.items[2].wrong = 1;
st = MQ.reportStats(rep);
ok(near(st.points, 10 / 12 * 5), 'a chord the teacher accepts raises the share of the total', String(st.points));

// Chord Graph answers, half points included: 7.5 of 10 answers on a 20-point quiz → 15.
const gItems = [{ type: 'cgtable', clef: 'treble', credit: 0, answered: true, sec: 20, notes: 10, wrong: 2.5 }];
const gc = MQ.defaultConfig();
Object.keys(gc.counts).forEach((k) => (gc.counts[k] = 0));
gc.counts.cgtable = 1;
gc.canvasPts = 20;
rep = roundTrip(gc, gItems, { mode: 'percent', outOf: 20, split: 0 });
st = MQ.reportStats(rep);
ok(st.n === 20 && near(st.points, 15), 'chord graph: answers as a share of the total', `${st.points}/${st.n}`);

console.log(`${passes} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
