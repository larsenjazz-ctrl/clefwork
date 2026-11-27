/* Clefwork Drills — short questions answered with menus, a choice, or typed answers (letter names,
   numbers, chord symbols, Roman numerals, words), on the musical alphabet, steps, keys, scales,
   solfège, chords, meter, form, harmony and voice leading. Every kind is the one question type
   'drill'; a kind is a tab of its own, with its own count (cfg.counts[kind.id]) and settings
   (cfg.drill[kind.id]). A quiz code keeps them in a block at its end (see codec.js).

   A drill question has the usual shapes: `choices` (one answer), `dropdowns` (menus), or `texts`
   (typed boxes, each {label, mode, …}), and `columns` when it prints music on the staff.
   Typed boxes are graded here (gradeTexts); the modes are:
     note   one note name           pcs: [[step, alt], …] that count (any of them)
     notes  note names in a row     seq: [[step, alt], …], order (false: any order)
     num    a number                n, tol
     nums   measure numbers         ns (ranges such as 1-4 are read out)
     sym    a chord symbol          sym (compared by what it spells)
     rn     a Roman numeral         accept: forms that count (compared loosely)
     word   a word or two           accept
     open   anything                accept (none: the teacher reads it, and any answer counts) */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const { transpose, pcName, midi, dia } = MQ;
  const LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const MAX = 30;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const P = (step, alt, oct) => ({ step, alt: alt || 0, oct: oct == null ? 4 : oct });
  const pc = (p) => [p.step, p.alt];
  const nm = (p) => pcName(p);
  const okAlt = (p) => Math.abs(p.alt) <= 1;
  const pcOf = (p) => (((midi(P(p.step, p.alt, 4)) % 12) + 12) % 12);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ord = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

  // ---------- dealing ----------
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  // Hands out items in a shuffled order, and again when they run out.
  function dealer(items, rng) {
    let pack = [], last = null;
    return () => {
      if (!pack.length) {
        pack = shuffle(items.slice(), rng);
        if (pack.length > 1 && pack[pack.length - 1] === last) [pack[0], pack[pack.length - 1]] = [pack[pack.length - 1], pack[0]];
      }
      return (last = pack.pop());
    };
  }
  // A choice question from the answer and others (text), shuffled.
  function choicesOf(ans, others, rng, k) {
    const got = [ans];
    shuffle(others.slice(), rng).forEach((x) => { if (got.length < (k || 4) && !got.includes(x)) got.push(x); });
    const list = shuffle(got.slice(), rng);
    return { choices: list, answer: list.indexOf(ans) };
  }
  const menu = (label, options, ans) => ({ label, options, answer: options.indexOf(ans) });
  const bits = (mask, list) => list.filter((_, i) => mask & (1 << i));

  // ---------- keys ----------
  const parsePc = (name) => ({ step: LET.indexOf(name[0]), alt: /♯/.test(name) ? 1 : /♭/.test(name) ? -1 : 0, oct: 4 });
  const majorTonic = (f) => parsePc(MQ.MAJOR_KEYS[f + 7]);
  const minorTonic = (f) => parsePc(MQ.MINOR_KEYS[f + 7]);
  const keyText = (mode, f) => MQ.keyName(f, mode);
  // The notes of a key's scale (natural minor in minor), from its tonic: the key signature's notes.
  const MAJ = [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 11]];
  const NATMIN = [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10]];
  const degreeOf = (tonic, mode, d) => { const [n, s] = (mode === 'minor' ? NATMIN : MAJ)[d]; return transpose(P(tonic.step, tonic.alt), n, s, 1); };
  const fifthsFor = (rng, max) => { const m = clamp(max | 0, 0, 7); return Math.floor(rng() * (2 * m + 1)) - m; };
  const keyMenu = (mode) => (mode === 'minor' ? MQ.MINOR_KEYS : MQ.MAJOR_KEYS).map((k) => `${k} ${mode}`);

  // ---------- reading typed answers ----------
  const ACC_IN = { '': 0, '#': 1, '♯': 1, x: 2, '##': 2, '♯♯': 2, '𝄪': 2, b: -1, '♭': -1, bb: -2, '♭♭': -2, '𝄫': -2 };
  function readNote(t) {
    const m = /^([A-Ga-g])(##|bb|♯♯|♭♭|#|b|♯|♭|x|𝄪|𝄫)?$/.exec(String(t || '').trim());
    return m ? [LET.indexOf(m[1].toUpperCase()), ACC_IN[m[2] || '']] : null;
  }
  // Letter names typed with spaces, commas or dashes between them — or run together (CEG, F#AC#).
  function readNotes(text) {
    const s = String(text || '').trim();
    if (!s) return [];
    let toks = s.split(/[\s,;–—\-/]+/).filter(Boolean);
    // Run together, a capital starts each note (EbFGAb); in lower case, each letter does, with only
    // # ♯ ♭ or x after it, since a b there could be a flat or the note B.
    if (toks.length === 1 && toks[0].length > 1 && !readNote(toks[0])) {
      const t = toks[0];
      toks = (/^[A-G]/.test(t) ? t.match(/[A-G][^A-G]*/g) : t.match(/[a-g](?:##|♯♯|♭♭|#|♯|♭|x)?/g)) || [t];
    }
    return toks.map(readNote);
  }
  const samePc = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  function readNums(text) {
    const out = [];
    for (const tok of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
      const r = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(tok);
      if (r) {
        const a = +r[1], b = +r[2];
        if (Math.abs(b - a) > 64) return null;
        for (let k = a; a <= b ? k <= b : k >= b; k += a <= b ? 1 : -1) out.push(k);
      } else if (/^\d+$/.test(tok)) out.push(+tok);
      else return null;
    }
    return out;
  }
  const words = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9♭♯#]+/g, ' ').trim();
  // Roman numerals: flats and sharps either way, ° o dim, ø /o, ma7 maj7 M7 Δ7, spaces and case of the
  // quality ignored — but not the case of the numeral.
  const rnForm = (s) => String(s || '').trim().replace(/\s+/g, '').replace(/♭/g, 'b').replace(/♯/g, '#')
    .replace(/[º˚]/g, '°').replace(/dim/g, '°').replace(/(?<=[iv])o/g, '°').replace(/Ø|\/o/g, 'ø').replace(/m7b5/g, 'ø7')
    .replace(/maj|Maj|MA|Ma|Δ/g, 'ma').replace(/(?<=[IViv])M(?=\d)/g, 'ma').replace(/dom/g, '');
  function textRight(f, v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return false;
    switch (f.mode) {
      case 'note': { const n = readNote(t); return !!n && f.pcs.some((x) => samePc(x, n)); }
      case 'notes': {
        const got = readNotes(t);
        if (got.length !== f.seq.length || got.some((x) => !x)) return false;
        if (f.order !== false) return got.every((x, i) => samePc(x, f.seq[i]));
        const left = f.seq.slice();
        return got.every((x) => { const i = left.findIndex((y) => samePc(x, y)); if (i < 0) return false; left.splice(i, 1); return true; });
      }
      case 'num': { const x = parseFloat(t.replace(',', '.')); return isFinite(x) && Math.abs(x - f.n) <= (f.tol || 0) + 1e-9; }
      case 'nums': { const got = readNums(t); return !!got && got.length === f.ns.length && got.every((x, i) => x === f.ns[i]); }
      case 'sym': {
        const a = MQ.parseSymbol(t), b = MQ.parseSymbol(f.sym);
        return !!a && !!b && MQ.symbolOf(a) === MQ.symbolOf(b);
      }
      case 'rn': return f.accept.some((x) => rnForm(x) === rnForm(t));
      case 'word': return f.accept.some((x) => words(x) === words(t));
      case 'open': return !f.accept || !f.accept.length || f.accept.some((x) => words(t).includes(words(x)));
      default: return false;
    }
  }
  const gradeTexts = (q, resp) => q.texts.filter((f, i) => textRight(f, (resp || [])[i])).length / q.texts.length;
  const hasTexts = (q, resp) => !!resp && resp.some((v) => String(v || '').trim());
  const describeTexts = (q) => q.texts.map((f) => (q.texts.length > 1 && f.label ? `${f.label}: ` : '') + (f.shown || (f.mode === 'open' ? 'read by your teacher' : ''))).join(' · ');
  // A written answer with no answer key: any answer earns its credit, and the teacher reads it.
  const teacherReads = (q) => !!q.texts && q.texts.some((f) => f.mode === 'open' && !(f.accept && f.accept.length));
  const box = (label, mode, o) => Object.assign({ label, mode }, o);
  const noteBox = (label, p, o) => box(label, 'note', Object.assign({ pcs: [pc(p)], shown: nm(p) }, o));
  const notesBox = (label, list, o) => box(label, 'notes', Object.assign({ seq: list.map(pc), shown: list.map(nm).join(' ') }, o));
  const anySpelling = (p) => {
    const out = [];
    for (let s = 0; s < 7; s++) for (let a = -2; a <= 2; a++) if (pcOf(P(s, a)) === pcOf(p)) out.push([s, a]);
    return out;
  };

  // ---------- the question ----------
  const base = (kind, i, o) => Object.assign({ type: 'drill', clef: 'treble', noStaff: !o.columns, sig: `dr${kind}${i}`, tags: [] }, o, { dr: Object.assign({ kind }, o.dr) });
  const hintFor = (q) => (q.texts ? (q.texts.some((f) => f.mode === 'notes') ? 'Type the note names with spaces between them, such as F♯ or Bb.' : q.texts.some((f) => f.mode === 'note') ? 'Type one note name, such as F♯ (or F#) or Bb.' : q.texts.some((f) => f.mode === 'nums') ? 'Type the measure numbers in order, with spaces between them.' : 'Type your answer.') : q.dropdowns ? 'Choose from each menu.' : 'Choose one answer.');

  // ---------- the kinds ----------
  // opts: the settings each kind's tab shows — {key, label, kind: 'seg' (one value) or 'chips' (a bit
  // for each item), items: [labels] (seg values are 0, 1, …), def}.
  const ASKS = (labels, def) => ({ key: 'ask', label: 'Ask students to', kind: 'chips', items: labels, def: def == null ? (1 << labels.length) - 1 : def });
  const KEYMAX = (def) => ({ key: 'max', label: 'Key signatures up to', kind: 'seg', items: ['None', '1', '2', '3', '4', '5', '6', '7'], def: def == null ? 4 : def });

  const KINDS = [];
  const kind = (k) => KINDS.push(k);

  // ===== Clefwork: notes and steps =====
  kind({
    id: 'dralpha', group: 'notes', label: 'Musical Alphabet', blurb: 'Write the letters that come next in the musical alphabet, going up or down — or follow a path of whole and half steps and write each note it lands on.',
    opts: [ASKS(['Letters up or down', 'Step paths (W and H)']), { key: 'len', label: 'Letters or steps in each question', kind: 'seg', items: ['3', '4', '5', '6', '7'], def: 1 }],
    gen(rng, s, i) {
      const len = 3 + s.len, ask = pick(rng, bits(s.ask, ['abc', 'path'])) || 'abc';
      if (ask === 'abc') {
        const st = Math.floor(rng() * 7), dir = rng() < 0.5 ? 1 : -1;
        const seq = []; for (let k = 1; k <= len; k++) seq.push(P((((st + dir * k) % 7) + 7) % 7, 0));
        return base('dralpha', i, { text: `Write the ${len} letters that come after ${LET[st]} going ${dir > 0 ? 'up' : 'down'} the musical alphabet.`, texts: [notesBox('Letters', seq)], tags: ['abc:' + st] });
      }
      for (let t = 0; t < 100; t++) {
        const start = P(Math.floor(rng() * 7), rng() < 0.75 ? 0 : rng() < 0.5 ? 1 : -1);
        const dir = rng() < 0.7 ? 1 : -1, steps = [];
        for (let k = 0; k < len; k++) steps.push(rng() < 0.55 ? 'W' : 'H');
        let p = start; const seq = [];
        for (const w of steps) { p = transpose(p, 2, w === 'W' ? 2 : 1, dir); seq.push(p); }
        if (!okAlt(start) || !seq.every(okAlt)) continue;
        return base('dralpha', i, {
          text: `Start on ${nm(start)} and go ${dir > 0 ? 'up' : 'down'} by ${steps.join(' – ')}. Write each note you land on, using the next letter name each time.`,
          texts: [notesBox('Notes', seq)], tags: ['path'],
        });
      }
      return null;
    },
  });
  // Two notes side by side on the staff, the first between C4 and B4.
  const pair = (a, b) => [{ given: [a], cap: 0 }, { given: [b], cap: 0 }];
  kind({
    id: 'drsteps', group: 'notes', label: 'Half & Whole Steps', blurb: 'Say whether two notes on the staff are a half step or a whole step apart, or write the note a half or whole step above or below a given note.',
    opts: [ASKS(['Label a pair', 'Write the note'])],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['label', 'write'])) || 'label';
      for (let t = 0; t < 100; t++) {
        const a = P(Math.floor(rng() * 7), rng() < 0.7 ? 0 : rng() < 0.5 ? 1 : -1, 4);
        const whole = rng() < 0.5, dir = rng() < 0.5 ? 1 : -1;
        // A half step is usually the next letter (E–F); now and then the same letter (F–F♯).
        const b = whole ? transpose(a, 2, 2, dir) : rng() < 0.75 ? transpose(a, 2, 1, dir) : transpose(a, 1, 1, dir);
        if (!okAlt(a) || !okAlt(b)) continue;
        if (ask === 'label') {
          return base('drsteps', i, {
            text: 'Are these two notes a half step or a whole step apart?', columns: pair(a, b),
            dropdowns: [menu('Step', ['Half step (H)', 'Whole step (W)'], whole ? 'Whole step (W)' : 'Half step (H)')],
            tags: ['pc:' + nm(a)],
          });
        }
        return base('drsteps', i, {
          text: `Write the note a ${whole ? 'whole' : 'half'} step ${dir > 0 ? 'above' : 'below'} ${nm(a)}.`,
          texts: [noteBox('Note', b, { pcs: anySpelling(b), shown: nm(b) })], tags: ['pc:' + nm(a)],
        });
      }
      return null;
    },
  });
  const BLACK = [[0, 1], [1, 1], [3, 1], [4, 1], [5, 1]];       // C♯ D♯ F♯ G♯ A♯ — the black keys
  kind({
    id: 'drenh', group: 'notes', label: 'Enharmonic Names', blurb: 'Give another name for a note (F♯ is also G♭), or both names of a black key on the piano.',
    opts: [ASKS(['Another name for a note', 'Both names of a black key']), { key: 'dbl', label: 'Notes asked', kind: 'seg', items: ['Sharps and flats', 'Also B♯, C♭, E♯ and F♭', 'Also double sharps and flats'], def: 1 }],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['other', 'black'])) || 'other';
      if (ask === 'black') {
        const [st] = pick(rng, BLACK), sh = P(st, 1), fl = P(st + 1, -1);
        return base('drenh', i, {
          text: `The black key just above ${LET[st]} has two names. Write both.`,
          texts: [noteBox('Sharp name', sh), noteBox('Flat name', fl)], tags: ['bk:' + st],
        });
      }
      for (let t = 0; t < 100; t++) {
        const a = P(Math.floor(rng() * 7), pick(rng, s.dbl === 2 ? [-2, -1, 1, 2] : [-1, 1]));
        const odd = (a.step === 2 || a.step === 6) && a.alt === 1 || (a.step === 0 || a.step === 3) && a.alt === -1;
        if (s.dbl === 0 && odd) continue;
        const others = anySpelling(a).filter((x) => !samePc(x, pc(a)));
        const plain = others.filter((x) => Math.abs(x[1]) <= 1);
        return base('drenh', i, {
          text: `Write another name for ${nm(a)}.`,
          texts: [box('Note', 'note', { pcs: others, shown: (plain.length ? plain : others).map((x) => nm(P(x[0], x[1]))).join(' or ') })], tags: ['pc:' + nm(a)],
        });
      }
      return null;
    },
  });
  kind({
    id: 'dralto', group: 'notes', label: 'Alto Clef', blurb: 'Read a note printed in the alto (C) clef and choose its name.',
    opts: [{ key: 'ledger', label: 'Notes', kind: 'seg', items: ['On the staff', 'Ledger lines too'], def: 1 },
      { key: 'acc', label: 'Accidentals', kind: 'seg', items: ['None', 'Sharps and flats too'], def: 0 }],
    gen(rng, s, i) {
      // The alto staff runs from F3 (dia 24) to G4 (dia 32); one or two ledger lines add B2–C3 and B4–D5.
      const lo = s.ledger ? 21 : 24, hi = s.ledger ? 35 : 32;
      const d = lo + Math.floor(rng() * (hi - lo + 1));
      const alt = s.acc && rng() < 0.4 ? (rng() < 0.5 ? 1 : -1) : 0;
      const p = MQ.fromDia(d, alt);
      const others = LET.map((_, k) => nm(P(k, alt))).filter((x) => x !== nm(p));
      return base('dralto', i, {
        clef: 'alto', text: 'Name the note shown on the alto clef staff.', columns: [{ given: [p], cap: 0 }],
        ...choicesOf(nm(p), others, rng, 4), tags: ['pc:' + nm(p)], sig: 'dra' + d + alt,
      });
    },
  });
  const IVS = [['m2', 2, 1], ['M2', 2, 2], ['m3', 3, 3], ['M3', 3, 4], ['P4', 4, 5], ['A4', 4, 6], ['d5', 5, 6], ['P5', 5, 7], ['m6', 6, 8], ['M6', 6, 9], ['m7', 7, 10], ['M7', 7, 11], ['P8', 8, 12]];
  kind({
    id: 'drhalf', group: 'notes', label: 'Counting Half Steps', blurb: 'Count the half steps from one note up to another, or write the note a number of half steps above a given note (any spelling counts).',
    opts: [ASKS(['Count the half steps', 'Write the note'])],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['count', 'write'])) || 'count';
      for (let t = 0; t < 100; t++) {
        const a = P(Math.floor(rng() * 7), rng() < 0.7 ? 0 : rng() < 0.5 ? 1 : -1, 4);
        const [, n, st] = pick(rng, IVS), b = transpose(a, n, st, 1);
        if (!okAlt(a) || !okAlt(b)) continue;
        if (ask === 'count') {
          return base('drhalf', i, { text: 'How many half steps are there from the first note up to the second?', columns: pair(a, b), texts: [box('Half steps', 'num', { n: st, shown: String(st) })], tags: ['hs:' + st] });
        }
        return base('drhalf', i, { text: `Write the note ${st} half step${st === 1 ? '' : 's'} above ${nm(a)}.`, texts: [box('Note', 'note', { pcs: anySpelling(b), shown: nm(b) + ' (any spelling)' })], tags: ['hs:' + st] });
      }
      return null;
    },
  });
  const CONSONANT = ['m3', 'M3', 'P5', 'm6', 'M6', 'P8'];
  kind({
    id: 'drcons', group: 'notes', label: 'Consonant or Dissonant', blurb: 'Read an interval printed on the staff and say whether it is consonant or dissonant — and, if you like, name it too.',
    opts: [{ key: 'name', label: 'Menus', kind: 'seg', items: ['Consonant or dissonant only', 'Name the interval too'], def: 1 },
      { key: 'p4', label: 'The perfect 4th counts as', kind: 'seg', items: ['Consonant', 'Dissonant'], def: 0 }],
    gen(rng, s, i) {
      for (let t = 0; t < 100; t++) {
        const a = P(Math.floor(rng() * 7), rng() < 0.75 ? 0 : rng() < 0.5 ? 1 : -1, 4);
        const [id, n, st] = pick(rng, IVS), b = transpose(a, n, st, 1);
        if (!okAlt(a) || !okAlt(b)) continue;
        const cons = CONSONANT.includes(id) || (id === 'P4' && s.p4 === 0);
        const dd = [menu('Sounds', ['Consonant', 'Dissonant'], cons ? 'Consonant' : 'Dissonant')];
        if (s.name) {
          dd.unshift({ label: 'Quality', options: MQ.IV_QUALITIES.map((x) => x[1]), answer: MQ.IV_QUALITIES.findIndex((x) => x[0] === id[0]) },
            { label: 'Size', options: MQ.IV_SIZES.slice(0, 8).map((x) => x[1]), answer: n - 1 });
        }
        return base('drcons', i, { text: s.name ? 'Name the interval, then say whether it is consonant or dissonant.' : 'Is this interval consonant or dissonant?', columns: [{ given: [a, b], cap: 0 }], dropdowns: dd, tags: ['iv:' + id] });
      }
      return null;
    },
  });

  // ===== Clefwork: scales and keys =====
  kind({
    id: 'drrel', group: 'keys', label: 'Relative & Parallel Keys', blurb: 'Name the relative minor or major of a key (the same key signature), or its parallel key (the same tonic).',
    opts: [ASKS(['Relative keys', 'Parallel keys']), { key: 'mode', label: 'Given key', kind: 'seg', items: ['Major', 'Minor', 'Both'], def: 2 }, KEYMAX(5)],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['rel', 'par'])) || 'rel';
      for (let t = 0; t < 100; t++) {
        const mode = s.mode === 0 ? 'major' : s.mode === 1 ? 'minor' : rng() < 0.5 ? 'major' : 'minor';
        const f = fifthsFor(rng, s.max), other = mode === 'major' ? 'minor' : 'major';
        const f2 = ask === 'rel' ? f : f + (mode === 'major' ? -3 : 3);
        if (Math.abs(f2) > 7) continue;
        return base('drrel', i, {
          text: `What is the ${ask === 'rel' ? 'relative' : 'parallel'} ${other} of ${keyText(mode, f)}?`,
          dropdowns: [menu('Key', keyMenu(other), keyText(other, f2))], tags: ['k:' + mode + f],
        });
      }
      return null;
    },
  });
  // The scales a student may spell: id, its name, and its notes from the tonic ([number, semitones]).
  const CHROM_UP = [[1, 0], [1, 1], [2, 2], [2, 3], [3, 4], [4, 5], [4, 6], [5, 7], [5, 8], [6, 9], [6, 10], [7, 11], [8, 12]];
  const SPELL = [
    { id: 'major', label: 'Major' }, { id: 'natmin', label: 'Natural minor' }, { id: 'harmin', label: 'Harmonic minor' },
    { id: 'melmin', label: 'Melodic minor' }, { id: 'pent', label: 'Pentatonic' }, { id: 'modes', label: 'Modes' }, { id: 'chrom', label: 'Chromatic' },
  ];
  const TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♯'];
  kind({
    id: 'drspellsc', group: 'keys', label: 'Spell a Scale', blurb: 'Type the letter names of a scale — major, the three minors, pentatonic, the modes, or chromatic (sharps going up, flats going down).',
    opts: [{ key: 'sc', label: 'Scales', kind: 'chips', items: SPELL.map((x) => x.label), def: 0b0000111 }],
    gen(rng, s, i) {
      const kinds = bits(s.sc, SPELL).map((x) => x.id);
      const which = pick(rng, kinds.length ? kinds : ['major']);
      for (let t = 0; t < 100; t++) {
        const tonic = parsePc(pick(rng, TONICS));
        if (which === 'chrom') {
          const up = rng() < 0.5;
          const list = up ? CHROM_UP.map(([n, st]) => transpose(tonic, n, st, 1))
            : [P(tonic.step, tonic.alt)].concat(CHROM_UP.slice(1, 12).map(([, st]) => flatName(pcOf(tonic) - st)), [P(tonic.step, tonic.alt)]);
          if (!list.every(okAlt)) continue;
          return base('drspellsc', i, {
            text: `Spell the chromatic scale ${up ? 'going up' : 'going down'} from ${nm(tonic)} to ${nm(tonic)}, using ${up ? 'sharps' : 'flats'}.`,
            texts: [notesBox('Notes', list)], tags: ['sc:chrom', 'pc:' + nm(tonic)],
          });
        }
        let sc;
        if (which === 'pent') { const id = rng() < 0.5 ? 'majpent' : 'minpent'; sc = MQ.SCALES.find((x) => x.id === id); }
        else if (which === 'modes') sc = pick(rng, MQ.SCALES.filter((x) => x.mode && x.id !== 'ionian' && x.id !== 'aeolian'));
        else sc = MQ.SCALES.find((x) => x.id === which);
        const list = [P(tonic.step, tonic.alt)].concat(sc.iv.map(([n, st]) => transpose(tonic, n, st, 1)));
        if (!list.every(okAlt)) continue;
        return base('drspellsc', i, {
          text: `Spell the ${nm(tonic)} ${sc.name} going up, from ${nm(tonic)} to ${nm(tonic)}.`,
          texts: [notesBox('Notes', list)], tags: ['sc:' + sc.id, 'pc:' + nm(tonic)],
        });
      }
      return null;
    },
  });
  // A pitch class (0–11) spelled with a flat where it needs one.
  const FLAT_NAMES = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
  const flatName = (m) => { const [st, a] = FLAT_NAMES[((m % 12) + 12) % 12]; return P(st, a); };

  // Solfège, movable do: [degree 0–6, change from the major scale] → syllable.
  const SOLF = [[[0, 0], 'Do'], [[0, 1], 'Di'], [[1, -1], 'Ra'], [[1, 0], 'Re'], [[1, 1], 'Ri'], [[2, -1], 'Me'], [[2, 0], 'Mi'], [[3, 0], 'Fa'], [[3, 1], 'Fi'],
    [[4, -1], 'Se'], [[4, 0], 'Sol'], [[4, 1], 'Si'], [[5, -1], 'Le'], [[5, 0], 'La'], [[5, 1], 'Li'], [[6, -1], 'Te'], [[6, 0], 'Ti']];
  kind({
    id: 'drsolf', group: 'keys', label: 'Solfège', blurb: 'Movable-do solfège in major keys: the syllable for a note, or the note for a syllable — with the chromatic syllables (Di, Ri, Fi, Si, Li, Ra, Me, Se, Le, Te) if you like.',
    opts: [ASKS(['Syllable for a note', 'Note for a syllable']), { key: 'chrom', label: 'Syllables', kind: 'seg', items: ['The seven of the scale', 'Chromatic syllables too'], def: 0 }, KEYMAX(4)],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['syl', 'note'])) || 'syl';
      const list = s.chrom ? SOLF : SOLF.filter(([[, c]]) => c === 0);
      for (let t = 0; t < 100; t++) {
        const f = fifthsFor(rng, s.max), tonic = majorTonic(f);
        const [[d, c], syl] = pick(rng, list);
        const p0 = degreeOf(tonic, 'major', d), p = P(p0.step, p0.alt + c);
        if (!okAlt(p)) continue;
        if (ask === 'syl') return base('drsolf', i, { text: `In ${keyText('major', f)}, what syllable is ${nm(p)}?`, dropdowns: [menu('Syllable', list.map((x) => x[1]), syl)], tags: ['syl:' + syl] });
        return base('drsolf', i, { text: `In ${keyText('major', f)}, which note is ${syl}?`, texts: [noteBox('Note', p)], tags: ['syl:' + syl] });
      }
      return null;
    },
  });
  const DEG_NAMES = ['Tonic', 'Supertonic', 'Mediant', 'Subdominant', 'Dominant', 'Submediant', 'Leading tone', 'Subtonic'];
  kind({
    id: 'drdeg', group: 'keys', label: 'Scale Degree Notes', blurb: 'The note for a scale degree in a key (“scale degree 6 of E♭ major”), the degree of a note, or a degree’s name — tonic, supertonic, mediant…',
    opts: [ASKS(['Note for a degree', 'Degree of a note', 'Degree names']), { key: 'mode', label: 'Keys', kind: 'seg', items: ['Major', 'Minor', 'Both'], def: 0 }, KEYMAX(4)],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['note', 'deg', 'name'])) || 'note';
      const mode = s.mode === 0 ? 'major' : s.mode === 1 ? 'minor' : rng() < 0.5 ? 'major' : 'minor';
      const f = fifthsFor(rng, s.max), tonic = mode === 'major' ? majorTonic(f) : minorTonic(f);
      const d = Math.floor(rng() * 7), p = degreeOf(tonic, mode, d), K = keyText(mode, f);
      if (ask === 'note') return base('drdeg', i, { text: `What note is scale degree ${d + 1} of ${K}?`, texts: [noteBox('Note', p)], tags: ['d:' + d] });
      if (ask === 'deg') return base('drdeg', i, { text: `In ${K}, which scale degree is ${nm(p)}?`, dropdowns: [menu('Scale degree', ['1', '2', '3', '4', '5', '6', '7'], String(d + 1))], tags: ['d:' + d] });
      const name = DEG_NAMES[d === 6 && mode === 'minor' ? 7 : d];
      return base('drdeg', i, { text: `In ${K}, scale degree ${d + 1} (${nm(p)}) is called the…`, dropdowns: [menu('Name', DEG_NAMES, name)], tags: ['d:' + d] });
    },
  });
  const MODE_IDS = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'];
  const MODE_NAMES = ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian'];
  kind({
    id: 'drmodes', group: 'keys', label: 'Modes & Parent Scales', blurb: 'Find the major scale a mode comes from (“D Dorian has the notes of C major”), or name the mode that starts on a degree of a major scale.',
    opts: [ASKS(['Parent major of a mode', 'Mode on a degree'])],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['parent', 'mode'])) || 'parent';
      for (let t = 0; t < 100; t++) {
        const f = fifthsFor(rng, 5), tonic = majorTonic(f), d = 1 + Math.floor(rng() * 6), r = degreeOf(tonic, 'major', d);
        if (!okAlt(r)) continue;
        if (ask === 'parent') {
          return base('drmodes', i, { text: `${nm(r)} ${MODE_NAMES[d]} has the same notes as which major scale?`, dropdowns: [menu('Major scale', MQ.MAJOR_KEYS.map((k) => k + ' major'), keyText('major', f))], tags: ['m:' + d] });
        }
        return base('drmodes', i, {
          text: `Which mode starts on the ${ord(d + 1)} degree of ${keyText('major', f)}, and on what note?`,
          dropdowns: [menu('Mode', MODE_NAMES, MODE_NAMES[d]), menu('First note', [0, 1, 2, 3, 4, 5, 6].map((k) => nm(degreeOf(tonic, 'major', k))), nm(r))],
          tags: ['m:' + d],
        });
      }
      return null;
    },
  });
  // Closely related keys: the same signature or one sharp or flat away, major or minor.
  const related = (mode, f) => {
    const list = [];
    [-1, 0, 1].forEach((x) => ['major', 'minor'].forEach((m) => { if (Math.abs(f + x) <= 7 && !(m === mode && x === 0)) list.push(keyText(m, f + x)); }));
    return list;
  };
  kind({
    id: 'drclose', group: 'keys', label: 'Closely Related Keys', blurb: 'Choose the key that is closely related to a given key (a key signature the same or one sharp or flat away) — or the one that isn’t.',
    opts: [ASKS(['Which key is related', 'Which key isn’t']), { key: 'mode', label: 'Given key', kind: 'seg', items: ['Major', 'Minor', 'Both'], def: 2 }, KEYMAX(4)],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['is', 'not'])) || 'is';
      const mode = s.mode === 0 ? 'major' : s.mode === 1 ? 'minor' : rng() < 0.5 ? 'major' : 'minor';
      const f = fifthsFor(rng, s.max), rel = related(mode, f), K = keyText(mode, f);
      const far = [];
      for (let x = -7; x <= 7; x++) if (Math.abs(x - f) >= 2) ['major', 'minor'].forEach((m) => far.push(keyText(m, x)));
      const par = keyText(mode === 'major' ? 'minor' : 'major', f + (mode === 'major' ? -3 : 3));
      if (Math.abs(f + (mode === 'major' ? -3 : 3)) <= 7) far.push(par, par);      // the parallel key is the usual slip
      if (ask === 'is') return base('drclose', i, { text: `Which of these keys is closely related to ${K}?`, ...choicesOf(pick(rng, rel), shuffle(far, rng), rng, 4), tags: ['k:' + K] });
      return base('drclose', i, { text: `Which of these keys is not closely related to ${K}?`, ...choicesOf(pick(rng, far), shuffle(rel.slice(), rng), rng, 4), tags: ['k:' + K] });
    },
  });
  // Scale degree tendencies in major: how stable, and where an unstable degree goes.
  const TEND = [['Stable', 'Stays — it’s where melodies come to rest'], ['Weak', 'Down a step'], ['Less stable', 'Stays — it’s where melodies come to rest'], ['Weak', 'Down a step'],
    ['Less stable', 'Stays — it’s where melodies come to rest'], ['Weak', 'Down a step'], ['Weak', 'Up a step']];
  kind({
    id: 'drtend', group: 'keys', label: 'Tendency Tones', blurb: 'How stable each scale degree of a major key is — stable, less stable or weak — and where a weak one tends to move.',
    opts: [{ key: 'show', label: 'Ask about', kind: 'seg', items: ['A scale degree', 'A note in a key'], def: 0 }, KEYMAX(3)],
    gen(rng, s, i) {
      const d = Math.floor(rng() * 7), [st, mv] = TEND[d];
      let what = `scale degree ${d + 1}`;
      if (s.show) { const f = fifthsFor(rng, s.max), p = degreeOf(majorTonic(f), 'major', d); what = `${nm(p)} (scale degree ${d + 1} of ${keyText('major', f)})`; }
      return base('drtend', i, {
        text: `In a major key, how stable is ${what}, and where does it tend to go?`,
        dropdowns: [menu('Stability', ['Stable', 'Less stable', 'Weak'], st), menu('Tends to move', ['Stays — it’s where melodies come to rest', 'Up a step', 'Down a step'], mv)],
        tags: ['d:' + d],
      });
    },
  });

  // ===== Clefwork: chords =====
  const QSET = { triad: ['maj', 'min', 'dim', 'aug', 'sus4'], seventh: ['dom7', 'maj7', 'min7', 'hdim7', 'dim7'], ext: ['dom9', 'maj9', 'min9', 'dom11', 'min11', 'dom13', 'maj13', 'min13'] };
  const Q = (id) => MQ.QUALITIES.find((x) => x.id === id);
  const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'B♭', 'E♭', 'A♭', 'D♭', 'F♯'];
  const chordTones = (root, q) => [P(root.step, root.alt)].concat(Q(q).tones.slice().sort((a, b) => a[0] - b[0]).map(([n, st]) => transpose(root, n, st, 1)));
  const symText = (root, q) => MQ.symbolOf({ root: { step: root.step, alt: root.alt }, q });
  kind({
    id: 'drspellch', group: 'chords', label: 'Spell a Chord', blurb: 'Type the letter names of a chord from its symbol — triads, seventh chords, or ninths to thirteenths. Any order counts.',
    opts: [{ key: 'size', label: 'Chords', kind: 'chips', items: ['Triads', 'Seventh chords', 'Ninths, elevenths and thirteenths'], def: 0b011 }],
    gen(rng, s, i) {
      const qs = [].concat(...bits(s.size, ['triad', 'seventh', 'ext']).map((k) => QSET[k]));
      for (let t = 0; t < 100; t++) {
        const root = parsePc(pick(rng, ROOTS)), q = pick(rng, qs.length ? qs : QSET.triad), tones = chordTones(root, q);
        if (!tones.every(okAlt)) continue;
        return base('drspellch', i, { text: `Spell the chord ${symText(root, q)}.`, texts: [notesBox('Notes', tones, { order: false })], tags: ['q:' + q, 'pc:' + nm(root)] });
      }
      return null;
    },
  });
  // Chord tones and tensions over a seventh chord: [label, interval number, semitones above the root].
  const TENS = [['1', 1, 0], ['♭9', 2, 1], ['9', 2, 2], ['♯9', 2, 3], ['11', 4, 5], ['♯11', 4, 6], ['♭13', 6, 8], ['13', 6, 9]];
  const NUM_MENU = ['1', '3', '5', '7', '♭9', '9', '♯9', '11', '♯11', '♭13', '13'];
  kind({
    id: 'drtones', group: 'chords', label: 'Chord Tones & Tensions', blurb: 'The number of a note over a chord symbol — 1, 3, 5, 7 or a tension (♭9, 9, ♯9, 11, ♯11, ♭13, 13) — or the note for a number.',
    opts: [ASKS(['Number of a note', 'Note for a number']), { key: 'tens', label: 'Numbers asked', kind: 'seg', items: ['Chord tones only (1 3 5 7)', 'Tensions too'], def: 1 }],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['num', 'note'])) || 'num';
      for (let t = 0; t < 100; t++) {
        const root = parsePc(pick(rng, ROOTS)), q = pick(rng, QSET.seventh.slice(0, 4)), tones = Q(q).tones;
        const third = tones.find((x) => x[0] === 3)[1], fifth = tones.find((x) => x[0] === 5)[1];
        const opts = [['3', 3, third], ['5', 5, fifth], ['7', 7, tones.find((x) => x[0] === 7)[1]], ['1', 1, 0]];
        if (s.tens) TENS.slice(1).forEach((x) => {
          if (x[0] === '♯9' && third !== 4) return;
          if ((x[0] === '♯11' || x[0] === '11') && fifth !== 7) return;
          if (x[0] === '♭13' && fifth !== 7) return;
          opts.push(x);
        });
        const [lab, n, st] = pick(rng, opts), p = transpose(root, n, st, 1);
        if (!okAlt(p) || !okAlt(root)) continue;
        const sym = symText(root, q);
        if (ask === 'num') return base('drtones', i, { text: `Over ${sym}, what number is the note ${nm(p)}?`, dropdowns: [menu('Number', s.tens ? NUM_MENU : NUM_MENU.slice(0, 4), lab)], tags: ['t:' + lab] });
        return base('drtones', i, { text: `What note is the ${lab === '1' ? 'root (1)' : lab} of ${sym}?`, texts: [noteBox('Note', p)], tags: ['t:' + lab] });
      }
      return null;
    },
  });

  // ===== Clefwork: meter, tempo and form =====
  // Time signatures: [top, bottom, simple?, beats per measure, beat unit].
  const METERS = [[2, 4, 1, 2, 'Quarter note'], [3, 4, 1, 3, 'Quarter note'], [4, 4, 1, 4, 'Quarter note'], [2, 2, 1, 2, 'Half note'], [3, 2, 1, 3, 'Half note'],
    [3, 8, 1, 3, 'Eighth note'], [6, 8, 0, 2, 'Dotted quarter note'], [9, 8, 0, 3, 'Dotted quarter note'], [12, 8, 0, 4, 'Dotted quarter note'],
    [6, 4, 0, 2, 'Dotted half note'], [9, 4, 0, 3, 'Dotted half note'], [6, 16, 0, 2, 'Dotted eighth note']];
  const UNITS = ['Eighth note', 'Quarter note', 'Half note', 'Dotted eighth note', 'Dotted quarter note', 'Dotted half note'];
  kind({
    id: 'drmeter', group: 'meter', label: 'Meter', blurb: 'Read a time signature: simple or compound, duple, triple or quadruple, the note that gets the beat, and how many beats are in a measure.',
    opts: [{ key: 'ask', label: 'Menus', kind: 'chips', items: ['Simple or compound', 'Duple, triple or quadruple', 'Beat unit', 'Beats in a measure'], def: 0b1111 },
      { key: 'set', label: 'Time signatures', kind: 'seg', items: ['Simple only', 'Simple and compound'], def: 1 }],
    gen(rng, s, i) {
      const list = METERS.filter((m) => s.set || m[2]);
      const [top, bot, simple, beats, unit] = pick(rng, list);
      const dd = [];
      if (s.ask & 1) dd.push(menu('Simple or compound', ['Simple', 'Compound'], simple ? 'Simple' : 'Compound'));
      if (s.ask & 2) dd.push(menu('Meter', ['Duple', 'Triple', 'Quadruple'], ['', '', 'Duple', 'Triple', 'Quadruple'][beats]));
      if (s.ask & 4) dd.push(menu('Beat unit', UNITS, unit));
      if (s.ask & 8 || !dd.length) dd.push(menu('Beats in a measure', ['1', '2', '3', '4', '6', '9', '12'], String(beats)));
      return base('drmeter', i, { text: `Describe the meter of this time signature: ${top}/${bot}.`, dr: { meter: [top, bot] }, dropdowns: dd, tags: ['m:' + top + bot], sig: 'drm' + top + bot });
    },
  });
  kind({
    id: 'drtempo', group: 'meter', label: 'Tempo Math', blurb: 'Work with beats per minute: how many beats in a stretch of time, how long a beat or a song lasts, or the tempo from a count of clicks.',
    opts: [],
    gen(rng, s, i) {
      const kindN = Math.floor(rng() * 4);
      if (kindN === 0) {
        const bpm = pick(rng, [60, 72, 80, 90, 96, 100, 120, 132, 144]), secs = pick(rng, [10, 15, 20, 30, 45, 60]);
        if ((bpm * secs) % 60) return null;
        return base('drtempo', i, { text: `At ♩ = ${bpm}, how many beats go by in ${secs} seconds?`, texts: [box('Beats', 'num', { n: (bpm * secs) / 60, shown: String((bpm * secs) / 60) })], tags: ['t0'] });
      }
      if (kindN === 1) {
        const bpm = pick(rng, [60, 75, 80, 100, 120, 150, 240]);
        const v = 60 / bpm;
        return base('drtempo', i, { text: `At ♩ = ${bpm}, how many seconds does one beat last?`, texts: [box('Seconds', 'num', { n: v, tol: 0.01, shown: String(+v.toFixed(2)) })], tags: ['t1'] });
      }
      if (kindN === 2) {
        const bpm = pick(rng, [60, 80, 90, 96, 120, 144]), beats = pick(rng, [3, 4]), bars = pick(rng, [8, 12, 16, 24, 32]);
        if ((bars * beats * 60) % bpm) return null;
        const v = (bars * beats * 60) / bpm;
        return base('drtempo', i, { text: `A piece in ${beats}/4 at ♩ = ${bpm} is ${bars} measures long. How many seconds does it last?`, texts: [box('Seconds', 'num', { n: v, shown: String(v) })], tags: ['t2'] });
      }
      const secs = pick(rng, [10, 15, 20, 30]), bpm = pick(rng, [60, 72, 84, 96, 108, 120, 132, 144]);
      if ((bpm * secs) % 60) return null;
      return base('drtempo', i, { text: `A metronome clicks ${(bpm * secs) / 60} times in ${secs} seconds. What is the tempo, in beats per minute?`, texts: [box('BPM', 'num', { n: bpm, shown: String(bpm) })], tags: ['t3'] });
    },
  });
  // Forms: name, letters, and a description.
  const FORMS = [
    ['Binary', 'A B', 'Two contrasting sections, each often repeated.'],
    ['Ternary', 'A B A', 'A first section, a contrasting middle section, then the first section again.'],
    ['Rondo', 'A B A C A', 'A main theme that keeps coming back between contrasting sections.'],
    ['32-bar song form', 'A A B A', 'Four eight-measure phrases: a melody, the melody again, a bridge, and the melody once more.'],
    ['Strophic', 'A A A', 'Every verse of the words is sung to the same music.'],
    ['Theme and variations', 'A A′ A″ A‴', 'A melody stated and then changed each time it returns — in rhythm, harmony or mood.'],
    ['Through-composed', 'A B C D', 'New music all the way through, with no section coming back.'],
    ['12-bar blues', 'I I I I · IV IV I I · V IV I I', 'Three four-measure phrases over the I, IV and V chords.'],
  ];
  kind({
    id: 'drform', group: 'meter', label: 'Form', blurb: 'Musical forms — binary, ternary, rondo, 32-bar song form, strophic, theme and variations, through-composed and the 12-bar blues: the name for a pattern or description, or the letters for a form.',
    opts: [ASKS(['Name from letters', 'Name from a description', 'Letters for a form'])],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['letters', 'desc', 'pattern'])) || 'letters';
      const [name, letters, desc] = pick(rng, FORMS);
      const names = FORMS.map((f) => f[0]);
      if (ask === 'letters') return base('drform', i, { text: `What is a piece with the form ${letters} called?`, ...choicesOf(name, names, rng, 4), tags: ['f:' + name] });
      if (ask === 'desc') return base('drform', i, { text: `${desc} What is this form called?`, ...choicesOf(name, names, rng, 4), tags: ['f:' + name] });
      return base('drform', i, { text: `Which pattern shows ${name.toLowerCase() === '12-bar blues' ? 'the 12-bar blues' : name.toLowerCase() + ' form'}?`, ...choicesOf(letters, FORMS.map((f) => f[1]), rng, 4), tags: ['f:' + name] });
    },
  });
  const range = (a, b) => { const o = []; for (let k = a; k <= b; k++) o.push(k); return o; };
  kind({
    id: 'drroad', group: 'meter', label: 'Road Maps', blurb: 'Follow repeat signs, first and second endings, D.C. al Fine and D.S. al Coda, and type the measures in the order they are played.',
    opts: [{ key: 'signs', label: 'Signs', kind: 'chips', items: ['Repeat signs', 'First and second endings', 'D.C. al Fine', 'D.S. al Coda'], def: 0b1111 }],
    gen(rng, s, i) {
      const which = pick(rng, bits(s.signs, ['rep', 'end', 'dc', 'ds'])) || 'rep';
      let text, ns;
      if (which === 'rep') {
        const n = pick(rng, [6, 8, 10, 12]), a = rng() < 0.5 ? 1 : 1 + Math.floor(rng() * 3), b = a + 2 + Math.floor(rng() * (n - a - 2));
        text = `A piece is ${n} measures long. ${a === 1 ? 'An end-repeat sign is' : `A start-repeat sign is at the beginning of measure ${a}, and an end-repeat sign is`} at the end of measure ${b}.`;
        ns = range(1, b).concat(range(a, b), range(b + 1, n));
      } else if (which === 'end') {
        const e = pick(rng, [4, 5, 6, 8]), n = e + 1 + Math.floor(rng() * 3);
        text = `A piece is ${n} measures long. Measure ${e} is a first ending, with an end-repeat sign back to the beginning. Measure ${e + 1} is the second ending.`;
        ns = range(1, e).concat(range(1, e - 1), range(e + 1, n));
      } else if (which === 'dc') {
        const n = pick(rng, [8, 10, 12, 16]), f = 2 + Math.floor(rng() * (n - 3));
        text = `A piece is ${n} measures long. “Fine” is written at the end of measure ${f}, and “D.C. al Fine” at the end of measure ${n}.`;
        ns = range(1, n).concat(range(1, f));
      } else {
        const n = pick(rng, [8, 10, 12]), sg = 2 + Math.floor(rng() * 3), to = sg + 1 + Math.floor(rng() * (n - sg - 2));
        text = `A piece has ${n} measures, then a two-measure coda (measures ${n + 1} and ${n + 2}). A segno is at the start of measure ${sg}, “To Coda” at the end of measure ${to}, and “D.S. al Coda” at the end of measure ${n}.`;
        ns = range(1, n).concat(range(sg, to), [n + 1, n + 2]);
      }
      return base('drroad', i, { text: text + ' Type the measures in the order they are played.', texts: [box('Measures', 'nums', { ns, shown: ns.join(' ') })], tags: ['r:' + which] });
    },
  });

  // ===== Clefwork Harmony: numerals and functions =====
  // A chord of a progression from its tonic: [letters above the tonic, semitones, quality, Roman numeral, Nashville number].
  const C = (n, st, q, rn, nash) => ({ n, st, q, rn, nash });
  const I = C(0, 0, 'maj', 'I', '1'), Ima7 = C(0, 0, 'maj7', 'Ima7', '1ma7'), ii = C(1, 2, 'min', 'ii', '2m'), ii7 = C(1, 2, 'min7', 'ii7', '2m7');
  const iii = C(2, 4, 'min', 'iii', '3m'), iii7 = C(2, 4, 'min7', 'iii7', '3m7'), IV = C(3, 5, 'maj', 'IV', '4'), IVma7 = C(3, 5, 'maj7', 'IVma7', '4ma7'), V = C(4, 7, 'maj', 'V', '5'), V7 = C(4, 7, 'dom7', 'V7', '57');
  const vi = C(5, 9, 'min', 'vi', '6m'), vi7 = C(5, 9, 'min7', 'vi7', '6m7'), viiø = C(6, 11, 'hdim7', 'viiø7', '7ø7');
  const I7 = C(0, 0, 'dom7', 'I7', '17'), IV7 = C(3, 5, 'dom7', 'IV7', '47'), iv = C(3, 5, 'min', 'iv', '4m'), bVII = C(6, 10, 'maj', '♭VII', '♭7'), bVI = C(5, 8, 'maj', '♭VI', '♭6'), bIII = C(2, 3, 'maj', '♭III', '♭3');
  const i_ = C(0, 0, 'min', 'i', '1m'), im7 = C(0, 0, 'min7', 'i7', '1m7'), iiø = C(1, 2, 'hdim7', 'iiø7', '2ø7'), VI = C(5, 8, 'maj', 'VI', '♭6'), III = C(2, 3, 'maj', 'III', '♭3'), VII = C(6, 10, 'maj', 'VII', '♭7');
  const PROGS = [
    { mode: 'major', label: 'ii–V–I', ch: [ii7, V7, Ima7] }, { mode: 'major', label: 'I–vi–ii–V', ch: [Ima7, vi7, ii7, V7] }, { mode: 'major', label: 'I–IV–V–I', ch: [I, IV, V, I] },
    { mode: 'major', label: 'I–V–vi–IV', ch: [I, V, vi, IV] }, { mode: 'major', label: 'iii–vi–ii–V', ch: [iii7, vi7, ii7, V7] }, { mode: 'major', label: 'I–ii–iii–IV', ch: [Ima7, ii7, iii7, IVma7] },
    { mode: 'major', label: 'blues', ch: [I7, IV7, I7, V7, IV7, I7] }, { mode: 'major', label: 'mixture', ch: [I, iv, I] }, { mode: 'major', label: 'mixture', ch: [I, bVI, bVII, I] },
    { mode: 'major', label: 'mixture', ch: [I, bVII, IV, I] }, { mode: 'minor', label: 'minor ii–V–i', ch: [iiø, V7, im7] }, { mode: 'minor', label: 'minor', ch: [i_, iv, V, i_] },
    { mode: 'minor', label: 'minor', ch: [i_, VI, III, VII] }, { mode: 'major', label: 'viiø', ch: [Ima7, viiø, iii7, vi7] },
  ];
  const chordAt = (tonic, c) => { const r = transpose(tonic, c.n + 1, c.st, 1); return { root: r, sym: symText(r, c.q) }; };
  kind({
    id: 'drrn', group: 'numerals', tool: 'harmony', label: 'Numerals & Chord Symbols', blurb: 'Write the chord symbols for a progression in Roman numerals or Nashville numbers in a named key — ii–V–I, turnarounds, the blues, borrowed chords — or the Roman numerals for chord symbols.',
    opts: [ASKS(['Roman numerals to chord symbols', 'Nashville numbers to chord symbols', 'Chord symbols to Roman numerals'], 0b101), { key: 'mode', label: 'Keys', kind: 'seg', items: ['Major', 'Minor', 'Both'], def: 2 }, KEYMAX(4)],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['rn', 'nash', 'sym'])) || 'rn';
      for (let t = 0; t < 100; t++) {
        const list = PROGS.filter((p) => s.mode === 2 || p.mode === (s.mode ? 'minor' : 'major'));
        const pr = pick(rng, list.length ? list : PROGS);
        const f = fifthsFor(rng, s.max), tonic = pr.mode === 'major' ? majorTonic(f) : minorTonic(f), K = keyText(pr.mode, f);
        const chs = pr.ch.map((c) => chordAt(tonic, c));
        if (!chs.every((c) => okAlt(c.root))) continue;
        if (ask === 'sym') {
          return base('drrn', i, {
            text: `In ${K}, write the Roman numeral for each chord: ${chs.map((c) => c.sym).join('  ')}`,
            texts: pr.ch.map((c, k) => box(chs[k].sym, 'rn', { accept: [c.rn], shown: c.rn })), tags: ['p:' + pr.label],
          });
        }
        const row = pr.ch.map((c) => (ask === 'nash' ? c.nash : c.rn)).join('  ');
        return base('drrn', i, {
          text: `In ${K}, write the chord symbol for each ${ask === 'nash' ? 'Nashville number' : 'Roman numeral'}: ${row}`,
          texts: pr.ch.map((c, k) => box(ask === 'nash' ? c.nash : c.rn, 'sym', { sym: chs[k].sym, shown: chs[k].sym })), tags: ['p:' + pr.label],
        });
      }
      return null;
    },
  });
  // Tonic and dominant chords of a major key: T = I, iii, vi; D = V, V7, vii°.
  const FN = [[I, 'T'], [iii, 'T'], [vi, 'T'], [V, 'D'], [V7, 'D'], [C(6, 11, 'dim', 'vii°', '7°'), 'D']];
  kind({
    id: 'drtd', group: 'numerals', tool: 'harmony', label: 'Tonic & Dominant', blurb: 'Label each chord of a phrase T (tonic: I, iii, vi) or D (dominant: V, V7, vii°), and say whether the phrase is a question (it ends on a dominant) or an answer (it ends on the tonic).',
    opts: [{ key: 'show', label: 'The phrase is written as', kind: 'seg', items: ['Roman numerals', 'Chord symbols'], def: 0 }, { key: 'len', label: 'Chords in a phrase', kind: 'seg', items: ['4', '5', '6'], def: 0 }, KEYMAX(3)],
    gen(rng, s, i) {
      const len = 4 + s.len, f = fifthsFor(rng, s.max), tonic = majorTonic(f);
      const seq = [FN[0]];
      while (seq.length < len - 1) seq.push(pick(rng, FN.filter((x) => x !== seq[seq.length - 1])));
      const q = rng() < 0.5;
      seq.push(q ? pick(rng, FN.slice(3, 5)) : FN[0]);
      if (!q && seq[len - 2][1] === 'T') seq[len - 2] = FN[4];
      const names = seq.map(([c]) => (s.show ? chordAt(tonic, c).sym : c.rn));
      return base('drtd', i, {
        text: `In ${keyText('major', f)}, label each chord T or D, then say whether the phrase is a question or an answer: ${names.join('  ')}`,
        dropdowns: seq.map(([, fn], k) => menu(names[k], ['T', 'D'], fn)).concat([menu('The phrase is', ['A question (ends on D)', 'An answer (ends on T)'], q ? 'A question (ends on D)' : 'An answer (ends on T)')]),
        tags: ['n:' + len],
      });
    },
  });
  const GRAPH_RN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  kind({
    id: 'drmiss', group: 'numerals', tool: 'harmony', label: 'Missing Chord', blurb: 'A phrase in Roman numerals with one chord missing: choose the one chord that follows the chord graph on both sides.',
    opts: [],
    gen(rng, s, i) {
      const ok = (a, b) => MQ.allowedGraphMove(a, b);
      for (let t = 0; t < 400; t++) {
        const seq = [1];
        for (let k = 1; k < 5; k++) {
          const next = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== seq[k - 1] && ok(seq[k - 1], d) && (k < 4 || d === 1 || d === 5));
          if (!next.length) break;
          seq.push(pick(rng, next));
        }
        if (seq.length < 5) continue;
        const gap = 1 + Math.floor(rng() * 3), a = seq[gap - 1], b = seq[gap + 1];
        const fits = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== a && d !== b && ok(a, d) && ok(d, b));
        if (fits.length !== 1 || fits[0] !== seq[gap]) continue;
        const wrong = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== a && d !== b && !(ok(a, d) && ok(d, b)));
        if (wrong.length < 3) continue;
        const row = seq.map((d, k) => (k === gap ? '___' : GRAPH_RN[d - 1])).join('  ');
        return base('drmiss', i, { text: `Which chord fills the gap so the phrase follows the chord graph? ${row}`, ...choicesOf(GRAPH_RN[seq[gap] - 1], wrong.map((d) => GRAPH_RN[d - 1]), rng, 4), tags: ['g:' + seq.join('')] });
      }
      return null;
    },
  });
  // Cadences and resolutions, by name, as chords from the tonic.
  const ii7b = ii7, bII7 = C(1, 1, 'dom7', '♭II7', '♭27'), iv7 = C(3, 5, 'min7', 'iv7', '4m7'), bVII7 = C(6, 10, 'dom7', '♭VII7', '♭77'), V7sus = C(4, 7, 'dom7sus4', 'V7sus4', '57sus4'), VI7 = C(5, 9, 'dom7', 'VI7', '67'), v_ = C(4, 7, 'min', 'v', '5m');
  const CADS = [
    ['Authentic (V–I)', [V7, I]], ['Plagal (IV–I)', [IV, I]], ['Deceptive (V–vi)', [V7, vi]], ['Half (ends on V)', [IV, V]],
    ['ii–V–I', [ii7b, V7, Ima7]], ['Minor ii–V–i', [iiø, V7, im7]], ['Tritone substitution (ii–♭II7–I)', [ii7b, bII7, Ima7]],
    ['Backdoor (iv7–♭VII7–I)', [iv7, bVII7, Ima7]], ['Mixolydian (♭VII–I)', [bVII, I]], ['Aeolian (♭VI–♭VII–I)', [bVI, bVII, I]],
    ['Suspended dominant (V7sus4–I)', [V7sus, I]], ['Turnaround (I–VI7–ii–V)', [Ima7, VI7, ii7b, V7]], ['Minor plagal (iv–I)', [iv, I]], ['Minor dominant (v–i)', [v_, i_]],
  ];
  kind({
    id: 'drcad', group: 'numerals', tool: 'harmony', label: 'Cadence Names', blurb: 'Name the cadence or chord resolution — authentic, plagal, deceptive, half, ii–V–I, minor ii–V–i, tritone substitution, backdoor, Mixolydian, Aeolian, suspended dominant, turnaround…',
    opts: [{ key: 'show', label: 'The chords are written as', kind: 'seg', items: ['Chord symbols', 'Roman numerals', 'A mix'], def: 0 },
      { key: 'set', label: 'Cadences', kind: 'chips', items: CADS.map((c) => c[0]), def: (1 << CADS.length) - 1 }, KEYMAX(4)],
    gen(rng, s, i) {
      const list = bits(s.set, CADS);
      const use = list.length >= 2 ? list : CADS;
      for (let t = 0; t < 100; t++) {
        const [name, chs] = pick(rng, use), f = fifthsFor(rng, s.max), tonic = majorTonic(f);
        const syms = chs.map((c) => chordAt(tonic, c));
        if (!syms.every((c) => okAlt(c.root))) continue;
        const asRn = s.show === 1 || (s.show === 2 && rng() < 0.5);
        const row = asRn ? chs.map((c) => c.rn).join('  ') : syms.map((c) => c.sym).join('  ');
        return base('drcad', i, { text: `Name this cadence: ${row}`, ...choicesOf(name, use.map((c) => c[0]), rng, 4), tags: ['c:' + name] });
      }
      return null;
    },
  });
  // Secondary dominants: the chord a perfect 5th above each target, written two ways.
  const TARGETS = [[1, 'ii', 'VI7'], [2, 'iii', 'VII7'], [3, 'IV', 'I7'], [4, 'V', 'II7'], [5, 'vi', 'III7']];
  kind({
    id: 'drsec', group: 'numerals', tool: 'harmony', label: 'Secondary Dominants', blurb: 'Name a secondary dominant two ways (D7 in C major is II7 and V7/V), or say which dominant a tritone substitute replaces and where it resolves.',
    opts: [ASKS(['Secondary dominants', 'Tritone substitutes']), KEYMAX(4)],
    gen(rng, s, i) {
      const ask = pick(rng, bits(s.ask, ['sec', 'tt'])) || 'sec';
      for (let t = 0; t < 100; t++) {
        const f = fifthsFor(rng, s.max), tonic = majorTonic(f), K = keyText('major', f);
        const all = ask === 'tt' ? [[0, 'I', 'V7']].concat(TARGETS) : TARGETS;
        const [d, tgt, chrom] = pick(rng, all);
        const tr = degreeOf(tonic, 'major', d), dom = transpose(tr, 5, 7, 1);
        const funcs = ['V7/ii', 'V7/iii', 'V7/IV', 'V7/V', 'V7/vi'];
        if (ask === 'sec') {
          if (!okAlt(dom)) continue;
          return base('drsec', i, {
            text: `In ${K}, the chord ${symText(dom, 'dom7')} can be labelled two ways. Choose both.`,
            dropdowns: [menu('Chromatic numeral', ['I7', 'II7', 'III7', 'VI7', 'VII7'], chrom), menu('As a secondary dominant', funcs, 'V7/' + tgt)], tags: ['s:' + tgt],
          });
        }
        const sub = transpose(dom, 5, 6, 1);                   // a diminished 5th above the dominant's root
        if (!okAlt(sub)) continue;
        const num = romanAbove(tonic, sub) + '7';
        return base('drsec', i, {
          text: `In ${K}, ${symText(sub, 'dom7')} (${num}) is a tritone substitute. Which dominant does it replace, and where does it resolve?`,
          dropdowns: [menu('It replaces', ['V7'].concat(funcs), d === 0 ? 'V7' : 'V7/' + tgt), menu('It resolves to', GRAPH_RN.slice(0, 6), tgt)], tags: ['tt:' + tgt],
        });
      }
      return null;
    },
  });
  // A chromatic root's numeral in a major key: ♭II, ♯IV…, always capital (a dominant seventh's).
  function romanAbove(tonic, r) {
    const d = (((r.step - tonic.step) % 7) + 7) % 7, want = degreeOf(tonic, 'major', d);
    let diff = pcOf(r) - pcOf(want);
    diff = ((diff + 18) % 12) - 6;
    return (diff < 0 ? '♭'.repeat(-diff) : '♯'.repeat(diff)) + ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][d];
  }
  const MODS = [
    ['Common chord (pivot chord)', ['A chord that belongs to both keys is heard with one function in the old key and another in the new key.', 'The vi chord of C major is heard as ii of G major, and the music then cadences in G.']],
    ['Phrase (direct)', ['One phrase ends with a cadence in the old key, and the next phrase simply begins in the new key.', 'There is no pivot chord: a new phrase starts straight away in the new key.']],
    ['Sequential', ['A short pattern of melody and chords is repeated a step higher or lower, and the repetition lands in the new key.', 'A passage is restated at a new pitch level, and that carries the music into a new key.']],
    ['Common tone', ['One held note, shared by the last chord in the old key and the first chord in the new key, links the two keys.', 'A sustained E connects a C major chord to an E major chord, the tonic of the new key.']],
    ['Altered common chord (chromatic pivot)', ['The pivot chord is borrowed from the parallel key, so it is chromatic in one of the two keys.', 'A chord borrowed from minor, such as iv, is the chord the two keys share.']],
    ['Monophonic', ['A single melody with no chords moves into the new key on its own.', 'With no accompaniment, the melody alone brings in the new leading tone and settles on the new tonic.']],
  ];
  kind({
    id: 'drmodk', group: 'numerals', tool: 'harmony', label: 'Kinds of Modulation', blurb: 'Read a description of a modulation and name it: common chord (pivot), phrase (direct), sequential, common tone, altered common chord or monophonic.',
    opts: [],
    gen(rng, s, i) {
      const [name, descs] = pick(rng, MODS), k = Math.floor(rng() * descs.length);
      return base('drmodk', i, { text: `${descs[k]} What kind of modulation is this?`, ...choicesOf(name, MODS.map((m) => m[0]), rng, 4), tags: ['mod:' + name], sig: 'drk' + name + k });
    },
  });

  // ===== Clefwork Harmony: voice leading =====
  const VOICES = ['Soprano', 'Alto', 'Tenor', 'Bass'];
  const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  const pairName = ([a, b]) => `${VOICES[a]} and ${VOICES[b].toLowerCase()}`;
  const VL_PROGS = [['I', 'IV'], ['I', 'V'], ['IV', 'V'], ['V', 'I'], ['ii', 'V'], ['vi', 'ii'], ['I', 'vi'], ['IV', 'I'], ['vi', 'IV'], ['V', 'vi']];
  function motionOf(A, B, a, b) {
    const da = midi(B[a]) - midi(A[a]), db = midi(B[b]) - midi(A[b]);
    if (!da && !db) return 'None — both voices stay';
    if (!da || !db) return 'Oblique';
    if (Math.sign(da) !== Math.sign(db)) return 'Contrary';
    return Math.abs(dia(A[a]) - dia(A[b])) === Math.abs(dia(B[a]) - dia(B[b])) ? 'Parallel' : 'Similar';
  }
  // Perfect fifths and octaves moving in parallel between two voices: [[pair, 'fifths'|'octaves'], …].
  function parallels(A, B) {
    const out = [];
    PAIRS.forEach(([a, b]) => {
      const i1 = midi(A[a]) - midi(A[b]), i2 = midi(B[a]) - midi(B[b]);
      if (midi(A[a]) === midi(B[a]) || Math.sign(midi(B[a]) - midi(A[a])) !== Math.sign(midi(B[b]) - midi(A[b]))) return;
      const k1 = ((i1 % 12) + 12) % 12, k2 = ((i2 % 12) + 12) % 12;
      if (k1 === 7 && k2 === 7) out.push([[a, b], 'fifths']);
      if (k1 === 0 && k2 === 0) out.push([[a, b], 'octaves']);
    });
    return out;
  }
  const ERR_MENU = ['No error', 'Parallel fifths', 'Parallel octaves'];
  const onGrand = (p, v) => Object.assign({}, p, { st: v >= 2 ? 1 : 0 });
  kind({
    id: 'drvl', group: 'voice', tool: 'harmony', label: 'Voice-Leading Facts', blurb: 'Two chords voiced for soprano, alto, tenor and bass: name the motion between two voices, close or open spacing, the doubled member, or the parallel fifths or octaves and the voices that make them.',
    opts: [ASKS(['Motion between two voices', 'Close or open spacing', 'Doubled member', 'Errors and their voices'], 0b1111), KEYMAX(3)],
    gen(rng, s, i) {
      const PW = MQ.PW;
      if (!PW) return null;
      const ask = pick(rng, bits(s.ask, ['motion', 'space', 'double', 'error'])) || 'motion';
      for (let t = 0; t < 60; t++) {
        const f = fifthsFor(rng, s.max), tonic = majorTonic(f), K = PW.makeKey({ step: tonic.step, alt: tonic.alt }, 'major');
        const labs = pick(rng, VL_PROGS), chs = labs.map((l) => PW.parseChord(l, K));
        if (chs.some((c) => !c)) continue;
        const sol = PW.solve({ chords: chs, given: chs.map(() => [null, null, null, null]) }, { rng });
        if (!sol) continue;
        let [A, B] = sol.voices;
        const kt = keyText('major', f);
        const cols = () => [A, B].map((V) => ({ given: V.map(onGrand), cap: 0 }));
        const qx = (text, dd) => base('drvl', i, { clef: 'grand', grand: true, text: `In ${kt} (${labs.join('–')}): ${text}`, columns: cols(), dropdowns: dd, tags: ['p:' + labs.join('')] });
        if (ask === 'motion') {
          const pr = rng() < 0.4 ? [0, 3] : pick(rng, PAIRS), mo = motionOf(A, B, pr[0], pr[1]);
          if (mo.startsWith('None')) continue;
          return qx(`what kind of motion do the ${pairName(pr).toLowerCase()} make from the first chord to the second?`, [menu('Motion', ['Parallel', 'Similar', 'Contrary', 'Oblique'], mo)]);
        }
        if (ask === 'space') {
          const close = (V) => (midi(V[0]) - midi(V[2]) < 12 ? 'Close' : 'Open');
          return qx('is each chord in close or open position?', [menu('First chord', ['Close', 'Open'], close(A)), menu('Second chord', ['Close', 'Open'], close(B))]);
        }
        if (ask === 'double') {
          const mem = A.map((p) => chs[0].tones.findIndex((x) => x.step === p.step && x.alt === p.alt));
          const count = [0, 0, 0]; mem.forEach((m) => { if (m >= 0 && m < 3) count[m]++; });
          const d = count.findIndex((c) => c === 2);
          if (d < 0 || count.filter((c) => c === 2).length !== 1 || chs[0].tones.length !== 3) continue;
          return qx('which member of the first chord is doubled?', [menu('Doubled', ['Root', 'Third', 'Fifth'], ['Root', 'Third', 'Fifth'][d])]);
        }
        // An error: half the time, a voicing of the second chord with parallel fifths or octaves.
        let err = 'No error', pr = null;
        if (rng() < 0.7) {
          const opts = shuffle(PW.voicingsOf(chs[1], [null, null, null, B[3]]), rng);
          const bad = opts.find((V) => { const p = parallels(A, V); return p.length === 1; });
          if (!bad) continue;
          const [[pp, what]] = parallels(A, bad);
          B = bad; err = what === 'fifths' ? 'Parallel fifths' : 'Parallel octaves'; pr = pp;
        } else if (parallels(A, B).length) continue;
        return qx('is there a voice-leading error between the two chords? If so, which voices make it?',
          [menu('Error', ERR_MENU, err), menu('Voices', ['None'].concat(PAIRS.map(pairName)), pr ? pairName(pr) : 'None')]);
      }
      return null;
    },
  });

  // ===== Written answers =====
  // The teacher's own questions: {p: the question, a: answers that count, separated by | (none: the
  // teacher reads each answer, and any answer earns the credit)}.
  const WRITE_MAX = 30;
  kind({
    id: 'drwrite', group: 'write', label: 'Written Answers', blurb: 'Questions you write, answered in a word, a phrase or a sentence. Give the answers that count and Clefwork grades them, or leave the answer blank and read each one yourself.',
    opts: [], written: true,
    gen() { return null; },
  });
  function writtenQuestions(list, n) {
    return list.slice(0, n).map((w, i) => {
      const accept = String(w.a || '').split('|').map((x) => x.trim()).filter(Boolean);
      return base('drwrite', i, { text: w.p, texts: [box('Answer', 'open', { accept, shown: accept.length ? accept.join(' or ') : '' })], hint: accept.length ? 'Type your answer.' : 'Type your answer. Your teacher reads it.', sig: 'drw' + i });
    });
  }

  // ---------- groups (the builder's tabs) ----------
  const GROUPS = [
    { id: 'drgnotes', g: 'notes', tool: 'basic', label: 'Notes & Steps', blurb: 'The musical alphabet, half and whole steps, enharmonic names, the alto clef, counting half steps, and consonance.' },
    { id: 'drgkeys', g: 'keys', tool: 'basic', label: 'Keys & Degrees', blurb: 'Relative and parallel keys, spelling scales, solfège, scale degree notes and names, modes and their parent scales, closely related keys, and tendency tones.' },
    { id: 'drgchords', g: 'chords', tool: 'basic', label: 'Chord Spelling', blurb: 'Spell chords in letter names, and name the chord tones and tensions over a chord symbol.' },
    { id: 'drgmeter', g: 'meter', tool: 'basic', label: 'Meter & Form', blurb: 'Time signatures, tempo math, musical forms, and road maps with repeats, endings, D.C. and D.S.' },
    { id: 'drgwrite', g: 'write', tool: 'basic', label: 'Written Answers', blurb: 'Your own questions, answered in words: graded from the answers you give, or read by you.' },
    { id: 'drgnum', g: 'numerals', tool: 'harmony', label: 'Harmony Drills', blurb: 'Roman numerals, Nashville numbers and chord symbols; tonic and dominant; the missing chord; cadence names; secondary dominants and tritone substitutes; kinds of modulation.' },
    { id: 'drgvoice', g: 'voice', tool: 'harmony', label: 'Voice-Leading Facts', blurb: 'Menus under two chords in four parts: motion, spacing, doubling, and parallel fifths and octaves.' },
  ];
  GROUPS.forEach((g) => (g.kinds = KINDS.filter((k) => k.group === g.g)));
  const DRILL_COUNTS = KINDS.map((k) => k.id);
  const kindOf = (id) => KINDS.find((k) => k.id === id);
  const kindMax = (k) => (k.written ? WRITE_MAX : MAX);

  // ---------- settings ----------
  function drillSettings(d) {
    const src = d || {}, out = { written: Array.isArray(src.written) ? src.written.slice(0, WRITE_MAX).map((w) => ({ p: String((w && w.p) || ''), a: String((w && w.a) || '') })) : [] };
    KINDS.forEach((k) => {
      const s = src[k.id] || {}, o = {};
      k.opts.forEach((op) => {
        const v = s[op.key];
        if (op.kind === 'chips') o[op.key] = (v == null ? op.def : v & ((1 << op.items.length) - 1)) || op.def;
        else o[op.key] = v == null || v < 0 || v >= op.items.length ? op.def : v | 0;
      });
      out[k.id] = o;
    });
    return out;
  }
  // What a quiz code keeps: the settings that aren't the defaults.
  function drillDiff(d) {
    const s = drillSettings(d), out = {};
    KINDS.forEach((k) => {
      const o = {};
      k.opts.forEach((op) => { if (s[k.id][op.key] !== op.def) o[op.key] = s[k.id][op.key]; });
      if (Object.keys(o).length) out[k.id] = o;
    });
    if (s.written.length) out.written = s.written;
    return out;
  }
  const writtenOk = (cfg) => drillSettings(cfg.drill).written.filter((w) => w.p.trim());
  const countOf = (cfg, k) => {
    const n = clamp((cfg.counts && cfg.counts[k.id]) | 0, 0, kindMax(k));
    return k.written ? Math.min(n, writtenOk(cfg).length) : n;
  };
  const drillCount = (cfg, ids) => KINDS.filter((k) => !ids || ids.includes(k.id)).reduce((n, k) => n + countOf(cfg, k), 0);
  const groupCount = (cfg, gid) => { const g = GROUPS.find((x) => x.id === gid); return g ? drillCount(cfg, g.kinds.map((k) => k.id)) : 0; };
  const drillsOf = (tool) => [].concat(...GROUPS.filter((g) => g.tool === tool).map((g) => g.kinds.map((k) => k.id)));

  // ---------- the questions ----------
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  function drillQuestions(cfg) {
    if (!drillCount(cfg)) return [];
    const s = drillSettings(cfg.drill), out = [];
    KINDS.forEach((k) => {
      const n = countOf(cfg, k);
      if (!n) return;
      if (k.written) { writtenQuestions(writtenOk(cfg), n).forEach((q) => out.push(q)); return; }
      const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ hash(k.id)) >>> 0), seen = new Set();
      for (let i = 0; i < n; i++) {
        let q = null;
        for (let t = 0; t < 40; t++) {
          const c = k.gen(rng, s[k.id], i);
          if (!c) continue;
          q = c;
          const key = q.text + JSON.stringify(q.columns || '');
          if (!seen.has(key)) { seen.add(key); break; }
        }
        if (!q) continue;
        if (!q.hint) q.hint = hintFor(q);
        q.sig = `dr${k.id}${i}`;
        out.push(q);
      }
    });
    return out;
  }
  const drillLabel = (q) => ((q.dr && kindOf(q.dr.kind)) || { label: 'Drill' }).label;

  Object.assign(MQ, {
    DRILL_KINDS: KINDS, DRILL_GROUPS: GROUPS, DRILL_COUNTS, DRILLS_MAX: MAX, DRILL_WRITE_MAX: WRITE_MAX,
    drillSettings, drillDiff, drillCount, drillGroupCount: groupCount, drillsOf, drillQuestions, drillLabel, drillKind: kindOf, drillKindCount: countOf,
    gradeTexts, hasTexts, describeTexts, textRight, teacherReads, readNotes, readNums,
  });
})(typeof window !== 'undefined' ? window : globalThis);
