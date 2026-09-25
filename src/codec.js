/* Clefwork — serverless quiz and report codes.
   Layout of every code: [CRC-16][kind:4][seal:16, reports only][payload…], written in
   Crockford base-32 (digits + letters without I, L, O, U) and grouped in fives. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const KIND_QUIZ = 1, KIND_REPORT = 2;
  const EPOCH = Date.UTC(2025, 0, 1);
  const STAVES = ['treble', 'bass', 'grand'];
  // The six question types every version of the code format has carried, in their original order.
  // Newer types (custom chords, voicings, progressions, figured bass) store their counts further on.
  const COUNT_KEYS = ['place', 'identify', 'interval', 'chord', 'scale', 'keysig'];
  const STAFF_TABS = ['place', 'identify', 'interval', 'scale', 'keysig', 'chord', 'figured', 'figprog'];
  const HELP_TABS = ['interval', 'chord', 'custom', 'voicing'];
  const KEY_MODES = ['major', 'minor', 'custom'];

  const utf8 = (s) => Array.from(new TextEncoder().encode(s));
  const toBits = (v, n) => { const b = []; for (let i = n - 1; i >= 0; i--) b.push(Math.floor(v / Math.pow(2, i)) & 1); return b; };
  function bitsToBytes(bits) {
    const out = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] || 0);
      out.push(v);
    }
    return out;
  }
  function crc16(bytes) {
    let c = 0xffff;
    for (const b of bytes) {
      c ^= b << 8;
      for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c;
  }
  function seal16(bytes, key) {
    let h = 0x811c9dc5;
    for (const b of utf8(key).concat(bytes)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return ((h >>> 16) ^ (h & 0xffff)) & 0xffff;
  }

  class Writer {
    constructor() { this.b = []; }
    u(v, n) { this.b.push(...toBits(Math.max(0, Math.floor(v)), n)); return this; }
    str(s, maxBytes) {
      let chars = Array.from(String(s || ''));
      while (utf8(chars.join('')).length > maxBytes) chars.pop();
      const bytes = utf8(chars.join(''));
      this.u(bytes.length, 6);
      bytes.forEach((x) => this.u(x, 8));
      return this;
    }
    // Longer strings (instructions): a length field of `bits` bits.
    strN(s, maxBytes, bits) {
      let chars = Array.from(String(s || ''));
      while (utf8(chars.join('')).length > Math.min(maxBytes, Math.pow(2, bits) - 1)) chars.pop();
      const bytes = utf8(chars.join(''));
      this.u(bytes.length, bits);
      bytes.forEach((x) => this.u(x, 8));
      return this;
    }
    // Short strings (chord symbols): 4-bit length.
    str4(s, maxBytes) {
      let chars = Array.from(String(s || ''));
      while (utf8(chars.join('')).length > Math.min(15, maxBytes)) chars.pop();
      const bytes = utf8(chars.join(''));
      this.u(bytes.length, 4);
      bytes.forEach((x) => this.u(x, 8));
      return this;
    }
  }
  class Reader {
    constructor(bits) { this.b = bits; this.p = 0; }
    u(n) {
      let v = 0;
      for (let i = 0; i < n; i++) {
        if (this.p >= this.b.length) throw new Error('short');
        v = v * 2 + this.b[this.p++];
      }
      return v;
    }
    str() {
      const len = this.u(6), bytes = [];
      for (let i = 0; i < len; i++) bytes.push(this.u(8));
      return new TextDecoder().decode(new Uint8Array(bytes));
    }
    strN(bits) {
      const len = this.u(bits), bytes = [];
      for (let i = 0; i < len; i++) bytes.push(this.u(8));
      return new TextDecoder().decode(new Uint8Array(bytes));
    }
    str4() {
      const len = this.u(4), bytes = [];
      for (let i = 0; i < len; i++) bytes.push(this.u(8));
      return new TextDecoder().decode(new Uint8Array(bytes));
    }
  }

  const group = (s) => s.match(/.{1,5}/g).join('-');
  function normalize(code) {
    return String(code || '').toUpperCase().replace(/[O]/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
  }

  function pack(kind, rest, sealKey) {
    rest = rest.slice();
    const head = 16 + 4 + (sealKey != null ? 16 : 0);
    while ((head + rest.length) % 5) rest.push(0);
    let body = toBits(kind, 4);
    if (sealKey != null) body = body.concat(toBits(seal16(bitsToBytes(rest), sealKey), 16));
    body = body.concat(rest);
    const all = toBits(crc16(bitsToBytes(body)), 16).concat(body);
    let s = '';
    for (let i = 0; i < all.length; i += 5) {
      let v = 0;
      for (let j = 0; j < 5; j++) v = v * 2 + all[i + j];
      s += B32[v];
    }
    return group(s);
  }

  class CodeError extends Error {}
  function unpack(code) {
    const clean = normalize(code);
    if (clean.length < 8) throw new CodeError('That code is too short. Check that you copied all of it.');
    const bits = [];
    for (const ch of clean) {
      const v = B32.indexOf(ch);
      if (v < 0) throw new CodeError(`“${ch}” isn’t used in these codes. Check for a typo.`);
      bits.push(...toBits(v, 5));
    }
    const crc = new Reader(bits).u(16);
    const body = bits.slice(16);
    if (crc16(bitsToBytes(body)) !== crc) throw new CodeError('This code has a typo or is incomplete — the checksum doesn’t match.');
    return { kind: new Reader(body).u(4), body, clean };
  }

  const quizId = (code) => crc16(utf8(normalize(code)));

  // ---------- rhythms ----------
  // Each note or rest: value (0 whole … 4 sixteenth), dot, triplet, rest. A measure is its count
  // of notes and rests, then each one.
  const METER_DENOMS = [2, 4, 8];
  function writeEvents(w, list) {
    const evs = (list || []).slice(0, 63);
    w.u(evs.length, 6);
    evs.forEach((e) => w.u(e.v, 3).u(e.d ? 1 : 0, 1).u(e.t ? 1 : 0, 1).u(e.r ? 1 : 0, 1));
  }
  function readEvents(r) {
    const n = r.u(6), out = [];
    for (let i = 0; i < n; i++) out.push({ v: Math.min(4, r.u(3)), d: r.u(1), t: r.u(1), r: r.u(1) });
    return out;
  }
  // An example: measures, time signature (denominator, numerator, grouping), tempo, parts, rhythm.
  function writeExample(w, raw) {
    const ex = MQ.exampleSettings(raw);
    w.u(ex.measures - 1, 2).u(METER_DENOMS.indexOf(ex.meter.d), 2).u(ex.meter.n, 4).u(ex.meter.g || 0, 2)
      .u(ex.tempo - 30, 8).u(ex.parts - 1, 1);
    for (let l = 0; l < ex.parts; l++) for (let m = 0; m < ex.measures; m++) writeEvents(w, ex.layers[l][m]);
  }
  function readExample(r) {
    const ex = { measures: r.u(2) + 1 };
    const d = METER_DENOMS[r.u(2)] || 4;
    ex.meter = { d, n: r.u(4), g: r.u(2) };
    ex.tempo = r.u(8) + 30;
    ex.parts = r.u(1) + 1;
    ex.layers = [[[], [], [], []], [[], [], [], []]];
    for (let l = 0; l < ex.parts; l++) for (let m = 0; m < ex.measures; m++) ex.layers[l][m] = readEvents(r);
    return MQ.exampleSettings(ex);
  }

  // ---------- quiz codes ----------
  // Retakes a quiz allows after the first attempt: a number from 0 to 31, or null for no limit.
  const retakeLimit = (cfg) => (cfg && Number.isInteger(cfg.retakes) && cfg.retakes >= 0 ? Math.min(31, cfg.retakes) : null);
  function encodeQuiz(cfg) {
    const w = new Writer();
    // Version 2 added teacher-defined chords after the flags; version 3 adds how many to ask
    // plus grand-staff voicings. Older codes still decode.
    w.u(15, 4).u(cfg.seed, 20).str(cfg.title, 60).str(cfg.teacher, 40).u(cfg.clefs, 2);
    COUNT_KEYS.forEach((k) => w.u(Math.min(31, cfg.counts[k] || 0), 5));
    w.u(cfg.ledger, 2).u(cfg.accMode, 2).u(cfg.intervals, 13).u(cfg.intervalDir, 2).u(cfg.chords, 8)
      .u(cfg.scales, 4).u(cfg.scaleLen, 1).u(cfg.keyMode, 2).u(cfg.keyMax, 3).u(Math.min(127, cfg.timeLimit), 7);
    MQ.FLAG_KEYS_V1.forEach((k) => w.u(cfg.flags[k] ? 1 : 0, 1));
    const custom = (cfg.custom || []).slice(0, MQ.MAX_CUSTOM);
    w.u(cfg.customGrade ? 1 : 0, 1).u(custom.length, 5);
    custom.forEach((c) => {
      w.str4(c.symbol, 15).u(c.clef === 'bass' ? 1 : 0, 1);
      const notes = c.notes.slice(0, MQ.MAX_CUSTOM_NOTES);
      w.u(notes.length, 3);
      notes.forEach((p) => w.u(MQ.dia(p), 7).u(p.alt + 1, 2));
    });
    w.u(Math.min(custom.length, cfg.counts.custom == null ? custom.length : cfg.counts.custom), 5);
    const voicings = (cfg.voicings || []).slice(0, MQ.MAX_CUSTOM);
    w.u(voicings.length, 5);
    voicings.forEach((v) => {
      const notes = v.notes.slice(0, MQ.MAX_VOICING_NOTES);
      w.str4(v.symbol, 15).u(['grand', 'treble', 'bass'].indexOf(v.staff || 'grand'), 2).u(notes.length, 4);
      notes.forEach((p) => w.u(MQ.dia(p), 7).u(p.alt + 1, 2).u(p.st === 1 ? 1 : 0, 1));
    });
    w.u(Math.min(voicings.length, cfg.counts.voicing || 0), 5);
    w.u(cfg.inversions || 1, 4); // version 4: which chord inversions to ask
    // Version 6: chord progressions.
    const progs = (cfg.progs || []).slice(0, MQ.MAX_CUSTOM);
    w.u(cfg.progMode || 0, 3).u(progs.length, 5);
    progs.forEach((e) => {
      const k = e.key;
      w.u(e.kind === 'auto' ? 1 : 0, 1).u(STAVES.indexOf(e.staff), 2).u(KEY_MODES.indexOf(k.mode), 2)
        .u(k.tonic.step, 3).u(k.tonic.alt + 1, 2).u(k.fifths + 7, 4).u(k.minorType === 'melodic' ? 1 : 0, 1).u(e.voicing === 'open' ? 1 : 0, 1);
      if (e.kind === 'auto') w.u(e.len - 3, 3).u(e.sevenths, 2).u(e.deceptive ? 1 : 0, 1).u((e.qcount || 1) - 1, 4);
      else {
        const chords = e.chords.slice(0, 8);
        w.u(chords.length, 4);
        chords.forEach((c) => w.u(c.root.step, 3).u(c.root.alt + 2, 3).u(MQ.QUALITY_IDS.indexOf(c.q), 5));
      }
    });
    w.u(Math.min(30, cfg.counts.progression || 0), 5);
    // Version 7: chord qualities, sizes, altered extensions and staves for "Build a chord".
    w.u(cfg.chordQual == null ? 3 : cfg.chordQual, 5).u(cfg.chordSize == null ? 5 : cfg.chordSize, 6)
      .u(cfg.chordAlt || 0, 2).u(cfg.chordStaff == null ? 3 : cfg.chordStaff, 3);
    // Version 8: figured bass settings and how many of each figured-bass question to ask.
    w.u(cfg.figKey == null ? 1 : cfg.figKey, 2).u(cfg.figMax == null ? 3 : cfg.figMax, 3).u(cfg.figAlt || 0, 2)
      .u(cfg.figSize == null ? 1 : cfg.figSize, 2).u(cfg.figPos == null ? 7 : cfg.figPos, 4)
      .u(cfg.figClefs == null ? 3 : cfg.figClefs, 2).u(cfg.figAsk == null ? 1 : cfg.figAsk, 2).u((cfg.figLen || 4) - 3, 3)
      .u(Math.min(31, cfg.counts.figured || 0), 5).u(Math.min(31, cfg.counts.figprog || 0), 5);
    // Version 9: compound intervals and the extra scales sit above the older 13- and 4-bit fields,
    // plus the new question directions, the figured bass progression's own settings and new flags.
    w.u(Math.floor((cfg.intervals || 0) / 8192), 11).u(Math.floor((cfg.scales || 0) / 16), 9)
      .u(cfg.scaleModes ? 1 : 0, 1).u(cfg.scaleAsk == null ? 1 : cfg.scaleAsk, 2).u(cfg.keyAsk == null ? 1 : cfg.keyAsk, 2)
      .u(cfg.figpKey == null ? 1 : cfg.figpKey, 2).u(cfg.figpMax == null ? 3 : cfg.figpMax, 3).u(cfg.figpAlt || 0, 2)
      .u(cfg.figpSize == null ? 1 : cfg.figpSize, 2).u(cfg.figpPos == null ? 7 : cfg.figpPos, 4).u(cfg.figpClefs == null ? 3 : cfg.figpClefs, 2);
    MQ.FLAG_KEYS.slice(MQ.FLAG_KEYS_V1.length).forEach((k) => w.u(cfg.flags[k] ? 1 : 0, 1));
    // Version 10: the grand staff as a quiz-wide option, each tab's staff and notes overrides,
    // and the figured bass progression's direction.
    w.u((cfg.clefs & 4) ? 1 : 0, 1);
    STAFF_TABS.forEach((k) => w.u((cfg.staffOv && cfg.staffOv[k]) || 0, 2));
    HELP_TABS.forEach((k) => w.u((cfg.helpOv && cfg.helpOv[k]) == null ? 0 : cfg.helpOv[k], 2));
    w.u(cfg.figpAsk == null ? 1 : cfg.figpAsk, 2);
    w.u(cfg.chordAsk == null ? 1 : cfg.chordAsk, 2); // version 11: the Chords tab's direction
    // Slash chords in written progressions: their bass note (added in version 9).
    progs.forEach((e) => {
      if (e.kind === 'auto') return;
      e.chords.slice(0, 8).forEach((c) => {
        w.u(c.bass ? 1 : 0, 1);
        if (c.bass) w.u(c.bass.step, 3).u(c.bass.alt + 2, 3);
      });
    });
    // Version 12: the single-chord and progression voicing categories.
    w.u((cfg.helpOv && cfg.helpOv.vprog) == null ? 2 : cfg.helpOv.vprog, 2);
    [cfg.vc, cfg.vp].forEach((b, i) => {
      const s2 = MQ.voiceSettings(b);
      w.u(s2.sizes, 3).u(s2.quals, 5).u(s2.alts ? 1 : 0, 1).u(s2.key, 2).u(s2.slash ? 1 : 0, 1).u(s2.ask, 2);
      if (i === 1) w.u(Math.max(2, Math.min(9, s2.len)) - 2, 3);
      MQ.TECHNIQUES.forEach((t) => w.u(Math.min(31, (s2.tech && s2.tech[t.id]) || 0), 5));
      const o = s2.opts || {};
      w.u(o.thirdsStaff || 0, 2).u(o.thirdsOmitRoot ? 1 : 0, 1).u(o.blockStaff || 0, 2)
        .u(o.planesOpen || 0, 2).u(o.popNotes === 4 ? 1 : 0, 1).u(o.popStaff || 0, 2).u(o.inner2 ? 1 : 0, 1);
    });
    // Version 14: how many points the quiz is worth in Canvas, so results pages can scale the score.
    w.u(Math.max(0, Math.min(1000, Math.round(cfg.canvasPts || 0))), 10);
    // Version 15: Keys & Notes — how many, which ways of showing and answering, and the range.
    const k = MQ.keysSettings(cfg.keys);
    w.u(Math.min(63, (cfg.counts && cfg.counts.keys) || 0), 6).u(k.prompts, 3).u(k.answers, 3).u(k.low, 7).u(k.high, 7);
    // The 4-bit version number stops at 15, so later additions follow an 8-bit extension number.
    // Codes from before have only padding here. Extension 1: Clefwork Analysis — the boxes on the
    // score and their answers, and a fingerprint of the picture (which travels in the link).
    // Quizzes without it keep exactly the codes they had.
    // Extension 2: a limit on retakes (0–31). Unlimited retakes — the default — write nothing,
    // so those quizzes keep their codes too; a limit also writes the (possibly empty) block before it.
    // Extension 3: Clefwork Rhythm — the retake limit (if any) behind a flag, how often students may
    // play the example and their answer, then each example's meter, tempo and rhythm.
    // Extension 4: the same, plus how the quiz is scored (every note a point, or a percent of a
    // total) and whether the examples are written out or made automatically from the seed.
    const an = MQ.analysisSettings(cfg.analysis);
    const regions = an.regions.slice(0, MQ.ANALYSIS_MAX);
    const limit = retakeLimit(cfg);
    const rh = MQ.rhythmSettings(cfg.rhythm);
    const examples = rh.examples.slice(0, MQ.RHYTHM_MAX);
    const rhythm = rh.auto.on || examples.length > 0;
    if (regions.length || an.img || limit != null || rhythm) {
      const q10 = (v) => Math.max(0, Math.min(1023, Math.round(v * 1023)));
      const ext = rhythm ? 4 : limit != null ? 2 : 1;
      w.u(ext, 8).u(an.override, 2).u(an.img ? 1 : 0, 1);
      if (an.img) w.u(an.img.hash >>> 0, 32);
      w.strN(an.notes, 200, 8).u(regions.length, 6);
      regions.forEach((r) => {
        w.u(q10(r.x), 10).u(q10(r.y), 10).u(q10(r.w), 10).u(q10(r.h), 10)
          .u(Math.max(1, MQ.ANALYSIS_ASKS.indexOf(r.ask)), 2).str(r.roman, 63).str(r.symbol, 63);
      });
      if (ext === 2) w.u(limit, 5);
      if (ext === 4) {
        w.u(limit != null ? 1 : 0, 1);
        if (limit != null) w.u(limit, 5);
        w.u(Math.min(15, rh.playsEx || 0), 4).u(Math.min(15, rh.playsAns || 0), 4)
          .u(rh.score === 'percent' ? 1 : 0, 1).u(rh.outOf, 10).u(rh.auto.on ? 1 : 0, 1);
        if (rh.auto.on) {
          // The generator's version comes first, so a later one can keep older quizzes' examples.
          const a = rh.auto, c = a.custom;
          w.u(1, 3).u(a.count - 1, 5).u(a.measures - 1, 2).u(a.level - 1, 3).u(a.tempo - 30, 8)
            .u(c.lo - 2, 3).u(c.hi - 2, 3).u(c.compound ? 1 : 0, 1).u(c.cut ? 1 : 0, 1).u(c.uneven ? 1 : 0, 1)
            .u(c.shortest - 2, 2).u(c.dotted ? 1 : 0, 1).u(c.triplets ? 1 : 0, 1).u(c.offbeats, 2);
        } else {
          w.u(examples.length, 4);
          examples.forEach((ex) => writeExample(w, ex));
        }
      }
    }
    return pack(KIND_QUIZ, w.b);
  }

  function decodeQuiz(code) {
    const { kind, body } = unpack(code);
    if (kind === KIND_REPORT) throw new CodeError('This is a student report code. Paste it on the Grade reports tab.');
    if (kind !== KIND_QUIZ) throw new CodeError('This isn’t a Clefwork quiz code.');
    const r = new Reader(body);
    r.u(4);
    try {
      const v = r.u(4);
      if (v < 1 || v > 15) throw new CodeError('This quiz was made with a newer version of Clefwork.');
      const cfg = { seed: r.u(20), title: r.str(), teacher: r.str(), clefs: r.u(2), counts: {} };
      COUNT_KEYS.forEach((k) => (cfg.counts[k] = r.u(5)));
      Object.assign(cfg, {
        ledger: r.u(2), accMode: r.u(2), intervals: r.u(13), intervalDir: r.u(2), chords: r.u(8),
        scales: r.u(4), scaleLen: r.u(1), keyMode: r.u(2), keyMax: r.u(3), timeLimit: r.u(7), flags: {},
      });
      MQ.FLAG_KEYS_V1.forEach((k) => (cfg.flags[k] = !!r.u(1)));
      MQ.FLAG_KEYS.slice(MQ.FLAG_KEYS_V1.length).forEach((k) => (cfg.flags[k] = false));
      cfg.custom = [];
      cfg.customGrade = 0;
      if (v >= 2) {
        cfg.customGrade = r.u(1);
        const n = r.u(5);
        for (let i = 0; i < n; i++) {
          const c = { symbol: r.str4(), clef: r.u(1) ? 'bass' : 'treble', notes: [] };
          const k = r.u(3);
          for (let j = 0; j < k; j++) { const d = r.u(7); c.notes.push(MQ.fromDia(d, r.u(2) - 1)); }
          cfg.custom.push(c);
        }
      }
      cfg.counts.custom = cfg.custom.length;
      cfg.counts.voicing = 0;
      cfg.voicings = [];
      if (v >= 3) {
        cfg.counts.custom = r.u(5);
        const n = r.u(5);
        for (let i = 0; i < n; i++) {
          const vo = { symbol: r.str4(), staff: v >= 5 ? ['grand', 'treble', 'bass'][r.u(2)] || 'grand' : 'grand', notes: [] };
          const k = r.u(4);
          for (let j = 0; j < k; j++) {
            const d = r.u(7);
            const p = MQ.fromDia(d, r.u(2) - 1);
            const st = r.u(1);
            if (vo.staff === 'grand') p.st = st;
            vo.notes.push(p);
          }
          cfg.voicings.push(vo);
        }
        cfg.counts.voicing = r.u(5);
      }
      cfg.inversions = v >= 4 ? r.u(4) || 1 : 1;
      cfg.progMode = 0;
      cfg.progs = [];
      cfg.counts.progression = 0;
      if (v >= 6) {
        cfg.progMode = r.u(3);
        const n = r.u(5);
        for (let i = 0; i < n; i++) {
          const kind = r.u(1) ? 'auto' : 'written';
          const staff = STAVES[r.u(2)] || 'treble';
          const mode = KEY_MODES[r.u(2)] || 'major';
          const tonic = { step: r.u(3), alt: r.u(2) - 1 };
          const fifths = r.u(4) - 7;
          const minorType = r.u(1) ? 'melodic' : 'harmonic';
          const e = { kind, staff, key: MQ.makeKey(mode, fifths, tonic, minorType), voicing: r.u(1) ? 'open' : 'closed' };
          if (kind === 'auto') Object.assign(e, { len: r.u(3) + 3, sevenths: r.u(2), deceptive: !!r.u(1), qcount: r.u(4) + 1 });
          else {
            e.chords = [];
            const k = r.u(4);
            for (let j = 0; j < k; j++) e.chords.push({ root: { step: r.u(3), alt: r.u(3) - 2 }, q: MQ.QUALITY_IDS[r.u(5)] || 'maj' });
          }
          cfg.progs.push(e);
        }
        cfg.counts.progression = r.u(5);
      }
      Object.assign(cfg, { chordQual: 3, chordSize: 5, chordAlt: 0, chordStaff: 3 });
      if (v >= 7) Object.assign(cfg, { chordQual: r.u(5), chordSize: r.u(6), chordAlt: r.u(2), chordStaff: r.u(3) });
      Object.assign(cfg, { figKey: 1, figMax: 3, figAlt: 0, figSize: 1, figPos: 7, figClefs: 3, figAsk: 1, figLen: 4 });
      cfg.counts.figured = 0;
      cfg.counts.figprog = 0;
      if (v >= 8) {
        Object.assign(cfg, { figKey: r.u(2), figMax: r.u(3), figAlt: r.u(2), figSize: r.u(2), figPos: r.u(4), figClefs: r.u(2), figAsk: r.u(2), figLen: r.u(3) + 3 });
        cfg.counts.figured = r.u(5);
        cfg.counts.figprog = r.u(5);
      }
      cfg.staffOv = { place: 0, identify: 0, interval: 0, scale: 0, keysig: 0, chord: 0, figured: 0, figprog: 0 };
      cfg.helpOv = { interval: 0, chord: 0, custom: 2, voicing: 2, vprog: 2 };
      cfg.figpAsk = 1;
      cfg.chordAsk = 1;
      Object.assign(cfg, { scaleModes: 0, scaleAsk: 1, keyAsk: 1, figpKey: cfg.figKey, figpMax: cfg.figMax, figpAlt: cfg.figAlt, figpSize: cfg.figSize, figpPos: cfg.figPos, figpClefs: cfg.figClefs });
      if (v >= 9) {
        cfg.intervals += r.u(11) * 8192;
        cfg.scales += r.u(9) * 16;
        cfg.scaleModes = r.u(1);
        cfg.scaleAsk = r.u(2);
        cfg.keyAsk = r.u(2);
        Object.assign(cfg, { figpKey: r.u(2), figpMax: r.u(3), figpAlt: r.u(2), figpSize: r.u(2), figpPos: r.u(4), figpClefs: r.u(2) });
        MQ.FLAG_KEYS.slice(MQ.FLAG_KEYS_V1.length).forEach((k) => (cfg.flags[k] = !!r.u(1)));
        if (v >= 10) {
          if (r.u(1)) cfg.clefs |= 4;
          cfg.staffOv = {};
          STAFF_TABS.forEach((k) => (cfg.staffOv[k] = r.u(2)));
          cfg.helpOv = {};
          HELP_TABS.forEach((k) => (cfg.helpOv[k] = r.u(2)));
          cfg.figpAsk = r.u(2);
          if (v >= 11) cfg.chordAsk = r.u(2);
        }
        cfg.progs.forEach((e) => {
          if (e.kind === 'auto') return;
          e.chords.forEach((c) => { if (r.u(1)) c.bass = { step: r.u(3), alt: r.u(3) - 2 }; });
        });
      }
      cfg.vc = MQ.defaultConfig().vc;
      cfg.vp = MQ.defaultConfig().vp;
      cfg.canvasPts = 0;
      cfg.retakes = null;
      cfg.keys = MQ.defaultConfig().keys;
      cfg.counts.keys = 0;
      cfg.analysis = MQ.defaultConfig().analysis;
      cfg.counts.analysis = 0;
      cfg.rhythm = MQ.defaultConfig().rhythm;
      cfg.counts.rhythm = 0;
      if (cfg.helpOv.vprog == null) cfg.helpOv.vprog = 2;
      if (v >= 12) {
        cfg.helpOv.vprog = r.u(2);
        [cfg.vc, cfg.vp].forEach((b, i) => {
          b.sizes = r.u(3); b.quals = r.u(5); b.alts = r.u(1); b.key = r.u(2); b.slash = r.u(1); b.ask = r.u(2);
          if (i === 1) b.len = r.u(3) + 2;
          b.tech = {};
          MQ.TECHNIQUES.forEach((t) => { const n = r.u(5); if (n) b.tech[t.id] = n; });
          b.opts = { thirdsStaff: r.u(2), thirdsOmitRoot: r.u(1), blockStaff: r.u(2), planesOpen: r.u(2), popNotes: r.u(1) ? 4 : 3, popStaff: r.u(2), inner2: r.u(1) };
        });
        if (v >= 14) cfg.canvasPts = r.u(10);
        if (v >= 15) {
          cfg.counts.keys = r.u(6);
          cfg.keys = { prompts: r.u(3), answers: r.u(3), low: r.u(7), high: r.u(7) };
          const ext = r.b.length - r.p >= 8 ? r.u(8) : 0;
          if (ext >= 1) {
            const an = { override: r.u(2), img: null, notes: '', regions: [] };
            if (r.u(1)) an.img = { hash: r.u(32) };
            an.notes = r.strN(8);
            const n = r.u(6);
            for (let i = 0; i < n; i++) {
              const box = { x: r.u(10) / 1023, y: r.u(10) / 1023, w: r.u(10) / 1023, h: r.u(10) / 1023 };
              an.regions.push(Object.assign(box, { ask: MQ.ANALYSIS_ASKS[r.u(2)] || 'roman', roman: r.str(), symbol: r.str() }));
            }
            cfg.analysis = an;
            cfg.counts.analysis = n;
          }
          if (ext === 2) cfg.retakes = r.u(5);
          if (ext >= 3) {
            if (r.u(1)) cfg.retakes = r.u(5);
            const rh = { playsEx: r.u(4), playsAns: r.u(4), examples: [] };
            if (ext >= 4) {
              rh.score = r.u(1) ? 'percent' : 'notes';
              rh.outOf = r.u(10);
              if (r.u(1)) {
                const gen = r.u(3);
                rh.auto = {
                  on: true, gen, count: r.u(5) + 1, measures: r.u(2) + 1, level: r.u(3) + 1, tempo: r.u(8) + 30,
                  custom: { lo: r.u(3) + 2, hi: r.u(3) + 2, compound: r.u(1), cut: r.u(1), uneven: r.u(1), shortest: r.u(2) + 2, dotted: r.u(1), triplets: r.u(1), offbeats: r.u(2) },
                };
              }
            }
            if (!rh.auto) {
              const n = r.u(4);
              for (let i = 0; i < n; i++) rh.examples.push(readExample(r));
            }
            cfg.rhythm = MQ.rhythmSettings(rh);
            cfg.counts.rhythm = rh.auto ? rh.auto.count : rh.examples.length;
          }
        }
        const sum = (b) => MQ.TECHNIQUES.reduce((n, t) => n + ((b.tech && b.tech[t.id]) || 0), 0);
        cfg.counts.voicing = sum(cfg.vc);
        cfg.counts.vprog = sum(cfg.vp);
      }
      cfg.v = v; // older quizzes keep their original questions
      return cfg;
    } catch (e) {
      if (e instanceof CodeError) throw e;
      throw new CodeError('This quiz code is incomplete.');
    }
  }

  // ---------- report codes ----------
  const sealKey = (cfg, qid) => `clefwork:${cfg.seed}:${qid}`;

  // report: {name, submittedAt (ms), totalSec, partial, items:[{type, clef, credit 0-7, answered, sec}]}
  // ---------- student answers inside report codes (version 4) ----------
  // Each question's entry is written in a self-describing way so a report can be read without the quiz:
  //   choice questions: 0 = blank, else choice + 1 (3 bits)
  //   staff questions: for each answer column, how many notes, then each note (letter-step 7, accidental 3, staff 1)
  //   progressions: for each chord, the Roman numeral and chord-symbol boxes as short text (up to 15 characters)
  const isChoiceType = (t) => t === 'identify' || t === 'keysig';
  // Music signs students may type get their own small codes; other non-ASCII characters become "?".
  const SIGNS = ['', '°', 'ø', '♭', '♯', 'Δ', '♮', 'º', 'Ø'];
  function writeText(w, str) {
    const chars = Array.from(String(str || '').trim()).slice(0, 15)
      .map((c) => (SIGNS.indexOf(c) > 0 ? SIGNS.indexOf(c) : c.charCodeAt(0) < 128 && c.charCodeAt(0) >= 32 ? c.charCodeAt(0) : 63));
    w.u(chars.length, 4);
    chars.forEach((c) => w.u(c, 7));
  }
  function readText(r) {
    const n = r.u(4);
    let s = '';
    for (let i = 0; i < n; i++) { const c = r.u(7); s += c < SIGNS.length && c > 0 ? SIGNS[c] : String.fromCharCode(c); }
    return s;
  }
  const KEY_ANSWERS = ['staff', 'name', 'piano'];
  // `plays` (rhythm questions): how often the student played the example and their own answer.
  function writeAnswer(w, q, resp, plays) {
    if (q.type === 'rhythm') {
      const R = q.rh;
      w.u(R.parts - 1, 1).u(R.measures - 1, 2);
      for (let l = 0; l < R.parts; l++) for (let m = 0; m < R.measures; m++) writeEvents(w, resp && resp[l] && resp[l][m]);
      w.u(Math.min(31, (plays && plays.ex) || 0), 5).u(Math.min(31, (plays && plays.ans) || 0), 5);
      return;
    }
    if (q.type === 'analysis') { writeText(w, resp && resp.r); writeText(w, resp && resp.s); return; }
    if (q.type === 'keys') {
      const kind = KEY_ANSWERS.indexOf(q.keys.answer);
      w.u(kind, 2);
      if (q.keys.answer === 'name') { writeText(w, resp); return; }
      if (q.keys.answer === 'piano') { w.u(typeof resp === 'number' ? 1 : 0, 1); if (typeof resp === 'number') w.u(resp, 7); return; }
    }
    if (q.type === 'voicing' || q.type === 'vprog') {
      // A voicing answer is either notes on the staff or one typed chord symbol per chord.
      const list = q.symbolAnswers || (q.symbolAnswer ? [q.symbolAnswer] : null);
      w.u(list ? 1 : 0, 1);
      if (list) {
        const n = Math.min(15, list.length);
        w.u(n, 4);
        for (let j = 0; j < n; j++) writeText(w, q.symbolAnswers ? (resp && resp[j]) : resp);
        return;
      }
    }
    if (q.type === 'chord') {
      w.u(q.symbolAnswer ? 1 : 0, 1);
      if (q.symbolAnswer) { writeText(w, resp); return; }
    }
    if (q.type === 'figprog') {
      const n = Math.min(15, q.figuredList.length);
      w.u(n, 4);
      for (let j = 0; j < n; j++) { const a = (resp && resp[j]) || {}; writeText(w, a.text); writeText(w, a.fig); }
    } else if (q.type === 'figured') {
      // 0 = typed numeral and figure, 1 = notes written on the staff
      const spell = q.figured.ask === 'spell';
      w.u(spell ? 1 : 0, 1);
      if (!spell) { const a = resp || {}; writeText(w, a.text); writeText(w, a.fig); }
      else {
        const notes = ((resp && resp[0]) || []).filter(Boolean).slice(0, 15);
        w.u(notes.length, 4);
        notes.forEach((p) => w.u(MQ.dia(p), 7).u(Math.max(-2, Math.min(2, p.alt)) + 2, 3).u(p.st === 1 ? 1 : 0, 1));
      }
    } else if (q.type === 'progression') {
      const n = Math.min(15, q.prog.chords.length);
      w.u(n, 4);
      for (let j = 0; j < n; j++) ['r', 's'].forEach((k) => writeText(w, resp && resp[k] && resp[k][j]));
    } else if (isChoiceType(q.type)) {
      w.u(resp == null ? 0 : resp + 1, 3);
    } else {
      const cols = q.columns.map((c, i) => (c.cap > 0 ? i : -1)).filter((i) => i >= 0).slice(0, 15);
      w.u(cols.length, 4);
      cols.forEach((ci) => {
        const notes = ((resp && resp[ci]) || []).filter(Boolean).slice(0, 15);
        w.u(notes.length, 4);
        notes.forEach((p) => w.u(MQ.dia(p), 7).u(Math.max(-2, Math.min(2, p.alt)) + 2, 3).u(p.st === 1 ? 1 : 0, 1));
      });
    }
  }
  function readAnswer(r, type, ver) {
    if (type === 'rhythm') {
      const parts = r.u(1) + 1, n = r.u(2) + 1, layers = [];
      for (let l = 0; l < parts; l++) { const L = []; for (let m = 0; m < n; m++) L.push(readEvents(r)); layers.push(L); }
      return { kind: 'rhythm', value: layers, plays: { ex: r.u(5), ans: r.u(5) } };
    }
    if (type === 'analysis') return { kind: 'text', value: { r: readText(r), s: readText(r) } };
    if (type === 'keys' && ver >= 7) {
      const kind = KEY_ANSWERS[r.u(2)];
      if (kind === 'name') return { kind: 'text', value: readText(r) };
      if (kind === 'piano') return { kind: 'key', value: r.u(1) ? r.u(7) : null };
      // a note written on the staff: read below like any staff answer
    }
    if ((type === 'voicing' || type === 'vprog') && ver >= 6) {
      if (r.u(1)) {
        const n = r.u(4), out = [];
        for (let j = 0; j < n; j++) out.push(readText(r));
        return { kind: 'text', value: out.length === 1 ? out[0] : out };
      }
    }
    // Chord questions come in two shapes: notes written on the staff, or a typed chord symbol.
    if (type === 'chord' && ver >= 5) {
      if (r.u(1)) return { kind: 'text', value: readText(r) };
      const cols = [];
      const nc = r.u(4);
      for (let c = 0; c < nc; c++) {
        const n = r.u(4), notes = [];
        for (let j = 0; j < n; j++) { const d = r.u(7), alt = r.u(3) - 2, st = r.u(1); const p = MQ.fromDia(d, alt); if (st) p.st = 1; notes.push(p); }
        cols.push(notes);
      }
      return { kind: 'staff', value: cols };
    }
    if (type === 'figprog') {
      const n = r.u(4), out = [];
      for (let j = 0; j < n; j++) out.push({ text: readText(r), fig: readText(r) });
      return { kind: 'text', value: out };
    }
    if (type === 'figured') {
      if (!r.u(1)) return { kind: 'text', value: { text: readText(r), fig: readText(r) } };
      const n = r.u(4), notes = [];
      for (let j = 0; j < n; j++) { const d = r.u(7), alt = r.u(3) - 2, st = r.u(1); const p = MQ.fromDia(d, alt); if (st) p.st = 1; notes.push(p); }
      return { kind: 'staff', value: [notes] };
    }
    if (type === 'progression') {
      const n = r.u(4), out = { r: [], s: [] };
      for (let j = 0; j < n; j++) { out.r.push(readText(r)); out.s.push(readText(r)); }
      return { kind: 'text', value: out };
    }
    if (isChoiceType(type)) { const v = r.u(3); return { kind: 'choice', value: v ? v - 1 : null }; }
    const cols = [];
    const nc = r.u(4);
    for (let c = 0; c < nc; c++) {
      const n = r.u(4), notes = [];
      for (let j = 0; j < n; j++) { const d = r.u(7), alt = r.u(3) - 2, st = r.u(1); const p = MQ.fromDia(d, alt); if (st) p.st = 1; notes.push(p); }
      cols.push(notes);
    }
    return { kind: 'staff', value: cols };
  }
  // Turns a decoded answer back into the response shape a question card expects.
  function answerFor(q, a) {
    if (!a) return null;
    if (a.kind !== 'staff') return a.value;
    const cols = a.value.slice();
    return q.columns.map((c) => (c.cap > 0 ? cols.shift() || [] : []));
  }

  // report.answers (optional): {qs, resp, plays} — the quiz's questions, what the student entered,
  // and (rhythm) how often each example and answer was played.
  function encodeReport(report, cfg, quizCode) {
    const qid = quizId(quizCode);
    const w = new Writer();
    // Version 10 added rhythm answers, with how often each example and answer was played.
    w.u(11, 4).u(qid, 16).str(report.name, 40)
      .u(Math.max(0, Math.round((report.submittedAt - EPOCH) / 60000)), 24)
      .u(Math.min(65535, Math.round(report.totalSec)), 16)
      .u(report.partial ? 1 : 0, 1).u(report.items.length, 7);
    report.items.forEach((it) => {
      w.u(MQ.typeIndex(it.type), 4).u(['treble', 'bass', 'grand'].indexOf(it.clef) & 3, 2);
      if (report.partial) w.u(it.credit, 3); else w.u(it.credit === 7 ? 1 : 0, 1);
      w.u(it.answered ? 1 : 0, 1).u(Math.min(63, Math.round(it.sec)), 6);
    });
    const ans = report.answers;
    w.u(ans ? 1 : 0, 1);
    if (ans) ans.qs.forEach((q, i) => writeAnswer(w, q, ans.resp[i], ans.plays && ans.plays[i]));
    w.u(Math.max(1, Math.min(31, Math.round(report.attempt || 1))), 5);   // version 9: which attempt this was
    // Version 11: rhythm quizzes are scored note by note — how many notes each example has and how
    // many were wrong, and whether the score is those notes or a percent of a set total.
    const sc = report.scoring;
    w.u(sc ? 1 : 0, 1);
    if (sc) {
      w.u(sc.mode === 'percent' ? 1 : 0, 1).u(Math.max(1, Math.min(1000, Math.round(sc.outOf || 100))), 10);
      report.items.forEach((it) => { if (it.type === 'rhythm') w.u(Math.min(511, it.notes || 0), 9).u(Math.min(511, it.wrong || 0), 9); });
    }
    return pack(KIND_REPORT, w.b, sealKey(cfg, qid));
  }

  function decodeReport(code) {
    const { kind, body, clean } = unpack(code);
    if (kind === KIND_QUIZ) throw new CodeError('This is a quiz code, not a student report. Paste it in the quiz code box instead.');
    if (kind !== KIND_REPORT) throw new CodeError('This isn’t a Clefwork report code.');
    const r = new Reader(body);
    r.u(4);
    const seal = r.u(16);
    const restBits = body.slice(20);
    try {
      const ver = r.u(4);
      if (ver < 1 || ver > 11) throw new CodeError('This report was made with a newer version of Clefwork.');
      const rep = { code: group(clean), quizId: r.u(16), name: r.str() };
      rep.submittedAt = EPOCH + r.u(24) * 60000;
      rep.totalSec = r.u(16);
      rep.partial = !!r.u(1);
      const n = r.u(7);
      rep.items = [];
      for (let i = 0; i < n; i++) {
        const type = MQ.TYPES[r.u(ver >= 3 ? 4 : 3)];
        // Version 1 reports used one bit for the clef; voicings were always the grand staff then.
        const clef = ver >= 2 ? ['treble', 'bass', 'grand'][r.u(2)] || 'treble'
          : r.u(1) ? (type && type.id === 'voicing' ? 'grand' : 'bass') : type && type.id === 'voicing' ? 'grand' : 'treble';
        const credit = rep.partial ? r.u(3) : r.u(1) * 7;
        rep.items.push({ type: type ? type.id : 'place', clef, credit, answered: !!r.u(1), sec: r.u(6) });
      }
      rep.answers = null;
      if (ver >= 4 && r.u(1)) rep.answers = rep.items.map((it) => readAnswer(r, it.type, ver));
      rep.attempt = ver >= 9 ? r.u(5) || 1 : null;              // older reports didn't say
      rep.scoring = null;
      if (ver >= 11 && r.u(1)) {
        rep.scoring = { mode: r.u(1) ? 'percent' : 'notes', outOf: r.u(10) };
        rep.items.forEach((it) => { if (it.type === 'rhythm') { it.notes = r.u(9); it.wrong = r.u(9); } });
      }
      // True when the seal matches the quiz this report claims to belong to.
      rep.verifySeal = (cfg) => seal16(bitsToBytes(restBits), sealKey(cfg, rep.quizId)) === seal;
      return rep;
    } catch (e) {
      if (e instanceof CodeError) throw e;
      throw new CodeError('This report code is incomplete.');
    }
  }

  // What one question is worth and earned: a point, or with note scoring one point a note, less
  // one for each wrong note (never below nothing).
  function itemScore(it, sc) {
    if (sc && it.notes != null) {
      if (!it.notes) return { pts: it.wrong ? 0 : 1, max: 1, full: !it.wrong };
      return { pts: Math.max(0, it.notes - it.wrong), max: it.notes, full: !it.wrong };
    }
    return { pts: it.credit / 7, max: 1, full: it.credit === 7 };
  }
  // n: what the quiz is out of (questions, notes, or the teacher's total); count: questions.
  function reportStats(rep) {
    const sc = rep.scoring || null;
    const count = rep.items.length;
    const scores = rep.items.map((it) => itemScore(it, sc));
    const raw = scores.reduce((s, x) => s + x.pts, 0), max = scores.reduce((s, x) => s + x.max, 0);
    const percent = !!sc && sc.mode === 'percent';
    const points = percent ? (max ? (raw / max) * sc.outOf : 0) : raw, n = percent ? sc.outOf : max;
    const full = scores.filter((x) => x.full).length;
    const by = (key) => {
      const m = {};
      rep.items.forEach((it, i) => {
        const k = it[key], x = scores[i];
        m[k] = m[k] || { n: 0, count: 0, points: 0, full: 0, sec: 0 };
        m[k].count++; m[k].n += x.max; m[k].points += x.pts; m[k].full += x.full ? 1 : 0; m[k].sec += it.sec;
      });
      return m;
    };
    const answered = rep.items.filter((it) => it.answered).length;
    let slowest = -1;
    rep.items.forEach((it, i) => { if (slowest < 0 || it.sec > rep.items[slowest].sec) slowest = i; });
    return {
      n, count, points, full, answered, pct: max ? (raw / max) * 100 : 0,
      // Note scoring: how many notes there were, and how many were wrong.
      noted: !!sc, notes: sc ? max : 0, wrong: sc ? rep.items.reduce((s, it) => s + (it.wrong || 0), 0) : 0, mode: sc ? sc.mode : null,
      byType: by('type'), byClef: by('clef'),
      avgSec: count ? rep.items.reduce((s, it) => s + it.sec, 0) / count : 0,
      slowest,
    };
  }

  Object.assign(MQ, { retakeLimit, encodeQuiz, decodeQuiz, encodeReport, decodeReport, answerFor, reportStats, quizId, normalize, CodeError });
})(typeof window !== 'undefined' ? window : globalThis);
