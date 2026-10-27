// Cadences & Modulations (Clefwork Harmony): the progressions, their voicings, grading and codes. Run with:
//   node tests/cadences.js
// Every kind of cadence and modulation in every staff, style and chord size is made and checked: the
// cadence or modulation it claims, voice leading (no parallel 5ths or octaves, the leading tone and
// 7ths resolved in the outer voices, voices in range), the model answer grading as right, and the quiz
// and report codes carrying everything. No dependencies; exits non-zero on any failure.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'blockchords', 'cadences', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

let fails = 0, passes = 0;
const ok = (cond, label, extra) => { if (cond) passes++; else { fails++; console.log('✗ ' + label + (extra ? '\n    ' + extra : '')); } };
const flags = { enharmonic: false };
const modelOf = (q) => ({
  n: q.cad.write ? q.answer.map((c) => c.map((p) => Object.assign({}, p))) : null,
  r: q.cad.chords.map((c, i) => (c.pivot ? q.cad.rows.bottom[i] : q.cad.rows.bottom[i] || q.cad.rows.bottom2[i]).replace(/^\S+: /, '')),
  p: q.cad.chords.map((c, i) => (c.pivot ? q.cad.rows.bottom2[i].replace(/^\S+: /, '') : '')),
  s: q.cad.symbols.slice(),
  d: q.cad.dd.map((d) => d.answer),
});
const topIsTonic = (q) => {
  const last = q.answer[q.answer.length - 1].slice().sort((a, b) => MQ.midi(a) - MQ.midi(b)), top = last[last.length - 1], kd = q.cad.keys[q.cad.keys.length - 1];
  return top.step === kd.tonic.step && top.alt === kd.tonic.alt;
};
const name = (q) => `${q.cad.mod || q.cad.kind} in ${MQ.cadKeyText(q.cad.keys[0])}: ${q.cad.romans.join(' ')}`;

// ---------- Roman numerals ----------
[['V65', 'V6/5'], ['viio7', 'vii°7'], ['ii/o7', 'iiø7'], ['V7/V', 'V7/V'], ['bVI', '♭VI'], ['I64', 'I 6 4'], ['V9', 'V9']].forEach(([a, b]) => {
  ok(MQ.sameRN(MQ.readRN(a), MQ.readRN(b)), `${a} reads as ${b}`);
});
[['V65', 'V7'], ['vii°7', 'viiø7'], ['ii6', 'II6'], ['V7/V', 'V7'], ['I6', 'I64']].forEach(([a, b]) => {
  ok(!MQ.sameRN(MQ.readRN(a), MQ.readRN(b)), `${a} is not ${b}`);
});

// ---------- the teacher's progressions ----------
const WRITTEN = [
  ['C: I IV ii6 V7 I', 'pac', null],
  ['a: i iv6 V', 'phc', null],
  ['G: I vi ii6 V', 'hc', null],
  ['G: I V65 I IV V7/V V', 'hc', null],
  ['B♭: I ii6 V7 I IV I', 'plagal', null],
  ['E♭: I IV V7 vi', 'dc', null],
  ['C: I IV vii°6 I', 'iac', null],
  ['C: I vi=G:ii V7 I', 'pac', 'common'],
  ['a: i iv i III=C:I ii6 V7 I', 'pac', 'common'],
  ['F: I ii6 V I C: I IV V7 I', 'pac', 'phrase'],
  ['C: I V65 I d: i V65 i', 'iac', 'seq'],
  ['C: I V7 I E: I IV V7 I', 'pac', 'ct'],
];
WRITTEN.forEach(([text, cad, mod]) => {
  const p = MQ.cadExerciseProblems({ text, cad: 0, mod: 0 });
  ok(!p.bad.length && !p.empty, `reads “${text}”`, p.bad.join(' '));
  ok(p.cad === cad, `“${text}” ends with ${cad}`, `got ${p.cad}`);
  ok(p.mod === mod, `“${text}” modulates: ${mod}`, `got ${p.mod}`);
});
['C: I IV X V I', 'C: I vi=ii V I', 'C: I V I G: I V I D: I'].forEach((text) => ok(!MQ.cadExerciseOk({ text, cad: 0, mod: 0 }), `“${text}” is left out`));
const sev = MQ.parseCadText('C: I IV7 ii7 V9 viiø7 I').chords.map((c) => c.q);
ok(sev.join() === 'maj,maj7,min7,dom9,hdim7,maj', 'sevenths and ninths take the key’s qualities', sev.join());
const minor = MQ.parseCadText('c: i ii°6 iv V7 vii°7 i').chords.map((c) => MQ.cadSymbolOf(c));
ok(minor.join(' ') === 'Cmi D°/F Fmi G7 B°7 Cmi', 'minor keys: the raised leading tone', minor.join(' '));

