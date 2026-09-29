/* Clefwork Chord Graph — a key's chords laid out the way they move. The graph puts the chords in the
   order their roots fall by fifths, vii° iii vi ii V I, with the relative minor's under them
   (VII III VI ii° V i). Chords that share notes can stand in: IV for ii, vii° or IV for V (in minor
   iv for ii°, VII or iv for V). Each chord can also be replaced by its tritone substitute, the
   dominant seventh a half step above the chord it leads to (♭II7 of the next chord). Where the graph
   falls a perfect fifth that is a tritone from the chord it replaces; in minor, VI falls to ii° by a
   tritone, so VI's substitute is a perfect fifth above it — the tritone substitute of V7/ii°, whose
   root is melodic minor's raised sixth (B♭7 for E♭ in G minor). Three kinds of question:
   - Diatonic progression table: the key's chord symbols under their Roman numerals, major and
     relative minor, with the common-tone substitutions above and below.
   - Tritone substitution graph: I vii° iii vi ii V I in the major key and its relative minor, with
     the tritone substitute of every chord between.
   - Musical phrase: students write a phrase in Roman numerals, checked against the graph's rules.
   cfg.graph holds the settings; cfg.counts.cgtable, .cgtritone and .cgphrase say how many of each. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const MAX = 20;                                   // questions of each kind
  const GRAPH_TYPES = ['cgtable', 'cgtritone', 'cgphrase'];

  // ---------- settings ----------
  // keys: which major keys, one bit each (bit f + 7 for f fifths: −7 is seven flats, 7 seven sharps);
  // each table is in one of them and its relative minor. sevenths: 0 triads, 1 seventh chords.
  // minor: the tables include the relative minor. findMinor: students work out the relative minor
  // (its name isn't printed). romans: the diatonic table prints its Roman numerals (1) or students
  // write them (0). subs: the diatonic table's common-tone substitution rows. ttRomans: the tritone
  // graph shows each chord's numeral. quality: 0 a chord symbol needs its root and quality, 1 the right
  // root alone earns half, 2 only the root counts. score: 'question' (each table or phrase is one
  // question), 'answers' (each answer a point) or 'percent' (the answers' share of outOf points).
  // phrase: mode 1 major, 2 minor, 3 both (taking turns); bars 4 or 8; rules (bit 0 start on the
  // tonic, 1 end with a cadence, 2 follow the graph, 3 a half cadence halfway); symbols: students
  // also write the chord symbols, in a key the quiz picks; showGraph: the graph is drawn beside it.
  // gen: the question maker's version, so a quiz code keeps its questions.
  const keyBit = (f) => 1 << (f + 7);
  const DEFAULT_KEYS = [-4, -3, -2, -1, 0, 1, 2, 3, 4].reduce((m, f) => m | keyBit(f), 0);
  const SCORES = ['question', 'answers', 'percent'];
  const RULES = [
    { bit: 1, id: 'start', label: 'Starts on the tonic' },
    { bit: 2, id: 'cadence', label: 'Ends with a cadence' },
    { bit: 4, id: 'graph', label: 'Every chord follows the graph' },
    { bit: 8, id: 'half', label: 'A half cadence halfway' },
  ];
  const bit01 = (v, d) => (v == null ? d : v ? 1 : 0);
  function graphSettings(g) {
    const s = g || {};
    s.keys = (s.keys == null ? DEFAULT_KEYS : s.keys & 0x7fff) || DEFAULT_KEYS;
    s.sevenths = bit01(s.sevenths, 0);
    s.minor = bit01(s.minor, 1);
    s.findMinor = bit01(s.findMinor, 0);
    s.romans = bit01(s.romans, 1);
    s.subs = bit01(s.subs, 1);
    s.ttRomans = bit01(s.ttRomans, 0);
    s.quality = clamp(s.quality | 0, 0, 2);
    if (!SCORES.includes(s.score)) s.score = 'answers';
    s.outOf = clamp(Math.round(s.outOf || 100), 1, 1000);
    const p = s.phrase = s.phrase || {};
    p.mode = clamp(p.mode | 0 || 3, 1, 3);
    p.bars = p.bars === 4 ? 4 : 8;
    p.rules = p.rules == null ? 0b0111 : p.rules & 15;
    p.symbols = bit01(p.symbols, 0);
    p.showGraph = bit01(p.showGraph, 1);
    s.gen = clamp(s.gen | 0 || 1, 1, 7);
    return s;
  }
  const keyList = (mask) => { const out = []; for (let f = -7; f <= 7; f++) if (mask & keyBit(f)) out.push(f); return out; };

  // ---------- keys and chords ----------
  // The graph's chord on each scale degree, as a triad and as a seventh chord. The minor key takes
  // VII, III and VI from the natural minor and ii° and V from the harmonic minor, as its table does.
  const QUAL = {
    major: { 1: ['maj', 'maj7'], 2: ['min', 'min7'], 3: ['min', 'min7'], 4: ['maj', 'maj7'], 5: ['maj', 'dom7'], 6: ['min', 'min7'], 7: ['dim', 'hdim7'] },
    minor: { 1: ['min', 'min7'], 2: ['dim', 'hdim7'], 3: ['maj', 'maj7'], 4: ['min', 'min7'], 5: ['maj', 'dom7'], 6: ['maj', 'maj7'], 7: ['maj', 'dom7'] },
  };
  const RN_NAMES = { major: [null, 'I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'], minor: [null, 'i', 'ii°', 'III', 'iv', 'V', 'VI', 'VII'] };
  const keyOf = (mode, f) => MQ.makeKey(mode, f);
  const chordAt = (kd, deg, sev) => ({ root: MQ.keyPitch(kd, deg - 1), q: QUAL[kd.mode][deg][sev ? 1 : 0] });
  const pcText = (pc) => MQ.pcName({ step: pc.step, alt: pc.alt, oct: 4 });
  const keyTitle = (kd) => `${pcText(kd.tonic)} ${kd.mode}`;
  const minorName = (kd) => pcText(kd.tonic) + 'mi';
  const pcOf = (pc) => ((MQ.midi({ step: pc.step, alt: pc.alt, oct: 4 }) % 12) + 12) % 12;
  const sameRoot = (a, b, enh) => (enh ? pcOf(a) === pcOf(b) : a.step === b.step && a.alt === b.alt);

  // The tritone substitute that leads to a chord: the dominant seventh a half step above it, ♭II7.
  // Written the simpler way — fewer sharps or flats, no C♭, F♭, E♯ or B♯ — and on a tie as ♭II
  // (E♭7 before D, not D♯7). Either spelling is right in an answer.
  const oddSpelling = (x) => (x.alt === -1 && (x.step === 0 || x.step === 3)) || (x.alt === 1 && (x.step === 2 || x.step === 6));
  function tritoneSub(target) {
    const p = { step: target.root.step, alt: target.root.alt, oct: 4 };
    const flat = MQ.transpose(p, 2, 1, 1), sharp = MQ.transpose(p, 1, 1, 1);
    const cost = (x) => Math.abs(x.alt) * 2 + (Math.abs(x.alt) > 1 || oddSpelling(x) ? 1 : 0);
    const main = cost(sharp) < cost(flat) ? sharp : flat, other = main === flat ? sharp : flat;
    return { root: { step: main.step, alt: main.alt }, q: 'dom7', other: { root: { step: other.step, alt: other.alt }, q: 'dom7' } };
  }

  // ---------- the order keys come in ----------
  // One shuffled deal of the teacher's keys per quiz, used up before any key comes round again, so
  // the tables and phrases of a quiz are in different keys as far as the choice allows.
  function keyDealer(cfg, s) {
    const pool = keyList(s.keys);
    const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ 0xc40d6a9e) >>> 0);
    let deck = [], last = null;
    return () => {
      if (!deck.length) {
        deck = pool.slice();
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        if (deck.length > 1 && deck[deck.length - 1] === last) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
      }
      last = deck.pop();
      return last;
    };
  }

  // ---------- the tables ----------
  // A table is rows of cells under the graph's columns. Each row has a head (its label, at the left)
  // and a cell per column. A cell is null (outside the table's shape), {text} (printed), or
  // {slots: [i] or [i, j]} (one answer box, or two with "or" between), with cap: a small numeral
  // above it. Every answer box is a slot:
  //   {kind: 'chord', want: {root, q}, shown, tt}   a chord symbol (tt: a tritone substitute, either spelling;
  //                                                  italic: one that isn't a tritone from its column's chord)
  //   {kind: 'rn', want: 'vii°', shown}              a Roman numeral
  //   {kind: 'key', want: {root}, shown: 'Gmi'}      the relative minor's name
  // Rows that hold answers have a name for the answer key, and rows of chords can be played (play).
  const CYCLE = [7, 3, 6, 2, 5, 1];
  const TT_CYCLE = [1, 7, 3, 6, 2, 5, 1];
  // Common-tone substitutions: IV for ii; vii° or IV for V (iv for ii°; VII or iv for V in minor).
  const SUBS = { 2: [4], 5: [7, 4] };

  function diatonicTable(f, s) {
    const M = keyOf('major', f), m = keyOf('minor', f), sev = !!s.sevenths;
    const t = { kind: 'diatonic', fifths: f, sevenths: sev, quality: s.quality, cols: CYCLE.length, rows: [], slots: [] };
    const slot = (x) => { t.slots.push(x); return t.slots.length - 1; };
    // Box labels name the row and column, never the answer.
    const where = (row, c, k, n) => `${row}, column ${c + 1}${n > 1 ? `, box ${k + 1} of ${n}` : ''}`;
    const rnCell = (kd, degs, c, row) => {
      const names = degs.map((d) => MQ.romanOf(chordAt(kd, d, sev), kd));
      return s.romans ? { text: names.join(' or ') } : { slots: names.map((n, k) => slot({ kind: 'rn', want: n, shown: n, label: where(row, c, k, names.length) })) };
    };
    const chordCell = (kd, degs, c, row) => ({
      slots: degs.map((d, k) => { const ch = chordAt(kd, d, sev); return slot({ kind: 'chord', want: ch, shown: MQ.symbolOf(ch), label: where(row, c, k, degs.length) }); }),
    });
    // Each band is a row of numerals over a row of chords.
    const band = (kd, head1, head2, degsAt, name, rnName, play) => {
      t.rows.push({ head: head1, name: rnName, cells: CYCLE.map((d, c) => (degsAt(d) ? rnCell(kd, degsAt(d), c, rnName) : null)) });
      t.rows.push({ head: head2, name, play, key: kd, cells: CYCLE.map((d, c) => (degsAt(d) ? chordCell(kd, degsAt(d), c, name) : null)) });
    };
    const subHead = { text: 'Common tone substitutions', span: 2, sub: true };
    if (s.subs) band(M, subHead, null, (d) => SUBS[d], 'Substitutions (major)', 'Substitution numerals (major)', false);
    band(M, { text: 'Major' }, { text: MQ.MAJOR_KEYS[f + 7], key: true }, (d) => [d], keyTitle(M), 'Major numerals', true);
    if (s.minor) {
      const head = s.findMinor ? { slots: [slot({ kind: 'key', want: { root: m.tonic }, shown: minorName(m), label: 'The relative minor key' })], key: true } : { text: minorName(m), key: true };
      band(m, { text: 'Minor' }, head, (d) => [d], keyTitle(m), 'Minor numerals', true);
      if (s.subs) band(m, subHead, null, (d) => SUBS[d], 'Substitutions (minor)', 'Substitution numerals (minor)', false);
    }
    return t;
  }

  function tritoneTable(f, s) {
    const M = keyOf('major', f), m = keyOf('minor', f), sev = !!s.sevenths;
    const t = { kind: 'tritone', fifths: f, sevenths: sev, quality: s.quality, cols: TT_CYCLE.length, rows: [], slots: [] };
    const slot = (x) => { t.slots.push(x); return t.slots.length - 1; };
    const chordRow = (kd, label, firstGiven) => ({
      head: { text: label }, name: keyTitle(kd), play: true, key: kd,
      cells: TT_CYCLE.map((d, i) => {
        const ch = chordAt(kd, d, sev), cap = s.ttRomans ? MQ.romanOf(ch, kd) : null;
        if (i === 0 && firstGiven) return { text: MQ.symbolOf(ch), cap };
        return { slots: [slot({ kind: 'chord', want: ch, shown: MQ.symbolOf(ch), label: `${label}, column ${i + 1}` })], cap };
      }),
    });
    // The first and last columns are the tonic, which the graph arrives at rather than leaves. Each
    // other column's substitute leads to the next column's chord. When it isn't a tritone from its own
    // column's chord (minor's VI, a perfect fifth below it) the box is in italics: right, though it
    // looks wrong.
    const subRow = (kd, label) => ({
      head: { text: label }, name: label, key: kd,
      cells: TT_CYCLE.map((d, i) => {
        if (i === 0 || i === TT_CYCLE.length - 1) return null;
        const sub = tritoneSub(chordAt(kd, TT_CYCLE[i + 1], sev));
        const italic = (pcOf(sub.root) - pcOf(chordAt(kd, d, sev).root) + 12) % 12 !== 6;
        return { slots: [slot({ kind: 'chord', want: { root: sub.root, q: 'dom7' }, shown: MQ.symbolOf(sub), other: MQ.symbolOf(sub.other), tt: true, italic, label: `${label}, column ${i + 1}` })] };
      }),
    });
    t.rows.push(subRow(M, 'Tritone subs of major'));
    t.rows.push(chordRow(M, 'Diatonic major', true));
    if (s.minor) {
      t.rows.push(chordRow(m, 'Relative minor', !s.findMinor));
      t.rows.push(subRow(m, 'Tritone subs of minor'));
    }
    return t;
  }

  function tableQuestion(kind, f, s, i) {
    const M = keyOf('major', f), m = keyOf('minor', f);
    const T = kind === 'tritone' ? tritoneTable(f, s) : diatonicTable(f, s);
    const keys = s.minor ? (s.findMinor ? `${keyTitle(M)} and its relative minor` : `${keyTitle(M)} and its relative minor, ${keyTitle(m)}`) : keyTitle(M);
    const eg = s.sevenths ? 'B♭ma7, Gmi7, Dmi7♭5, F7' : 'B♭, Gmi, D°';
    const typing = `Type mi or - for minor, o or dim for diminished${s.sevenths ? ', ma7 for a major seventh, mi7♭5 or ø for half-diminished' : ''}.`;
    // On paper the typing tips are left off.
    let text, paper, screen = '';
    if (kind === 'tritone') {
      text = `Fill in the tritone substitution graph for ${keys}.`;
      paper = `Write each chord of the key${s.minor ? ' and of its relative minor' : ''} — root and quality (${eg}) — and above or below it its tritone substitute: the dominant seventh a half step above the next chord, which it leads to. Either spelling is fine (C♭7 or B7).${s.minor ? ' In minor, VI’s substitute is a perfect fifth above it, from melodic minor’s raised sixth.' : ''}`;
      if (s.minor) screen = ' Its box is in italics.';
    } else {
      text = `Fill in the diatonic progression table for ${keys}.`;
      paper = `Write the chord symbol for each Roman numeral (${eg})${s.romans ? '' : ', and write the Roman numerals too'}.${s.minor && s.findMinor ? ' Name the relative minor in its box.' : ''}`;
    }
    return { type: kind === 'tritone' ? 'cgtritone' : 'cgtable', clef: 'treble', text, hint: paper + screen + ' ' + typing, printHint: paper, cg: T, sig: 'cg' + kind[0] + i, tags: [] };
  }

  // ---------- reading what students type ----------
  // A chord symbol: a root (with ♭ ♯, b #, bb ## or x) and anything Clefwork reads after one —
  // mi, m, -, min or minor for minor; ° o or dim; +; 7, ma7, M7, Δ7; mi7♭5, -7b5 or ø. A triangle on its
  // own (B♭Δ) means major: the triad in a table of triads, the major seventh in a table of sevenths.
  // Returns {root, q, delta, explicit} (explicit: something followed the root), or null.
  const ACC = { '': 0, '#': 1, '♯': 1, '##': 2, '♯♯': 2, x: 2, '𝄪': 2, b: -1, '♭': -1, bb: -2, '♭♭': -2, '𝄫': -2 };
  function readChord(str) {
    const s = String(str || '').trim().replace(/\s+/g, '').replace(/[()]/g, '')
      .replace(/[△∆▵^]/g, 'Δ').replace(/[−–—]/g, '-').replace(/[º˚]/g, '°').replace(/Ø/g, 'ø');
    if (!s || s.includes('/')) return null;
    const m = s.match(/^([A-Ga-g])(##|♯♯|x|𝄪|#|♯|bb|♭♭|𝄫|b|♭)?(.*)$/u);
    if (!m) return null;
    const root = { step: 'CDEFGAB'.indexOf(m[1].toUpperCase()), alt: ACC[m[2] || ''] };
    let suf = m[3];
    if (/^(major|minor)$/i.test(suf)) suf = suf.toLowerCase();
    if (suf === 'Δ') return { root, q: 'maj', delta: true, explicit: true };
    const ch = MQ.parseSymbol('C' + suf);
    if (!ch || ch.bass) return null;
    return { root, q: ch.q, delta: false, explicit: suf !== '' };
  }
  // How a read chord is written back (report codes carry the chord, not the keystrokes).
  function chordText(c) {
    if (!c) return '';
    const sym = c.delta ? 'Δ' : c.q === 'maj' ? (c.explicit ? 'ma' : '') : (MQ.QUALITIES.find((x) => x.id === c.q) || { sym: '' }).sym;
    return pcText(c.root) + sym;
  }
  // Roman numerals, read by Clefwork Analysis's reader: vii°, viio, viiø7, V7, IVma7, IΔ7 …
  const readRoman = (str) => MQ.parseAnalysisRoman(String(str || '').replace(/[△∆▵^]/g, 'Δ'));

  // ---------- marking the tables ----------
  const full = (ok, rootOk, quality) => (ok ? 1 : !rootOk ? 0 : quality === 2 ? 1 : quality === 1 ? 0.5 : 0);
  // What one answer earns in one slot: 1, ½ (the right root, when the quiz gives half for it) or 0.
  function slotCredit(slot, text, quality, enh) {
    if (!String(text || '').trim()) return 0;
    if (slot.kind === 'rn') {
      const got = readRoman(text), want = readRoman(slot.want);
      if (!got || !want || got.kind !== 'rn' || got.applied) return 0;
      const degOk = got.deg === want.deg && got.acc === want.acc;
      const ok = degOk && got.low === want.low && got.mark === want.mark && got.seventh === want.seventh && !got.ninth && got.inv === 0;
      return full(ok, degOk, quality);
    }
    const c = readChord(text);
    if (!c) return 0;
    const rootOk = sameRoot(c.root, slot.want.root, enh || !!slot.tt);
    if (slot.kind === 'key') return full(rootOk && (c.q === 'min' || !c.explicit), rootOk, quality);
    return full(rootOk && (c.q === slot.want.q || (c.delta && slot.want.q === 'maj7')), rootOk, quality);
  }
  const tableCells = (T) => [].concat(...T.rows.map((r) => [r.head].concat(r.cells))).filter((c) => c && c.slots);
  // Per slot: {credit, want} — want is the slot whose answer the box was marked against. The two boxes
  // of an "or" cell can come in either order.
  function markTable(q, resp, cfg) {
    const T = q.cg, enh = !!(cfg && cfg.flags && cfg.flags.enharmonic);
    const got = (i) => (resp && resp[i]) || '';
    const cr = (want, box) => slotCredit(T.slots[want], got(box), T.quality, enh);
    const out = T.slots.map((_, i) => ({ credit: 0, want: i }));
    tableCells(T).forEach((cell) => {
      const [a, b] = cell.slots;
      if (b == null) { out[a] = { credit: cr(a, a), want: a }; return; }
      const straight = cr(a, a) + cr(b, b), crossed = cr(a, b) + cr(b, a);
      if (crossed > straight) { out[a] = { credit: cr(b, a), want: b }; out[b] = { credit: cr(a, b), want: a }; }
      else { out[a] = { credit: cr(a, a), want: a }; out[b] = { credit: cr(b, b), want: b }; }
    });
    return out;
  }

  // ---------- phrases ----------
  // Where each chord sits in the graph, by scale degree: columns 0–5 are vii° iii vi ii V I (VII III
  // VI ii° V i in minor). IV stands in for ii or V, and vii° (VII) for V, so each can be in two places.
  const POS = { 1: [5], 2: [3], 3: [1], 4: [3, 4], 5: [4], 6: [2], 7: [0, 4] };
  const DOMINANT = [5, 7, 4];                        // what can come just before the tonic: V, vii°/VII, IV/iv
  // The graph's moves: one column to the right; anywhere from the tonic; staying on a chord; and from V,
  // the deceptive vi or iii (VI or III), or IV on the way to I. Everything else goes backwards.
  function allowedMove(a, b) {
    if (a === b || a === 1) return true;
    if (a === 5 && (b === 6 || b === 3 || b === 4)) return true;
    return POS[a].some((pa) => POS[b].includes(pa + 1));
  }
  // A numeral a phrase may use: the key's own chord on that degree, as a triad or a seventh chord, in
  // any inversion. vii° (ii° in minor) takes ° or, as a seventh chord, ø. Returns {deg, seventh, mark}.
  function phraseChord(text, mode) {
    const p = readRoman(text);
    if (!p || p.kind !== 'rn' || p.acc || p.applied || p.ninth) return null;
    const deg = p.deg + 1, want = RN_NAMES[mode][deg];
    if (p.low !== (want[0] === want[0].toLowerCase())) return null;
    const dim = /°/.test(want);
    if (dim ? !(p.mark === '°' || (p.mark === 'ø' && p.seventh)) : p.mark) return null;
    return { deg, seventh: p.seventh, mark: p.mark };
  }
  const rulesOn = (P) => RULES.filter((r) => P.rules & r.bit && r.id !== 'graph' && (r.id !== 'half' || P.bars >= 8));
  const dominantText = (mode) => (mode === 'minor' ? 'V, VII or iv' : 'V, vii° or IV');
  function ruleLabel(id, P) {
    const I = RN_NAMES[P.mode][1];
    if (id === 'start') return `Starts on ${I}`;
    if (id === 'cadence') return `Ends on ${I}, after ${dominantText(P.mode)}`;
    return `Measure ${P.bars / 2} is ${dominantText(P.mode)} — a half cadence`;
  }
  // The expected chord for a numeral a student wrote, for the chord symbols under it.
  function chordForNumeral(kd, c) {
    const ch = chordAt(kd, c.deg, c.seventh);
    if (c.mark === '°' && c.seventh) ch.q = 'dim7';
    return ch;
  }
  // Everything a phrase is marked on: each measure (a chord of the key that the graph allows after the
  // one before), each rule the teacher chose, and each chord symbol when those are asked for.
  function checkPhrase(q, resp, cfg) {
    const P = q.ph, enh = !!(cfg && cfg.flags && cfg.flags.enharmonic);
    const r = (resp && resp.r) || [], sy = (resp && resp.s) || [];
    const text = (i) => String(r[i] || '').trim();
    const chords = [];
    for (let i = 0; i < P.bars; i++) chords.push(text(i) ? phraseChord(text(i), P.mode) : null);
    const name = (c) => RN_NAMES[P.mode][c.deg];
    const bars = chords.map((c, i) => {
      if (!text(i)) return { ok: false, why: 'Empty' };
      if (!c) return { ok: false, why: readRoman(text(i)) ? `${text(i)} isn’t one of the key’s chords` : `${text(i)} isn’t a Roman numeral` };
      const prev = chords[i - 1];
      if (P.rules & 4 && prev && !allowedMove(prev.deg, c.deg)) return { ok: false, why: `The graph doesn’t go from ${name(prev)} to ${name(c)}` };
      return { ok: true, why: '' };
    });
    // The cadence: the last chord is the tonic, and the chord before the final tonic(s) leads to it.
    let last = P.bars - 1;
    const endsOnI = !!chords[last] && chords[last].deg === 1;
    while (last > 0 && chords[last] && chords[last].deg === 1) last--;
    const rules = rulesOn(P).map((ru) => {
      let ok = false;
      if (ru.id === 'start') ok = !!chords[0] && chords[0].deg === 1;
      if (ru.id === 'cadence') ok = endsOnI && !!chords[last] && chords[last].deg !== 1 && DOMINANT.includes(chords[last].deg);
      if (ru.id === 'half') { const c = chords[P.bars / 2 - 1]; ok = !!c && DOMINANT.includes(c.deg); }
      return { id: ru.id, label: ruleLabel(ru.id, P), ok };
    });
    const symbols = P.symbols ? chords.map((c, i) => {
      if (!c) return 0;
      return slotCredit({ kind: 'chord', want: chordForNumeral(P.key, c) }, sy[i], P.quality, enh);
    }) : null;
    const points = bars.length + rules.length + (symbols ? symbols.length : 0);
    const earned = bars.filter((b) => b.ok).length + rules.filter((x) => x.ok).length + (symbols ? symbols.reduce((a, b) => a + b, 0) : 0);
    return { bars, rules, symbols, points, earned, chords };
  }
  // A phrase that keeps every rule, for the answer key and the preview: one of these everyday phrases
  // (scale degrees; the same shapes serve minor), or failing those, a walk through the graph.
  const STOCK = {
    4: [[1, 4, 5, 1], [1, 2, 5, 1], [1, 6, 4, 1], [1, 5, 4, 1], [1, 6, 2, 5]],
    8: [[1, 6, 2, 5, 1, 4, 5, 1], [1, 4, 7, 3, 6, 2, 5, 1], [1, 6, 4, 5, 6, 2, 5, 1], [1, 5, 6, 4, 1, 4, 5, 1],
      [1, 2, 5, 1, 6, 4, 5, 1], [1, 3, 6, 4, 5, 1, 5, 1], [1, 6, 4, 5, 1, 2, 5, 1], [1, 6, 2, 5, 6, 2, 5, 1]],
  };
  function examplePhrase(rng, P) {
    const keeps = (seq) => {
      const c = checkPhrase({ ph: Object.assign({}, P, { symbols: 0 }) }, { r: seq.map((d) => RN_NAMES[P.mode][d]) }, null);
      return c.earned === c.points;
    };
    const ok = STOCK[P.bars].filter(keeps);
    if (ok.length) return ok[Math.floor(rng() * ok.length)].slice();
    for (let t = 0; t < 400; t++) {
      const seq = [1];
      while (seq.length < P.bars) {
        const a = seq[seq.length - 1];
        const opts = [2, 3, 4, 5, 6, 7, 1].filter((b) => b !== a && allowedMove(a, b));
        seq.push(opts[Math.floor(rng() * opts.length)]);
      }
      if (keeps(seq)) return seq;
    }
    return STOCK[P.bars][0].slice();
  }
  function rulesSentence(P) {
    const I = RN_NAMES[P.mode][1], parts = [];
    if (P.rules & 1) parts.push(`start on ${I}`);
    if (P.rules & 2) parts.push(`end on ${I} after ${dominantText(P.mode)}`);
    if (P.rules & 4) parts.push('let every chord follow the chord graph');
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    let out = 'Write one chord in each measure.' + (parts.length ? ' ' + cap(parts.join('; ')) + '.' : '');
    if (P.rules & 8 && P.bars >= 8) out += ` End the first half, in measure ${P.bars / 2}, on ${dominantText(P.mode)} — a half cadence.`;
    return out;
  }
  function phraseQuestion(mode, f, s, rng, i) {
    const p = s.phrase, kd = keyOf(mode, f);
    const P = { mode, bars: p.bars, rules: p.rules, symbols: p.symbols, showGraph: p.showGraph, fifths: f, key: kd, quality: s.quality };
    P.example = examplePhrase(rng, P);
    return {
      type: 'cgphrase', clef: 'treble',
      text: `Create a complete phrase in a ${mode} key using Roman numerals.` + (p.symbols ? ` Then write its chord symbols in ${keyTitle(kd)}.` : ''),
      hint: rulesSentence(P),
      ph: P, sig: 'cgp' + i, tags: [],
    };
  }

  // ---------- the questions ----------
  function graphQuestions(cfg) {
    const s = graphSettings(cfg.graph), c = cfg.counts || {};
    const n = (k) => clamp(c[k] | 0, 0, MAX);
    if (!n('cgtable') && !n('cgtritone') && !n('cgphrase')) return [];
    const deal = keyDealer(cfg, s);
    const out = [];
    for (let i = 0; i < n('cgtable'); i++) out.push(tableQuestion('diatonic', deal(), s, i));
    for (let i = 0; i < n('cgtritone'); i++) out.push(tableQuestion('tritone', deal(), s, i));
    const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ 0x7a11ed05) >>> 0);
    for (let i = 0; i < n('cgphrase'); i++) {
      const mode = s.phrase.mode === 3 ? (i % 2 ? 'minor' : 'major') : s.phrase.mode === 2 ? 'minor' : 'major';
      out.push(phraseQuestion(mode, deal(), s, rng, i));
    }
    return out;
  }

  // ---------- grading, for every kind ----------
  const isGraph = (q) => GRAPH_TYPES.includes(q.type);
  // How many points a question has when each answer is a point.
  function graphPoints(q) {
    if (q.type !== 'cgphrase') return q.cg.slots.length;
    const P = q.ph;
    return P.bars + rulesOn(P).length + (P.symbols ? P.bars : 0);
  }
  // {notes, wrong}: the points and the points lost (halves when a right root earns half).
  function compareGraph(q, resp, cfg) {
    if (q.type === 'cgphrase') { const c = checkPhrase(q, resp, cfg); return { notes: c.points, wrong: c.points - c.earned }; }
    const credit = markTable(q, resp, cfg).reduce((a, m) => a + m.credit, 0);
    return { notes: q.cg.slots.length, wrong: q.cg.slots.length - credit };
  }
  function gradeGraph(q, resp, cfg) {
    const c = compareGraph(q, resp, cfg);
    return c.notes ? (c.notes - c.wrong) / c.notes : 0;
  }
  function hasGraphAnswer(q, resp) {
    if (!resp) return false;
    if (q.type === 'cgphrase') return ['r', 's'].some((k) => (resp[k] || []).some((x) => String(x || '').trim()));
    return Array.isArray(resp) && resp.some((x) => String(x || '').trim());
  }
  // The answer key, row by row: "B♭ major: A° Dmi Gmi Cmi F B♭ · Substitutions (major): E♭ | A° or E♭ …"
  const exampleText = (P) => P.example.map((d) => RN_NAMES[P.mode][d]);
  const exampleSymbols = (P) => P.example.map((d) => MQ.symbolOf(chordAt(P.key, d, false)));
  // italic (optional): a function that marks the text of an italic box; the answer comes back as a list
  // of strings and whatever it returns, rather than as one string.
  function describeGraph(q, italic) {
    if (q.type === 'cgphrase') {
      const P = q.ph, rn = exampleText(P), half = P.bars / 2;
      const line = (list) => (P.bars > 4 ? `| ${list.slice(0, half).join(' | ')} || ${list.slice(half).join(' | ')} |` : `| ${list.join(' | ')} |`);
      return `Any phrase that keeps the rules, such as ${line(rn)}` + (P.symbols ? ` — in ${keyTitle(P.key)}: ${exampleSymbols(P).join(' ')}` : '');
    }
    const T = q.cg, parts = [];
    const add = (x) => { if (typeof x === 'string' && typeof parts[parts.length - 1] === 'string') parts[parts.length - 1] += x; else parts.push(x); };
    T.rows.filter((row) => row.cells.some((c) => c && c.slots) || (row.head && row.head.slots)).forEach((row, r) => {
      add(`${r ? ' · ' : ''}${row.name}: `);
      if (row.head && row.head.slots) add(`(${T.slots[row.head.slots[0]].shown}) `);
      row.cells.filter(Boolean).forEach((c, k) => {
        if (k) add(' ');
        if (!c.slots) { add(c.text); return; }
        c.slots.forEach((i, j) => { if (j) add(' or '); add(italic && T.slots[i].italic ? italic(T.slots[i].shown) : T.slots[i].shown); });
      });
    });
    return italic ? parts : parts.join('');
  }
  // The graph as the phrase card draws it: per column the chord, what can stand in above it, and below.
  const GRAPH_VIEW = {
    major: [['vii°'], ['iii'], ['vi'], ['ii', 'IV'], ['V', 'IV', 'vii°'], ['I']],
    minor: [['VII'], ['III'], ['VI'], ['ii°', 'iv'], ['V', 'iv', 'VII'], ['i']],
  };

  Object.assign(MQ, {
    GRAPH_TYPES, GRAPH_MAX: MAX, GRAPH_RULES: RULES, GRAPH_SCORES: SCORES, GRAPH_VIEW, GRAPH_RN: RN_NAMES,
    graphKeyBit: keyBit, graphKeyList: keyList, graphSettings, graphQuestions, isGraph,
    readGraphChord: readChord, graphChordText: chordText, graphChordAt: chordAt, graphKeyTitle: keyTitle, tritoneSub,
    markGraphTable: markTable, checkPhrase, phraseChord, allowedGraphMove: allowedMove, chordForNumeral, graphExample: exampleText, graphExampleSymbols: exampleSymbols,
    graphPoints, compareGraph, gradeGraph, hasGraphAnswer, describeGraph,
  });
})(typeof window !== 'undefined' ? window : globalThis);
