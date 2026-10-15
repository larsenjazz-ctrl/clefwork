// Block chords (Clefwork Voice Leading): the checker against the textbook's rules. Run with:
//   node tests/block-chords.js
// Each case is a chord symbol, the notes of a block (lowest first) and the rules it should break —
// none for a good block. Then every model answer must pass, the quiz code must carry the settings,
// and a report must carry the student's notes. No dependencies; exits non-zero on any failure.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + '/';
const files = ['theory', 'progressions', 'chords', 'figured', 'voicings', 'blockchords', 'keys', 'analysis', 'rhythm', 'rhythmgen', 'melody', 'melodygen', 'sing', 'degrees', 'chordgraph', 'vocab', 'terms', 'library-index', 'codec'];
new Function(files.filter((f) => fs.existsSync(SRC + f + '.js')).map((f) => fs.readFileSync(SRC + f + '.js', 'utf8')).join('\n'))();
const MQ = globalThis.MQ;

let fails = 0, passes = 0;
const ok = (cond, label, extra) => { if (cond) passes++; else { fails++; console.log('✗ ' + label + (extra ? '\n    ' + extra : '')); } };
const P = (name) => {
  const m = name.match(/^([A-G])(bb|##|b|#|)(-?\d)$/);
  return { step: 'CDEFGAB'.indexOf(m[1]), oct: +m[3], alt: { '': 0, b: -1, bb: -2, '#': 1, '##': 2 }[m[2]] };
};
const set = MQ.blockSettings({});
function check(sym, notes, N, o) {
  const ch = MQ.parseBlockSymbol(sym);
  const pl = MQ.blockChordPlan(ch, Object.assign({}, set, o && o.set));
  const voice = notes.split(' ').map(P).sort((a, b) => MQ.midi(a) - MQ.midi(b));
  return MQ.checkBlockChord(pl, voice, o && o.bass ? P(o.bass) : null, N, Object.assign({ symbol: sym }, o));
}
// [symbol, block, voices, rule ids it should break, options]
const CASES = [
  // Good blocks, from the textbook's examples and a few more.
  ['Cma9', 'E4 G4 B4 D5', 4, []],
  ['F9', 'Eb4 G4 A4 C5', 4, []],
  ['Dmi7', 'F4 A4 C5 E5', 4, []],                  // the 9th in the root's place
  ['G7', 'F4 A4 B4 D5', 4, []],
  ['Cma7', 'E4 G4 B4 D5', 4, []],
  ['C13', 'Bb4 D5 E5 A5', 4, []],                  // Rule 7: the 5th left out
  ['C', 'E4 G4', 2, []],                            // Rule 8: a triad in two notes
  ['C', 'E4 G4 C5', 3, []],                         // three notes of a triad need the octave
  ['C6', 'G4 A4 E5', 3, []],
  ['C6', 'E4 G4 A4', 3, ['top']],
  ['Cadd9', 'E4 G4 D5', 3, []],
  ['Cmi7b5', 'Eb4 Gb4 Bb4 D5', 4, []],
  ['C7#9b13', 'E4 Bb4 D#5', 3, []],                 // more notes asked for than fit: any three of them
  ['Bbma9', 'D4 F4 A4 C5', 4, []],
  ['F13', 'Eb4 G4 A4 D5', 4, []],
  ['F13', 'Eb4 A4 D5 G5', 4, ['span']],
  ['Cma7', 'B3 D4 E4 G4', 4, []],                   // seconds lower in the block are fine
  // Rule 1: within an octave.
  ['Cma9', 'E4 B4 D5 G5', 4, ['span']],
  ['F9', 'A3 Eb4 G4 C5', 4, ['span']],
  // Rule 2: no root when other notes can fill the block.
  ['Cma7', 'C4 E4 G4 B4', 4, ['root']],
  ['Dmi7', 'D4 F4 A4 C5', 4, ['root']],
  // … unless the teacher allows the root (octave) in the block.
  ['Cma7', 'C4 E4 G4 B4', 4, [], { octave: true }],
  ['Dmi7', 'F4 A4 C5 D5', 4, ['top'], { octave: true }],   // Rule 4 still applies
  ['Cma7', 'E4 G4 C5', 3, ['need'], { octave: true }],     // and so does Rule 7: the root can't stand in for the 7th
  // Rule 3: no doubled notes.
  ['Cma7', 'E4 G4 B4 E5', 4, ['double']],
  ['C', 'E4 G4 E5', 3, ['double']],                 // the octave fills a three-note triad, not a doubled 3rd
  // Rule 4: no second between the top two notes.
  ['Cma9', 'G4 B4 C5 D5', 4, ['root', 'top', 'need']],   // and the 3rd is missing
  ['C13', 'E4 G4 Bb4 A5', 4, ['span']],
  ['C13', 'Bb4 E5 G5 A5', 4, ['top']],
  ['F9', 'A4 C5 Eb5 G5', 4, []],                    // a 3rd on top
  ['Dmi9', 'F4 A4 C5 E5', 4, []],
  ['Dmi9', 'A4 C5 E5 F5', 4, ['top']],              // a half step on top
  // Rule 7: the 3rd, the 7th and the notes the symbol asks for.
  ['Cma7', 'G4 B4 D5', 3, ['need']],               // no 3rd
  ['C7', 'E4 G4 A4 D5', 4, ['tone', 'need']],       // A isn't in C7; the 7th is missing
  ['C13', 'E4 G4 Bb4 D5', 4, ['need']],             // no 13th — the 5th should go first
  ['Cmi7b5', 'Eb4 G4 Bb4 D5', 4, ['tone', 'need']], // G for G♭
  // The chord symbol decides: the 3rd and 7th first, then every extension the symbol names, before a
  // 5th or the octave. When the symbol asks for more than the block holds, any of them fill it.
  ['C7#9b13', 'Ab4 Bb4 E5', 3, []],
  ['C7#9b13', 'E4 G4 Bb4', 3, ['need']],            // a 5th instead of ♯9 or ♭13
  ['C7#9b13', 'Bb4 D#5 Ab5', 3, ['need']],          // no 3rd: it comes before the extensions
  ['C7#9b13', 'E4 Ab4 D#5', 3, ['need']],           // no 7th
  ['C7#9b13', 'E4 Ab4 Bb4 D#5', 4, []],
  ['C7#9b13', 'E4 G4 Bb4 D#5', 4, ['need']],        // the ♭13 fits and is asked for
  ['C13', 'E4 G4 Bb4 A5', 4, ['span']],
  ['C13', 'Bb4 C5 E5 A5', 4, [], { octave: true }], // 3, 13, 7 and the octave: everything asked for is there
  ['C13', 'C4 E4 G4 Bb4', 4, ['need'], { octave: true }],   // octave and 5th, but no 13th
  ['Cma7', 'E4 B4', 2, []],
  ['Cma7', 'E4 G4', 2, ['need']],                   // the 7th before the 5th
  ['Cma7', 'C4 E4', 2, ['need'], { octave: true }], // the 7th before the octave
  ['C7b9#11', 'E4 F#4 Bb4 Db5', 4, []],
  ['C7b9#11', 'E4 G4 Bb4 Db5', 4, ['need']],        // the ♯11 is written in the symbol
  ['Cmi7b5', 'Eb4 Gb4 Bb4', 3, []],
  ['Cmi7b5', 'Eb4 Bb4 D5', 3, ['need']],            // the ♭5 is written in the symbol
  ['Cadd9', 'E4 G4 C5', 3, ['need'], { octave: true }],
  // Rule 8: the number of notes.
  ['Cma7', 'E4 G4 B4', 4, ['count']],
  ['Cma7', 'E4 G4 B4 D5 E5', 4, ['count', 'double', 'top']],
  ['Cma7', 'B3 C4 D4 E4 G4', 4, ['count'], { octave: true }],   // a note too many, though each is a chord tone
  // Spelling.
  ['Cmi7', 'D#4 G4 Bb4 D5', 4, ['spell']],
  ['Cmi7', 'D#4 G4 Bb4 D5', 4, [], { enharmonic: true }],
  // The 9th can't replace the root when the teacher turns that off.
  ['Dmi7', 'F4 A4 C5 E5', 4, ['tone'], { set: { ninth: 0 } }],
  // The bottom-note option.
  ['Cma9', 'D4 E4 G4 B4', 4, ['bottom'], { bottom: true }],
  ['Cma9', 'E4 G4 B4 D5', 4, [], { bottom: true }],
  // The bass, when students write it.
  ['Cma7', 'E4 G4 B4 D5', 4, [], { writeBass: true, bass: 'C3' }],
  ['Cma7', 'E4 G4 B4 D5', 4, ['nobass'], { writeBass: true }],
  ['Cma7', 'E4 G4 B4 D5', 4, ['bass'], { writeBass: true, bass: 'E2' }],
  ['Cma7', 'E4 G4 B4 D5', 4, ['low'], { writeBass: true, bass: 'C4' }],
  ['Cma7', 'E4 G4 B4 D5', 4, ['bass'], { writeBass: true, bass: 'B#2' }],
  ['C/E', 'G4 C5 E5', 3, [], { writeBass: true, bass: 'E2' }],
];
CASES.forEach(([sym, notes, N, want, o]) => {
  const got = check(sym, notes, N, o).flags;
  const ids = [...new Set(got.map((f) => f.id))].sort();
  ok(JSON.stringify(ids) === JSON.stringify(want.slice().sort()), `${sym} [${notes}] ${N} notes${o ? ' ' + JSON.stringify(o) : ''}: expected ${want.join(', ') || 'no flags'}, got ${ids.join(', ') || 'no flags'}`,
    got.map((f) => f.text).join(' | '));
});

// Every model answer passes its own rules, for a spread of chords and block sizes.
const SYMS = ['C', 'Cmi', 'C°', 'Caug', 'Csus4', 'C6', 'Cmi6', 'C6/9', 'Cadd9', 'Cma7', 'C7', 'Cmi7', 'Cmi7b5', 'C°7', 'Cmima7', 'C7sus4', 'Cma9', 'C9', 'Cmi9', 'C7b9', 'C7#9', 'Cmi11', 'C13', 'Cma13', 'C7#11', 'C7b13', 'C7#9b13', 'Cma7#11', 'C9sus4', 'C/E', 'C7/Bb'];
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
let models = 0;
SYMS.forEach((s) => ROOTS.forEach((r) => [2, 3, 4, 5].forEach((N) => {
  const sym = r + s.slice(1).replace(/\/E$/, '/' + 'EFGABCD'['CDEFGAB'.indexOf(r[0])] + (r[1] || '')).replace(/\/Bb$/, '');
  const ch = MQ.parseBlockSymbol(sym);
  if (!ch) { ok(false, `parse ${sym}`); return; }
  const tones = MQ.blockChordPlan(ch, set).tones.length;
  if (N < 3 && ch.has.includes(7)) return;           // a two-note seventh chord can't keep 3rd and 7th and more
  if (N > tones + 2) return;
  const pl = MQ.blockChordPlan(ch, set);
  const m = MQ.modelBlock(pl, N, { symbol: sym });
  const chk = MQ.checkBlockChord(pl, m, null, N, { symbol: sym });
  models++;
  ok(chk.ok, `model answer for ${sym} in ${N} notes: ${m.map(MQ.fullName).join(' ')}`, chk.flags.map((f) => f.text).join(' | '));
})));

// The quiz code carries the exercises and settings; the questions come back the same.
const cfg = MQ.defaultConfig();
Object.keys(cfg.counts).forEach((k) => (cfg.counts[k] = 0));
cfg.flags.shuffle = false;
cfg.block = MQ.blockSettings({ root: 1, value: 1, ninth: 0, bottom: 1, octave: 0, voices: 4, ex: [{ chords: 'Dmi7 G7 Cma7 A7' }, { chords: 'C F G7 C' }, { chords: 'B♭ma9 | E♭13 | Fmi7♭5' }] });
cfg.counts.block = 3;
cfg.retakes = 2;
const code = MQ.encodeQuiz(cfg);
const back = MQ.decodeQuiz(code);
ok(back.counts.block === 3, 'quiz code: the number of exercises', JSON.stringify(back.counts.block));
ok(back.retakes === 2, 'quiz code: the retake limit', JSON.stringify(back.retakes));
const b2 = MQ.blockSettings(back.block);
ok(b2.root === 1 && b2.value === 1 && b2.ninth === 0 && b2.bottom === 1 && b2.octave === 0 && b2.voices === 4, 'quiz code: the settings', JSON.stringify(b2));
ok(b2.ex.map((e) => e.chords + '/' + e.voices).join(';') === 'Dmi7 G7 Cma7 A7/4;C F G7 C/4;Bbma9 Eb13 Fmi7b5/4', 'quiz code: the exercises', JSON.stringify(b2.ex));
const oct = MQ.decodeQuiz(MQ.encodeQuiz(Object.assign({}, cfg, { block: MQ.blockSettings({ voices: 3, ex: [{ chords: 'Cma7' }] }) })));
ok(MQ.blockSettings(oct.block).octave === 1 && MQ.blockSettings(oct.block).voices === 3, 'quiz code: the root allowed by default, and the block size', JSON.stringify(oct.block));
const octQ = MQ.generateQuiz(oct)[0];
ok(MQ.gradeQuestion(octQ, [['C4', 'E4', 'B4'].map(P)], oct) === 1, 'a root in the block counts when the teacher allows it');
const qs = MQ.generateQuiz(back);
ok(qs.length === 3 && qs.every((q) => q.type === 'block'), 'three block questions', qs.map((q) => q.type).join(','));
ok(qs[0].columns.length === 4 && qs[0].columns.every((c) => c.cap === 7 && !c.given.length), 'students write the root: room for 4 + 1 notes a chord, and two too many');
// The builder edits the exercises in place while the quiz code is remade on every keystroke, so
// reading the settings must keep each exercise (the same object), not copy it.
const live = MQ.defaultConfig();
Object.keys(live.counts).forEach((k) => (live.counts[k] = 0));
live.block = MQ.blockSettings({ ex: [{ chords: 'D' }] });
live.counts.block = 1;
const row = live.block.ex[0];
MQ.encodeQuiz(live);
row.chords = 'Dmi7';
MQ.encodeQuiz(live);
row.chords = 'Dmi7 G7';
MQ.generateQuiz(live);
live.block.ex.push({ chords: 'Cma7', voices: 4 });
MQ.encodeQuiz(live);
ok(live.block.ex[0] === row && live.block.ex[0].chords === 'Dmi7 G7' && live.block.ex.length === 2, 'typing into an exercise is kept as the quiz code is remade', JSON.stringify(live.block.ex));
// A quiz without block chords keeps its code.
const plain = MQ.defaultConfig();
ok(MQ.encodeQuiz(plain) === MQ.encodeQuiz(Object.assign({}, plain, { block: MQ.blockSettings({ ex: [{ chords: 'C', voices: 2 }] }) })), 'other quizzes keep their codes');

// A perfect answer (the model) scores every chord; the report carries the notes and the score.
const q = qs[0];
const resp = q.answer.map((col) => col.map((p) => Object.assign({}, p)));
ok(MQ.gradeQuestion(q, resp, back) === 1, 'the model answer is right', MQ.compareBlock(q, resp, back).chords.map((c) => c.flags.map((f) => f.text).join(' | ')).join(' / '));
// This quiz turns the 9th-for-the-root off, so a four-note G7 needs its root; a B♭ma9 doesn't.
ok(MQ.compareBlock(q, resp, back).chords[1].voice.some((n) => n.p.step === 4), 'a four-note G7 without the 9th keeps its root');
const q3 = qs[2];
const resp3 = q3.answer.map((col) => col.map((p) => Object.assign({}, p)));
ok(MQ.gradeQuestion(q3, resp3, back) === 1, 'the model answer is right (3)');
const bad = resp3.map((col) => col.slice());
bad[0] = bad[0].filter((p) => p.st === 1).concat(['Bb4', 'D5', 'F5', 'A5'].map(P));   // B♭ma9 with its root in the block
const c = MQ.compareBlock(q3, bad, back);
ok(c.wrong === 1 && c.chords[0].flags.some((f) => f.id === 'root'), 'a root in the block is marked', JSON.stringify(c.chords[0].flags));
ok(MQ.gradeBlock(q3, bad, back, { 0: true }) === 1, 'the teacher can accept a chord');
ok(MQ.gradeBlock(q3, resp3, back, { 1: false }) === 2 / 3, 'the teacher can reject a chord');
const marks = MQ.markResponse(q3, bad, back);
ok(marks[0].some((m) => m === false) && marks[1].every((m) => m === true), 'the staff marks the notes a rule is about', JSON.stringify(marks));
const answers = [resp, null, bad];
const items = qs.map((qq, i) => {
  const cmp = MQ.compareBlock(qq, answers[i], back);
  return { type: 'block', clef: 'grand', credit: 0, answered: !!answers[i], sec: 30, notes: cmp.notes, wrong: cmp.wrong };
});
const rcode = MQ.encodeReport({ name: 'Test Student', submittedAt: Date.now(), totalSec: 90, partial: true, items, attempt: 1, scoring: { mode: 'notes', outOf: 100, split: 0 }, answers: { qs, resp: answers } }, back, code);
const rep = MQ.decodeReport(rcode);
ok(rep.items.every((it) => it.type === 'block'), 'report: question types', rep.items.map((it) => it.type).join(','));
ok(rep.items[2].notes === 3 && rep.items[2].wrong === 1 && rep.items[1].wrong === 4, 'report: chords and wrong chords', JSON.stringify(rep.items));
const again = MQ.answerFor(qs[2], rep.answers[2]);
ok(JSON.stringify(again.map((col) => col.map(MQ.fullName))) === JSON.stringify(bad.map((col) => col.map(MQ.fullName))), 'report: the student’s notes come back', JSON.stringify(again));
ok(rep.verifySeal(back), 'report: the seal matches the quiz');
const st = MQ.reportStats(rep);
ok(st.n === 11 && st.points === 6, 'report: every chord a point', `${st.points}/${st.n}`);

console.log(`${passes} passed, ${fails} failed (${CASES.length} rule cases, ${models} model answers).`);
process.exit(fails ? 1 : 0);