// ---------- voice leading ----------
const pcOf = (p) => ((MQ.midi(p) % 12) + 12) % 12;
function voiceLeading(q) {
  const out = [];
  const cols = q.answer, C = q.cad;
  const lowTop = (c) => { const s = c.slice().sort((a, b) => MQ.midi(a) - MQ.midi(b)); return [s[0], s[s.length - 1]]; };
  for (let i = 0; i + 1 < cols.length; i++) {
    const [b1, s1] = lowTop(cols[i]), [b2, s2] = lowTop(cols[i + 1]);
    const i1 = (MQ.midi(s1) - MQ.midi(b1)) % 12, i2 = (MQ.midi(s2) - MQ.midi(b2)) % 12;
    const m1 = MQ.midi(b2) - MQ.midi(b1), m2 = MQ.midi(s2) - MQ.midi(s1);
    if (m1 && m2 && Math.sign(m1) === Math.sign(m2) && i1 === i2 && (i1 === 0 || i1 === 7)) out.push(`parallel ${i1 ? '5ths' : 'octaves'} in the outer voices, chords ${i + 1}–${i + 2}`);
    // Chorale: by voice.
    if (cols[i][0].v && cols[i + 1][0].v && !C.block && q.grand) {
      const by = (c) => { const m = {}; c.forEach((n) => (m[n.v] = n)); return m; };
      const A = by(cols[i]), B = by(cols[i + 1]);
      const vs = ['B', 'T', 'A', 'S'];
      for (let x = 0; x < vs.length; x++) for (let y = x + 1; y < vs.length; y++) {
        const a1 = A[vs[x]], a2 = A[vs[y]], c1 = B[vs[x]], c2 = B[vs[y]];
        if (!a1 || !a2 || !c1 || !c2) continue;
        const j1 = (((MQ.midi(a2) - MQ.midi(a1)) % 12) + 12) % 12, j2 = (((MQ.midi(c2) - MQ.midi(c1)) % 12) + 12) % 12;
        const d1 = MQ.midi(c1) - MQ.midi(a1), d2 = MQ.midi(c2) - MQ.midi(a2);
        if (d1 && d2 && Math.sign(d1) === Math.sign(d2) && j1 === j2 && (j1 === 0 || j1 === 7)) out.push(`parallel ${j1 ? '5ths' : 'octaves'} ${vs[x]}–${vs[y]}, chords ${i + 1}–${i + 2}`);
      }
      // A chordal 7th falls by step.
      cols[i].forEach((n) => {
        if (n.d !== 7) return;
        const nx = B[n.v], same = C.chords[i].q === C.chords[i + 1].q && C.chords[i].root.step === C.chords[i + 1].root.step;
        const held = nx && MQ.midi(n) === MQ.midi(nx) && MQ.cadChordFrom(C.chords[i + 1].text, C.keys[C.chords[i + 1].k]) && q.answer[i + 1].some((m) => m.step === n.step && m.alt === n.alt);
        if (nx && !same && !held && !(MQ.midi(n) - MQ.midi(nx) === 1 || MQ.midi(n) - MQ.midi(nx) === 2)) out.push(`the 7th in the ${n.v} doesn’t resolve, chords ${i + 1}–${i + 2}`);
      });
    }
  }
  // Ranges: soprano C4–G5, bass E2–C4 in a chorale.
  if (q.grand && !C.block) cols.forEach((c, i) => c.forEach((n) => {
    const R = { S: [60, 79], A: [55, 74], T: [48, 67], B: [40, 60] }[n.v];
    if (R && (MQ.midi(n) < R[0] || MQ.midi(n) > R[1])) out.push(`${n.v} out of range in chord ${i + 1}: ${MQ.fullName(n)}`);
  }));
  // Every chord's notes are its chord tones, with the right one in the bass.
  cols.forEach((c, i) => {
    const want = q.cad.specs[i];
    const tones = want.spec.required.concat(want.spec.optional).map((p) => pcOf({ ...p, oct: 4 }));
    c.forEach((n) => { if (!tones.includes(pcOf(n))) out.push(`${MQ.fullName(n)} isn’t in chord ${i + 1}`); });
    const low = c.slice().sort((a, b) => MQ.midi(a) - MQ.midi(b))[0];
    if (low.step !== want.bassPc.step || low.alt !== want.bassPc.alt) out.push(`chord ${i + 1} has ${MQ.fullName(low)} in the bass`);
    want.spec.required.forEach((p) => { if (!c.some((n) => n.step === p.step && n.alt === p.alt)) out.push(`chord ${i + 1} is missing ${MQ.pcName({ ...p, oct: 4 })}`); });
  });
  // A perfect authentic cadence ends with the tonic on top.
  if (C.kind === 'pac' && !C.mod) {
    const last = cols[cols.length - 1].slice().sort((a, b) => MQ.midi(a) - MQ.midi(b));
    const top = last[last.length - 1], kd = C.keys[C.keys.length - 1];
    if (top.step !== kd.tonic.step || top.alt !== kd.tonic.alt) out.push(`the PAC ends with ${MQ.fullName(top)} on top`);
  }
  return out;
}

