// Quiz codes that carry ties: every kind of quiz that can have tied notes is written and read back,
// and must give the same questions. Run with:  node tests/quiz-codes.js
// (A Sight Singing quiz of Clefwork's melodies with ties once couldn't be read back: the reader looked
// for rhythm settings that kind of quiz doesn't keep.) No dependencies; exits non-zero on any failure.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'blockchords', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

let fails = 0, passes = 0;
const ok = (cond, label, extra) => { if (cond) passes++; else { fails++; console.log('✗ ' + label + (extra ? '\n    ' + extra : '')); } };
const blank = () => { const c = MQ.defaultConfig(); Object.keys(c.counts).forEach((k) => (c.counts[k] = 0)); c.flags.shuffle = false; return c; };
const sameQuiz = (label, cfg) => {
  let back = null, err = null;
  try { back = MQ.decodeQuiz(MQ.encodeQuiz(cfg)); } catch (e) { err = e.message; }
  ok(!!back, `${label}: the code reads back`, err);
  if (!back) return;
  const a = JSON.stringify(MQ.generateQuiz(cfg).map((q) => q.mel || q.rh || q.deg || q.text));
  const b = JSON.stringify(MQ.generateQuiz(back).map((q) => q.mel || q.rh || q.deg || q.text));
  ok(a === b, `${label}: the same questions, ties and all`);
  ok(/"tie"/.test(a), `${label}: some notes are tied`);
};

// Sight Singing: Clefwork's melodies, with ties — the quiz that couldn't be opened.
[1, 2, 3].forEach((seed) => {
  const c = blank();
  c.title = 'Sight Singing';
  c.seed = seed * 7919;
  c.melody = MQ.melodySettings({ auto: { on: true, count: 15, measures: 4, level: 3, ties: 1 } });
  c.counts.sing = 15;
  c.sing = MQ.singSettings({});
  sameQuiz(`sight singing with ties (seed ${seed})`, c);
});
// A bank, each student given a few.
const bank = blank();
bank.melody = MQ.melodySettings({ auto: { on: true, count: 12, measures: 4, level: 3, ties: 1 } });
bank.counts.sing = 12;
bank.sing = MQ.singSettings({ pick: 3 });
sameQuiz('sight singing, a bank with ties', bank);

// Melodic dictation and rhythm, which keep their own settings, with ties.
const mel = blank();
mel.melody = MQ.melodySettings({ auto: { on: true, count: 4, measures: 4, level: 3, ties: 1 } });
mel.counts.melody = 4;
sameQuiz('melodic dictation with ties', mel);
const rh = blank();
rh.rhythm = MQ.rhythmSettings({ auto: { on: true, count: 4, measures: 4, level: 3, ties: 1 } });
rh.counts.rhythm = 4;
sameQuiz('rhythmic dictation with ties', rh);

// The code from the report: a Sight Singing quiz of 15 melodies with ties.
const reported = 'PB01ZXJ0YGADMPET3M419PJVK7D5Q6E81G64RH31ESMP882CC5S76SBER000003R9WG64R040000080032HNHFMG000002NHFG0002JSHP800000000001HGA000000000000507XGJ0D000000S55SMAJZ10SA9WQPG00';
let rq = null;
try { rq = MQ.decodeQuiz(reported); } catch (e) { ok(false, 'the reported Sight Singing link opens', e.message); }
if (rq) ok(MQ.generateQuiz(rq).length === 15 && MQ.generateQuiz(rq).every((q) => q.type === 'sing'), 'the reported Sight Singing link opens, 15 melodies');

console.log(`${passes} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
