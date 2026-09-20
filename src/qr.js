/* Clefwork — QR codes, so a printed quiz can be scanned back open. Byte mode, versions 1–20,
   error correction L or M. Returns a square matrix of 0 (light) and 1 (dark) modules. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});

  // Per version and level: [error-correction codewords per block, then blocks × data codewords].
  const BLOCKS = {
    L: [[7,1,19],[10,1,34],[15,1,55],[20,1,80],[26,1,108],[18,2,68],[20,2,78],[24,2,97],[30,2,116],[18,2,68,2,69],[20,4,81],[24,2,92,2,93],[26,4,107],[30,3,115,1,116],[22,5,87,1,88],[24,5,98,1,99],[28,1,107,5,108],[30,5,120,1,121],[28,3,113,4,114],[28,3,107,5,108]],
    M: [[10,1,16],[16,1,28],[26,1,44],[18,2,32],[24,2,43],[16,4,27],[18,4,31],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44],[30,1,50,4,51],[22,6,36,2,37],[22,8,37,1,38],[24,4,40,5,41],[24,5,41,5,42],[28,7,45,3,46],[28,10,46,1,47],[26,9,43,4,44],[26,3,44,11,45],[26,3,41,13,42]],
  };
  // Alignment-pattern centres, from version 2 up.
  const ALIGN = [[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90]];
  const REMAINDER = [0,7,7,7,7,7,0,0,0,0,0,0,0,3,3,3,3,3,3,3];
  const ECC_BITS = { L: 1, M: 0 };

  const dataCapacity = (ver, level) => {
    const b = BLOCKS[level][ver - 1];
    let n = 0;
    for (let i = 1; i < b.length; i += 2) n += b[i] * b[i + 1];
    return n;
  };

  // ---------- GF(256) ----------
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function generator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      g.forEach((c, j) => { next[j] ^= mul(c, EXP[i]); next[j + 1] ^= c; });
      g = next;
    }
    return g.reverse();   // highest power first, the order the division below expects
  }
  function ecBytes(data, n) {
    const g = generator(n);
    const rem = new Array(n).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ rem.shift();
      rem.push(0);
      g.slice(1).forEach((c, i) => (rem[i] ^= mul(c, factor)));
    });
    return rem;
  }

  // ---------- the bit stream ----------
  function encodeData(bytes, ver, level) {
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4);                              // byte mode
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    const cap = dataCapacity(ver, level) * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const words = [];
    for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((v, b) => v * 2 + b, 0));
    const PAD = [0xec, 0x11];
    for (let i = 0; words.length < dataCapacity(ver, level); i++) words.push(PAD[i % 2]);
    // Split into blocks, add error correction, then interleave.
    const spec = BLOCKS[level][ver - 1];
    const ecLen = spec[0];
    const blocks = [];
    let at = 0;
    for (let i = 1; i < spec.length; i += 2) {
      for (let b = 0; b < spec[i]; b++) {
        const d = words.slice(at, at + spec[i + 1]);
        at += spec[i + 1];
        blocks.push({ d, e: ecBytes(d, ecLen) });
      }
    }
    const out = [];
    const longest = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < longest; i++) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) blocks.forEach((b) => out.push(b.e[i]));
    const stream = [];
    out.forEach((w) => { for (let i = 7; i >= 0; i--) stream.push((w >> i) & 1); });
    for (let i = 0; i < REMAINDER[ver - 1]; i++) stream.push(0);
    return stream;
  }

  // ---------- the symbol ----------
  function frame(ver) {
    const size = ver * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(null));   // null = still free
    const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < size && c < size) m[r][c] = v; };
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const on = r >= 0 && r <= 6 && c >= 0 && c <= 6
          && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(r0 + r, c0 + c, on ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    if (ver > 1) {
      const pos = ALIGN[ver - 2];
      pos.forEach((r) => pos.forEach((c) => {
        if ((r < 8 && c < 8) || (r < 8 && c > size - 9) || (r > size - 9 && c < 8)) return;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
        }
      }));
    }
    for (let i = 8; i < size - 8; i++) { const v = i % 2 ? 0 : 1; set(6, i, v); set(i, 6, v); }
    set(size - 8, 8, 1);                                  // the always-dark module
    for (let i = 0; i < 9; i++) { set(8, i, m[8][i] == null ? 2 : m[8][i]); set(i, 8, m[i][8] == null ? 2 : m[i][8]); }
    for (let i = 0; i < 8; i++) { set(8, size - 1 - i, 2); set(size - 1 - i, 8, 2); }
    if (ver >= 7) {
      for (let i = 0; i < 18; i++) { set(Math.floor(i / 3), size - 11 + (i % 3), 2); set(size - 11 + (i % 3), Math.floor(i / 3), 2); }
    }
    return m;   // 2 marks format/version areas, filled in later
  }

  const bch = (value, gen, len) => {
    let v = value << (len - 1);
    const top = 1 << (len - 1);
    for (let i = 14; i >= len - 1; i--) if (v & (1 << i)) v ^= gen << (i - (len - 1));
    return v;
  };
  function formatBits(level, mask) {
    const data = (ECC_BITS[level] << 3) | mask;
    let v = data << 10;
    for (let i = 14; i >= 10; i--) if (v & (1 << i)) v ^= 0x537 << (i - 10);
    return ((data << 10) | v) ^ 0x5412;
  }
  function versionBits(ver) {
    let v = ver << 12;
    for (let i = 17; i >= 12; i--) if (v & (1 << i)) v ^= 0x1f25 << (i - 12);
    return (ver << 12) | v;
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function penalty(m) {
    const n = m.length;
    let score = 0;
    const run = (get) => {
      for (let a = 0; a < n; a++) {
        let last = -1, len = 0;
        const hist = [];
        for (let b = 0; b < n; b++) {
          const v = get(a, b);
          if (v === last) len++;
          else { if (len >= 5) score += len - 2; hist.push(len); last = v; len = 1; }
        }
        if (len >= 5) score += len - 2;
        hist.push(len);
        // 1:1:3:1:1 patterns with four light modules on one side
        const line = [];
        for (let b = 0; b < n; b++) line.push(get(a, b));
        for (let b = 0; b <= n - 7; b++) {
          const seg = line.slice(b, b + 7).join('');
          if (seg === '1011101') {
            const before = line.slice(Math.max(0, b - 4), b);
            const after = line.slice(b + 7, b + 11);
            if ((before.length === 4 && before.every((x) => !x)) || (after.length === 4 && after.every((x) => !x))) score += 40;
          }
        }
      }
    };
    run((r, c) => m[r][c]);
    run((c, r) => m[r][c]);
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
    let dark = 0;
    m.forEach((row) => row.forEach((v) => (dark += v)));
    score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return score;
  }

  function place(base, stream, ver, level, mask) {
    const size = base.length;
    const m = base.map((row) => row.slice());
    let i = 0, up = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--;                      // skip the vertical timing line
      for (let step = 0; step < size; step++) {
        const r = up ? size - 1 - step : step;
        for (const c of [right, right - 1]) {
          if (m[r][c] !== null && m[r][c] !== 2) continue;
          if (m[r][c] === 2) continue;
          const bit = i < stream.length ? stream[i++] : 0;
          m[r][c] = MASKS[mask](r, c) ? bit ^ 1 : bit;
        }
      }
      up = !up;
    }
    // Format and version information.
    const f = formatBits(level, mask);
    const bit = (x, k) => (x >> k) & 1;
    for (let k = 0; k < 15; k++) {
      const v = bit(f, k);
      if (k < 6) m[k][8] = v;
      else if (k < 8) m[k + 1][8] = v;
      else if (k === 8) m[8][7] = v;
      else m[8][14 - k] = v;
      if (k < 8) m[8][size - 1 - k] = v;
      else m[size - 15 + k][8] = v;
    }
    m[size - 8][8] = 1;
    if (ver >= 7) {
      const vb = versionBits(ver);
      for (let k = 0; k < 18; k++) {
        const v = bit(vb, k);
        m[Math.floor(k / 3)][size - 11 + (k % 3)] = v;
        m[size - 11 + (k % 3)][Math.floor(k / 3)] = v;
      }
    }
    return m;
  }

  // The matrix for `text`: {version, size, modules}. Throws when the text is too long for version 20.
  function qrMatrix(text, opts) {
    const level = (opts && opts.ecc) === 'L' ? 'L' : 'M';
    const bytes = [];
    for (const ch of String(text)) {
      const cp = ch.codePointAt(0);
      if (cp < 128) bytes.push(cp);
      else encodeURIComponent(ch).split('%').slice(1).forEach((h) => bytes.push(parseInt(h, 16)));
    }
    let ver = 0;
    for (let v = 1; v <= 20; v++) {
      const head = 4 + (v < 10 ? 8 : 16);
      if (head + bytes.length * 8 <= dataCapacity(v, level) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('That is too much text for one QR code.');
    const stream = encodeData(bytes, ver, level);
    const base = frame(ver);
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const m = place(base, stream, ver, level, mask);
      const score = penalty(m);
      if (!best || score < best.score) best = { m, score };
    }
    return { version: ver, size: best.m.length, modules: best.m };
  }

  // The matrix as an SVG square of the given size in CSS units, with a light quiet zone.
  function qrSVG(text, px, opts) {
    const q = qrMatrix(text, opts);
    const quiet = 4, n = q.size + quiet * 2;
    let d = '';
    q.modules.forEach((row, r) => row.forEach((v, c) => { if (v) d += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  Object.assign(MQ, { qrMatrix, qrSVG });
})(typeof window !== 'undefined' ? window : globalThis);
