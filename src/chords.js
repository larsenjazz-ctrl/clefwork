/* Clefwork — chord spelling by note names.
   - Chord-symbol analysis (which extensions a symbol has, and which notes it alters).
   - Name-based grading: a chord answer is a set of note names; octave and order don't matter.
     Optional notes: the 5th in 11th/13th chords, the root in any 9th chord, a natural 9th in
     11th/13th chords, and a natural 11th in 13th chords. Notes the symbol alters (♭9, ♯11, ♭5 …)
     are always required, and an altered note the symbol doesn't ask for is wrong.
   - The chord generator for "Build a chord" questions (qualities × sizes × alterations). */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const { dia, midi, fromDia, pcName, fullName, transpose } = MQ;
  const semisAbove = (r, p) => (((midi({ step: p.step, oct: 4, alt: p.alt }) - midi({ step: r.step, oct: 4, alt: r.alt })) % 12) + 12) % 12;
  const degAbove = (r, p) => (((p.step - r.step) % 7) + 7) % 7;
  const pc = (p) => ({ step: p.step, alt: p.alt });
  const tone = (r, n, s) => pc(transpose({ step: r.step, oct: 4, alt: r.alt }, n, s, 1));

  // ---------- symbol analysis ----------
  function analyzeSymbol(sym) {
    const s = String(sym || '').replace(/♭/g, 'b').replace(/♯/g, '#').replace(/\s+/g, '');
    const m = s.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!m) return null;
    const rest = MQ.normalizeSuffix(m[3]); // accepts mi/ma/-/+ spellings
    const altered = new Set((rest.match(/[#b](5|9|11|13)/g) || []));
    if (/\+|aug/.test(rest)) altered.add('#5');
    if (/dim|°|o(?!\d)|ø/.test(rest)) altered.add('b5');
    const has11 = /11/.test(rest), has13 = /13/.test(rest);
    return {
      root: { step: 'CDEFGAB'.indexOf(m[1].toUpperCase()), alt: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 },
      // 11th and 13th chords contain a 9th, so they count as having one.
      has9: /9/.test(rest) || has11 || has13, has11, has13, altered,
    };
  }

  // ---------- name-based answer spec ----------
  // notes: the chord's notes (teacher's or generated). bass: a printed bass note, or null.
  function nameSpec(root, notes, info, bass) {
    const key = (p) => p.step * 10 + p.alt;
    const seen = new Set(), required = [], optional = [];
    const isOptional = (p) => {
      const d = degAbove(root, p), s = semisAbove(root, p);
      const ext = info.has11 || info.has13;
      return (d === 0 && s === 0 && info.has9)            // root/octave in any 9th chord
        || (d === 4 && s === 7 && ext)                     // perfect 5th in 11th and 13th chords
        || (d === 1 && s === 2 && ext)                     // natural 9th in 11th and 13th chords
        || (d === 3 && s === 5 && info.has13);             // natural 11th in 13th chords
    };
    notes.forEach((n) => {
      const p = pc(n);
      if (seen.has(key(p)) || (bass && key(p) === key(bass))) return;
      seen.add(key(p));
      (isOptional(p) ? optional : required).push(p);
    });
    // Notes a student may add even if they aren't in the teacher's chord.
    const extra = [];
    const ext = info.has11 || info.has13;
    if (info.has9) extra.push(pc(root));
    if (ext) extra.push(tone(root, 5, 7), tone(root, 9, 14));
    if (info.has13) extra.push(tone(root, 11, 17));
    if (bass) extra.push(pc(bass)); // doubling the printed bass note is fine
    return { required, optional, extra, bassDia: bass ? dia(bass) : null };
  }

  const pcEq = (a, b, enh) => (enh ? semisAbove(a, b) === 0 : a.step === b.step && a.alt === b.alt);
  // Per placed note: true when its name belongs to the chord (and it sits above a printed bass note).
  function markNames(q, placed, cfg) {
    const sp = q.nameSpec, enh = cfg.flags.enharmonic;
    const ok = sp.required.concat(sp.optional, sp.extra);
    return q.columns.map((_, i) => ((placed && placed[i]) || []).map((p) =>
      !!p && (sp.bassDia == null || dia(p) > sp.bassDia) && ok.some((o) => pcEq(o, p, enh))));
  }
  function gradeNames(q, placed, cfg) {
    const sp = q.nameSpec, enh = cfg.flags.enharmonic;
    const notes = [].concat(...((placed || []).map((c) => c || []))).filter(Boolean);
    const marks = [].concat(...markNames(q, placed, cfg));
    const wrong = marks.filter((m) => !m).length;
    const got = sp.required.filter((r) => notes.some((p, i) => marks[i] && pcEq(r, p, enh))).length;
    return sp.required.length ? Math.max(0, got - wrong) / sp.required.length : wrong ? 0 : 1;
  }
  // Chords the student spells out: the right note names, and — when the question fixes a bass note
  // (an inversion, or a figured bass) — the right note at the bottom.
  function lowestOf(placed) {
    const notes = [].concat(...((placed || []).map((c) => c || []))).filter(Boolean);
    return notes.length ? notes.reduce((a, b) => (dia(b) < dia(a) ? b : a)) : null;
  }
  function gradeSpelled(q, placed, cfg) {
    const names = gradeNames(q, placed, cfg);
    if (!q.bassPc) return names;
    const low = lowestOf(placed);
    if (!low) return 0;
    const bassOk = low.step === q.bassPc.step && low.alt === q.bassPc.alt;
    const need = q.nameSpec.required.length + 1;
    return Math.max(0, (names * q.nameSpec.required.length + (bassOk ? 1 : 0)) / need);
  }
  function markSpelled(q, placed, cfg) {
    const marks = markNames(q, placed, cfg);
    const low = q.bassPc && lowestOf(placed);
    if (low && (low.step !== q.bassPc.step || low.alt !== q.bassPc.alt)) {
      (placed || []).forEach((col, ci) => (col || []).forEach((p, i) => { if (p === low) marks[ci][i] = false; }));
    }
    return marks;
  }
  function describeNames(q) {
    const sp = q.nameSpec;
    const req = sp.required.map((p) => pcName({ ...p, oct: 4 })).join('  ');
    const opt = sp.optional.map((p) => pcName({ ...p, oct: 4 })).join(' ');
    const bass = q.bassPc ? `, ${pcName({ ...q.bassPc, oct: 4 })} in the bass` : '';
    return req + (opt ? `  (optional: ${opt})` : '') + ' — any octave, any order' + bass;
  }

  // ---------- custom chord questions ----------
  function customQuestion(c, cfg) {
    const helper = cfg && MQ.helpersOn(cfg, 'custom');
    const notes = c.notes.slice().sort((a, b) => dia(a) - dia(b));
    const info = analyzeSymbol(c.symbol) || { root: pc(notes[0]), has9: false, has11: false, has13: false, altered: new Set() };
    const spec = nameSpec(info.root, notes, info, null);
    // A chord whose lowest note isn't the root is written as a slash chord, and the bass note counts.
    const low = pc(notes[0]);
    const inverted = low.step !== info.root.step || low.alt !== info.root.alt;
    const shown = MQ.prettySymbol(c.symbol) + (inverted ? '/' + pcName({ ...low, oct: 4 }) : '');
    if (helper) {
      // The lowest note is printed and the student adds the rest.
      const rest = notes.slice(1);
      const spec2 = nameSpec(info.root, notes, info, low);
      return {
        type: 'custom', clef: c.clef, symbol: c.symbol, shownSymbol: shown, nameSpec: spec2, revealPc: true,
        text: `Build ${shown} on the staff.`,
        hint: 'The lowest note is printed. Add the rest — octave and order don’t matter.',
        columns: [{ given: [notes[0]], cap: rest.length + spec2.extra.length }],
        answer: [rest],
        sig: 'x' + c.symbol,
      };
    }
    return {
      type: 'custom', clef: c.clef, symbol: c.symbol, shownSymbol: shown, nameSpec: spec, revealPc: true,
      bassPc: inverted ? low : null,
      text: `Build ${shown} on the staff.`,
      hint: 'Write the notes of the chord. Octave and order don’t matter.',
      columns: [{ given: [], cap: notes.length + spec.extra.length }],
      answer: [notes],
      sig: 'x' + c.symbol,
    };
  }

  // ---------- generated chords ("Build a chord") ----------
  const QUALS = [
    { id: 'maj', label: 'Major', third: [3, 4], fifth: [5, 7], sizes: ['triad', '6', '7', '9', '13'], sevenths: [10, 11] },
    { id: 'min', label: 'Minor', third: [3, 3], fifth: [5, 7], sizes: ['triad', '6', '7', '9', '11', '13'], sevenths: [10] },
    { id: 'dim', label: 'Diminished', third: [3, 3], fifth: [5, 6], sizes: ['triad', '7'], sevenths: [10, 9] },
    { id: 'aug', label: 'Augmented', third: [3, 4], fifth: [5, 8], sizes: ['triad', '7', '9', '13'], sevenths: [10, 11] },
    { id: 'sus', label: 'Sus', third: [4, 5], fifth: [5, 7], sizes: ['triad', '7', '9', '13'], sevenths: [10] },
  ];
  const SIZES = [
    { id: 'triad', label: 'Triads' }, { id: '6', label: '6ths' }, { id: '7', label: '7ths' },
    { id: '9', label: '9ths' }, { id: '11', label: '11ths' }, { id: '13', label: '13ths' },
  ];
  const STAVES = [{ id: 'treble', label: 'Treble' }, { id: 'bass', label: 'Bass' }, { id: 'grand', label: 'Grand staff' }];
  const POSITION_NAMES = ['root position', 'first inversion', 'second inversion', 'third inversion'];
  const on = (mask, i) => !!(mask & (1 << i));

  // Picks a chord allowed by the teacher's settings and the rules, and spells it.
  function pickChord(rng, cfg, rootPitch) {
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const quals = QUALS.filter((_, i) => on(cfg.chordQual, i));
    const sizes = SIZES.filter((_, i) => on(cfg.chordSize, i)).map((s) => s.id);
    const combos = [];
    (quals.length ? quals : [QUALS[0]]).forEach((q) => q.sizes.forEach((z) => { if ((sizes.length ? sizes : ['triad']).includes(z)) combos.push([q, z]); }));
    if (!combos.length) combos.push([QUALS[0], 'triad']);
    const [Q, size] = pick(combos);
    const r = rootPitch;
    const tones = [{ n: 1, deg: 0, s: 0 }, { n: Q.third[0], s: Q.third[1] }, { n: 5, s: Q.fifth[1] }];
    let seventh = null;
    if (size === '6') tones.push({ n: 6, s: 9 });                       // a 6th replaces the 7th
    else if (size !== 'triad') { seventh = pick(Q.sevenths); tones.push({ n: 7, s: seventh }); } // 9/11/13 always have a 7th
    const exts = size === '9' ? [9] : size === '11' ? [9, 11] : size === '13' ? [9, 13] : [];
    const altered = [];
    const flat = on(cfg.chordAlt, 0), sharp = on(cfg.chordAlt, 1);
    exts.forEach((n) => {
      const opts = [];
      if (n === 9 && flat) opts.push(['b9', 13]);
      if (n === 9 && sharp && Q.id !== 'min') opts.push(['#9', 15]);
      if (n === 11 && sharp) opts.push(['#11', 18]);
      if (n === 13 && flat) opts.push(['b13', 20]);
      if (opts.length && rng() < 0.5) { const [lab, s] = pick(opts); tones.push({ n, s, alt: true }); altered.push(lab); }
      else tones.push({ n, s: { 9: 14, 11: 17, 13: 21 }[n] });
    });
    const pcs = tones.map((t) => ({ ...t, p: t.n === 1 ? pc(r) : tone(r, t.n, t.s) }));
    return { Q, size, seventh, exts, altered, tones: pcs, symbol: chordSymbol(r, Q, size, seventh, exts, altered) };
  }

  function chordSymbol(r, Q, size, seventh, exts, altered) {
    const naturalTop = exts.filter((n) => !altered.some((a) => a.endsWith(String(n)))).pop();
    const num = String(naturalTop || 7);
    // Written the Clefwork way: mi, ma, aug and ♭/♯ — augmented chords with a 7th show their ♯5.
    const altList = (Q.id === 'aug' && size !== 'triad' ? ['#5'] : []).concat(altered);
    const alts = altList.length ? `(${altList.join('').replace(/b/g, '♭').replace(/#/g, '♯')})` : '';
    let suf;
    if (size === 'triad') suf = { maj: '', min: 'mi', dim: '°', aug: 'aug', sus: 'sus4' }[Q.id];
    else if (size === '6') suf = Q.id === 'min' ? 'mi6' : '6';
    else if (Q.id === 'dim') suf = seventh === 9 ? '°7' : 'mi7♭5';
    else if (Q.id === 'sus') suf = num + 'sus4';
    else if (Q.id === 'min') suf = 'mi' + num;
    else suf = (seventh === 11 ? 'ma' : '') + num;
    return pcName({ ...r, oct: 4 }) + suf + alts;
  }

  // Build a chord in root position or an inversion (only the root, 3rd, 5th or 7th may be the bass).
  function generatedChord(rng, cfg, clefHint, lo, hi) {
    const override = MQ.STAFF_NAMES[(cfg.staffOv && cfg.staffOv.chord) || 0];
    const staves = STAVES.filter((_, i) => on(cfg.chordStaff, i)).map((s) => s.id);
    const staff = override !== 'quiz' ? override : staves.length ? staves[Math.floor(rng() * staves.length)] : clefHint;
    for (let k = 0; k < 300; k++) {
      const rootPitch = MQ.randPitchFor(rng, staff === 'grand' ? 'bass' : staff, cfg, lo, hi, 4);
      const ch = pickChord(rng, cfg, rootPitch);
      if (!ch.tones.every((t) => Math.abs(t.p.alt) <= 1)) continue;
      const hasSeventh = ch.tones.some((t) => t.n === 7);
      const positions = [0, 1, 2, 3].filter((i) => on(cfg.inversions || 1, i) && (i < 3 || hasSeventh));
      const inv = positions.length ? positions[Math.floor(rng() * positions.length)] : 0;
      const bassTone = ch.tones.find((t) => t.n === [1, 3, 5, 7][inv] || (inv === 1 && t.n === 4));
      const others = ch.tones.filter((t) => t !== bassTone);
      // Voicing shown as the answer: the others stacked closely above the bass.
      const place = (p, min) => { let d = Math.floor((min - p.step) / 7) * 7 + p.step; if (d < min) d += 7; return fromDia(d, p.alt); };
      const stackAbove = (bass, min) => {
        let m = Math.max(dia(bass) + 1, min);
        const byDeg = others.slice().sort((a, b) => degAbove(bassTone.p, a.p) - degAbove(bassTone.p, b.p) || semisAbove(bassTone.p, a.p) - semisAbove(bassTone.p, b.p));
        return byDeg.map((t) => { const p = place(t.p, m); m = dia(p) + 1; return p; });
      };
      let bass, upper;
      if (staff === 'grand') {
        bass = Object.assign(place(bassTone.p, 17), { st: 1 });          // F2–E3
        upper = stackAbove(bass, 28).map((p) => Object.assign(p, { st: 0 }));
      } else {
        // Centre the whole chord on the staff's middle line, within the teacher's ledger-line limit.
        const bottom = MQ.CLEFS[staff].bottom;
        let best = null;
        for (let base = bottom + lo; base <= bottom + hi; base++) {
          const b = place(bassTone.p, base);
          if (dia(b) !== base) continue;
          const u = stackAbove(b, 0);
          const top = dia(u[u.length - 1]);
          if (top - bottom > hi) continue;
          const score = Math.abs((dia(b) + top) / 2 - (bottom + 4));
          if (!best || score < best.score) best = { b, u, score };
        }
        if (!best) continue;
        bass = best.b; upper = best.u;
      }
      const info = { has9: ch.exts.length > 0, has11: ch.exts.includes(11), has13: ch.exts.includes(13) };
      const ask = cfg.chordAsk === 2 ? 'name' : cfg.chordAsk === 3 ? (rng() < 0.5 ? 'spell' : 'name') : 'spell';
      if (ask === 'name') {
        // The chord is printed and the student writes its chord symbol.
        const slash = inv ? ch.symbol + '/' + pcName({ ...bass, oct: 4 }) : ch.symbol;
        return {
          type: 'chord', clef: staff, grand: staff === 'grand', symbol: ch.symbol,
          symbolAnswer: { root: pc(rootPitch), q: ch.symbol, bass: inv ? pc(bass) : null, shown: slash },
          text: 'Write the chord symbol for the chord shown.',
          hint: 'For example Dmi7, G13, Cma7. A chord in an inversion can be written as a slash chord such as C/E.',
          columns: [{ given: [bass].concat(upper), cap: 0 }],
          answer: [[bass].concat(upper)],
          tags: ['ch:' + ch.Q.id + ch.size, 'pc:' + pcName({ ...rootPitch, oct: 4 }), 'inv:' + inv],
          sig: 'cn' + fullName(bass) + ch.symbol + inv + staff,
        };
      }
      const bare = !MQ.helpersOn(cfg, 'chord');
      const forced = MQ.STAFF_NAMES[(cfg.staffOv && cfg.staffOv.chord) || 0];
      const spec = nameSpec(pc(rootPitch), ch.tones.map((t) => t.p), info, bare ? null : bass);
      const tags = ['ch:' + ch.Q.id + ch.size, 'pc:' + pcName({ ...rootPitch, oct: 4 }), 'inv:' + inv];
      if (bare) {
        return {
          type: 'chord', clef: staff, grand: staff === 'grand', symbol: ch.symbol, nameSpec: spec, revealPc: true, bassPc: pc(bass),
          text: `Write ${ch.symbol} in ${POSITION_NAMES[inv]}.`,
          hint: 'Write every note of the chord, with the right one at the bottom. Octave and order don’t matter.',
          columns: [{ given: [], cap: spec.required.length + spec.optional.length + spec.extra.length + 1 }],
          answer: [[bass].concat(upper)],
          tags, sig: 'c2' + fullName(bass) + ch.symbol + inv + staff,
        };
      }
      return {
        type: 'chord', clef: staff, grand: staff === 'grand', symbol: ch.symbol, nameSpec: spec, revealPc: true,
        text: `Build ${ch.symbol} in ${POSITION_NAMES[inv]}.`,
        hint: 'The bass note is printed. Add the other chord tones above it — octave and order don’t matter.',
        columns: [{ given: [bass], cap: others.length + spec.extra.length }],
        answer: [upper],
        tags, sig: 'c2' + fullName(bass) + ch.symbol + inv + staff,
      };
    }
    return null;
  }

  // Marking a typed chord symbol: the right root and quality; a slash bass must be the right one.
  function gradeChordSymbol(q, resp, cfg) {
    const want = q.symbolAnswer;
    const got = MQ.parseSymbol(String(resp || '').trim());
    if (!got) return 0;
    const wantChord = MQ.parseSymbol(want.q);
    const enh = cfg.flags.enharmonic;
    const same = (a, b) => (enh ? semisAbove(a, b) === 0 : a.step === b.step && a.alt === b.alt);
    if (!wantChord || got.q !== wantChord.q || !same(got.root, wantChord.root)) return 0;
    if (got.bass && (!want.bass || !same(got.bass, want.bass))) return 0; // a slash bass must match
    return 1;
  }
  Object.assign(MQ, {
    gradeChordSymbol, analyzeSymbol, nameSpec, markNames, gradeNames, gradeSpelled, markSpelled, describeNames, customQuestionByNames: customQuestion,
    CHORD_QUALS: QUALS, CHORD_SIZES: SIZES, CHORD_STAVES: STAVES, generatedChord, pickChord,
  });
})(typeof window !== 'undefined' ? window : globalThis);
