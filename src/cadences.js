/* Clefwork Harmony — Cadences & Modulations. Each question is a progression of up to eight chords in
   half notes that ends with a cadence, or modulates to a new key. The teacher writes the progressions in
   Roman numerals (C: I IV vi=G:ii V7 I), or Clefwork makes them, following Kostka & Payne, Tonal Harmony:
     Cadences (ch. 10)  perfect authentic V–I, both in root position, the tonic in the soprano; imperfect
                        authentic (another soprano note, an inverted V, or vii°–I); half (ends on V);
                        Phrygian half (iv6–V in minor); plagal (IV–I); deceptive (V–vi).
     Modulations (ch. 18–19)  common-chord (a pivot chord diatonic in both keys, most often a predominant
                        in the new key); phrase (the new key starts with the next phrase); sequential (a
                        pattern repeated in the new key); common-tone (one note held across keys a third
                        apart).
   Chords are voiced on one staff (close position) or the grand staff — four-part chorale style, or the root
   in the bass under a three-note block — with the textbook's voice leading: no parallel 5ths or octaves,
   the leading tone and chordal 7ths resolved, smooth inner voices. Large chords may take extra inner notes.
   Students write the chords on the staff, name the cadence or modulation, or both; Roman numerals and
   chord symbols are printed, asked for, or left out. Printed music can carry passing and neighbour tones
   in quarter notes. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const { dia, midi, fromDia, pcName, fullName } = MQ;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const CAD_MAX = 20;        // questions in a quiz
  const CAD_CHORDS = 8;      // chords in a progression (four measures of half notes)
  const CAD_EX_MAX = 12;     // progressions the teacher writes
  const CADENCES = [
    { id: 'pac', label: 'Perfect authentic cadence (PAC)', short: 'PAC', blurb: 'V(7)–I, both in root position, with the tonic in the soprano.' },
    { id: 'iac', label: 'Imperfect authentic cadence (IAC)', short: 'IAC', blurb: 'V(7)–I with the 3rd or 5th in the soprano, or with an inverted V or vii°.' },
    { id: 'hc', label: 'Half cadence (HC)', short: 'HC', blurb: 'A phrase that ends on V.' },
    { id: 'phc', label: 'Phrygian half cadence', short: 'Phrygian HC', blurb: 'iv6–V in a minor key.' },
    { id: 'plagal', label: 'Plagal cadence', short: 'Plagal', blurb: 'IV–I, often after an authentic cadence.' },
    { id: 'dc', label: 'Deceptive cadence', short: 'Deceptive', blurb: 'V(7) moves to vi (VI in minor) instead of I.' },
  ];
  const MODULATIONS = [
    { id: 'common', label: 'Common-chord (pivot) modulation', short: 'Common-chord', blurb: 'A chord that belongs to both keys links them — most often a predominant in the new key.' },
    { id: 'phrase', label: 'Phrase (direct) modulation', short: 'Phrase', blurb: 'One phrase ends with a cadence in the old key and the next starts in the new key.' },
    { id: 'seq', label: 'Sequential modulation', short: 'Sequential', blurb: 'A short pattern is repeated at another pitch level, in the new key.' },
    { id: 'ct', label: 'Common-tone modulation', short: 'Common-tone', blurb: 'One note, held in the soprano, links keys a third apart.' },
  ];
  // One bit each in the settings' `kinds`: the six cadences, then the four modulations.
  const KINDS = CADENCES.concat(MODULATIONS);
  const isMod = (id) => MODULATIONS.some((m) => m.id === id);

  const pcOf = (p) => ({ step: p.step, alt: p.alt });
  const pcText = (p) => pcName({ step: p.step, oct: 4, alt: p.alt });
  const pcEq = (a, b) => !!a && !!b && a.step === b.step && a.alt === b.alt;
  const pcNum = (p) => (((midi({ step: p.step, oct: 4, alt: p.alt })) % 12) + 12) % 12;
  const keyOf = (mode, f) => MQ.makeKey(mode, f, null, 'harmonic');
  const keyText = (kd) => `${pcText(kd.tonic)} ${kd.mode}`;
  const keyShort = (kd) => (kd.mode === 'minor' ? pcText(kd.tonic).toLowerCase() : pcText(kd.tonic)) + ':';
  const sameKey = (a, b) => !!a && !!b && a.mode === b.mode && a.fifths === b.fifths;
  // The key with this tonic, if it has seven sharps or flats at most.
  function keyOn(pc, mode) {
    const names = mode === 'minor' ? MQ.MINOR_KEYS : MQ.MAJOR_KEYS;
    const i = names.indexOf(pcText(pc));
    return i < 0 ? null : keyOf(mode, i - 7);
  }

  // ---------- settings ----------
  // src: 0 Clefwork makes the progressions, 1 the teacher writes them (ex).
  // kinds: which cadences and modulations Clefwork makes (bits, in the order of KINDS).
  // size: 0 triads, 1 some sevenths (V7, ii7, vii°7), 2 full — sevenths on more chords and V9.
  // fill: large chords get every note, in extra inner voices. staff: 0 treble, 1 bass, 2 grand staff.
  // style (grand staff): 0 four-part chorale, 1 the root in the bass under a three-note block.
  // stems (one staff): 0 one stem a chord, 1 top note up and the others down.
  // keyMode 1 major, 2 minor, 3 both; keyMax: sharps or flats; len: chords in each progression.
  // ask: 1 students write the chords, 2 they name the cadence or modulation, 3 a mix — about half the
  // questions each, 4 both in every question (each question asks them to write the chords and name it).
  // rn, sym: Roman numerals and chord symbols — 0 printed, 1 students write them, 2 left out.
  // nht: printed music may have passing and neighbour tones, in quarter notes.
  // ex: the teacher's progressions — {text, cad (0 auto, else 1 + a cadence), mod (0 auto, 1 none, else 2 + a modulation)}.
  function cadSettings(c) {
    const b = c || {};
    b.gen = 1;
    b.src = b.src ? 1 : 0;
    b.kinds = b.kinds == null ? 0b0000111111 : (+b.kinds & 0x3ff) || 1;
    b.size = [0, 1, 2].includes(+b.size) ? +b.size : 1;
    b.fill = b.fill ? 1 : 0;
    b.staff = [0, 1, 2].includes(+b.staff) ? +b.staff : 2;
    b.style = b.style ? 1 : 0;
    b.stems = b.stems ? 1 : 0;
    b.keyMode = [1, 2, 3].includes(+b.keyMode) ? +b.keyMode : 1;
    b.keyMax = clamp(b.keyMax == null ? 3 : Math.round(+b.keyMax) || 0, 0, 7);
    b.len = clamp(b.len == null ? 6 : Math.round(+b.len) || 6, 4, CAD_CHORDS);
    b.ask = [1, 2, 3, 4].includes(+b.ask) ? +b.ask : 2;
    b.rn = [0, 1, 2].includes(+b.rn) ? +b.rn : 0;
    b.sym = [0, 1, 2].includes(+b.sym) ? +b.sym : 2;
    b.nht = b.nht ? 1 : 0;
    // Each progression is tidied where it is, never copied: the builder keeps editing these objects.
    b.ex = (Array.isArray(b.ex) ? b.ex : []).filter((e) => e && typeof e === 'object').slice(0, CAD_EX_MAX);
    b.ex.forEach((e) => {
      e.text = String(e.text || '');
      e.cad = clamp(Math.round(+e.cad) || 0, 0, CADENCES.length);
      e.mod = clamp(Math.round(+e.mod) || 0, 0, MODULATIONS.length + 1);
    });
    return b;
  }
  // What students do, with the one fix the choices need: writing the chords needs a printed name to go by.
  function cadTasks(b) {
    const write = b.ask === 1 || b.ask === 3 || b.ask === 4, ident = b.ask === 2 || b.ask === 3 || b.ask === 4;
    let rn = b.rn, sym = b.sym;
    if (write && rn !== 0 && sym !== 0) rn = 0;
    return { write, ident, rn, sym, fixed: rn !== b.rn };
  }

  // ---------- Roman numerals ----------
  const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const RN_RE = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/;
  const FIGS = { '': '', 5: '', 53: '', 6: '6', 63: '6', 64: '64', 7: '7', 65: '65', 43: '43', 42: '42', 2: '42', 9: '9' };
  const tidy = (t) => String(t || '').trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[º˚]/g, '°')
    .replace(/Ø/g, 'ø').replace(/\/o/g, 'ø').replace(/\s+/g, '');
  // "V65", "vii°7", "iiø6/5", "IVma7", "V9" → {shift, deg, low, mark, maj7, fig}
  function readNumeral(text) {
    const m = tidy(text).match(RN_RE);
    if (!m) return null;
    let rest = m[3], mark = '', maj7 = false;
    const mk = rest.match(/^(°|ø|dim|o|\+|aug)/);
    if (mk) { mark = /ø/.test(mk[0]) ? 'ø' : /\+|aug/.test(mk[0]) ? '+' : '°'; rest = rest.slice(mk[0].length); }
    const mj = rest.match(/^(maj|ma|M|Δ)/);
    if (mj) { maj7 = true; rest = rest.slice(mj[0].length) || '7'; }
    rest = rest.replace(/\//g, '');
    if (!(rest in FIGS)) return null;
    const fig = FIGS[rest];
    if (maj7 && !['7', '65', '43', '42', '9'].includes(fig)) return null;
    return { shift: m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0, deg: NUMERALS.indexOf(m[2].toUpperCase()), low: m[2] !== m[2].toUpperCase(), mark, maj7, fig };
  }
  // A numeral, and the chord it is applied to (V7/V): {main, of}.
  function readRN(text) {
    const s = tidy(text);
    if (!s) return null;
    const ap = s.match(/^(.+)\/([b#]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))$/);
    const main = readNumeral(ap ? ap[1] : s), of = ap ? readNumeral(ap[2]) : null;
    if (!main || (ap && (!of || of.fig))) return null;
    return { main, of };
  }
  const sameNumeral = (a, b) => !!a && !!b && a.deg === b.deg && a.shift === b.shift && a.low === b.low && a.mark === b.mark && a.fig === b.fig;
  const sameRN = (a, b) => !!a && !!b && sameNumeral(a.main, b.main) && (!a.of === !b.of) && (!a.of || sameNumeral(a.of, b.of));
  // How a numeral is printed: ♭ and ♯ signs, ° and ø.
  const prettyRN = (t) => tidy(t).replace(/^b(?=[IViv])/, '♭').replace(/^#(?=[IViv])/, '♯').replace(/\/b(?=[IViv])/, '/♭')
    .replace(/\/#(?=[IViv])/, '/♯').replace(/(^|[IViv])o(?=\d|$|\/)/g, '$1°').replace(/dim/g, '°');

  const SEVENTHS = ['dom7', 'maj7', 'min7', 'hdim7', 'dim7'];
  const NINTHS = ['dom9', 'maj9', 'min9'];
  const DIM = ['dim', 'hdim7', 'dim7'];
  // The chord on a scale degree (0–6) of a key — triad, seventh or ninth (V9 only; others take a 7th).
  // In minor: i, ii°, III, iv, V, VI and vii° on the raised leading tone.
  function chordOn(kd, deg, size) {
    const seventh = size >= 1;
    if (kd.mode === 'minor' && deg === 6) {
      const base = MQ.keyPitch(kd, 6);
      return { root: { step: base.step, alt: base.alt + 1 }, q: seventh ? 'dim7' : 'dim' };
    }
    const ch = MQ.diatonicChord(kd, deg + 1, seventh);
    if (size === 2 && deg === 4 && kd.mode === 'major') ch.q = 'dom9';
    return ch;
  }
  // The chord a numeral names in a key: {root, q, inv, deg, of, key} — or null.
  function chordFrom(text, kd) {
    const r = readRN(text);
    if (!r) return null;
    let key = kd;
    if (r.of) {
      const t = r.of;
      const base = MQ.keyPitch(kd, t.deg);
      let alt = base.alt + t.shift;
      if (!t.shift && kd.mode === 'minor' && t.deg === 6 && t.mark) alt += 1;
      key = keyOn({ step: base.step, alt }, t.low ? 'minor' : 'major');
      if (!key) return null;
    }
    const n = r.main;
    const base = MQ.keyPitch(key, n.deg);
    let alt = base.alt + n.shift;
    if (!n.shift && key.mode === 'minor' && n.deg === 6 && (n.mark === '°' || n.mark === 'ø')) alt += 1;
    const root = { step: base.step, alt };
    const triad = n.low ? (n.mark ? 'dim' : 'min') : n.mark === '+' ? 'aug' : 'maj';
    const seventh = ['7', '65', '43', '42'].includes(n.fig);
    let q = triad;
    if (n.fig === '9') q = n.low ? 'min9' : n.maj7 ? 'maj9' : 'dom9';
    else if (seventh) {
      if (n.mark === 'ø') q = 'hdim7';
      else if (n.mark === '°') q = 'dim7';
      else if (n.maj7) q = 'maj7';
      else {
        const dc = chordOn(key, n.deg, 1), dt = chordOn(key, n.deg, 0);
        q = pcEq(dc.root, root) && dt.q === triad ? dc.q : triad === 'maj' ? 'dom7' : triad === 'min' ? 'min7' : 'hdim7';
      }
    }
    const inv = { '': 0, 6: 1, 64: 2, 7: 0, 65: 1, 43: 2, 42: 3, 9: 0 }[n.fig];
    const ch = { root, q, inv, deg: n.deg, of: !!r.of, text: prettyRN(text) };
    if (tonesOf(ch).some((t) => Math.abs(t.p.alt) > 2)) return null;
    return ch;
  }
  // A chord's tones: [{d: 1 | 3 | 5 | 7 | 9, p}], root first.
  function tonesOf(ch) {
    const qd = MQ.QUALITIES.find((x) => x.id === ch.q) || MQ.QUALITIES[0];
    const r = { step: ch.root.step, oct: 4, alt: ch.root.alt };
    return [{ d: 1, p: pcOf(ch.root) }].concat(qd.tones.map(([n, s]) => ({ d: n, p: pcOf(MQ.transpose(r, n, s, 1)) })));
  }
  const bassOf = (ch) => tonesOf(ch)[ch.inv || 0].p;
  const symbolOf = (ch) => MQ.symbolOf(Object.assign({ root: ch.root, q: ch.q }, ch.inv ? { bass: bassOf(ch) } : {}));

  // ---------- reading a teacher's progression ----------
  // "C: I IV ii6 V7 I", "a: i iv6 V", "C: I vi=G:ii V7 I" (a pivot: vi in C, ii in G), "C: I V I G: I IV V I".
  // A key is a letter and a colon (lower case for minor). Returns {chords, keys, errors}.
  const KEY_RE = /^([A-Ga-g])([#b♯♭]?):$/;
  function keyToken(t) {
    const m = String(t).match(KEY_RE);
    if (!m) return null;
    const pc = { step: 'CDEFGAB'.indexOf(m[1].toUpperCase()), alt: /[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0 };
    return keyOn(pc, m[1] === m[1].toUpperCase() ? 'major' : 'minor');
  }
  function parseCadText(text) {
    const raw = String(text || '').replace(/(^|\s)([A-Ga-g][#b♯♭]?:)(?=\S)/g, '$1$2 ').split(/[\s,|]+/).filter(Boolean);
    const keys = [], chords = [], errors = [];
    let kd = null, pendingKey = null;
    raw.forEach((t) => {
      if (/:$/.test(t)) {
        const k = keyToken(t);
        if (!k) { errors.push(t); return; }
        if (!kd) { kd = k; keys.push(k); } else pendingKey = k;
        return;
      }
      if (!kd) { kd = keyOf('major', 0); keys.push(kd); }
      if (t.includes('=')) {
        // A pivot chord: its numeral in this key, then in the next one.
        const [a, b0] = t.split('=');
        let b = b0 || '';
        const km = b.match(/^([A-Ga-g][#b♯♭]?:)(.*)$/);
        let next = pendingKey;
        if (km) { next = keyToken(km[1]); b = km[2]; }
        const ca = chordFrom(a, kd), cb = next ? chordFrom(b, next) : null;
        if (!ca || !cb || !next || !pcEq(ca.root, cb.root) || ca.q !== cb.q) { errors.push(t); return; }
        keys.push(next);
        chords.push(Object.assign(ca, { k: keys.length - 2, pivot: Object.assign(cb, { k: keys.length - 1 }) }));
        kd = next; pendingKey = null;
        return;
      }
      if (pendingKey) { keys.push(pendingKey); kd = pendingKey; pendingKey = null; }
      const ch = chordFrom(t, kd);
      if (!ch) { errors.push(t); return; }
      chords.push(Object.assign(ch, { k: keys.length - 1 }));
    });
    if (pendingKey) errors.push(keyShort(pendingKey));
    return { chords, keys, errors };
  }
  // The cadence a progression ends with, read from its last two chords (null when it isn't one).
  function cadenceOf(chords, keys) {
    const n = chords.length;
    if (n < 2) return null;
    const a = chords[n - 2], b = chords[n - 1], kd = keys[b.k];
    if (b.of) return null;
    // A half cadence may come from any chord (V/V–V too); the others need a chord of the key before.
    if (b.deg === 4 && !b.inv && b.q === 'maj') return kd.mode === 'minor' && !a.of && a.deg === 3 && a.inv === 1 && a.q === 'min' ? 'phc' : 'hc';
    if (a.of) return null;
    const isV = (c) => c.deg === 4 && ['maj', 'dom7', 'dom9'].includes(c.q);
    const isVii = (c) => c.deg === 6 && DIM.includes(c.q);
    if (b.deg === 0 && !b.inv && b.q === (kd.mode === 'minor' ? 'min' : 'maj')) {
      if (isV(a)) return a.inv ? 'iac' : 'pac';
      if (isVii(a)) return 'iac';
      if (a.deg === 3 && !a.inv && SEVENTHS.concat(['maj', 'min']).includes(a.q)) return 'plagal';
      return null;
    }
    if (b.deg === 5 && isV(a) && !a.inv) return 'dc';
    return null;
  }
  // How a progression with two keys modulates.
  function modulationOf(chords, keys) {
    if (keys.length < 2) return null;
    if (chords.some((c) => c.pivot)) return 'common';
    const at = chords.findIndex((c) => c.k === 1);
    if (at < 1) return null;
    const before = chords.slice(0, at), after = chords.slice(at);
    // The same degrees and positions, whatever the mode (I V65 I, then i V65 i).
    const pat = (list) => list.map((c) => `${c.deg}.${c.inv}.${SEVENTHS.includes(c.q) ? 7 : NINTHS.includes(c.q) ? 9 : 5}`);
    // Keys a third apart that aren't closely related, joined by a note their tonic triads share.
    const t1 = tonesOf(chordOn(keys[0], 0, 0)).map((t) => pcNum(t.p)), t2 = tonesOf(chordOn(keys[1], 0, 0)).map((t) => pcNum(t.p));
    const third = [3, 4, 8, 9].includes((pcNum(keys[1].tonic) - pcNum(keys[0].tonic) + 12) % 12);
    if (third && t1.filter((x) => t2.includes(x)).length === 1 && !closeKeys(keys[0]).some((x) => sameKey(x, keys[1]))) return 'ct';
    const k = Math.min(before.length, after.length);
    if (k >= 2 && pat(before.slice(-k)).join() === pat(after.slice(0, k)).join()) return 'seq';
    return 'phrase';
  }
  // A written progression's problems, for the builder.
  function cadExerciseProblems(e) {
    const p = parseCadText(e.text);
    const out = { chords: p.chords, keys: p.keys, bad: p.errors, empty: !p.chords.length, tooMany: p.chords.length > CAD_CHORDS, keysOver: p.keys.length > 2 };
    out.cad = e.cad ? CADENCES[e.cad - 1].id : cadenceOf(p.chords, p.keys);
    out.mod = e.mod === 1 ? null : e.mod > 1 ? MODULATIONS[e.mod - 2].id : modulationOf(p.chords, p.keys);
    if (e.mod > 1 && p.keys.length < 2) out.noKey = true;
    out.unknown = !out.cad && !out.mod;
    return out;
  }
  const cadExerciseOk = (e) => { const p = cadExerciseProblems(e); return !p.empty && !p.bad.length && !p.tooMany && !p.keysOver && !p.noKey; };
  const usableCadExercises = (b) => cadSettings(b).ex.filter(cadExerciseOk);

  // ---------- keys ----------
  // The five closely related keys.
  function closeKeys(kd) {
    const f = kd.fifths;
    const list = kd.mode === 'major'
      ? [['major', f + 1], ['major', f - 1], ['minor', f], ['minor', f - 1], ['minor', f + 1]]
      : [['major', f], ['minor', f + 1], ['minor', f - 1], ['major', f - 1], ['major', f + 1]];
    return list.filter(([, x]) => Math.abs(x) <= 7).map(([m, x]) => keyOf(m, x));
  }
  // Major keys whose tonic is a 3rd from this one's and whose tonic triads share one note.
  function mediantKeys(kd) {
    return [4, -3, -4, 3].map((d) => kd.fifths + d).filter((f) => Math.abs(f) <= 7).map((f) => keyOf('major', f));
  }
  // The keys a student chooses the new key from: the closely related ones, the parallel key and, for a
  // common-tone modulation, keys a third away; always including the answer.
  function newKeyOptions(from, to) {
    const list = closeKeys(from);
    const pf = from.fifths + (from.mode === 'major' ? -3 : 3);
    if (Math.abs(pf) <= 7) list.push(keyOf(from.mode === 'major' ? 'minor' : 'major', pf));
    if (!list.some((k) => sameKey(k, to))) mediantKeys(from).forEach((k) => list.push(k));
    if (!list.some((k) => sameKey(k, to))) list.push(to);
    const seen = new Set();
    return list.filter((k) => { const s = k.mode + k.fifths; if (seen.has(s)) return false; seen.add(s); return true; })
      .sort((a, b) => (a.mode === b.mode ? a.fifths - b.fifths : a.mode === 'major' ? -1 : 1));
  }
  function pickKey(rng, b, mode) {
    const m = mode || (b.keyMode === 2 ? 'minor' : b.keyMode === 3 ? (rng() < 0.5 ? 'major' : 'minor') : 'major');
    const all = [];
    for (let f = -b.keyMax; f <= b.keyMax; f++) all.push(f);
    const f = MQ.pickSpelled(rng, all, (x) => (m === 'minor' ? MQ.MINOR_KEYS : MQ.MAJOR_KEYS)[x + 7]);
    return keyOf(m, f);
  }
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  // Prefer a key within the teacher's key signatures.
  const within = (rng, list, b) => { const ok = list.filter((k) => Math.abs(k.fifths) <= b.keyMax); return pick(rng, ok.length ? ok : list); };

  // ---------- making progressions ----------
  // Templates are written as in a major key; minorize() turns them into the minor key's numerals.
  const MINOR_OF = { I: 'i', ii: 'ii°', iii: 'III', IV: 'iv', V: 'V', vi: 'VI', 'vii°': 'vii°' };
  const splitTok = (t) => { const m = t.match(/^(vii°|iii|ii|IV|vi|V|I)(.*)$/); return { num: m[1], fig: m[2] }; };
  const minorize = (tok) => {
    const { num, fig } = splitTok(tok);
    // ii7 in minor is half-diminished (iiø7); V9 is a major key's chord, so minor keeps V7.
    if (num === 'ii' && ['7', '65', '43', '42'].includes(fig)) return 'iiø' + fig;
    if (num === 'V' && fig === '9') return 'V7';
    return MINOR_OF[num] + fig;
  };
  const TONIC = {
    1: ['I'],
    2: ['I I6', 'I vi'],
    3: ['I V6 I', 'I V64 I6', 'I vii°6 I6', 'I IV I', 'I I6 vi'],
    4: ['I V6 I I6', 'I V6 I vi', 'I vii°6 I6 vi', 'I V64 I6 vi', 'I IV I I6'],
  };
  const PREDOM = { 1: ['IV', 'ii6', 'ii', 'IV6'], 2: ['vi ii6', 'vi IV', 'IV ii6', 'vi ii', 'I6 IV', 'I6 ii6'] };
  const DOM = ['V', 'I64 V'];
  // The chords at the end of each cadence (after the tonic opening and, when there is one, a predominant).
  function ending(rng, kind, minor, write) {
    switch (kind) {
      case 'pac': return { pd: true, end: pick(rng, DOM) + ' I', sop: 'tonic' };
      case 'iac': {
        // Writing the chords, a student could put the tonic on top of V–I: so it is an inverted V or vii°.
        const v = write ? ['V6 I', 'vii°6 I'] : ['V I', 'I64 V I', 'V6 I', 'vii°6 I'];
        const end = pick(rng, v);
        return { pd: true, end, sop: /^(I64 )?V I$/.test(end) ? 'notTonic' : null };
      }
      case 'hc': return { pd: true, end: pick(rng, ['V', 'I64 V']), sop: null };
      case 'phc': return { pd: rng() < 0.4, pdList: ['vi', 'I6'], end: 'IV6 V', sop: null };
      case 'plagal': return { pd: false, end: pick(rng, ['V I IV I', 'IV I', 'ii6 V I IV I']), sop: 'tonic' };
      case 'dc': return { pd: true, end: pick(rng, DOM) + ' vi', sop: null };
      default: return { pd: true, end: 'V I', sop: 'tonic' };
    }
  }
  const words = (s) => s.split(' ').filter(Boolean);
  // Tonic chords never take a 7th here.
  const TONIC_TOK = /^I(6|64)?$/;
  // A phrase of exactly `len` chords ending with this cadence (tokens in major-key spelling).
  function phrase(rng, kind, len, write) {
    let best = null;
    for (let k = 0; k < 120; k++) {
      const e = ending(rng, kind, false, write);
      const end = words(e.end);
      let pd = [];
      if (e.pd) {
        const room = len - end.length - 1;
        const n = room >= 3 && rng() < 0.5 ? 2 : room >= 1 ? 1 : 0;
        if (n) pd = words(pick(rng, e.pdList || PREDOM[n]));
      }
      const t = len - end.length - pd.length;
      if (t < 1 || t > 4) { if (!best || Math.abs(t) < best.gap) best = { gap: Math.abs(t), toks: ['I'].concat(pd, end).slice(-len), sop: e.sop }; continue; }
      let open = words(pick(rng, TONIC[t]));
      // A tonic opening that ends on vi doesn't lead into a predominant that starts on vi.
      if (pd[0] === 'vi' && open[open.length - 1] === 'vi') continue;
      if (end[0] === 'IV' && open[open.length - 1] === 'IV') continue;
      const toks = open.concat(pd, end);
      if (toks.some((x, i) => i && x === toks[i - 1])) continue;
      return { toks, sop: e.sop };
    }
    return best;
  }
  // Sevenths and ninths, as the teacher's chord size allows. `keep` marks chords left as triads.
  function addSevenths(rng, toks, size, minor, keep) {
    if (!size) return toks;
    return toks.map((tok, i) => {
      if (keep[i]) return tok;
      const { num, fig } = splitTok(tok);
      const r = rng();
      if (num === 'V' && (fig === '' || fig === '6' || fig === '64')) {
        if (size === 2 && !minor && fig === '' && r < 0.3) return 'V9';
        if (r < 0.7) return 'V' + { '': '7', 6: '65', 64: '43' }[fig];
      }
      // A 7th must have somewhere to fall: ii7 before V or the cadential 6/4 (not the leading tone in
      // the bass), IV7 before V, vi7 before ii.
      const next = toks[i + 1] || '';
      if (num === 'ii' && (fig === '' || fig === '6') && /^(V|I64)$/.test(next) && r < 0.45) return (minor ? 'iiø' : 'ii') + (fig ? '65' : '7');
      // vii°65 goes to I6: to a root-position I its 5th and 7th would make parallel 5ths with the bass.
      if (num === 'vii°' && fig === '6' && toks[i + 1] === 'I6' && r < 0.4) return (minor ? 'vii°' : 'viiø') + '65';
      if (size === 2 && num === 'IV' && fig === '' && next === 'V' && r < 0.35) return 'IV7';
      if (size === 2 && num === 'vi' && fig === '' && next === 'ii' && r < 0.3) return 'vi7';
      return tok;
    });
  }
  // Tokens in a key: the minor key's own numerals.
  const inKey = (toks, kd) => toks.map((t) => {
    if (kd.mode !== 'minor') return t;
    if (/^(iiø|viiø|vii°)/.test(t)) return t.replace(/^viiø/, 'vii°');
    if (/^(IV7|vi7)$/.test(t)) return { IV7: 'iv7', vi7: 'VI7' }[t];
    return minorize(t);
  });
  // A whole cadence question's chords: {chords, keys, kind, mod, sop (per chord), hold, fermatas}.
  function makeCadence(rng, b, kind, write) {
    const minor = kind === 'phc' ? true : null;
    const kd = pickKey(rng, b, minor ? 'minor' : null);
    let ph = phrase(rng, kind, b.len, write);
    // A half cadence in minor whose predominant is iv6 would be a Phrygian one: try another.
    for (let k = 0; k < 20 && kind === 'hc' && kd.mode === 'minor' && /^IV6$/.test(ph.toks[ph.toks.length - 2]); k++) ph = phrase(rng, kind, b.len, write);
    const keep = ph.toks.map((t, i) => i === ph.toks.length - 1 || TONIC_TOK.test(t)
      || (kind === 'phc' && i >= ph.toks.length - 2) || (kind === 'plagal' && i >= ph.toks.length - 2));
    const toks = inKey(addSevenths(rng, ph.toks, b.size, kd.mode === 'minor', keep), kd);
    const chords = toks.map((t) => Object.assign(chordFrom(t, kd), { k: 0 }));
    const sop = chords.map((_, i) => (i === chords.length - 1 ? ph.sop : null));
    return { chords, keys: [kd], kind, mod: null, sop, hold: [], fermatas: [chords.length - 1] };
  }
  // A pivot chord: diatonic in both keys (not vii°), a predominant in the new key when it can be.
  function pivotOf(rng, from, to) {
    const out = [];
    [0, 1, 2, 3, 5].forEach((d1) => {
      const a = chordOn(from, d1, 0);
      [1, 3, 5, 0].forEach((d2) => {
        const b = chordOn(to, d2, 0);
        if (pcEq(a.root, b.root) && a.q === b.q && !DIM.includes(a.q)) out.push({ d1, d2, pre: d2 !== 0 });
      });
    });
    const best = out.filter((x) => x.pre && x.d1), good = best.length ? best : out.filter((x) => x.pre);
    const list = good.length ? good : out;
    return list.length ? pick(rng, list) : null;
  }
  const numOf = (kd, deg) => {
    const ch = chordOn(kd, deg, 0);
    return MQ.romanOf(ch, kd);
  };
  function makeModulation(rng, b, kind, write) {
    const len = Math.max(b.len, kind === 'common' ? 4 : kind === 'seq' ? 6 : kind === 'phrase' ? 6 : 6);
    const from = kind === 'ct' ? pickKey(rng, b, 'major') : pickKey(rng, b);
    const sz = (toks, kd, keep) => inKey(addSevenths(rng, toks, b.size, kd.mode === 'minor', keep || toks.map((t, i) => i === toks.length - 1 || TONIC_TOK.test(t))), kd);
    const mk = (toks, kd, k) => toks.map((t) => Object.assign(chordFrom(t, kd), { k }));
    if (kind === 'common') {
      let to = null, pv = null;
      for (let k = 0; k < 20 && !pv; k++) { to = within(rng, closeKeys(from), b); pv = pivotOf(rng, from, to); }
      if (!pv) return makeCadence(rng, b, 'pac', write);
      const after = [];
      if (pv.d2 === 5) after.push(pick(rng, ['ii6', 'IV']));
      const dom = len - 1 - after.length - 1 >= 3 && rng() < 0.4 ? ['I64', 'V'] : ['V'];
      const post = after.concat(dom, ['I']);
      const t = clamp(len - 1 - post.length, 1, 4);
      let open = words(pick(rng, TONIC[t]));
      if (open[open.length - 1] === 'vi' && pv.d1 === 5) open = words('I I6 I'.split(' ').slice(0, t).join(' ') || 'I');
      const c1 = mk(sz(open, from), from, 0);
      const p1 = chordOn(from, pv.d1, 0), p2 = chordOn(to, pv.d2, 0);
      const pivot = Object.assign({ root: p1.root, q: p1.q, inv: 0, deg: pv.d1, of: false, text: numOf(from, pv.d1), k: 0 },
        { pivot: { root: p2.root, q: p2.q, inv: 0, deg: pv.d2, of: false, text: numOf(to, pv.d2), k: 1 } });
      const c2 = mk(sz(post, to, post.map((x, i) => i === post.length - 1 || x === 'I64')), to, 1);
      const chords = c1.concat([pivot], c2);
      return { chords, keys: [from, to], kind: 'pac', mod: 'common', sop: chords.map((_, i) => (i === chords.length - 1 ? 'tonic' : null)), hold: [], fermatas: [chords.length - 1] };
    }
    if (kind === 'seq') {
      const to = within(rng, closeKeys(from), b);
      const half = clamp(Math.floor(len / 2), 3, 4);
      const SEG = { 3: ['I V6 I', 'I V I', 'I vii°6 I'], 4: ['I IV V I', 'I ii6 V I', 'I I6 V I', 'I IV V7 I'] };
      const seg = words(pick(rng, SEG[half]));
      const keep = seg.map((t, i) => i === seg.length - 1 || TONIC_TOK.test(t));
      // One set of sevenths for both, so the second half repeats the first.
      const seg7 = addSevenths(rng, seg, b.size, false, keep).map((t) => (t === 'V9' ? 'V7' : t));
      const lead = len - 2 * half > 0 && seg[0] !== 'I' ? ['I'] : [];
      const c1 = mk(inKey(lead.concat(seg7), from), from, 0), c2 = mk(inKey(seg7, to), to, 1);
      const chords = c1.concat(c2);
      return { chords, keys: [from, to], kind: 'pac', mod: 'seq', sop: chords.map((_, i) => (i === chords.length - 1 ? 'tonic' : null)), hold: [], fermatas: [chords.length - 1] };
    }
    if (kind === 'phrase') {
      const to = within(rng, closeKeys(from), b);
      const a = Math.floor(len / 2), bl = len - a;
      // A three-chord first phrase ends on V, so the two phrases differ (I V I twice would be a sequence).
      const p1 = phrase(rng, a > 3 && rng() < 0.5 ? 'pac' : 'hc', a, write);
      // The second phrase isn't the first one again (that would be a sequence).
      let p2 = phrase(rng, 'pac', bl, write);
      for (let k = 0; k < 20 && p2.toks.join() === p1.toks.slice(-bl).join(); k++) p2 = phrase(rng, 'pac', bl, write);
      const c1 = mk(sz(p1.toks, from), from, 0), c2 = mk(sz(p2.toks, to), to, 1);
      const chords = c1.concat(c2);
      const sop = chords.map((_, i) => (i === c1.length - 1 ? p1.sop : i === chords.length - 1 ? 'tonic' : null));
      return { chords, keys: [from, to], kind: 'pac', mod: 'phrase', sop, hold: [], fermatas: [c1.length - 1, chords.length - 1] };
    }
    // Common-tone: the old key's tonic, then the new key's, a note held in the soprano between them.
    const meds = mediantKeys(from), near = meds.filter((k) => Math.abs(k.fifths) <= Math.max(b.keyMax, 4));
    const to = pick(rng, near.length ? near : meds.sort((x, y) => Math.abs(x.fifths) - Math.abs(y.fifths)).slice(0, 1));
    const a = clamp(Math.floor(len / 2), 3, 4), bl = len - a;
    const open1 = a === 3 ? pick(rng, ['I V I', 'I V6 I', 'I IV I']) : pick(rng, ['I IV V I', 'I ii6 V I', 'I I6 V I']);
    let p2 = phrase(rng, 'pac', bl, write);
    for (let k = 0; k < 20 && p2.toks.join() === words(open1).slice(-bl).join(); k++) p2 = phrase(rng, 'pac', bl, write);
    const t1 = words(open1);
    const c1 = mk(sz(t1, from), from, 0), c2 = mk(sz(p2.toks, to), to, 1);
    const chords = c1.concat(c2);
    const common = tonesOf(c1[c1.length - 1]).find((x) => tonesOf(c2[0]).some((y) => pcEq(x.p, y.p)));
    const sop = chords.map((_, i) => (i === c1.length - 1 ? { pc: common ? common.p : null } : i === chords.length - 1 ? 'tonic' : null));
    return { chords, keys: [from, to], kind: 'pac', mod: 'ct', sop, hold: [c1.length], fermatas: [chords.length - 1] };
  }

  // ---------- voicing ----------
  // Ranges (MIDI): soprano C4–G5, alto G3–D5, an extra inner voice E3–C5, tenor C3–G4, bass E2–C4.
  const RANGE = { S: [60, 79], A: [55, 74], X: [52, 72], T: [48, 67], B: [40, 60] };
  function pitchesIn(p, lo, hi) {
    const out = [];
    for (let oct = 1; oct <= 7; oct++) {
      const n = { step: p.step, oct, alt: p.alt };
      const m = midi(n);
      if (m >= lo && m <= hi) out.push(Object.assign(n, { m }));
    }
    return out;
  }
  // What the voicing needs to know about a chord: its tones, which may not be doubled or left out,
  // its leading tone and 7th, and what the soprano must do.
  function vlInfo(ch, kd, fill) {
    const tones = tonesOf(ch);
    const has = (d) => tones.some((t) => t.d === d);
    const bassD = tones[ch.inv || 0].d;
    const lt = (() => {
      const ltPc = MQ.keyPitch(kd, 6);
      const want = { step: ltPc.step, alt: ltPc.alt + (kd.mode === 'minor' ? 1 : 0) };
      if (!ch.of && (ch.deg === 4 || ch.deg === 6)) { const t = tones.find((x) => pcEq(x.p, want)); if (t) return t.d; }
      if (['dom7', 'dom9'].includes(ch.q)) return 3;
      return null;
    })();
    const ninth = has(9), seventh = has(7);
    // A root-position seventh may leave out its 5th (doubling the root), and so may a ninth in four
    // voices — unless the teacher asks for every note.
    const optional = new Set();
    if (!fill && (ninth || (seventh && !ch.inv))) optional.add(5);
    const noDouble = new Set([7, 9].concat(lt ? [lt] : []));
    return { ch, tones, bassD, lt, optional, noDouble, tonic: pcOf(kd.tonic), seventh, ninth, six4: ch.inv === 2 && !seventh };
  }
  // Every voicing worth trying for one chord, each {notes (low to high, with roles), cost}.
  function chorale(info, sop, nv) {
    const { tones } = info;
    const roles = nv === 5 ? ['B', 'T', 'X', 'A', 'S'] : ['B', 'T', 'A', 'S'];
    const bassT = tones.find((t) => t.d === info.bassD);
    const opts = (r) => [].concat(...tones.map((t) => pitchesIn(t.p, RANGE[r][0], RANGE[r][1]).map((p) => Object.assign(p, { d: t.d }))));
    const S = opts('S'), A = opts('A'), X = nv === 5 ? opts('X') : [null], T = opts('T');
    const B = pitchesIn(bassT.p, RANGE.B[0], RANGE.B[1]).map((p) => Object.assign(p, { d: bassT.d }));
    const out = [];
    B.forEach((b) => S.forEach((s) => A.forEach((a) => {
      if (a.m >= s.m || s.m - a.m > 12) return;
      X.forEach((x) => {
        const mid = x || a;
        if (x && (x.m >= a.m || a.m - x.m > 12)) return;
        T.forEach((t) => {
          if (t.m >= mid.m || mid.m - t.m > 12 || t.m <= b.m || t.m - b.m > 24) return;
          const notes = (nv === 5 ? [b, t, x, a, s] : [b, t, a, s]).map((p, i) => Object.assign({}, p, { v: roles[i] }));
          const cost = staticCost(info, notes, sop);
          if (cost < 500) out.push({ notes, cost });
        });
      });
    })));
    return out;
  }
  // centre: where the soprano and bass sit best (s, b), as MIDI numbers.
  function staticCost(info, notes, sop, centre) {
    const count = {};
    notes.forEach((n) => (count[n.d] = (count[n.d] || 0) + 1));
    let c = 0;
    for (const t of info.tones) if (!count[t.d] && !info.optional.has(t.d)) return 1000;
    info.tones.forEach((t) => {
      const k = count[t.d] || 0;
      if (k > 1) {
        if (info.noDouble.has(t.d)) c += 120 * (k - 1);
        else if (t.d === 1) c += 0;
        else if (t.d === 5) c += info.six4 ? 0 : 3 * (k - 1);
        else if (t.d === 3) c += (info.ch.inv === 1 ? 2 : 8) * (k - 1);
      }
      if (k > 2) c += 10;
    });
    if (info.six4 && (count[5] || 0) < 2) c += 6;
    info.optional.forEach((d) => { if (!count[d]) c += 3; });
    const s = notes[notes.length - 1], b = notes[0];
    if (sop === 'tonic' && !pcEq(s, info.tonic)) c += 800;
    if (sop === 'notTonic' && pcEq(s, info.tonic)) c += 800;
    if (sop && sop.pc && !pcEq(s, sop.pc)) c += 800;
    const t = notes.find((n) => n.v === 'T');
    if (t && t.m - b.m > 19) c += 4;
    c += Math.abs(s.m - (centre ? centre.s : 70)) * 0.12 + Math.abs(b.m - (centre ? centre.b : 50)) * 0.06;
    return c;
  }
  // Keyboard style: the bass alone, and three (or four) upper notes close together above it, within an
  // octave. On the grand staff the bass sits low in the bass clef under a block in the treble clef; on
  // one staff the whole chord shares it. Upper notes may double a tone at the octave.
  const STACKS = {
    grand: { bass: [40, 55], up: [55, 81], gap: 30, s: 70, b: 47 },
    treble: { bass: [55, 69], up: [57, 84], gap: 16, s: 76, b: 62 },
    bass: { bass: [38, 52], up: [41, 67], gap: 16, s: 58, b: 45 },
  };
  function stackVoicings(info, sop, size, where) {
    const R = STACKS[where];
    const bassT = info.tones.find((t) => t.d === info.bassD);
    const out = [];
    pitchesIn(bassT.p, R.bass[0], R.bass[1]).forEach((b) => {
      const pool = [].concat(...info.tones.map((t) => pitchesIn(t.p, Math.max(R.up[0], b.m + 1), Math.min(R.up[1], b.m + R.gap + 12)).map((p) => Object.assign(p, { d: t.d }))))
        .sort((x, y) => x.m - y.m);
      // Every set of `size` notes, rising, within an octave, the lowest no more than `gap` above the bass.
      const pickSets = (from, acc) => {
        if (acc.length === size) {
          const notes = [Object.assign({}, b, { d: bassT.d })].concat(acc.map((p) => Object.assign({}, p)));
          notes.forEach((n, i) => (n.v = i === 0 ? 'B' : i === notes.length - 1 ? 'S' : 'I' + (notes.length - 1 - i)));
          const cost = staticCost(info, notes, sop, R);
          if (cost < 500) out.push({ notes, cost });
          return;
        }
        for (let k = from; k < pool.length; k++) {
          const p = pool[k];
          if (acc.length && (p.m <= acc[acc.length - 1].m || p.m - acc[0].m > 12)) continue;
          if (!acc.length && p.m - b.m > R.gap) break;
          acc.push(p); pickSets(k + 1, acc); acc.pop();
        }
      };
      pickSets(0, []);
    });
    return out;
  }
  // The cost of moving from one voicing to the next: parallel 5ths and octaves, leaps, the leading
  // tone and chordal 7ths left unresolved, an augmented 2nd, voices overlapping.
  function moveCost(pi, a, ni, b, o) {
    const by = (list) => { const m = {}; list.forEach((n) => (m[n.v] = n)); return m; };
    const A = by(a.notes), B = by(b.notes);
    const roles = Object.keys(A).filter((r) => B[r]);
    let c = 0;
    roles.forEach((r) => {
      const d = Math.abs(B[r].m - A[r].m);
      const w = r === 'B' ? 0.15 : r === 'S' ? 0.8 : 0.6;
      c += d * w;
      if (r !== 'B' && d > 7) c += (d - 7) * 1.5;
      if (d > 12) c += 25;
      // An augmented 2nd (a step written as a minor 3rd, 6–♯7 in minor).
      if (d === 3 && Math.abs(dia(B[r]) - dia(A[r])) === 1) c += 40;
    });
    const outer = (x, y) => (x === 'B' && y === 'S') || (x === 'S' && y === 'B');
    for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) {
      const r1 = roles[i], r2 = roles[j];
      const i1 = (((A[r2].m - A[r1].m) % 12) + 12) % 12, i2 = (((B[r2].m - B[r1].m) % 12) + 12) % 12;
      const m1 = B[r1].m - A[r1].m, m2 = B[r2].m - A[r2].m;
      if (m1 && m2 && i1 === i2 && (i1 === 0 || i1 === 7)) c += (Math.sign(m1) === Math.sign(m2) ? 1 : 0.5) * (o.stacked && !outer(r1, r2) ? 60 : 120);
      // A direct 5th or octave in the outer voices, with a leap in the soprano.
      if (outer(r1, r2) && m1 && m2 && Math.sign(m1) === Math.sign(m2) && (i2 === 0 || i2 === 7) && i1 !== i2) {
        const sm = r1 === 'S' ? m1 : m2;
        if (Math.abs(sm) > 2) c += 15;
      }
    }
    const order = ['B', 'T', 'X', 'A', 'S'].filter((r) => A[r] && B[r]);
    for (let i = 0; i + 1 < order.length; i++) {
      const lo = order[i], hi = order[i + 1];
      if (B[lo].m > A[hi].m || B[hi].m < A[lo].m) c += 8;
    }
    const ia = o.infos[pi], ib = o.infos[ni];
    const holdsTonic = ib.tones.some((t) => pcEq(t.p, ia.tonic));
    a.notes.forEach((n) => {
      const nb = B[n.v];
      if (!nb) return;
      // The leading tone goes up to the tonic — in an inner voice it may fall to the 5th.
      if (ia.lt && n.d === ia.lt && holdsTonic && ib.ch !== ia.ch) {
        if (nb.m !== n.m + 1) c += n.v === 'S' || n.v === 'B' ? 40 : 6;
      }
      // A chordal 7th (and a 9th) resolves down by step — or is held into a chord that has it too
      // (ii65–I64–V), to resolve after.
      if ((n.d === 7 || n.d === 9) && !(pcEq(ia.ch.root, ib.ch.root) && ia.ch.q === ib.ch.q)) {
        const d = n.m - nb.m;
        if (d !== 1 && d !== 2 && !(d === 0 && ib.tones.some((t) => pcEq(t.p, n)))) c += n.d === 7 ? 70 : 30;
      }
    });
    if (o.hold.includes(ni) && A.S && B.S && A.S.m !== B.S.m) c += 600;
    return c;
  }
  // The best voicing for every chord: the cheapest path through each chord's candidates.
  function voiceChords(chords, keys, opts) {
    const o = Object.assign({ staff: 'grand', style: 0, fill: 0, sop: [], hold: [] }, opts);
    const infos = chords.map((ch) => vlInfo(ch, keys[ch.k], o.fill));
    const block = o.staff === 'grand' && o.style === 1;
    const cands = infos.map((info, i) => {
      const upper = o.fill && (info.seventh || info.ninth) ? 4 : 3;
      const gen = (sop) => (o.staff !== 'grand' ? stackVoicings(info, sop, upper, o.staff)
        : block ? stackVoicings(info, sop, upper, 'grand')
          : chorale(info, sop, o.fill && info.ninth ? 5 : 4));
      let list = gen(o.sop[i]);
      // A soprano the chord can't have (a teacher's choice of cadence) is let go.
      if (!list.length && o.sop[i]) list = gen(null);
      list.sort((x, y) => x.cost - y.cost);
      list = list.slice(0, 200);
      // Nothing fits the ranges: the chord stacked up from the A below middle C.
      if (!list.length) {
        let lo = 57;
        list = [{ notes: info.tones.map((t, k) => { const p = pitchesIn(t.p, lo, lo + 11)[0]; lo = p.m + 1; return Object.assign(p, { d: t.d, v: k ? (k === info.tones.length - 1 ? 'S' : 'I' + (info.tones.length - 1 - k)) : 'B' }); }), cost: 0 }];
      }
      return list;
    });
    const mo = { infos, hold: o.hold, stacked: block || o.staff !== 'grand' };
    let cost = cands[0].map((c) => c.cost);
    const back = [];
    for (let i = 1; i < cands.length; i++) {
      const next = [], from = [];
      cands[i].forEach((b) => {
        let best = Infinity, arg = 0;
        cands[i - 1].forEach((a, k) => {
          const v = cost[k] + moveCost(i - 1, a, i, b, mo);
          if (v < best) { best = v; arg = k; }
        });
        next.push(best + b.cost);
        from.push(arg);
      });
      back.push(from);
      cost = next;
    }
    let k = cost.indexOf(Math.min(...cost));
    const path = [k];
    for (let i = back.length - 1; i >= 0; i--) { k = back[i][k]; path.unshift(k); }
    // On the grand staff: chorale tenor and bass in the bass clef (an extra inner voice wherever it
    // falls); a block's bass note alone in the bass clef.
    const lower = (n) => (block ? n.v === 'B' : n.v === 'B' || n.v === 'T' || (n.v === 'X' && n.m < 60));
    return path.map((idx, i) => cands[i][idx].notes.map((n) => {
      const p = { step: n.step, oct: n.oct, alt: n.alt, v: n.v, d: n.d };
      if (o.staff === 'grand') p.st = lower(n) ? 1 : 0;
      return p;
    }));
  }

  // ---------- non-harmonic tones ----------
  // A passing tone between two notes a third apart, or a neighbour between repeated notes, in a voice
  // with a stem of its own — on beat 2 of the half note, the chord tone shortened to a quarter.
  function addNHT(rng, voiced, chords, keys, roles) {
    const list = [];
    for (let i = 0; i + 1 < voiced.length && list.length < 3; i++) {
      const kd = keys[chords[i].k];
      if (chords[i + 1].k !== chords[i].k) continue;
      const alts = MQ.keyAlts(kd.fifths);
      const degOf = (step) => (step - kd.tonic.step + 7) % 7;
      for (const r of roles) {
        const a = voiced[i].find((n) => n.v === r), b = voiced[i + 1].find((n) => n.v === r);
        if (!a || !b || rng() > 0.45) continue;
        const da = dia(a), db = dia(b);
        let p = null, kind = null;
        if (Math.abs(db - da) === 2) { p = fromDia((da + db) / 2, 0); kind = 'passing'; }
        else if (da === db && a.alt === b.alt) { p = fromDia(da + (r === 'B' ? -1 : 1), 0); kind = 'neighbour'; }
        if (!p) continue;
        p.alt = alts[p.step];
        // In minor, leave the 6th and 7th degrees alone (which form is a question of direction).
        if (kd.mode === 'minor' && degOf(p.step) >= 5) continue;
        const s1 = Math.abs(midi(p) - midi(a)), s2 = Math.abs(midi(b) - midi(p));
        if (s1 < 1 || s1 > 2 || s2 < 1 || s2 > 2) continue;
        a.dur = 'q';
        voiced[i].push(Object.assign(p, { v: r, d: 0, dur: 'q', beat: 1, nht: kind }, a.st != null ? { st: a.st } : {}));
        list.push({ i, v: r, kind, p: pcOf(p) });
        break;
      }
    }
    return list;
  }

  // ---------- questions ----------
  const ROLE_NAMES = { S: 'soprano', B: 'bass' };
  // The analysis rows under the staff: the first key's numerals, then the second key's (a pivot in both).
  function labelRows(chords, keys, show, showKey2) {
    const top = chords.map((c) => (c.k === 0 || c.pivot ? c.text : ''));
    const two = keys.length > 1;
    const bottom2 = two ? chords.map((c) => (c.pivot ? c.pivot.text : c.k === 1 ? c.text : '')) : null;
    if (show) {
      top[0] = keyShort(keys[0]) + ' ' + top[0];
      if (two && showKey2) { const i = bottom2.findIndex(Boolean); if (i >= 0) bottom2[i] = keyShort(keys[1]) + ' ' + bottom2[i]; }
    }
    return { bottom: top, bottom2 };
  }
  function cadenceQuestion(made, b, n) {
    const t = cadTasks(b);
    const { chords, keys } = made;
    const staff = ['treble', 'bass', 'grand'][b.staff];
    const grand = staff === 'grand';
    const block = grand && b.style === 1;
    const voiced = voiceChords(chords, keys, { staff, style: b.style, fill: b.fill, sop: made.sop, hold: made.hold });
    const qrng = MQ.mulberry32((n * 7919 + chords.length * 31 + keys[0].fifths + 101) >>> 0);
    const nhtRoles = t.write || !b.nht ? [] : grand ? (block ? ['B'] : ['S', 'B']) : b.stems ? ['S'] : [];
    const nht = nhtRoles.length ? addNHT(qrng, voiced, chords, keys, nhtRoles) : [];
    const mod = made.mod;
    const romans = chords.map((c) => c.text), symbols = chords.map(symbolOf);
    // The new key is asked for unless its name is printed (students writing the chords need it).
    const askKey = t.ident && !!mod && !(t.write && t.rn === 0);
    const rows = labelRows(chords, keys, true, !askKey);
    const dd = [];
    if (t.ident && mod) {
      dd.push({ id: 'mod', label: 'Modulation', options: MODULATIONS.map((m) => m.label), answer: MODULATIONS.findIndex((m) => m.id === mod) });
      if (askKey) {
        const opts = newKeyOptions(keys[0], keys[1]);
        dd.push({ id: 'key', label: 'New key', options: opts.map(keyText), answer: opts.findIndex((k) => sameKey(k, keys[1])) });
      }
    } else if (t.ident && made.kind) {
      dd.push({ id: 'cad', label: 'Cadence', options: CADENCES.map((c) => c.label), answer: CADENCES.findIndex((c) => c.id === made.kind) });
    }
    const pivotAt = chords.findIndex((c) => c.pivot);
    const specs = chords.map((c, i) => {
      const tones = tonesOf(c);
      const opt = new Set();
      // As the voicing allows: a root-position seventh, or a ninth, may leave out its 5th.
      if (!b.fill && (NINTHS.includes(c.q) || (SEVENTHS.includes(c.q) && !c.inv))) opt.add(5);
      const notes = voiced[i].filter((p) => !p.beat);
      return {
        spec: { required: tones.filter((x) => !opt.has(x.d)).map((x) => x.p), optional: tones.filter((x) => opt.has(x.d)).map((x) => x.p), extra: [], bassDia: null },
        bassPc: bassOf(c), size: notes.length,
      };
    });
    const intro = mod ? `This progression starts in ${keyText(keys[0])} and modulates.` : `This progression is in ${keyText(keys[0])}.`;
    const tasks = [];
    if (t.write) tasks.push(`write each chord on the ${grand ? 'grand staff' : 'staff'}`);
    if (t.rn === 1) tasks.push('write its Roman numerals');
    if (t.sym === 1) tasks.push('write its chord symbols');
    if (t.ident && mod) tasks.push(askKey ? 'name the modulation and the new key' : 'name the modulation');
    else if (t.ident) tasks.push('name the cadence it ends with');
    const said = tasks.length < 3 ? tasks.join(' and ') : tasks.slice(0, -1).join(', ') + ', and ' + tasks[tasks.length - 1];
    const text = intro + (said ? ' ' + said.charAt(0).toUpperCase() + said.slice(1) + '.' : '');
    const hints = [];
    if (t.write) {
      hints.push(grand && !block ? 'Write four voices in half notes — soprano and alto in the treble clef, tenor and bass in the bass clef — with the right note in the bass for each figure.'
        : block ? 'Write each chord’s bass note low in the bass clef, with the other notes close together in the treble clef.'
          : 'Write every note of each chord in half notes, with the right note at the bottom for each figure.');
      if (b.fill) hints.push('Large chords may have every note.');
      if (made.sop.some((s) => s === 'tonic') && made.kind === 'pac') hints.push('End with the tonic in the soprano.');
    }
    if (t.rn === 1) hints.push('Type numerals with figures — V7, ii6, V65, I64 — b for ♭, and choose ° or ø from the menu.' + (pivotAt >= 0 ? ' The pivot chord has a box for each key.' : ''));
    if (t.sym === 1) hints.push('Chord symbols like Dmi7, G7/B, Bmi7b5 — a slash names an inverted chord’s bass note.');
    if (nht.length) hints.push('Quarter notes are non-harmonic tones.');
    const cols = voiced.map((v, i) => ({ given: t.write ? [] : v, cap: t.write ? (grand ? (block ? specs[i].size + 2 : 6) : specs[i].size + 2) : 0 }));
    const kindTag = mod ? 'mod:' + mod : 'cad:' + made.kind;
    return {
      type: 'cadence', clef: staff, grand, keySig: keys[0].fifths, keyAware: true, revealPc: true,
      text, hint: hints.join(' '),
      columns: cols,
      chordLabels: {
        top: t.sym === 0 ? symbols : null,
        bottom: t.rn === 0 ? rows.bottom : null,
        bottom2: t.rn === 0 && rows.bottom2 ? rows.bottom2 : null,
        even: true,
      },
      staffOpts: {
        value: 'half', barEvery: 2, colW: nht.length ? 76 : 64, fermatas: made.fermatas || [], extraBelow: grand ? 16 : 34,
        stemMode: t.write ? 'chord' : grand ? (block ? 'chord' : 'satb') : b.stems ? 'split' : 'chord',
      },
      answer: voiced.map((v) => v.filter((p) => !p.beat)),
      cad: {
        n, chords, keys, kind: made.kind, mod, write: t.write, rn: t.rn, sym: t.sym, ident: t.ident,
        romans, symbols, pivot: pivotAt, rnParts: chords.map((c) => readRN(c.text)), pivotParts: pivotAt >= 0 ? readRN(chords[pivotAt].pivot.text) : null,
        dd, specs, nht, block, rows: labelRows(chords, keys, true, true),
        // How the chords are stemmed when printed (the answer key shows them that way too).
        printStem: grand ? (block ? 'chord' : 'satb') : b.stems ? 'split' : 'chord',
      },
      tags: [kindTag, 'key:' + keys[0].fifths + keys[0].mode, 'pc:' + pcText(keys[0].tonic)],
      sig: 'cd' + kindTag + keyText(keys[0]) + romans.join(' '),
    };
  }
  // A teacher's progression, as a question.
  function writtenCadence(e, b) {
    const p = cadExerciseProblems(e);
    const chords = p.chords.slice(0, CAD_CHORDS), keys = p.keys;
    const kind = p.cad;
    const last = chords.length - 1;
    const before = chords[last - 1];
    const sop = chords.map((_, i) => (i !== last ? null : kind === 'pac' || kind === 'plagal' ? 'tonic' : kind === 'iac' && before && !before.inv && before.deg === 4 ? 'notTonic' : null));
    const hold = [];
    if (p.mod === 'ct') { const at = chords.findIndex((c) => c.k === 1); if (at > 0) hold.push(at); }
    const ends = [last];
    if (p.mod === 'phrase') { const at = chords.findIndex((c) => c.k === 1); if (at > 0) ends.unshift(at - 1); }
    return { chords, keys, kind, mod: keys.length > 1 ? p.mod : null, sop, hold, fermatas: ends };
  }
  function cadenceQuestions(cfg) {
    const b = cadSettings(cfg.cad);
    const want = Math.min(CAD_MAX, (cfg.counts && cfg.counts.cadence) || 0);
    if (!want) return [];
    const rng = MQ.mulberry32((Math.imul((cfg.seed || 0) + 7, 2246822519) ^ 0xcad0) >>> 0);
    // "A mix of both": half the questions (one more, when the number is odd, either way) have students
    // write the chords and the others have them name the cadence or modulation, dealt in a shuffled order.
    const asks = [];
    for (let i = 0; i < want; i++) asks.push(b.ask === 3 ? (i % 2 ? 2 : 1) : b.ask);
    if (b.ask === 3) {
      if (want % 2 && rng() < 0.5) asks[want - 1] = 2;
      for (let i = asks.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [asks[i], asks[j]] = [asks[j], asks[i]]; }
    }
    const set = (i) => Object.assign({}, b, { ask: asks[i] });
    if (b.src) {
      return usableCadExercises(b).slice(0, want).map((e, i) => cadenceQuestion(writtenCadence(e, b), set(i), i));
    }
    // Every kind the teacher chose takes its turn, in an order of its own for each quiz.
    let kinds = KINDS.filter((k, i) => b.kinds & (1 << i)).map((k) => k.id);
    if (b.keyMode === 1 && kinds.length > 1) kinds = kinds.filter((k) => k !== 'phc');
    if (!kinds.length) kinds = ['pac'];
    const order = [];
    while (order.length < want) {
      const round = kinds.slice();
      for (let i = round.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [round[i], round[j]] = [round[j], round[i]]; }
      order.push(...round);
    }
    const seen = new Set();
    return order.slice(0, want).map((kind, i) => {
      const bi = set(i), t = cadTasks(bi);
      let q = null;
      for (let k = 0; k < 8; k++) {
        let made = isMod(kind) ? makeModulation(rng, b, kind, t.write) : makeCadence(rng, b, kind, t.write);
        // A modulation reads as the kind it was made to be (two phrases alike would be a sequence).
        for (let j = 0; j < 12 && isMod(kind) && made.mod && modulationOf(made.chords, made.keys) !== made.mod; j++) made = makeModulation(rng, b, kind, t.write);
        q = cadenceQuestion(made, bi, i);
        if (!seen.has(q.sig)) break;
      }
      seen.add(q.sig);
      return q;
    });
  }

  // ---------- grading ----------
  // A response: {n: notes per chord (as the staff gives them), r: numerals, p: the pivot's numeral in
  // the new key, s: chord symbols, d: the menus' choices}.
  const subQ = (q, i) => ({ nameSpec: q.cad.specs[i].spec, bassPc: q.cad.specs[i].bassPc, columns: [q.columns[i]] });
  // A chord symbol, with double sharps and flats on the root or bass (Gx°/B♯ in A♯ minor) as well.
  function readSymbol(text) {
    const DBL = { x: 2, '##': 2, '𝄪': 2, '♯♯': 2, bb: -2, '𝄫': -2, '♭♭': -2 };
    let t = String(text || '').trim(), root2 = 0, bass2 = null;
    t = t.replace(/^([A-Ga-g])(x|##|𝄪|♯♯|bb|𝄫|♭♭)/, (all, l, a) => { root2 = DBL[a]; return l; });
    t = t.replace(/\/([A-Ga-g])(x|##|𝄪|♯♯|bb|𝄫|♭♭)$/, (all, l, a) => { bass2 = DBL[a]; return '/' + l; });
    const ch = MQ.parseSymbol(t);
    if (!ch) return null;
    if (root2) ch.root.alt = root2;
    if (bass2 != null) { if (!ch.bass) return null; ch.bass.alt = bass2; }
    return ch;
  }
  function symbolOk(text, ch, enh) {
    const got = readSymbol(text);
    if (!got || got.q !== ch.q) return false;
    const eq = (a, b) => (enh ? pcNum(a) === pcNum(b) : pcEq(a, b));
    if (!eq(got.root, ch.root)) return false;
    const bass = ch.inv ? bassOf(ch) : null;
    return bass ? !!got.bass && eq(got.bass, bass) : !got.bass;
  }
  // Every part's marks: {notes: [0..1 per chord] | null, r, p, s: [true/false] | null, d: [true/false]}.
  function markCadence(q, resp, cfg) {
    const C = q.cad, R = resp || {}, enh = !!(cfg && cfg.flags && cfg.flags.enharmonic);
    const get = (k, i) => (R[k] && R[k][i]) || '';
    return {
      notes: C.write ? C.chords.map((_, i) => MQ.gradeSpelled(subQ(q, i), [(R.n && R.n[i]) || []], cfg)) : null,
      r: C.rn === 1 ? C.chords.map((_, i) => sameRN(readRN(get('r', i)), C.rnParts[i])) : null,
      p: C.rn === 1 && C.pivot >= 0 ? sameRN(readRN(get('p', C.pivot)), C.pivotParts) : null,
      s: C.sym === 1 ? C.chords.map((c, i) => symbolOk(get('s', i), c, enh)) : null,
      d: C.dd.map((d, i) => (R.d && R.d[i]) === d.answer),
    };
  }
  // Each part the students answer is an equal share: the chords on the staff, the numerals, the
  // symbols, and naming the cadence or modulation.
  function gradeCadence(q, resp, cfg) {
    const m = markCadence(q, resp, cfg);
    const parts = [];
    const avg = (list) => list.reduce((s, x) => s + (x === true ? 1 : x === false ? 0 : x), 0) / list.length;
    if (m.notes) parts.push(avg(m.notes));
    if (m.r) parts.push(avg(m.p == null ? m.r : m.r.concat([m.p])));
    if (m.s) parts.push(avg(m.s));
    if (m.d.length) parts.push(avg(m.d));
    return parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : 0;
  }
  const markCadenceNotes = (q, placed, cfg) => q.cad.chords.map((_, i) => MQ.markSpelled(subQ(q, i), [(placed && placed[i]) || []], cfg)[0]);
  function hasCadenceAnswer(q, resp) {
    const R = resp || {};
    const txt = (k) => (R[k] || []).some((x) => x && String(x).trim());
    return (!!R.n && R.n.some((c) => c && c.some(Boolean))) || txt('r') || txt('p') || txt('s') || (!!R.d && R.d.some((x) => x != null));
  }
  // The answer in words: the chords, the numerals and symbols asked for, and the cadence or modulation.
  function describeCadence(q) {
    const C = q.cad;
    const out = [];
    if (C.write) out.push(C.chords.map((c, i) => `${C.symbols[i]}: ${q.answer[i].map(fullName).join(' ')}`).join(' · '));
    if (C.rn === 1) {
      const rows = C.rows;
      out.push(C.chords.map((c, i) => (c.pivot ? `${rows.bottom[i]} = ${rows.bottom2[i]}` : rows.bottom[i] || rows.bottom2[i])).join('  '));
    }
    if (C.sym === 1) out.push(C.symbols.join('  '));
    C.dd.forEach((d) => out.push(d.options[d.answer]));
    if (!C.dd.length && !C.write && C.rn !== 1 && C.sym !== 1) out.push(C.mod ? MODULATIONS.find((m) => m.id === C.mod).label : CADENCES.find((c) => c.id === C.kind).label);
    return out.join(' · ');
  }

  Object.assign(MQ, {
    CAD_MAX, CAD_CHORDS, CAD_EX_MAX, CADENCES, MODULATIONS, CAD_KINDS: KINDS,
    cadSettings, cadTasks, readRN, sameRN, prettyRN, cadChordFrom: chordFrom, parseCadText, cadenceOf, modulationOf,
    cadExerciseProblems, cadExerciseOk, usableCadExercises, closeKeys, newKeyOptions, voiceChords, cadenceQuestions,
    markCadence, gradeCadence, markCadenceNotes, hasCadenceAnswer, describeCadence, cadKeyText: keyText, cadSymbolOf: symbolOf,
  });
})(typeof window !== 'undefined' ? window : globalThis);
