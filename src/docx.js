/* Clefwork — writing a Word document (and the small pieces it needs: a zip container and a
   PNG encoder) with no outside libraries. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});

  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  const bytesOf = (d) => (typeof d === 'string' ? utf8(d) : d instanceof Uint8Array ? d : new Uint8Array(d));

  // ---------- zip (stored, no compression) ----------
  function zipBytes(files) {
    const parts = [];
    const dir = [];
    let at = 0;
    const put = (arr) => { parts.push(arr); at += arr.length; };
    const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];
    const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
    files.forEach((f) => {
      const name = utf8(f.name);
      const data = bytesOf(f.data);
      const crc = crc32(data);
      const offset = at;
      put(new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]));
      put(name); put(data);
      dir.push({ name, crc, size: data.length, offset });
    });
    const dirStart = at;
    dir.forEach((e) => {
      put(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
        ...u32(e.crc), ...u32(e.size), ...u32(e.size), ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(e.offset)]));
      put(e.name);
    });
    put(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(dir.length), ...u16(dir.length),
      ...u32(at - dirStart), ...u32(dirStart), ...u16(0)]));
    const out = new Uint8Array(at);
    let i = 0;
    parts.forEach((p) => { out.set(p, i); i += p.length; });
    return out;
  }

  // ---------- PNG (greyscale, stored deflate blocks) ----------
  function adler32(bytes) {
    let a = 1, b = 0;
    for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  }
  function pngBytes(width, height, pixels) {
    const raw = new Uint8Array((width + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (width + 1)] = 0;                                   // no filter on this row
      raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
    }
    // zlib stream: 0x78 0x01 then stored deflate blocks
    const blocks = [];
    for (let i = 0; i < raw.length; i += 65535) {
      const chunk = raw.subarray(i, Math.min(i + 65535, raw.length));
      const last = i + 65535 >= raw.length ? 1 : 0;
      const len = chunk.length;
      blocks.push(new Uint8Array([last, len & 0xff, (len >> 8) & 0xff, ~len & 0xff, (~len >> 8) & 0xff]), chunk);
    }
    const ad = adler32(raw);
    const zlen = 2 + blocks.reduce((n, b) => n + b.length, 0) + 4;
    const z = new Uint8Array(zlen);
    z[0] = 0x78; z[1] = 0x01;
    let at = 2;
    blocks.forEach((b) => { z.set(b, at); at += b.length; });
    z.set([(ad >>> 24) & 0xff, (ad >>> 16) & 0xff, (ad >>> 8) & 0xff, ad & 0xff], at);
    const chunk = (type, body) => {
      const out = new Uint8Array(12 + body.length);
      const dv = new DataView(out.buffer);
      dv.setUint32(0, body.length);
      out.set(utf8(type), 4);
      out.set(body, 8);
      const crcOver = new Uint8Array(4 + body.length);
      crcOver.set(utf8(type), 0); crcOver.set(body, 4);
      dv.setUint32(8 + body.length, crc32(crcOver));
      return out;
    };
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width); dv.setUint32(4, height);
    ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit greyscale
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let i = 0;
    parts.forEach((p) => { out.set(p, i); i += p.length; });
    return out;
  }
  // A QR matrix as a PNG, one module per `scale` pixels, with a light quiet zone.
  function qrPNG(text, opts) {
    const o = Object.assign({ scale: 8, quiet: 4, ecc: 'L' }, opts);
    const q = MQ.qrMatrix(text, { ecc: o.ecc });
    const n = (q.size + o.quiet * 2) * o.scale;
    const px = new Uint8Array(n * n).fill(255);
    q.modules.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      for (let y = 0; y < o.scale; y++) {
        const at = ((r + o.quiet) * o.scale + y) * n + (c + o.quiet) * o.scale;
        px.fill(0, at, at + o.scale);
      }
    }));
    return { bytes: pngBytes(n, n, px), size: n, version: q.version };
  }

  // ---------- Word ----------
  const EMU = 914400;
  const xesc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  // half-points for w:sz, twentieths of a point for spacing and indents
  const run = (text, o) => {
    const p = o || {};
    const props = `<w:rPr>${p.b ? '<w:b/>' : ''}${p.u ? '<w:u w:val="single"/>' : ''}`
      + `<w:sz w:val="${(p.pt || 12) * 2}"/><w:szCs w:val="${(p.pt || 12) * 2}"/>`
      + `${p.color ? `<w:color w:val="${p.color}"/>` : ''}</w:rPr>`;
    return `<w:r>${props}<w:t xml:space="preserve">${xesc(text)}</w:t></w:r>`;
  };
  const para = (runs, o) => {
    const p = o || {};
    const pr = `<w:pPr>${p.indent ? `<w:ind w:left="${p.indent}"/>` : ''}`
      + `<w:spacing w:before="${p.before == null ? 0 : p.before}" w:after="${p.after == null ? 60 : p.after}"/>`
      + `${p.border ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="000000"/></w:pBdr>' : ''}`
      + `${p.keep ? '<w:keepNext/><w:keepLines/>' : ''}</w:pPr>`;
    return `<w:p>${pr}${[].concat(runs).join('')}</w:p>`;
  };
  const drawing = (id, rid, wIn, hIn, name) =>
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${Math.round(wIn * EMU)}" cy="${Math.round(hIn * EMU)}"/>`
    + `<wp:docPr id="${id}" name="${xesc(name || 'Image ' + id)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${xesc(name || 'Image ' + id)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(wIn * EMU)}" cy="${Math.round(hIn * EMU)}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

  const BLANK = '                                        ';

  // model: what printModel() returns. images: {byQuestion: [{bytes, wIn, hIn} | null], qr: {bytes, wIn}}
  function docxBytes(model, info, opts, images) {
    const paper = MQ.paperOf(opts.paper);
    const marginTw = Math.round((paper.unit === 'mm' ? paper.margin / 25.4 : paper.margin) * 1440);
    const media = [];
    const addImage = (img, name) => {
      if (!img) return null;
      const idx = media.length + 1;
      media.push({ name: `image${idx}.png`, bytes: img.bytes });
      return { rid: `rIdImg${idx}`, idx, wIn: img.wIn, hIn: img.hIn, name };
    };
    const body = [];
    body.push(para(run(info.title || 'Music quiz', { b: true, pt: 20 }), { after: 40 }));
    const meta = [info.course, info.teacher, info.date].filter((x) => x && String(x).trim()).join('   ·   ');
    if (meta) body.push(para(run(meta, { pt: 10.5 }), { after: 40 }));
    body.push(para([run('Name: ', { pt: 11 }), run(BLANK, { pt: 11, u: true })], { after: 160, border: true }));
    model.forEach((it, i) => {
      const img = addImage((images.byQuestion || [])[i], `Question ${it.n}`);
      body.push(para([
        run('_______', { pt: 12 }),
        run('  ' + it.n + '. ', { b: true, pt: 12 }),
        run(it.prompt, { pt: 12 }),
      ], { before: i ? 180 : 0, after: 40, keep: true }));
      if (it.hint) body.push(para(run(it.hint, { pt: 10, color: '444444' }), { indent: 720, after: 40, keep: true }));
      if (img) body.push(para(drawing(100 + i, img.rid, img.wIn, img.hIn, img.name), { indent: 720, after: 60 }));
      const a = it.answer;
      if (a.kind === 'lines') {
        a.items.forEach((label) => body.push(para([run(label + ': ', { pt: 10 }), run(BLANK, { pt: 10, u: true })], { indent: 720, after: 40 })));
      } else if (a.kind === 'choices') {
        body.push(para(a.items.map((t, k) => run(`${'ABCD'[k] || k + 1}. ${t}    `, { pt: 11 })), { indent: 720, after: 40 }));
      }
    });
    const qr = images.qr ? addImage(images.qr, 'Quiz QR code') : null;
    const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>`
      + `<w:pgSz w:w="${paper.twW}" w:h="${paper.twH}"/>`
      + `<w:pgMar w:top="${marginTw}" w:right="${marginTw}" w:bottom="${marginTw}" w:left="${marginTw}" w:header="480" w:footer="480" w:gutter="0"/>`
      + `</w:sectPr>`;
    const document = XML + `<w:document ${W_NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;
    const footerRuns = [];
    if (qr) footerRuns.push(drawing(9000, qr.rid, qr.wIn, qr.wIn, 'Quiz QR code'), run('  ', { pt: 8 }));
    footerRuns.push(run('Quiz ID ' + opts.quizId, { pt: 8 }));
    const footer = XML + `<w:ftr ${W_NS}>${para(footerRuns, { after: 0 })}</w:ftr>`;
    const rels = (list) => XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + list.join('') + '</Relationships>';
    const imgRel = (m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`;
    const docRels = rels([
      '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
    ].concat(media.map(imgRel)));
    const footerRels = rels(media.map(imgRel));
    const types = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Default Extension="png" ContentType="image/png"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      + '</Types>';
    const rootRels = rels(['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>']);
    const files = [
      { name: '[Content_Types].xml', data: types },
      { name: '_rels/.rels', data: rootRels },
      { name: 'word/document.xml', data: document },
      { name: 'word/_rels/document.xml.rels', data: docRels },
      { name: 'word/footer1.xml', data: footer },
      { name: 'word/_rels/footer1.xml.rels', data: footerRels },
    ].concat(media.map((m) => ({ name: 'word/media/' + m.name, data: m.bytes })));
    return zipBytes(files);
  }

  Object.assign(MQ, { crc32, zipBytes, pngBytes, qrPNG, docxBytes });
})(typeof window !== 'undefined' ? window : globalThis);