const SETS = [];
[0, 1, 2].forEach((staff) => [0, 1].forEach((style) => [0, 1, 2].forEach((size) => [0, 1].forEach((fill) => {
  if (staff !== 2 && style) return;
  SETS.push({ staff, style, size, fill, stems: staff !== 2 ? 1 : 0, kinds: 0x3ff, keyMode: 3, keyMax: 7, len: 6, ask: 3, rn: 1, sym: 1, nht: 0 });
}))));
SETS.push({ staff: 2, style: 0, size: 1, kinds: 0x3ff, keyMode: 1, keyMax: 4, len: 8, ask: 2, rn: 0, sym: 0, nht: 1 });
SETS.push({ staff: 0, stems: 1, size: 2, kinds: 0x3f, keyMode: 2, keyMax: 3, len: 4, ask: 2, rn: 2, sym: 2, nht: 1 });
SETS.push({ staff: 2, style: 1, size: 2, fill: 1, kinds: 0x3c0, keyMode: 3, keyMax: 5, len: 7, ask: 2, rn: 1, sym: 0, nht: 1 });
let made = 0, vlIssues = 0;
const seen = {};
SETS.forEach((set, k) => {
  for (let seed = 1; seed <= 6; seed++) {
    const cfg = Object.assign(MQ.defaultConfig(), { seed: seed * 977 + k });
    Object.keys(cfg.counts).forEach((x) => (cfg.counts[x] = 0));
    cfg.counts.cadence = 10;
    cfg.cad = MQ.cadSettings(JSON.parse(JSON.stringify(set)));
    const qs = MQ.generateQuiz(cfg);
    ok(qs.length === 10, `ten questions (settings ${k})`, String(qs.length));
    qs.forEach((q) => {
      made++;
      seen[q.cad.mod || q.cad.kind] = (seen[q.cad.mod || q.cad.kind] || 0) + 1;
      ok(q.cad.chords.length <= 8, 'at most eight chords', name(q));
      // The cadence it says it ends with, read back from its chords.
      // (An imperfect authentic cadence from a root-position V reads as perfect: its soprano tells them apart.)
      const read = MQ.cadenceOf(q.cad.chords, q.cad.keys);
      if (!q.cad.mod) ok(read === q.cad.kind || (q.cad.kind === 'iac' && read === 'pac' && !topIsTonic(q)), `${q.cad.kind} reads as itself`, name(q) + ' → ' + read);
      else ok(MQ.modulationOf(q.cad.chords, q.cad.keys) === q.cad.mod, `${q.cad.mod} modulation reads as itself`, name(q) + ' → ' + MQ.modulationOf(q.cad.chords, q.cad.keys));
      // Every numeral printed reads back as its chord.
      q.cad.chords.forEach((c) => {
        const back = MQ.cadChordFrom(c.text, q.cad.keys[c.k]);
        ok(back && back.q === c.q && back.root.step === c.root.step && back.root.alt === c.root.alt && back.inv === c.inv, `“${c.text}” reads back`, name(q));
      });
      const issues = voiceLeading(q);
      if (issues.length) vlIssues++;
      ok(!issues.length, 'voice leading', name(q) + (q.grand ? (q.cad.block ? ' (block)' : ' (chorale)') : ` (${q.clef})`) + '\n    ' + issues.join('\n    '));
      ok(MQ.gradeQuestion(q, modelOf(q), { flags }) === 1, 'the model answer is right', name(q));
      ok(MQ.gradeQuestion(q, {}, { flags }) === 0, 'a blank answer is wrong', name(q));
      ok(!MQ.hasAnswer(q, {}) && MQ.hasAnswer(q, modelOf(q)), 'answered or not', name(q));
      if (q.cad.dd.length) {
        const wrong = Object.assign(modelOf(q), { d: q.cad.dd.map((d) => (d.answer + 1) % d.options.length) });
        ok(MQ.gradeQuestion(q, wrong, { flags }) < 1, 'a wrong cadence or modulation loses credit', name(q));
      }
      ok(!!MQ.describeAnswer(q, { flags }), 'the answer in words', name(q));
    });
    // The quiz code keeps every setting, and the same questions.
    const code = MQ.encodeQuiz(cfg), back = MQ.decodeQuiz(code);
    ok(JSON.stringify(MQ.generateQuiz(back).map((q) => q.sig)) === JSON.stringify(qs.map((q) => q.sig)), 'the quiz code gives the same questions', `settings ${k}`);
    // A report carries each answer back.
    const resp = qs.map(modelOf);
    const report = { name: 'Test', submittedAt: Date.now(), totalSec: 60, partial: true, items: qs.map((q) => ({ type: q.type, clef: q.clef, credit: 7, answered: true, sec: 5 })), answers: { qs, resp } };
    const rc = MQ.encodeReport(report, cfg, code), rd = MQ.decodeReport(rc);
    ok(rd.items.every((it) => it.type === 'cadence'), 'the report knows its questions');
    rd.answers.forEach((a, i) => {
      const r = MQ.answerFor(qs[i], a);
      ok(MQ.gradeQuestion(qs[i], r, { flags }) === 1, 'a report’s answer grades the same', name(qs[i]));
    });
  }
});
['pac', 'iac', 'hc', 'phc', 'plagal', 'dc', 'common', 'phrase', 'seq', 'ct'].forEach((k) => ok(seen[k] > 0, `made some ${k}`));

