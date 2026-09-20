/* Clefwork — printing. Builds a printable page for a quiz (PDF through the browser's print
   dialog) and a Word document, both with the teacher's header and a QR footer on every page. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});

  const PAPERS = [
    { id: 'letter', label: 'Letter — 8.5 × 11 in', css: 'letter', w: 8.5, h: 11, unit: 'in', margin: 0.75, twW: 12240, twH: 15840 },
    { id: 'legal', label: 'Legal — 8.5 × 14 in', css: 'legal', w: 8.5, h: 14, unit: 'in', margin: 0.75, twW: 12240, twH: 20160 },
    { id: 'a4', label: 'A4 — 210 × 297 mm', css: 'A4', w: 210, h: 297, unit: 'mm', margin: 19, twW: 11906, twH: 16838 },
  ];
  const paperOf = (id) => PAPERS.find((p) => p.id === id) || PAPERS[0];
  const dim = (p, v) => v + p.unit;
  // The header may take up 15% of the page at most.
  const headHeight = (p) => Math.round(p.h * 0.15 * 100) / 100;

  const two = (n) => String(n).padStart(2, '0');
  const formatDate = (d) => `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()}`;
  const today = () => formatDate(new Date());
  // Accepts mm/dd/yyyy; anything else is kept as the teacher typed it.
  function validDate(str) {
    const m = String(str || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return false;
    const [mm, dd, yy] = [+m[1], +m[2], +m[3]];
    if (mm < 1 || mm > 12 || dd < 1 || yy < 1000) return false;
    return dd <= new Date(yy, mm, 0).getDate();
  }

  // ---------- what each question needs on paper ----------
  const chordCount = (q) =>
    (q.symbolAnswers && q.symbolAnswers.length) || (q.figuredList && q.figuredList.length)
    || (q.prog && q.prog.chords && q.prog.chords.length) || 1;

  function answerFor(q) {
    if (q.choices) return { kind: 'choices', items: q.choices.slice() };
    if (q.dropdowns) return { kind: 'lines', items: q.dropdowns.map((d, i) => d.label || `Answer ${i + 1}`) };
    if (q.symbolAnswers) return { kind: 'lines', items: q.symbolAnswers.map((_, i) => `Chord ${i + 1}`) };
    if (q.symbolAnswer) return { kind: 'lines', items: ['Chord symbol'] };
    if (q.type === 'figured' || q.type === 'figprog') {
      // Column specs mean the students write the chords out; the numerals are printed for them.
      const spell = q.colSpecs ? true : q.figured && q.figured.ask === 'spell';
      if (spell) return { kind: 'staff', items: [] };
      const n = q.type === 'figprog' ? chordCount(q) : 1;
      return { kind: 'lines', items: Array.from({ length: n }, (_, i) => (n > 1 ? `Chord ${i + 1}` : 'Numeral and figures')) };
    }
    if (q.type === 'progression' && q.prog && q.prog.answer !== 'spell') {
      const what = q.prog.answer === 'roman' ? 'Numeral' : q.prog.answer === 'symbol' ? 'Symbol' : 'Numeral and symbol';
      return { kind: 'lines', items: q.prog.chords.map((_, i) => `${what} ${i + 1}`) };
    }
    // Everything else is written on the staff itself.
    return { kind: 'staff', items: [] };
  }

  // One entry per question: its number, prompt, the staff to print, and the space to answer in.
  function printModel(qs, cfg) {
    return qs.map((q, i) => ({
      n: i + 1,
      q,
      prompt: q.text,
      hint: q.hint || '',
      staff: q.noStaff ? null : q,
      answer: answerFor(q),
    }));
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---------- the printable page ----------
  function printCSS(opts) {
    const p = paperOf(opts.paper);
    const m = dim(p, p.margin);
    const staffH = opts.staffHeight || 1.25;
    const qr = opts.qrSize || 0.75;
    const foot = qr + 0.15;
    return `
@page { size: ${p.css}; margin: ${m}; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font: 12pt/1.4 Georgia, 'Times New Roman', serif; }
table.sheet { width: ${dim(p, p.w - p.margin * 2)}; margin: 0 auto; border-collapse: collapse; }
table.sheet > tbody > tr > td, table.sheet > tfoot > tr > td { padding: 0; vertical-align: top; }
table.sheet > tfoot { display: table-footer-group; }
.head { max-height: ${dim(p, headHeight(p))}; border-bottom: 1.5pt solid #000; padding-bottom: 8pt; margin-bottom: 14pt; overflow: hidden; }
.head h1 { font-size: 20pt; line-height: 1.15; margin: 0 0 4pt; letter-spacing: -0.01em; }
.head .meta { font-size: 10.5pt; margin: 0 0 6pt; }
.head .meta span + span::before { content: ' · '; }
.head .name { font-size: 11pt; margin: 0; }
.head .name b { font-weight: normal; }
.head .rule { display: inline-block; border-bottom: 0.75pt solid #000; min-width: 2.6in; }
ol.qs { list-style: none; margin: 0; padding: 0; }
li.q { display: flex; gap: 8pt; align-items: flex-start; margin: 0 0 14pt; page-break-inside: avoid; break-inside: avoid; }
li.q .pts { flex: none; width: 0.55in; border-bottom: 0.75pt solid #000; height: 1.05em; }
li.q .num { flex: none; font-weight: bold; font-size: 12pt; }
li.q .body { flex: 1; min-width: 0; }
li.q .prompt { font-size: 12pt; margin: 0; }
li.q .hint { font-size: 10pt; margin: 2pt 0 0; color: #333; }
.example { margin: 6pt 0 0; }
.example svg { display: block; height: ${staffH}in; width: auto; max-width: 100%; }
/* A grand staff is drawn larger, so there is room to write in both clefs. */
.example.is-grand svg { height: ${Math.round(staffH * 1.65 * 100) / 100}in; }
.lines { margin: 8pt 0 0; display: flex; flex-wrap: wrap; gap: 6pt 16pt; }
.lines .slot { font-size: 10pt; }
.lines .slot i { font-style: normal; display: inline-block; border-bottom: 0.75pt solid #000; min-width: 1.5in; margin-left: 4pt; }
.choices { margin: 8pt 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4pt 20pt; font-size: 11pt; }
.choices li { min-width: 1.2in; }
.choices b { font-weight: normal; }
.pfoot { display: flex; align-items: flex-end; gap: 8pt; font-size: 8pt; color: #000; padding-top: 10pt; height: ${foot}in; }
.pfoot svg { width: ${qr}in; height: ${qr}in; display: block; }
.pfoot .fid { padding-bottom: 2pt; }
/* Staff drawing, independent of the app's colours. */
svg.staff { color: #000; }
svg.staff .sl { stroke: #000; stroke-width: 1.1; fill: none; }
svg.staff .brace { fill: #000; }
svg.staff .clef-glyph { fill: #000; font-family: 'Noto Music', 'Bravura Text', 'Apple Symbols', serif; }
svg.staff .note { color: #000; }
svg.staff .note .head { fill: #000; }
svg.staff .ledger { stroke: #000; stroke-width: 1.3; }
svg.staff .slot { display: none; }
svg.staff .clabel { font: bold 13px Georgia, serif; fill: #000; }
svg.staff .clabel.is-small { font-size: 10.5px; fill: #333; }
svg.staff .sacc { font-family: 'Noto Music', serif; }
svg.staff .nlabel { display: none; }
@media screen {
  /* The preview draws the whole sheet of paper with its margins marked. */
  body { background: #f1f2f6; padding: 16px 0; }
  .page {
    position: relative; background: #fff; width: ${dim(p, p.w)}; min-height: ${dim(p, p.h)};
    padding: ${m}; margin: 0 auto; box-shadow: 0 2px 14px rgba(0,0,0,.18);
  }
  .page::before {
    content: ''; position: absolute; inset: ${m}; border: 1px dashed #98a1b5; pointer-events: none;
    /* A faint line wherever a new page starts. */
    background: repeating-linear-gradient(to bottom,
      transparent 0, transparent calc(${dim(p, p.h - p.margin * 2)} - 1px),
      rgba(152, 161, 181, 0.6) calc(${dim(p, p.h - p.margin * 2)} - 1px), rgba(152, 161, 181, 0.6) ${dim(p, p.h - p.margin * 2)});
  }
  .page::after {
    content: 'Margin ${p.margin}${p.unit}'; position: absolute; top: 3px; right: 6px;
    font: 8pt/1 -apple-system, system-ui, sans-serif; color: #98a1b5;
  }
  table.sheet { width: 100%; }
}`;
  }

  // `staffSVG(q)` returns the SVG for a question, or '' when there is nothing to draw.
  function sheetHTML(model, info, opts, staffSVG) {
    const rows = model.map((it) => {
      const svg = it.staff && staffSVG ? staffSVG(it.q) : '';
      const a = it.answer;
      let answer = '';
      if (a.kind === 'lines') {
        answer = `<div class="lines">${a.items.map((t) => `<span class="slot">${esc(t)}<i></i></span>`).join('')}</div>`;
      } else if (a.kind === 'choices') {
        answer = `<ol class="choices">${a.items.map((t, i) => `<li><b>${'ABCD'[i] || i + 1}.</b> ${esc(t)}</li>`).join('')}</ol>`;
      }
      const grand = !!(it.q && (it.q.grand || it.q.clef === 'grand'));
      return `<li class="q"><span class="pts"></span><span class="num">${it.n}.</span><div class="body">`
        + `<p class="prompt">${esc(it.prompt)}</p>`
        + (it.hint ? `<p class="hint">${esc(it.hint)}</p>` : '')
        + (svg ? `<div class="example${grand ? ' is-grand' : ''}">${svg}</div>` : '')
        + answer + '</div></li>';
    }).join('');
    const meta = [info.course, info.teacher, info.date].filter((x) => x && String(x).trim())
      .map((x) => `<span>${esc(x)}</span>`).join('');
    const qr = opts.qrSVG || '';
    // A table footer is what browsers repeat at the bottom of every printed page.
    return `<div class="page"><table class="sheet"><tfoot><tr><td>`
      + `<div class="pfoot">${qr}<span class="fid">Quiz ID ${esc(opts.quizId)}</span></div>`
      + `</td></tr></tfoot><tbody><tr><td><header class="head">`
      + `<h1>${esc(info.title || 'Music quiz')}</h1>`
      + (meta ? `<p class="meta">${meta}</p>` : '')
      + `<p class="name">Name: <span class="rule"></span></p>`
      + `</header><ol class="qs">${rows}</ol></td></tr></tbody></table></div>`;
  }

  function printHTML(model, info, opts, staffSVG) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(info.title || 'Music quiz') + '</title>'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Music&display=swap">'
      + '<style>' + printCSS(opts) + '</style></head><body>' + sheetHTML(model, info, opts, staffSVG) + '</body></html>';
  }


  // ---------- the same sheet, as a PDF ----------
  const PT = (paper, v) => (paper.unit === 'mm' ? (v * 72) / 25.4 : v * 72);

  // `artFor(q)` gives {svg, wIn, hIn} for a question's staff, or null when there is nothing to draw.
  function pdfSheet(model, info, opts, artFor) {
    const paper = paperOf(opts.paper);
    const W = PT(paper, paper.w), H = PT(paper, paper.h), M = PT(paper, paper.margin);
    const right = W - M;
    const doc = MQ.pdfDoc({ width: W, height: H, title: info.title || 'Music quiz' });
    const qr = opts.qrPayload ? MQ.qrMatrix(opts.qrPayload, { ecc: 'L' }) : null;
    const qrPt = (opts.qrSize || 0.75) * 72;
    const footTop = H - M - (qr ? qrPt : 10);
    const bottom = footTop - 12;
    const PTS_W = 40, NUM_W = 22, GAP = 6;
    const textX = M + PTS_W + GAP + NUM_W;
    const textW = right - textX;
    let y = M;

    function footer() {
      doc.save().gray(0);
      if (qr) {
        const mod = qrPt / (qr.size + 8);
        qr.modules.forEach((row, r) => row.forEach((v, c) => {
          if (v) doc.rect(M + (c + 4) * mod, footTop + (r + 4) * mod, mod * 1.02, mod * 1.02);
        }));
        doc.fill();
      }
      MQ.pdfText(doc, 'Quiz ID ' + opts.quizId, M + (qr ? qrPt + 8 : 0), H - M - 2, 8, 'F4');
      doc.restore();
    }
    function page() { doc.addPage(); footer(); y = M; }
    page();

    // ---------- header ----------
    const title = info.title || 'Music quiz';
    y += 17;
    MQ.pdfText(doc, title, M, y, 20, 'F2');
    y += 5;
    const meta = [info.course, info.teacher, info.date].filter((x) => x && String(x).trim()).join('   ·   ');
    if (meta) { y += 12; MQ.pdfText(doc, meta, M, y, 10.5, 'F1'); }
    y += 16;
    const nameW = MQ.pdfTextWidth('Name: ', 11, 'F1');
    MQ.pdfText(doc, 'Name: ', M, y, 11, 'F1');
    doc.gray(0).line(M + nameW, y + 2, M + nameW + 260, y + 2, 0.75);
    y += 8;
    doc.line(M, y, right, y, 1.2);          // the header ends here, inside the top 15% of the page
    y += 16;

    // ---------- questions ----------
    model.forEach((it) => {
      const prompt = MQ.pdfWrap(it.prompt, textW, 12, 'F1');
      const hint = it.hint ? MQ.pdfWrap(it.hint, textW, 10, 'F1') : [];
      const art = artFor ? artFor(it.q) : null;
      const artW = art ? Math.min(textW, art.wIn * 72) : 0;
      const artH = art ? (artW / (art.wIn * 72)) * art.hIn * 72 : 0;
      const a = it.answer;
      const slotW = Math.min(textW, 190);
      const perRow = Math.max(1, Math.floor(textW / slotW));
      const choiceCols = a.kind === 'choices'
        ? Math.max(1, Math.min(a.items.length, Math.floor(textW / Math.max(90, ...a.items.map((t, i) => MQ.pdfTextWidth(`${'ABCD'[i] || i + 1}.  ${t}`, 11, 'F1') + 18)))))
        : 1;
      const answerH = a.kind === 'lines' ? Math.ceil(a.items.length / perRow) * 18 + 4
        : a.kind === 'choices' ? Math.ceil(a.items.length / choiceCols) * 16 + 4 : 0;
      const blockH = prompt.length * 15 + hint.length * 12.5 + (art ? artH + 8 : 0) + answerH + 14;
      if (y + blockH > bottom && y > M + 10) page();
      let ty = y + 11;
      doc.gray(0).line(M, ty + 2, M + PTS_W, ty + 2, 0.75);
      const numText = it.n + '.';
      MQ.pdfText(doc, numText, M + PTS_W + GAP + NUM_W - 6 - MQ.pdfTextWidth(numText, 12, 'F2'), ty, 12, 'F2');
      prompt.forEach((line, i) => { MQ.pdfText(doc, line, textX, ty + i * 15, 12, 'F1'); });
      let by = ty + prompt.length * 15;
      if (hint.length) {
        doc.gray(0.3);
        hint.forEach((line, i) => { MQ.pdfText(doc, line, textX, by + 1 + i * 12.5, 10, 'F1'); });
        doc.gray(0);
        by += hint.length * 12.5;
      }
      if (art) {
        MQ.drawSVG(doc, art.svg, { x: textX, y: by + 4, w: artW, h: artH });
        by += artH + 8;
      }
      if (a.kind === 'lines') {
        a.items.forEach((label, i) => {
          const col = i % perRow, row = Math.floor(i / perRow);
          const lx = textX + col * slotW, ly = by + 12 + row * 18;
          const lw = MQ.pdfTextWidth(label + ': ', 10, 'F1');
          MQ.pdfText(doc, label + ': ', lx, ly, 10, 'F1');
          doc.gray(0).line(lx + lw, ly + 2, lx + slotW - 14, ly + 2, 0.75);
        });
        by += Math.ceil(a.items.length / perRow) * 18 + 4;
      } else if (a.kind === 'choices') {
        const colW = textW / choiceCols;
        a.items.forEach((t, i) => {
          const col = i % choiceCols, row = Math.floor(i / choiceCols);
          MQ.pdfText(doc, `${'ABCD'[i] || i + 1}.  ${t}`, textX + col * colW, by + 13 + row * 16, 11, 'F1');
        });
        by += Math.ceil(a.items.length / choiceCols) * 16 + 4;
      }
      y = by + 14;
    });
    return doc.bytes();
  }

  Object.assign(MQ, {
    PAPERS, paperOf, headHeight, formatDate, today, validDate,
    printModel, printAnswerFor: answerFor, printCSS, sheetHTML, printHTML, printEscape: esc, pdfSheet, pdfPoints: PT,
  });
})(typeof window !== 'undefined' ? window : globalThis);
