/* Clefwork Library — public-domain pieces to use as musical examples: solo melodies, piano pieces and
   pieces for several instruments or voices. A piece that can be heard carries its notes, written
   compactly (below), and serves melodic and rhythmic dictation, scale degrees and the listening
   questions of Clefwork Terms. A piece with a score (an SVG file published beside the app, in
   library/) can be opened in Clefwork Analysis; a score-only piece has no notes here, so the
   analysis list can be longer than the listening one.
   A piece: {id, title, by, year, style, kind ('melody' | 'piano' | 'ensemble'), source, license,
   key {fifths, mode}, meter {n, d}, tempo (the beat a minute), bars, score (file name or ''),
   parts [{name, clef, m: [one string a measure]}], v (the library version it arrived in)}. The pieces
   are in library/data.js, loaded the first time they're needed (MQ.libraryLoad); a line a piece in
   MQ.LIBRARY_INDEX (library-index.js, bundled) lets a quiz choose pieces before then.
   The notes of a measure are tokens separated by spaces: a pitch or pitches (C4, F#5, Bb3, joined
   by + for a chord) or r for a rest, then the value — w h q e s — with . for a dotted note, t for a
   triplet and ~ for a note tied to the next. A pickup comes as rests filling the rest of its measure.
   Pieces are only ever added: a quiz code may name one by its place in the list. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const KINDS = [
    { id: 'melody', label: 'Solo melody', plural: 'Solo melodies' },
    { id: 'piano', label: 'Piano', plural: 'Piano' },
    { id: 'ensemble', label: 'Several instruments', plural: 'Several instruments or voices' },
  ];
  const VALUE = { w: 0, h: 1, q: 2, e: 3, s: 4 };
  const STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const ALT = { '': 0, '#': 1, x: 2, '##': 2, b: -1, bb: -2, n: 0 };

  // ---------- reading the notes ----------
  const TOKEN = /^((?:r)|(?:[A-G](?:bb|b|##|#|x|n)?-?\d)(?:\+[A-G](?:bb|b|##|#|x|n)?-?\d)*)([whqes])(\.?)(t?)(~?)$/;
  function pitchOf(s) {
    const m = s.match(/^([A-G])(bb|b|##|#|x|n)?(-?\d)$/);
    return m ? { step: STEP[m[1]], alt: ALT[m[2] || ''], oct: +m[3] } : null;
  }
  // One measure's events: {v, d, t, r, p (the top note), ps (every note), tie}.
  function measureEvents(str) {
    const out = [];
    String(str || '').trim().split(/\s+/).filter(Boolean).forEach((tok) => {
      const m = tok.match(TOKEN);
      if (!m) return;
      const e = { v: VALUE[m[2]], d: m[3] ? 1 : 0, t: m[4] ? 1 : 0, r: m[1] === 'r' ? 1 : 0 };
      if (!e.r) {
        e.ps = m[1].split('+').map(pitchOf).filter(Boolean);
        e.p = e.ps.reduce((a, b) => (MQ.midi(b) > MQ.midi(a) ? b : a));
      }
      if (m[5]) e.tie = 1;
      out.push(e);
    });
    return out;
  }
  const pieces = () => MQ.LIBRARY_DATA || [];
  // Loads library/data.js from beside this page, or else from the Clefwork site.
  let loading = null;
  function libraryLoad() {
    if (MQ.LIBRARY_DATA) return Promise.resolve(MQ.LIBRARY_DATA);
    if (loading) return loading;
    const site = String(root.CLEFWORK_BASE || '').replace(/[^/]*$/, '');
    const bases = ['library/'].concat(site ? [site + 'library/'] : []);
    loading = new Promise((ok, bad) => {
      const next = (i) => {
        if (i >= bases.length) { loading = null; bad(new Error('The library couldn’t be loaded. Check the internet connection and try again.')); return; }
        const el = document.createElement('script');
        el.src = bases[i] + 'data.js';
        el.onload = () => (MQ.LIBRARY_DATA ? ok(MQ.LIBRARY_DATA) : next(i + 1));
        el.onerror = () => { el.remove(); next(i + 1); };
        document.head.append(el);
      };
      next(0);
    });
    return loading;
  }
  // The bundled index, as {id, kind, bars, heard, scored, v}; f as libraryList, plus v (the
  // library version to keep to).
  const indexRows = () => (MQ.LIBRARY_INDEX || []).map(([id, kind, bars, h, sc, v]) => ({ id, kind, bars, heard: !!h, scored: !!sc, v }));
  // "Title — composer", once the pieces have loaded.
  const pieceName = (id) => { const p = byId(id); return p ? `${p.title} — ${p.by}` : ''; };
  function indexList(f) {
    const o = f || {}, kinds = o.kind ? [].concat(o.kind) : null;
    return indexRows().filter((p) => (!kinds || kinds.includes(p.kind)) && (!o.heard || p.heard) && (!o.scored || p.scored) && (!o.v || p.v <= o.v));
  }
  const byId = (id) => pieces().find((p) => p.id === id) || null;
  const indexOf = (id) => pieces().findIndex((p) => p.id === id);
  const heard = (p) => !!(p.parts && p.parts.length && p.parts[0].m && p.parts[0].m.length);
  const meterOk = (meter) => MQ.RHYTHM_METERS.some((x) => x.n === meter.n && x.d === meter.d);

  // What stops measures from..from+count−1 of a part being a dictation melody (or rhythm): chords,
  // ties (unless o.ties — dictation writes them, scale degrees don't), and notes Clefwork doesn't
  // write. An empty list means they fit.
  function excerptProblems(piece, part, from, count, o) {
    const out = [], P = piece.parts[part || 0];
    if (!P) return ['This piece has no notes to use.'];
    if (!meterOk(piece.meter)) out.push(`Clefwork doesn’t write ${piece.meter.n}/${piece.meter.d} time.`);
    const max = (o && o.max) || MQ.MELODY_MEASURES || 8;
    if (count > max) out.push(`Up to ${max} measures at a time.`);
    const info = MQ.rhythmMeter(piece.meter);
    for (let m = from; m < from + count; m++) {
      const src = P.m[m];
      if (src == null) { out.push(`The piece has only ${P.m.length} measures.`); break; }
      const evs = measureEvents(src);
      if (!(o && o.rhythmOnly) && evs.some((e) => e.ps && e.ps.length > 1)) out.push(`Measure ${m + 1} has chords.`);
      // A tie out of the last measure leads nowhere here, so it's left off.
      if (evs.some((e, i) => e.tie && (m < from + count - 1 || i < evs.length - 1)) && !(o && o.ties)) out.push(`Measure ${m + 1} has a tied note.`);
      if (MQ.rhythmTotal(evs) !== info.len) out.push(`Measure ${m + 1} doesn’t fill the bar.`);
      if (!MQ.measureState(evs.map(MQ.rhythmEvent), info).ok) out.push(`Measure ${m + 1} has a rhythm Clefwork doesn’t write.`);
    }
    return Array.from(new Set(out));
  }
  // The last note of an excerpt may be tied on into the next measure, which isn't taken.
  const untieEnd = (L) => { const last = L[L.length - 1], e = last && last[last.length - 1]; if (e) delete e.tie; };
  // Measures of a part as a written melody for Clefwork Melody (or Scale Degrees).
  function excerptMelody(piece, part, from, count) {
    const P = piece.parts[part || 0];
    const layers = [[]];
    for (let m = from; m < from + count; m++) layers[0].push(measureEvents(P.m[m]).map((e) => Object.assign(MQ.rhythmEvent(e), e.r ? {} : { p: Object.assign({}, e.p) })));
    untieEnd(layers[0]);
    return MQ.melodyExample({ meter: { n: piece.meter.n, d: piece.meter.d, g: 0 }, measures: count, tempo: clamp(piece.tempo || 96, 40, 240), key: Object.assign({}, piece.key), clef: P.clef === 'bass' ? 'bass' : 'treble', layers });
  }
  // Measures of one or two parts as a written rhythm for Clefwork Rhythm.
  function excerptRhythm(piece, parts, from, count) {
    const layers = parts.slice(0, 2).map((pi) => {
      const L = [];
      for (let m = from; m < from + count; m++) L.push(measureEvents(piece.parts[pi].m[m]).map(MQ.rhythmEvent));
      untieEnd(L);
      return L;
    });
    while (layers.length < 2) layers.push(Array.from({ length: count }, () => []));
    return MQ.exampleSettings({ meter: { n: piece.meter.n, d: piece.meter.d, g: 0 }, measures: count, tempo: clamp(piece.tempo || 96, 30, 285), parts: Math.min(2, parts.length), layers: layers.map((L) => L.concat(Array.from({ length: 4 - L.length }, () => []))) });
  }
  // Every note of the chosen parts, measures from..to, as {u (start, in units), d (length), m (measure),
  // midi[]} — ties joined into one note — for playing.
  function noteList(piece, o) {
    const info = MQ.rhythmMeter(piece.meter), out = [];
    const from = (o && o.from) || 0, to = Math.min(((o && o.to) != null ? o.to : piece.bars - 1), piece.bars - 1);
    const parts = (o && o.parts) || piece.parts.map((_, i) => i);
    parts.forEach((pi) => {
      const P = piece.parts[pi];
      if (!P) return;
      let held = null;
      for (let m = from; m <= to; m++) {
        let at = (m - from) * info.len;
        measureEvents(P.m[m]).forEach((e) => {
          const d = MQ.rhythmDur(e);
          if (!e.r) {
            if (held) held.d += d; else out.push(held = { u: at, d, m: m - from, midi: e.ps.map(MQ.midi), part: pi });
            if (!e.tie) held = null;
          } else held = null;
          at += d;
        });
      }
    });
    return out.sort((a, b) => a.u - b.u);
  }
  // A few facts for choosing: the range, the widest leap, the shortest note, chromatic notes.
  function pieceFacts(piece) {
    if (!heard(piece)) return null;
    const P = piece.parts[0], K = MQ.melodyKey(piece.key);
    let lo = 999, hi = -1, leap = 0, prev = null, shortest = 0, chroma = 0, ties = 0, chords = 0;
    P.m.forEach((s) => measureEvents(s).forEach((e) => {
      if (e.tie) ties++;
      if (e.r) return;
      if (e.ps.length > 1) chords++;
      const x = MQ.midi(e.p);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
      if (prev != null) leap = Math.max(leap, Math.abs(x - prev));
      prev = x;
      shortest = Math.max(shortest, e.v + (e.t ? 0.5 : 0));
      const inKey = K.alts[e.p.step] === e.p.alt || (K.mode === 'minor' && [5, 6].includes(((e.p.step - K.tonic.step) % 7 + 7) % 7) && e.p.alt === K.alts[e.p.step] + 1);
      if (!inKey) chroma++;
    }));
    return { range: hi - lo, leap, shortest, chroma, ties, chords };
  }
  // Pieces that fit a filter: kind ('melody' …, or a list), heard (only ones with notes), scored (only
  // ones with a score), text (in the title, composer or style).
  function libraryList(f) {
    const o = f || {}, kinds = o.kind ? [].concat(o.kind) : null, q = String(o.text || '').trim().toLowerCase();
    return pieces().filter((p) => (!kinds || kinds.includes(p.kind)) && (!o.heard || heard(p)) && (!o.scored || !!p.score)
      && (!q || `${p.title} ${p.by} ${p.style} ${p.year}`.toLowerCase().includes(q)));
  }
  const pieceLine = (p) => [p.by, p.year, p.style].filter(Boolean).join(' · ');
  // Excerpts chosen at random, for a quiz the app fills itself: o.count of them, o.measures long, from
  // pieces of o.kinds (that can be heard) with at most o.keyMax sharps or flats, none twice. need
  // 'melody' takes each piece's top part (a hymn's soprano, a piano piece's right hand); 'rhythm' that
  // part, or with o.parts 2 the top and bottom parts. Starts at a phrase (every four measures) when it
  // can. Measures with a tie (unless o.ties), a chord in a melody, a rhythm Clefwork doesn't write, or no notes are
  // passed over; o.only keeps to some pieces (by id). Returns [{piece, part, parts, from, count}] —
  // fewer when too few pieces fit.
  function randomExcerpts(o) {
    const rng = o.rng || Math.random, count = o.measures, max = o.max || (o.need === 'rhythm' ? 4 : 8);
    const pool = libraryList({ kind: o.kinds, heard: true }).filter((p) => meterOk(p.meter) && p.bars >= count
      && (o.keyMax == null || Math.abs(p.key.fifths) <= o.keyMax) && !(o.skip || []).includes(p.id) && (!o.only || o.only.includes(p.id)));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const notesIn = (p, pi, from) => { let n = 0; for (let m = from; m < from + count; m++) n += measureEvents(p.parts[pi].m[m]).filter((e) => !e.r).length; return n; };
    const out = [];
    for (const p of pool) {
      if (out.length >= o.count) break;
      const parts = o.need === 'rhythm' && o.parts === 2 && p.parts.length > 1 ? [0, p.parts.length - 1] : [0];
      const all = Array.from({ length: p.bars - count + 1 }, (_, s) => s);
      const phrase = all.filter((s) => s % 4 === 0), rest = all.filter((s) => s % 4 !== 0);
      [phrase, rest].forEach((L) => { for (let i = L.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [L[i], L[j]] = [L[j], L[i]]; } });
      const from = phrase.concat(rest).find((s) => parts.every((pi) => notesIn(p, pi, s) >= Math.min(3, count + 1)
        && !excerptProblems(p, pi, s, count, { max, rhythmOnly: o.need === 'rhythm', ties: o.ties }).length));
      if (from != null) out.push({ piece: p, part: parts[0], parts, from, count });
    }
    return out;
  }

  Object.assign(MQ, {
    LIBRARY_KINDS: KINDS, libraryLoad, libraryIndexList: indexList, libraryName: pieceName, libraryPieces: pieces, libraryPiece: byId, libraryIndex: indexOf, libraryHeard: heard, libraryList, libraryLine: pieceLine,
    libraryMeasure: measureEvents, libraryRandom: randomExcerpts, libraryExcerptProblems: excerptProblems, libraryMelody: excerptMelody, libraryRhythm: excerptRhythm, libraryNotes: noteList, libraryFacts: pieceFacts,
  });
})(typeof window !== 'undefined' ? window : globalThis);