// "A mix of both": about half the questions write the chords and half name the cadence or modulation.
[4, 5, 6, 7, 10].forEach((n) => [11, 12, 13].forEach((seed) => {
  const cfg = Object.assign(MQ.defaultConfig(), { seed });
  Object.keys(cfg.counts).forEach((x) => (cfg.counts[x] = 0));
  cfg.counts.cadence = n;
  cfg.cad = MQ.cadSettings({ ask: 3, rn: 0, sym: 0, kinds: 0x3ff });
  const qs = MQ.generateQuiz(cfg), w = qs.filter((q) => q.cad.write).length;
  ok(Math.abs(w - (n - w)) <= 1, `${n} questions mixed half and half`, `${w} write, ${n - w} name`);
  ok(qs.every((q) => q.cad.write !== q.cad.ident), 'each mixed question does one or the other');
}));

// "Both in every question": each question asks students to write the chords and name them; the
// setting survives the quiz code.
[3, 8].forEach((n) => {
  const cfg = Object.assign(MQ.defaultConfig(), { seed: 99 + n });
  Object.keys(cfg.counts).forEach((x) => (cfg.counts[x] = 0));
  cfg.counts.cadence = n;
  cfg.cad = MQ.cadSettings({ ask: 4, rn: 1, sym: 0, kinds: 0x3ff });
  const qs = MQ.generateQuiz(cfg);
  ok(qs.length === n && qs.every((q) => q.cad.write && q.cad.ident && q.cad.dd.length), 'both in every question');
  const back = MQ.decodeQuiz(MQ.encodeQuiz(cfg));
  ok(back.cad.ask === 4, 'the quiz code keeps “both in every question”', String(back.cad.ask));
  ok(JSON.stringify(MQ.generateQuiz(back).map((q) => q.sig)) === JSON.stringify(qs.map((q) => q.sig)), 'and the same questions');
});
[1, 2, 3].forEach((ask) => {
  const cfg = Object.assign(MQ.defaultConfig(), { seed: 5 });
  Object.keys(cfg.counts).forEach((x) => (cfg.counts[x] = 0));
  cfg.counts.cadence = 2;
  cfg.cad = MQ.cadSettings({ ask });
  ok(MQ.decodeQuiz(MQ.encodeQuiz(cfg)).cad.ask === ask, `the quiz code keeps ask ${ask}`);
});

// Written progressions as questions, through the quiz code.
const wcfg = Object.assign(MQ.defaultConfig(), { seed: 4242 });
Object.keys(wcfg.counts).forEach((x) => (wcfg.counts[x] = 0));
wcfg.cad = MQ.cadSettings({ src: 1, ask: 3, rn: 1, sym: 0, staff: 2, ex: WRITTEN.map(([text]) => ({ text, cad: 0, mod: 0 })) });
wcfg.counts.cadence = WRITTEN.length;
const wqs = MQ.generateQuiz(wcfg);
ok(wqs.length === WRITTEN.length, 'every written progression is a question', String(wqs.length));
wqs.forEach((q) => {
  ok(MQ.gradeQuestion(q, modelOf(q), { flags }) === 1, 'a written progression’s model answer', name(q));
  const issues = voiceLeading(q);
  ok(!issues.length, 'written progression voice leading', name(q) + '\n    ' + issues.join('\n    '));
});
const wback = MQ.decodeQuiz(MQ.encodeQuiz(wcfg));
ok(JSON.stringify(wback.cad.ex.map((e) => e.text)) === JSON.stringify(WRITTEN.map(([t]) => t.replace(/♭/g, 'b').replace(/°/g, 'o'))), 'the quiz code keeps the written progressions');
ok(JSON.stringify(MQ.generateQuiz(wback).map((q) => q.sig)) === JSON.stringify(wqs.map((q) => q.sig)), 'and gives the same questions');

console.log(`${passes} passed, ${fails} failed (${made} progressions made, ${vlIssues} with voice-leading problems).`);
process.exit(fails ? 1 : 0);
