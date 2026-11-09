/* Clefwork Part Writing — four-part (SATB) voice leading.
   - Chords from Roman numerals with inversion figures (V65, vii°7, ii6 …) and secondary chords (V7/V).
   - The rules a teacher can switch on one by one, gathered into a Traditional and a Contemporary preset.
   - A checker that lists every broken rule, chord by chord and move by move.
   - A solver that writes a good answer (dynamic programming over every voicing of every chord).
   - The exercise generator: phrases and short resolutions, labelled with chord symbols, Roman numerals,
     figured bass, or any mix of them.
   Voices are numbered from the top: 0 soprano, 1 alto, 2 tenor, 3 bass — or, over a bass (for extended
   chords), four upper voices 0–3 and the bass 4. A voicing is an array of pitches {step, oct, alt}, one per
   voice, with null where nothing is written yet. Everything lives on MQ.PW. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const { dia, midi, transpose, pcName, fullName } = MQ;
  const PW = (MQ.PW = {});

  const pc = (p) => ({ step: p.step, alt: p.alt });
  const samePc = (a, b) => !!a && !!b && a.step === b.step && a.alt === b.alt;
  const at4 = (p) => ({ step: p.step, oct: 4, alt: p.alt });
  const mod = (n, m) => ((n % m) + m) % m;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const NOTE = (p) => pcName(p);

  // ---------- keys ----------
  // A key: {mode 'major' | 'minor', tonic {step, alt}, fifths}. Any tonic works, even past seven sharps
  // (a secondary chord's key can go there). Minor keys use the natural minor scale; the raised leading
  // tone comes from the chord qualities (V, vii°).
  const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11], MINOR_SEMIS = [0, 2, 3, 5, 7, 8, 10];
  const FIFTHS_OF = [0, 2, 4, -1, 1, 3, 5];
  function makeKey(tonic, mode) {
    return { mode, tonic: pc(tonic), fifths: FIFTHS_OF[tonic.step] + 7 * tonic.alt - (mode === 'minor' ? 3 : 0) };
  }
  // The key with this many sharps (+) or flats (−).
  function keyOfSignature(fifths, mode) {
    let t = { step: 0, oct: 4, alt: 0 };
    for (let i = 0; i < Math.abs(fifths); i++) t = transpose(t, 5, 7, fifths > 0 ? 1 : -1);
    if (mode === 'minor') t = transpose(t, 3, 3, -1);
    return makeKey(t, mode);
  }
  const degree = (kd, deg) => {
    const d = mod(deg, 7);
    return pc(transpose(at4(kd.tonic), d + 1, (kd.mode === 'minor' ? MINOR_SEMIS : MAJOR_SEMIS)[d], 1));
  };
  const leadingTone = (kd) => pc(transpose(at4(kd.tonic), 2, 1, -1));
  const keyName = (kd) => NOTE(kd.tonic) + (kd.mode === 'minor' ? ' minor' : ' major');
  // What the key signature does to each letter: +1 sharp, −1 flat.
  function sigAlts(fifths) {
    const a = [0, 0, 0, 0, 0, 0, 0];
    const SH = [3, 0, 4, 1, 5, 2, 6], FL = [6, 2, 5, 1, 4, 0, 3];
    for (let i = 0; i < Math.abs(fifths); i++) {
      const s = (fifths > 0 ? SH : FL)[i % 7];
      a[s] += fifths > 0 ? 1 : -1;
    }
    return a;
  }

  // ---------- chords ----------
  // A chord: {label (its Roman numeral as text), symbol, root, tones (pitch classes from the root up),
  //   degs (1 3 5 7 9 11 13 for each tone; 4 for a sus fourth, 6 for an added sixth), names, req (the tones
  //   four voices must have), inv (which tone is in the bass), seventh, sev (the seventh's index or −1),
  //   fam (what the chord is: 'maj', 'dom7', 'min7' …), ext (sixths, ninths and up, alterations and sus
  //   chords: their missing notes follow the required-notes rule), key (the key it's heard in), home,
  //   deg, fn ('T' tonic, 'D' dominant), disp (the Roman numeral in pieces, for drawing)}.
  const NUMS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  // figure → [inversion, seventh chord?]
  const FIGS = { '': [0, false], 6: [1, false], 64: [2, false], 7: [0, true], 65: [1, true], 43: [2, true], 42: [3, true], 2: [3, true] };
  const FIG_STACK = { '': [], 6: ['6'], 64: ['6', '4'], 7: ['7'], 65: ['6', '5'], 43: ['4', '3'], 42: ['4', '2'], 2: ['4', '2'] };
  // The diatonic chords: [triad, seventh chord] on each degree. Minor uses V and vii° from harmonic minor.
  const DIATONIC = {
    major: [['maj', 'maj7'], ['min', 'min7'], ['min', 'min7'], ['maj', 'maj7'], ['maj', 'dom7'], ['min', 'min7'], ['dim', 'hdim7']],
    minor: [['min', 'min7'], ['dim', 'hdim7'], ['maj', 'maj7'], ['min', 'min7'], ['maj', 'dom7'], ['maj', 'maj7'], ['dim', 'dim7']],
  };
  const clean = (s) => String(s || '').trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[º˚]/g, '°').replace(/Ø/g, 'ø')
    .replace(/\s+/g, '').replace(/[()]/g, '').replace(/(\d)\/(\d)/g, '$1$2');
  const NUM_RE = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|o|ø|\+|maj|ma|M)?(\d{0,2})((?:[b#](?:5|9|11|13))*)(sus4?)?$/;
  const DEG_NAME = { 1: 'root', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 9: 'ninth', 11: 'eleventh', 13: 'thirteenth' };
  const SIGN = (a) => a.replace('b', '♭').replace('#', '♯');
  const LOW_FAMS = ['min', 'min7', 'min6', 'dim', 'dim7', 'hdim7'];

  // The members of a triad or seventh chord from the root up, as pitch classes.
  function membersOf(rootPc, q) {
    const qd = MQ.QUALITIES.find((x) => x.id === q);
    return [pc(rootPc)].concat(qd.tones.map(([n, s]) => pc(transpose(at4(rootPc), n, s, 1))));
  }
  // A triad or seventh chord: root, third and seventh are needed; the fifth may go in root position.
  function plainChord(rootPc, q, inv) {
    const tones = membersOf(rootPc, q);
    const degs = [1, 3, 5, 7].slice(0, tones.length);
    return { root: pc(rootPc), q, fam: q, tones, degs, names: degs.map((d) => DEG_NAME[d]), req: degs.map((d) => d !== 5),
      inv, ext: false, symbol: MQ.symbolOf({ root: rootPc, q, bass: inv ? tones[inv] : null }) };
  }
  // A chord from Clefwork's voicing model (MQ.makeChord, MQ.parseVoiceSymbol). Plain triads and sevenths
  // become plain chords. Anything bigger keeps, in four voices: the third (or sus fourth), the seventh (or
  // added sixth), every altered note, the highest plain extension, and the root when it's in the bass or
  // there's room for it. The fifth and lower extensions are optional. Returns null when the bass isn't in the chord.
  function fromVoicing(vc) {
    const has7 = vc.has.includes(7), s7 = vc.semis[7];
    const extra = vc.alts.filter((a) => !(vc.quality === 'aug' && a === '#5') && !(vc.quality === 'dim' && a === 'b5'));
    // A slash chord's bass outside the chord (F/G, D/C) is a note of its own, for the bass only.
    const slashOut = !!vc.bass && !MQ.chordTones(vc).some((t) => samePc(t.p, vc.bass));
    const big = slashOut || vc.quality === 'sus' || vc.has.some((d) => d === 6 || d > 7);
    let q = null;
    if (!big) {
      if (vc.quality === 'dim') q = has7 ? (s7 === 9 ? 'dim7' : 'hdim7') : 'dim';
      else if (vc.quality === 'aug') q = has7 || extra.length ? null : 'aug';
      else if (vc.quality === 'min') q = extra.join() === 'b5' ? (has7 && s7 === 10 ? 'hdim7' : 'dim') : extra.length ? null : has7 ? (s7 === 10 ? 'min7' : null) : 'min';
      else q = extra.length ? null : !has7 ? 'maj' : s7 === 11 ? 'maj7' : 'dom7';
    }
    if (q) {
      const ch = plainChord(vc.root, q, 0);
      if (vc.bass) { ch.inv = ch.tones.findIndex((t) => samePc(t, vc.bass)); if (ch.inv < 0) return null; ch.symbol = MQ.symbolOf({ root: vc.root, q, bass: ch.inv ? vc.bass : null }); }
      return ch;
    }
    const list = MQ.chordTones(vc);
    const tones = list.map((t) => pc(t.p));
    const degs = list.map((t) => (t.deg === 3 && vc.quality === 'sus' ? 4 : t.deg));
    const altOf = list.map((t) => extra.find((a) => +a.slice(1) === t.deg) || '');
    const fam = vc.quality === 'sus' ? (has7 ? 'dom7sus' : 'sus')
      : vc.has.includes(6) && !has7 ? (vc.quality === 'min' ? 'min6' : 'maj6')
        : vc.quality === 'dim' ? (has7 ? (s7 === 9 ? 'dim7' : 'hdim7') : 'dim')
          : vc.quality === 'min' ? (vc.alts.includes('b5') ? (has7 ? 'hdim7' : 'dim') : has7 ? 'min7' : 'min')
            : has7 ? (s7 === 11 ? 'maj7' : 'dom7') : vc.quality === 'aug' ? 'aug' : 'maj';
    if (slashOut) { tones.push(pc(vc.bass)); degs.push(0); altOf.push(''); }
    const inv = vc.bass ? tones.findIndex((t) => samePc(t, vc.bass)) : 0;
    const plainTop = [13, 11, 9].find((d) => degs.some((x, i) => x === d && !altOf[i]));
    const majorThird = !LOW_FAMS.includes(fam);
    const req = degs.map((d, i) => d > 0 && (d === 7 || d === 6 || d === 4 || !!altOf[i] || d === plainTop
      || (d === 5 && (vc.quality === 'aug' || vc.quality === 'dim'))
      // A plain eleventh above a major third takes the third's place.
      || (d === 3 && !(plainTop === 11 && majorThird))));
    req[0] = true;
    const needs = () => req.filter(Boolean).length + (req[inv] ? 0 : 1);
    if (inv && needs() > 4) req[0] = false;    // no room: the root drops out (a rootless voicing)
    const ch = { root: pc(vc.root), q: null, fam, tones, degs, req, inv, ext: true, alts: extra.map(SIGN),
      // Two alterations of one degree (♭9 and ♯9) don't fit Clefwork's chord model or four voices.
      tooMany: new Set(extra.map((a) => a.slice(1))).size < extra.length,
      names: degs.map((d, i) => (altOf[i] ? SIGN(altOf[i]) : d ? DEG_NAME[d] : 'bass note')), symbol: MQ.chordSymbolOf(vc) };
    ch.needs = needs();
    return ch;
  }
  // What the numeral says about an extended chord: 9, 13, M9, 7♭9, 7sus4, add6 …
  function extText(ch) {
    const nat = (d) => ch.degs.some((x, i) => x === d && !ch.names[i].match(/[♭♯]/));
    let t = nat(13) ? '13' : nat(11) ? '11' : nat(9) ? '9' : ch.degs.includes(7) ? '7' : ch.degs.includes(6) ? 'add6' : '';
    if (ch.fam === 'maj7') t = 'M' + t;
    if (ch.fam === 'sus' || ch.fam === 'dom7sus') t += 'sus4';
    return t + (ch.alts || []).join('');
  }
  // The Roman numeral of any chord in a key, in pieces for drawing: {pre, num, mark, figs, sec, slash}.
  function romanDisp(ch, kd) {
    const deg = mod(ch.root.step - kd.tonic.step, 7);
    let shift = ch.root.alt - degree(kd, deg).alt;
    if (kd.mode === 'minor' && deg === 6 && shift === 1 && ['dim', 'dim7', 'hdim7'].includes(ch.fam)) shift = 0;
    const num = LOW_FAMS.includes(ch.fam) ? NUMS[deg].toLowerCase() : NUMS[deg];
    let mark = { dim: '°', dim7: '°', hdim7: 'ø', aug: '+' }[ch.fam] || '';
    let figs;
    if (ch.ext) figs = extText(ch) ? [extText(ch)] : [];
    else {
      figs = FIG_STACK[ch.degs.includes(7) ? ['7', '65', '43', '42'][ch.inv] : ['', '6', '64'][ch.inv]].slice();
      if (ch.fam === 'maj7' && !(shift === 0 && DIATONIC[kd.mode][deg][1] === 'maj7')) mark = 'M';
    }
    return { pre: shift < 0 ? '♭'.repeat(-shift) : '♯'.repeat(shift), num, mark, figs, sec: '',
      slash: ch.ext && ch.inv ? '/' + NOTE(ch.tones[ch.inv]) : '' };
  }
  const labelText = (d) => d.pre + d.num + d.mark + d.figs.join('') + d.sec + (d.slash || '');
  // Key, function and the rest, once the notes are known.
  function finish(ch, kd, home, disp) {
    ch.key = kd;
    ch.home = home;
    ch.deg = mod(ch.root.step - kd.tonic.step, 7);
    ch.sev = ch.degs.indexOf(7);
    ch.seventh = ch.sev >= 0;
    const lt = leadingTone(kd);
    ch.fn = samePc(ch.root, kd.tonic) ? 'T'
      : (ch.deg === 4 && (ch.fam === 'maj' || ch.fam === 'dom7') && samePc(ch.root, degree(kd, 4))) || (ch.deg === 6 && ['dim', 'dim7', 'hdim7'].includes(ch.fam) && samePc(ch.root, lt)) ? 'D'
        : '';
    ch.disp = disp || romanDisp(ch, kd);
    ch.label = labelText(ch.disp);
    return planesOf(ch);
  }
  // One numeral in a key → a chord (key not yet attached) with its drawn form, or null.
  function readNumeral(str, kd, bass) {
    const m = str.match(NUM_RE);
    if (!m) return null;
    const [, pre, num, rawMark, figRaw, altRaw, sus] = m;
    const mark = rawMark === 'o' ? '°' : rawMark === 'maj' || rawMark === 'ma' ? 'M' : rawMark || '';
    const upper = num === num.toUpperCase();
    const deg = NUMS.indexOf(num.toUpperCase());
    if ((mark === '°' || mark === 'ø') && upper) return null;
    const base = degree(kd, deg);
    let alt = base.alt + (pre === '#' ? 1 : pre === 'b' ? -1 : 0);
    const dimFam = mark === '°' || mark === 'ø';
    // In minor, vii° and viiø7 are built on the raised leading tone.
    if (!pre && kd.mode === 'minor' && deg === 6 && dimFam) alt += 1;
    const rootPc = { step: base.step, alt };
    const alts = altRaw ? altRaw.match(/[b#](?:5|9|11|13)/g) : [];
    // Ninths and up, alterations and sus chords go through the voicing model.
    if (alts.length || sus || ['9', '11', '13'].includes(figRaw)) {
      if (figRaw && !['7', '9', '11', '13'].includes(figRaw)) return null;
      const size = { '': 'triad', 7: 'seventh', 9: 'ninth', 11: 'eleventh', 13: 'thirteenth' }[figRaw];
      const quality = sus ? 'sus' : mark === '°' ? 'dim' : mark === 'ø' ? 'min' : mark === '+' ? 'aug' : upper ? 'maj' : 'min';
      const majorSeventh = mark === 'M' || (upper && !mark && DIATONIC[kd.mode][deg][0] === 'maj' && DIATONIC[kd.mode][deg][1] === 'maj7');
      const vc = MQ.makeChord(rootPc, quality, size, { majorSeventh, alts: mark === 'ø' ? alts.concat('b5') : alts, bass });
      const ch = fromVoicing(vc);
      return ch ? { ch } : null;
    }
    let fig = figRaw;
    if (!(fig in FIGS)) return null;
    if (mark === 'ø' && !FIGS[fig][1]) { if (fig) return null; fig = '7'; }
    let [inv, seventh] = FIGS[fig];
    let q;
    if (mark === '°') q = seventh ? 'dim7' : 'dim';
    else if (mark === 'ø') q = 'hdim7';
    else if (mark === '+') { if (seventh) return null; q = 'aug'; }
    else if (mark === 'M') { if (!upper) return null; q = seventh ? 'maj7' : 'maj'; }
    else if (upper) q = seventh ? (DIATONIC[kd.mode][deg][1] === 'maj7' && DIATONIC[kd.mode][deg][0] === 'maj' ? 'maj7' : 'dom7') : 'maj';
    else q = seventh ? 'min7' : 'min';
    const ch = plainChord(rootPc, q, inv);
    // A slash bass names the inversion instead: IV/A is IV6.
    if (bass) {
      if (fig) return null;
      ch.inv = ch.tones.findIndex((t) => samePc(t, bass));
      if (ch.inv < 0) return null;
      ch.symbol = MQ.symbolOf({ root: rootPc, q, bass: ch.inv ? bass : null });
      return { ch };
    }
    const shownMark = mark === 'M' ? (seventh ? 'M' : '') : mark;
    return { ch, disp: { pre: pre === 'b' ? '♭' : pre === '#' ? '♯' : '', num, mark: shownMark, figs: FIG_STACK[fig], sec: '', slash: '' } };
  }
  // A chord symbol ("G7/B", "Dmi9", "G7(♭9)") or a Roman numeral with figures, maybe secondary ("V65/V")
  // or over a named bass ("V9/B") → a chord, or null.
  function parseChord(label, home) {
    const raw = String(label || '').trim();
    if (!raw) return null;
    if (/^[A-G]/.test(raw)) {
      const vc = MQ.parseVoiceSymbol(raw);
      const ch = vc && fromVoicing(vc);
      if (!ch) return null;
      ch.fromSymbol = true;
      return finish(ch, home, home);
    }
    const parts = clean(raw).split('/');
    let bass = null;
    const last = parts[parts.length - 1];
    if (parts.length > 1 && /^[A-G][#b]?$/.test(last)) {
      bass = { step: 'CDEFGAB'.indexOf(last[0]), alt: last[1] === '#' ? 1 : last[1] === 'b' ? -1 : 0 };
      parts.pop();
    }
    if (parts.length > 2) return null;
    let kd = home, sec = '';
    if (parts.length === 2) {
      const tgt = readNumeral(parts[1], home);
      if (!tgt || tgt.ch.ext || tgt.ch.seventh || tgt.ch.inv || !['maj', 'min'].includes(tgt.ch.fam)) return null;
      kd = makeKey(tgt.ch.root, tgt.ch.fam === 'min' ? 'minor' : 'major');
      sec = '/' + tgt.disp.pre + tgt.disp.num;
    }
    const n = readNumeral(parts[0], kd, bass);
    if (!n || n.ch.tones.some((t) => Math.abs(t.alt) > 2)) return null;
    const disp = Object.assign(n.disp || romanDisp(n.ch, kd), { sec });
    return finish(n.ch, kd, home, disp);
  }
  // Chord symbols don't say what a chromatic chord does, so one that moves like a secondary dominant
  // (D7 to G in C) or leading-tone chord (F♯°7 to G) is heard and labelled that way: V7/V, vii°7/V.
  function tonicize(chords, home) {
    const sig = sigAlts(home.fifths);
    chords.forEach((ch, i) => {
      const next = chords[i + 1];
      if (!ch || !ch.fromSymbol || ch.fn === 'D' || !next || !['maj', 'min', 'maj7', 'min7', 'maj6', 'min6', 'dom7'].includes(next.fam)) return;
      if (!ch.tones.some((t) => t.alt !== sig[t.step])) return;
      const K = makeKey(next.root, ['min', 'min7', 'min6'].includes(next.fam) ? 'minor' : 'major');
      const dom = ['maj', 'dom7'].includes(ch.fam) && samePc(ch.root, degree(K, 4));
      const lt = ['dim', 'dim7', 'hdim7'].includes(ch.fam) && samePc(ch.root, leadingTone(K));
      if (!dom && !lt) return;
      const tgt = romanDisp(plainChord(next.root, ['min', 'min7', 'min6'].includes(next.fam) ? 'min' : 'maj', 0), home);
      finish(ch, K, home, Object.assign(romanDisp(ch, K), { sec: '/' + tgt.pre + tgt.num }));
    });
    return chords;
  }
  const sameHarmony = (a, b) => samePc(a.root, b.root) && a.fam === b.fam;
  const isTonicOf = (ch, kd) => samePc(ch.root, kd.tonic) && ['maj', 'min', 'maj7', 'min7', 'maj6', 'min6'].includes(ch.fam);
  const isSubmediantOf = (ch, kd) => samePc(ch.root, degree(kd, 5)) && ['maj', 'min', 'maj7', 'min7'].includes(ch.fam);
  const memberOf = (ch, p) => (p ? ch.tones.findIndex((t) => samePc(t, p)) : null);
  // Notes never doubled: sevenths, and in extended chords the sixth, sus fourth, extensions and altered notes.
  const noDouble = (ch, i) => ch.degs[i] === 7 || (ch.ext && (ch.degs[i] >= 9 || ch.degs[i] === 6 || ch.degs[i] === 4 || /[♭♯]/.test(ch.names[i])));
  const pcNum = (p) => mod(midi(at4(p)), 12);
  const toneList = (ch) => ch.tones.filter((t, i) => ch.degs[i] > 0).map(NOTE).join(' ');

  // ---------- figured bass ----------
  // The figures under a bass note: the usual abbreviation for the inversion, with an accidental on any
  // interval above the bass whose note isn't in the key signature. An accidental on its own means the third.
  // Extended chords list the notes the voices above the bass need (ninths and up as 9, 11, 13 in root
  // position); an unaltered third goes without saying, and so does the bass doubled at the octave.
  const accFor = (t, sig) => {
    const d = t.alt - sig[t.step];
    return !d ? '' : d > 0 ? (t.alt === 0 ? '♮' : t.alt === 2 ? '𝄪' : '♯') : (t.alt === 0 ? '♮' : t.alt === -2 ? '𝄫' : '♭');
  };
  function figuresFor(ch) {
    const sig = sigAlts(ch.home.fifths);
    const bass = ch.tones[ch.inv];
    if (ch.ext) {
      const figs = [];
      ch.tones.forEach((t, i) => {
        if (i === ch.inv || !ch.req5[i]) return;
        let iv = mod(t.step - bass.step, 7) + 1;
        if (iv === 1) return;
        if (ch.inv === 0 && ch.degs[i] >= 9) iv = ch.degs[i];
        figs.push({ iv, acc: accFor(t, sig) });
      });
      return figs.filter((f) => !(f.iv === 3 && !f.acc && figs.length > 1)).sort((x, y) => y.iv - x.iv)
        .map((f) => (f.iv === 3 && f.acc ? f.acc : f.acc + f.iv));
    }
    const shown = FIG_STACK[ch.seventh ? ['7', '65', '43', '42'][ch.inv] : ['', '6', '64'][ch.inv]].slice();
    const accs = {};
    ch.tones.forEach((t, i) => {
      if (i === ch.inv) return;
      const iv = mod(t.step - bass.step, 7) + 1;
      if (accFor(t, sig)) accs[iv] = accFor(t, sig);
    });
    const out = shown.map((f) => (accs[f] ? accs[f] + f : f));
    Object.keys(accs).map(Number).filter((iv) => !shown.includes(String(iv))).forEach((iv) => {
      out.push(iv === 3 ? accs[iv] : accs[iv] + iv);
    });
    // Largest interval on top; a lone accidental (the third) goes at the bottom.
    const val = (f) => (/\d/.test(f) ? +f.replace(/\D/g, '') : 3);
    return out.sort((a, b) => val(b) - val(a));
  }

  // ---------- the rules ----------
  const RULES = [
    { id: 'notes', group: 'chord', label: 'Right notes', blurb: 'Every note belongs to the chord and is spelled the chord’s way.' },
    { id: 'bass', group: 'chord', label: 'Right bass note', blurb: 'The bass is the chord member the inversion asks for.' },
    { id: 'complete', group: 'chord', label: 'Complete chords', blurb: 'Root, third and seventh are all there. Only a root-position chord may leave out its fifth, by doubling (or tripling) the root. Extended chords keep the third, seventh, altered notes and top extension.' },
    { id: 'doubleLT', group: 'chord', label: 'Leading tone not doubled', blurb: 'Never double the leading tone of a dominant chord.' },
    { id: 'doubleSeventh', group: 'chord', label: 'Sevenths and tensions not doubled', blurb: 'Never double a chord’s seventh, or the ninth, eleventh, thirteenth or altered notes of an extended chord.' },
    { id: 'doubling', group: 'chord', label: 'Preferred doublings', blurb: 'Double the root of a root-position triad (the third of vi after V is fine), and the bass of a six-four chord.' },
    { id: 'melodyClash', group: 'chord', label: 'No minor ninth under the melody', blurb: 'The top voice isn’t a half step (a minor ninth) above another note of the chord — a ♭9 above the root is the one exception. So no root on top of a major seventh chord, no seventh on top of a thirteenth chord.' },
    { id: 'range', group: 'space', label: 'Voice ranges', blurb: 'Soprano C4–G5, alto G3–C5, tenor C3–G4, bass E2–C4.' },
    { id: 'spacing', group: 'space', label: 'Spacing', blurb: 'No more than an octave between soprano and alto, or between alto and tenor.' },
    { id: 'crossing', group: 'space', label: 'No voice crossing', blurb: 'Each voice stays at or below the voice above it.' },
    { id: 'overlap', group: 'space', label: 'No overlapping', blurb: 'A voice doesn’t move past the note its neighbour just sang.' },
    { id: 'parallel', group: 'motion', label: 'No parallel fifths or octaves', blurb: 'Two voices a perfect fifth, octave or unison apart don’t move the same way to the same interval.' },
    { id: 'contrary', group: 'motion', label: 'No fifths or octaves by contrary motion', blurb: 'The same intervals reached by contrary motion count too.' },
    { id: 'direct', group: 'motion', label: 'No direct fifths or octaves', blurb: 'The outer voices don’t move the same way into a perfect fifth or octave with a leap in the soprano.' },
    { id: 'unequal', group: 'motion', label: 'No unequal fifths with the bass', blurb: 'A diminished fifth doesn’t move to a perfect fifth against the bass.' },
    { id: 'crossRelation', group: 'motion', label: 'No cross relations', blurb: 'When the next chord alters a note (B♭ to B♮), the same voice makes that half step, not another voice.' },
    { id: 'melodic', group: 'motion', label: 'Singable lines', blurb: 'No augmented leaps and nothing wider than an octave. A leap of a seventh is a warning.' },
    { id: 'smooth', group: 'motion', label: 'Smooth inner voices', blurb: 'Alto and tenor move by common tone, by step, or by a leap of a fourth at most.' },
    { id: 'closest', group: 'motion', label: 'Shortest path', blurb: 'Keep common tones and move the upper voices to the nearest notes of the next chord. The bass may jump as much as it likes.' },
    { id: 'leadingTone', group: 'resolve', label: 'Leading tone resolves', blurb: 'From a dominant chord to its tonic, the leading tone rises to the tonic. In an inner voice it may fall to the fifth after V or V7, and it may stay put as the seventh of IM7.' },
    { id: 'seventh', group: 'resolve', label: 'Sevenths resolve down', blurb: 'A chord’s seventh steps down into the next chord, or stays put when the next chord has it too (in V4/3–I6 it may step up).' },
    { id: 'guideLow', group: 'voicing', label: 'Thirds and sevenths low', blurb: 'In chords with a seventh (or sixth), the third and seventh sit below the octave, fifth, ninth, eleventh and thirteenth.' },
    { id: 'noNinths', group: 'voicing', label: 'No ninths between voices', blurb: 'No two upper voices are a ninth apart — except the root and the ninth.' },
    { id: 'layerSevenths', group: 'voicing', label: 'Sevenths between the layers', blurb: 'Ideally a low note has a high note a seventh above it: the third up to the ninth, the seventh up to the thirteenth.' },
    { id: 'cad64', group: 'resolve', label: 'Cadential six-four resolves', blurb: 'In I6/4–V the notes a sixth and a fourth above the bass step down.' },
  ];
  const GROUPS = [
    { id: 'chord', label: 'The chords' }, { id: 'space', label: 'Ranges and spacing' },
    { id: 'motion', label: 'Motion' }, { id: 'resolve', label: 'Resolutions' },
    { id: 'voicing', label: 'Voicings over a bass (extended chords)' },
  ];
  const PRESETS = [
    { id: 'traditional', label: 'Traditional',
      blurb: 'Common-practice SATB rules: parallels, doublings, and resolving tendency tones.',
      rules: RULES.map((r) => r.id).filter((id) => id !== 'closest') },
    { id: 'contemporary', label: 'Contemporary',
      blurb: 'Harmony in Contemporary Music: complete chords, and upper voices that move as little as possible. The bass is free.',
      rules: ['notes', 'bass', 'complete', 'doubleSeventh', 'melodyClash', 'range', 'spacing', 'crossing', 'smooth', 'closest', 'guideLow', 'noNinths', 'layerSevenths'] },
  ];

  // ---------- textures ----------
  // Two ways to write the parts. SATB: soprano, alto, tenor and bass. Over a bass (used whenever an exercise
  // has extended or altered chords): the bass alone at the bottom — the root, or the inversion's or slash
  // chord's bass in its place — and four voices above it, one for each plane of the chord.
  const TEXTURES = {
    satb: { id: 'satb', n: 4, names: ['soprano', 'alto', 'tenor', 'bass'],
      ranges: [[60, 79], [55, 72], [48, 67], [40, 60]], text: ['C4–G5', 'G3–C5', 'C3–G4', 'E2–C4'] },
    voicing: { id: 'voicing', n: 5, names: ['top voice', 'second voice', 'third voice', 'fourth voice', 'bass'],
      ranges: [[62, 81], [57, 77], [55, 74], [55, 70], [36, 55]], text: ['D4–A5', 'A3–F5', 'G3–D5', 'G3–B♭4', 'C2–G3'] },
  };
  const texOf = (n) => (n === 5 ? TEXTURES.voicing : TEXTURES.satb);
  // The four upper voices over a bass take one note from each plane: the 3 plane (third, or sus fourth),
  // the 7 plane (seventh or sixth; the octave in a triad), the 5 plane (a thirteenth or eleventh before
  // the fifth) and the 9 plane (a ninth, else the octave). A plain eleventh over a major third is the sus
  // fourth and the third goes. When the bass is a chord note other than the root, the root takes its plane.
  // Sets ch.req5 (the notes the upper voices need), ch.needs5 (how many upper voices that takes; 5 when
  // a plane would need two altered notes or tensions), ch.role5 (per tone: 'low' for the 3 and 7 planes,
  // 'high' for the 5 and 9 planes and octaves, 'both' for a root filling one of each) and ch.layer7 (some low
  // note has a high note a seventh above it, so a voicing can have a seventh between its layers).
  function planesOf(ch) {
    const all = ch.degs.map((d, i) => i).filter((i) => ch.degs[i] > 0);
    const altered = (i) => /[♭♯]/.test(ch.names[i]);
    let p3 = all.filter((i) => ch.degs[i] === 3 || ch.degs[i] === 4);
    const p7 = all.filter((i) => ch.degs[i] === 7 || ch.degs[i] === 6);
    let p5 = all.filter((i) => [5, 11, 13].includes(ch.degs[i]));
    const p9 = all.filter((i) => ch.degs[i] === 9);
    const nat11 = p5.find((i) => ch.degs[i] === 11 && !altered(i));
    if (nat11 != null && !LOW_FAMS.includes(ch.fam) && p3.length && ch.degs[p3[0]] === 3) { p3 = [nat11]; p5 = p5.filter((i) => i !== nat11); }
    const rank = (i) => (ch.degs[i] >= 11 ? (altered(i) ? 0 : ch.degs[i] === 13 ? 1 : 2) : altered(i) || ch.req[i] ? 3 : 4);
    p5.sort((a, b) => rank(a) - rank(b));
    p9.sort((a, b) => (altered(a) ? 0 : 1) - (altered(b) ? 0 : 1));
    // Two notes that both have to sound in one plane won't fit.
    const crowded = (p, must) => p.slice(1).some(must);
    const over = crowded(p5, (i) => altered(i) || ch.degs[i] >= 11) || crowded(p9, altered);
    const bassTone = ch.inv >= 0 && ch.degs[ch.inv] > 0 ? ch.inv : -1;
    const sub = (i) => (i != null && i === bassTone && bassTone !== 0 ? 0 : i);
    const low = [sub(p3[0]), sub(p7.length ? p7[0] : 0)], high = [sub(p5[0]), sub(p9.length ? p9[0] : 0)];
    const need = new Set(low.concat(high).filter((i) => i != null));
    ch.req5 = ch.tones.map((t, i) => need.has(i));
    ch.needs5 = over || ch.tooMany ? 5 : need.size;
    const role = ch.tones.map(() => null);
    const put = (i, r) => { if (i != null) role[i] = role[i] && role[i] !== r ? 'both' : r; };
    low.forEach((i) => put(i, 'low'));
    high.forEach((i) => put(i, 'high'));
    ch.degs.forEach((d, i) => { if (!role[i] && d > 0) role[i] = [3, 4, 6, 7].includes(d) ? 'low' : 'high'; });
    ch.role5 = role;
    ch.layer7 = role.some((r, l) => r && r !== 'high' && role.some((q, h) => q && q !== 'low' && h !== l && mod(ch.tones[h].step - ch.tones[l].step, 7) === 6));
    return ch;
  }

  // Interval helpers. perfect(hi, lo) → 5, 8 (octave or unison) or 0.
  const gen = (hi, lo) => dia(hi) - dia(lo);
  const semis = (hi, lo) => midi(hi) - midi(lo);
  function perfect(hi, lo) {
    const g = mod(gen(hi, lo), 7), s = mod(semis(hi, lo), 12);
    return g === 4 && s === 7 ? 5 : g === 0 && s === 0 ? 8 : 0;
  }
  const dimFifth = (hi, lo) => mod(gen(hi, lo), 7) === 4 && mod(semis(hi, lo), 12) === 6;
  // The largest major or perfect interval of each size (0 unison, 1 second … 7 octave).
  const NATURAL = [0, 2, 4, 5, 7, 9, 11, 12];
  const IV_NAMES = ['unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave'];
  const bassOnly = (ch, i) => ch.degs[i] === 0;
  // Which notes a column's voicing needs, and which voices count for it: over a bass, only the upper voices.
  const reqOf = (ch, n) => (n === 5 ? ch.req5 : ch.req);
  const counted = (V) => (V.length === 5 ? V.slice(0, 4) : V);

  // Over a bass, three habits of good voicings, checked once all four upper voices are written:
  // thirds and sevenths low (in chords with a seventh or sixth), no ninths between voices but the root and
  // the ninth (in every chord), and ideally a seventh between a low note and a high note (where the chord
  // has one to offer).
  function voicingIssues(ch, V, on, push) {
    const U = V.slice(0, 4), names = TEXTURES.voicing.names;
    if (!U.every(Boolean)) return;
    const m = U.map((p) => memberOf(ch, p));
    if (m.some((x) => x < 0)) return;
    const role = (v) => ch.role5[m[v]];
    const what = (v) => `${names[v]}’s ${NOTE(U[v])} (the ${ch.names[m[v]]})`;
    if (on.has('guideLow') && ch.degs.some((d) => d === 7 || d === 6)) {
      let hit = null;
      for (let i = 0; i < 4 && !hit; i++) for (let j = i + 1; j < 4 && !hit; j++) if (role(i) === 'low' && role(j) === 'high') hit = [i, j];
      if (hit) push('guideLow', 'warn', [hit[1], hit[0]], () => `The ${what(hit[1])} is below the ${what(hit[0])}. Keep the third and seventh low, with the octave, fifth, ninth, eleventh and thirteenth above them.`);
    }
    if (on.has('noNinths')) {
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          if (gen(U[i], U[j]) !== 8 || (ch.degs[m[j]] === 1 && ch.degs[m[i]] === 9)) continue;
          push('noNinths', 'error', [i, j], () => `A ninth between the ${what(j)} and the ${what(i)}. Only the root and the ninth may be a ninth apart.`);
        }
      }
    }
    if (on.has('layerSevenths') && ch.layer7 && ![2, 3].some((l) => [0, 1].some((h) => gen(U[h], U[l]) === 6))) {
      push('layerSevenths', 'warn', [0, 1, 2, 3], () => `No seventh between the low notes (${NOTE(U[3])}, ${NOTE(U[2])}) and the high notes (${NOTE(U[1])}, ${NOTE(U[0])}). Ideally a low note has a high note a seventh above it — the third up to the ninth, or the seventh up to the thirteenth.`);
    }
  }
  // The top voice can't sit a half step (a minor ninth, in any octave) above another note of the chord —
  // except a ♭9 above the root. One issue per chord.
  function melodyIssues(ch, V, push) {
    const top = V[0], names = texOf(V.length).names;
    if (!top) return;
    const mt = memberOf(ch, top);
    for (let v = 1; v < V.length; v++) {
      const p = V[v];
      if (!p || midi(top) <= midi(p) || mod(midi(top) - midi(p), 12) !== 1) continue;
      const mp = memberOf(ch, p);
      if (mt >= 0 && mp >= 0 && ch.degs[mt] === 9 && ch.degs[mp] === 1) continue;
      push('melodyClash', 'error', [0, v], () => `The ${names[0]}’s ${NOTE(top)}${mt >= 0 ? ` (the ${ch.names[mt]})` : ''} is a minor ninth above the ${names[v]}’s ${NOTE(p)}${mp >= 0 ? ` (the ${ch.names[mp]})` : ''}. Only a ♭9 above the root may sit a half step above a note of the chord — choose another note for the ${names[0]}.`);
      return;
    }
  }
  // What a voicing's chord-by-chord habits cost: {err, warn} counts for the voicing rules over a bass and
  // the melody rule.
  function voicingScore(ch, V, on) {
    const sc = { err: 0, warn: 0 };
    const count = (rule, sev) => (sev === 'error' ? sc.err++ : sc.warn++);
    if (V.length === 5) voicingIssues(ch, V, on, count);
    if (on.has('melodyClash')) melodyIssues(ch, V, count);
    return sc;
  }

  // ---------- checking ----------
  // An issue: {rule, sev 'error' | 'warn', col, to (the next column, for moves), voices [indices], text}.
  // V is one column's voicing (4 voices, or 5 over a bass); on is a Set of rule ids. Texts are functions so
  // the solver, which only counts issues, never builds them.
  function chordIssues(ch, V, col, on, prev, own, out) {
    const T = texOf(V.length), names = T.names, n = V.length, b = n - 1;
    const push = (rule, sev, voices, text) => out.push({ rule, sev, col, voices, text: text() });
    const pair = (i, j) => `the ${names[i]} and the ${names[j]}`;
    const mem = V.map((p) => memberOf(ch, p));
    if (on.has('notes')) {
      V.forEach((p, v) => {
        if (!p || !own[v] || (mem[v] >= 0 && !(v < b && bassOnly(ch, mem[v])))) return;
        const enh = ch.tones.find((t, i) => !bassOnly(ch, i) && pcNum(t) === pcNum(p));
        push('notes', 'error', [v], () => (enh
          ? `The ${names[v]}’s ${NOTE(p)} should be spelled ${NOTE(enh)}.`
          : `The ${names[v]}’s ${NOTE(p)} isn’t in the chord (${toneList(ch)}).`));
      });
    }
    if (on.has('bass') && V[b] && own[b] && mem[b] >= 0 && mem[b] !== ch.inv) {
      push('bass', 'error', [b], () => `The bass should be the ${ch.names[ch.inv]} (${NOTE(ch.tones[ch.inv])}) — the bass has the ${ch.names[mem[b]]}.`);
    }
    const full = V.every(Boolean) && mem.every((m) => m >= 0);
    if (full) {
      const cm = counted(mem);
      const count = ch.tones.map(() => 0);
      cm.forEach((m) => count[m]++);
      const req = reqOf(ch, n);
      if (on.has('complete')) {
        const missing = ch.tones.map((t, i) => i).filter((i) => req[i] && !count[i]);
        if (missing.length) push('complete', 'error', [], () => `The chord has no ${missing.map((i) => ch.names[i]).join(' or ')} (${missing.map((i) => NOTE(ch.tones[i])).join(', ')})${n === 5 ? ' above the bass' : ''}.`);
        else if (n === 4 && !ch.ext && !count[2]) {
          const okOmit = ch.inv === 0 && count[0] >= (ch.seventh ? 2 : 3);
          if (!okOmit) push('complete', 'warn', [], () => (ch.inv === 0
            ? `No fifth (${NOTE(ch.tones[2])}). If you leave it out, ${ch.seventh ? 'double' : 'triple'} the root instead.`
            : `No fifth (${NOTE(ch.tones[2])}) — an inverted chord should be complete.`));
        }
      }
      const lt = ch.fn === 'D' ? leadingTone(ch.key) : null;
      if (on.has('doubleLT') && lt) {
        const vs = V.map((p, v) => (samePc(p, lt) ? v : -1)).filter((v) => v >= 0);
        if (vs.length > 1) push('doubleLT', 'error', vs, () => `The leading tone (${NOTE(lt)}) is doubled — it has to rise to the tonic, so double another note.`);
      }
      if (on.has('doubleSeventh')) {
        const all = ch.tones.map(() => 0);
        mem.forEach((m) => all[m]++);
        all.forEach((c, i) => {
          if (c > 1 && noDouble(ch, i)) push('doubleSeventh', 'error', mem.map((m, v) => (m === i ? v : -1)).filter((v) => v >= 0), () => `The ${ch.names[i]} (${NOTE(ch.tones[i])}) is doubled.`);
        });
      }
      if (on.has('doubling') && n === 4 && !ch.seventh && !ch.ext) {
        const dbl = count.findIndex((c) => c >= 2);
        const vs = (m) => mem.map((x, v) => (x === m ? v : -1)).filter((v) => v >= 0);
        const deceptive = prev && prev.fn === 'D' && isSubmediantOf(ch, prev.key);
        if (ch.inv === 0 && ['maj', 'min'].includes(ch.q) && dbl === 1 && count[0] < 2 && !deceptive) {
          push('doubling', 'warn', vs(1), () => `In a root-position triad, double the root (${NOTE(ch.tones[0])}) rather than the third.`);
        }
        if (ch.inv === 2 && count[2] < 2) push('doubling', 'warn', vs(dbl), () => `In a six-four chord, double the bass (${NOTE(ch.tones[2])}).`);
      }
    }
    if (n === 5) voicingIssues(ch, V, on, push);
    if (on.has('melodyClash')) melodyIssues(ch, V, push);
    if (on.has('range')) {
      V.forEach((p, v) => {
        if (!p || !own[v]) return;
        const m = midi(p), r = T.ranges[v];
        if (m < r[0] || m > r[1]) push('range', 'warn', [v], () => `The ${names[v]}’s ${fullName(p)} is ${m < r[0] ? 'below' : 'above'} its range (${T.text[v]}).`);
      });
    }
    if (on.has('spacing')) {
      for (let i = 0; i < n - 2; i++) {
        if (V[i] && V[i + 1] && semis(V[i], V[i + 1]) > 12) push('spacing', 'error', [i, i + 1], () => `More than an octave between ${pair(i, i + 1)}.`);
      }
    }
    if (on.has('crossing')) {
      for (let i = 0; i < n - 1; i++) {
        if (V[i] && V[i + 1] && semis(V[i], V[i + 1]) < 0) push('crossing', 'error', [i, i + 1], () => `The ${names[i + 1]} is above the ${names[i]}.`);
      }
    }
  }

  // One move, from column col (chord a, voicing A) to the next (chord b, voicing B).
  function moveIssues(a, b, A, B, col, on, out, quick) {
    const n = A.length, bass = n - 1, names = texOf(n).names;
    const push = (rule, sev, voices, text) => out.push({ rule, sev, col, to: col + 1, voices, text: quick ? '' : text() });
    const pair = (i, j) => `the ${names[i]} and the ${names[j]}`;
    const both = (v) => A[v] && B[v];
    const dir = (v) => Math.sign(midi(B[v]) - midi(A[v]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!both(i) || !both(j)) continue;
        const k1 = perfect(A[i], A[j]), k2 = perfect(B[i], B[j]);
        if (k1 && k1 === k2 && (!samePc(A[i], B[i]) || !samePc(A[j], B[j]))) {
          const di = dir(i), dj = dir(j);
          const what = () => (k1 === 5 ? 'fifths' : semis(A[i], A[j]) === 0 && semis(B[i], B[j]) === 0 ? 'unisons' : 'octaves');
          const notes = () => `${NOTE(A[i])}–${NOTE(A[j])} to ${NOTE(B[i])}–${NOTE(B[j])}`;
          if (di && di === dj && on.has('parallel')) push('parallel', 'error', [i, j], () => `Parallel ${what()} between ${pair(i, j)} (${notes()}).`);
          else if (di && di === -dj && on.has('contrary')) push('contrary', 'error', [i, j], () => `${cap(what())} by contrary motion between ${pair(i, j)} (${notes()}).`);
        } else if (i === 0 && j === bass && on.has('direct') && k2 && k1 !== k2) {
          const di = dir(0), dj = dir(bass);
          if (di && di === dj && Math.abs(gen(B[0], A[0])) > 1) {
            push('direct', 'error', [0, bass], () => `Direct ${k2 === 5 ? 'fifths' : 'octaves'} in the outer voices: they move the same way into a ${k2 === 5 ? 'fifth' : 'octave'} and the ${names[0]} leaps.`);
          }
        }
        if (j === bass && on.has('unequal') && dimFifth(A[i], A[j]) && perfect(B[i], B[j]) === 5) {
          push('unequal', 'warn', [i, j], () => `Unequal fifths: a diminished fifth to a perfect fifth between ${pair(i, j)}.`);
        }
      }
    }
    if (on.has('crossRelation')) {
      for (let v = 0; v < n; v++) {
        for (let w = 0; w < n; w++) {
          if (v === w || !A[v] || !B[w] || A[v].step !== B[w].step || A[v].alt === B[w].alt) continue;
          // Fine when the voice that had the note makes the half step itself.
          if (B[v] && B[v].step === A[v].step && B[v].alt === B[w].alt) continue;
          push('crossRelation', 'warn', [v, w], () => `Cross relation: ${NOTE(A[v])} in the ${names[v]}, then ${NOTE(B[w])} in the ${names[w]}. Let the ${names[v]} move ${NOTE(A[v])}–${NOTE(B[w])} itself.`);
        }
      }
    }
    if (on.has('overlap')) {
      for (let v = 0; v < n - 1; v++) {
        if (!both(v) || !both(v + 1)) continue;
        if (midi(B[v + 1]) > midi(A[v])) push('overlap', 'warn', [v, v + 1], () => `The ${names[v + 1]} moves above where the ${names[v]} just was.`);
        else if (midi(B[v]) < midi(A[v + 1])) push('overlap', 'warn', [v, v + 1], () => `The ${names[v]} moves below where the ${names[v + 1]} just was.`);
      }
    }
    for (let v = 0; v < n; v++) {
      if (!both(v)) continue;
      const g = Math.abs(gen(B[v], A[v])), s = Math.abs(semis(B[v], A[v]));
      if (on.has('melodic')) {
        if (s > 12) push('melodic', 'error', [v], () => `The ${names[v]} leaps more than an octave (${fullName(A[v])} to ${fullName(B[v])}).`);
        else if (g >= 1 && g <= 6 && s > NATURAL[g]) push('melodic', 'error', [v], () => `The ${names[v]} moves by an augmented ${IV_NAMES[g]} (${NOTE(A[v])} to ${NOTE(B[v])}).`);
        else if (g === 6) push('melodic', 'warn', [v], () => `The ${names[v]} leaps a seventh (${NOTE(A[v])} to ${NOTE(B[v])}).`);
      }
      if (on.has('smooth') && v > 0 && v < bass && s > 5) {
        push('smooth', 'warn', [v], () => `The ${names[v]} leaps a ${IV_NAMES[Math.min(g, 7)]} — inner voices move by common tone, step, or a small leap.`);
      }
    }
    // Tendency tones.
    if (!sameHarmony(a, b)) {
      if (on.has('leadingTone') && a.fn === 'D') {
        const K = a.key, lt = leadingTone(K);
        const toTonic = isTonicOf(b, K), deceptive = isSubmediantOf(b, K);
        if (toTonic || deceptive) {
          for (let v = 0; v < n; v++) {
            if (!both(v) || !samePc(A[v], lt)) continue;
            if (samePc(B[v], K.tonic) && semis(B[v], A[v]) === 1) continue;
            // It may stay where it is when the tonic chord has it too (the seventh of IM7).
            if (toTonic && semis(B[v], A[v]) === 0 && memberOf(b, B[v]) >= 0) continue;
            // An inner voice may fall to the fifth of the tonic chord after V or V7 (not after vii°).
            const frustrated = v > 0 && v < bass && toTonic && a.deg === 4 && samePc(B[v], degree(K, 4)) && semis(B[v], A[v]) < 0 && semis(B[v], A[v]) >= -4;
            if (frustrated) continue;
            push('leadingTone', 'error', [v], () => `The leading tone (${NOTE(lt)}) in the ${names[v]} should rise to the tonic (${NOTE(K.tonic)}).`);
          }
        }
      }
      if (on.has('seventh') && a.seventh) {
        for (let v = 0; v < n; v++) {
          if (!both(v) || memberOf(a, A[v]) !== a.sev) continue;
          const g = gen(B[v], A[v]);
          if (g === -1) continue;
          // Held as a common tone of the next chord (IM7 to V7: the seventh stays as V7's third).
          if (semis(B[v], A[v]) === 0 && memberOf(b, B[v]) >= 0) continue;
          const v43 = a.fam === 'dom7' && !a.ext && a.inv === 2 && isTonicOf(b, a.key) && b.inv === 1 && g === 1;
          if (v43) continue;
          push('seventh', 'error', [v], () => `The seventh (${NOTE(A[v])}) in the ${names[v]} should step down.`);
        }
      }
    }
    if (on.has('cad64') && isTonicOf(a, a.key) && !a.ext && a.inv === 2 && !a.seventh && b.fn === 'D' && b.deg === 4 && b.inv === 0) {
      for (let v = 0; v < bass; v++) {
        if (!both(v)) continue;
        const m = memberOf(a, A[v]);
        if ((m === 0 || m === 1) && gen(B[v], A[v]) !== -1) {
          push('cad64', 'error', [v], () => `In the cadential six-four, the ${names[v]}’s ${NOTE(A[v])} (the ${m === 0 ? 'fourth' : 'sixth'} above the bass) should step down.`);
        }
      }
    }
  }

  // Every way to voice one chord. fixed: [p|null] per voice (4, or 5 over a bass), notes that can't change.
  // Only voicings that keep the order of the voices, keep the spacing, and have the needed notes without
  // doubling the leading tone, the seventh or a tension. Over a bass the upper voices never share a note.
  function voicingsOf(ch, fixed, opts) {
    const o = opts || {};
    const n = fixed.length, b = n - 1, T = texOf(n);
    const req = reqOf(ch, n);
    const lt = ch.fn === 'D' ? leadingTone(ch.key) : null;
    const choices = fixed.map((f, v) => {
      if (f) return [f];
      const out = [];
      ch.tones.forEach((t, i) => {
        if (v === b ? i !== ch.inv : bassOnly(ch, i)) return;
        for (let oct = 1; oct <= 6; oct++) {
          const p = { step: t.step, oct, alt: t.alt };
          const m = midi(p);
          if (m >= T.ranges[v][0] && m <= T.ranges[v][1]) out.push(p);
        }
      });
      return out;
    });
    const out = [];
    const ok = (V) => {
      const mem = V.map((p) => memberOf(ch, p));
      if (mem.some((m) => m < 0) && !o.loose) return;
      if (!o.loose) {
        const count = ch.tones.map(() => 0);
        counted(mem).forEach((m) => count[m]++);
        if (req.some((r, i) => r && !count[i])) return;
        if (n === 4 && !ch.ext && !count[2] && !(ch.inv === 0 && count[0] >= (ch.seventh ? 2 : 3))) return;
        const all = ch.tones.map(() => 0);
        mem.forEach((m) => all[m]++);
        if (all.some((c, i) => c > 1 && noDouble(ch, i))) return;
        if (lt && V.filter((p) => samePc(p, lt)).length > 1) return;
      }
      out.push(V.slice());
    };
    // Voices from the bottom up, each at or above the one below (strictly above, among the upper voices
    // over a bass), within an octave of it where spacing asks.
    const V = new Array(n);
    const place = (v) => {
      if (v < 0) { ok(V); return; }
      choices[v].forEach((p) => {
        if (v < b) {
          const below = midi(V[v + 1]), m = midi(p);
          if (m < below || (n === 5 && v < b - 1 && m === below) || (n === 5 && v === b - 1 && m <= below)) return;
          if (v < b - 1 && m - below > 12) return;
        }
        V[v] = p;
        place(v - 1);
      });
    };
    place(b);
    return out;
  }

  // The checker. ex: an exercise; placed: per column [p|null] per voice, for the voices the student writes.
  // Returns {issues, missing: [{col, voices}]}.
  function check(ex, placed, rules) {
    const on = rules instanceof Set ? rules : new Set(rules);
    const issues = [], missing = [];
    const cols = ex.chords.map((ch, c) => voicingAt(ex, placed, c));
    ex.chords.forEach((ch, c) => {
      const own = ex.given[c].map((p) => !p);
      const gap = cols[c].map((p, v) => (p ? -1 : v)).filter((v) => v >= 0);
      if (gap.length) missing.push({ col: c, voices: gap });
      chordIssues(ch, cols[c], c, on, c ? ex.chords[c - 1] : null, own, issues);
      if (c) moveIssues(ex.chords[c - 1], ch, cols[c - 1], cols[c], c - 1, on, issues);
    });
    if (on.has('closest')) {
      const n = ex.given[0].length, b = n - 1, up = [...Array(b).keys()];
      for (let c = 1; c < ex.chords.length; c++) {
        const A = cols[c - 1], B = cols[c];
        if (!up.every((v) => A[v] && B[v]) || !B[b]) continue;
        const fixed = ex.given[c].slice();
        fixed[b] = B[b];
        const moved = (V) => up.reduce((s, v) => s + Math.abs(midi(V[v]) - midi(A[v])), 0);
        const opts = voicingsOf(ex.chords[c], fixed).filter((V) => !voicingScore(ex.chords[c], V, on).err);
        if (!opts.length) continue;
        const best = Math.min(...opts.map(moved)), now = moved(B);
        if (now > best + 2) {
          issues.push({ rule: 'closest', sev: 'warn', col: c - 1, to: c, voices: up,
            text: `The upper voices move ${now} half steps in all; they could move as few as ${best}. Keep common tones and take the nearest notes of the next chord.` });
        }
      }
    }
    const order = { error: 0, warn: 1 };
    issues.sort((x, y) => x.col - y.col || (x.to != null) - (y.to != null) || order[x.sev] - order[y.sev]);
    return { issues, missing };
  }
  // A column's voices: the printed notes, plus what the student wrote.
  function voicingAt(ex, placed, c) {
    return ex.given[c].map((g, v) => g || ((placed && placed[c]) || [])[v] || null);
  }

  // ---------- the solver ----------
  // The best voicing of a whole exercise, by dynamic programming over every voicing of every chord.
  // Each chord costs something for its doubling and range, each move for the rules it breaks (an error
  // 1000, a warning 30) plus how far the voices travel — much more so when the rules ask for the shortest
  // path. opts: {fixed (per column), rules, rng (to vary the answer), melody (shape the top voice into a tune)}.
  // Over a bass, the bass line is placed first: each chord's bass note in the octave that keeps it smooth.
  const STRICT = new Set(RULES.map((r) => r.id).filter((id) => id !== 'closest'));
  function staticCost(ch, V, prev, rules) {
    let cost = 0;
    const n = V.length, T = texOf(n);
    const mem = V.map((p) => memberOf(ch, p));
    const count = ch.tones.map(() => 0);
    mem.forEach((m) => count[m]++);
    if (n === 4) {
      const deceptive = prev && prev.fn === 'D' && isSubmediantOf(ch, prev.key);
      if (!ch.seventh && !ch.ext) {
        if (ch.inv === 0 && count[1] > 1) cost += deceptive ? 0 : 24;
        if (ch.inv === 0 && count[2] > 1) cost += 8;
        if (deceptive && count[1] < 2) cost += 10;
        if (ch.inv === 2 && count[2] < 2) cost += 40;
      }
      if (!ch.ext && !count[2]) cost += 14;
      for (let v = 0; v < 3; v++) if (midi(V[v]) === midi(V[v + 1])) cost += 6;
    } else {
      // Voicings take up as little room as they can, and keep the voicing rules that are on.
      cost += Math.max(0, midi(V[0]) - midi(V[3]) - 12) * 0.8;

    }
    V.forEach((p, v) => { const r = T.ranges[v], mid = (r[0] + r[1]) / 2; cost += Math.max(0, Math.abs(midi(p) - mid) - 5) * 0.6; });
    // The chord-by-chord rules that are on: the voicing habits over a bass, and the melody rule.
    if (rules) { const sc = voicingScore(ch, V, rules); cost += sc.err * 1000 + sc.warn * 80; }
    return cost;
  }
  function moveCost(a, b, A, B, rules, melody) {
    const out = [];
    moveIssues(a, b, A, B, 0, rules, out, true);
    let cost = 0;
    out.forEach((it) => (cost += it.sev === 'error' ? 1000 : 30));
    const n = A.length, w = rules.has('closest') ? 8 : 1;
    for (let v = 0; v < n - 1; v++) cost += Math.abs(midi(B[v]) - midi(A[v])) * w;
    cost += Math.abs(midi(B[n - 1]) - midi(A[n - 1])) * 0.25;
    if (melody) {
      const s = Math.abs(midi(B[0]) - midi(A[0]));
      if (s === 0) cost += 5;
      if (s > 4) cost += (s - 4) * 2;
    }
    return cost;
  }
  // The bass line over a bass: each chord's bass note in the octave that leaps least, near the middle of the range.
  function bassLine(chords, fixed) {
    const [lo, hi] = TEXTURES.voicing.ranges[4];
    const opts = chords.map((ch, c) => {
      if (fixed[c] && fixed[c][4]) return [fixed[c][4]];
      const t = ch.tones[ch.inv], out = [];
      for (let oct = 1; oct <= 4; oct++) { const p = { step: t.step, oct, alt: t.alt }; if (midi(p) >= lo && midi(p) <= hi) out.push(p); }
      return out;
    });
    const own = (p) => Math.abs(midi(p) - 47) * 0.5 + Math.max(0, 40 - midi(p)) * 2;
    let cost = opts[0].map(own);
    const back = [null];
    for (let c = 1; c < opts.length; c++) {
      const next = [], from = [];
      opts[c].forEach((p) => {
        let best = Infinity, arg = 0;
        opts[c - 1].forEach((q, i) => {
          const leap = Math.abs(midi(p) - midi(q));
          const x = cost[i] + leap + (leap > 7 ? (leap - 7) * 3 : 0);
          if (x < best) { best = x; arg = i; }
        });
        next.push(best + own(p));
        from.push(arg);
      });
      cost = next;
      back.push(from);
    }
    let j = cost.indexOf(Math.min(...cost));
    const line = [];
    for (let c = opts.length - 1; c >= 0; c--) { line[c] = opts[c][j]; if (c) j = back[c][j]; }
    return line;
  }
  function solve(ex, opts) {
    const o = opts || {};
    const rules = o.rules ? new Set(o.rules) : STRICT;
    const n = ex.given ? ex.given[0].length : 4;
    let fixed = ex.chords.map((ch, c) => ((o.fixed && o.fixed[c]) || new Array(n).fill(null)).slice());
    if (n === 5) {
      const line = bassLine(ex.chords, fixed);
      fixed.forEach((f, c) => (f[4] = f[4] || line[c]));
    }
    const cands = ex.chords.map((ch, c) => voicingsOf(ch, fixed[c]));
    if (cands.some((list) => !list.length)) return null;
    const noise = (list) => list.map(() => (o.rng ? o.rng() * 10 : 0));
    const nz0 = noise(cands[0]);
    let prevCost = cands[0].map((V, i) => staticCost(ex.chords[0], V, null, rules) + nz0[i]);
    const back = [null];
    const melody = o.melody && !rules.has('closest');
    for (let c = 1; c < cands.length; c++) {
      const a = ex.chords[c - 1], b = ex.chords[c];
      const nz = noise(cands[c]);
      const last = c === cands.length - 1;
      const cost = [], from = [];
      cands[c].forEach((B, j) => {
        let best = Infinity, arg = -1;
        cands[c - 1].forEach((A, i) => {
          if (prevCost[i] >= best) return;
          const x = prevCost[i] + moveCost(a, b, A, B, rules, melody);
          if (x < best) { best = x; arg = i; }
        });
        let own = staticCost(b, B, a, rules) + nz[j];
        // A tune ends on the tonic when the phrase ends on the tonic chord.
        if (melody && last && isTonicOf(b, b.home) && !samePc(B[0], b.home.tonic)) own += 12;
        cost.push(best + own);
        from.push(arg);
      });
      prevCost = cost;
      back.push(from);
    }
    let j = prevCost.indexOf(Math.min(...prevCost));
    const total = prevCost[j];
    const out = [];
    for (let c = cands.length - 1; c >= 0; c--) {
      out[c] = cands[c][j].map((p) => ({ ...p }));
      if (c) j = back[c][j];
    }
    return { voices: out, cost: total };
  }

  // ---------- exercises ----------
  // What's printed: the voices given (gives) and, separately, how the chords are labelled (LABELS).
  const TYPES = [
    { id: 'bass', label: 'Write the upper voices', gives: [3], blurb: 'The bass is given. Write the soprano, alto and tenor.' },
    { id: 'roman', label: 'Write all four voices', gives: [], blurb: 'Only the chords are given. Write every voice, bass included.' },
    { id: 'soprano', label: 'Harmonize a soprano', gives: [0], blurb: 'The melody is given. Write the alto, tenor and bass.' },
    { id: 'resolve', label: 'Resolve the chords', gives: [3], blurb: 'The first chord is written out. Write the next one, two or three chords over the given bass.' },
  ];
  const LABELS = [
    { id: 'symbols', label: 'Chord symbols', short: 'chord symbols' },
    { id: 'roman', label: 'Roman numerals', short: 'Roman numerals' },
    { id: 'figures', label: 'Figured bass', short: 'figured bass' },
  ];
  // Figures only make sense under a printed bass line.
  const labelsWork = (type, show) => show.length > 0 && !(show.length === 1 && show[0] === 'figures' && !TYPES.find((t) => t.id === type).gives.includes(3));
  // Phrases are built from these pieces, written for a major key (minor keys translate them):
  // a tonic opening, maybe a predominant, a dominant, and a cadence.
  const OPEN = [['I'], ['I'], ['I', 'I6'], ['I', 'V6', 'I'], ['I', 'V65', 'I'], ['I', 'V43', 'I6'], ['I', 'vii°6', 'I6'],
    ['I', 'IV', 'I'], ['I', 'IV64', 'I'], ['I', 'V42', 'I6'], ['I', 'V', 'I'], ['I', 'V7', 'I']];
  const PRE = [[], ['IV'], ['IV'], ['ii6'], ['ii6'], ['ii'], ['ii65'], ['ii7'], ['IV', 'ii6'], ['vi', 'IV'], ['vi', 'ii6'], ['vi', 'ii'], ['vi', 'ii65'], ['IV6', 'ii65']];
  const DOM = [['V'], ['V'], ['V7'], ['V7'], ['I64', 'V'], ['I64', 'V7'], ['V/V', 'V'], ['V65/V', 'V'], ['vii°7/V', 'V'], ['V7/V', 'V']];
  // Short exercises: a resolution or a cadence, two to four chords.
  const SHORT_EX = [
    ['V', 'I'], ['V7', 'I'], ['V65', 'I'], ['V43', 'I'], ['V43', 'I6'], ['V42', 'I6'], ['vii°6', 'I'], ['vii°6', 'I6'], ['V', 'vi'], ['V7', 'vi'],
    ['IV', 'V', 'I'], ['ii6', 'V', 'I'], ['ii', 'V', 'I'], ['ii65', 'V7', 'I'], ['ii7', 'V7', 'I'], ['IV', 'V7', 'I'],
    ['I64', 'V', 'I'], ['I64', 'V7', 'I'], ['ii6', 'I64', 'V', 'I'], ['IV', 'I64', 'V7', 'I'], ['IV', 'I'], ['I', 'IV64', 'I'],
    ['I', 'V65', 'I'], ['I', 'vii°6', 'I6'], ['I', 'V43', 'I6'],
    ['V/V', 'V', 'I'], ['V7/V', 'V', 'I'], ['V65/V', 'V', 'I'], ['vii°7/V', 'V', 'I'], ['V7/IV', 'IV', 'V', 'I'], ['V7/vi', 'vi'], ['V7/ii', 'ii', 'V', 'I'],
    { minor: ['iv6', 'V'] }, { minor: ['vii°7', 'I'] }, { minor: ['vii°65', 'I6'] }, { minor: ['vii°43', 'I6'] },
  ];
  // Major-key numerals → minor-key numerals.
  // A root-position ii° is avoided, so iv takes its place.
  const TO_MINOR = { I: 'i', I6: 'i6', I64: 'i64', IV: 'iv', IV6: 'iv6', IV64: 'iv64', ii: 'iv', ii6: 'ii°6', ii7: 'iiø7', ii65: 'iiø65', vi: 'VI', iii: 'III' };
  const minorOf = (lab) => {
    const [main, sec] = lab.split('/');
    const t = (x) => TO_MINOR[x] || x;
    return sec ? `${main}/${t(sec)}` : t(main);
  };
  // What a numeral asks for: sevenths, inversions, six-fours, secondary chords.
  function tagsOf(lab) {
    const fig = (lab.split('/')[0].match(/\d+$/) || [''])[0];
    return { sev: /7|65|43|42/.test(fig) || lab.includes('ø'), inv: ['6', '65', '43', '42'].includes(fig), six4: fig === '64', sec: lab.includes('/') };
  }
  const allowed = (labs, s) => labs.every((lab) => {
    const t = tagsOf(lab);
    return (!t.sev || s.sevenths) && (!t.inv || s.inversions) && (!t.six4 || s.sixFour) && (!t.sec || s.secondary);
  });
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  // With extensions or alterations on, some root-position chords take a ninth, eleventh or thirteenth
  // (V9, V13, ii9, IM9 …) or an altered note on the dominant (V7♭9, V7♯11 …) — at least one per exercise.
  function enrich(labels, s, rng, mode) {
    const optsFor = (lab, i) => {
      const out = [];
      const last = i === labels.length - 1;
      if (lab === 'V' || lab === 'V7') {
        if (s.extensions && mode === 'major') out.push('V9', 'V13');
        if (s.alterations) out.push(...(mode === 'major' ? ['V7b9', 'V7#9', 'V7b13', 'V7#5', 'V7#11'] : ['V7b9', 'V7b13', 'V7#9']));
      } else if (s.extensions && mode === 'major') {
        if (lab === 'ii' || lab === 'ii7') out.push('ii9', 'ii11');
        if (lab === 'IV') out.push('IVM9');
        if (lab === 'vi') out.push('vi9');
        if (lab === 'I' && last) out.push('IM9');
      } else if (s.extensions) {
        if (lab === 'iv') out.push('iv9');
        if (lab === 'i' && last) out.push('i9');
      }
      return out;
    };
    const opts = labels.map(optsFor);
    const out = labels.map((lab, i) => (opts[i].length && rng() < 0.5 ? pick(rng, opts[i]) : lab));
    const can = opts.map((o, i) => i).filter((i) => opts[i].length);
    if (can.length && out.every((lab, i) => lab === labels[i])) { const i = pick(rng, can); out[i] = pick(rng, opts[i]); }
    return out;
  }
  // A phrase of exactly n chords (3 to 8): opening, predominant, dominant, then a cadence on I — or a
  // half cadence on V, or a deceptive cadence on vi followed by another predominant–dominant–tonic.
  function phrase(rng, n, s) {
    const opens = OPEN.filter((x) => allowed(x, s)), pres = PRE.filter((x) => allowed(x, s)), doms = DOM.filter((x) => allowed(x, s));
    let best = null;
    for (let tries = 0; tries < 5000 && !best; tries++) {
      const r = rng();
      let seq;
      if (r < 0.12 && n >= 4) seq = [...pick(rng, opens), ...pick(rng, pres), ...pick(rng, doms.filter((d) => d[d.length - 1] === 'V'))];
      else if (r < 0.24 && n >= 6) seq = [...pick(rng, opens), ...pick(rng, pres), ...pick(rng, doms), 'vi', ...pick(rng, pres.filter((p) => p.length && p[0] !== 'vi')), ...pick(rng, doms), 'I'];
      else seq = [...pick(rng, opens), ...pick(rng, pres), ...pick(rng, doms), 'I'];
      if (seq.length !== n) continue;
      if (seq.some((x, i) => i && x === seq[i - 1])) continue;
      best = seq;
    }
    return best;
  }


  // ---------- every chord a seventh, extended or altered ----------
  // The notes a key lends its chords' tensions: its scale (natural minor), plus the leading tone in minor.
  const keyPcs = (kd) => [0, 1, 2, 3, 4, 5, 6].map((d) => degree(kd, d)).concat(kd.mode === 'minor' ? [leadingTone(kd)] : []);
  // The shapes each kind of chord can take. Extended shapes only add notes of the chord's key (so iii in a
  // major key, whose ninth would be chromatic, stays a seventh chord); altered ones are the dominant
  // alterations and the major ninth ♯11 (E B D F♯ over C). Chords with no altered shape take an extended one.
  const SHAPES = {
    extended: {
      dom: [['ninth'], ['thirteenth'], ['seventh', ['b9']], ['seventh', ['b13']]],
      maj: [['ninth'], ['thirteenth']],
      min: [['ninth'], ['eleventh']],
    },
    altered: {
      dom: [['seventh', ['b9']], ['seventh', ['#9']], ['seventh', ['#11']], ['seventh', ['b13']], ['seventh', ['#5']]],
      maj: [['ninth', ['#11']]],
    },
  };
  function kindOf(ch) {
    if (ch.fam === 'dom7' || (ch.fam === 'maj' && ch.fn === 'D')) return 'dom';
    if (ch.fam === 'maj' || ch.fam === 'maj7') return 'maj';
    if (ch.fam === 'min' || ch.fam === 'min7') return 'min';
    return null;
  }
  // The chord as a seventh chord: V → V7, I → IM7, ii → ii7, vii° → viiø7 (vii°7 in minor) …, same bass.
  function asSeventh(ch) {
    if (ch.ext || ch.seventh) return ch;
    const pcs = keyPcs(ch.key);
    const k = kindOf(ch);
    const q = k === 'dom' ? 'dom7' : k === 'maj' ? 'maj7' : k === 'min' ? 'min7'
      : ch.fam === 'dim' ? (ch.key.mode === 'minor' && ch.fn === 'D' ? 'dim7' : 'hdim7') : null;
    if (!q) return ch;
    let use = q;
    // A major chord whose major seventh isn't in the key takes the dominant seventh instead (VII in minor).
    if (q === 'maj7' && !pcs.some((p) => samePc(p, membersOf(ch.root, 'maj7')[3]))) use = 'dom7';
    const out = plainChord(ch.root, use, ch.inv);
    return finish(out, ch.key, ch.home, Object.assign(romanDisp(out, ch.key), { sec: ch.disp.sec }));
  }
  function recolour(chords, mode, rng) {
    return chords.map((ch) => {
      const seventh = asSeventh(ch);
      if (mode === 'sevenths') return seventh;
      const k = kindOf(ch);
      const pcs = keyPcs(ch.key);
      const base = MQ.chordTones(MQ.makeChord(ch.root, k === 'min' ? 'min' : 'maj', 'seventh', { majorSeventh: seventh.fam === 'maj7' })).map((t) => t.p);
      const build = ([size, alts]) => {
        const vc = MQ.makeChord(ch.root, k === 'min' ? 'min' : 'maj', size, { majorSeventh: seventh.fam === 'maj7', alts: alts || [], bass: ch.inv ? ch.tones[ch.inv] : null });
        const out = fromVoicing(vc);
        return out ? { out, added: MQ.chordTones(vc).map((t) => t.p).filter((p) => !base.some((b) => samePc(b, p))) } : null;
      };
      const tryShapes = (list, diatonic) => (list || []).map(build).filter((x) => x && (!diatonic || x.added.every((p) => pcs.some((q) => samePc(p, q)))));
      let opts = mode === 'altered' ? tryShapes(SHAPES.altered[k], false) : [];
      if (!opts.length) opts = tryShapes(SHAPES.extended[k], true);
      opts = opts.filter((x) => { planesOf(Object.assign(x.out, { key: ch.key })); return x.out.needs5 <= 4; });
      if (!opts.length) return seventh;
      const got = pick(rng, opts).out;
      return finish(got, ch.key, ch.home, Object.assign(romanDisp(got, ch.key), { sec: ch.disp.sec }));
    });
  }

  // Why a teacher's progression can't be voiced: the first chord that won't fit the ranges, or the first
  // pair of chords that can't be joined, with the rules that get in the way.
  function troubleSpot(chords, rules) {
    const n = chords.some((ch) => ch.ext) ? 5 : 4;
    const bad = chords.findIndex((ch) => !voicingsOf(ch, new Array(n).fill(null)).length);
    if (bad >= 0) return `Chord ${bad + 1} (${chords[bad].label}) can’t be voiced within the voice ranges.`;
    for (let c = 0; c + 1 < chords.length; c++) {
      const n = chords.some((ch) => ch.ext) ? 5 : 4;
      const pair = { chords: chords.slice(c, c + 2), given: [new Array(n).fill(null), new Array(n).fill(null)] };
      const sol = solve(pair, { rules });
      if (sol && sol.cost < 1000) continue;
      const why = sol ? [...new Set(check(pair, sol.voices, rules).issues.filter((x) => x.sev === 'error').map((x) => RULES.find((r) => r.id === x.rule).label))] : [];
      return `Chords ${c + 1}–${c + 2} (${chords[c].label} to ${chords[c + 1].label}) can’t be joined without breaking a rule that’s on${why.length ? ': ' + why.join(', ') : ''}.`;
    }
    return 'These chords can’t be voiced without breaking one of the rules that are on — check the progression.';
  }

  // settings: {type, length, mode 'major' | 'minor' | 'either', maxSig, sevenths, inversions, sixFour,
  //   secondary, extensions, alterations, every ('mixed', or make every chord 'sevenths', 'extended' or
  //   'altered'), custom (Roman numerals and/or chord symbols typed by the teacher),
  //   fifths (a fixed key signature, or null),
  //   rules (the ones the student is held to), show (the labels students see: ids from LABELS)}.
  // Returns an exercise {type, key, chords, given, answer, figures, show} or {error}. Exercises whose
  // model answer can't avoid a warning are passed over when another try does better.
  function generate(settings, rng) {
    const s = Object.assign({ type: 'bass', length: 4, mode: 'major', maxSig: 3, sevenths: true, inversions: true, sixFour: true, secondary: false, extensions: false, alterations: false, every: 'mixed', custom: '', fifths: null, rules: null, show: ['roman'] }, settings);
    // Every chord a seventh, extended or altered: six-four chords (triads by nature) are left out.
    const ps = s.every === 'mixed' ? s : Object.assign({}, s, { sevenths: true, sixFour: false });
    if (!labelsWork(s.type, s.show)) return { error: 'Figured bass needs the bass line printed. Add chord symbols or Roman numerals, or choose an exercise that gives the bass.' };
    rng = rng || Math.random;
    const rules = s.rules ? new Set(s.rules) : STRICT;
    let best = null, bestWarn = Infinity, lastChords = null;
    const typed = s.custom && s.custom.trim() ? s.custom.trim().split(/[\s,|]+/).filter(Boolean) : null;
    // Typed chord symbols are real pitches, so in a random key they set the key: the last symbol's chord.
    const lastSym = typed && s.fifths == null ? typed.slice().reverse().find((t) => /^[A-G]/.test(t)) : null;
    const symVc = lastSym ? MQ.parseVoiceSymbol(lastSym) : null;
    for (let attempt = 0; attempt < 40 && bestWarn > 0; attempt++) {
      let mode = s.mode === 'either' ? (rng() < 0.5 ? 'major' : 'minor') : s.mode;
      // In a random key, typed numerals pick the mode themselves: I means major, i minor.
      const tonic = typed && s.fifths == null ? typed.find((t) => /^[Ii](?![IiVv])/.test(t)) : null;
      if (tonic) mode = tonic[0] === 'i' ? 'minor' : 'major';
      const fifths = s.fifths != null ? s.fifths : Math.floor(rng() * (2 * s.maxSig + 1)) - s.maxSig;
      const key = symVc ? makeKey(symVc.root, symVc.quality === 'min' ? 'minor' : 'major') : keyOfSignature(fifths, mode);
      let labels;
      if (typed) labels = typed;
      else if (s.type === 'resolve') {
        const list = SHORT_EX.map((x) => (Array.isArray(x) ? { labs: x } : { labs: x.minor, only: 'minor' }))
          .filter((x) => (!x.only || x.only === mode) && allowed(x.labs, ps));
        if (!list.length) return { error: 'No short exercises fit these settings. Turn on more chord kinds.' };
        labels = pick(rng, list).labs;
        if (mode === 'minor') labels = labels.map(minorOf);
      } else {
        labels = phrase(rng, Math.max(3, Math.min(8, s.length)), ps);
        if (!labels) return { error: 'Couldn’t build a phrase of that length with these settings.' };
        if (mode === 'minor') labels = labels.map(minorOf);
      }
      if (!typed && s.every === 'mixed' && (s.extensions || s.alterations)) labels = enrich(labels, s, rng, mode);
      let chords = tonicize(labels.map((lab) => parseChord(lab, key)), key);
      if (!typed && s.every !== 'mixed' && chords.every(Boolean)) chords = recolour(chords, s.every, rng);
      const bad = labels.filter((lab, i) => !chords[i]);
      if (bad.length) return { error: `Couldn’t read ${bad.map((b) => `“${b}”`).join(', ')}. Write Roman numerals like I, ii6, V65 or V7/V, or chord symbols like C, F/A, G7/B or G7(♭9).` };
      // Extended and altered chords are written over a bass: the bass placed for the student, four voices above.
      const texture = chords.some((ch) => ch && ch.ext) ? TEXTURES.voicing : TEXTURES.satb;
      const n = texture.n;
      const crowded = texture.n === 5 && chords.find((ch) => ch.needs5 > 4);
      if (crowded) return { error: `${crowded.symbol} needs more than four different notes above the bass — too many for four voices.` };
      // Asked for extended or altered chords: look for a progression that has a place for one.
      if (!typed && s.every === 'mixed' && (s.extensions || s.alterations) && !chords.some((ch) => ch.ext) && attempt < 30) continue;
      const ex = { type: s.type, key, chords, texture: texture.id, given: chords.map(() => new Array(n).fill(null)) };
      lastChords = chords;
      const sol = solve(ex, { rng, melody: true, rules });
      if (!sol || sol.cost >= 1000) {
        if (s.custom && s.custom.trim() && attempt > 4) break;
        continue;
      }
      ex.answer = sol.voices;
      // Which voices are printed: the type's (its bass is the last voice), and over a bass always the bass.
      const gives = TYPES.find((t) => t.id === s.type).gives.map((v) => (v === 3 ? n - 1 : v)).concat(n === 5 ? [n - 1] : []);
      ex.given = sol.voices.map((V, c) => V.map((p, v) => ((s.type === 'resolve' && c === 0) || gives.includes(v) ? { ...p } : null)));
      ex.show = LABELS.map((l) => l.id).filter((id) => s.show.includes(id));
      ex.figures = chords.map(figuresFor);
      const warns = check(ex, ex.answer, rules).issues.length;
      if (warns < bestWarn) { best = ex; bestWarn = warns; }
    }
    if (best) return best;
    if (s.custom && s.custom.trim() && lastChords) return { error: troubleSpot(lastChords, rules) };
    if (s.every === 'extended' || s.every === 'altered') return { error: `Couldn’t find a progression of ${s.every} chords that keeps every rule that’s on. Try fewer chords, or the Contemporary preset.` };
    return { error: 'Couldn’t make an exercise with these settings. Try again or change a setting.' };
  }

  Object.assign(PW, {
    TEXTURES, texOf, RULES, GROUPS, PRESETS, TYPES, LABELS, labelsWork,
    makeKey, keyOfSignature, keyName, sigAlts, degree, leadingTone, parseChord, figuresFor, membersOf,
    check, voicingAt, voicingsOf, solve, generate, chordIssues, moveIssues,
  });
})(typeof window !== 'undefined' ? window : globalThis);
