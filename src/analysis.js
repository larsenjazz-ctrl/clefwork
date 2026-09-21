/* Clefwork Analysis — questions on a picture of real music. The teacher boxes part of the score
   and gives its Roman numeral, its chord symbol, or both; students type their answers beside the
   music. Everything here is shared by the builder, the quiz, the grade checker and results pages.
   - Roman numerals are typed with their figures (V65, V6/5, vii°7, viiø43, V7/V, N6, Ger+6) and
     marked by what they mean, not how they were typed.
   - Chord symbols use the same reader and spelling as the rest of Clefwork (mi, ma, °, ♭/♯).
   - The score travels inside the quiz link as a compressed black-and-white picture. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const ASKS = ['', 'roman', 'symbol', 'both'];   // the number each answer type is stored as
  const MAX_REGIONS = 60;

  function analysisSettings(block) {
    const b = block || {};
    if (!Array.isArray(b.regions)) b.regions = [];
    if (b.override == null) b.override = 0;        // 0 each question's own, else an index into ASKS
    if (b.notes == null) b.notes = '';             // instructions shown to students (the key, say)
    if (b.img === undefined) b.img = null;         // {hash, w, h} of the score picture
    return b;
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
    s.regions.forEach((r, i) => {
      if (want !== 'symbol' && !alternatives(r.roman).length) out.roman.push(i + 1);
      if (want !== 'roman' && !alternatives(r.symbol).length) out.symbol.push(i + 1);
    });
    return out;
  }
  const ASK_TEXT = { roman: 'Roman numeral with figures', symbol: 'Chord symbol', both: 'Roman numeral and chord symbol' };
  const partsOf = (q) => (q.an.ask === 'both' ? ['r', 's'] : q.an.ask === 'symbol' ? ['s'] : ['r']);
  function analysisQuestions(cfg) {
    const a = analysisSettings(cfg.analysis);
    const n = Math.min(a.regions.length, cfg.counts.analysis == null ? a.regions.length : cfg.counts.analysis);
    return a.regions.slice(0, n).map((r, i) => {
      const ask = askFor(r, a.override);
      return {
        type: 'analysis', clef: 'treble',
        text: `Box ${i + 1}: ${ASK_TEXT[ask]}`,
        hint: ask === 'symbol' ? 'For example Dmi7, G7, Cma7, B°, Bmi7♭5 or C/E.' : 'Type the numeral and its figures together, such as V65, ii6 or vii°7.',
        an: { n: i, region: { x: r.x, y: r.y, w: r.w, h: r.h }, ask, roman: alternatives(r.roman), symbol: alternatives(r.symbol), img: a.img ? a.img.hash : null },
        sig: 'an' + i, tags: [],
      };
    });
  }
  // One answer box: r (Roman numeral) or s (chord symbol).
  function markAnalysisPart(q, k, resp, cfg) {
    const got = resp && resp[k];
    if (!got || !String(got).trim()) return false;
    if (k === 'r') { const p = parseRoman(got); return !!p && q.an.roman.some((w) => sameRoman(parseRoman(w), p)); }
    return q.an.symbol.some((w) => MQ.gradeVoiceSymbol(w, String(got).trim(), cfg) === 1);
  }
  function gradeAnalysis(q, resp, cfg) {
    const parts = partsOf(q);
    return parts.filter((k) => markAnalysisPart(q, k, resp, cfg)).length / parts.length;
  }
  const hasAnalysisAnswer = (q, resp) => !!resp && partsOf(q).some((k) => String(resp[k] || '').trim());
  const romanAnswerText = (q) => q.an.roman.map((w) => romanText(parseRoman(w)) || w).join(' or ');
  const symbolAnswerText = (q) => q.an.symbol.map(symbolText).join(' or ');
  function describeAnalysis(q) {
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
      return regions.map((r) => ({ r, b: bandOf(r, bands) })).sort((a, b) => a.b - b.b || a.r.x - b.r.x).map((e) => e.r);
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
      const bi = bandOf(q.an.region, bands), b = bands[bi];
      const above = bi === 0 ? 0 : (bands[bi - 1].y1 + b.y0) / 2;
      const below = bi === bands.length - 1 ? 1 : (b.y1 + bands[bi + 1].y0) / 2;
      const cx = q.an.region.x + q.an.region.w / 2;
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
  // so shadows and yellowed paper drop out — trims the empty margins and packs it. opts.crop reuses
  // an earlier trim (fractions of the upload), so boxes already drawn stay on the same music.
  async function encodeScore(source, opts) {
    const o = Object.assign({ detail: 0, ink: 1, crop: null }, opts);
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
    const crop = { x0: minX / W, y0: minY / H, x1: (maxX + 1) / W, y1: (maxY + 1) / H };
    const w = maxX - minX + 1, h = maxY - minY + 1, rowBytes = Math.ceil(w / 8);
    const bits = new Uint8Array(rowBytes * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (ink[(y + minY) * W + x + minX]) bits[y * rowBytes + (x >> 3)] |= 128 >> (x & 7);
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
    ANALYSIS_ASKS: ASKS, ANALYSIS_MAX: MAX_REGIONS, SCORE_DETAIL: DETAIL,
    analysisSettings, alternatives, parseAnalysisRoman: parseRoman, sameRoman, romanParts, romanText, symbolOk, symbolText,
    askFor, missingAnswers, analysisQuestions, markAnalysisPart, gradeAnalysis, hasAnalysisAnswer, describeAnalysis,
    romanAnswerText, symbolAnswerText, analysisParts: partsOf,
    findBands, bandOf, readingOrder, sheetPlan, encodeScore, decodeScore, scoreURL, hashOfData,
  });
})(typeof window !== 'undefined' ? window : globalThis);
