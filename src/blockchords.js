/* Clefwork Voice Leading — Block Chords. The teacher writes the chord symbols of each exercise and how
   many notes the block should have; students write a block voicing for every chord on the grand staff
   in half notes (or whole notes), with the root low in the bass clef — printed for them, or written.
   There is no single right answer, so each chord is checked against the rules for block voicings in
   the course textbook (Music Theory, Unit 5 — Block Voicings):
     Rule 1  Keep the voicing within an octave.
     Rule 2  Leave the root out — the bass covers it.
     Rule 3  Avoid duplicating notes: each note a different chord tone.
     Rule 4  Avoid a major or minor second between the top two notes.
     Rule 7  Leave out extra notes, the 5th first — the 3rd and 7th come first, then every note
             written in the symbol (the 13 in C13, the ♭5 in Cmi7♭5); when they don't all fit, the 3rd
             and 7th and any of the others.
     Rule 8  Use the right number of notes (the teacher sets it).
   The teacher may allow the root in the block (as its octave). Otherwise the root, like a doubled note,
   is only wrong when the chord has enough other tones to fill the block
   (a three-note block of a C triad needs its octave), and a 9th may stand in for the root of a seventh
   chord (Rule 2). Every chord is a point. The teacher sees each chord's marks and can accept or reject
   any chord as a variation; those choices are kept on the teacher's device (see app.js). */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const { dia, midi, fromDia, pcName, fullName } = MQ;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const BLOCK_MAX = 10;            // exercises in a quiz
  const BLOCK_CHORDS = 8;          // chords in an exercise (four measures of half notes)
  const BLOCK_VOICES = [2, 3, 4, 5];
  const D = (name) => { const m = name.match(/^([A-G])(\d)$/); return (+m[2]) * 7 + 'CDEFGAB'.indexOf(m[1]); };
  const ROOT_FLOOR = D('E2');      // a printed root sits from E2 up to D3, low in the bass clef
  const ROOT_CEIL = midi({ step: 1, oct: 3, alt: 0 });   // D3, the bass clef's middle line
  const MODEL_FLOOR = D('C4');     // a model answer's block starts at middle C or just above

  // The textbook's rules, for the teacher's reference list and the marks.
  const RULES = [
    { n: 1, id: 'span', title: 'Keep the voicing within an octave' },
    { n: 2, id: 'root', title: 'Leave the root out' },
    { n: 3, id: 'double', title: 'Avoid duplicating notes' },
    { n: 4, id: 'top', title: 'Avoid seconds on the top' },
    { n: 7, id: 'need', title: 'Leave out extra notes — the 5th first' },
    { n: 8, id: 'count', title: 'Use the right number of notes' },
  ];

  // ---------- settings ----------
  // gen: the generator's version. root: 0 printed in the bass clef, 1 students write it.
  // value: 0 half notes, 1 whole notes. ninth: a 9th may replace the root of a seventh chord.
  // bottom: the block's lowest note must be a chord tone (1, 3, 5 or 7). octave: the root may be in
  // the block (as its octave). voices: how many notes each block has, for every exercise.
  // ex: the exercises — chord symbols as the teacher typed them (each carries the block size too).
  function blockSettings(block) {
    const b = block || {};
    b.gen = 1;
    b.root = b.root ? 1 : 0;
    b.value = b.value ? 1 : 0;
    b.ninth = b.ninth == null ? 1 : b.ninth ? 1 : 0;
    b.bottom = b.bottom ? 1 : 0;
    b.octave = b.octave == null ? 1 : b.octave ? 1 : 0;
    const first = Array.isArray(b.ex) && b.ex[0] && +b.ex[0].voices;
    b.voices = BLOCK_VOICES.includes(+b.voices) ? +b.voices : BLOCK_VOICES.includes(first) ? first : 4;
    // Each exercise is tidied where it is, never copied: the builder's rows keep editing these objects
    // while the quiz is read again on every keystroke.
    b.ex = (Array.isArray(b.ex) ? b.ex : []).filter((e) => e && typeof e === 'object').slice(0, BLOCK_MAX);
    b.ex.forEach((e) => { e.chords = String(e.chords || ''); e.voices = b.voices; });
    return b;
  }

  // ---------- chord symbols ----------
  // Clefwork's voicing symbols, plus add9 (C(add9), Cadd9) and 6/9 (C6/9, C69).
  function parseBlockSymbol(text) {
    let s = String(text || '').trim().replace(/♭/g, 'b').replace(/♯/g, '#');
    if (!s) return null;
    const added = [];
    s = s.replace(/\(?add\s*([b#]?)(9|11|13)\)?/gi, (all, a, d) => { added.push(a + d); return ''; });
    s = s.replace(/6\/9|69(?!\d)/, () => { added.push('9'); return '6'; });
    const ch = MQ.parseVoiceSymbol(s);
    if (!ch) return null;
    const SEMI = { 9: 14, 11: 17, 13: 21 };
    ch.added = [];
    added.forEach((a) => {
      const deg = +a.replace(/[b#]/, ''), sh = a[0] === 'b' ? -1 : a[0] === '#' ? 1 : 0;
      if (ch.has.includes(deg)) return;
      ch.has.push(deg);
      ch.semis[deg] = SEMI[deg] + sh;
      ch.degOf[deg] = deg;
      if (sh) ch.alts.push(a);
      ch.added.push(deg);
    });
    ch.has.sort((x, y) => x - y);
    return ch;
  }
  // An exercise's chord symbols: separated by spaces, commas or bar lines.
  const splitChords = (text) => String(text || '').split(/[\s,|]+/).map((t) => t.trim()).filter(Boolean);
  const shownSymbol = (t) => MQ.prettySymbol(String(t).replace(/♭/g, 'b').replace(/♯/g, '#'));
  // The symbols that can't be read, and whether there are too many, for the builder's warnings.
  function exerciseProblems(e) {
    const list = splitChords(e.chords);
    // A symbol travels in the quiz code in at most 15 bytes.
    const bad = list.filter((t) => !parseBlockSymbol(t) || new TextEncoder().encode(t.replace(/♭/g, 'b').replace(/♯/g, '#')).length > 15);
    return { list, bad, tooMany: list.length > BLOCK_CHORDS, empty: !list.length };
  }
  const exerciseOk = (e) => { const p = exerciseProblems(e); return !p.empty && !p.bad.length; };
  const usableExercises = (b) => blockSettings(b).ex.filter(exerciseOk);

  // ---------- what a block of this chord needs ----------
  const ORD = { 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 9: '9th', 11: '11th', 13: '13th' };
  const alteredDeg = (ch, d) => ch.alts.some((a) => a.slice(1) === String(d));
  // A chord tone's name as students know it: 3rd (4th in a sus4 chord), ♭5, ♯9, 13th …
  function degLabel(ch, d) {
    if (d === 1) return 'root';
    if (d === 3 && ch.quality === 'sus') return ch.degOf[3] === 2 ? '2nd' : '4th';
    const a = ch.alts.find((x) => x.slice(1) === String(d));
    if (a) return (a[0] === 'b' ? '♭' : '♯') + d;
    if (d === 7 && ch.quality === 'dim' && ch.semis[7] === 9) return '°7th';
    return ORD[d] || String(d);
  }
  // Every tone a block may use: {deg, p, need, sub}. `need`: the 3rd, the 7th (or 6th), every altered
  // or added note, the extension the symbol names, and a triad's (or altered) 5th. `sub`: a 9th
  // standing in for the root.
  function chordPlan(ch, set) {
    const has = (d) => ch.has.includes(d);
    const triad = !has(7) && !has(6);
    const top = [13, 11, 9].find((d) => has(d) && !alteredDeg(ch, d) && !(ch.added || []).includes(d));
    const tones = [];
    ch.has.forEach((d) => {
      if (d === 1) return;
      const p = MQ.chordTone(ch, d);
      if (!p) return;
      const need = d === 3 || d === 7 || d === 6 || alteredDeg(ch, d) || (ch.added || []).includes(d) || d === top
        || (d === 5 && (triad || ch.quality === 'dim' || ch.quality === 'aug'));
      tones.push({ deg: d, p, need, sub: false });
    });
    if (set.ninth && has(7) && !has(9) && !(ch.quality === 'dim' && ch.semis[7] === 9)) {
      const r = { step: ch.root.step, oct: 4, alt: ch.root.alt };
      const t = MQ.transpose(r, 9, 14, 1);
      tones.push({ deg: 9, p: { step: t.step, alt: t.alt }, need: false, sub: true });
    }
    const rootTone = { deg: 1, p: { step: ch.root.step, alt: ch.root.alt }, need: false, sub: false };
    return { ch, tones, rootTone, bass: ch.bass && !(ch.bass.step === ch.root.step && ch.bass.alt === ch.root.alt) ? ch.bass : null };
  }

  // ---------- checking one chord ----------
  const pcEq = (a, b, enh) => (enh ? (((midi({ ...a, oct: 4 }) - midi({ ...b, oct: 4 })) % 12) + 12) % 12 === 0 : a.step === b.step && a.alt === b.alt);
  const name = (p) => pcName(p);
  const intervalName = (lo, hi) => {
    const n = dia(hi) - dia(lo) + 1;
    return n === 8 ? 'an octave' : n === 2 ? 'a second' : `a${n === 11 ? 'n' : ''} ${ORD[n] || n + 'th'}`;
  };
  const listText = (items) => (items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]);

  // voice: the block's notes, lowest first. bass: the note under it in the bass clef (null when the
  // student hasn't written one), and whether the student wrote it. Returns {ok, flags}; each flag has
  // the rule it breaks (a number, or null for the bass), its text, and which notes it is about
  // (indexes into voice; 'bass' for the bass note).
  function checkChord(plan, voice, bass, N, o) {
    const { ch, tones, rootTone } = plan;
    const enh = !!o.enharmonic;
    const flags = [];
    const add = (id, rule, text, notes) => flags.push({ id, rule, text, notes: notes || [] });
    const sym = shownSymbol(o.symbol || ch.symbol);
    // The bass, when students write it.
    if (o.writeBass) {
      const want = plan.bass || rootTone.p, what = plan.bass ? 'bass note' : 'root';
      if (!bass) add('nobass', null, `Write the ${what}, ${name(want)}, low in the bass clef.`);
      else if (!pcEq(bass, want, enh)) add('bass', null, pcEq(bass, want, true)
        ? `Spell the ${what} as ${name(want)}, not ${name(bass)}.`
        : `The note in the bass should be the ${what}, ${name(want)} — not ${name(bass)}.`, ['bass']);
      else if (midi(bass) > ROOT_CEIL || (voice.length && midi(bass) >= midi(voice[0]))) {
        add('low', null, `Write the ${what} lower — at or below D3, the middle line of the bass clef, under the block.`, ['bass']);
      }
    }
    if (!voice.length) { add('empty', 8, `No block written yet — it needs ${N} notes.`); return { ok: false, flags }; }
    // Which chord tone each note is (null: not in the chord).
    const avail = tones.length;
    const rootOk = !!o.octave || N > avail, doubleOk = N > avail + 1;
    // A note spelled as another (D♯ for E♭) is marked for its spelling, and otherwise counts as the
    // tone it sounds as.
    const all = [rootTone].concat(tones);
    const roles = voice.map((p) => all.find((t) => pcEq(p, t.p, enh)) || all.find((t) => pcEq(p, t.p, true)) || null);
    // Rule 8: as many notes as the exercise asks for.
    if (voice.length > N) add('count', 8, `${voice.length} notes in the block — this exercise allows ${N}. Take ${voice.length - N > 1 ? voice.length - N + ' notes' : 'one'} out.`);
    else if (voice.length < N) add('count', 8, `${voice.length} note${voice.length === 1 ? '' : 's'} in the block — this exercise asks for ${N}.`);
    // Notes that aren't in the chord, or are spelled as another note.
    voice.forEach((p, i) => {
      if (!roles[i]) add('tone', null, `${name(p)} isn’t in ${sym}.`, [i]);
      else if (!pcEq(p, roles[i].p, enh)) add('spell', null, `Spell ${name(p)} as ${name(roles[i].p)}, the ${degLabel(ch, roles[i].deg)} of ${sym}.`, [i]);
    });
    // Rule 2: the root belongs to the bass — unless the block has nothing else to fill it.
    const rootAt = voice.map((p, i) => (roles[i] === rootTone ? i : -1)).filter((i) => i >= 0);
    if (rootAt.length && !rootOk) add('root', 2, `The root, ${name(rootTone.p)}, belongs in the bass — leave it out of the block${tones.some((t) => t.sub) ? ' (a 9th can take its place)' : ''}.`, rootAt);
    // Rule 3: each note a different chord tone.
    const groups = new Map();
    voice.forEach((p, i) => {
      if (!roles[i]) return;
      const k = roles[i].deg;
      groups.set(k, (groups.get(k) || []).concat(i));
    });
    const doubled = [...groups.entries()].filter(([, at]) => at.length > 1);
    const extra = doubled.reduce((s, [, at]) => s + at.length - 1, 0);
    if (doubled.length && !(doubleOk && extra <= N - avail - 1)) {
      doubled.forEach(([deg, at]) => add('double', 3, `${name(voice[at[0]])} (the ${degLabel(ch, deg)}) is doubled — make each note a different chord tone.`, at.slice(1)));
    }
    // Rule 1: within an octave.
    const lo = voice[0], hi = voice[voice.length - 1];
    if (midi(hi) - midi(lo) > 12) add('span', 1, `The block spans ${intervalName(lo, hi)}, ${fullName(lo)} to ${fullName(hi)} — keep it within an octave.`, [0, voice.length - 1]);
    // Rule 4: no second between the top two notes.
    if (voice.length >= 2) {
      const a = voice[voice.length - 2], gap = midi(hi) - midi(a);
      if (gap === 1 || gap === 2) {
        add('top', 4, `${gap === 1 ? 'A half step' : 'A whole step'} (${name(a)}–${name(hi)}) between the top two notes — leave out the note just below the top.`, [voice.length - 2, voice.length - 1]);
      }
    }
    // Rule 7: the chord symbol decides what the block needs. First the 3rd and the 7th (or the 6th
    // that takes its place); then every extension, alteration or added note written in the symbol (the
    // 13 in C13, the ♭5 in Cmi7♭5, the 9 in Cadd9 — and a triad's 5th). Those come before a 5th, the
    // octave or a 9th that only stands in for the root. When the symbol asks for more notes than the
    // block holds, the 3rd and 7th go in first and the rest of the block is any of the others.
    const tier1 = tones.filter((t) => t.need && (t.deg === 3 || t.deg === 7 || (t.deg === 6 && !tones.some((x) => x.deg === 7))));
    const tier2 = tones.filter((t) => t.need && !tier1.includes(t));
    const has = (t) => roles.includes(t);
    const want1 = Math.min(N, tier1.length), want2 = Math.min(tier2.length, Math.max(0, N - tier1.length));
    const miss1 = tier1.filter((t) => !has(t)), got2 = tier2.filter(has).length;
    const short1 = tier1.length - miss1.length < want1, short2 = got2 < want2;
    if (short1 || short2) {
      // The notes that took a needed note's place: a 5th, the root, a stand-in 9th, a doubled note.
      const spare = voice.map((p, i) => i).filter((i) => roles[i] && (!roles[i].need || roles.indexOf(roles[i]) !== i));
      const nm = (t) => `${degLabel(ch, t.deg)} (${name(t.p)})`;
      const parts = [];
      if (short1) parts.push(`Missing the ${listText(miss1.map(nm))} — the 3rd and 7th come first: they tell us the chord’s quality`);
      if (short2) {
        const miss2 = tier2.filter((t) => !has(t));
        parts.push(tier2.length <= N - tier1.length
          ? `${short1 ? 'and' : 'Missing'} the ${listText(miss2.map(nm))} — ${sym} asks for ${miss2.length > 1 ? 'them' : 'it'}`
          : `${short1 ? 'and' : 'Use'} ${want2 - got2 > 1 ? 'more' : 'another'} of the notes ${sym} asks for — ${listText(miss2.map(nm)).replace(/ and /, ' or ')} — after the 3rd and 7th`);
      }
      const out = [...new Set(spare.map((i) => (roles[i] === rootTone ? 'octave' : roles[i].need ? 'doubled ' + name(voice[i]) : degLabel(ch, roles[i].deg))))];
      const what = out.length ? ` Leave out the ${listText(out).replace(/ and (?!.* and )/, ' or ')} instead.` : '';
      add('need', 7, parts.join(', ') + '.' + what, spare);
    }
    // The assignment's variation: the block's lowest note is a chord tone (1, 3, 5 or 7).
    if (o.bottom && roles[0] && ![1, 3, 5, 7].includes(roles[0].deg)) {
      add('bottom', null, `Put a chord tone (root, 3rd, 5th or 7th) on the bottom of the block — ${name(lo)} is the ${degLabel(ch, roles[0].deg)}.`, [0]);
    }
    return { ok: !flags.length, flags };
  }

  // ---------- a model answer ----------
  // The root low in the bass clef, E2 to D3.
  function lowNote(p) {
    const d = ROOT_FLOOR + ((p.step - (ROOT_FLOOR % 7)) + 7) % 7;
    return Object.assign(fromDia(d, p.alt), { st: 1 });
  }
  // Stack pitch classes upward in close position from the first, starting at or above `floor`.
  function closeStack(pcs, floor) {
    const out = [];
    pcs.forEach((p, i) => {
      let d = i ? dia(out[i - 1]) + 1 : floor;
      d += ((p.step - (d % 7)) + 7) % 7;
      let n = fromDia(d, p.alt);
      if (i && midi(n) <= midi(out[i - 1])) n = fromDia(d + 7, p.alt);
      out.push(n);
    });
    return out;
  }
  // The block the rules like best, near the middle of the treble staff: every choice of notes and
  // every note on the bottom, checked by the same rules students are, preferring blocks without the
  // root or a 9th in its place, with a chord tone on the bottom.
  function modelBlock(plan, N, o) {
    const pool = plan.tones.concat([plan.rootTone]);
    const need = plan.tones.filter((t) => t.need);
    let best = null;
    const tryPicks = (picks) => {
      for (let r = 0; r < picks.length; r++) {
        const order = picks.slice(r).concat(picks.slice(0, r));
        // Lowest note first; the rest in the order they come above it (a doubled note an octave up).
        const above = (t) => ((midi({ ...t.p, oct: 4 }) - midi({ ...order[0].p, oct: 4 })) % 12 + 12) % 12 || 12;
        const pcs = [order[0]].concat(order.slice(1).sort((a, b) => above(a) - above(b))).map((t) => t.p);
        const voice = closeStack(pcs, MODEL_FLOOR).sort((a, b) => midi(a) - midi(b));
        const chk = checkChord(plan, voice, null, N, Object.assign({}, o, { writeBass: false }));
        const mid = (midi(voice[0]) + midi(voice[voice.length - 1])) / 2;
        const score = chk.flags.length * 100 + Math.abs(mid - 69) / 4
          + (picks.includes(plan.rootTone) ? 3 : 0) + (picks.some((t) => t.sub) ? 1 : 0)
          + ([1, 3, 5, 7].includes(order[0].deg) ? 0 : 1.5) + (picks.some((t) => t.deg === 5 && !t.need) ? 0.5 : 0);
        if (!best || score < best.score) best = { score, voice };
      }
    };
    const k = Math.min(N, pool.length);
    // A block bigger than the chord doubles some of its notes: try each.
    const pad = (picks, from) => {
      if (picks.length === N) { tryPicks(picks); return; }
      for (let i = from; i < pool.length; i++) pad(picks.concat([pool[i]]), i);
    };
    const combo = (start, acc) => {
      if (acc.length === k) { pad(acc.slice(), 0); return; }
      for (let i = start; i < pool.length; i++) { acc.push(pool[i]); combo(i + 1, acc); acc.pop(); }
    };
    combo(0, []);
    return best ? best.voice : [];
  }

  // ---------- questions ----------
  function blockQuestions(cfg) {
    const b = blockSettings(cfg.block);
    const list = b.ex.filter(exerciseOk);
    const n = Math.min(list.length, cfg.counts && cfg.counts.block != null ? cfg.counts.block : list.length);
    const enh = !!(cfg.flags && cfg.flags.enharmonic);
    return list.slice(0, n).map((e, i) => {
      const syms = splitChords(e.chords).slice(0, BLOCK_CHORDS);
      const N = e.voices;
      const chords = syms.map((s) => parseBlockSymbol(s));
      const plans = chords.map((ch) => chordPlan(ch, b));
      const roots = plans.map((pl) => lowNote(pl.bass || pl.rootTone.p));
      const models = plans.map((pl, k) => modelBlock(pl, N, { enharmonic: enh, bottom: b.bottom, octave: b.octave, symbol: syms[k] }));
      const printed = !b.root;
      const what = plans.some((pl) => pl.bass) ? 'bass notes' : 'roots';
      return {
        type: 'block', clef: 'grand', grand: true,
        text: `Write a ${N}-note block voicing for ${syms.length === 1 ? 'this chord' : `each of these ${syms.length} chords`}.`,
        hint: (printed ? `The ${what} are printed low in the bass clef. ` : `Write each chord’s ${what === 'roots' ? 'root' : 'bass note'} low in the bass clef, then its block above. `)
          + `Each block: ${N} different chord tones within an octave${b.octave ? ' (the root may be one of them, as the octave)' : ', no root'}, no second between the top two notes. The 3rd and 7th come first, then the extensions in the symbol.`,
        // Room for two notes too many, so a block with extra notes can be written — and marked (Rule 8).
        columns: roots.map((r) => ({ given: printed ? [r] : [], cap: N + 2 + (printed ? 0 : 1) })),
        chordLabels: { top: syms.map(shownSymbol) },
        answer: models.map((m, k) => (printed ? m : [roots[k]].concat(m))),
        blk: { n: i, syms, voices: N, root: b.root, value: b.value, ninth: b.ninth, bottom: b.bottom, octave: b.octave },
        sig: 'bk' + i + syms.join('') + N + b.root, tags: syms.map((s) => 'bk:' + s),
      };
    });
  }
  // The plan for each chord of a question (rebuilt as needed; questions carry only the symbols).
  const plansOf = (q) => {
    if (!q._plans) Object.defineProperty(q, '_plans', { value: q.blk.syms.map((s) => chordPlan(parseBlockSymbol(s), q.blk)), enumerable: false });
    return q._plans;
  };
  // One column of a student's answer: the bass note and the block, each note with its index among
  // the placed notes (-1 for a printed note). When students write the bass, it is the lowest note on
  // the bass staff; anything else is part of the block.
  function splitColumn(q, i, placed) {
    const notes = ((placed && placed[i]) || []).map((p, k) => (p ? { p, k } : null)).filter(Boolean);
    let bass = null, voice;
    if (!q.blk.root) { const g = q.columns[i].given[0]; bass = g ? { p: g, k: -1 } : null; voice = notes; }
    else {
      const low = notes.filter((n) => n.p.st === 1).sort((a, b) => midi(a.p) - midi(b.p) || dia(a.p) - dia(b.p))[0] || null;
      bass = low;
      voice = notes.filter((n) => n !== low);
    }
    voice.sort((a, b) => midi(a.p) - midi(b.p) || dia(a.p) - dia(b.p));
    return { bass, voice };
  }
  // Every chord of a question, checked: {notes (chords), wrong, chords: [{ok, flags, ...}]}.
  function compareBlock(q, resp, cfg) {
    const plans = plansOf(q);
    const o = { enharmonic: !!(cfg && cfg.flags && cfg.flags.enharmonic), bottom: !!q.blk.bottom, octave: !!q.blk.octave, writeBass: !!q.blk.root };
    const chords = plans.map((pl, i) => {
      const { bass, voice } = splitColumn(q, i, resp);
      const chk = checkChord(pl, voice.map((n) => n.p), bass ? bass.p : null, q.blk.voices, Object.assign({}, o, { symbol: q.blk.syms[i] }));
      return Object.assign(chk, { symbol: shownSymbol(q.blk.syms[i]), voice, bass });
    });
    return { notes: chords.length, wrong: chords.filter((c) => !c.ok).length, chords };
  }
  // overrides (optional): {chord index: true | false} — the teacher's own verdicts.
  function gradeBlock(q, resp, cfg, overrides) {
    const c = compareBlock(q, resp, cfg);
    const right = c.chords.filter((x, i) => (overrides && overrides[i] != null ? overrides[i] : x.ok)).length;
    return c.notes ? right / c.notes : 0;
  }
  const hasBlockAnswer = (q, resp) => !!resp && resp.some((col) => col && col.some(Boolean));
  // For the staff: false for a note a rule is about, true for every note of a chord that passes, and
  // null (unmarked) for the other notes of a chord with problems.
  function markBlock(q, placed, cfg) {
    const c = compareBlock(q, placed, cfg);
    return q.columns.map((col, i) => {
      const res = (placed && placed[i]) || [];
      const chk = c.chords[i];
      const out = res.map(() => (chk.ok ? true : null));
      chk.flags.forEach((f) => f.notes.forEach((j) => {
        const n = j === 'bass' ? chk.bass : chk.voice[j];
        if (n && n.k >= 0) out[n.k] = false;
      }));
      return out;
    });
  }
  // One good answer for each chord: the bass note, then the block from the bottom up.
  function describeBlock(q) {
    return 'For example ' + q.blk.syms.map((s, i) => {
      const notes = q.columns[i].given.concat(q.answer[i]);
      const bass = notes.filter((p) => p.st === 1).slice(0, 1), block = notes.filter((p) => !bass.includes(p));
      return `${shownSymbol(s)}: ${bass.map(fullName).join('')} | ${block.map(fullName).join(' ')}`;
    }).join(' · ');
  }

  Object.assign(MQ, {
    BLOCK_MAX, BLOCK_CHORDS, BLOCK_VOICES, BLOCK_RULES: RULES,
    blockSettings, parseBlockSymbol, splitBlockChords: splitChords, blockSymbolShown: shownSymbol, blockExerciseProblems: exerciseProblems,
    blockExerciseOk: exerciseOk, usableBlockExercises: usableExercises, blockChordPlan: chordPlan, checkBlockChord: checkChord,
    modelBlock, blockQuestions, compareBlock, gradeBlock, hasBlockAnswer, markBlock, describeBlock, blockDegLabel: degLabel,
  });
})(typeof window !== 'undefined' ? window : globalThis);
