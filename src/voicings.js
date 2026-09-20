/* Clefwork — chord voicings: build a chord from the teacher's complexity settings, then voice it
   with one of the techniques below. Every technique returns {notes, staff}; notes carry `st`
   (0 treble, 1 bass) when the voicing is written on a grand staff. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const { dia, midi, fromDia, pcName, transpose } = MQ;
  const D = (name) => { const m = name.match(/^([A-G])([#b]?)(\d)$/); return (+m[3]) * 7 + 'CDEFGAB'.indexOf(m[1]); };
  const M = (name) => { const m = name.match(/^([A-G])([#b]?)(-?\d)$/); return midi({ step: 'CDEFGAB'.indexOf(m[1]), oct: +m[3], alt: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 }); };
  // Landmarks the rules refer to.
  const LOW_ROOT = M('C2');        // two ledger lines below the bass staff
  const G3 = M('G3'), D3 = M('D3'), Eb3 = M('Eb3'), G4 = M('G4'), A3 = M('A3');
  const pc = (p) => ({ step: p.step, alt: p.alt });
  const samePc = (a, b) => a.step === b.step && a.alt === b.alt;

  // ---------- chords ----------
  const QUALITIES = [
    { id: 'maj', label: 'Major', third: [3, 4], fifth: [5, 7] },
    { id: 'min', label: 'Minor', third: [3, 3], fifth: [5, 7] },
    { id: 'aug', label: 'Augmented', third: [3, 4], fifth: [5, 8] },
    { id: 'dim', label: 'Diminished', third: [3, 3], fifth: [5, 6] },
    { id: 'sus', label: 'Suspended', third: [4, 5], fifth: [5, 7] },
  ];
  const SIZES = [
    { id: 'triad', label: 'Triads' }, { id: 'seventh', label: 'Sevenths' }, { id: 'ext', label: '9ths and above' },
  ];
  const KEY_KINDS = [
    { id: 'major', label: 'Major key' }, { id: 'minor', label: 'Minor key' },
    { id: 'dorian', label: 'Dorian mode' }, { id: 'chromatic', label: 'Chromatic (any chord)' },
  ];
  const ALTS = [['b5', 5, 6], ['#5', 5, 8], ['b9', 9, 13], ['#9', 9, 15], ['#11', 11, 18], ['b13', 13, 20]];

  // A chord: {root, quality, size, has (degrees), semis (degree → semitones), alts, bass}
  function makeChord(root, quality, size, opts) {
    const Q = QUALITIES.find((q) => q.id === quality) || QUALITIES[0];
    const o = opts || {};
    const semis = { 1: 0, 3: Q.third[1], 5: Q.fifth[1] };
    const degOf = { 1: 1, 3: Q.third[0], 5: 5 };
    const has = [1, 3, 5];
    if (size === 'sixth') { has.push(6); semis[6] = 9; degOf[6] = 6; }
    if (size === 'seventh' || size === 'ninth' || size === 'eleventh' || size === 'thirteenth') {
      has.push(7);
      semis[7] = o.seventh != null ? o.seventh : quality === 'dim' ? 9 : (quality === 'maj' || quality === 'aug') ? (o.majorSeventh ? 11 : 10) : 10;
      degOf[7] = 7;
    }
    if (size === 'ninth' || size === 'eleventh' || size === 'thirteenth') { has.push(9); semis[9] = 14; degOf[9] = 9; }
    if (size === 'eleventh') { has.push(11); semis[11] = 17; degOf[11] = 11; }
    if (size === 'thirteenth') { has.push(13); semis[13] = 21; degOf[13] = 13; }
    const alts = (o.alts || []).slice();
    alts.forEach((a) => {
      const row = ALTS.find((x) => x[0] === a);
      if (!row) return;
      const [, deg, sem] = row;
      semis[deg] = sem;
      degOf[deg] = deg === 11 ? 11 : deg === 13 ? 13 : deg === 9 ? 9 : 5;
      if (!has.includes(deg)) has.push(deg);
    });
    has.sort((a, b) => a - b);
    const ch = { root: pc(root), quality, size, has, semis, degOf, alts, bass: o.bass ? pc(o.bass) : null };
    ch.symbol = symbolOf(ch);
    return ch;
  }
  // The pitch class of one chord degree.
  function tone(ch, deg) {
    if (!ch.semis[deg] && deg !== 1) return null;
    if (deg === 1) return ch.root;
    const r = { step: ch.root.step, oct: 4, alt: ch.root.alt };
    return pc(transpose(r, ch.degOf[deg] || deg, ch.semis[deg], 1));
  }
  const tonesOf = (ch) => ch.has.map((d) => ({ deg: d, p: tone(ch, d) })).filter((t) => t.p);

  function symbolOf(ch) {
    const alt = (a) => a.replace('b', '♭').replace('#', '♯');
    const has = (d) => ch.has.includes(d);
    const sevenths = ch.semis[7];
    const alteredDeg = (d) => ch.alts.some((a) => a.slice(1) === String(d));
    const plain = (d) => has(d) && !alteredDeg(d);
    const top = plain(13) ? '13' : plain(11) ? '11' : plain(9) ? '9' : has(7) ? '7' : has(6) ? '6' : '';
    let base;
    if (ch.quality === 'sus') base = top ? top + 'sus4' : 'sus4';
    else if (ch.quality === 'dim') base = has(7) ? (sevenths === 9 ? '°7' : 'mi7♭5') : '°';
    else if (ch.quality === 'aug') base = has(7) || has(6) ? (sevenths === 11 ? 'ma' : '') + top + '♯5' : 'aug';
    else if (ch.quality === 'min') base = 'mi' + top;
    else base = (has(7) && sevenths === 11 ? 'ma' : '') + top;
    const shown = ch.alts.filter((a) => !(ch.quality === 'dim' && a === 'b5') && !(ch.quality === 'aug' && a === '#5'));
    const tail = shown.length ? `(${shown.map(alt).join('')})` : '';
    const slash = ch.bass && !samePc(ch.bass, ch.root) ? '/' + pcName({ ...ch.bass, oct: 4 }) : '';
    return pcName({ ...ch.root, oct: 4 }) + base + tail + slash;
  }

  // ---------- placing notes ----------
  function place(p, minDia) {
    let d = Math.floor((minDia - p.step) / 7) * 7 + p.step;
    if (d < minDia) d += 7;
    return fromDia(d, p.alt);
  }
  // Stack pitch classes upward, each at the nearest spot above the one before.
  function stack(pcs, startDia) {
    const out = [];
    let m = startDia;
    pcs.forEach((p) => { const q = place(p, m); out.push(q); m = dia(q) + 1; });
    return out;
  }
  const shiftAll = (notes, octaves) => notes.map((p) => fromDia(dia(p) + 7 * octaves, p.alt));
  // Slides a voicing by octaves until its lowest note sits at or above `minMidi`, keeping it as low as it can.
  function fitAbove(notes, minMidi, maxMidi) {
    let out = notes.slice();
    for (let i = 0; i < 6 && midi(out[0]) < minMidi; i++) out = shiftAll(out, 1);
    for (let i = 0; i < 6 && maxMidi && midi(out[out.length - 1]) > maxMidi && midi(out[0]) - 12 >= minMidi; i++) out = shiftAll(out, -1);
    return out;
  }
  // Shift by octaves until the lowest note sits at or above `minDia` (staff position, not pitch).
  function fitPos(notes, minDia, maxDia) {
    let out = notes.slice();
    for (let i = 0; i < 6 && dia(out[0]) < minDia; i++) out = shiftAll(out, 1);
    for (let i = 0; i < 6 && maxDia && dia(out[out.length - 1]) > maxDia && dia(out[0]) - 7 >= minDia; i++) out = shiftAll(out, -1);
    return out;
  }
  // Slide a stack by octaves to the octave that needs the fewest ledger lines, then the one
  // sitting closest to the staff's middle line.
  function centerOn(notes, staff) {
    const bottom = MQ.CLEFS[staff === 'bass' ? 'bass' : 'treble'].bottom;
    const mid = bottom + 4;
    const cost = (ns) => {
      const off = ns.filter((p) => dia(p) < bottom || dia(p) > bottom + 8).length;
      return off * 10 + Math.abs((dia(ns[0]) + dia(ns[ns.length - 1])) / 2 - mid);
    };
    let best = null;
    for (let k = -3; k <= 3; k++) {
      const cand = shiftAll(notes, k);
      if (midi(cand[0]) < M('E2') || midi(cand[cand.length - 1]) > M('C6')) continue;   // stay on the page
      if (!best || cost(cand) < cost(best)) best = cand;
    }
    return best || notes;
  }
  const byStaff = (notes) => notes.map((p) => Object.assign({}, p, { st: dia(p) < 28 ? 1 : 0 }));
  const onStaff = (notes, st) => notes.map((p) => Object.assign({}, p, { st }));
  // A root low in the bass clef, never more than two ledger lines below it.
  const bassRoot = (ch, targetMidi) => {
    let p = place(ch.root, D('C2'));
    while (midi(p) < (targetMidi || M('E2'))) p = fromDia(dia(p) + 7, p.alt);
    while (midi(p) > M('C3')) p = fromDia(dia(p) - 7, p.alt);
    if (midi(p) < LOW_ROOT) p = fromDia(dia(p) + 7, p.alt);
    return p;
  };

  // ---------- the techniques ----------
  const DEG = { 1: 'root', 3: '3rd', 5: '5th', 6: '6th', 7: '7th', 9: '9th', 11: '11th', 13: '13th' };
  const degName = (d, asOctave) => (d === 1 && asOctave ? 'octave' : DEG[d] || String(d));
  const TECHNIQUES = [
    { id: 'thirds', label: 'Stacked Thirds' }, { id: 'chorale', label: 'Chorale' },
    { id: 'block', label: 'Block Voicing' }, { id: 'drop2', label: 'Drop 2' },
    { id: 'drop24', label: 'Drop 2 & 4' }, { id: 'planes', label: '5 Plane, 9 Plane' },
    { id: 'pophorn', label: 'Pop Horn Voicings' }, { id: 'inner7', label: 'Inner Sevenths' },
    { id: 'custom', label: 'Custom' },
  ];

  // 1. Stacked Thirds — every note in order, 1 through 13.
  function voiceThirds(ch, opt) {
    const altered = (d) => ch.alts.some((a) => a.endsWith(String(d)));
    let degs = ch.has.slice();
    // In 11th chords the 9th is optional; in 13th chords the 9th and 11th are, unless altered.
    if (ch.has.includes(13)) degs = degs.filter((d) => !((d === 9 || d === 11) && !altered(d) && opt.thin));
    else if (ch.has.includes(11)) degs = degs.filter((d) => !(d === 9 && !altered(9) && opt.thin));
    if (opt.omitRoot) degs = degs.filter((d) => d !== 1);
    const staff = opt.staff === 'bass' ? 'bass' : 'treble';
    const notes = centerOn(stack(degs.map((d) => tone(ch, d)), staff === 'bass' ? D('F2') : D('C4')), staff);
    return { notes: onStaff(notes, staff === 'bass' ? 1 : 0), staff };
  }

  // 2. Chorale — root, 5, 3, top; extensions replace the 5 and the top note.
  function voiceChorale(ch) {
    const has = (d) => ch.has.includes(d);
    const mid = has(13) ? 13 : has(11) ? 11 : 5;                 // 11 or 13 takes the 5's place
    const top = has(9) ? 9 : has(7) ? 7 : has(6) ? 6 : 1;         // a 9th takes the octave's place
    const rootNote = bassRoot(ch, M('E2'));
    // The 5th stays at G3 or above, unless holding it there would push the upper voices off the staff.
    const build = (floor) => {
      const fifth = place(tone(ch, mid), Math.max(dia(rootNote) + 1, floor));
      return [fifth].concat(stack([tone(ch, 3), tone(ch, top)], Math.max(dia(fifth) + 1, D('C4'))));
    };
    let voices = build(mid === 5 ? D('G3') : D('D3'));
    if (midi(voices[2]) > M('A5')) voices = build(D('D3'));
    const fifth = voices[0], upper = voices.slice(1);
    return {
      notes: [Object.assign({}, rootNote, { st: 1 }), Object.assign({}, fifth, { st: dia(fifth) < 28 ? 1 : 0 })].concat(onStaff(upper, 0)),
      staff: 'grand',
      shape: `root, ${degName(mid)}, 3rd, ${degName(top, true)} from the bottom`,
    };
  }

  // 3. Block Voicing — four notes inside one octave, no root.
  function blockNotes(ch) {
    const has = (d) => ch.has.includes(d);
    const altered5 = ch.alts.includes('b5') || ch.alts.includes('#5') || ch.quality === 'dim' || ch.quality === 'aug';
    const fifth = has(13) ? 13 : has(11) ? 11 : 5;                // an 11th or 13th replaces the 5
    const seventh = has(7) ? 7 : has(6) ? 6 : 1;                  // a 6th or 7th replaces the octave
    const set = [3, fifth, seventh];
    if (altered5 && fifth !== 5) set.push(5);                     // an altered 5th comes back in
    if (has(9)) set.push(9);
    return set;
  }
  function voiceBlock(ch, opt) {
    const degs = blockNotes(ch);
    const starts = [1, 3, 5, 7].filter((d) => degs.includes(d) || d === 1);
    const cands = [];
    (starts.length ? starts : [3]).forEach((start) => {
      const i = degs.indexOf(start);
      const order = i >= 0 ? degs.slice(i).concat(degs.slice(0, i)) : degs.slice();
      const base = opt.staff === 'bass' ? D('G2') : D('G3');
      let notes = stack(order.map((d) => tone(ch, d)), base);
      // Everything stays within an octave of the lowest note.
      notes = notes.map((p, k) => (k && midi(p) - midi(notes[0]) > 12 ? fromDia(dia(p) - 7, p.alt) : p));
      notes.sort((a, b) => dia(a) - dia(b));
      const span = midi(notes[notes.length - 1]) - midi(notes[0]);
      const topGap = notes.length > 1 ? midi(notes[notes.length - 1]) - midi(notes[notes.length - 2]) : 12;
      let score = 0;
      if (span > 12) score += 6;
      if (topGap === 1) score += 4;          // no half-step as the top two notes
      if (span > 10) score += 2;             // prefer a 7th or smaller between outer notes
      score += Math.max(0, midi(notes[0]) - M('F4')) / 3;   // and near the middle of the staff
      cands.push({ notes, score, start, bottom: order[0] });
    });
    cands.sort((a, b) => a.score - b.score);
    const best = cands[0];
    const staff = opt.staff === 'bass' ? 'bass' : 'treble';
    const notes = centerOn(best.notes, staff);
    return {
      notes: onStaff(notes, staff === 'bass' ? 1 : 0), staff,
      start: best.bottom,
      shape: `no root, ${degName(best.bottom, true)} on the bottom`,
    };
  }

  // 4 & 5. Drop 2, Drop 2 & 4 — block voicing with notes dropped an octave.
  function voiceDrop(ch, opt, which) {
    const block = voiceBlock(ch, Object.assign({}, opt, { staff: 'treble' }));
    let notes = block.notes.map((p) => fromDia(dia(p), p.alt));
    const drop = (fromTop) => {
      const i = notes.length - fromTop;
      if (i >= 0) notes[i] = fromDia(dia(notes[i]) - 7, notes[i].alt);
    };
    drop(2);
    const deep = which === 'drop24' ? 2 : 1;
    if (which === 'drop24') drop(4);
    notes.sort((a, b) => dia(a) - dia(b));
    // Keep the voicing near the middle of the staff after the drop.
    let best = notes;
    for (let k = -2; k <= 2; k++) {
      const cand = shiftAll(notes, k);
      if (dia(cand[cand.length - 1]) > D('A5')) continue;
      if (Math.abs(dia(cand[0]) - D('G3')) < Math.abs(dia(best[0]) - D('G3'))) best = cand;
    }
    notes = best;
    // A note more than two ledger lines below the treble staff moves to the bass clef of a grand staff.
    const shape = `from a block voicing with the ${degName(block.start, true)} on the bottom, `
      + (which === 'drop24' ? 'the 2nd and 4th notes from the top dropped an octave' : 'the 2nd note from the top dropped an octave');
    const low = notes.filter((p) => dia(p) < D('A3')).length;
    if (low > 0) return { notes: notes.map((p, i) => Object.assign({}, p, { st: i < Math.min(low, deep) ? 1 : 0 })), staff: 'grand', shape };
    return { notes: onStaff(notes, 0), staff: 'treble', shape };
  }

  // 6. 5 Plane, 9 Plane.
  function planesOf(ch) {
    const has = (d) => ch.has.includes(d);
    const five = [];
    if (has(11)) five.push(11);
    if (has(13)) five.push(13);
    if (ch.alts.includes('b5') || ch.alts.includes('#5') || (!five.length)) five.push(5);
    const nine = has(9) ? 9 : 1;
    const seven = has(7) ? 7 : has(6) ? 6 : 1;
    // When the 7 plane and the 9 plane hold the same note, only one of them is used.
    return { p3: 3, p7: seven, p5: five, p9: nine === seven ? null : nine };
  }
  function voicePlanes(ch, opt) {
    const pl = planesOf(ch);
    const open = opt.open === 'open' || (opt.open === 'mix' && opt.coin);
    const layout = opt.layout ? 1 : 0;
    const rootNote = Object.assign(bassRoot(ch, M('E2')), { st: 1 });
    const fivePcs = pl.p5.map((d) => tone(ch, d));
    const t = (d) => tone(ch, d);
    if (!open) {
      // Closed: root, 3p, 5p, 7p, 9p — or root, 7p, 9p, 3p, 5p.
      const nine = pl.p9 ? [t(pl.p9)] : [];
      const order = (layout ? [t(pl.p7)].concat(nine, [t(3)], fivePcs)
        : [t(3)].concat(fivePcs, [t(pl.p7)], nine)).filter(Boolean);
      let notes = stack(order, D('Eb3'));
      // All four fit in the bass between E♭3 and G4, or the whole stack moves up into the treble.
      if (midi(notes[notes.length - 1]) > G4) notes = fitPos(stack(order, D('C4')), D('C4'), D('C6'));
      const all = [rootNote].concat(byStaff(notes));
      return { notes: all, staff: 'grand', shape: `close with the ${layout ? '7th' : '3rd'} plane on the bottom` };
    }
    // Open: root, 3p, 7p, 9p, 5p — or root, 7p, 3p, 5p, 9p.
    const lower = (layout ? [t(pl.p7), t(3)] : [t(3), t(pl.p7)]).filter(Boolean);
    const nine9 = pl.p9 ? [t(pl.p9)] : [];
    const upper = (layout ? fivePcs.concat(nine9) : nine9.concat(fivePcs)).filter(Boolean);
    let low = stack(lower, D('D3'));
    if (midi(low[low.length - 1]) > G4) low = stack(lower, D('D3'));
    const high = stack(upper, Math.max(dia(low[low.length - 1]) + 1, D('C4')));
    return {
      notes: [rootNote].concat(onStaff(low, dia(low[0]) < 28 ? 1 : 0).map((p) => Object.assign({}, p, { st: dia(p) < 28 ? 1 : 0 })), onStaff(high, 0)),
      staff: 'grand',
      shape: `open with the ${layout ? '7th' : '3rd'} plane on the bottom`,
    };
  }

  // 7. Pop Horn — three or four notes in set orders.
  function voicePopHorn(ch, opt) {
    const has = (d) => ch.has.includes(d);
    const one = has(9) ? 9 : 1;                       // 9th chords use the 9 in place of the octave
    const five = has(13) ? 13 : has(11) ? 11 : 5;     // 11ths and 13ths take the 5's place
    const seventh = has(7) ? 7 : has(6) ? 6 : null;
    const three = 3;
    const shapes = seventh
      ? [[seventh, three, one], [three, seventh, five]]
      : [[three, five, one], [three, one, five]];
    const degs = shapes[opt.layout ? 1 % shapes.length : 0].filter((d) => ch.has.includes(d) || d === 1);
    const order = degs.map((d, i) => degName(d, i > 0 || opt.four)).join(', ');
    if (opt.four) {
      const upper = stack(degs.map((d) => tone(ch, d)), D('G3'));   // the lowest note above the root is G3 or higher
      const rootNote = Object.assign(bassRoot(ch, M('E2')), { st: 1 });
      const fitted = fitAbove(upper, G3);
      return { notes: [rootNote].concat(byStaff(fitted)), staff: 'grand', shape: `4 notes: root, ${order} from the bottom` };
    }
    const staff = opt.staff === 'bass' ? 'bass' : 'treble';
    const floorD = staff === 'bass' ? D('A2') : D('G3');
    const notes = fitAbove(stack(degs.map((d) => tone(ch, d)), floorD), staff === 'bass' ? M('A2') : M('G3'), staff === 'bass' ? M('E4') : M('A5'));
    return { notes: onStaff(notes, staff === 'bass' ? 1 : 0), staff, shape: `3 notes: ${order} from the bottom` };
  }

  // 8. Inner Sevenths — as many pairs a 7th apart as the chord allows.
  const PAIRS = [[1, 7], [3, 9], [13, 5], [6, 5], [11, 3], [4, 3], [7, 13], [7, 6], [9, 1], [5, 11], [5, 4]];
  function voiceInner7(ch, opt) {
    const has = (d) => ch.has.includes(d) || d === 1;
    const used = new Set();
    const pairs = [];
    PAIRS.forEach(([a, b]) => {
      if (pairs.length >= 2 || used.has(a) || used.has(b)) return;
      if (!has(a) || !has(b)) return;
      if (ch.quality === 'sus' && (a === 3 || b === 3)) return;   // a suspended chord leaves out its third
      pairs.push([a, b]); used.add(a); used.add(b);
    });
    // Thirds, sevenths and thirteenths sit low; the lowest note above the root is D3 or higher.
    const LOW_FIRST = [3, 7, 13, 11, 6, 9, 5, 1];
    const order = (a, b) => LOW_FIRST.indexOf(a) - LOW_FIRST.indexOf(b);
    const lows = pairs.map((p) => p[0]);
    const extras = ch.has.filter((d) => !used.has(d) && d !== 1 && !(ch.quality === 'sus' && d === 3)).sort(order);
    while (extras.length && lows.length + pairs.length < 5) lows.push(extras.shift());
    lows.sort(order);
    const notes = stack(lows.map((d) => tone(ch, d)), D('D3'));
    const tops = [];
    pairs.forEach(([a, b]) => {
      const anchor = notes[lows.indexOf(a)];
      tops.push({ p: place(tone(ch, b), dia(anchor) + 6), floor: dia(anchor) });   // a seventh above its partner
    });
    if (opt.inner2 && tops.length) {
      // Inner 2nds: the top voice comes down an octave so it makes a second with its pair.
      const hi = tops.reduce((m, t) => (dia(t.p) > dia(m.p) ? t : m), tops[0]);
      const down = fromDia(dia(hi.p) - 7, hi.p.alt);
      if (midi(down) >= M('D3')) hi.p = down;
    }
    let all = notes.concat(tops.map((t) => t.p)).sort((a, b) => dia(a) - dia(b));
    all = all.filter((p, i) => !i || dia(p) !== dia(all[i - 1]) || p.alt !== all[i - 1].alt);
    const rootNote = Object.assign(bassRoot(ch, M('E2')), { st: 1 });
    const pairText = pairs.map(([a, b]) => `${degName(a)} with ${degName(b, true)}`).join(' and ');
    return {
      notes: [rootNote].concat(byStaff(all)), staff: 'grand',
      shape: (pairText ? `${pairText} a seventh apart` : 'the voices paired a seventh apart') + (opt.inner2 ? ', with inner 2nds' : ''),
    };
  }

  // Inner sevenths needs pairs a seventh apart, so it is only offered for sevenths and larger chords.
  function suits(technique, ch) {
    if (technique === 'inner7') return ch.has.includes(7) || ch.has.includes(6);
    return true;
  }

  // A slash chord's bass note is written below the voicing; a duplicate of it drops out.
  function addSlashBass(ch, v) {
    if (!ch.bass || samePc(ch.bass, ch.root)) return v;
    let notes = v.notes.filter((p, i) => i === 0 || !samePc(p, ch.bass));
    let low = place(ch.bass, dia(notes[0]) - 7);
    while (midi(low) < LOW_ROOT) low = fromDia(dia(low) + 7, low.alt);
    if (dia(low) >= dia(notes[0])) low = fromDia(dia(low) - 7, low.alt);
    const staff = v.staff === 'grand' || midi(low) < M('E3') ? 'grand' : v.staff;
    notes = [low].concat(notes);
    return {
      notes: staff === 'grand' ? byStaff(notes) : onStaff(notes, staff === 'bass' ? 1 : 0), staff,
      shape: v.shape ? v.shape + `, over ${MQ.pcName({ ...ch.bass, oct: 4 })} in the bass` : v.shape,
    };
  }
  function voiceChord(ch, technique, opt) {
    const o = Object.assign({ staff: 'treble', open: 'closed', layout: 0, four: false, omitRoot: false, thin: true, inner2: false }, opt);
    return addSlashBass(ch, voiceBody(ch, technique, o));
  }
  function voiceBody(ch, technique, o) {
    switch (technique) {
      case 'chorale': return voiceChorale(ch);
      case 'block': return voiceBlock(ch, o);
      case 'drop2': return voiceDrop(ch, o, 'drop2');
      case 'drop24': return voiceDrop(ch, o, 'drop24');
      case 'planes': return voicePlanes(ch, o);
      case 'pophorn': return voicePopHorn(ch, o);
      case 'inner7': return voiceInner7(ch, o);
      default: return voiceThirds(ch, o);
    }
  }


  // ---------- choosing chords ----------
  const KEY_QUALS = {
    major: [['maj', 1], ['min', 2], ['min', 3], ['maj', 4], ['maj', 5], ['min', 6], ['dim', 7]],
    minor: [['min', 1], ['dim', 2], ['maj', 3], ['min', 4], ['min', 5], ['maj', 6], ['maj', 7]],
    dorian: [['min', 1], ['min', 2], ['maj', 3], ['maj', 4], ['min', 5], ['dim', 6], ['maj', 7]],
  };
  const SIZE_OF = { triad: ['triad', 'sixth'], seventh: ['seventh'], ext: ['ninth', 'eleventh', 'thirteenth'] };
  const ALT_FOR = { 5: ['b5', '#5'], 9: ['b9', '#9'], 11: ['#11'], 13: ['b13'] };
  const on = (mask, i) => !!(mask & (1 << i));
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];

  // Fills in anything missing and hands back the same object, so a settings panel and the quiz
  // it builds are always looking at one block, not at copies of it.
  function settingsOf(block) {
    const b = block || {};
    if (b.sizes == null) b.sizes = 3;
    if (b.quals == null) b.quals = 3;
    b.alts = b.alts ? 1 : 0;
    b.key = b.key || 0;
    b.slash = b.slash ? 1 : 0;
    b.ask = b.ask || 1;
    b.tech = b.tech || {};
    b.opts = b.opts || {};
    b.len = b.len || 4;
    return b;
  }
  // A chord built from the teacher's complexity settings: quality, size, alterations, slash bass.
  function pickChordFrom(rng, set, keyRoot, degree) {
    const quals = ['maj', 'min', 'aug', 'dim', 'sus'].filter((_, i) => on(set.quals, i));
    const sizes = ['triad', 'seventh', 'ext'].filter((_, i) => on(set.sizes, i));
    if (!quals.length) quals.push('maj');
    if (!sizes.length) sizes.push('triad');
    const kind = KEY_KINDS[set.key] ? KEY_KINDS[set.key].id : 'chromatic';
    let root = keyRoot, quality = pick(rng, quals);
    if (kind !== 'chromatic' && keyRoot && degree) {
      // A chord found in the key: its root and basic quality come from the scale.
      const row = KEY_QUALS[kind][degree - 1];
      const scaleQ = row[0];
      root = MQ.transpose({ step: keyRoot.step, oct: 4, alt: keyRoot.alt }, degree, [0, 2, 4, 5, 7, 9, 11][degree - 1]
        + (kind === 'minor' ? [0, 0, -1, 0, 0, -1, -1][degree - 1] : kind === 'dorian' ? [0, 0, -1, 0, 0, 0, -1][degree - 1] : 0), 1);
      quality = quals.includes(scaleQ) ? scaleQ : pick(rng, quals);
    }
    const group = pick(rng, sizes);
    let size = pick(rng, SIZE_OF[group]);
    // A suspended chord already has its fourth, so it is not written as an 11th or 13th.
    if (quality === 'sus' && (size === 'eleventh' || size === 'thirteenth')) size = 'ninth';
    const opts = { majorSeventh: quality === 'maj' && rng() < 0.5 };
    if (set.alts) {
      const spots = [];
      if (size !== 'triad' && size !== 'sixth' && quality !== 'dim' && quality !== 'aug') spots.push(5);
      if (['ninth', 'eleventh', 'thirteenth'].includes(size) && quality === 'maj' && !opts.majorSeventh) spots.push(9);
      if ((size === 'eleventh' || size === 'thirteenth') && quality !== 'sus') spots.push(11);
      if (size === 'thirteenth' && quality !== 'sus') spots.push(13);
      if (spots.length && rng() < 0.6) opts.alts = [pick(rng, ALT_FOR[pick(rng, spots)])];
    }
    // A half-diminished chord is written as a minor seventh with a flat fifth.
    if (quality === 'dim' && size !== 'triad' && rng() < 0.5) { quality = 'min'; opts.alts = ['b5']; }
    const ch = makeChord({ step: root.step, alt: root.alt }, quality, size, opts);
    if (set.slash && rng() < 0.35) {
      const others = tonesOf(ch).filter((t) => t.deg !== 1);
      if (others.length) { ch.bass = pick(rng, others).p; ch.symbol = symbolOf(ch); }
    }
    return ch;
  }
  const ROOTS = [[0, 0], [0, 1], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
  const randomRoot = (rng, weighted) => {
    const r = weighted === false ? pick(rng, ROOTS)
      : MQ.pickSpelled(rng, ROOTS, (x) => MQ.pcName({ step: x[0], alt: x[1], oct: 4 }));
    return { step: r[0], alt: r[1] };
  };

  // Which options a technique uses, and how they turn into voicing settings.
  function optionsFor(tech, o, rng) {
    const staffOf = (v) => (v === 1 ? 'treble' : v === 2 ? 'bass' : rng() < 0.5 ? 'treble' : 'bass');
    switch (tech) {
      case 'thirds': return { staff: staffOf(o.thirdsStaff || 0), omitRoot: !!o.thirdsOmitRoot, thin: rng() < 0.5 };
      case 'block': return { staff: staffOf(o.blockStaff || 0) };
      case 'planes': return { open: o.planesOpen === 1 ? 'open' : o.planesOpen === 2 ? 'mix' : 'closed', coin: rng() < 0.5, layout: rng() < 0.5 ? 0 : 1 };
      case 'pophorn': return { four: o.popNotes === 4, staff: staffOf(o.popStaff || 0), layout: rng() < 0.5 ? 0 : 1 };
      case 'inner7': return { inner2: !!o.inner2 };
      default: return {};
    }
  }

  // ---------- reading a chord symbol the student typed ----------
  function parseVoiceSymbol(str) {
    let raw = String(str || '').trim().replace(/♭/g, 'b').replace(/♯/g, '#');
    let bass = null;
    const slash = raw.match(/^(.*)\/([A-Ga-g])([#b]?)$/);
    if (slash) { bass = { step: 'CDEFGAB'.indexOf(slash[2].toUpperCase()), alt: slash[3] === '#' ? 1 : slash[3] === 'b' ? -1 : 0 }; raw = slash[1]; }
    const m = raw.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!m) return null;
    const rootPc = { step: 'CDEFGAB'.indexOf(m[1].toUpperCase()), alt: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 };
    let r = MQ.normalizeSuffix(m[3]);
    const alts = [];
    r = r.replace(/(b|#)(5|9|11|13)/g, (all, sign, deg) => { alts.push(sign + deg); return ''; });
    const sus = /sus/.test(r); r = r.replace(/sus[24]?/, '');
    let quality = 'maj', majorSeventh = false;
    if (/^(dim|°)/.test(r)) { quality = 'dim'; r = r.replace(/^(dim|°)/, ''); }
    else if (/^(ø)/.test(r)) { quality = 'min'; alts.push('b5'); r = r.replace(/^ø/, ''); }
    else if (/^aug/.test(r)) { quality = 'aug'; r = r.replace(/^aug/, ''); }
    else if (/^maj/.test(r)) { majorSeventh = true; r = r.replace(/^maj/, ''); }
    else if (/^m/.test(r)) { quality = 'min'; r = r.replace(/^m(in)?/, ''); if (/^aj/.test(r)) return null; }
    if (/^maj/.test(r)) { majorSeventh = true; r = r.replace(/^maj/, ''); }
    if (sus) quality = 'sus';
    const num = r.match(/^(6|7|9|11|13)/);
    const size = !num ? 'triad' : { 6: 'sixth', 7: 'seventh', 9: 'ninth', 11: 'eleventh', 13: 'thirteenth' }[num[1]];
    r = r.replace(/^(6|7|9|11|13)/, '');
    if (r.replace(/[()\s]/g, '')) return null;                       // anything left over is not a chord symbol
    if (quality === 'aug' && !alts.includes('#5')) alts.push('#5');
    const ch = makeChord(rootPc, quality, size, { majorSeventh, alts, bass });
    return ch;
  }
  // Two symbols match when they name the same notes, from the same root, over the same bass.
  function sameChord(a, b, enh) {
    if (!a || !b) return false;
    const eq = (x, y) => (enh ? ((midi({ ...x, oct: 4 }) - midi({ ...y, oct: 4 })) % 12 + 12) % 12 === 0 : x.step === y.step && x.alt === y.alt);
    if (!eq(a.root, b.root)) return false;
    if (!!a.bass !== !!b.bass || (a.bass && !eq(a.bass, b.bass))) return false;
    const setOf = (ch) => ch.has.map((d) => d + ':' + ch.semis[d]).sort().join(',');
    return setOf(a) === setOf(b);
  }
  function gradeVoiceSymbol(want, resp, cfg) {
    return sameChord(parseVoiceSymbol(resp), parseVoiceSymbol(want), cfg && cfg.flags && cfg.flags.enharmonic) ? 1 : 0;
  }

  // ---------- questions ----------
  const LABEL = (id) => (TECHNIQUES.find((t) => t.id === id) || {}).label || id;
  const HOW = {
    thirds: 'Stack the notes in thirds from the bottom.',
    chorale: 'Chorale voicing: root, fifth, third, top note, from the bass up.',
    block: 'Block voicing: four notes inside one octave, no root.',
    drop2: 'Drop 2: a block voicing with the second note from the top dropped an octave.',
    drop24: 'Drop 2 & 4: a block voicing with the second and fourth notes from the top dropped an octave.',
    planes: 'Plane voicing: root, 3 plane, 5 plane, 7 plane, 9 plane.',
    pophorn: 'Pop horn voicing.',
    inner7: 'Inner sevenths: the voices pair off a seventh apart.',
    custom: '',
  };
  function chordQuestion(ch, tech, v, cfg, ask, extra) {
    const notes = v.notes.slice().sort((a, b) => dia(a) - dia(b));
    const shown = MQ.prettySymbol(ch.symbol);
    // Say which arrangement of the technique this is, so students know what to write.
    const shapeText = v.shape ? v.shape.charAt(0).toUpperCase() + v.shape.slice(1) + '.' : HOW[tech];
    const tag = ['pc:' + MQ.pcName({ ...ch.root, oct: 4 }), 'vt:' + tech, 'vq:' + ch.quality + ch.size];
    const sig = 'v' + tech + ch.symbol + v.staff + notes.map((p) => MQ.fullName(p)).join('');
    if (ask === 'name') {
      return Object.assign({
        type: 'voicing', clef: v.staff, grand: v.staff === 'grand', symbol: ch.symbol,
        symbolAnswer: { voice: true, q: ch.symbol, shown, root: ch.root, bass: ch.bass || null },
        text: `Write the chord symbol for this voicing — ${LABEL(tech)}.`,
        hint: `${shapeText} For example Dmi7, G13♭9, Cma7. Write a slash chord when the bass note is not the root.`.trim(),
        columns: [{ given: notes, cap: 0 }], answer: [notes], tags: tag, sig: 'n' + sig,
      }, extra || {});
    }
    const helper = cfg && MQ.helpersOn(cfg, 'voicing');
    const counts = v.staff === 'grand'
      ? `${notes.filter((p) => p.st === 1).length} in the bass clef and ${notes.filter((p) => p.st !== 1).length} in the treble clef`
      : `${notes.length} notes`;
    return Object.assign({
      type: 'voicing', clef: v.staff, grand: v.staff === 'grand', symbol: ch.symbol,
      text: `Voice ${shown} — ${LABEL(tech)}.`,
      hint: `${shapeText} Place ${counts}. Exact pitches count.`.replace(/\s+/g, ' ').trim()
        + (helper ? ' The lowest note is printed.' : ''),
      columns: [{ given: helper ? [notes[0]] : [], cap: helper ? notes.length - 1 : notes.length }],
      answer: [helper ? notes.slice(1) : notes], tags: tag, sig: 's' + sig,
    }, extra || {});
  }

  // One voiced chord, or a progression of them, for every technique the teacher turned on.
  function voicingQuestions(cfg, rng, draw, varied) {
    const out = [];
    const keep = varied || ((make) => make());
    const build = (block, isProg) => {
      const set = settingsOf(block);
      TECHNIQUES.forEach((t) => {
        const n = (set.tech && set.tech[t.id]) || 0;
        for (let i = 0; i < n; i++) {
          const ask = set.ask === 2 ? 'name' : set.ask === 3 ? (rng() < 0.5 ? 'spell' : 'name') : 'spell';
          if (t.id === 'custom') { customVoicing(out, cfg, rng, ask, isProg); continue; }
          if (isProg) out.push(keep(() => progQuestion(rng, cfg, set, t.id, ask)));
          else out.push(keep(() => singleQuestion(rng, cfg, set, t.id, ask)));
        }
      });
    };
    build(cfg.vc, false);
    build(cfg.vp, true);
    return out;
  }
  function chordFor(rng, set, tech, keyRoot, degree) {
    for (let k = 0; k < 40; k++) {
      const ch = pickChordFrom(rng, set, keyRoot, degree);
      if (!suits(tech, ch)) continue;
      if (!tonesOf(ch).every((t) => Math.abs(t.p.alt) <= 1)) continue;   // no double sharps or flats
      return ch;
    }
    return makeChord(keyRoot || { step: 0, alt: 0 }, 'maj', 'seventh', {});
  }
  function singleQuestion(rng, cfg, set, tech, ask) {
    const kind = KEY_KINDS[set.key] ? KEY_KINDS[set.key].id : 'chromatic';
    const keyRoot = randomRoot(rng, MQ.spelledPick(cfg));
    const ch = chordFor(rng, set, tech, keyRoot, kind === 'chromatic' ? 0 : 1 + Math.floor(rng() * 7));
    const v = voiceChord(ch, tech, optionsFor(tech, set.opts, rng));
    return chordQuestion(ch, tech, v, cfg, ask);
  }
  function progQuestion(rng, cfg, set, tech, ask) {
    const kind = KEY_KINDS[set.key] ? KEY_KINDS[set.key].id : 'chromatic';
    const len = Math.max(2, Math.min(6, set.len || 4));
    const keyRoot = randomRoot(rng, MQ.spelledPick(cfg));
    const degrees = kind === 'chromatic' ? null : (MQ.autoDegrees ? MQ.autoDegrees(rng, len, false) : [1, 4, 5, 1]);
    const opt = optionsFor(tech, set.opts, rng);
    const chords = [], voicings = [];
    for (let i = 0; i < len; i++) {
      const ch = chordFor(rng, set, tech, kind === 'chromatic' ? randomRoot(rng, MQ.spelledPick(cfg)) : keyRoot, degrees ? degrees[i] : 0);
      chords.push(ch);
      voicings.push(voiceChord(ch, tech, opt));
    }
    const staff = voicings.some((v) => v.staff === 'grand') ? 'grand' : voicings[0].staff;
    const shapeText = voicings[0].shape
      ? `Every chord uses the same shape: ${voicings[0].shape}.`
      : HOW[tech];
    const fix = (v) => (staff === 'grand' ? v.notes.map((p) => Object.assign({}, p, { st: p.st == null ? (dia(p) < 28 ? 1 : 0) : p.st })) : v.notes.map(({ st, ...p }) => p));
    const cols = voicings.map(fix);
    const symbols = chords.map((c) => MQ.prettySymbol(c.symbol));
    const tags = chords.map((c) => 'pc:' + MQ.pcName({ ...c.root, oct: 4 })).concat(['vt:' + tech]);
    const sig = 'vp' + tech + symbols.join('') + staff;
    if (ask === 'name') {
      return {
        type: 'vprog', clef: staff, grand: staff === 'grand',
        text: `Write the chord symbol for each chord in this progression — ${LABEL(tech)}.`,
        hint: `${shapeText} One chord symbol per chord, such as Dmi7 or G13♭9.`.trim(),
        columns: cols.map((notes) => ({ given: notes, cap: 0 })),
        symbolAnswers: chords.map((c) => ({ voice: true, q: c.symbol, shown: MQ.prettySymbol(c.symbol) })),
        answer: cols, chordLabels: { top: cols.map(() => '') }, tags, sig: 'n' + sig,
      };
    }
    return {
      type: 'vprog', clef: staff, grand: staff === 'grand',
      text: `Voice this progression — ${LABEL(tech)}.`,
      hint: `${shapeText} Exact pitches count.`.replace(/\s+/g, ' ').trim(),
      columns: cols.map((notes) => ({ given: [], cap: notes.length })),
      chordLabels: { top: symbols }, answer: cols, tags, sig: 's' + sig,
    };
  }
  // The teacher's own chord symbol and voicing, written out exactly.
  function customVoicing(out, cfg, rng, ask, isProg) {
    const list = (cfg.voicings || []).filter((v) => v && v.notes && v.notes.length);
    if (!list.length || isProg) return;
    const v = list[Math.floor(rng() * list.length)];
    const notes = v.notes.slice().sort((a, b) => dia(a) - dia(b));
    const staff = v.staff || 'grand';
    const ch = { root: { step: 0, alt: 0 }, symbol: v.symbol, quality: 'maj', has: [], semis: {} };
    const shown = MQ.prettySymbol(v.symbol);
    if (ask === 'name') {
      out.push({
        type: 'voicing', clef: staff, grand: staff === 'grand', symbol: v.symbol,
        symbolAnswer: { voice: true, q: v.symbol, shown },
        text: 'Write the chord symbol for the voicing shown.',
        hint: 'For example Dmi7, G13♭9, Cma7.',
        columns: [{ given: notes, cap: 0 }], answer: [notes], tags: ['vt:custom'], sig: 'nvc' + v.symbol + staff,
      });
      return;
    }
    const helper = MQ.helpersOn(cfg, 'voicing');
    out.push({
      type: 'voicing', clef: staff, grand: staff === 'grand', symbol: v.symbol,
      text: `Voice ${shown} exactly as your teacher wrote it.`,
      hint: `Place ${notes.length} notes. Exact pitches count.`,
      columns: [{ given: helper ? [notes[0]] : [], cap: helper ? notes.length - 1 : notes.length }],
      answer: [helper ? notes.slice(1) : notes], tags: ['vt:custom'], sig: 'svc' + v.symbol + staff,
    });
  }

  Object.assign(MQ, {
    VOICE_QUALITIES: QUALITIES, VOICE_SIZES: SIZES, VOICE_KEYS: KEY_KINDS, VOICE_ALTS: ALTS, TECHNIQUES,
    makeChord, voiceTechnique: voiceChord, voiceSuits: suits, voicingQuestions, parseVoiceSymbol, gradeVoiceSymbol, voiceSettings: settingsOf, chordTones: tonesOf, chordSymbolOf: symbolOf, chordTone: tone,
  });
})(typeof window !== 'undefined' ? window : globalThis);
