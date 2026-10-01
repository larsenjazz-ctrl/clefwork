/* Clefwork Analysis — questions on a picture of real music. The teacher boxes part of the score
   and gives its Roman numeral, its chord symbol, or both; students type their answers beside the
   music. Everything here is shared by the builder, the quiz, the grade checker and results pages.
   - Roman numerals are typed with their figures (V65, V6/5, vii°7, viiø43, V7/V, N6, Ger+6) and
     marked by what they mean, not how they were typed.
   - Chord symbols use the same reader and spelling as the rest of Clefwork (mi, ma, °, ♭/♯).
   - The score travels inside the quiz link as a compressed black-and-white picture.
   - A quiz can have up to six scores, each with its own boxes; the boxes are numbered on from one
     score to the next. The first score's picture and boxes are where a one-score quiz keeps them
     (img, regions); the others follow in more: [{img, regions, title}].
   - A box can instead ask for non-harmonic tones (ask: 'nht'): students circle notes in it and name
     each from a menu, or join two circles with a line and name the pair (a 4–3 suspension, an
     anticipation). nht: {mode (0 students find the notes, 1 the notes are circled for them), rx, ry
     (a circle's radius, as fractions of the picture's width and height), c: [{x, y, t}] (circles: centre
     and kind, an index into NHT_TYPES, or −1 inside a pair), l: [{a, b, t}] (pairs: two circles and an
     index into NHT_PAIRS)}.
   - A Roman numeral box can be linked to the next (link: 1): the same chord, its figures changing, as
     in V 6–5 over 4–3. The first box takes the numeral and figures (V64), the next just its figures (53).
   - Each score can mark where the key changes: keys: [{x, y, w, h (the chord, boxed), hide (students
     find the chord themselves), key ({fifths, mode}: the new key, or null), ask (students name it)}].
     These are numbered on their own — Key change 1, 2 … — so a hidden one's number doesn't give away
     where it is. A change that's shown and doesn't ask for the key is only a marker, not a question.
   - Each score can say what key the music begins in: open: {key ({fifths, mode} or null), show (0 not
     shown, 1 shown above the music, 2 students identify it)}. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const ASKS = ['', 'roman', 'symbol', 'both'];   // the number each answer type is stored as
  const MAX_REGIONS = 60;
  const MAX_SCORES = 6;

  function analysisSettings(block) {
    const b = block || {};
    if (!Array.isArray(b.regions)) b.regions = [];
    if (b.override == null) b.override = 0;        // 0 each question's own, else an index into ASKS
    if (b.notes == null) b.notes = '';             // instructions shown to students (the key, say)
    if (b.img === undefined) b.img = null;         // {hash, w, h} of the score picture
    if (b.title == null) b.title = '';             // the first score's name, shown above it (more than one score)
    if (!Array.isArray(b.more)) b.more = [];       // the other scores
    b.more.length = Math.min(b.more.length, MAX_SCORES - 1);
    b.more.forEach((m) => {
      if (!Array.isArray(m.regions)) m.regions = [];
      if (m.img === undefined) m.img = null;
      if (m.title == null) m.title = '';
    });
    // The menus students choose from, for circled notes and for pairs (ids from NHT_TYPES, NHT_PAIRS).
    if (!Array.isArray(b.nhtOpts)) b.nhtOpts = NHT_DEFAULT.slice();
    if (!Array.isArray(b.pairOpts)) b.pairOpts = PAIR_DEFAULT.slice();
    b.nhtOpts = NHT_TYPES.map((x) => x.id).filter((id) => b.nhtOpts.includes(id));
    b.pairOpts = NHT_PAIRS.map((x) => x.id).filter((id) => b.pairOpts.includes(id));
    [b].concat(b.more).forEach((sc) => {
      sc.regions.forEach((r) => { if (r.ask === 'nht') r.nht = nhtSettings(r.nht); });
      if (!Array.isArray(sc.keys)) sc.keys = [];
      sc.keys = sc.keys.slice(0, 15).map(keySettings);
      sc.open = openSettings(sc.open);
    });
    b.keyTol = KEY_TOLS.includes(b.keyTol) ? b.keyTol : 15;
    return b;
  }
  // Every score of the quiz, the first one included: [{img, regions, title}] (the first is the block itself).
  const scoresOf = (block) => { const b = analysisSettings(block); return [b].concat(b.more); };
  // ---------- key changes ----------
  // How close a student's box must come to the teacher's: each side within this share of the teacher's
  // box's width (and at least a few pixels' worth), and at least 60% of the student's box within the
  // teacher's height — it needn't reach from top to bottom.
  const KEY_TOLS = [10, 15, 25];
  const KEYS30 = [];                                     // every key, major then minor, by fifths
  ['major', 'minor'].forEach((mode) => { for (let f = -7; f <= 7; f++) KEYS30.push({ fifths: f, mode }); });
  const keyIndex = (k) => (!k ? -1 : (k.mode === 'minor' ? 15 : 0) + Math.max(-7, Math.min(7, k.fifths | 0)) + 7);
  const keyText = (k) => (!k ? '' : `${(k.mode === 'minor' ? MQ.MINOR_KEYS : MQ.MAJOR_KEYS)[keyIndex(k) % 15]} ${k.mode}`);
  function keySettings(m) {
    const o = m || {};
    ['x', 'y', 'w', 'h'].forEach((k) => { o[k] = Math.max(0, Math.min(1, +o[k] || 0)); });
    o.hide = o.hide ? 1 : 0;
    o.key = o.key && o.key.fifths != null ? { fifths: Math.max(-7, Math.min(7, o.key.fifths | 0)), mode: o.key.mode === 'minor' ? 'minor' : 'major' } : null;
    o.ask = o.ask && o.key ? 1 : 0;
    return o;
  }
  const keyAsked = (m) => !!(m.hide || m.ask);
  // The key a score begins in, and whether students see it (1) or name it (2).
  function openSettings(o0) {
    const o = o0 || {};
    o.key = o.key && o.key.fifths != null ? { fifths: Math.max(-7, Math.min(7, o.key.fifths | 0)), mode: o.key.mode === 'minor' ? 'minor' : 'major' } : null;
    o.show = [0, 1, 2].includes(o.show) ? o.show : 0;
    return o;
  }
  const openAsked = (sc) => sc.open.show === 2 && !!sc.open.key;
  function keyBoxRight(t, s, tol) {
    if (!s || !(s.w > 0) || !(s.h > 0)) return false;
    const e = Math.max(((tol || 15) / 100) * t.w, 0.004);
    const sidesOk = Math.abs(s.x - t.x) <= e && Math.abs(s.x + s.w - (t.x + t.w)) <= e;
    const inside = Math.max(0, Math.min(s.y + s.h, t.y + t.h) - Math.max(s.y, t.y)) / s.h;
    return sidesOk && inside >= 0.6;
  }
  // Every question: the boxes, and the key changes that ask something.
  const regionCount = (block) => scoresOf(block).reduce((n, sc) => n + sc.regions.length + sc.keys.filter(keyAsked).length + (openAsked(sc) ? 1 : 0), 0);
  // ---------- non-harmonic tones ----------
  // What a circled note can be called — kept in codes by place, so the lists only ever grow.
  const NHT_TYPES = [
    { id: 'NT', name: 'Non-harmonic tone' },                     // as an answer, any kind below is right
    { id: 'PT', name: 'Passing tone' },
    { id: 'APT', name: 'Accented passing tone' },
    { id: 'N', name: 'Neighbor tone' },                          // as an answer, an upper or lower neighbor is right
    { id: 'UN', name: 'Upper neighbor' },
    { id: 'LN', name: 'Lower neighbor' },
    { id: 'AN', name: 'Accented neighbor' },
    { id: 'IN', name: 'Incomplete neighbor' },
    { id: 'APP', name: 'Appoggiatura' },
    { id: 'ET', name: 'Escape tone (échappée)' },
    { id: 'DN', name: 'Double neighbor (changing tones)' },
    { id: 'S', name: 'Suspension' },
    { id: 'RET', name: 'Retardation' },
    { id: 'ANT', name: 'Anticipation' },
    { id: 'PED', name: 'Pedal point' },
    { id: 'CPT', name: 'Chromatic passing tone' },
    { id: 'CN', name: 'Chromatic neighbor' },
  ];
  // Two circled notes joined by a line: the dissonance and the note it resolves to — or, for an
  // anticipation, the note it arrives early at. Suspensions are named by their intervals above the bass.
  const NHT_PAIRS = [
    { id: 'Sus', name: 'Suspension' },                           // as an answer, any suspension is right
    { id: '9–8', name: '9–8 suspension' },
    { id: '7–6', name: '7–6 suspension' },
    { id: '4–3', name: '4–3 suspension' },
    { id: '2–3', name: '2–3 suspension (in the bass)' },
    { id: '6–5', name: '6–5 suspension' },
    { id: 'Ret', name: 'Retardation' },                          // as an answer, any retardation is right
    { id: '7–8', name: '7–8 retardation' },
    { id: '2–3 ret', name: '2–3 retardation' },
    { id: 'Ant', name: 'Anticipation' },
  ];
  const NHT_DEFAULT = ['NT', 'PT', 'N', 'APP', 'ET', 'S', 'RET', 'ANT', 'PED'];
  const PAIR_DEFAULT = ['9–8', '7–6', '4–3', '2–3', 'Ant'];
  const nhtIndex = (id) => NHT_TYPES.findIndex((x) => x.id === id);
  const pairIndex = (id) => NHT_PAIRS.findIndex((x) => x.id === id);
  // Whether `got` (an index) answers `want`: the same kind, or one the general answer covers.
  function nhtOk(want, got) {
    if (!(got >= 0) || !NHT_TYPES[got] || !NHT_TYPES[want]) return false;
    const w = NHT_TYPES[want].id, g = NHT_TYPES[got].id;
    return w === g || w === 'NT' || (w === 'N' && (g === 'UN' || g === 'LN'));
  }
  function pairOk(want, got) {
    if (!(got >= 0) || !NHT_PAIRS[got] || !NHT_PAIRS[want]) return false;
    const w = NHT_PAIRS[want].id, g = NHT_PAIRS[got].id;
    return w === g || (w === 'Sus' && /^\d–\d$/.test(g) && !['7–8'].includes(g)) || (w === 'Ret' && (g === '7–8' || g === '2–3 ret'));
  }
  // A box's circles and pairs, tidied.
  function nhtSettings(n) {
    const o = n || {};
    o.mode = o.mode ? 1 : 0;
    o.rx = Math.max(0.002, Math.min(0.24, +o.rx || 0.012));
    o.ry = Math.max(0.002, Math.min(0.24, +o.ry || 0.012));
    if (!Array.isArray(o.c)) o.c = [];
    if (!Array.isArray(o.l)) o.l = [];
    o.c = o.c.slice(0, 63).map((c) => ({ x: Math.max(0, Math.min(1, +c.x || 0)), y: Math.max(0, Math.min(1, +c.y || 0)), t: c.t >= 0 && c.t < NHT_TYPES.length ? c.t | 0 : -1 }));
    o.l = o.l.slice(0, 31).filter((l) => l.a >= 0 && l.b >= 0 && l.a < o.c.length && l.b < o.c.length && l.a !== l.b)
      .map((l) => ({ a: l.a | 0, b: l.b | 0, t: l.t >= 0 && l.t < NHT_PAIRS.length ? l.t | 0 : -1 }));
    return o;
  }
  const inPair = (links, i) => links.some((l) => l.a === i || l.b === i);
  // The student's circles against the teacher's. A circle is on a note when its centre falls within
  // the teacher's circle (a little larger, to allow for aim); each teacher circle takes the nearest.
  // A circle on its own is right with the right name, a pair when both its circles are on the
  // teacher's pair and it has the right name. Circles and pairs that match nothing are extra.
  // {total, right, extra, wantC, wantL, gotC, gotL, foundC, foundL}: the marks are true, false, or null
  // (a circle in a pair); found: whether the student marked that note or pair at all.
  function compareNHT(q, resp) {
    const T = q.an.nht, mine = { c: (resp && resp.c) || [], l: (resp && resp.l) || [] };
    const far = (a, b) => { const dx = (a.x - b.x) / T.rx, dy = (a.y - b.y) / T.ry; return dx * dx + dy * dy; };
    const on = mine.c.map(() => -1), taken = new Set(), near = [];
    mine.c.forEach((s, i) => T.c.forEach((t, j) => { const d = far(s, t); if (d <= 1.56) near.push({ i, j, d }); }));
    near.sort((a, b) => a.d - b.d).forEach(({ i, j }) => { if (on[i] < 0 && !taken.has(j)) { on[i] = j; taken.add(j); } });
    const wantC = T.c.map(() => null), wantL = T.l.map(() => null), gotC = mine.c.map(() => null), gotL = mine.l.map(() => null);
    let right = 0, extra = 0;
    T.c.forEach((t, j) => {
      if (inPair(T.l, j)) return;
      const i = on.indexOf(j), alone = i >= 0 && !inPair(mine.l, i);
      const ok = alone && nhtOk(t.t, mine.c[i].t);
      wantC[j] = ok;
      if (alone) gotC[i] = ok;
      if (ok) right++;
    });
    T.l.forEach((t, k) => {
      const m = mine.l.findIndex((s, n) => gotL[n] == null && ((on[s.a] === t.a && on[s.b] === t.b) || (on[s.a] === t.b && on[s.b] === t.a)));
      const ok = m >= 0 && pairOk(t.t, mine.l[m].t);
      wantL[k] = ok;
      if (m >= 0) gotL[m] = ok;
      if (ok) right++;
    });
    mine.c.forEach((s, i) => { if (!inPair(mine.l, i) && gotC[i] == null) { gotC[i] = false; extra++; } });
    mine.l.forEach((s, m) => { if (gotL[m] == null) { gotL[m] = false; extra++; } });
    const total = T.c.filter((_, j) => !inPair(T.l, j)).length + T.l.length;
    // Which of the teacher's circles and pairs the student found at all, right or wrong.
    const foundC = T.c.map((_, j) => taken.has(j)), foundL = wantL.map((_, k) => T.l[k] && mine.l.some((s) => (on[s.a] === T.l[k].a && on[s.b] === T.l[k].b) || (on[s.a] === T.l[k].b && on[s.b] === T.l[k].a)));
    return { total, right, extra, wantC, wantL, gotC, gotL, foundC, foundL };
  }
  const nhtShort = (t) => (NHT_TYPES[t] ? NHT_TYPES[t].id : '?');
  const pairShort = (t) => (NHT_PAIRS[t] ? NHT_PAIRS[t].id : '?');
  // The answer, left to right: "PT · N · 4–3 (pair)".
  function nhtAnswerText(T) {
    const items = [];
    T.c.forEach((c, j) => { if (!inPair(T.l, j)) items.push({ x: c.x, text: NHT_TYPES[c.t] ? NHT_TYPES[c.t].name : '?' }); });
    T.l.forEach((l) => items.push({ x: Math.min(T.c[l.a].x, T.c[l.b].x), text: NHT_PAIRS[l.t] ? NHT_PAIRS[l.t].name : '?' }));
    return items.sort((a, b) => a.x - b.x).map((x) => x.text).join(' · ') || 'none';
  }

  // ---------- linked Roman numerals ----------
  // One stage of a chord whose figures change: a numeral (or none, going on from the box before) and
  // its figures as intervals above the bass — "V64" → {base: V, figs: '64'}, "53" → {base: null, figs: '53'}.
  function parseStage(str) {
    let s = clean(str);
    if (!s) return null;
    const figsOf = (t) => { const f = t.replace(/\//g, '').replace(/n/g, ''); return /^(?:[#b]?\d)*$/.test(f) ? f : null; };
    const only = figsOf(s);
    if (only && /\d/.test(only)) return { base: null, figs: only };
    if (/^cad(64|6\/4)?$/i.test(s)) return { base: { kind: 'cad' }, figs: '64' };
    let applied = '';
    const ap = s.match(new RegExp('^(.+?)(/[b#]?' + NUM_RE + ')$'));
    if (ap && !/\/$/.test(ap[1])) { s = ap[1]; applied = ap[2]; }
    const m = s.match(new RegExp('^([b#]?)' + NUM_RE + '(ø|\\/o|°|o|dim|\\+|aug)?(?:maj|Maj|ma|M)?(.*)$'));
    if (!m) return null;
    const figs = figsOf(m[4]);
    if (figs == null) return null;
    const base = parseRoman(m[1] + m[2] + (m[3] || '') + applied);
    return base ? { base, figs } : null;
  }
  const figTokens = (figs) => String(figs || '').match(/[#b]?\d/g) || [];
  // The chain a box belongs to, from its first box: whether a stage answer is right for it.
  function stageRight(q, got) {
    const s = parseStage(got);
    if (!s) return false;
    const bases = q.an.base.map((w) => (parseStage(w) || {}).base).filter(Boolean);
    return q.an.roman.some((w) => {
      const ws = parseStage(w);
      if (!ws || ws.figs !== s.figs) return false;
      if (!s.base) return !!q.an.linked;                          // figures alone go on from the box before
      return (ws.base ? [ws.base] : bases).some((b) => sameRoman(b, s.base));
    });
  }
  // "V64", "–53" (going on from the box before), "V7/V".
  function stageText(st) {
    if (!st) return '';
    if (!st.base) return '–' + st.figs;
    if (st.base.kind !== 'rn') return romanText(st.base);
    const r = romanParts(st.base);
    return r.numeral + st.figs + r.target;
  }

  // A teacher's answer can list others that are also right: "I64, Cad64" or "IV or ii6".
  const alternatives = (s) => String(s || '').split(/\s*(?:,|;|\bor\b)\s*/).map((x) => x.trim()).filter(Boolean);

  // ---------- Roman numerals ----------
  // Figures: [inversion, seventh chord]. 5/3, 6/3 and 6/4/2 spellings are accepted too.
  const FIGS = {
    '': [0, false], 5: [0, false], 53: [0, false], 6: [1, false], 63: [1, false], 64: [2, false],
    7: [0, true], 75: [0, true], 73: [0, true], 753: [0, true], 65: [1, true], 653: [1, true],
    43: [2, true], 643: [2, true], 42: [3, true], 642: [3, true], 2: [3, true],
  };
  const FIG_TEXT = [['', '6', '64'], ['7', '65', '43', '42']];
  const NUM_RE = '(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)';
  const clean = (s) => String(s || '').trim()
    .replace(/♭/g, 'b').replace(/♯/g, '#').replace(/♮/g, '')
    .replace(/[º˚]/g, '°').replace(/Ø/g, 'ø').replace(/Δ/g, 'M').replace(/\s+/g, '');

  // "V65", "V6/5", "viio7", "vii/o43", "bVI", "V7/V", "N6", "It+6", "Cad64" → what the numeral means.
  function parseRoman(str) {
    const s = clean(str);
    if (!s) return null;
    const a6 = s.match(/^(It|Ital|Italian|Fr|Fre|French|Ger|Gr|German|Sw|Swiss)\+?(6|63|43|643|65|653|42)?$/i);
    if (a6) {
      const w = a6[1].toLowerCase();
      return { kind: 'aug6', which: w.startsWith('it') ? 'It' : w.startsWith('f') ? 'Fr' : w.startsWith('s') ? 'Sw' : 'Ger' };
    }
    if (/^cad(64|6\/4)?$/i.test(s)) return { kind: 'cad' };
    const nea = s.match(/^N(6|63|64|5|53)?$/);
    if (nea) {
      const f = FIGS[nea[1] || ''];
      return { kind: 'rn', acc: -1, deg: 1, low: false, mark: '', seventh: false, ninth: false, inv: f[0], applied: null };
    }
    // An applied (secondary) chord names the chord it leads to: V7/V, vii°7/ii.
    let body = s, applied = null;
    const ap = s.match(new RegExp('^(.+)/([b#]?)' + NUM_RE + '$'));
    if (ap) {
      body = ap[1];
      applied = { acc: ap[2] === '#' ? 1 : ap[2] === 'b' ? -1 : 0, deg: NUMERALS.indexOf(ap[3].toUpperCase()) };
    }
    const m = body.match(new RegExp('^([b#]?)' + NUM_RE + '(.*)$'));
    if (!m) return null;
    let t = m[3], mark = '';
    const q = t.match(/^(ø|\/o|°|o|dim|\+|aug)/);
    if (q) {
      mark = q[1] === 'ø' || q[1] === '/o' ? 'ø' : q[1] === '+' || q[1] === 'aug' ? '+' : '°';
      t = t.slice(q[1].length);
    }
    const mj = t.match(/^(maj|Maj|ma|M)(?=\d)/);    // IM7, IVmaj7: a major seventh, as in the key
    if (mj) t = t.slice(mj[1].length);
    const digits = t.replace(/\//g, '');
    let inv, seventh, ninth = false;
    if (digits === '9') { inv = 0; seventh = true; ninth = true; }
    else if (digits in FIGS) [inv, seventh] = FIGS[digits];
    else return null;
    if (mark === 'ø' && !digits) seventh = true;      // viiø means the half-diminished seventh chord
    return {
      kind: 'rn', acc: m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0, deg: NUMERALS.indexOf(m[2].toUpperCase()),
      low: m[2] === m[2].toLowerCase(), mark, seventh, ninth, inv, applied,
    };
  }
  // Same chord, position and function. The case of an applied chord's target doesn't matter (V/ii = V/II).
  function sameRoman(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'aug6') return a.which === b.which;
    if (a.kind === 'cad') return true;
    const sameTarget = (x, y) => (!x && !y) || (!!x && !!y && x.acc === y.acc && x.deg === y.deg);
    return a.acc === b.acc && a.deg === b.deg && a.low === b.low && a.mark === b.mark
      && a.seventh === b.seventh && a.ninth === b.ninth && a.inv === b.inv && sameTarget(a.applied, b.applied);
  }
  const accSign = (n) => (n < 0 ? '♭' : n > 0 ? '♯' : '');
  // The parts a display needs: {numeral: '♭VII°', figure: '65', target: '/V'}, or {text} for named chords.
  function romanParts(p) {
    if (!p) return null;
    if (p.kind === 'aug6') return { text: p.which + '+6' };
    if (p.kind === 'cad') return { text: 'Cad64' };
    const n = NUMERALS[p.deg];
    const figure = p.ninth ? '9' : FIG_TEXT[p.seventh ? 1 : 0][p.inv] || '';
    return {
      numeral: accSign(p.acc) + (p.low ? n.toLowerCase() : n) + p.mark,
      figure,
      target: p.applied ? '/' + accSign(p.applied.acc) + NUMERALS[p.applied.deg] : '',
    };
  }
  const romanText = (p) => { const r = romanParts(p); return !r ? '' : r.text || r.numeral + r.figure + r.target; };

  // ---------- chord symbols (Clefwork's reader and spelling) ----------
  const symbolOk = (s) => !!MQ.parseVoiceSymbol(String(s || '').trim());
  // Written the Clefwork way, bass note included: F♯mi7/C♯.
  function symbolText(s) {
    const t = String(s || '').trim();
    const m = t.match(/^(.*)\/([A-Ga-g])([#b♯♭]?)$/);
    if (!m) return MQ.prettySymbol(t);
    return MQ.prettySymbol(m[1]) + '/' + m[2].toUpperCase() + (/[#♯]/.test(m[3]) ? '♯' : m[3] ? '♭' : '');
  }

  // ---------- questions ----------
  // What a box asks for once the quiz-wide setting is applied. A box without the answer the quiz
  // asks for keeps asking for the one it has.
  function askFor(r, override) {
    if (r.ask === 'nht') return 'nht';
    const want = override ? ASKS[override] : r.ask || 'roman';
    const hasR = alternatives(r.roman).length > 0, hasS = alternatives(r.symbol).length > 0;
    let r1 = want !== 'symbol' && hasR, s1 = want !== 'roman' && hasS;
    if (!r1 && !s1) { r1 = hasR; s1 = !hasR && hasS; }
    return r1 && s1 ? 'both' : s1 ? 'symbol' : 'roman';
  }
  // Boxes the quiz-wide setting can't fully apply to, because they lack an answer it asks for.
  function missingAnswers(a) {
    const s = analysisSettings(a);
    if (!s.override) return { roman: [], symbol: [] };
    const want = ASKS[s.override];
    const out = { roman: [], symbol: [] };
    let n = 0;
    scoresOf(s).forEach((sc) => sc.regions.forEach((r) => {
      n++;
      if (r.ask === 'nht') return;
      if (want !== 'symbol' && !alternatives(r.roman).length) out.roman.push(n);
      if (want !== 'roman' && !alternatives(r.symbol).length) out.symbol.push(n);
    }));
    return out;
  }
  const ASK_TEXT = { roman: 'Roman numeral with figures', symbol: 'Chord symbol', both: 'Roman numeral and chord symbol', nht: 'Non-harmonic tones' };
  const partsOf = (q) => (q.an.ask === 'nht' || q.an.ask === 'key' || q.an.ask === 'open' ? [] : q.an.ask === 'both' ? ['r', 's'] : q.an.ask === 'symbol' ? ['s'] : ['r']);
  // Linked boxes: each one marked {link} goes on into the next box of its score when both ask for a
  // Roman numeral. Returns, for every region, {link, linked, first (index of the chain's first box)}.
  function chainsOf(regions, override) {
    const out = regions.map(() => ({ link: false, linked: false, first: -1 }));
    const roman = (r) => r && r.ask !== 'nht' && askFor(r, override) !== 'symbol';
    regions.forEach((r, i) => {
      if (!r.link || !roman(r) || !roman(regions[i + 1])) return;
      out[i].link = true;
      out[i + 1].linked = true;
    });
    out.forEach((c, i) => { if (c.link || c.linked) c.first = c.linked ? out[i - 1].first : i; });
    return out;
  }
  // What's wrong with a score's linked boxes, in words, numbered from `from`.
  function linkProblems(regions, override, from) {
    const ch = chainsOf(regions, override), out = [];
    regions.forEach((r, i) => {
      const n = (from || 0) + i + 1;
      if (r.link && !ch[i].link) out.push(`Box ${n} is linked to the next box, but ${regions[i + 1] ? `box ${n + 1} doesn’t ask for a Roman numeral` : 'there’s no box after it'}.`);
      const alts = alternatives(r.roman);
      if (!ch[i].link && !ch[i].linked) {
        const lone = r.ask !== 'nht' && askFor(r, override) !== 'symbol' && alts.find((w) => !parseRoman(w));
        if (lone) out.push(`Box ${n}: “${lone}” only works in linked boxes — link the box before it to this one, or type the whole numeral.`);
        return;
      }
      const bad = alts.find((w) => { const st = parseStage(w); return !st || (!ch[i].linked && !st.base); });
      if (bad) out.push(ch[i].linked ? `Box ${n}: “${bad}” — type the figures, such as 53 or 7.` : `Box ${n}: “${bad}” — type the numeral and its figures, such as V64.`);
    });
    return out;
  }
  function analysisQuestions(cfg) {
    const a = analysisSettings(cfg.analysis);
    const all = [];
    scoresOf(a).forEach((sc, k) => sc.regions.forEach((r) => all.push({ r, k, img: sc.img })));
    const many = a.more.length > 0;
    const chains = [].concat(...scoresOf(a).map((sc) => chainsOf(sc.regions, a.override).map((c) => Object.assign(c, { regs: sc.regions }))));
    const opts = { nht: a.nhtOpts.map(nhtIndex), pairs: a.pairOpts.map(pairIndex) };
    // After the boxes, the key changes that ask something, numbered on their own.
    let kc = 0;
    // Every key change has its number, so the ones only shown to students keep their places.
    scoresOf(a).forEach((sc, k) => sc.keys.forEach((m) => { const kn = kc++; if (keyAsked(m)) all.push({ m, k, img: sc.img, kc: kn }); }));
    // Then the opening keys students name.
    scoresOf(a).forEach((sc, k) => { if (openAsked(sc)) all.push({ open: sc.open, k, img: sc.img }); });
    const n2 = Math.min(all.length, cfg.counts.analysis == null ? all.length : cfg.counts.analysis);
    return all.slice(0, n2).map(({ r, k, img, m, kc: kn, open }, i) => {
      if (open) {
        return {
          type: 'analysis', clef: 'treble',
          text: `${many ? `Score ${k + 1}: the` : 'The'} opening key`,
          hint: 'Choose the key the music begins in — from the key signature, the first chords and the cadences.',
          an: { n: i, score: k, region: null, ask: 'open', key: Object.assign({}, open.key), img: img ? img.hash : null, roman: [], symbol: [] },
          sig: 'ao' + i, tags: [],
        };
      }
      if (m) {
        const what = m.hide ? (m.ask ? 'find the chord and name the new key' : 'find the chord where the key changes') : 'name the new key';
        return {
          type: 'analysis', clef: 'treble',
          text: `${many ? `Score ${k + 1}, key` : 'Key'} change ${kn + 1}: ${what}`,
          hint: m.hide ? 'Drag a box around the chord where the new key begins.' : 'Choose the key the music changes to at the marked chord.',
          an: { n: i, score: k, kc: kn, region: { x: m.x, y: m.y, w: m.w, h: m.h }, ask: 'key', hide: m.hide, askKey: m.ask, key: m.key ? Object.assign({}, m.key) : null, tol: a.keyTol, img: img ? img.hash : null, roman: [], symbol: [] },
          sig: 'ak' + i, tags: [],
        };
      }
      const ask = askFor(r, a.override);
      const ch = chains[i];
      const q = {
        type: 'analysis', clef: 'treble',
        text: `${many ? `Score ${k + 1}, box` : 'Box'} ${i + 1}: ${ASK_TEXT[ask]}`,
        hint: ask === 'symbol' ? 'For example Dmi7, G7, Cma7, B°, Bmi7♭5 or C/E.' : 'Type the numeral and its figures together, such as V65, ii6 or vii°7.',
        an: { n: i, score: k, region: { x: r.x, y: r.y, w: r.w, h: r.h }, ask, roman: alternatives(r.roman), symbol: alternatives(r.symbol), img: img ? img.hash : null },
        sig: 'an' + i, tags: [],
      };
      if (ask === 'nht') {
        const T = nhtSettings(JSON.parse(JSON.stringify(r.nht)));
        q.an.nht = T;
        q.an.opts = opts;
        q.text = `${many ? `Score ${k + 1}, box` : 'Box'} ${i + 1}: Non-harmonic tones`;
        q.hint = T.mode ? 'Name each circled note — or, for two circles joined by a line, the pair.'
          : 'Click each non-harmonic tone in the box to circle it, then name it. Join two circles for a suspension or an anticipation.';
      }
      if (ch.link || ch.linked) {
        // The chain's first box gives the numeral the others go on from.
        q.an.link = ch.link;
        q.an.linked = ch.linked;
        q.an.base = alternatives(ch.regs[ch.first].roman);
        if (ch.link) q.text += ` — goes on into box ${i + 2}`;
        if (ch.linked) {
          q.text = `${many ? `Score ${k + 1}, box` : 'Box'} ${i + 1}: Figures, going on from box ${i}`;
          q.hint = 'The same chord as the box before, its figures changing: type the figures, such as 53 or 7.';
        }
      }
      return q;
    });
  }
  // One answer box: r (Roman numeral) or s (chord symbol).
  function markAnalysisPart(q, k, resp, cfg) {
    const got = resp && resp[k];
    if (!got || !String(got).trim()) return false;
    if (k === 'r' && (q.an.link || q.an.linked)) return stageRight(q, got);
    if (k === 'r') { const p = parseRoman(got); return !!p && q.an.roman.some((w) => sameRoman(parseRoman(w), p)); }
    return q.an.symbol.some((w) => MQ.gradeVoiceSymbol(w, String(got).trim(), cfg) === 1);
  }
  // A box of non-harmonic tones earns its share of what's right, less one for each extra circle or pair.
  function nhtCredit(c) { return !c.total ? (c.extra ? 0 : 1) : Math.max(0, c.right - c.extra) / c.total; }
  // A key change: where it is (when students find it) and the new key (when asked), each a share.
  const keyParts = (q) => (q.an.hide ? ['b'] : []).concat(q.an.askKey || !q.an.hide ? ['k'] : []);
  const keyPartRight = (q, p, resp) => (p === 'b' ? keyBoxRight(q.an.region, resp && resp.b, q.an.tol) : !!resp && resp.k != null && resp.k === keyIndex(q.an.key));
  function gradeAnalysis(q, resp, cfg) {
    if (q.an.ask === 'open') return resp && resp.k != null && resp.k === keyIndex(q.an.key) ? 1 : 0;
    if (q.an.ask === 'key') { const ps = keyParts(q); return ps.filter((p) => keyPartRight(q, p, resp)).length / ps.length; }
    if (q.an.ask === 'nht') return nhtCredit(compareNHT(q, resp));
    const parts = partsOf(q);
    return parts.filter((k) => markAnalysisPart(q, k, resp, cfg)).length / parts.length;
  }
  const hasAnalysisAnswer = (q, resp) => !!resp && (q.an.ask === 'open' ? resp.k != null : q.an.ask === 'key' ? keyParts(q).some((p) => (p === 'b' ? !!resp.b : resp.k != null)) : q.an.ask === 'nht'
    ? (resp.c || []).some((c) => c.t >= 0) || (resp.l || []).some((l) => l.t >= 0) || (!q.an.nht.mode && (resp.c || []).length > 0)
    : partsOf(q).some((k) => String(resp[k] || '').trim()));
  const romanAnswerText = (q) => q.an.roman.map((w) => (q.an.link || q.an.linked ? stageText(parseStage(w)) : romanText(parseRoman(w))) || w).join(' or ');
  const symbolAnswerText = (q) => q.an.symbol.map(symbolText).join(' or ');
  function describeAnalysis(q) {
    if (q.an.ask === 'open') return keyText(q.an.key);
    if (q.an.ask === 'key') return q.an.key && keyParts(q).includes('k') ? `${q.an.hide ? 'The boxed chord — ' : ''}${keyText(q.an.key)}` : 'The boxed chord';
    if (q.an.ask === 'nht') return nhtAnswerText(q.an.nht);
    return partsOf(q).map((k) => (k === 'r' ? romanAnswerText(q) : symbolAnswerText(q))).join(' · ');
  }

  // ---------- where the boxes go ----------
  // Systems are found from the picture: runs of rows with ink, split by white gaps.
  function findBands(profile, w, h) {
    const thr = Math.max(1, Math.round(w * 0.002));
    const minGap = Math.max(4, Math.round(h * 0.006));
    const bands = [];
    let start = -1, lastInk = -1;
    for (let y = 0; y < h; y++) {
      if (profile[y] > thr) {
        if (start < 0) start = y;
        else if (y - lastInk - 1 >= minGap) { bands.push({ y0: start, y1: lastInk + 1 }); start = y; }
        lastInk = y;
      }
    }
    if (start >= 0) bands.push({ y0: start, y1: lastInk + 1 });
    if (!bands.length) bands.push({ y0: 0, y1: h });
    return bands.map((b) => ({ y0: b.y0 / h, y1: b.y1 / h }));
  }
  function bandOf(r, bands) {
    const cy = r.y + r.h / 2;
    let best = 0, dist = Infinity;
    bands.forEach((b, i) => {
      const d = cy < b.y0 ? b.y0 - cy : cy > b.y1 ? cy - b.y1 : 0;
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  }
  // Reading order: system by system, left to right. Without systems, boxes that share a line do.
  function readingOrder(regions, bands) {
    if (bands && bands.length) {
      // System by system; inside one (or two systems the picture runs together), line by line.
      const by = new Map();
      regions.forEach((r) => { const k = bandOf(r, bands); if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
      return [].concat(...[...by.keys()].sort((a, b) => a - b).map((k) => readingOrder(by.get(k), null)));
    }
    const rows = [];
    regions.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2)).forEach((r) => {
      const cy = r.y + r.h / 2, row = rows[rows.length - 1];
      if (row && cy >= row.top && cy <= row.bottom) { row.items.push(r); row.top = Math.min(row.top, r.y); row.bottom = Math.max(row.bottom, r.y + r.h); }
      else rows.push({ top: r.y, bottom: r.y + r.h, items: [r] });
    });
    return [].concat(...rows.map((row) => row.items.sort((a, b) => a.x - b.x)));
  }
  // The student's sheet: the picture cut between systems, with a lane of chord-symbol boxes above
  // each system that has them and a lane of Roman numeral boxes below.
  function sheetPlan(qs, bands) {
    const cuts = [];
    const lanes = new Map();
    const laneAt = (y, kind, order) => {
      const key = y.toFixed(5) + kind;
      if (!lanes.has(key)) { lanes.set(key, { y, kind, order, items: [] }); cuts.push(lanes.get(key)); }
      return lanes.get(key);
    };
    qs.forEach((q, i) => {
      if ((q.an.ask === 'key' && q.an.hide) || q.an.ask === 'open') return;      // no place on the music to give away
      const bi = bandOf(q.an.region, bands), b = bands[bi];
      const above = bi === 0 ? 0 : (bands[bi - 1].y1 + b.y0) / 2;
      const below = bi === bands.length - 1 ? 1 : (b.y1 + bands[bi + 1].y0) / 2;
      const cx = q.an.region.x + q.an.region.w / 2;
      // Non-harmonic tones get a lane of their own under the system, after its Roman numerals.
      if (q.an.ask === 'nht' || q.an.ask === 'key') { laneAt(below, 'nht', 0.5).items.push({ i, cx }); return; }
      if (q.an.ask !== 'roman') laneAt(above, 'symbol', 1).items.push({ i, cx });
      if (q.an.ask !== 'symbol') laneAt(below, 'roman', 0).items.push({ i, cx });
    });
    // At a shared gap, the Roman numerals of the system above come before the symbols of the one below.
    cuts.sort((a, b) => a.y - b.y || a.order - b.order);
    const out = [];
    let y = 0;
    cuts.forEach((lane) => {
      if (lane.y > y + 1e-6) out.push({ kind: 'strip', y0: y, y1: lane.y });
      out.push({ kind: 'lane', lane: lane.kind, items: lane.items.sort((a, b) => a.cx - b.cx) });
      y = Math.max(y, lane.y);
    });
    if (y < 1 - 1e-6) out.push({ kind: 'strip', y0: y, y1: 1 });
    return out;
  }

  // ---------- the score picture ----------
  // Stored as [format 1][width:16][height:16] + raw-deflated rows of 1-bit pixels (1 = ink),
  // written in base64url so it can sit in a link.
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function toB64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
      if (i + 2 < bytes.length) s += B64[n & 63];
    }
    return s;
  }
  function fromB64url(str) {
    const s = String(str || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const out = new Uint8Array(Math.floor((s.length * 3) / 4));
    let o = 0;
    for (let i = 0; i < s.length; i += 4) {
      let n = 0;
      for (let j = 0; j < 4; j++) {
        const c = i + j < s.length ? B64.indexOf(s[i + j]) : 0;
        if (c < 0) throw new Error('bad picture data');
        n = (n << 6) | c;
      }
      out[o++] = (n >> 16) & 255;
      if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
      if (i + 3 < s.length) out[o++] = n & 255;
    }
    return out.slice(0, o);
  }
  function fnv32(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193) >>> 0;
    return h >>> 0;
  }
  const hashOfData = (data) => fnv32(fromB64url(data));
  async function streamBytes(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }

  // Picture detail: how wide the stored copy is. Ink: how dark a grey counts as ink.
  const DETAIL = [{ id: 0, label: 'Standard', w: 1400 }, { id: 1, label: 'High', w: 2000 }, { id: 2, label: 'Highest', w: 2800 }];
  const INK = [0.8, 0.87, 0.93];
  // Turns a picture into crisp black and white — a threshold that follows the page's own lighting,
  // so shadows and yellowed paper drop out — trims the empty margins and packs it. A wide empty band
  // inside the picture (the rest of a page between the music and a footer, say) shrinks to a margin
  // too, unless opts.gaps is false. opts.crop reuses an earlier trim (fractions of the upload, with the
  // bands taken out), so boxes already drawn stay on the same music.
  async function encodeScore(source, opts) {
    const o = Object.assign({ detail: 0, ink: 1, crop: null, gaps: true }, opts);
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    if (!sw || !sh) throw new Error('That picture is empty.');
    let W = Math.min(sw, DETAIL[o.detail].w);
    let H = Math.round((sh * W) / sw);
    const maxPx = 12e6;
    if (W * H > maxPx) { const k = Math.sqrt(maxPx / (W * H)); W = Math.round(W * k); H = Math.round(H * k); }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, W, H);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(source, 0, 0, W, H);
    const px = cx.getImageData(0, 0, W, H).data;
    const g = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = (px[4 * i] * 299 + px[4 * i + 1] * 587 + px[4 * i + 2] * 114) / 1000;
    const I = new Uint32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x < W; x++) { s += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; }
    }
    const rad = Math.max(8, Math.round(W / 40)), k = INK[o.ink];
    const ink = new Uint8Array(W * H);
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - rad), y1 = Math.min(H, y + rad + 1);
      for (let x = 0; x < W; x++) {
        const v = g[y * W + x];
        let on = v < 70;
        if (!on && v < 235) {
          const x0 = Math.max(0, x - rad), x1 = Math.min(W, x + rad + 1);
          const sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
          on = v < (sum / ((x1 - x0) * (y1 - y0))) * k;
        }
        if (on) {
          ink[y * W + x] = 1;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) throw new Error('No music showed up in that picture. Try one with darker printing, or choose Darker ink.');
    const pad = 12;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
    if (o.crop) {
      minX = Math.round(o.crop.x0 * W); minY = Math.round(o.crop.y0 * H);
      maxX = Math.min(W - 1, Math.round(o.crop.x1 * W) - 1); maxY = Math.min(H - 1, Math.round(o.crop.y1 * H) - 1);
    }
    // Empty bands wider than about a tenth of the page's width keep a margin of about a thirtieth.
    let cuts = o.crop ? o.crop.cuts || [] : [];
    if (!o.crop && o.gaps) {
      const big = Math.max(40, Math.round(W * 0.09)), keep = Math.max(16, Math.round(W * 0.035));
      let run = -1;
      for (let y = minY; y <= maxY + 1; y++) {
        let blank = y <= maxY;
        for (let x = minX; blank && x <= maxX; x++) if (ink[y * W + x]) blank = false;
        if (blank && run < 0) run = y;
        if (!blank && run >= 0) {
          if (y - run > big) cuts.push([(run + Math.floor(keep / 2)) / H, (y - Math.ceil(keep / 2)) / H]);
          run = -1;
        }
      }
    }
    const rows = [];
    const cutRows = cuts.map(([a, b]) => [Math.round(a * H), Math.round(b * H)]);
    for (let y = minY; y <= maxY; y++) if (!cutRows.some(([a, b]) => y >= a && y < b)) rows.push(y);
    const crop = { x0: minX / W, y0: minY / H, x1: (maxX + 1) / W, y1: (maxY + 1) / H, cuts };
    const w = maxX - minX + 1, h = rows.length, rowBytes = Math.ceil(w / 8);
    const bits = new Uint8Array(rowBytes * h);
    for (let y = 0; y < h; y++) {
      const sy = rows[y];
      for (let x = 0; x < w; x++) if (ink[sy * W + x + minX]) bits[y * rowBytes + (x >> 3)] |= 128 >> (x & 7);
    }
    const z = await streamBytes(bits, new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(5 + z.length);
    bytes.set([1, w >> 8, w & 255, h >> 8, h & 255]);
    bytes.set(z, 5);
    return Object.assign(scoreFrom(bits, w, h), { data: toB64url(bytes), hash: fnv32(bytes), crop });
  }
  function scoreFrom(bits, w, h) {
    const rowBytes = Math.ceil(w / 8);
    const profile = new Uint32Array(h);
    for (let y = 0; y < h; y++) {
      let n = 0;
      for (let b = 0; b < rowBytes; b++) { let v = bits[y * rowBytes + b]; while (v) { n += v & 1; v >>= 1; } }
      profile[y] = n;
    }
    return { w, h, bits, profile, bands: findBands(profile, w, h) };
  }
  async function decodeScore(data) {
    const bytes = fromB64url(data);
    if (bytes.length < 6 || bytes[0] !== 1) throw new Error('This picture was made by a newer version of Clefwork.');
    const w = (bytes[1] << 8) | bytes[2], h = (bytes[3] << 8) | bytes[4];
    const bits = await streamBytes(bytes.slice(5), new DecompressionStream('deflate-raw'));
    if (bits.length < Math.ceil(w / 8) * h) throw new Error('The picture in this link is incomplete.');
    return Object.assign(scoreFrom(bits, w, h), { data, hash: fnv32(bytes) });
  }
  // A PNG of the black-and-white score, dark ink on white paper, as an object URL.
  function scoreURL(score) {
    const { w, h, bits } = score, rowBytes = Math.ceil(w / 8);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = 4 * (y * w + x);
        const on = bits[y * rowBytes + (x >> 3)] & (128 >> (x & 7));
        d[i] = on ? 20 : 255; d[i + 1] = on ? 24 : 255; d[i + 2] = on ? 38 : 255; d[i + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return new Promise((resolve) => cv.toBlob((b) => resolve(URL.createObjectURL(b)), 'image/png'));
  }

  Object.assign(MQ, {
    ANALYSIS_ASKS: ASKS, ANALYSIS_MAX: MAX_REGIONS, ANALYSIS_SCORES: MAX_SCORES, SCORE_DETAIL: DETAIL,
    NHT_TYPES, NHT_PAIRS, nhtIndex, pairIndex, nhtOk, pairOk, nhtSettings, compareNHT, nhtCredit, nhtAnswerText, nhtShort, pairShort, analysisInPair: inPair,
    parseStage, stageText, figTokens, analysisChains: chainsOf, analysisLinkProblems: linkProblems,
    analysisOpenSettings: openSettings, analysisOpenAsked: openAsked, ANALYSIS_KEY_TOLS: KEY_TOLS, ANALYSIS_KEYS: KEYS30, analysisKeyIndex: keyIndex, analysisKeyText: keyText, analysisKeySettings: keySettings, analysisKeyAsked: keyAsked, keyBoxRight, analysisKeyParts: keyParts, analysisKeyPartRight: keyPartRight,
    analysisSettings, analysisScores: scoresOf, analysisRegionCount: regionCount, alternatives, parseAnalysisRoman: parseRoman, sameRoman, romanParts, romanText, symbolOk, symbolText,
    askFor, missingAnswers, analysisQuestions, markAnalysisPart, gradeAnalysis, hasAnalysisAnswer, describeAnalysis,
    romanAnswerText, symbolAnswerText, analysisParts: partsOf,
    findBands, bandOf, readingOrder, sheetPlan, encodeScore, decodeScore, scoreURL, hashOfData,
  });
})(typeof window !== 'undefined' ? window : globalThis);
