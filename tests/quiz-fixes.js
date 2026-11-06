// Correcting a quiz after it went out: a dropped question counts for nothing, a question everyone is
// given counts as right, and an Analysis box with a corrected answer re-marks the answer the report
// carries. (The grade checker keeps the corrections on the teacher's device; see applyFixes in app.js.)
// Run with: node tests/quiz-fixes.js — no dependencies; exits non-zero on any failure.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'blockchords', 'cadences', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

let fails = 0, passes = 0;
const ok = (cond, label, extra) => { if (cond) passes++; else { fails++; console.log('✗ ' + label + (extra ? '\n    ' + extra : '')); } };

// An Analysis quiz whose first box was given the wrong answer (V for ii).
const cfg = MQ.defaultConfig();
Object.keys(cfg.counts).forEach((k) => (cfg.counts[k] = 0));
cfg.flags.shuffle = false;
cfg.analysis = { override: 0, notes: '', img: null, regions: [
  { x: 0.1, y: 0.1, w: 0.1, h: 0.1, ask: 'roman', roman: 'V', symbol: '' },
  { x: 0.3, y: 0.1, w: 0.1, h: 0.1, ask: 'both', roman: 'I', symbol: 'C' },
  { x: 0.5, y: 0.1, w: 0.1, h: 0.1, ask: 'roman', roman: 'IV', symbol: '' }] };
cfg.counts.analysis = 3;
const code = MQ.encodeQuiz(cfg), quiz = MQ.decodeQuiz(code), qs = MQ.generateQuiz(quiz);
const resp = [{ r: 'ii', s: '' }, { r: 'I', s: 'C' }, { r: 'V', s: '' }];
const items = qs.map((q, i) => ({ type: q.type, clef: q.clef, credit: MQ.gradeQuestion(q, resp[i], quiz) === 1 ? 7 : 0, answered: true, sec: 5 }));
const rc = MQ.encodeReport({ name: 'Ana', submittedAt: Date.now(), totalSec: 15, partial: true, items, answers: { qs, resp } }, quiz, code);
const rep = MQ.decodeReport(rc);
ok(MQ.reportStats(rep).points === 1, 'as submitted, only box 2 is right', String(MQ.reportStats(rep).points));

// The report still carries what the student typed, so a corrected box can mark it again.
const fixed = Object.assign({}, qs[0], { an: Object.assign({}, qs[0].an, { roman: MQ.alternatives('ii or ii7') }) });
ok(MQ.gradeQuestion(fixed, MQ.answerFor(fixed, rep.answers[0]), quiz) === 1, 'the corrected answer marks the student’s ii right');
ok(MQ.gradeQuestion(qs[0], MQ.answerFor(qs[0], rep.answers[0]), quiz) === 0, 'the original answer still marks it wrong');
ok(MQ.unreadableAnswers({ ask: 'roman', roman: 'ii or ii7', roman2: '', symbol: '' }, 0).length === 0, 'a corrected numeral is read');
ok(MQ.unreadableAnswers({ ask: 'roman', roman: 'zz', roman2: '', symbol: '' }, 0).length === 1, 'an unreadable correction is caught');

// Dropping and crediting.
rep.items[0].credit = 7;
rep.items[2].dropped = true;
let st = MQ.reportStats(rep);
ok(st.points === 2 && st.n === 2 && st.pct === 100, 'a dropped question leaves the score out of the rest', `${st.points}/${st.n}`);
rep.items[2].dropped = false;
rep.items[2].credit = 7;
st = MQ.reportStats(rep);
ok(st.points === 3 && st.n === 3, 'credit for everyone counts the question right', `${st.points}/${st.n}`);
// A quiz scored out of a total keeps that total when a question is dropped.
const pct = { items: [{ credit: 7 }, { credit: 0 }, { credit: 0, dropped: true }], scoring: { mode: 'percent', outOf: 10 } };
st = MQ.reportStats(pct);
ok(st.n === 10 && Math.abs(st.points - 5) < 1e-9, 'a total-points quiz rescales over the questions left', `${st.points}/${st.n}`);

console.log(`${passes} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
