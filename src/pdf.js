/* Clefwork — writing a PDF by hand: pages, text in the standard Type 1 fonts, vector drawing,
   and a converter that puts one of the app's SVG staves straight onto the page. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});

  // Characters outside WinAnsi that the app actually writes.
  const WIN = { '—': 0x97, '–': 0x96, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '·': 0xb7, '°': 0xb0, 'ø': 0xf8, '…': 0x85, '′': 0x27 };
  const winByte = (ch) => {
    const cp = ch.codePointAt(0);
    if (cp < 128) return cp;
    if (WIN[ch] != null) return WIN[ch];
    if (cp <= 255) return cp;
    return 0x3f;                               // '?' for anything the font can't draw
  };
  // PDF string: bytes, with the three characters that need escaping written as escapes.
  function pdfString(text) {
    let out = '';
    for (const ch of String(text)) {
      const b = winByte(ch);
      if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\' + String.fromCharCode(b);
      else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
      else out += String.fromCharCode(b);
    }
    return '(' + out + ')';
  }
  const num = (n) => (Math.round(n * 1000) / 1000).toString();

  const FONTS = [
    { id: 'F1', base: 'Times-Roman' }, { id: 'F2', base: 'Times-Bold' }, { id: 'F3', base: 'Times-Italic' },
    { id: 'F4', base: 'Helvetica' }, { id: 'F5', base: 'Helvetica-Bold' },
  ];

  function pdfDoc(opts) {
    const o = Object.assign({ width: 612, height: 792, title: '' }, opts);
    const pages = [];
    let page = null;
    const api = {
      width: o.width,
      height: o.height,
      // ---------- pages ----------
      addPage() { page = { ops: [] }; pages.push(page); return api; },
      get pageCount() { return pages.length; },
      op(s) { page.ops.push(s); return api; },
      // ---------- graphics ----------
      save() { return api.op('q'); },
      restore() { return api.op('Q'); },
      matrix(a, b, c, d, e, f) { return api.op(`${num(a)} ${num(b)} ${num(c)} ${num(d)} ${num(e)} ${num(f)} cm`); },
      gray(v) { return api.op(`${num(v)} g ${num(v)} G`); },
      lineWidth(w) { return api.op(`${num(w)} w`); },
      moveTo(x, y) { return api.op(`${num(x)} ${num(api.height - y)} m`); },
      lineTo(x, y) { return api.op(`${num(x)} ${num(api.height - y)} l`); },
      curveTo(x1, y1, x2, y2, x, y) {
        return api.op(`${num(x1)} ${num(api.height - y1)} ${num(x2)} ${num(api.height - y2)} ${num(x)} ${num(api.height - y)} c`);
      },
      close() { return api.op('h'); },
      fill(evenOdd) { return api.op(evenOdd ? 'f*' : 'f'); },
      stroke() { return api.op('S'); },
      line(x1, y1, x2, y2, w) { return api.lineWidth(w == null ? 0.75 : w).moveTo(x1, y1).lineTo(x2, y2).stroke(); },
      rect(x, y, w, h) { return api.op(`${num(x)} ${num(api.height - y - h)} ${num(w)} ${num(h)} re`); },
      // ---------- text ----------
      text(str, x, y, font, size) {
        const f = FONTS.find((t) => t.id === font) ? font : 'F1';
        return api.op(`BT /${f} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(api.height - y)} Tm ${pdfString(str)} Tj ET`);
      },
      // ---------- the file ----------
      bytes() {
        const objs = [];
        const add = (body) => { objs.push(body); return objs.length; };          // 1-based object numbers
        const fontIds = FONTS.map((f) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f.base} /Encoding /WinAnsiEncoding >>`));
        const resources = '<< /Font << ' + FONTS.map((f, i) => `/${f.id} ${fontIds[i]} 0 R`).join(' ') + ' >> >>';
        const pagesNo = objs.length + pages.length * 2 + 1;                       // filled in below
        const kids = [];
        pages.forEach((p) => {
          const stream = p.ops.join('\n');
          const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
          const pageNo = add(`<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${num(o.width)} ${num(o.height)}] `
            + `/Resources ${resources} /Contents ${content} 0 R >>`);
          kids.push(pageNo);
        });
        const pagesObj = add(`<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
        const info = add(`<< /Title ${pdfString(o.title)} /Producer (Clefwork) >>`);
        const catalog = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
        let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
        const offsets = [];
        objs.forEach((body, i) => {
          offsets.push(out.length);
          out += `${i + 1} 0 obj\n${body}\nendobj\n`;
        });
        const xref = out.length;
        out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
        offsets.forEach((off) => { out += String(off).padStart(10, '0') + ' 00000 n \n'; });
        out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
        return bytes;
      },
    };
    return api;
  }

  // ---------- SVG → PDF ----------
  // Turns "translate(3 4) scale(-1 1)" into a matrix [a b c d e f].
  function parseTransform(str) {
    let m = [1, 0, 0, 1, 0, 0];
    const mul = (n) => {
      m = [
        m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
      ];
    };
    String(str || '').replace(/([a-z]+)\s*\(([^)]*)\)/gi, (all, name, args) => {
      const v = args.split(/[\s,]+/).filter((x) => x !== '').map(Number);
      if (name === 'translate') mul([1, 0, 0, 1, v[0] || 0, v[1] || 0]);
      else if (name === 'scale') mul([v[0] == null ? 1 : v[0], 0, 0, v[1] == null ? v[0] : v[1], 0, 0]);
      else if (name === 'matrix') mul(v);
      return '';
    });
    return m;
  }
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const compose = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];

  // One elliptical arc as up to four Béziers (the noteheads are drawn with arcs).
  function arcToCurves(x0, y0, rx, ry, rot, large, sweep, x, y) {
    if (!rx || !ry) return [[x, y, x, y, x, y]];
    const rad = (rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
    const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const check = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (check > 1) { rx *= Math.sqrt(check); ry *= Math.sqrt(check); }
    const denom = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    let factor = denom ? Math.sqrt(Math.max(0, (rx * rx * ry * ry - denom) / denom)) : 0;
    if (large === sweep) factor = -factor;
    const cx1 = (factor * rx * y1) / ry, cy1 = (-factor * ry * x1) / rx;
    const cx = cos * cx1 - sin * cy1 + (x0 + x) / 2;
    const cy = sin * cx1 + cos * cy1 + (y0 + y) / 2;
    const ang = (ux, uy, vx, vy) => {
      const dot = ux * vx + uy * vy;
      const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
      let a = Math.acos(Math.min(1, Math.max(-1, len ? dot / len : 1)));
      if (ux * vy - uy * vx < 0) a = -a;
      return a;
    };
    const start = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let sweepAng = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!sweep && sweepAng > 0) sweepAng -= 2 * Math.PI;
    if (sweep && sweepAng < 0) sweepAng += 2 * Math.PI;
    const steps = Math.ceil(Math.abs(sweepAng / (Math.PI / 2)));
    const out = [];
    const step = sweepAng / steps;
    const k = (4 / 3) * Math.tan(step / 4);
    let a0 = start;
    for (let i = 0; i < steps; i++) {
      const a1 = a0 + step;
      const p = (a) => {
        const px = Math.cos(a) * rx, py = Math.sin(a) * ry;
        return [cos * px - sin * py + cx, sin * px + cos * py + cy];
      };
      const d = (a) => {
        const px = -Math.sin(a) * rx, py = Math.cos(a) * ry;
        return [cos * px - sin * py, sin * px + cos * py];
      };
      const [px0, py0] = p(a0), [dx0, dy0] = d(a0), [px1, py1] = p(a1), [dx1, dy1] = d(a1);
      out.push([px0 + k * dx0, py0 + k * dy0, px1 - k * dx1, py1 - k * dy1, px1, py1]);
      a0 = a1;
    }
    return out;
  }

  // Walk a path's `d` and hand each piece to the drawing callbacks, already transformed.
  function walkPath(d, m, sink) {
    const tokens = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0;
    const next = () => parseFloat(tokens[i++]);
    const to = (ax, ay) => apply(m, ax, ay);
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === 'M') {
        const nx = next(), ny = next();
        x = rel ? x + nx : nx; y = rel ? y + ny : ny;
        sx = x; sy = y; px = x; py = y;
        sink.move(to(x, y));
        cmd = rel ? 'l' : 'L';
      } else if (C === 'L') {
        const nx = next(), ny = next();
        x = rel ? x + nx : nx; y = rel ? y + ny : ny;
        px = x; py = y;
        sink.line(to(x, y));
      } else if (C === 'H') { const nx = next(); x = rel ? x + nx : nx; px = x; py = y; sink.line(to(x, y)); }
      else if (C === 'V') { const ny = next(); y = rel ? y + ny : ny; px = x; py = y; sink.line(to(x, y)); }
      else if (C === 'C' || C === 'S') {
        let c1x, c1y;
        if (C === 'C') { const a = next(), b = next(); c1x = rel ? x + a : a; c1y = rel ? y + b : b; }
        else { c1x = 2 * x - px; c1y = 2 * y - py; }
        const a2 = next(), b2 = next(), a3 = next(), b3 = next();
        const c2x = rel ? x + a2 : a2, c2y = rel ? y + b2 : b2;
        const nx = rel ? x + a3 : a3, ny = rel ? y + b3 : b3;
        sink.curve(to(c1x, c1y), to(c2x, c2y), to(nx, ny));
        px = c2x; py = c2y; x = nx; y = ny;
      } else if (C === 'A') {
        const rx = next(), ry = next(), rot = next(), large = next(), sweep = next();
        const a = next(), b = next();
        const nx = rel ? x + a : a, ny = rel ? y + b : b;
        arcToCurves(x, y, rx, ry, rot, large, sweep, nx, ny).forEach((c) => {
          sink.curve(to(c[0], c[1]), to(c[2], c[3]), to(c[4], c[5]));
        });
        x = nx; y = ny; px = x; py = y;
      } else if (C === 'Z') { sink.close(); x = sx; y = sy; px = x; py = y; }
      else { next(); }                                        // anything else: skip a number
    }
  }

  // Draw one SVG element tree (as the app's staves are built) into `rect` on the page.
  function drawSVG(pdf, svg, rect) {
    const view = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const vx = view[0] || 0, vy = view[1] || 0, vw = view[2] || 1, vh = view[3] || 1;
    const scale = Math.min(rect.w / vw, rect.h / vh);
    const base = [scale, 0, 0, scale, rect.x - vx * scale, rect.y - vy * scale];
    const strokeOf = (el, inherited) => {
      const s = el.getAttribute('stroke');
      const cls = el.getAttribute('class') || '';
      if (s === 'none') return null;
      if (s) return +(el.getAttribute('stroke-width') || 1);
      if (/\b(sl|ledger)\b/.test(cls)) return /ledger/.test(cls) ? 1.3 : 1.1;
      return inherited;
    };
    const fillOf = (el, inherited) => {
      const f = el.getAttribute('fill');
      const cls = el.getAttribute('class') || '';
      if (f === 'none') return false;
      if (f) return true;
      if (/\b(head|brace|sacc)\b/.test(cls)) return true;
      return inherited;
    };
    const paint = (fill, evenOdd, strokeW) => {
      if (fill && strokeW) pdf.lineWidth(strokeW).op(evenOdd ? 'B*' : 'B');
      else if (fill) pdf.fill(evenOdd);
      else if (strokeW) pdf.lineWidth(strokeW).stroke();
    };
    const walk = (el, m, inheritFill, inheritStroke) => {
      const tag = (el.tagName || '').toLowerCase();
      const local = el.getAttribute('transform') ? compose(m, parseTransform(el.getAttribute('transform'))) : m;
      const fill = fillOf(el, inheritFill);
      const strokeW = strokeOf(el, inheritStroke);
      const width = strokeW ? Math.abs(strokeW * Math.sqrt(Math.abs(local[0] * local[3] - local[1] * local[2]))) : 0;
      const cls = el.getAttribute('class') || '';
      if (/\b(slot|nlabel|hit|halo)\b/.test(cls)) return;                       // screen-only helpers
      if (tag === 'line') {
        const [x1, y1] = apply(local, +el.getAttribute('x1'), +el.getAttribute('y1'));
        const [x2, y2] = apply(local, +el.getAttribute('x2'), +el.getAttribute('y2'));
        pdf.moveTo(x1, y1).lineTo(x2, y2);
        paint(false, false, width || 1);
      } else if (tag === 'path') {
        const evenOdd = el.getAttribute('fill-rule') === 'evenodd';
        walkPath(el.getAttribute('d'), local, {
          move: (p) => pdf.moveTo(p[0], p[1]),
          line: (p) => pdf.lineTo(p[0], p[1]),
          curve: (a, b, c) => pdf.curveTo(a[0], a[1], b[0], b[1], c[0], c[1]),
          close: () => pdf.close(),
        });
        paint(fill !== false, evenOdd, width);
      } else if (tag === 'circle') {
        const cx = +el.getAttribute('cx') || 0, cy = +el.getAttribute('cy') || 0, r = +el.getAttribute('r') || 0;
        const k = 0.5523 * r;
        const P = (ax, ay) => apply(local, ax, ay);
        const p0 = P(cx + r, cy);
        pdf.moveTo(p0[0], p0[1]);
        [[[cx + r, cy + k], [cx + k, cy + r], [cx, cy + r]],
          [[cx - k, cy + r], [cx - r, cy + k], [cx - r, cy]],
          [[cx - r, cy - k], [cx - k, cy - r], [cx, cy - r]],
          [[cx + k, cy - r], [cx + r, cy - k], [cx + r, cy]]].forEach(([a, b, c]) => {
          const A = P(a[0], a[1]), B = P(b[0], b[1]), C = P(c[0], c[1]);
          pdf.curveTo(A[0], A[1], B[0], B[1], C[0], C[1]);
        });
        paint(fill !== false, false, width);
      } else if (tag === 'text') {
        const size = (+el.getAttribute('font-size') || 13) * Math.abs(local[3]);
        const [tx, ty] = apply(local, +el.getAttribute('x') || 0, +el.getAttribute('y') || 0);
        const label = (el.textContent || '').trim();
        if (label) {
          const anchor = el.getAttribute('text-anchor');
          const w = MQ.pdfTextWidth(label, size, /\bclabel\b/.test(cls) ? 'F2' : 'F1');
          const x = anchor === 'middle' ? tx - w / 2 : anchor === 'end' ? tx - w : tx;
          MQ.pdfText(pdf, label, x, ty, size, /\bclabel\b/.test(cls) ? 'F2' : 'F1');
        }
      }
      const kids = el.children ? Array.from(el.children) : [];
      kids.forEach((kid) => walk(kid, local, fill, strokeW));
    };
    pdf.save().gray(0);
    Array.from(svg.children || []).forEach((kid) => walk(kid, base, false, null));
    pdf.restore();
    return { w: vw * scale, h: vh * scale };
  }


  // ---------- text with sharps and flats ----------
  // The standard fonts have no ♯ ♭ ♮, so those are drawn. Paths are in a 24-unit em box,
  // baseline at 0, and get scaled to the text size.
  // The same shapes the staff draws, in staff units centred on (0, 0), scaled down to text size.
  const GLYPHS = {
    '♯': { w: 0.46, h: 24.5, stroke: ['M-3.2 -12.5V11M2.6 -13.5V10', 1.3], fill: 'M-5.6 -4L5.2 -7.2V-4.2L-5.6 -1ZM-5.6 4L5.2 0.8V3.8L-5.6 7Z' },
    '♭': { w: 0.40, h: 24, stroke: ['M-3.5 -17V5.5', 1.4], fill: 'M-3.5 5.5C1 2 6.2 -1.5 5.2 -4.6C4.3 -7.2 0.4 -6.6 -3.5 -2.6V-0.8C-0.6 -3.8 2.6 -4.9 3 -3.2C3.4 -1.3 0.2 1.8 -3.5 3.6Z' },
    '♮': { w: 0.40, h: 26, stroke: ['M-3 -13V6.5M3 -6.5V13', 1.3], fill: 'M-3 -4L3 -6.2V-3.2L-3 -1ZM-3 3L3 0.8V3.8L-3 6Z' },
  };
  function drawGlyph(pdf, ch, size, x, y) {
    const g = GLYPHS[ch];
    const k = (size * 0.92) / g.h;                       // an accidental stands about as tall as a capital
    const m = [k, 0, 0, k, x, y - size * 0.30];
    const sink = {
      move: (p) => pdf.moveTo(p[0], p[1]),
      line: (p) => pdf.lineTo(p[0], p[1]),
      curve: (a, b, c) => pdf.curveTo(a[0], a[1], b[0], b[1], c[0], c[1]),
      close: () => pdf.close(),
    };
    walkPath(g.stroke[0], m, sink);
    pdf.lineWidth(g.stroke[1] * k).stroke();
    walkPath(g.fill, m, sink);
    pdf.fill();
  }
  // Rough widths for the standard fonts, used when nothing better is available (tests, mostly);
  // in a browser MQ.pdfMeasurer measures with the real font.
  const ROUGH = { F1: 0.46, F2: 0.49, F3: 0.45, F4: 0.52, F5: 0.55 };
  function pdfTextWidth(str, size, font) {
    let w = 0, plain = '';
    for (const ch of String(str)) {
      if (GLYPHS[ch]) { w += measure(plain, size, font) + GLYPHS[ch].w * size; plain = ''; }
      else plain += ch;
    }
    return w + measure(plain, size, font);
  }
  function measure(str, size, font) {
    if (!str) return 0;
    if (MQ.pdfMeasurer) { const got = MQ.pdfMeasurer(str, size, font); if (got > 0 || str === '') return got; }
    let w = 0;
    for (const ch of str) w += (ch === ' ' ? 0.28 : /[ilj.,:;'!|]/.test(ch) ? 0.26 : /[A-Z0-9]/.test(ch) ? 0.68 : ROUGH[font] || 0.46) * size;
    return w;
  }
  // Draw a line of text, drawing any accidentals by hand as it goes.
  function pdfText(pdf, str, x, y, size, font) {
    let at = x, plain = '';
    const flush = () => { if (plain) { pdf.text(plain, at, y, font, size); at += measure(plain, size, font); plain = ''; } };
    for (const ch of String(str)) {
      if (GLYPHS[ch]) { flush(); drawGlyph(pdf, ch, size, at + GLYPHS[ch].w * size * 0.5, y); at += GLYPHS[ch].w * size; }
      else plain += ch;
    }
    flush();
    return at - x;
  }
  // Break text into lines that fit `width`.
  function pdfWrap(str, width, size, font) {
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (pdfTextWidth(next, size, font) <= width || !line) line = next;
      else { lines.push(line); line = word; }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  Object.assign(MQ, { pdfDoc, pdfString, drawSVG, parseTransform, walkPath, arcToCurves, pdfText, pdfTextWidth, pdfWrap });
})(typeof window !== 'undefined' ? window : globalThis);
