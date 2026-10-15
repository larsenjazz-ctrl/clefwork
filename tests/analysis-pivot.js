// Clefwork Analysis: pivot chord boxes. Run with:  node tests/analysis-pivot.js
// A pivot chord box asks for the chord's Roman numeral in the key before the change and in the new key
// (and its chord symbol, when the teacher gives one). Checks the quiz code, the marking and the report.
// No dependencies; exits non-zero on any failure.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'blockchords', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

let fails = 0, passes = 0;
const ok = (cond, label, extra) => { if (cond) passes++; else { fails++; console.log('✗ ' + label + (extra ? '\n    ' + extra : '')); } };

const cfg = MQ.defaultConfig();
Object.keys(cfg.counts).forEach((k) => (cfg.counts[k] = 0));
cfg.flags.shuffle = false;
cfg.analysis = MQ.analysisSettings({
  img: { hash: 12345 },
  regions: [
    { x: 0.1, y: 0.1, w: 0.05, h: 0.2, ask: 'roman', roman: 'I', symbol: '' },
    { x: 0.2, y: 0.1, w: 0.05, h: 0.2, ask: 'pivot', roman: 'vi', roman2: 'ii', symbol: 'Ami' },
    { x: 0.3, y: 0.1, w: 0.05, h: 0.2, ask: 'pivot', roman: 'IV, IV6', roman2: 'I', symbol: '' },
    { x: 0.4, y: 0.1, w: 0.05, h: 0.2, ask: 'both', roman: 'V7', symbol: 'D7' },
  ],
  keys: [{ x: 0.2, y: 0.1, w: 0.05, h: 0.2, hide: 0, key: { fifths: 1, mode: 'major' }, ask: 1 }],
});
cfg.counts.analysis = MQ.analysisRegionCount(cfg.analysis);

// The quiz code carries the pivot boxes.
const code = MQ.encodeQuiz(cfg);
const back = MQ.decodeQuiz(code);
const regs = back.analysis.regions;
ok(regs[1].ask === 'pivot' && regs[1].roman === 'vi' && regs[1].roman2 === 'ii' && regs[1].symbol === 'Ami', 'quiz code: a pivot box with a chord symbol', JSON.stringify(regs[1]));
ok(regs[2].ask === 'pivot' && regs[2].roman === 'IV, IV6' && regs[2].roman2 === 'I' && regs[2].symbol === '', 'quiz code: a pivot box without one, with two answers in the old key', JSON.stringify(regs[2]));
ok(regs[0].ask === 'roman' && regs[3].ask === 'both' && !regs[0].roman2, 'quiz code: the other boxes are as they were', JSON.stringify([regs[0], regs[3]]));
ok(back.analysis.keys.length === 1 && back.analysis.keys[0].ask === 1, 'quiz code: the key change is kept');

const qs = MQ.generateQuiz(back);
const p1 = qs.find((q) => q.an.ask === 'pivot' && q.an.symbol.length), p2 = qs.filter((q) => q.an.ask === 'pivot')[1];
ok(qs.length === 5, 'four boxes and the key change', String(qs.length));
ok(p1 && p1.text === 'Box 2: Pivot chord', 'the pivot box is named', p1 && p1.text);
ok(JSON.stringify(MQ.analysisParts(p1)) === '["r","r2","s"]' && JSON.stringify(MQ.analysisParts(p2)) === '["r","r2"]', 'its answers: a numeral in each key, and the symbol when given');

// Marking: each answer is a share.
const g = (q, resp) => MQ.gradeQuestion(q, resp, back);
ok(g(p1, { r: 'vi', r2: 'ii', s: 'Ami' }) === 1, 'all three right');
ok(g(p1, { r: 'vi', r2: 'ii', s: 'Am' }) === 1, 'the chord symbol in another spelling');
ok(Math.abs(g(p1, { r: 'vi', r2: 'IV', s: 'Ami' }) - 2 / 3) < 1e-9, 'the wrong numeral in the new key: two of three');
ok(Math.abs(g(p1, { r: 'ii', r2: 'vi', s: 'Ami' }) - 1 / 3) < 1e-9, 'the keys the wrong way round: only the symbol');
ok(g(p2, { r: 'IV6', r2: 'I' }) === 1, 'either answer the teacher allows in the old key');
ok(g(p2, { r: 'IV' }) === 0.5, 'half for one key');
ok(!MQ.hasAnswer(p2, {}) && MQ.hasAnswer(p2, { r2: 'I' }), 'an answer in either key counts as answered');
ok(MQ.describeAnswer(p1, back) === 'vi in the old key = ii in the new key · Ami', 'the answer key', MQ.describeAnswer(p1, back));

// The report carries both numerals and the symbol.
const resp = qs.map((q) => (q === p1 ? { r: 'vi', r2: 'IV', s: 'Ami' } : q === p2 ? { r: 'IV', r2: 'I' } : null));
const items = qs.map((q, i) => ({ type: q.type, clef: q.clef, credit: Math.round(g(q, resp[i]) * 7), answered: MQ.hasAnswer(q, resp[i]), sec: 10 }));
const rep = MQ.decodeReport(MQ.encodeReport({ name: 'Test', submittedAt: Date.now(), totalSec: 50, partial: true, items, attempt: 1, answers: { qs, resp } }, back, code));
const i1 = qs.indexOf(p1), i2 = qs.indexOf(p2);
const a1 = MQ.answerFor(p1, rep.answers[i1]), a2 = MQ.answerFor(p2, rep.answers[i2]);
ok(a1 && a1.r === 'vi' && a1.r2 === 'IV' && a1.s === 'Ami', 'report: the pivot answers come back', JSON.stringify(a1));
ok(a2 && a2.r === 'IV' && a2.r2 === 'I', 'report: a second pivot box', JSON.stringify(a2));
ok(Math.abs(g(p1, a1) - 2 / 3) < 1e-9 && g(p2, a2) === 1, 'report: marked the same from the report');
ok(rep.verifySeal(back), 'report: the seal matches');

// A quiz without pivot boxes keeps its code.
const plain = JSON.parse(JSON.stringify(cfg));
plain.analysis.regions = plain.analysis.regions.filter((r) => r.ask !== 'pivot');
plain.analysis.keys = [];
plain.counts.analysis = 2;
const plainCode = MQ.encodeQuiz(plain);
const pq = MQ.decodeQuiz(plainCode);
ok(pq.analysis.regions.every((r) => r.ask !== 'pivot'), 'a quiz without pivot boxes has none');

console.log(`${passes} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
