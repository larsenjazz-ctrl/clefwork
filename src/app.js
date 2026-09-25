/* Clefwork — app shell: quiz builder, student quiz, and report grading. */
(function () {
  'use strict';
  const MQ = window.MQ;

  // ---------- helpers ----------
  // Text with ♯ ♭ ♮ gets each sign in its own span so it can use the music font at a readable size.
  function accText(str) {
    str = String(str);
    if (!/[♯♭♮]/.test(str)) return document.createTextNode(str);
    const frag = document.createDocumentFragment();
    str.split(/([♯♭♮])/).forEach((part) => {
      if (!part) return;
      if (/^[♯♭♮]$/.test(part)) { const sp = document.createElement('span'); sp.className = 'acc'; sp.textContent = part; frag.append(sp); }
      else frag.append(document.createTextNode(part));
    });
    return frag;
  }
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.append(k.nodeType ? k : accText(k));
    }
    return el;
  }
  function svgEl(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstChild;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('clefwork.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('clefwork.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem('clefwork.' + k); } catch (e) { /* storage unavailable */ } },
  };
  let toastTimer;
  function toast(msg, tone) {
    const el = document.getElementById('toast');
    el.replaceChildren(accText(msg));
    el.className = 'toast is-on' + (tone ? ' is-' + tone : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast'), 2800);
  }
  async function copyText(text, what) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = h('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    toast(ok ? `${what} copied` : 'Couldn’t copy automatically. Select the code and copy it by hand.', ok ? 'good' : 'bad');
    return ok;
  }
  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const fmtDur = (s) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
  const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const fmtPts = (p) => (Math.abs(p - Math.round(p)) < 0.05 ? String(Math.round(p)) : p.toFixed(1));
  const typeOf = (id) => MQ.TYPES.find((t) => t.id === id);
  // How many questions a technique-driven or list-driven category actually asks.
  const techCount = (cfg, key) => {
    const b = MQ.voiceSettings(cfg[key]);
    return MQ.TECHNIQUES.reduce((n, t) => n + (t.id === 'custom' && !(cfg.voicings || []).length ? 0 : (b.tech[t.id] || 0)), 0);
  };
  const listCount = (cfg, key) => {
    if (key === 'progression') return Math.min(cfg.counts.progression || 0, MQ.progPool(cfg).length, 30);
    if (key === 'voicing') return cfg.v != null && cfg.v < 12 ? Math.min(cfg.counts.voicing || 0, (cfg.voicings || []).length) : techCount(cfg, 'vc');
    if (key === 'vprog') return techCount(cfg, 'vp');
    if (key === 'keys') return MQ.keysCombos(cfg.keys).length ? cfg.counts.keys || 0 : 0;
    if (key === 'analysis') return Math.min(cfg.counts.analysis || 0, MQ.analysisSettings(cfg.analysis).regions.length);
    if (key === 'rhythm') {
      const b = MQ.rhythmSettings(cfg.rhythm);
      return b.auto.on ? b.auto.count : Math.min(cfg.counts.rhythm || 0, b.examples.length);
    }
    const list = key === 'custom' ? cfg.custom || [] : cfg.voicings || [];
    const n = cfg.counts[key] == null ? list.length : cfg.counts[key];
    return Math.min(n, list.length);
  };
  const sumCounts = (cfg) => MQ.BUILT_IN.reduce((s, t) => s + (cfg.counts[t.id] || 0), 0) + listCount(cfg, 'custom') + listCount(cfg, 'voicing') + listCount(cfg, 'vprog') + listCount(cfg, 'progression')
    + listCount(cfg, 'keys') + listCount(cfg, 'analysis') + listCount(cfg, 'rhythm');
  const usesGrand = (cfg) => (listCount(cfg, 'voicing') > 0 || listCount(cfg, 'vprog') > 0)
    || (listCount(cfg, 'progression') > 0 && cfg.progs.some((e) => e.staff === 'grand'))
    || ((cfg.counts.chord || 0) > 0 && !!(cfg.chordStaff & 4) && !(cfg.v && cfg.v < 7));
  const onlyKeys = (cfg) => !!(cfg.counts.keys && sumCounts(cfg) === cfg.counts.keys);
  const onlyAnalysis = (cfg) => !!(listCount(cfg, 'analysis') && sumCounts(cfg) === listCount(cfg, 'analysis'));
  const onlyRhythm = (cfg) => !!(listCount(cfg, 'rhythm') && sumCounts(cfg) === listCount(cfg, 'rhythm'));
  const clefsText = (cfg) => onlyRhythm(cfg) ? 'heard, then written on a one-line staff' : onlyAnalysis(cfg) ? 'answered beside a picture of the score' : onlyKeys(cfg) ? 'grand staff, note names & piano' : [cfg.clefs & 1 ? 'treble' : null, cfg.clefs & 2 ? 'bass' : null].filter(Boolean).join(' & ') + ' clef' + (usesGrand(cfg) ? ' + grand staff' : '');
  const clonePlaced = (pl) => (pl ? pl.map((c) => (c || []).map((p) => ({ ...p }))) : null);
  // The student version (practice + take a quiz, no quiz codes shown) is the same app with this flag set.
  const STUDENT = !!window.CLEFWORK_STUDENT;
  // Where this app is published, so links work even from inside the artifact viewer.
  const SITE = (window.CLEFWORK_BASE || '').replace(/[^/]*$/, '');
  const quizLink = (code) => (SITE ? SITE + 'student.html#take=' + withScore(code) : '');
  // The Canvas edition: a page that only takes the quiz, and a results page that stands alone.
  const MODE = window.CLEFWORK_MODE || '';
  const KEYS = MODE === 'keys';                      // Clefwork Keys: the piano and note-name app
  const ANALYSIS = MODE === 'analysis';              // Clefwork Analysis: questions on a picture of the score
  const RHYTHM = MODE === 'rhythm';                  // Clefwork Rhythm: rhythmic dictation
  const DRAFT = KEYS ? 'draft-keys' : ANALYSIS ? 'draft-analysis' : RHYTHM ? 'draft-rhythm' : 'draft';
  // An Analysis quiz's picture travels in its links, after the code: #take=CODE&img=…
  const withScore = (code) => MQ.normalize(code) + (ANALYSIS && S.aimg && S.code && MQ.normalize(code) === MQ.normalize(S.code) ? '&img=' + S.aimg.data : '');
  const canvasLink = (code) => (SITE ? SITE + 'take.html#take=' + withScore(code) : '');
  const resultsLink = (report, quiz) => (SITE
    ? SITE + 'results.html#r=' + MQ.normalize(report) + (quiz ? '&q=' + MQ.normalize(quiz) : '') : '');
  const gradeLink = (report) => (SITE ? SITE + 'clefwork.html#grade=' + MQ.normalize(report) : '');
  // Where the landing page lives: the site's front page, or the file beside this one.
  const HOME = SITE || 'index.html';
  const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();

  // ---------- state ----------
  function keysDefault() {
    const c = MQ.defaultConfig();
    Object.keys(c.counts).forEach((k) => (c.counts[k] = 0));
    c.counts.keys = 10;
    c.title = 'Keys & Notes Check';
    return c;
  }
  function analysisDefault() {
    const c = MQ.defaultConfig();
    Object.keys(c.counts).forEach((k) => (c.counts[k] = 0));
    c.title = 'Harmonic Analysis';
    c.flags.shuffle = false;
    c.flags.partial = true;
    return c;
  }
  function rhythmDefault() {
    const c = MQ.defaultConfig();
    Object.keys(c.counts).forEach((k) => (c.counts[k] = 0));
    c.title = 'Rhythmic Dictation';
    c.flags.shuffle = false;
    c.flags.partial = true;
    return c;
  }
  function loadDraft() {
    const d = store.get(DRAFT, null);
    const base = KEYS ? keysDefault() : ANALYSIS ? analysisDefault() : RHYTHM ? rhythmDefault() : MQ.defaultConfig();
    if (d && d.counts && d.flags) {
      const custom = Array.isArray(d.custom) ? d.custom : [];
      const voicings = Array.isArray(d.voicings) ? d.voicings : [];
      // Drafts from before counts existed for teacher lists asked every custom chord.
      // Progressions saved before open/closed voicings used grand-staff formats 1 and 2.
      const progs = (Array.isArray(d.progs) ? d.progs : []).map((e) => (e.voicing ? e : Object.assign({}, e, { voicing: e.format === 2 ? 'open' : 'closed' })));
      const counts = Object.assign(base.counts, { custom: custom.length, voicing: voicings.length, progression: 0 }, d.counts);
      d.staffOv = Object.assign({}, base.staffOv, d.staffOv);
      d.helpOv = Object.assign({}, base.helpOv, d.helpOv);
      return Object.assign(base, d, { counts, flags: Object.assign(base.flags, d.flags), custom, voicings, progs, progMode: d.progMode || 0 });
    }
    return base;
  }
  const S = {
    view: 'build',
    cfg: loadDraft(),
    code: '', qs: [],
    pvIdx: 0, pvShow: false, pvResp: null,
    slots: { take: null, practice: null },
    slot: 'take',
    practiceFeedback: store.get('practiceFeedback', true),
    grade: { input: '', quiz: '', sel: 0 },
    print: Object.assign({ course: '', date: '', paper: 'letter', staffH: 1.25, qr: 0.75 }, store.get('print', null)),
    // Clefwork Analysis: the builder's picture, the upload it came from (kept only in memory, for
    // changing its detail), the box being drawn or edited, and how far the student sheet is zoomed.
    aimg: null, aorig: null, aed: null, azoom: 1,
    aopt: Object.assign({ detail: 0, ink: 1 }, store.get('analysis-opts', null)),
    // Clefwork Rhythm: the example open in the builder, the note buttons' Dot / Triplet / Rest, and
    // each listener's own playback choices (count-off bars, metronome, volumes), kept on this device.
    rhEx: 0,
    rhEntry: { dot: false, trip: false, rest: false },
    listen: (() => {
      const l = Object.assign({ countIn: 1, metro: false }, store.get('rhythm-listen', null));
      l.vol = Object.assign({ piano: 0.8, oboe: 0.8, click: 0.6 }, l.vol);
      return l;
    })(),
  };
  const savePrint = () => store.set('print', S.print);
  // S.take is whichever quiz the current tab works with: a teacher's quiz, or (student version) a practice run.
  Object.defineProperty(S, 'take', { get: () => S.slots[S.slot], set: (v) => { S.slots[S.slot] = v; } });
  const tv = () => (S.slot === 'practice' ? 'practice' : 'take');
  const saveDraft = () => store.set(DRAFT, S.cfg);
  // Quizzes built or copied on this device. `created` is kept from the first time a code is seen.
  function rememberQuiz(code, cfg) {
    const id = MQ.quizId(code);
    const old = store.get('recent', []);
    const prev = old.find((q) => q.id === id);
    const list = old.filter((q) => q.id !== id);
    list.unshift({ id, code, title: cfg.title, at: Date.now(), created: (prev && (prev.created || prev.at)) || Date.now() });
    store.set('recent', list.slice(0, 30));
  }

  // ---------- small controls ----------
  function sec(id, title, sub, ...kids) {
    return h('section', { class: 'sec', id: 'sec-' + id },
      h('div', { class: 'sec-head' }, h('h2', null, title), sub ? h('p', null, sub) : null), ...kids);
  }
  function fld(label, control, help) {
    return h('label', { class: 'fld', for: control.id }, h('span', { class: 'mini-label' }, label), control, help ? h('span', { class: 'help' }, help) : null);
  }
  let grpN = 0;
  function grp(label, control, help) {
    const id = 'grp' + ++grpN;
    control.setAttribute('aria-labelledby', id);
    return h('div', { class: 'fld' }, h('span', { class: 'mini-label', id }, label), control, help ? h('span', { class: 'help' }, help) : null);
  }
  function textIn(id, value, max, placeholder, onInput) {
    const el = h('input', { type: 'text', id, maxlength: max, placeholder, autocomplete: 'off' });
    el.value = value || '';
    el.addEventListener('input', () => onInput(el.value));
    return el;
  }
  function seg(id, options, value, onPick) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup', id });
    options.forEach((o) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(o.v === value), title: o.title || null, onclick: () => {
        wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        onPick(o.v);
      } }, o.label);
      wrap.append(b);
    });
    return wrap;
  }
  function chips(id, items, mask, onChange, labelOf, titleOf, allowNone) {
    const wrap = h('div', { class: 'chips', id, role: 'group' });
    items.forEach((it, i) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!(mask & (1 << i))), title: titleOf ? titleOf(it) : null, onclick: () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        const next = on ? mask | (1 << i) : mask & ~(1 << i);
        if (!next && !allowNone) { toast('Keep at least one selected'); return; }
        mask = next;
        b.setAttribute('aria-pressed', String(on));
        onChange(mask);
      } }, labelOf(it));
      wrap.append(b);
    });
    return wrap;
  }
  function toggle(id, label, desc, checked, onChange) {
    const input = h('input', { type: 'checkbox', id, class: 'sr-only' });
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'toggle', for: id }, input, h('span', { class: 'track', 'aria-hidden': 'true' }),
      h('span', { class: 'toggle-text' }, h('strong', null, label), desc ? h('small', null, desc) : null));
  }
  function counter(id, label, onChange) {
    let max = 30;
    const inp = h('input', { type: 'number', id, min: 0, inputmode: 'numeric', 'aria-label': `Number of ${label} questions` });
    const paint = (v) => { dec.disabled = v <= 0; inc.disabled = v >= max; };
    const set = (v) => { v = Math.max(0, Math.min(max, Math.round(+v || 0))); inp.value = v; paint(v); onChange(v); };
    inp.addEventListener('change', () => set(inp.value));
    const dec = h('button', { type: 'button', 'aria-label': `Fewer ${label} questions`, onclick: () => set(+inp.value - 1) }, '−');
    const inc = h('button', { type: 'button', 'aria-label': `More ${label} questions`, onclick: () => set(+inp.value + 1) }, '+');
    const el = h('div', { class: 'stepper' }, dec, inp, inc);
    el.sync = (v, m) => {
      max = m;
      inp.max = m;
      if (document.activeElement !== inp) inp.value = v;
      paint(v);
    };
    return el;
  }

  // ---------- playback ----------
  const SPEAKER = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5h3l4.5-3.5v12L6 12.5H3z" fill="currentColor"/><path d="M13.2 7a4 4 0 0 1 0 6M15.6 4.8a7.2 7.2 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const STOP = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor"/></svg>';
  let playingBtn = null;
  // getChords returns arrays of pitches (each inner array sounds together for `dur` seconds),
  // or {chords, dur} to set its own length, or a string to show as a message instead.
  function playButton(getChords, dur, what, extraClass) {
    const btn = h('button', { type: 'button', class: 'play-btn' + (extraClass ? ' ' + extraClass : ''), 'aria-label': `Play ${what}`, title: `Play ${what}` });
    const idle = () => { btn.innerHTML = SPEAKER; btn.classList.remove('is-playing'); btn.setAttribute('aria-label', `Play ${what}`); };
    idle();
    btn.addEventListener('click', () => {
      if (playingBtn === btn) { MQ.Audio.stop(); return; }
      let got = getChords(), secs = dur;
      if (typeof got === 'string') { toast(got); return; }
      if (!Array.isArray(got)) { secs = got.dur; got = got.chords; }
      const chords = got.map((c) => c.map(MQ.midi));
      if (!chords.some((c) => c.length)) { toast('Place some notes on the staff first.'); return; }
      const ok = MQ.Audio.play(chords, secs, () => { if (playingBtn === btn) playingBtn = null; idle(); });
      if (!ok) { toast('This browser can’t play sound.', 'bad'); return; }
      playingBtn = btn;
      btn.innerHTML = STOP;
      btn.classList.add('is-playing');
      btn.setAttribute('aria-label', 'Stop');
    });
    return btn;
  }
  // What the speaker plays for each question type: the student's entry, as chords (or single notes)
  // in sequence. Returns [chords, seconds each]. A string is a message to show instead.
  function questionSound(q, staff, choice) {
    const cols = staff.pitches();
    const all = [].concat(...cols);
    if (q.type === 'place') return [[all], 1.5];
    if (q.type === 'interval') return [cols.concat([all]), 1];         // printed note, student's note, both
    if (q.type === 'scale') return [cols, 0.6];                        // note by note
    if ((q.type === 'voicing' || q.type === 'vprog') && q.columns.length > 1) {
      const chords = q.columns.map((c, i) => (c.given.length ? c.given : cols[i] || []).filter(Boolean));
      return [chords.filter((c) => c.length), 1];
    }
    if (q.symbolAnswer || q.symbolAnswers) return [[[].concat(...q.columns.map((c) => c.given))], 2];
    if (q.dropdowns) return q.columns && q.columns.length ? [q.columns.map((c) => c.given).filter((c) => c.length), 0.6] : 'There is nothing to play for this question.';
    if (q.type === 'identify') {
      if (choice == null) return 'Choose an answer first.';
      const printed = q.columns[0].given[0];
      const pc = MQ.parseSymbol(q.choices[choice].replace('♯', '#').replace('♭', 'b')).root;
      const options = [-1, 0, 1].map((d) => ({ step: pc.step, alt: pc.alt, oct: printed.oct + d }));
      options.sort((a, b) => Math.abs(MQ.midi(a) - MQ.midi(printed)) - Math.abs(MQ.midi(b) - MQ.midi(printed)));
      return [[[options[0]]], 1.5];
    }
    if (q.type === 'keysig') {
      if (choice == null) return 'Choose an answer first.';
      const [name, mode] = q.choices[choice].split(' ');
      const ch = MQ.parseSymbol(name.replace('♯', '#').replace('♭', 'b') + (mode === 'minor' ? 'm' : ''));
      return [[MQ.hearChord(ch)], 2];                                  // tonic chord of the chosen key
    }
    return [[all], 2];                                                 // chords and voicings
  }

  // ---------- question UI (shared by preview and student view) ----------
  function glyph(kind) {
    if (kind === 'note') return svgEl(`<svg class="glyph" viewBox="-10 -8 20 16" aria-hidden="true">${MQ.HEAD_SVG}</svg>`);
    const alt = kind === 'sharp' ? 1 : kind === 'flat' ? -1 : 0;
    return svgEl(`<svg class="glyph glyph-acc" viewBox="-8 -19 16 34" aria-hidden="true">${MQ.ACC_SVG[alt]}</svg>`);
  }
  function tapAction(kind, staff) {
    if (kind === 'note') { if (!staff.addNote()) toast('Every answer space already has a note. Move or remove one.'); return; }
    if (!staff.setAlt(kind === 'sharp' ? 1 : kind === 'flat' ? -1 : 0)) toast('Select a note on the staff first, or drag the sign onto a note.');
  }
  function dragify(btn, kind, staff) {
    btn.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      let moved = false, ghost = null;
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) {
          moved = true;
          ghost = h('div', { class: 'ghost' }, h('div', { class: 'ghost-in' }, glyph(kind)));
          document.body.append(ghost);
          document.body.classList.add('is-dragging');
        }
        if (moved) {
          ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
          staff.hoverAt(ev.clientX, ev.clientY, kind);
        }
      };
      const end = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        document.body.classList.remove('is-dragging');
        if (ghost) ghost.remove();
        if (moved && ev.type === 'pointerup') staff.dropAt(ev.clientX, ev.clientY, kind);
        else {
          staff.clearHover();
          if (!moved && ev.type === 'pointerup') tapAction(kind, staff);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
    // Keyboard activation (Enter / Space) arrives as a click with detail 0.
    btn.addEventListener('click', (e) => { if (e.detail === 0) tapAction(kind, staff); });
  }
  function palette(staff) {
    const bar = h('div', { class: 'palette', role: 'toolbar', 'aria-label': 'Notes and accidentals' });
    [
      { kind: 'note', label: 'Note', title: 'Drag onto the staff, or click to add a note' },
      { kind: 'sharp', label: 'Sharp', title: 'Drag onto a note, or click to sharpen the selected note' },
      { kind: 'flat', label: 'Flat', title: 'Drag onto a note, or click to flatten the selected note' },
      { kind: 'natural', label: 'Natural', title: 'Removes a sharp or flat' },
    ].forEach((it) => {
      const b = h('button', { type: 'button', class: 'tool tool-drag', title: it.title }, glyph(it.kind), h('span', null, it.label));
      dragify(b, it.kind, staff);
      bar.append(b);
    });
    bar.append(h('span', { class: 'tool-sep', 'aria-hidden': 'true' }));
    const need = () => toast('Select a note on the staff first.');
    bar.append(
      h('button', { type: 'button', class: 'tool tool-sq', 'aria-label': 'Move selected note up one step', title: 'Up one step (↑)', onclick: () => staff.nudge(1) || need() }, svgEl('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')),
      h('button', { type: 'button', class: 'tool tool-sq', 'aria-label': 'Move selected note down one step', title: 'Down one step (↓)', onclick: () => staff.nudge(-1) || need() }, svgEl('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')),
      h('button', { type: 'button', class: 'tool', title: 'Remove the selected note (Delete)', onclick: () => staff.remove() || need() }, 'Remove'));
    return h('div', { class: 'palette-wrap' }, bar,
      h('p', { class: 'palette-hint' }, 'Drag a note onto the staff or click the staff to place one. Drag a note to move it, or off the staff to remove it. Drop a sharp or flat on a note to change it.'));
  }
  function choiceGroup(q, o) {
    const g = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Answer choices' });
    q.choices.forEach((c, i) => {
      let cls = 'choice';
      if (o.reveal) { if (i === q.answer) cls += ' is-right'; else if (i === o.response) cls += ' is-wrong'; }
      const b = h('button', { type: 'button', class: cls, role: 'radio', 'aria-checked': String(o.response === i), disabled: o.locked || null, onclick: () => {
        g.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        if (o.onResponse) o.onResponse(i);
      } }, h('span', { class: 'choice-key', 'aria-hidden': 'true' }, 'ABCD'[i]), h('span', null, c));
      g.append(b);
    });
    return g;
  }
  function resultLine(q, cfg, response) {
    const frac = MQ.gradeQuestion(q, response, cfg);
    const ans = MQ.describeAnswer(q, cfg);
    if (frac === 1) return h('p', { class: 'result is-good', role: 'status' }, h('strong', null, 'Correct.'), ' ', ans);
    let lead = 'Not quite.';
    if (frac > 0 && q.type === 'analysis') {
      lead = 'Partly right — 1 of 2 answers.';
    } else if (frac > 0 && q.type === 'figprog') {
      const need = q.figuredList.length;
      lead = `Partly right — ${Math.round(frac * need)} of ${need} chords.`;
    } else if (frac > 0 && q.type === 'progression') {
      const need = MQ.progAnswerCount(q);
      lead = `Partly right — ${Math.round(frac * need)} of ${need} answers.`;
    } else if (frac > 0 && !q.choices) {
      const need = [].concat(...q.answer).length;
      lead = `Partly right — ${Math.round(frac * need)} of ${need} notes.`;
    }
    return h('p', { class: 'result is-bad', role: 'status' }, h('strong', null, lead), ' The answer is ', h('b', null, ans), '.');
  }
  // Progressions: printed chords with a Roman numeral and/or chord symbol box under each one.
  // A Roman numeral with its figures: one number sits as a subscript, two stack beside the numeral.
  function figuredDisplay(numeral, figure, cls) {
    const el = h('span', { class: 'fig-rn' + (cls ? ' ' + cls : '') }, accText(numeral || ''));
    if (figure && figure.length === 1) el.append(h('sub', { class: 'fig-one' }, figure));
    else if (figure) el.append(h('span', { class: 'fig-stack' }, h('span', null, figure[0]), h('span', null, figure[1])));
    return el;
  }
  // Typed numeral + figure dropdown. Typing "V65" fills the dropdown when the box loses focus.
  function figuredInput(id, value, o, onChange) {
    const cur = { text: (value && value.text) || '', fig: (value && value.fig) || '' };
    const inp = h('input', { type: 'text', id, class: 'fig-in', placeholder: 'V', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 10, 'aria-label': 'Roman numeral' });
    inp.value = cur.text;
    const sel = selectEl(id + '-fig', MQ.FIGURES.map((f) => ({ v: f.fig, label: f.label })), cur.fig, (v) => { cur.fig = v; fire(); });
    sel.setAttribute('aria-label', 'Figured bass');
    sel.classList.add('fig-sel');
    const preview = h('span', { class: 'fig-preview' });
    const fire = () => { draw(); onChange({ text: cur.text, fig: cur.fig }); };
    function draw() {
      const typed = cur.text.trim();
      const parsed = MQ.parseFigured(MQ.answerText(cur));
      const bad = !!typed && !parsed;
      inp.classList.toggle('is-invalid', bad);
      preview.replaceChildren(parsed
        ? figuredDisplay(typed.replace(/[\d/]+\s*$/, ''), parsed.figure)
        : bad ? h('span', { class: 'fig-unread is-bad' }, 'not a figured bass answer') : '');
    }
    inp.addEventListener('input', () => {
      cur.text = inp.value;
      // A figure typed into the box moves the dropdown to match as you type.
      const digits = (cur.text.match(/[\d/]+\s*$/) || [''])[0].replace(/[\s/]/g, '');
      if (digits) {
        const fig = digits === '63' ? '6' : digits === '53' ? '' : digits === '2' ? '42' : digits;
        if (MQ.FIGURES.some((f) => f.fig === fig)) { cur.fig = fig; sel.value = fig; sel.classList.remove('is-invalid'); }
        else sel.classList.add('is-invalid'); // not one of the six figures
      } else sel.classList.remove('is-invalid');
      fire();
    });
    inp.addEventListener('blur', () => {
      // Tidy "V65" into the numeral box plus the dropdown.
      const parsed = MQ.parseFigured(cur.text);
      if (parsed && /[\d/]/.test(cur.text)) {
        cur.fig = parsed.figure;
        cur.text = cur.text.replace(/[\d/]+\s*$/, '');
        inp.value = cur.text;
        sel.value = cur.fig;
        fire();
      }
    });
    if (o.locked) { inp.disabled = true; sel.disabled = true; }
    draw();
    return h('div', { class: 'fig-answer' }, h('div', { class: 'fig-row' }, inp, sel), preview);
  }
  let figUid = 0;
  function figuredCard(q, cfg, o) {
    const uid = ++figUid;
    // A question with column specs is one the students write out: single chord or progression.
    const spell = q.colSpecs ? true : q.type === 'figured' && q.figured.ask === 'spell';
    const wrap = h('div', { class: 'qcard' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, MQ.clefLabel(q.clef))));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (q.hint && !o.locked) wrap.append(h('p', { class: 'q-hint' }, q.hint));
    if (spell && q.figured) wrap.append(h('div', { class: 'fig-given' }, figuredDisplay(q.figured.answer.numeral, q.figured.answer.figure, 'is-big')));
    const staffBox = h('div', { class: 'staff-box' });
    wrap.append(staffBox);
    const placed = spell ? clonePlaced(o.response) || q.columns.map(() => []) : null;
    const marks = spell && o.reveal ? MQ.markResponse(q, placed, cfg) : null;
    const staff = new MQ.Staff(staffBox, {
      clef: q.clef, keySig: q.keySig, keyAware: true, columns: q.columns, placed, barlines: q.type === 'figprog',
      chordLabels: q.chordLabels || null,   // the printed numerals of a progression to spell
      readOnly: !spell || !!o.locked, labels: cfg.flags.labels, colW: q.type === 'figprog' ? 62 : null,
      reveal: spell && o.reveal && !o.keyMode ? q.answer : null, revealPc: true, marks,
      onChange: (pl) => o.onResponse && o.onResponse(pl),
    });
    staffBox.append(playButton(() => (spell ? [[].concat(...staff.pitches())] : q.columns.map((c) => c.given)), spell ? 2 : 1, spell ? 'your notes' : q.type === 'figprog' ? 'the progression' : 'the chord'));
    if (spell && !o.locked) wrap.append(palette(staff));
    if (!spell) {
      // One answer box per chord.
      const list = q.type === 'figprog' ? q.figuredList : [q.figured];
      const resp = q.type === 'figprog' ? ((o.response || []).slice()) : null;
      const grid = h('div', { class: 'fig-answers', style: `--n:${list.length}` });
      list.forEach((item, i) => {
        const right = item.answer || item; // {numeral, figure} — a root-position figure is ""
        const value = o.keyMode ? { text: right.numeral, fig: right.figure }
          : q.type === 'figprog' ? resp[i] || {} : o.response || {};
        const cell = h('div', { class: 'fig-cell' }, q.type === 'figprog' ? h('span', { class: 'pg-num' }, 'Chord ' + (i + 1)) : null);
        cell.append(figuredInput(`fig-${uid}-${i}`, value, o, (v) => {
          if (q.type === 'figprog') { resp[i] = v; if (o.onResponse) o.onResponse(resp.slice()); }
          else if (o.onResponse) o.onResponse(v);
        }));
        if (o.reveal && !o.keyMode) {
          const ok = MQ.sameFigured(MQ.parseFigured(MQ.answerText(q.type === 'figprog' ? resp[i] : o.response)), item.parts || q.figured.parts);
          cell.append(h('span', { class: 'fig-mark ' + (ok ? 'is-right' : 'is-wrong') },
            ok ? '✓' : ['✗ ', figuredDisplay(right.numeral, right.figure)]));
        }
        grid.append(cell);
      });
      wrap.append(grid);
    }
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) wrap.append(resultLine(q, cfg, o.response));
    return wrap;
  }
  let pgUid = 0;
  function progressionCard(q, cfg, o) {
    const P = q.prog;
    const uid = ++pgUid;
    const wrap = h('div', { class: 'qcard' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, MQ.clefLabel(q.clef))));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (q.hint && !o.locked) wrap.append(h('p', { class: 'q-hint' }, q.hint));
    const staffBox = h('div', { class: 'staff-box' });
    wrap.append(staffBox);
    new MQ.Staff(staffBox, {
      clef: q.clef, grand: !!q.grand, keySig: q.keySig, keyAware: true, columns: q.columns, readOnly: true,
      chordLabels: o.keyMode ? { top: P.symbols, bottom: P.romans } : q.chordLabels, barlines: true, colW: 62,
    });
    staffBox.append(playButton(() => q.columns.map((c) => c.given), 1, 'the progression'));
    const resp = { r: ((o.response && o.response.r) || []).slice(), s: ((o.response && o.response.s) || []).slice() };
    const marks = o.reveal && !o.keyMode ? MQ.markProgression(q, resp, cfg) : null;
    const grid = h('div', { class: 'pg-answers', style: `--n:${P.chords.length}` });
    P.chords.forEach((_, i) => {
      const cell = h('div', { class: 'pg-cell' }, h('span', { class: 'pg-num' }, 'Chord ' + (i + 1)));
      [['r', 'Roman numeral', 'RN'], ['s', 'Chord symbol', 'Symbol']].forEach(([k, label, ph]) => {
        if ((k === 'r' && P.answer === 'symbol') || (k === 's' && P.answer === 'roman')) return;
        const inp = h('input', { type: 'text', class: 'pg-in', id: `pg-${uid}-${k}-${i}`, 'aria-label': `${label} for chord ${i + 1}`, placeholder: ph, autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 12 });
        inp.value = o.keyMode ? (k === 'r' ? P.romans[i] : P.symbols[i]) : resp[k][i] || '';
        if (o.locked || o.keyMode) inp.disabled = true;
        if (marks) inp.classList.add(marks[i][k] ? 'is-right' : 'is-wrong');
        inp.addEventListener('input', () => {
          // Chord symbols start with a capital root letter (Roman numerals keep their case — it matters).
          if (k === 's' && /^[a-g]/.test(inp.value)) {
            const at = inp.selectionStart;
            inp.value = inp.value[0].toUpperCase() + inp.value.slice(1);
            try { inp.setSelectionRange(at, at); } catch (e) { /* not focused */ }
          }
          resp[k][i] = inp.value;
          if (o.onResponse) o.onResponse({ r: resp.r.slice(), s: resp.s.slice() });
        });
        cell.append(inp);
        if (marks && !marks[i][k]) cell.append(h('span', { class: 'pg-fix' }, k === 'r' ? P.romans[i] : P.symbols[i]));
      });
      grid.append(cell);
    });
    // Plays the chords the student typed (1 second each); blank or unreadable boxes are a silent beat.
    const typed = () => {
      const chords = P.chords.map((_, i) => {
        const c = (P.answer !== 'symbol' && resp.r[i] && MQ.parseRoman(resp.r[i], P.key)) || (P.answer !== 'roman' && resp.s[i] && MQ.parseSymbol(resp.s[i])) || null;
        return c ? MQ.hearChord(c) : [];
      });
      return chords.some((c) => c.length) ? chords : 'Type your answers first — then you can hear them.';
    };
    wrap.append(h('div', { class: 'pg-hear' }, playButton(typed, 1, 'your answers', 'play-inline'), h('span', null, 'Hear your answers')), grid);
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) wrap.append(resultLine(q, cfg, resp));
    return wrap;
  }
  // Questions answered from lists: name a scale (root + type), or pick a key signature.
  let ddUid = 0;
  function dropdownGroup(q, o) {
    const uid = ++ddUid;
    const resp = (o.response || []).slice();
    const g = h('div', { class: 'dd-answers' });
    q.dropdowns.forEach((d, i) => {
      const opts = [{ v: '', label: 'Choose…' }].concat(d.options.map((t, j) => ({ v: String(j), label: t })));
      const sel = selectEl(`dd-${uid}-${i}`, opts, o.keyMode ? String(d.answer) : resp[i] == null ? '' : String(resp[i]), (v) => {
        resp[i] = v === '' ? null : +v;
        if (o.onResponse) o.onResponse(resp.slice());
      });
      if (o.locked) sel.disabled = true;
      if (o.reveal && !o.keyMode) sel.classList.add(resp[i] === d.answer ? 'is-right' : 'is-wrong');
      g.append(h('label', { class: 'dd-cell' }, h('span', { class: 'mini-label' }, d.label), sel,
        o.reveal && !o.keyMode && resp[i] !== d.answer ? h('span', { class: 'pg-fix' }, d.options[d.answer]) : null));
    });
    return g;
  }
  // A typed chord symbol, with the root capitalised as you type.
  let symUid = 0;
  function symbolAnswerBlock(q, o) {
    const id = 'sym-' + ++symUid;
    const inp = h('input', { type: 'text', id, class: 'fig-in sym-in', placeholder: 'Dmi7', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 14, 'aria-label': 'Chord symbol' });
    inp.value = o.keyMode ? q.symbolAnswer.shown : o.response || '';
    const preview = h('span', { class: 'fig-preview' });
    const draw = () => {
      const t = inp.value.trim();
      const voice = q.symbolAnswer && q.symbolAnswer.voice;
      const ch = t ? (voice ? MQ.parseVoiceSymbol(t) : MQ.parseSymbol(t)) : null;
      inp.classList.toggle('is-invalid', !!t && !ch);
      preview.replaceChildren(ch ? accText(voice ? MQ.prettySymbol(t) : MQ.symbolOf(ch)) : t ? h('span', { class: 'fig-unread is-bad' }, 'not a chord symbol') : '');
    };
    inp.addEventListener('input', () => {
      if (/^[a-g]/.test(inp.value)) {
        const at = inp.selectionStart;
        inp.value = inp.value[0].toUpperCase() + inp.value.slice(1);
        try { inp.setSelectionRange(at, at); } catch (e) { /* not focused */ }
      }
      draw();
      if (o.onResponse) o.onResponse(inp.value);
    });
    if (o.locked || o.keyMode) inp.disabled = true;
    draw();
    const right = o.reveal && !o.keyMode && MQ.gradeQuestion(q, o.response, { flags: { enharmonic: false } }) === 1;
    return h('div', { class: 'fig-answer' },
      h('span', { class: 'mini-label' }, 'Chord symbol'),
      h('div', { class: 'fig-row' }, inp), preview,
      o.reveal && !o.keyMode ? h('span', { class: 'fig-mark ' + (right ? 'is-right' : 'is-wrong') }, right ? '✓' : ['✗ ', accText(q.symbolAnswer.shown)]) : null);
  }

  // A voiced progression the students name: one chord symbol box per chord.
  function symbolRowBlock(q, o, cfg) {
    const resp = (o.response || []).slice();
    const boxes = q.symbolAnswers.map((want, i) => {
      const id = 'sym-' + ++symUid;
      const inp = h('input', { type: 'text', id, class: 'fig-in sym-in', placeholder: 'Dmi7', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 14, 'aria-label': `Chord symbol ${i + 1}` });
      inp.value = o.keyMode ? want.shown : resp[i] || '';
      const preview = h('span', { class: 'fig-preview' });
      const draw = () => {
        const t = inp.value.trim();
        const ok = t ? MQ.parseVoiceSymbol(t) : null;
        inp.classList.toggle('is-invalid', !!t && !ok);
        preview.replaceChildren(ok ? accText(MQ.prettySymbol(t)) : t ? h('span', { class: 'fig-unread is-bad' }, 'not a chord symbol') : '');
      };
      inp.addEventListener('input', () => {
        if (/^[a-g]/.test(inp.value)) {
          const at = inp.selectionStart;
          inp.value = inp.value[0].toUpperCase() + inp.value.slice(1);
          try { inp.setSelectionRange(at, at); } catch (e) { /* not focused */ }
        }
        resp[i] = inp.value;
        draw();
        if (o.onResponse) o.onResponse(resp.slice());
      });
      if (o.locked || o.keyMode) inp.disabled = true;
      draw();
      const right = o.reveal && !o.keyMode && MQ.gradeVoiceSymbol(want.q, resp[i], cfg) === 1;
      return h('div', { class: 'sym-cell' },
        h('span', { class: 'mini-label' }, `Chord ${i + 1}`), inp, preview,
        o.reveal && !o.keyMode ? h('span', { class: 'fig-mark ' + (right ? 'is-right' : 'is-wrong') }, right ? '✓' : ['✗ ', accText(want.shown)]) : null);
    });
    return h('div', { class: 'sym-row' }, ...boxes);
  }


  // ---------- Keys & Notes: one note, shown one way and answered another ----------
  let keysUid = 0;
  function keysCard(q, cfg, o) {
    const k = q.keys;
    const uid = ++keysUid;
    const wrap = h('div', { class: 'qcard keys-card' + (o.compact ? ' is-compact' : '') });
    const KIND = { staff: 'Grand staff', name: 'Note name', piano: 'Piano' };
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, `${KIND[k.prompt]} → ${KIND[k.answer]}`)));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (q.hint && !o.locked) wrap.append(h('p', { class: 'q-hint' }, q.hint));
    const reveal = !!o.reveal && !o.keyMode;
    const resp = o.response;
    const got = MQ.keysResponsePitch(q, resp);
    const right = reveal ? MQ.gradeQuestion(q, resp, cfg) === 1 : null;
    const playNote = (m) => { if (MQ.Audio && m != null) MQ.Audio.play([[m]], 1.2); };

    // ---------- what is shown ----------
    const shown = h('div', { class: 'keys-prompt' });
    if (k.prompt === 'staff') {
      const box = h('div', { class: 'staff-box' });
      new MQ.Staff(box, { clef: 'grand', grand: true, columns: [{ given: [k.pitch], cap: 0 }], readOnly: true, labels: false });
      box.append(playButton(() => [[k.pitch]], 1.2, 'the note'));
      shown.append(box);
    } else if (k.prompt === 'name') {
      shown.append(h('div', { class: 'keys-name', 'aria-label': 'Note name' }, MQ.noteName(k.pitch)));
    } else {
      const box = h('div', { class: 'piano-box' });
      new MQ.Piano(box, { lo: k.kbLo, hi: k.kbHi, highlight: k.midi, readOnly: true });
      shown.append(box);
    }
    wrap.append(shown);

    // ---------- the answer ----------
    const answer = h('div', { class: 'keys-answer' });
    if (k.answer === 'piano') {
      const box = h('div', { class: 'piano-box' });
      const state = { lo: k.kbLo, hi: k.kbHi, selected: typeof resp === 'number' ? resp : null, readOnly: !!o.locked || !!o.keyMode };
      if (o.keyMode) state.selected = k.midi;
      if (reveal) {
        if (right) state.right = resp;
        else { if (typeof resp === 'number') state.wrong = resp; state.expected = k.midi; }
      }
      new MQ.Piano(box, Object.assign(state, { onPress: (m) => o.onResponse && o.onResponse(m) }));
      answer.append(h('span', { class: 'mini-label' }, o.keyMode ? 'The key' : 'Your key'), box);
    } else if (k.answer === 'name') {
      const inp = h('input', { type: 'text', id: 'kn-' + uid, class: 'fig-in keys-in', placeholder: 'F♯4', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 6, 'aria-label': 'Note name with octave' });
      inp.value = o.keyMode ? MQ.noteName(k.pitch) : resp || '';
      const preview = h('span', { class: 'fig-preview' });
      let timer = null, lastPlayed = '';
      const draw = () => {
        const t = inp.value.trim();
        const p = t ? MQ.parseNoteName(t) : null;
        inp.classList.toggle('is-invalid', !!t && !p);
        preview.replaceChildren(p ? accText(MQ.noteName(p)) : t ? h('span', { class: 'fig-unread is-bad' }, 'a letter, a sharp or flat if needed, then the octave — like F♯4') : '');
        return p;
      };
      inp.addEventListener('input', () => {
        if (/^[a-g]/.test(inp.value)) {
          const at = inp.selectionStart;
          inp.value = inp.value[0].toUpperCase() + inp.value.slice(1);
          try { inp.setSelectionRange(at, at); } catch (e) { /* not focused */ }
        }
        const p = draw();
        if (o.onResponse) o.onResponse(inp.value);
        // Play the note once the name is complete — a moment after typing stops.
        clearTimeout(timer);
        if (p) timer = setTimeout(() => { const key = MQ.noteName(p); if (key !== lastPlayed) { lastPlayed = key; playNote(MQ.midi(p)); } }, 350);
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const p = draw(); if (p) { lastPlayed = MQ.noteName(p); playNote(MQ.midi(p)); } } });
      if (o.locked || o.keyMode) inp.disabled = true;
      draw();
      answer.append(h('div', { class: 'fig-answer' },
        h('label', { class: 'mini-label', for: 'kn-' + uid }, 'Note name with octave'),
        h('div', { class: 'fig-row' }, inp,
          h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Hear it', onclick: () => { const p = draw(); if (p) playNote(MQ.midi(p)); } }, '♪ Hear it')),
        preview,
        reveal ? h('span', { class: 'fig-mark ' + (right ? 'is-right' : 'is-wrong') }, right ? '✓' : ['✗ ', accText(MQ.describeAnswer(q, cfg))]) : null));
    } else {
      const box = h('div', { class: 'staff-box' });
      const placed = clonePlaced(resp) || [[]];
      const staff = new MQ.Staff(box, {
        clef: 'grand', grand: true, columns: q.columns, placed, readOnly: !!o.locked || !!o.keyMode, labels: cfg.flags.labels,
        reveal: reveal || o.keyMode ? q.answer : null, marks: reveal ? [placed[0].map((p) => !!p && MQ.gradeQuestion(q, [[p]], cfg) === 1)] : null,
        onChange: (pl) => {
          const note = pl && pl[0] && pl[0].filter(Boolean).slice(-1)[0];
          if (note) playNote(MQ.midi(note));
          if (o.onResponse) o.onResponse(pl);
        },
      });
      box.append(playButton(() => [[].concat(...staff.pitches())], 1.2, 'your note'));
      answer.append(box);
      if (!o.locked && !o.keyMode) answer.append(palette(staff));
    }
    wrap.append(answer);
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) wrap.append(resultLine(q, cfg, resp));
    return wrap;
  }

  function questionCard(q, cfg, o) {
    if (q.type === 'rhythm') return rhythmCard(q, cfg, o);
    if (q.type === 'keys') return keysCard(q, cfg, o);
    if (q.type === 'analysis') return analysisCard(q, cfg, o);
    if (q.type === 'figured' || q.type === 'figprog') return figuredCard(q, cfg, o);
    if (q.type === 'progression' && !q.colSpecs) return progressionCard(q, cfg, o);
    const t = typeOf(q.type);
    const wrap = h('div', { class: 'qcard' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, t.label, h('span', { class: 'q-clef' }, MQ.clefLabel(q.clef))));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (q.hint && !o.locked) wrap.append(h('p', { class: 'q-hint' }, q.hint));
    const isChoice = !!q.choices || !!q.dropdowns || !!q.symbolAnswer || !!q.symbolAnswers;
    const staffBox = h('div', { class: 'staff-box' });
    if (!q.noStaff) wrap.append(staffBox);
    const placed = isChoice ? null : clonePlaced(o.response) || q.columns.map(() => []);
    const staff = q.noStaff ? null : new MQ.Staff(staffBox, {
      clef: q.clef, grand: !!q.grand, keySig: q.keySig || 0, columns: q.columns, placed,
      keyAware: !!q.keyAware, chordLabels: q.chordLabels || null, barlines: !!q.chordLabels, colW: q.chordLabels ? 62 : null,
      readOnly: isChoice || !!o.locked, labels: cfg.flags.labels,
      reveal: o.reveal && !isChoice && !o.keyMode ? q.answer : null, revealPc: !!(q.pcOnly || q.revealPc),
      marks: o.reveal && !isChoice ? MQ.markResponse(q, placed, cfg) : null,
      onChange: (pl) => o.onResponse && o.onResponse(pl),
    });
    let choice = o.response;
    const what = isChoice ? 'your answer' : q.type === 'place' ? 'your note' : 'your notes';
    if (staff) staffBox.append(playButton(() => { const r = questionSound(q, staff, choice); return typeof r === 'string' ? r : { chords: r[0], dur: r[1] }; }, 1, what));
    if (q.symbolAnswers) wrap.append(symbolRowBlock(q, o, cfg));
    else if (q.symbolAnswer) wrap.append(symbolAnswerBlock(q, o));
    else if (q.dropdowns) wrap.append(dropdownGroup(q, o));
    else if (q.choices) wrap.append(choiceGroup(q, Object.assign({}, o, { onResponse: (i) => { choice = i; if (o.onResponse) o.onResponse(i); } })));
    else if (!o.locked) wrap.append(palette(staff));
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) wrap.append(resultLine(q, cfg, o.response));
    return wrap;
  }

  // ---------- builder ----------
  function renderBuild(main) {
    const cfg = S.cfg;
    const R = {};
    const form = h('div', { class: 'build-form' });
    const side = h('aside', { class: 'build-side' });
    main.append(h('div', { class: 'build' }, form, side));
    const changed = () => { saveDraft(); refresh(); };

    form.append(sec('details', STUDENT ? 'What do you want to practise?' : 'Quiz details', STUDENT ? 'Start from a preset, or choose question types below.' : 'Students see the title and your name before they start.',
      STUDENT ? null : h('div', { class: 'row2' },
        fld('Title', textIn('q-title', cfg.title, 60, 'e.g. Unit 3 note reading', (v) => { cfg.title = v; changed(); })),
        fld('Teacher', textIn('q-teacher', cfg.teacher, 40, 'e.g. Ms. Rivera', (v) => { cfg.teacher = v; changed(); }))),
      KEYS ? keysPresets(cfg) : ANALYSIS || RHYTHM ? null : h('div', { class: 'presets' }, h('span', { class: 'mini-label' }, STUDENT ? 'Presets' : 'Or start from a preset'),
        h('div', { class: 'preset-row' }, MQ.PRESETS.map((p) => h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
          const keep = { custom: cfg.counts.custom, voicing: cfg.counts.voicing, progression: cfg.counts.progression };
          S.cfg = p.apply(S.cfg); Object.assign(S.cfg.counts, keep);
          S.cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvShow = false; S.pvResp = null;
          saveDraft(); go('build'); toast(`Loaded the “${p.label}” preset`);
        } }, p.label))))));

    if (KEYS) form.append(keysSection(cfg, changed, R));
    if (ANALYSIS) form.append(...analysisSections(cfg, changed, R));
    if (RHYTHM) form.append(...rhythmSections(cfg, changed, R));
    if (!KEYS && !ANALYSIS && !RHYTHM) form.append(sec('staff', 'Staff & notes', 'Applies to every question type.',
      h('div', { class: 'row2' },
        grp('Clefs', chips('q-clefs', [{ label: 'Treble' }, { label: 'Bass' }, { label: 'Grand staff' }], cfg.clefs, (m) => { cfg.clefs = m; changed(); }, (x) => x.label), 'Each tab can override this.'),
        grp('Ledger lines', seg('q-ledger', [0, 1, 2, 3].map((v) => ({ v, label: v === 0 ? 'None' : v === 1 ? '1' : String(v) })), cfg.ledger, (v) => { cfg.ledger = v; changed(); }), 'Maximum above or below the staff.')),
      grp('Starting notes', seg('q-acc', [{ v: 0, label: 'Naturals only' }, { v: 1, label: '+ Sharps' }, { v: 2, label: '+ Flats' }, { v: 3, label: 'Sharps & flats' }], cfg.accMode, (v) => { cfg.accMode = v; changed(); }),
        'Applies to printed and named notes. Answers can still need accidentals — a major 3rd above D is F♯.')));

    // ---------- question types: one tab each, with a counter for how many to ask ----------
    if (!R.total) R.total = h('span', { class: 'mix-total' });
    R.invWarn = h('p', { class: 'warn-note', hidden: true }, '3rd inversion needs a chord with a 7th. Add 7ths, 9ths, 11ths or 13ths, or another position — until then these questions use root position.');
    R.chordWarn = h('p', { class: 'warn-note', hidden: true }, 'No chord fits these choices (for example, diminished chords only take 7ths, and only minor chords take 11ths). Until you change them, these questions use major triads.');
    const syncInvWarn = () => {
      const has7 = (cfg.chordSize & 0b111100) !== 0;
      R.invWarn.hidden = !(cfg.inversions === 8 && !has7);
      const sizes = MQ.CHORD_SIZES.filter((_, i) => cfg.chordSize & (1 << i)).map((z) => z.id);
      R.chordWarn.hidden = MQ.CHORD_QUALS.some((q, i) => cfg.chordQual & (1 << i) && q.sizes.some((z) => sizes.includes(z)));
    };
    // Per-tab overrides for which staff a question uses and whether a helper note is printed.
    const staffPick = (tab) => grp('Staff', selectEl('st-' + tab, [
      { v: 0, label: 'Quiz setting (Staff & notes)' }, { v: 1, label: 'Treble clef only' },
      { v: 2, label: 'Bass clef only' }, { v: 3, label: 'Grand staff only' },
    ], (cfg.staffOv && cfg.staffOv[tab]) || 0, (v) => { cfg.staffOv[tab] = +v; changed(); }));
    const notesPick = (tab, printedLabel, writeLabel) => grp('Notes on the staff', selectEl('hp-' + tab, [
      { v: 0, label: 'Quiz setting (Quiz rules)' }, { v: 1, label: printedLabel }, { v: 2, label: writeLabel },
    ], (cfg.helpOv && cfg.helpOv[tab]) || 0, (v) => { cfg.helpOv[tab] = +v; changed(); }));
    const panelBody = {
      place: () => [staffPick('place'), toggle('f-strictOctave', 'Octave must match', 'Ask for an exact pitch such as F♯4 instead of any F♯.', cfg.flags.strictOctave, (v) => { cfg.flags.strictOctave = v; changed(); })],
      identify: () => [staffPick('identify'), h('p', { class: 'help' }, 'Students see a printed note and choose its name from four answers. Ledger lines and starting notes come from Staff & notes.')],
      interval: () => [
        staffPick('interval'),
        notesPick('interval', 'Print the first note', 'Students write both notes'),
        grp('Intervals to ask', chips('q-intervals', MQ.INTERVALS, cfg.intervals, (m) => { cfg.intervals = m; changed(); }, (x) => x.id, (x) => x.name),
          'The last nine are compound intervals, a 9th up to a 13th.'),
        grp('Direction', seg('q-dir', [{ v: 1, label: 'Above' }, { v: 2, label: 'Below' }, { v: 3, label: 'Both' }], cfg.intervalDir, (v) => { cfg.intervalDir = v; changed(); }))],
      chord: () => [
        grp('Notes on the staff', seg('q-chordask', [
          { v: 1, label: 'Print the chord symbol — students write the notes' },
          { v: 2, label: 'Print the notes — students write the chord symbol' },
          { v: 3, label: 'A mix of both' }], cfg.chordAsk, (v) => { cfg.chordAsk = v; changed(); })),
        notesPick('chord', 'Print the bass note', 'Students write every note'),
        h('p', { class: 'help' }, 'The notes setting applies when students write the notes.'),
        grp('Chord qualities', chips('q-cqual', MQ.CHORD_QUALS, cfg.chordQual, (m) => { cfg.chordQual = m; syncInvWarn(); changed(); }, (x) => x.label)),
        grp('Chord sizes', chips('q-csize', MQ.CHORD_SIZES, cfg.chordSize, (m) => { cfg.chordSize = m; syncInvWarn(); changed(); }, (x) => x.label),
          'A 6th replaces the 7th and never takes a 13th. 9ths, 11ths and 13ths always include the 7th and no doubled octave. Diminished chords only add 7ths; major, augmented and sus chords never take an 11th.'),
        grp('Altered 9ths, 11ths and 13ths', chips('q-calt', [{ label: 'Flat (♭9, ♭13)' }, { label: 'Sharp (♯9, ♯11)' }], cfg.chordAlt, (m) => { cfg.chordAlt = m; changed(); }, (x) => x.label, null, true),
          'Leave both off for natural extensions only. Sus chords (sus4, 7sus4, 9sus4, 13sus4) can take altered 9ths and 13ths but never an 11th.'),
        grp('Staff', chips('q-cstaff', MQ.CHORD_STAVES, cfg.chordStaff, (m) => { cfg.chordStaff = m; changed(); }, (x) => x.label), 'Used unless the dropdown below overrides it.'),
        staffPick('chord'),
        grp('Positions', chips('q-inversions', MQ.INVERSIONS, cfg.inversions, (m) => { cfg.inversions = m; syncInvWarn(); changed(); }, (x) => x.label, (x) => x.title || null),
          'Only the root, 3rd, 5th or 7th can be the bass note. It is printed, and students add the other chord tones above it — octave and order don’t matter.'),
        R.chordWarn, R.invWarn],
      scale: () => {
        const modes = MQ.SCALES.filter((x) => x.mode), plain = MQ.SCALES.filter((x) => !x.mode);
        const base = Math.pow(2, plain.length);
        const modeBox = grp('Modes', chips('q-modes', modes, Math.floor((cfg.scales || 0) / base), (m) => {
          cfg.scales = (cfg.scales % base) + m * base; changed();
        }, (x) => x.label, (x) => x.name, true));
        const sync = () => modeBox.classList.toggle('is-off', !cfg.scaleModes);
        sync();
        return [
          staffPick('scale'),
          grp('Scales', chips('q-scales', plain, cfg.scales % base, (m) => {
            cfg.scales = m + Math.floor((cfg.scales || 0) / base) * base; changed();
          }, (x) => x.label, (x) => x.name, true), 'Pentatonic scales are five notes long.'),
          toggle('f-scaleModes', 'Allow modes', 'Modes are only used when this is switched on.', cfg.scaleModes, (v) => { cfg.scaleModes = v ? 1 : 0; sync(); changed(); }),
          modeBox,
          grp('Length', seg('q-scalelen', [{ v: 0, label: 'Full octave' }, { v: 1, label: 'First five notes' }], cfg.scaleLen, (v) => { cfg.scaleLen = v; changed(); }), 'Pentatonic scales always use all five notes.'),
          grp('What students do', seg('q-scaleask', [{ v: 1, label: 'Write the scale' }, { v: 2, label: 'Name a printed scale' }, { v: 3, label: 'A mix of both' }], cfg.scaleAsk, (v) => { cfg.scaleAsk = v; changed(); }),
            'Naming a scale asks for its first note, then which scale it is — only the types chosen above are listed.'),
        ];
      },
      keysig: () => [staffPick('keysig'), h('div', { class: 'row2' },
        grp('Ask for', seg('q-keymode', [{ v: 1, label: 'Major keys' }, { v: 2, label: 'Minor keys' }, { v: 3, label: 'Both' }], cfg.keyMode, (v) => { cfg.keyMode = v; changed(); })),
        grp('Most sharps or flats', seg('q-keymax', [1, 2, 3, 4, 5, 6, 7].map((v) => ({ v, label: String(v) })), cfg.keyMax, (v) => { cfg.keyMax = v; changed(); }))),
        grp('What students do', seg('q-keyask', [{ v: 1, label: 'Name the key from its signature' }, { v: 2, label: 'Choose the signature for a named key' }, { v: 3, label: 'A mix of both' }], cfg.keyAsk, (v) => { cfg.keyAsk = v; changed(); }),
          'Choosing a signature uses one list with every option, from 7 flats to 7 sharps.')],
      custom: () => [notesPick('custom', 'Print the lowest note', 'Students write every note'), customChordSection(cfg, changed, 'custom')],
      voicing: () => [voicePanel(cfg, changed, 'vc', notesPick)],
      vprog: () => [voicePanel(cfg, changed, 'vp', notesPick)],
      progression: () => [progressionSection(cfg, changed)],
      figured: () => [
        h('p', { class: 'help' }, 'Clefwork builds a chord on a scale degree of a key you choose, in root position or an inversion, and prints its key signature. Figures: 6 and 6/4 for triads; 7, 6/5, 4/3 and 4/2 for sevenths.'),
        h('div', { class: 'row2' },
          grp('Key', seg('q-figkey', [{ v: 1, label: 'Major' }, { v: 2, label: 'Minor' }, { v: 3, label: 'Both' }], cfg.figKey, (v) => { cfg.figKey = v; changed(); })),
          grp('Key signatures up to', seg('q-figmax', [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ v, label: v === 0 ? 'None' : String(v) })), cfg.figMax, (v) => { cfg.figMax = v; changed(); }), 'Sharps or flats in the key.')),
        grp('Chord types', chips('q-figsize', [{ label: 'Triads' }, { label: 'Seventh chords' }], cfg.figSize, (m) => { cfg.figSize = m; changed(); }, (x) => x.label)),
        grp('Positions', chips('q-figpos', [{ label: 'Root position' }, { label: '1st inversion' }, { label: '2nd inversion' }, { label: '3rd inversion' }], cfg.figPos, (m) => { cfg.figPos = m; changed(); }, (x) => x.label),
          '3rd inversion only applies to seventh chords.'),
        grp('Altered scale degrees', chips('q-figalt', [{ label: '♭ degrees (♭II, ♭III, ♭VI, ♭VII)' }, { label: '♯ degrees (♯i°, ♯ii°, ♯iv°, ♯v°)' }], cfg.figAlt, (m) => { cfg.figAlt = m; changed(); }, (x) => x.label, null, true),
          'Leave both off for chords built only on the seven scale degrees. Flat degrees come as major chords, sharp degrees as diminished ones.'),
        grp('Clefs', chips('q-figclefs', [{ label: 'Treble' }, { label: 'Bass' }], cfg.figClefs, (m) => { cfg.figClefs = m; changed(); }, (x) => x.label)),
        staffPick('figured'),
        grp('Notes on the staff', seg('q-figask', [{ v: 1, label: 'Print the chord — students write the numeral' }, { v: 2, label: 'Print the numeral — students write the chord' }, { v: 3, label: 'A mix of both' }], cfg.figAsk, (v) => { cfg.figAsk = v; changed(); })),
      ],
      figprog: () => [
        h('p', { class: 'help' }, 'A progression of figured-bass chords. Students write the Roman numeral and figure for each one. Roots move by the same rules as the Chord progressions tab.'),
        grp('Chords in each progression', seg('q-figlen', [3, 4, 5, 6, 7, 8].map((v) => ({ v, label: String(v) })), cfg.figLen, (v) => { cfg.figLen = v; changed(); })),
        h('div', { class: 'row2' },
          grp('Key', seg('q-figpkey', [{ v: 1, label: 'Major' }, { v: 2, label: 'Minor' }, { v: 3, label: 'Both' }], cfg.figpKey, (v) => { cfg.figpKey = v; changed(); })),
          grp('Key signatures up to', seg('q-figpmax', [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ v, label: v === 0 ? 'None' : String(v) })), cfg.figpMax, (v) => { cfg.figpMax = v; changed(); }))),
        grp('Chord types', chips('q-figpsize', [{ label: 'Triads' }, { label: 'Seventh chords' }], cfg.figpSize, (m) => { cfg.figpSize = m; changed(); }, (x) => x.label)),
        grp('Positions', chips('q-figppos', [{ label: 'Root position' }, { label: '1st inversion' }, { label: '2nd inversion' }, { label: '3rd inversion' }], cfg.figpPos, (m) => { cfg.figpPos = m; changed(); }, (x) => x.label)),
        grp('Altered scale degrees', chips('q-figpalt', [{ label: '♭ degrees' }, { label: '♯ degrees' }], cfg.figpAlt, (m) => { cfg.figpAlt = m; changed(); }, (x) => x.label, null, true)),
        grp('Clefs', chips('q-figpclefs', [{ label: 'Treble' }, { label: 'Bass' }], cfg.figpClefs, (m) => { cfg.figpClefs = m; changed(); }, (x) => x.label)),
        staffPick('figprog'),
        grp('Notes on the staff', seg('q-figpask', [{ v: 1, label: 'Print the chords — students write the numerals' }, { v: 2, label: 'Print the numerals — students write the chords' }, { v: 3, label: 'A mix of both' }], cfg.figpAsk, (v) => { cfg.figpAsk = v; changed(); })),
      ],
    };
    const TABS = [
      { id: 'place', label: 'Place the Note' }, { id: 'identify', label: 'Name the Note' },
      { id: 'interval', label: 'Intervals' }, { id: 'chord', label: 'Chords' },
      { id: 'scale', label: 'Scales' }, { id: 'keysig', label: 'Key Signatures' },
      { id: 'custom', label: 'Custom Chords', list: 'custom' },
      { id: 'voicing', label: 'Single Voiced Chords', tech: 'vc' }, { id: 'vprog', label: 'Voiced Progressions', tech: 'vp' },
      { id: 'progression', label: 'Chord Progressions', list: 'progs', pool: true },
      { id: 'figured', label: 'Figured Bass Chord' }, { id: 'figprog', label: 'Figured Bass Progression' },
    ];
    // Custom Chords is hidden while it is being reworked.
    for (let i = TABS.length - 1; i >= 0; i--) if (TABS[i].id === 'custom') TABS.splice(i, 1);
    cfg.counts.custom = 0;
    if (!TABS.some((t) => t.id === S.buildTab)) S.buildTab = 'place';
    const strip = h('div', { class: 'qt-strip', role: 'tablist', 'aria-label': 'Question types' });
    const panels = h('div', { class: 'qt-panels' });
    const select = (id) => {
      S.buildTab = id;
      R.tabs.forEach((t) => {
        const on = t.id === id;
        t.btn.setAttribute('aria-selected', String(on));
        t.btn.tabIndex = on ? 0 : -1;
        t.card.classList.toggle('is-active', on);
        t.panel.hidden = !on;
      });
    };
    R.tabs = TABS.map((tb) => {
      const type = typeOf(tb.id);
      const btn = h('button', { type: 'button', role: 'tab', id: 'tab-' + tb.id, 'aria-controls': 'panel-' + tb.id, class: 'qt-tab', onclick: () => select(tb.id) },
        h('span', { class: 'qt-name' }, tb.label), h('span', { class: 'qt-status' }));
      const ctr = counter('count-' + tb.id, tb.label, (v) => {
        if (!tb.tech) { cfg.counts[tb.id] = v; changed(); return; }
        // These tabs count their techniques: + adds to the first one, − takes from the last.
        const b = cfg[tb.tech] = MQ.voiceSettings(cfg[tb.tech]);
        const ids = MQ.TECHNIQUES.map((t) => t.id).filter((x) => !(tb.tech === 'vp' && x === 'custom'));
        let n = ids.reduce((sum, x) => sum + (b.tech[x] || 0), 0);
        while (n < v) { const k = ids.find((x) => b.tech[x]) || ids[0]; b.tech[k] = (b.tech[k] || 0) + 1; n++; }
        while (n > v) { const k = ids.filter((x) => b.tech[x]).pop(); b.tech[k]--; n--; }
        cfg.counts[tb.id] = v;
        changed();
      });
      const card = h('div', { class: 'qt' }, btn, ctr);
      const panel = h('div', { role: 'tabpanel', id: 'panel-' + tb.id, 'aria-labelledby': 'tab-' + tb.id, class: 'qt-panel' },
        h('div', { class: 'qt-panel-head' }, h('h3', null, type.label), h('p', null, type.blurb)),
        h('p', { class: 'off-note' }, `Not in the quiz yet — use the + on the ${tb.label} tab to choose how many to ask.`),
        panelBody[tb.id]());
      strip.append(card);
      panels.append(panel);
      return Object.assign({}, tb, { btn, ctr, card, panel });
    });
    strip.addEventListener('keydown', (e) => {
      if (!e.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const i = R.tabs.findIndex((t) => t.btn === e.target), n = R.tabs.length;
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      select(R.tabs[j].id);
      R.tabs[j].btn.focus();
      e.preventDefault();
    });
    R.syncTabs = () => {
      // Keep the per-technique counters showing what the config actually holds.
      panels.querySelectorAll('.stepper[data-tech]').forEach((el) => {
        const [key, tech] = el.dataset.tech.split(':');
        const b = MQ.voiceSettings(cfg[key]);
        el.sync(b.tech[tech] || 0, 20);
      });
      R.tabs.forEach((t) => {
      // Progressions: an automatic entry can supply several questions, so the limit is the pool size.
      if (t.tech) {
        const b = cfg[t.tech] = MQ.voiceSettings(cfg[t.tech]);
        cfg.counts[t.id] = MQ.TECHNIQUES.reduce((n, x) => n + (b.tech[x.id] || 0), 0);
      }
      const len = t.pool ? Math.min(30, MQ.progPool(cfg).length) : t.list ? cfg[t.list].length : 0;
      if (t.list) cfg.counts[t.id] = Math.min(cfg.counts[t.id] || 0, len);
      const n = cfg.counts[t.id] || 0;
      t.ctr.sync(n, t.list ? len : 30);
      t.card.classList.toggle('is-on', n > 0);
      t.panel.classList.toggle('is-off', n === 0 && (!t.list || len > 0));
      t.btn.querySelector('.qt-status').textContent = t.pool
        ? (cfg.progs.length ? `${cfg.progs.length} saved · up to ${len}` : 'None saved')
        : t.list ? (len ? `${len} saved` : 'None saved') : n ? '' : 'Off';
      });
    };
    select(S.buildTab);
    syncInvWarn();
    // Empty every counter so a teacher can start a fresh quiz. Two clicks, so it can't happen by accident.
    let armed = false;
    const clearBtn = h('button', { type: 'button', class: 'btn sm clear-all', onclick: () => {
      if (!armed) {
        armed = true;
        clearBtn.textContent = 'Clear everything?';
        clearBtn.classList.add('is-armed');
        setTimeout(() => { if (!armed) return; armed = false; clearBtn.textContent = 'Clear all questions'; clearBtn.classList.remove('is-armed'); }, 4000);
        return;
      }
      armed = false;
      clearBtn.textContent = 'Clear all questions';
      clearBtn.classList.remove('is-armed');
      Object.keys(cfg.counts).forEach((k) => (cfg.counts[k] = 0));
      ['vc', 'vp'].forEach((k) => { cfg[k] = MQ.voiceSettings(cfg[k]); cfg[k].tech = {}; });
      cfg.seed = MQ.randomSeed();
      changed();
      go('build');
      toast('Cleared — the quiz is empty');
    } }, 'Clear all questions');
    if (!KEYS && !ANALYSIS && !RHYTHM) form.append(sec('types', 'Question types', 'Choose a type to change its settings. The counter on each tab sets how many of those questions the quiz asks.',
      h('div', { class: 'types-top' }, clearBtn),
      strip, panels, h('div', { class: 'mix-foot' }, R.total)));

    const timeIn = h('input', { type: 'number', id: 'q-time', min: 0, max: 120, inputmode: 'numeric' });
    timeIn.value = cfg.timeLimit;
    timeIn.addEventListener('change', () => { const v = Math.max(0, Math.min(120, Math.round(+timeIn.value || 0))); timeIn.value = v; cfg.timeLimit = v; changed(); });
    const flag = (k, label, desc) => toggle('f-' + k, label, desc, cfg.flags[k], (v) => { cfg.flags[k] = v; changed(); });
    const RETAKES = [{ v: 'u', label: 'Unlimited' }, { v: 0, label: 'None — one attempt' }, { v: 1, label: '1 retake' }, { v: 2, label: '2 retakes' },
      { v: 3, label: '3 retakes' }, { v: 5, label: '5 retakes' }, { v: 10, label: '10 retakes' }];
    const retakeIn = selectEl('q-retakes', RETAKES, cfg.retakes == null ? 'u' : cfg.retakes, (v) => { cfg.retakes = v === 'u' ? null : +v; changed(); });
    form.append(sec('rules', 'Quiz rules', null,
      h('div', { class: 'row2' }, fld('Time limit in minutes', timeIn, '0 means no limit. The quiz submits itself when time runs out.'),
        STUDENT ? null : fld('Retakes', retakeIn, 'Students can retake the quiz to improve their score — the same questions each time. Each report shows its attempt number.')),
      h('div', { class: 'toggles' },
        ANALYSIS || RHYTHM ? null : flag('shuffle', 'Shuffle question order', 'Mixes the question types together instead of grouping them.'),
        KEYS || RHYTHM ? null : ANALYSIS ? flag('partial', 'Partial credit', 'A box that asks for both earns half credit for each right answer.')
          : flag('partial', 'Partial credit', 'Chords and scales earn credit for each correct note.'),
        STUDENT ? null : flag('feedback', 'Let students check answers', 'Students can check each question and see the right answer. Best for practice.'),
        ANALYSIS || RHYTHM ? null : flag('labels', 'Show note names while dragging', STUDENT ? 'The note’s name appears as you move it.' : 'Practice mode: the note’s name appears as students move it.'),
        RHYTHM ? null : ANALYSIS ? flag('enharmonic', 'Accept enharmonic spellings', 'Counts a G♭7 chord symbol as correct when the answer is F♯7.')
          : flag('enharmonic', 'Accept enharmonic spellings', 'Counts G♭ as correct when the answer is F♯.'),
        KEYS || ANALYSIS || RHYTHM ? null : flag('noHelpers', 'Hide starting and helper notes', 'Students write every note themselves: both notes of an interval, every note of a scale, and a chord’s bass note.'))));

    // Side: share + preview + answer key
    R.summary = h('p', { class: 'share-summary' });
    R.code = h('output', { class: 'code', id: 'quiz-code', 'aria-label': 'Quiz code' });
    R.copy = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { if (RHYTHM && !rhythmReady()) return; rememberQuiz(S.code, cfg); copyText(S.code, 'Quiz code'); } }, 'Copy quiz code');
    R.link = SITE || !inFrame ? h('button', { type: 'button', class: ANALYSIS ? 'btn btn-primary' : 'btn', onclick: () => {
      if ((ANALYSIS && !analysisReady()) || (RHYTHM && !rhythmReady())) return;
      rememberQuiz(S.code, cfg);
      copyText(quizLink(S.code) || location.href.split('#')[0] + '#take=' + withScore(S.code), 'Quiz link');
    } }, 'Copy quiz link') : null;
    R.tryBtn = h('button', { type: 'button', class: 'btn', onclick: () => {
      if ((ANALYSIS && !analysisReady()) || (RHYTHM && !rhythmReady())) return;
      rememberQuiz(S.code, cfg);
      if (openQuiz(S.code, { preview: true })) { S.take.name = 'Teacher preview'; go('take'); }
    } }, 'Try it as a student');
    R.exportBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { if (!RHYTHM || rhythmReady()) openExport(cfg); } }, 'Export to spreadsheet');
    R.canvasBtn = h('button', { type: 'button', class: 'btn', onclick: () => { if ((!ANALYSIS || analysisReady()) && (!RHYTHM || rhythmReady())) openCanvasKit(cfg, changed); } }, 'Set up in Canvas');
    if (STUDENT) {
      const p = S.slots.practice;
      R.startBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => startPractice(cfg) }, 'Start practising');
      side.append(h('section', { class: 'card share' },
        h('div', { class: 'eyebrow' }, 'Practice'),
        R.summary,
        toggle('pr-feedback', 'Tell me when I get one wrong', 'Each question is checked as you go, and you see the right answer.', S.practiceFeedback, (v) => { S.practiceFeedback = v; store.set('practiceFeedback', v); }),
        h('div', { class: 'btn-row' }, R.startBtn,
          p && p.started && !p.done ? h('button', { type: 'button', class: 'btn', onclick: () => go('practice') }, `Continue (question ${p.idx + 1} of ${p.qs.length})`) : null),
        h('p', { class: 'fine' }, 'Practice quizzes are just for you — nothing is sent to your teacher. For a quiz from your teacher, use the ', h('b', null, 'Take a quiz'), ' tab.')));
    } else if (ANALYSIS) {
      // The music travels in the link, so the link is what students need; the code is for grading elsewhere.
      R.copy.className = 'btn sm';
      R.linkSize = h('p', { class: 'fine' });
      side.append(h('section', { class: 'card share' },
        h('div', { class: 'eyebrow' }, 'Share with students'),
        R.summary,
        h('div', { class: 'btn-row' }, R.link, R.tryBtn, R.canvasBtn, R.exportBtn),
        R.linkSize,
        h('p', { class: 'fine' }, 'The music travels inside the quiz link, so nothing is stored online. Students need the whole link — the quiz code on its own doesn’t carry the music.'),
        h('details', { class: 'fine-details' }, h('summary', null, 'Quiz code, for grading on another computer'),
          R.code, h('div', { class: 'btn-row' }, R.copy),
          h('p', { class: 'fine' }, 'Grading on this computer finds the quiz by itself. Elsewhere, paste this in the grade checker’s Quiz code box to see each answer.'))));
    } else side.append(h('section', { class: 'card share' },
      h('div', { class: 'eyebrow' }, 'Share with students'),
      R.summary, RHYTHM ? (R.ready = h('div', { class: 'rh-ready' })) : null, R.code,
      h('div', { class: 'btn-row' }, R.copy, R.link, R.tryBtn, R.canvasBtn, R.exportBtn),
      h('p', { class: 'fine' }, SITE
        ? ['The quiz link opens the quiz straight away. The code holds every setting, so nothing is stored online, and everyone with the same code gets the same questions.']
        : ['The code holds every setting, so nothing is stored online. Students paste it on the ', h('b', null, 'Take a quiz'), ' tab, and everyone with the same code gets the same questions.']),
      RHYTHM ? null : h('button', { type: 'button', class: 'btn-link', onclick: () => { cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvResp = null; changed(); toast('New questions generated — share the new code'); } }, 'Make a new set of questions with these settings')));

    R.keyList = h('ol', { class: 'key-list' });
    if (!STUDENT) side.append(h('details', { class: 'card key' }, h('summary', null, 'Answer key'), R.keyList));

    if (!ANALYSIS && !RHYTHM) R.pvCount = h('span', { class: 'pv-count' });
    R.pvHost = h('div', { class: 'pv-host' });
    R.prev = h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Previous question', onclick: () => { S.pvIdx--; S.pvResp = null; renderPreview(); } }, '‹ Prev');
    R.next = h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Next question', onclick: () => { S.pvIdx++; S.pvResp = null; renderPreview(); } }, 'Next ›');
    R.show = toggle('pv-show', 'Show answer', null, S.pvShow, (v) => { S.pvShow = v; renderPreview(); });
    if (!ANALYSIS && !RHYTHM) side.append(h('section', { class: 'card preview' },
      h('div', { class: 'card-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Preview'), R.pvCount), h('div', { class: 'pager' }, R.prev, R.next)),
      R.pvHost, STUDENT ? null : h('div', { class: 'pv-foot' }, R.show)));

    function renderPreview() {
      if (!R.pvCount) return;                // Analysis: the builder's picture is the preview
      const n = S.qs.length;
      if (!n) { R.pvCount.textContent = 'No questions yet'; R.pvHost.replaceChildren(h('p', { class: 'empty' }, 'Add questions in the Question mix to see them here.')); R.prev.disabled = R.next.disabled = true; return; }
      S.pvIdx = Math.max(0, Math.min(n - 1, S.pvIdx));
      const q = S.qs[S.pvIdx];
      R.pvCount.textContent = `Question ${S.pvIdx + 1} of ${n}`;
      R.prev.disabled = S.pvIdx === 0;
      R.next.disabled = S.pvIdx === n - 1;
      R.pvHost.replaceChildren(S.pvShow
        ? questionCard(q, cfg, { compact: true, locked: true, reveal: true, keyMode: true, response: q.choices ? q.answer : q.answer })
        : questionCard(q, cfg, { compact: true, response: S.pvResp, onResponse: (r) => (S.pvResp = r) }));
    }
    function refresh() {
      R.syncTabs();
      const total = sumCounts(cfg);
      R.total.textContent = RHYTHM ? `${total} example${total === 1 ? '' : 's'} in the quiz` : `${total} question${total === 1 ? '' : 's'} in the quiz`;
      if (!total) {
        S.code = ''; S.qs = [];
        if (R.code) R.code.textContent = '—';
        R.summary.textContent = STUDENT ? 'Add at least one question to start.' : 'Add at least one question to get a code.';
        [R.copy, R.link, R.tryBtn, R.exportBtn, R.canvasBtn, R.startBtn].forEach((b) => b && (b.disabled = true));
      } else {
        S.code = MQ.encodeQuiz(cfg);
        S.qs = MQ.generateQuiz(cfg);
        if (R.code) R.code.textContent = S.code;
        [R.copy, R.link, R.tryBtn, R.exportBtn, R.canvasBtn, R.startBtn].forEach((b) => b && (b.disabled = false));
        const est = Math.max(1, Math.round((MQ.BUILT_IN.reduce((s, t) => s + t.est * (cfg.counts[t.id] || 0), 0) + 40 * listCount(cfg, 'custom') + 55 * listCount(cfg, 'voicing') + 90 * listCount(cfg, 'vprog') + 70 * listCount(cfg, 'progression') + 15 * listCount(cfg, 'keys') + 30 * listCount(cfg, 'analysis') + 120 * listCount(cfg, 'rhythm')) / 60));
        const outOf = RHYTHM ? (cfg.rhythm.score === 'percent' ? ` · out of ${cfg.rhythm.outOf} points` : ` · out of ${rhythmNotes(S.qs)} notes`) : '';
        R.summary.replaceChildren(h('b', null, STUDENT ? 'Your practice' : cfg.title || 'Untitled quiz'), ` — ${total} ${RHYTHM ? 'example' : 'question'}${total === 1 ? '' : 's'} · ${clefsText(cfg)}${outOf} · about ${est} min${cfg.timeLimit ? ` · ${cfg.timeLimit}-minute limit` : ''}`);
      }
      if (R.scoreInfo) R.scoreInfo.textContent = total ? rhythmScoreText(cfg, S.qs) : '';
      if (R.ready) {
        const probs = MQ.rhythmProblems(cfg.rhythm);
        R.ready.replaceChildren(probs.length
          ? h('p', { class: 'warn-note' }, `Not ready to share yet. ${probs[0].text}${probs.length > 1 ? ` (${probs.length - 1} more to fix)` : ''}`)
          : h('p', { class: 'fine rh-ready-ok' }, '✓ Every measure is complete.'));
      }
      R.keyList.replaceChildren(...S.qs.map((q) => q.type === 'rhythm' ? rhythmKeyItem(q) : h('li', null, h('span', { class: 'key-q' }, q.text, q.type === 'analysis' ? null : h('span', { class: 'key-clef' }, ' · ' + MQ.clefLabel(q.clef))), h('span', { class: 'key-a' }, q.type === 'analysis' ? accText(MQ.describeAnswer(q, cfg)) : MQ.describeAnswer(q, cfg)))));
      if (R.linkSize) {
        const kb = S.aimg ? Math.max(1, Math.round((S.aimg.data.length + S.code.length) / 1024)) : 0;
        R.linkSize.replaceChildren(!S.code ? '' : kb > 150
          ? h('span', { class: 'warn-note' }, `The quiz link is about ${kb} KB. It works in browsers and Canvas, but some email programs cut long links — try Standard detail, or crop the picture to the passage.`)
          : `The quiz link is about ${kb} KB — fine for Canvas, email and chat.`);
      }
      renderPreview();
    }
    refresh();
  }

  // ---------- teacher lists: custom chords (one clef) and chord voicings (grand staff or one clef) ----------
  function customChordSection(cfg, changed, kind) {
    const voicing = kind === 'voicing';
    const listKey = voicing ? 'voicings' : 'custom';
    const maxNotes = voicing ? MQ.MAX_VOICING_NOTES : MQ.MAX_CUSTOM_NOTES;
    const ed = { index: -1, symbol: '', clef: cfg.clefs === 2 ? 'bass' : 'treble', staff: 'grand', notes: [] };
    const list = h('div', { class: 'cc-list' });
    const editor = h('div', { class: 'cc-editor' });
    const reset = () => { ed.index = -1; ed.symbol = ''; ed.notes = []; };
    const redraw = () => { drawList(); drawEditor(); };
    const notesText = (item) => voicing && (item.staff || 'grand') === 'grand'
      ? `Bass: ${item.notes.filter((p) => p.st === 1).map(MQ.fullName).join(' ') || '—'} · Treble: ${item.notes.filter((p) => p.st !== 1).map(MQ.fullName).join(' ') || '—'}`
      : item.notes.map(MQ.fullName).join('  ');

    function drawList() {
      const items = cfg[listKey];
      if (!items.length) { list.replaceChildren(h('p', { class: 'cc-empty' }, `No ${voicing ? 'voicings' : 'custom chords'} yet. Add one below.`)); return; }
      list.replaceChildren(...items.map((c, i) => h('div', { class: 'cc-row' + (ed.index === i ? ' is-editing' : '') },
        h('span', { class: 'cc-sym' }, MQ.prettySymbol(c.symbol)),
        h('span', { class: 'cc-meta' }, h('span', null, voicing ? MQ.clefLabel(c.staff || 'grand') : MQ.CLEFS[c.clef].label + ' clef'), h('span', { class: 'cc-notes' }, notesText(c))),
        h('span', { class: 'cc-actions' },
          h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Edit ' + c.symbol, onclick: () => {
            Object.assign(ed, { index: i, symbol: c.symbol, clef: c.clef || 'treble', staff: c.staff || 'grand', notes: c.notes.map((p) => ({ ...p })) });
            redraw();
            document.getElementById(kind + '-symbol').focus();
          } }, 'Edit'),
          h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Remove ' + c.symbol, onclick: () => {
            items.splice(i, 1);
            cfg.counts[kind] = Math.min(cfg.counts[kind] || 0, items.length);
            if (ed.index === i) reset(); else if (ed.index > i) ed.index--;
            changed(); redraw(); toast(`Removed ${MQ.prettySymbol(c.symbol)}`);
          } }, 'Remove')))));
    }

    function drawEditor() {
      const shown = h('b', null, ed.symbol.trim() ? MQ.prettySymbol(ed.symbol.trim()) : '—');
      const sym = textIn(kind + '-symbol', ed.symbol, 15, voicing ? 'e.g. Cma9, G13, Bbmi11' : 'e.g. Bbma7, F#mi7b5, D7', (v) => { ed.symbol = v; shown.replaceChildren(accText(v.trim() ? MQ.prettySymbol(v.trim()) : '—')); });
      sym.setAttribute('spellcheck', 'false');
      const staffBox = h('div', { class: 'staff-box' });
      const tools = h('div');
      const grandNow = () => voicing && ed.staff === 'grand';
      const answerLabel = h('span', { class: 'mini-label' });
      const mount = () => {
        staffBox.replaceChildren(); tools.replaceChildren();
        answerLabel.textContent = !voicing ? `Answer — place the notes students should write (up to ${maxNotes})`
          : grandNow() ? `Answer — place the voicing on the grand staff, with notes in both clefs (up to ${maxNotes})`
            : `Answer — place the voicing in the ${ed.staff} clef (up to ${maxNotes})`;
        const staff = new MQ.Staff(staffBox, {
          clef: voicing ? (grandNow() ? 'treble' : ed.staff) : ed.clef, grand: grandNow(), columns: [{ given: [], cap: maxNotes }], placed: [ed.notes.map((p) => ({ ...p }))],
          onChange: (pl) => { ed.notes = pl[0]; },
        });
        staff.svg.setAttribute('aria-label', staff.svg.getAttribute('aria-label').replace('Your notes', 'Answer notes'));
        staffBox.append(playButton(() => [[].concat(...staff.pitches())], 2, 'the chord'));
        tools.append(palette(staff));
      };
      mount();
      const save = () => {
        const s = ed.symbol.trim();
        const items = cfg[listKey];
        if (!/^[A-G]/.test(s)) { toast(s ? 'Start the symbol with a root letter from A to G.' : 'Type the chord symbol first.', 'bad'); sym.focus(); return; }
        if (ed.notes.length < 2) { toast('Place at least two answer notes on the staff.', 'bad'); return; }
        if (grandNow() && !(ed.notes.some((p) => p.st === 1) && ed.notes.some((p) => p.st !== 1))) {
          toast('A voicing needs at least one note in each clef — bass and treble.', 'bad'); return;
        }
        const item = { symbol: s, notes: ed.notes.slice().sort((a, b) => MQ.dia(a) - MQ.dia(b)) };
        if (!voicing) item.clef = ed.clef;
        else {
          item.staff = ed.staff;
          if (!grandNow()) item.notes = item.notes.map(({ st, ...p }) => p);
        }
        if (ed.index >= 0) items[ed.index] = item;
        else if (items.length >= MQ.MAX_CUSTOM) { toast(`A quiz can hold up to ${MQ.MAX_CUSTOM} ${voicing ? 'voicings' : 'custom chords'}.`, 'bad'); return; }
        else {
          // New entries are asked by default when every existing one was being asked.
          const askingAll = (cfg.counts[kind] || 0) >= items.length;
          items.push(item);
          if (askingAll) cfg.counts[kind] = items.length;
        }
        toast(ed.index >= 0 ? `Updated ${MQ.prettySymbol(s)}` : `Added ${MQ.prettySymbol(s)}`);
        reset(); changed(); redraw();
      };
      editor.replaceChildren(
        h('div', { class: 'cc-edit-head' }, h('strong', null, ed.index >= 0 ? `Editing ${MQ.prettySymbol(cfg[listKey][ed.index].symbol)}` : voicing ? 'Add a voicing' : 'Add a chord')),
        h('div', { class: 'row2' },
          fld('Chord symbol', sym, 'Type b or - for flat and # or + for sharp (C7-9 = C7♭9); m, mi or - for minor; ma or maj for major.'),
          voicing
            ? grp('Staff', seg(kind + '-staff', [{ v: 'grand', label: 'Grand staff' }, { v: 'treble', label: 'Treble' }, { v: 'bass', label: 'Bass' }], ed.staff, (v) => {
              // Keep the notes already placed; on the grand staff, notes below middle C start in the bass clef.
              ed.staff = v;
              ed.notes = ed.notes.map(({ st, ...p }) => (v === 'grand' ? Object.assign(p, { st: MQ.dia(p) < 28 ? 1 : 0 }) : p));
              mount();
            }))
            : grp('Clef', seg(kind + '-clef', [{ v: 'treble', label: 'Treble' }, { v: 'bass', label: 'Bass' }], ed.clef, (v) => { ed.clef = v; mount(); }))),
        h('p', { class: 'cc-shown' }, 'Students will see: ', shown),
        answerLabel,
        staffBox, tools,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, ed.index >= 0 ? 'Save changes' : voicing ? 'Add voicing' : 'Add chord'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { reset(); redraw(); } }, ed.index >= 0 ? 'Cancel' : 'Clear')));
    }

    redraw();
    if (voicing) {
      return h('div', { class: 'qt-body' },
        h('p', { class: 'help' }, 'Students voice each chord symbol on the staff you choose for it: the grand staff (notes in both clefs, like a pianist), or the treble or bass clef alone. Graded on exact pitches; on the grand staff a shared note such as middle C counts on either staff. Save as many as you like — the counter on the tab sets how many are asked.'),
        list, editor);
    }
    return h('div', { class: 'qt-body' },
      h('p', { class: 'help' }, 'Write your own chord-symbol questions. Save as many as you like — the counter on the tab sets how many are asked.'),
      h('div', { class: 'rule-box' },
        h('strong', null, 'How answers are checked'),
        h('ul', null,
          h('li', null, 'Only note names count — octave, range and order don’t matter.'),
          h('li', null, 'In 11th and 13th chords, the 5th may be left out.'),
          h('li', null, 'In any chord with a 9th (11ths and 13ths included), the root may be left out.'),
          h('li', null, 'A natural 9th in an 11th or 13th chord, and a natural 11th in a 13th chord, may be left out or added.'),
          h('li', null, 'Any note the symbol sharpens or flattens (♭9, ♯11, ♭13, ♭5 …) is required. A sharpened or flattened note the symbol doesn’t ask for is wrong.'))),
      list, editor);
  }


  // ---------- voicing categories: one chord, or a whole progression, in a named technique ----------
  function voicePanel(cfg, changed, key, notesPick) {
    const block = cfg[key] = MQ.voiceSettings(cfg[key]);
    const isProg = key === 'vp';
    const id = (n) => key + '-' + n;
    const set = (k, v) => { block[k] = v; changed(); };
    const opt = (k, v) => { block.opts[k] = v; changed(); };
    const staffSeg = (name, k) => grp('Staff', seg(id(name), [{ v: 0, label: 'A mix of both' }, { v: 1, label: 'Treble only' }, { v: 2, label: 'Bass only' }], block.opts[k] || 0, (v) => opt(k, v)));
    // One row per technique: how many questions use it, and the choices it offers.
    const rows = MQ.TECHNIQUES.filter((t) => !(isProg && t.id === 'custom')).map((t) => {
      const ctr = counter(id('n-' + t.id), t.label, (v) => { block.tech[t.id] = v; changed(); });
      ctr.dataset.tech = key + ':' + t.id;        // so the tab counter can keep this one in step
      ctr.sync(block.tech[t.id] || 0, 20);
      const body = {
        thirds: () => [staffSeg('thirds-staff', 'thirdsStaff'),
          toggle(id('omit'), 'Leave out the root', 'The voicing starts on the third.', block.opts.thirdsOmitRoot, (v) => opt('thirdsOmitRoot', v ? 1 : 0))],
        block: () => [staffSeg('block-staff', 'blockStaff')],
        planes: () => [grp('Spelling', seg(id('open'), [{ v: 0, label: 'Closed' }, { v: 1, label: 'Open' }, { v: 2, label: 'A mix of both' }], block.opts.planesOpen || 0, (v) => opt('planesOpen', v)))],
        pophorn: () => [grp('Notes', seg(id('pop'), [{ v: 3, label: '3 notes' }, { v: 4, label: '4 notes (root in the bass)' }], block.opts.popNotes === 4 ? 4 : 3, (v) => opt('popNotes', v))),
          block.opts.popNotes === 4 ? null : staffSeg('pop-staff', 'popStaff')],
        inner7: () => [toggle(id('inner2'), 'Inner 2nds', 'Brings the top voice down so it makes a second with its pair.', block.opts.inner2, (v) => opt('inner2', v ? 1 : 0))],
        custom: () => [h('p', { class: 'help' }, 'Write the chord symbol and the exact voicing yourself. Students write that voicing note for note, or name the chord when the notes are printed.'),
          customChordSection(cfg, changed, 'voicing')],
      }[t.id];
      const notes = {
        chorale: 'Root, fifth, third and top note on the grand staff. A ninth takes the top note’s place; an eleventh or thirteenth takes the fifth’s.',
        drop2: 'A block voicing with the second note from the top dropped an octave. Low notes move to the bass clef of a grand staff.',
        drop24: 'A block voicing with the second and fourth notes from the top dropped an octave.',
        planes: 'Always the grand staff: root, 3 plane, 5 plane, 7 plane and 9 plane.',
        block: 'Four notes within an octave, no root. An eleventh or thirteenth replaces the fifth; a sixth or seventh replaces the octave.',
        inner7: 'Always the grand staff. The voices pair off a seventh apart, with thirds, sevenths and thirteenths low.',
        thirds: 'Every note of the chord stacked in thirds. In an eleventh chord the ninth is optional; in a thirteenth the ninth and eleventh are, unless they are altered.',
        pophorn: 'Three-note shapes such as 3-5-1 or 7-3-1. Four-note shapes add the root underneath on a grand staff.',
        custom: '',
      }[t.id];
      const extra = body ? body().filter(Boolean) : [];
      return h('div', { class: 'vt-row' + (block.tech[t.id] ? ' is-on' : '') },
        h('div', { class: 'vt-head' }, h('strong', null, t.label), ctr),
        notes ? h('p', { class: 'help' }, notes) : null,
        extra.length ? h('div', { class: 'vt-opts' }, ...extra) : null);
    });
    return h('div', { class: 'qt-body' },
      h('p', { class: 'help' }, isProg
        ? 'A progression of chords, every chord voiced with the same technique. Set how many progressions use each technique below.'
        : 'One voiced chord per question. Set how many questions use each technique below — the tab’s counter adds them up.'),
      h('div', { class: 'row2' },
        grp('Chord sizes', chips(id('sizes'), [{ label: 'Triads' }, { label: 'Sevenths' }, { label: '9ths and above' }], block.sizes, (m) => set('sizes', m), (x) => x.label)),
        grp('Chord qualities', chips(id('quals'), [{ label: 'Major' }, { label: 'Minor' }, { label: 'Augmented' }, { label: 'Diminished' }, { label: 'Suspended' }], block.quals, (m) => set('quals', m), (x) => x.label))),
      grp('Chords come from', seg(id('key'), MQ.VOICE_KEYS.map((k, i) => ({ v: i, label: k.label })), block.key, (v) => set('key', v)),
        'A key keeps the chords diatonic. Chromatic allows any root and any quality you turned on.'),
      h('div', { class: 'toggles' },
        toggle(id('alts'), 'Include altered notes', 'Lets chords carry a ♭5, ♯5, ♭9, ♯9, ♯11 or ♭13.', block.alts, (v) => set('alts', v ? 1 : 0)),
        toggle(id('slash'), 'Allow slash chords', 'A chord tone other than the root can be written underneath.', block.slash, (v) => set('slash', v ? 1 : 0))),
      isProg ? grp('Chords in each progression', seg(id('len'), [2, 3, 4, 5, 6].map((v) => ({ v, label: String(v) })), block.len, (v) => set('len', v))) : null,
      grp('Notes on the staff', seg(id('ask'), [
        { v: 1, label: 'Print the chord symbol — students write the notes' },
        { v: 2, label: 'Print the voicing — students write the chord symbol' },
        { v: 3, label: 'A mix of both' }], block.ask, (v) => set('ask', v))),
      notesPick(isProg ? 'vprog' : 'voicing', 'Print the lowest note', 'Students write every note'),
      h('h4', { class: 'vt-title' }, 'Voicing techniques'),
      h('div', { class: 'vt-list' }, ...rows));
  }

  // ---------- chord progressions (teacher writes chords or lets the rules generate them) ----------
  function selectEl(id, options, value, onPick) {
    const el = h('select', { id });
    options.forEach((o) => { const op = document.createElement('option'); op.value = String(o.v); op.textContent = o.label; el.append(op); });
    el.value = String(value);
    el.addEventListener('change', () => onPick(el.value));
    return el;
  }
  const FIFTHS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
  const sigLabel = (f) => {
    if (!f) return 'No sharps or flats';
    const names = (f > 0 ? 'F C G D A E B' : 'B E A D G C F').split(' ').slice(0, Math.abs(f)).map((l) => l + (f > 0 ? '♯' : '♭'));
    return `${Math.abs(f)} ${f > 0 ? 'sharp' : 'flat'}${Math.abs(f) > 1 ? 's' : ''} (${names.join(' ')})`;
  };
  const TONICS = [];
  'CDEFGAB'.split('').forEach((l, step) => [-1, 0, 1].forEach((alt) => TONICS.push({ v: `${step},${alt}`, label: l + (alt < 0 ? '♭' : alt > 0 ? '♯' : '') })));
  const STAFF_NAMES = { treble: 'Treble clef', bass: 'Bass clef', grand: 'Grand staff' };

  function progressionSection(cfg, changed) {
    const fresh = () => ({ index: -1, kind: 'written', staff: 'grand', voicing: 'closed', mode: 'major', fifths: 0, tonic: { step: 0, alt: 0 }, minorType: 'harmonic', text: '', len: 4, sevenths: 1, deceptive: false, qcount: 3, sample: 1 });
    let ed = fresh();
    const list = h('div', { class: 'cc-list' });
    const editor = h('div', { class: 'cc-editor' });
    const keyOf = () => MQ.makeKey(ed.mode, ed.fifths, ed.tonic, ed.minorType);
    const redraw = () => { drawList(); drawEditor(); };

    function drawList() {
      if (!cfg.progs.length) { list.replaceChildren(h('p', { class: 'cc-empty' }, 'No progressions yet. Add one below.')); return; }
      list.replaceChildren(...cfg.progs.map((e, i) => h('div', { class: 'cc-row pg-row' + (ed.index === i ? ' is-editing' : '') },
        h('span', { class: 'pg-title' }, e.kind === 'auto' ? 'Automatic' : e.chords.map((c) => MQ.romanOf(c, e.key)).join('  ')),
        h('span', { class: 'cc-meta' },
          h('span', null, `${MQ.keyLabel(e.key)} · ${STAFF_NAMES[e.staff]}${e.staff === 'grand' ? ` · ${e.voicing === 'open' ? 'open' : 'closed'} voicing` : ''}`),
          h('span', null, e.kind === 'auto'
            ? `${e.len} chords · ${['triads only', 'some 7ths', 'all 7ths'][e.sevenths]}${e.deceptive ? ' · deceptive cadence' : ''} · ${e.qcount} question${e.qcount > 1 ? 's' : ''}`
            : e.chords.map(MQ.symbolOf).join('  '))),
        h('span', { class: 'cc-actions' },
          h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': `Edit progression ${i + 1}`, onclick: () => {
            ed = Object.assign(fresh(), {
              index: i, kind: e.kind, staff: e.staff, voicing: e.voicing || 'closed', mode: e.key.mode, fifths: e.key.fifths,
              tonic: { ...e.key.tonic }, minorType: e.key.minorType,
              text: e.kind === 'written' ? e.chords.map((c) => MQ.romanOf(c, e.key)).join(' ') : '',
              len: e.len || 4, sevenths: e.sevenths == null ? 1 : e.sevenths, deceptive: !!e.deceptive, qcount: e.qcount || 3,
            });
            redraw();
          } }, 'Edit'),
          h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': `Remove progression ${i + 1}`, onclick: () => {
            cfg.progs.splice(i, 1);
            if (ed.index === i) ed = fresh(); else if (ed.index > i) ed.index--;
            changed(); redraw(); toast('Removed the progression');
          } }, 'Remove')))));
    }

    function drawEditor() {
      const preview = h('div', { class: 'staff-box pg-preview' });
      const msg = h('p', { class: 'pg-msg', role: 'status' });
      const voicingWrap = grp('Grand-staff voicing', seg('pg-voicing', [
        { v: 'closed', label: 'Closed — root, 3p, 5p, 7p, 9p  /  root, 7p, 9p, 3p, 5p' },
        { v: 'open', label: 'Open — root, 3p, 7p, 9p, 5p  /  root, 7p, 3p, 5p, 9p' }], ed.voicing, (v) => { ed.voicing = v; sync(); }),
      'Each chord takes one note from each plane, stacked upward with no more than an octave between neighbours; the root is always lowest. The first chord uses one layout and the chords alternate after that. Planes: 3p is the 3rd (4th in sus chords); 7p the 7th, 6th in sixth chords, or octave in triads; 5p the 5th (♭5, ♯5, 11th or 13th when the chord has one); 9p the 9th or the octave. In triads 7p and 9p are both the octave, so it is used once and the chord has four notes. Apart from the root, no note is lower than G3.');
      voicingWrap.querySelector('.seg').classList.add('seg-col');
      const stackNote = h('p', { class: 'help' }, 'On a single staff each chord is stacked in close position around the middle of the staff, in whichever inversion fits best.');
      const majorSel = selectEl('pg-major', FIFTHS.map((f) => ({ v: f, label: `${MQ.MAJOR_KEYS[f + 7]} major — ${sigLabel(f).toLowerCase()}` })), ed.fifths, (v) => { ed.fifths = +v; sync(); });
      const minorSel = selectEl('pg-minor', FIFTHS.map((f) => ({ v: f, label: `${MQ.MINOR_KEYS[f + 7]} minor — ${sigLabel(f).toLowerCase()}` })), ed.fifths, (v) => { ed.fifths = +v; sync(); });
      const tonicSel = selectEl('pg-tonic', TONICS, `${ed.tonic.step},${ed.tonic.alt}`, (v) => { const [st, al] = v.split(',').map(Number); ed.tonic = { step: st, alt: al }; sync(); });
      const sigSel = selectEl('pg-sig', FIFTHS.map((f) => ({ v: f, label: sigLabel(f) })), ed.fifths, (v) => { ed.fifths = +v; sync(); });
      const majorWrap = fld('Key', majorSel);
      const minorWrap = h('div', { class: 'row2' }, fld('Key', minorSel),
        grp('Minor form', seg('pg-minortype', [{ v: 'harmonic', label: 'Harmonic' }, { v: 'melodic', label: 'Melodic' }], ed.minorType, (v) => { ed.minorType = v; sync(); }),
          'Harmonic: ii° and iv. Melodic: ii and IV.'));
      const customWrap = h('div', { class: 'row2' }, fld('Starting pitch (tonic)', tonicSel), fld('Key signature', sigSel));
      const chordsIn = textIn('pg-chords', ed.text, 120, 'e.g. ii7 V7 Ima7   or   Dmi7 G7 Cma7', (v) => { ed.text = v; sync(); });
      ['spellcheck', 'autocapitalize', 'autocorrect'].forEach((a) => chordsIn.setAttribute(a, a === 'spellcheck' ? 'false' : 'off'));
      const writtenWrap = fld('Chords', chordsIn, 'Separate chords with spaces. Use Roman numerals (ii7, V7, ♭VII, Vsus4, I6 — capitals for major, lower case for minor) or chord symbols (Dmi7, G7, Bbma7, Csus4, F6). Type b for ♭, # for ♯ and o for °; m or - also mean minor, maj or ma major, and + augmented. Up to 8 chords.');
      const autoWrap = h('div', { class: 'qt-body' },
        grp('Chords in each progression', seg('pg-len', [3, 4, 5, 6, 7, 8].map((v) => ({ v, label: String(v) })), ed.len, (v) => { ed.len = v; sync(); })),
        grp('Seventh chords', seg('pg-sev', [{ v: 0, label: 'Triads only' }, { v: 1, label: 'Some 7ths' }, { v: 2, label: 'All 7ths' }], ed.sevenths, (v) => { ed.sevenths = v; sync(); })),
        toggle('pg-deceptive', 'Include a deceptive cadence', 'Where V would resolve to I, it goes to vi or iii instead and the progression carries on from there.', ed.deceptive, (v) => { ed.deceptive = v; sync(); }),
        grp('Questions from these settings', seg('pg-qcount', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v, label: String(v) })), ed.qcount, (v) => { ed.qcount = v; }),
          'Each question gets its own progression — the same ones for every student.'),
        h('p', { class: 'help' }, 'Roots move up a perfect 4th through 7–3–6–2–5–1, starting anywhere and jumping back after I. IV can stand in for ii or V, vii for V, and V–IV–I is allowed. Chord qualities follow the key (major, harmonic or melodic minor, or the custom key signature).'));
      const another = h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => { ed.sample++; sync(); } }, 'Show another example');

      function sync() {
        voicingWrap.hidden = ed.staff !== 'grand';
        stackNote.hidden = ed.staff === 'grand';
        majorWrap.hidden = ed.mode !== 'major';
        minorWrap.hidden = ed.mode !== 'minor';
        customWrap.hidden = ed.mode !== 'custom';
        writtenWrap.hidden = ed.kind !== 'written';
        autoWrap.hidden = another.hidden = ed.kind !== 'auto';
        [majorSel, minorSel, sigSel].forEach((el) => (el.value = String(ed.fifths)));
        const key = keyOf();
        let chords = [], errors = [];
        if (ed.kind === 'written') ({ chords, errors } = MQ.parseProgressionText(ed.text, key));
        else chords = MQ.autoProgression(MQ.mulberry32(ed.sample * 7919), { key, len: ed.len, sevenths: ed.sevenths, deceptive: ed.deceptive });
        msg.replaceChildren(errors.length ? accText(`Can’t read ${errors.map((t) => `“${t}”`).join(', ')}. Check the spelling — for example ii7, V7, Bbma7.`)
          : chords.length > 8 ? accText('Use 8 chords or fewer.') : '');
        preview.replaceChildren();
        if (!chords.length) { preview.append(h('p', { class: 'empty' }, ed.kind === 'written' ? 'Type some chords to see them here.' : '')); return; }
        const q = MQ.progressionQuestion({ staff: ed.staff, key, voicing: ed.voicing }, chords.slice(0, 8), { progMode: 0 });
        new MQ.Staff(preview, { clef: q.clef, grand: q.grand, keySig: q.keySig, keyAware: true, columns: q.columns, readOnly: true, chordLabels: { top: q.prog.symbols, bottom: q.prog.romans }, barlines: true, colW: 62 });
        preview.append(playButton(() => q.columns.map((c) => c.given), 1, 'the progression'));
      }

      const save = () => {
        const key = keyOf();
        const entry = { kind: ed.kind, staff: ed.staff, key, voicing: ed.voicing };
        if (ed.kind === 'written') {
          const { chords, errors } = MQ.parseProgressionText(ed.text, key);
          if (errors.length) { toast(`Fix the chords Clefwork can’t read: ${errors.join(', ')}`, 'bad'); chordsIn.focus(); return; }
          if (chords.length < 2) { toast('Enter at least two chords.', 'bad'); chordsIn.focus(); return; }
          if (chords.length > 8) { toast('A progression can have up to 8 chords.', 'bad'); return; }
          entry.chords = chords;
        } else Object.assign(entry, { len: ed.len, sevenths: ed.sevenths, deceptive: ed.deceptive, qcount: ed.qcount });
        // New entries are asked by default when every existing question was being asked.
        const askingAll = (cfg.counts.progression || 0) >= Math.min(30, MQ.progPool(cfg).length);
        if (ed.index >= 0) cfg.progs[ed.index] = entry;
        else if (cfg.progs.length >= MQ.MAX_CUSTOM) { toast(`A quiz can hold up to ${MQ.MAX_CUSTOM} progressions.`, 'bad'); return; }
        else cfg.progs.push(entry);
        if (askingAll) cfg.counts.progression = Math.min(30, MQ.progPool(cfg).length);
        toast(ed.index >= 0 ? 'Progression updated' : 'Progression added');
        ed = fresh(); changed(); redraw();
      };

      editor.replaceChildren(
        h('div', { class: 'cc-edit-head' }, h('strong', null, ed.index >= 0 ? `Editing progression ${ed.index + 1}` : 'Add a progression')),
        grp('Staff', seg('pg-staff', [{ v: 'treble', label: 'Treble' }, { v: 'bass', label: 'Bass' }, { v: 'grand', label: 'Grand staff' }], ed.staff, (v) => { ed.staff = v; sync(); })),
        voicingWrap, stackNote,
        grp('Key', seg('pg-mode', [{ v: 'major', label: 'Major' }, { v: 'minor', label: 'Minor' }, { v: 'custom', label: 'Custom' }], ed.mode, (v) => { ed.mode = v; sync(); })),
        majorWrap, minorWrap, customWrap,
        grp('Chords', seg('pg-kind', [{ v: 'written', label: 'Write the chords' }, { v: 'auto', label: 'Generate automatically' }], ed.kind, (v) => { ed.kind = v; sync(); })),
        writtenWrap, autoWrap,
        h('div', { class: 'pg-preview-head' }, h('span', { class: 'mini-label' }, 'Preview — chord symbols above, Roman numerals below'), another),
        preview, msg,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, ed.index >= 0 ? 'Save changes' : 'Add progression'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { ed = fresh(); redraw(); } }, ed.index >= 0 ? 'Cancel' : 'Clear')));
      sync();
    }

    redraw();
    const modeGroup = grp('What students see and answer', seg('pg-answer-mode', MQ.PROG_MODES.map((m, i) => ({ v: i, label: m.label })), cfg.progMode || 0, (v) => { cfg.progMode = v; changed(); }),
      'Applies to every progression question. The last three options print the chords’ names and have students write the notes. Students’ typing is read flexibly: Bmi7b5, Bm7b5, Bø7 and B-7-5 all count.');
    modeGroup.querySelector('.seg').classList.add('seg-col');
    return h('div', { class: 'qt-body' },
      h('p', { class: 'help' }, 'Students read block chords on the staff, written in the key with its key signature. Save progressions you write, or automatic ones that make up a new progression for each question. The counter on the tab sets how many are asked.'),
      modeGroup, list, editor);
  }

  // ---------- spreadsheet export ----------
  // Files go out through the viewer's `downloads` capability when this page runs as a published
  // artifact, and through an ordinary browser download anywhere else.
  async function saveFile(filename, data) {
    const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
    if (dl) {
      try { await dl.save({ filename, data }); return 'saved'; }
      catch (e) {
        if (e && e.code === 'declined') return 'declined';
        if (e && e.code === 'rate_limited') return 'busy';
        return 'failed';
      }
    }
    try {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = h('a', { href: url, download: filename, style: 'display:none' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return 'saved';
    } catch (e) { return 'failed'; }
  }
  let xlsxLoading = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxLoading) {
      xlsxLoading = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        sc.onload = () => resolve(window.XLSX);
        sc.onerror = () => { xlsxLoading = null; reject(new Error('Could not load the spreadsheet reader.')); };
        document.head.append(sc);
      });
    }
    return xlsxLoading;
  }
  const typeCount = (cfg, id) => (MQ.BUILT_IN.some((t) => t.id === id) ? cfg.counts[id] || 0 : listCount(cfg, id));
  const EXPORT_HEADERS = ['Title', 'Teacher', 'Date created', 'Question types'].concat(MQ.TYPES.map((t) => t.label), ['Total questions', 'Quiz code']);
  const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function exportRow(code, created) {
    const cfg = MQ.decodeQuiz(code);
    const counts = MQ.TYPES.map((t) => typeCount(cfg, t.id));
    return [cfg.title || 'Untitled quiz', cfg.teacher || '', ymd(created), MQ.TYPES.filter((_, i) => counts[i]).map((t) => t.label).join('; ')]
      .concat(counts, [sumCounts(cfg), MQ.normalize(code).match(/.{1,5}/g).join('-')]);
  }
  const csvText = (rows) => '﻿' + rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\r\n') + '\r\n';
  const sameCode = (a, b) => MQ.normalize(a) === MQ.normalize(b);

  // Adds rows to the first sheet of an existing workbook, lining columns up by header name and
  // skipping any quiz whose code is already there. Returns the updated file plus what happened.
  async function appendToFile(file, rows) {
    const XLSX = await loadXLSX();
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) throw new Error('Choose an Excel (.xlsx or .xls) or CSV file.');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', raw: ext === 'csv' });
    if (!wb.SheetNames.length) wb.SheetNames.push('Quizzes'), (wb.Sheets.Quizzes = XLSX.utils.aoa_to_sheet([]));
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    // Read from row 1 with blank rows kept, so row numbers match what Excel shows.
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    const grid = range ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true, range: { s: { r: 0, c: 0 }, e: range.e } }) : [];
    const norm = (v) => String(v).trim().toLowerCase();
    let header = grid.length ? grid[0].map(String) : [];
    if (!header.some((v) => v.trim())) header = [];
    // Duplicate check: the "Quiz code" column, or every cell when there is no such column.
    const codeCol = header.findIndex((v) => norm(v) === 'quiz code');
    const cells = grid.map((r, i) => ({ row: i + 1, vals: codeCol >= 0 ? [r[codeCol]] : r })).slice(header.length ? 1 : 0);
    const added = [], dupes = [];
    rows.forEach((row) => {
      const code = row[row.length - 1];
      const hit = cells.find((c) => c.vals.some((v) => v && sameCode(v, code)));
      if (hit) dupes.push({ title: row[0], row: hit.row }); else added.push(row);
    });
    if (!added.length) return { dupes, added, data: null, name: file.name, sheetName };
    // Line our columns up with the sheet's header, adding any it lacks at the end.
    if (!header.length) header = EXPORT_HEADERS.slice();
    const colFor = EXPORT_HEADERS.map((hd) => {
      let i = header.findIndex((v) => norm(v) === norm(hd));
      if (i < 0) { header.push(hd); i = header.length - 1; }
      return i;
    });
    XLSX.utils.sheet_add_aoa(ws, [header], { origin: 'A1' });
    const startRow = Math.max(range ? range.e.r + 1 : 0, 1); // first row after everything already in the sheet
    const out = added.map((row) => { const r = new Array(header.length).fill(''); row.forEach((v, i) => (r[colFor[i]] = v)); return r; });
    XLSX.utils.sheet_add_aoa(ws, out, { origin: { r: startRow, c: 0 } });
    const bookType = ext === 'csv' ? 'csv' : 'xlsx';
    const name = ext === 'xls' ? file.name.replace(/\.xls$/i, '.xlsx') : file.name;
    let data = XLSX.write(wb, { bookType, type: 'array' });
    if (bookType === 'csv') data = '﻿' + new TextDecoder().decode(data).replace(/^﻿/, '');
    return { dupes, added, data, name, sheetName };
  }

  function openExport(cfg) {
    if (!S.code) return;
    rememberQuiz(S.code, cfg);
    const recent = store.get('recent', []).filter((r) => { try { MQ.decodeQuiz(r.code); return true; } catch (e) { return false; } });
    const current = recent.find((r) => sameCode(r.code, S.code));
    let scope = 'this';
    const rowsFor = () => (scope === 'this' ? [exportRow(S.code, current ? current.created || current.at : Date.now())] : recent.map((r) => exportRow(r.code, r.created || r.at)));
    const status = h('div', { class: 'ex-status', role: 'status' });
    const setStatus = (tone, ...kids) => { status.className = 'ex-status' + (tone ? ' is-' + tone : ''); status.replaceChildren(...kids); };
    const fileIn = h('input', { type: 'file', id: 'ex-file', accept: '.xlsx,.xls,.csv', class: 'sr-only' });
    const dlg = h('dialog', { class: 'ex-dialog', 'aria-labelledby': 'ex-title' });
    const close = () => { dlg.close(); dlg.remove(); };
    const report = (res) => (res === 'saved' ? null : res === 'declined' ? 'The download was cancelled.' : res === 'busy' ? 'Another download is waiting for your answer — finish that one first.' : 'This page couldn’t save the file here. Try the standalone copy of Clefwork.');

    const newCsv = async () => {
      const rows = rowsFor();
      const name = scope === 'this' ? `${(cfg.title || 'quiz').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'quiz'}.csv` : `clefwork-quizzes-${ymd(Date.now())}.csv`;
      setStatus('', 'Preparing the file…');
      const res = await saveFile(name, csvText([EXPORT_HEADERS].concat(rows)));
      const err = report(res);
      if (err) setStatus('bad', err);
      else setStatus('good', h('strong', null, `Saved ${name}`), ` — ${rows.length} quiz${rows.length === 1 ? '' : 'zes'}.`);
    };
    fileIn.addEventListener('change', async () => {
      const file = fileIn.files && fileIn.files[0];
      fileIn.value = '';
      if (!file) return;
      setStatus('', `Reading ${file.name}…`);
      try {
        const rows = rowsFor();
        const r = await appendToFile(file, rows);
        const dupText = r.dupes.map((d) => `“${d.title}” is already in ${file.name} (row ${d.row})`);
        if (!r.data) {
          setStatus('warn', h('strong', null, rows.length === 1 ? 'This is a duplicate.' : 'These are all duplicates.'), ' ', dupText.join('; ') + '. Nothing was added.');
          return;
        }
        const res = await saveFile(r.name, r.data);
        const err = report(res);
        if (err) { setStatus('bad', err); return; }
        setStatus(r.dupes.length ? 'warn' : 'good',
          h('strong', null, `Added ${r.added.length} quiz${r.added.length === 1 ? '' : 'zes'} to ${r.name}`), /\.csv$/i.test(r.name) ? '. ' : ` (sheet “${r.sheetName}”). `,
          r.dupes.length ? `Skipped duplicates: ${dupText.join('; ')}. ` : '',
          'Your browser saved an updated copy — replace the original file with it.');
      } catch (e) {
        setStatus('bad', e.message && !/^[A-Z_]+$/.test(e.message) ? e.message : 'That file couldn’t be read as a spreadsheet.');
      }
    });
    const chooseFile = h('label', { class: 'btn btn-primary', for: 'ex-file' }, 'Yes — choose the file…');
    chooseFile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    chooseFile.tabIndex = 0;
    dlg.append(...[
      h('div', { class: 'ex-head' }, h('h2', { id: 'ex-title' }, 'Export to spreadsheet'), h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Close', onclick: close }, '✕')),
      h('p', { class: 'help' }, 'Columns: title, teacher, date created, question types, how many of each type, total questions and the quiz code.'),
      recent.length > 1 ? grp('Which quizzes', seg('ex-scope', [{ v: 'this', label: 'This quiz' }, { v: 'all', label: `All ${recent.length} saved on this device` }], scope, (v) => { scope = v; })) : null,
      h('div', { class: 'ex-ask' },
        h('strong', null, 'Add to an existing Excel or CSV file?'),
        h('span', { class: 'help' }, 'Clefwork checks the file’s Quiz code column and won’t add a quiz that’s already there.'),
        h('div', { class: 'btn-row' }, chooseFile, fileIn, h('button', { type: 'button', class: 'btn', onclick: newCsv }, 'No — make a new CSV file'))),
      status].filter(Boolean));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    loadXLSX().catch(() => {});
  }

  // ---------- student ----------
  function openQuiz(code, opts) {
    try {
      const cfg = MQ.decodeQuiz(code);
      if (!sumCounts(cfg)) throw new MQ.CodeError('This quiz has no questions.');
      if (listCount(cfg, 'analysis')) {
        // The music comes in the link. Check it belongs to this quiz before keeping it.
        const want = cfg.analysis.img && cfg.analysis.img.hash;
        const img = opts && opts.img;
        if (img) {
          let got = null;
          try { got = MQ.hashOfData(img); } catch (e) { /* unreadable */ }
          if (got !== want) throw new MQ.CodeError('The music in this link is damaged or cut short — some email programs break long links. Ask your teacher for the link again, or open it from Canvas.');
          keepScore(img, want);
        } else if (!want || !scoreData(want)) {
          throw new MQ.CodeError('This quiz is on a picture of the music, which comes in the quiz link — the code on its own doesn’t carry it. Open the link your teacher sent.');
        }
      }
      const preview = !!(opts && opts.preview);
      const limit = MQ.retakeLimit(cfg);
      const used = preview ? 0 : attemptsUsed(code);
      if (limit != null && used >= limit + 1) {
        throw new MQ.CodeError(limit === 0 ? 'You’ve already taken this quiz on this device, and it can be taken once.'
          : `You’ve used all ${limit + 1} attempts at this quiz on this device.`);
      }
      const qs = MQ.generateQuiz(cfg);
      S.take = {
        attempt: used + 1,
        code: code.replace(/[^0-9A-Za-z]/g, '').toUpperCase(), cfg, qs, name: '', idx: 0,
        resp: qs.map(() => null), secs: qs.map(() => 0), checked: qs.map(() => false),
        started: false, done: false, reviewing: false, preview: !!(opts && opts.preview),
      };
      saveAttempt();
      return true;
    } catch (e) {
      toast(e.message || 'That code didn’t work.', 'bad');
      return false;
    }
  }

  // ---------- retakes ----------
  // Attempts are counted on this device, per quiz (a retake reuses the same code and questions).
  // The limit comes from the quiz code; each report also records its attempt number, so the teacher
  // can see it even though a device can't stop a student starting afresh somewhere else.
  const attemptLog = () => store.get('attempts', {}) || {};
  const attemptsUsed = (code) => ((attemptLog()[MQ.quizId(code)] || {}).count || 0);
  function recordAttempt(code, pct) {
    const log = attemptLog();
    const id = MQ.quizId(code);
    const a = log[id] || { count: 0, best: null };
    a.count += 1;
    a.best = a.best == null ? pct : Math.max(a.best, pct);
    log[id] = a;
    store.set('attempts', log);
  }
  const bestSoFar = (code) => { const a = attemptLog()[MQ.quizId(code)]; return a && a.best != null ? a.best : null; };
  // Tries still allowed after the attempt just finished: Infinity when the quiz sets no limit.
  function retakesLeft(t) {
    const limit = MQ.retakeLimit(t.cfg);
    if (t.preview || limit == null) return Infinity;
    return Math.max(0, limit + 1 - attemptsUsed(t.code));
  }
  const retakeText = (limit) => (limit == null ? 'Unlimited' : limit === 0 ? 'None' : String(limit));
  function retakeQuiz() {
    const t = S.take;
    if (!t) return;
    if (retakesLeft(t) <= 0) { toast('There are no retakes left for this quiz.'); return; }
    const { name, preview } = t;
    if (!openQuiz(t.code, { preview })) return;
    Object.assign(S.take, { name, started: true, startedAt: Date.now() });
    if (preview) S.take.attempt = (t.attempt || 1) + 1;
    saveAttempt();
    go(tv());
  }
  // The retake button and what it says, for the end of a quiz.
  function retakeBlock(t) {
    if (t.practice) return null;
    const left = retakesLeft(t);
    const limit = MQ.retakeLimit(t.cfg);
    const best = t.preview ? null : bestSoFar(t.code);
    const about = [`Attempt ${t.attempt || 1}`, best != null ? `best so far ${Math.round(best)}%` : null].filter(Boolean).join(' · ');
    const note = left === Infinity ? 'You can retake this quiz as many times as you like — the same questions, a fresh start.'
      : left > 0 ? `You can retake this quiz ${left} more time${left === 1 ? '' : 's'}.`
        : limit === 0 ? 'This quiz can be taken once.' : 'You’ve used every retake for this quiz.';
    return h('div', { class: 'retake-row' },
      left > 0 ? h('button', { type: 'button', class: 'btn', onclick: retakeQuiz }, 'Retake quiz') : null,
      h('p', { class: 'fine' }, h('b', null, about + '. '), note));
  }

  // ---------- start over ----------
  // A bar held at the top of the window on every screen of a quiz. Starting over goes back to the
  // start screen with a blank name and blank answers. It records no attempt: only submitting does.
  // An unsubmitted try keeps its attempt number; after submitting, starting over is the next attempt,
  // so it's only offered while the quiz allows another one.
  function startOverBar(t) {
    const noRetake = !!(t && t.done && retakesLeft(t) <= 0);
    const limit = t ? MQ.retakeLimit(t.cfg) : null;
    const about = !t ? 'No quiz open'
      : [t.cfg.title || 'Music quiz', t.preview ? 'preview' : `attempt ${t.attempt || 1}${limit != null ? ' of ' + (limit + 1) : ''}`].join(' · ');
    return h('div', { class: 'take-bar' },
      h('span', { class: 'take-bar-about' }, about),
      h('button', {
        type: 'button', class: 'btn sm', disabled: !t || noRetake || null,
        title: !t ? 'Open a quiz first' : noRetake ? 'There are no attempts left at this quiz' : 'Go back to the start of this quiz',
        onclick: startOver,
      }, '↺ Start over'));
  }
  function startOver() {
    const t = S.take;
    if (!t || S.slot !== 'take') return;
    if (t.done && retakesLeft(t) <= 0) { toast('There are no attempts left at this quiz.'); return; }
    const fresh = () => {
      const { code, attempt, preview, done } = t;
      if (!openQuiz(code, { preview })) return;
      // Not submitted: the same attempt again. Submitted: openQuiz has already numbered the next one.
      if (!done) S.take.attempt = attempt || 1;
      else if (preview) S.take.attempt = (attempt || 1) + 1;
      saveAttempt();
      go(tv());
      window.scrollTo(0, 0);
    };
    const answered = t.resp.some((r, i) => MQ.hasAnswer(t.qs[i], r));
    if (!t.started) { fresh(); return; }           // the start screen: nothing to lose but the name
    const next = (t.attempt || 1) + 1;
    confirmBox({
      title: 'Start over?',
      text: t.done
        ? [`You’ll go back to the start of the quiz and enter your name again. Your next submission will be attempt ${next}.`,
          h('strong', null, ' Send your report code first'), ' — this screen won’t come back.']
        : [`You’ll go back to the start of the quiz and enter your name again${answered ? ', and your answers will be cleared' : ''}. `,
          'This doesn’t count as an attempt — only submitting does.'],
      ok: 'Start over',
      onOk: fresh,
    });
  }
  // A small yes/no dialog. opts: title, text, ok (button label), onOk.
  function confirmBox(opts) {
    const dlg = h('dialog', { class: 'ex-dialog confirm-dialog', 'aria-labelledby': 'cf-title' });
    const close = () => dlg.close();
    dlg.append(
      h('h2', { id: 'cf-title' }, opts.title),
      h('p', null, opts.text),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { close(); opts.onOk(); } }, opts.ok),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: close }, 'Cancel')));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('.btn-quiet').focus();
  }

  const slotKey = (slot) => (slot === 'practice' ? 'practice' : 'attempt');
  function saveAttempt() {
    const t = S.take;
    if (!t) { store.del(slotKey(S.slot)); return; }
    const { cfg, qs, ...rest } = t;
    store.set(slotKey(S.slot), rest);
  }
  function restoreAttempt() {
    ['take', 'practice'].forEach((slot) => {
      const a = store.get(slotKey(slot), null);
      if (!a || !a.code) return;
      try {
        const cfg = MQ.decodeQuiz(a.code);
        const qs = MQ.generateQuiz(cfg);
        if (!a.resp || a.resp.length !== qs.length) return;
        S.slots[slot] = Object.assign(a, { cfg, qs });
      } catch (e) { store.del(slotKey(slot)); }
    });
  }
  // Student version: a practice run straight from the builder's settings. Its code is never shown.
  function startPractice(cfg) {
    if (!sumCounts(cfg)) return;
    const code = MQ.encodeQuiz(cfg);
    const dcfg = MQ.decodeQuiz(code);
    const qs = MQ.generateQuiz(dcfg);
    S.slot = 'practice';
    S.take = {
      code: MQ.normalize(code), cfg: dcfg, qs, name: '', idx: 0,
      resp: qs.map(() => null), secs: qs.map(() => 0), checked: qs.map(() => false),
      started: true, startedAt: Date.now(), done: false, reviewing: false, practice: true, practiceFeedback: S.practiceFeedback,
    };
    saveAttempt();
    go('practice');
  }
  let ticker = null;
  function stopTicker() { clearInterval(ticker); ticker = null; }
  function timeLeft(t) { return t.cfg.timeLimit ? t.cfg.timeLimit * 60 - t.secs.reduce((a, b) => a + b, 0) : null; }

  function renderTake(main) {
    const t = S.take;
    if (S.slot === 'take') main.append(startOverBar(t));
    if (!t) return takeLoad(main);
    if (!t.started) return takeIntro(main);
    if (t.done) return takeDone(main);
    return t.reviewing ? takeReview(main) : takeQuestion(main);
  }
  function takeLoad(main) {
    const ta = h('textarea', { id: 'take-code', rows: 3, placeholder: 'e.g. J4AH2-2GRWV-9SQQ8-…', spellcheck: 'false', autocomplete: 'off' });
    const open = () => { if (!ta.value.trim()) { toast('Paste the quiz code from your teacher first.'); ta.focus(); return; } if (openQuiz(ta.value)) go(tv()); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); open(); } });
    main.append(h('div', { class: 'narrow' }, h('section', { class: 'card stage' },
      h('div', { class: 'eyebrow' }, 'For students'),
      h('h1', { class: 'display' }, 'Take a quiz'),
      h('p', { class: 'lede' }, 'Paste the quiz code your teacher gave you. Dashes and spaces don’t matter.'),
      fld('Quiz code', ta),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: open }, 'Open quiz'),
        S.code && !STUDENT ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { if (openQuiz(S.code, { preview: true })) go(tv()); } }, 'Try the sample quiz') : null))));
  }
  function takeIntro(main) {
    const t = S.take, cfg = t.cfg;
    const name = textIn('student-name', t.name, 40, 'First and last name', (v) => (t.name = v));
    const start = () => {
      if (!t.name.trim()) { toast('Type your name so your teacher knows whose report it is.'); name.focus(); return; }
      t.name = t.name.trim();
      t.started = true; t.startedAt = Date.now();
      saveAttempt(); go(tv());
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    const types = MQ.BUILT_IN.filter((ty) => cfg.counts[ty.id]).map((ty) => `${ty.label} (${cfg.counts[ty.id]})`);
    if (listCount(cfg, 'custom')) types.push(`Custom chords (${listCount(cfg, 'custom')})`);
    if (listCount(cfg, 'voicing')) types.push(`Single voiced chords (${listCount(cfg, 'voicing')})`);
    if (listCount(cfg, 'vprog')) types.push(`Voiced progressions (${listCount(cfg, 'vprog')})`);
    if (cfg.counts.keys && MQ.keysCombos(cfg.keys).length) types.push(`Keys & notes (${cfg.counts.keys})`);
    if (listCount(cfg, 'progression')) types.push(`Chord progressions (${listCount(cfg, 'progression')})`);
    if (listCount(cfg, 'rhythm')) types.push(`Rhythmic dictation (${listCount(cfg, 'rhythm')} example${listCount(cfg, 'rhythm') > 1 ? 's' : ''})`);
    if (listCount(cfg, 'analysis')) {
      const asks = MQ.analysisQuestions(cfg).map((q) => q.an.ask);
      const r = asks.some((a) => a !== 'symbol'), sy = asks.some((a) => a !== 'roman');
      types.push(`Analysis (${listCount(cfg, 'analysis')} boxes) — ${r && sy ? 'Roman numerals and chord symbols' : r ? 'Roman numerals' : 'chord symbols'}`);
    }
    main.append(h('div', { class: 'narrow' }, h('section', { class: 'card stage' },
      h('div', { class: 'eyebrow' }, t.preview ? 'Preview — this is what students see' : 'Quiz'),
      h('h1', { class: 'display' }, cfg.title || 'Music quiz'),
      cfg.teacher ? h('p', { class: 'lede' }, 'From ' + cfg.teacher) : null,
      h('dl', { class: 'facts' },
        h('div', null, h('dt', null, 'Questions'), h('dd', null, String(t.qs.length))),
        h('div', null, h('dt', null, 'Time limit'), h('dd', null, cfg.timeLimit ? cfg.timeLimit + ' min' : 'None')),
        h('div', null, h('dt', null, 'Retakes'), h('dd', null, retakeText(MQ.retakeLimit(cfg)))),
        // A quiz of only Keys questions is on the grand staff and the piano, whatever the clef setting.
        onlyRhythm(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, 'Listening, one-line staff'))
          : onlyAnalysis(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, 'A picture of the score'))
          : onlyKeys(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, 'Grand staff, piano'))
          : h('div', null, h('dt', null, 'Clefs'), h('dd', null, [cfg.clefs & 1 ? 'Treble' : null, cfg.clefs & 2 ? 'Bass' : null, usesGrand(cfg) ? 'Grand staff' : null].filter(Boolean).join(', ')))),
      h('p', { class: 'types-line' }, types.join(' · ')),
      onlyAnalysis(cfg) && cfg.analysis.notes ? h('p', { class: 'an-notes' }, accText(cfg.analysis.notes)) : null,
      listCount(cfg, 'rhythm') ? h('p', { class: 'an-notes rh-intro' }, rhythmIntro(cfg, t.qs)) : null,
      fld('Your name', name),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: start }, 'Start quiz'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { S.take = null; saveAttempt(); go(tv()); } }, 'Use a different code')),
      h('p', { class: 'fine' }, MODE === 'canvas'
        ? 'Your answers stay on this device. When you finish, you’ll get a results link to hand in on Canvas.'
        : 'Your answers stay on this device. When you finish, you’ll get a report code to send your teacher.'))));
  }
  function progressHead(t) {
    const left = timeLeft(t);
    const timer = h('span', { class: 'timer' + (left != null && left < 60 ? ' is-low' : ''), id: 'timer', 'aria-live': 'off' },
      left != null ? fmtClock(Math.max(0, left)) + ' left' : fmtClock(t.secs.reduce((a, b) => a + b, 0)));
    const dots = h('nav', { class: 'dots', 'aria-label': 'Questions' });
    t.qs.forEach((q, i) => {
      let cls = 'qdot';
      if (MQ.hasAnswer(q, t.resp[i])) cls += ' is-done';
      if (t.checked[i]) cls += MQ.gradeQuestion(q, t.resp[i], t.cfg) === 1 ? ' is-right' : ' is-wrong';
      dots.append(h('button', { type: 'button', class: cls, 'aria-current': !t.reviewing && i === t.idx ? 'step' : null, 'aria-label': `Question ${i + 1}${MQ.hasAnswer(q, t.resp[i]) ? ', answered' : ''}`, onclick: () => { t.idx = i; t.reviewing = false; saveAttempt(); go(tv()); } }, String(i + 1)));
    });
    return h('div', { class: 'take-head' },
      h('div', { class: 'take-title' }, h('strong', null, t.practice ? 'Practice' : t.cfg.title || 'Music quiz'), h('span', null, t.practice ? (t.practiceFeedback ? 'Checking as you go' : 'Results at the end') : t.name)),
      timer, dots);
  }
  function startTicker() {
    stopTicker();
    ticker = setInterval(() => {
      const t = S.take;
      if (S.view !== tv() || !t || !t.started || t.done || document.hidden) return;
      t.secs[t.reviewing ? t.idx : t.idx] += 1;
      const left = timeLeft(t);
      const el = document.getElementById('timer');
      if (el) {
        el.textContent = left != null ? fmtClock(Math.max(0, left)) + ' left' : fmtClock(t.secs.reduce((a, b) => a + b, 0));
        el.classList.toggle('is-low', left != null && left < 60);
      }
      if (left != null && left <= 0) { toast('Time’s up — your quiz was submitted.'); submitQuiz(); return; }
      if (t.secs[t.idx] % 5 === 0) saveAttempt();
    }, 1000);
  }
  function takeQuestion(main) {
    if (S.take.qs[0] && S.take.qs[0].type === 'analysis') return takeAnalysis(main);
    const t = S.take, i = t.idx, q = t.qs[i];
    const locked = t.checked[i];
    if (q.type === 'rhythm' && !t.plays) t.plays = t.qs.map(() => ({ ex: 0, ans: 0 }));
    const card = questionCard(q, t.cfg, {
      response: t.resp[i], locked, reveal: locked,
      plays: q.type === 'rhythm' ? t.plays[i] : null, onPlays: saveAttempt,
      onResponse: (r) => {
        t.resp[i] = r; saveAttempt();
        const dot = document.querySelectorAll('.qdot')[i];
        if (dot) dot.classList.toggle('is-done', MQ.hasAnswer(q, r));
        if (checkBtn) checkBtn.disabled = !MQ.hasAnswer(q, r);
      },
    });
    const last = i === t.qs.length - 1;
    let checkBtn = null;
    const checking = t.cfg.flags.feedback || (t.practice && t.practiceFeedback);
    if (checking && !locked) {
      checkBtn = h('button', { type: 'button', class: 'btn', disabled: !MQ.hasAnswer(q, t.resp[i]) || null, onclick: () => { t.checked[i] = true; saveAttempt(); go(tv()); } }, 'Check answer');
    }
    main.append(h('div', { class: 'take' }, progressHead(t),
      h('section', { class: 'card stage q-stage' }, h('div', { class: 'q-num' }, `Question ${i + 1} of ${t.qs.length}`), card),
      h('div', { class: 'take-actions' },
        h('button', { type: 'button', class: 'btn btn-quiet', disabled: i === 0 || null, onclick: () => { t.idx--; saveAttempt(); go(tv()); } }, '‹ Back'),
        h('div', { class: 'spacer' }),
        checkBtn,
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
          // Practice with feedback: moving on checks the question, so wrong answers show up as you go.
          if (t.practice && t.practiceFeedback && !t.checked[i] && MQ.hasAnswer(q, t.resp[i])) {
            t.checked[i] = true;
            if (MQ.gradeQuestion(q, t.resp[i], t.cfg) < 1) toast(`Question ${i + 1} wasn’t right — its number is red, and the answer is shown there.`, 'bad');
          }
          if (last) t.reviewing = true; else t.idx++;
          saveAttempt(); go(tv());
        } }, last ? (t.practice ? 'Finish' : 'Review & submit') : 'Next ›'))));
    startTicker();
  }
  function takeReview(main) {
    const t = S.take;
    const open = t.qs.map((q, i) => (MQ.hasAnswer(q, t.resp[i]) ? -1 : i)).filter((i) => i >= 0);
    main.append(h('div', { class: 'take' }, progressHead(t),
      h('section', { class: 'card stage' },
        h('div', { class: 'eyebrow' }, t.practice ? 'Finish practice?' : 'Ready to submit?'),
        h('h1', { class: 'display' }, open.length ? `${open.length} question${open.length > 1 ? 's' : ''} still blank` : 'Every question has an answer'),
        h('p', { class: 'lede' }, open.length
          ? ['Blank questions count as wrong. Jump back with the numbers above, or submit now. Blank: ', open.map((i) => i + 1).join(', '), '.']
          : t.practice ? 'You can still go back and change anything before you see your results.'
            : MODE === 'canvas' ? 'You can still go back and change anything. Once you submit, you’ll get the results link to hand in on Canvas.'
              : 'You can still go back and change anything. Once you submit, you’ll get your report code.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: submitQuiz }, t.practice ? 'See my results' : 'Submit quiz'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { t.reviewing = false; saveAttempt(); go(tv()); } }, 'Keep working')))));
    startTicker();
  }
  function submitQuiz() {
    const t = S.take;
    if (!t || t.done) return;
    stopTicker();
    // Rhythm quizzes are scored note by note, so they always give partial credit.
    const rhythm = t.qs.some((q) => q.type === 'rhythm');
    const partial = t.cfg.flags.partial || rhythm;
    const items = t.qs.map((q, i) => {
      const frac = MQ.gradeQuestion(q, t.resp[i], t.cfg);
      const credit = frac === 1 ? 7 : partial ? Math.min(6, Math.round(frac * 7)) : 0;
      const it = { type: q.type, clef: q.clef, credit, answered: MQ.hasAnswer(q, t.resp[i]), sec: t.secs[i] };
      if (q.type === 'rhythm') { const c = MQ.compareRhythm(q, t.resp[i]); it.notes = c.notes; it.wrong = c.wrong; }
      return it;
    });
    const rh = MQ.rhythmSettings(t.cfg.rhythm);
    t.report = {
      name: t.name, submittedAt: Date.now(), totalSec: t.secs.reduce((a, b) => a + b, 0), partial, items, attempt: t.attempt || 1,
      scoring: rhythm ? { mode: rh.score, outOf: rh.outOf } : null,
    };
    if (!t.practice && !t.preview) recordAttempt(t.code, MQ.reportStats(t.report).pct);
    // The report code also carries what the student entered, so the teacher can see it on the staff.
    if (!t.practice) t.reportCode = MQ.encodeReport(Object.assign({}, t.report, { answers: { qs: t.qs, resp: t.resp, plays: t.plays } }), t.cfg, t.code);
    t.done = true;
    t.reviewing = false;
    saveAttempt();
    go(tv());
  }
  function practiceDone(main) {
    const t = S.take;
    const rep = { items: t.report.items, totalSec: t.report.totalSec };
    const st = MQ.reportStats(rep);
    main.append(h('div', { class: 'take done' },
      h('section', { class: 'card stage done-hero' },
        h('div', { class: 'eyebrow' }, 'Practice finished'),
        h('div', { class: 'score-line' },
          h('div', { class: 'score-big' }, fmtPts(st.points), h('span', null, '/' + st.n)),
          h('div', { class: 'score-meta' }, h('strong', null, Math.round(st.pct) + '%'), h('span', null, `${scoreNote(st)} · ${fmtDur(rep.totalSec)}`))),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { S.cfg.seed = MQ.randomSeed(); saveDraft(); startPractice(S.cfg); } }, 'Practise again with new questions'),
          h('button', { type: 'button', class: 'btn', onclick: () => { S.slots.practice = null; store.del('practice'); go('build'); } }, 'Change what I practise')),
        h('p', { class: 'fine' }, 'Practice results stay on this device — there’s nothing to send.')),
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'How you did'), typeBars(st), questionTable(rep, t))));
  }
  function takeDone(main) {
    const t = S.take;
    if (t.practice) return practiceDone(main);
    const rep = MQ.decodeReport(t.reportCode);
    const st = MQ.reportStats(rep);
    const teacher = t.cfg.teacher || 'your teacher';
    const body = `Hi ${t.cfg.teacher || ''},\n\nHere is my report code for "${t.cfg.title}":\n\n${t.reportCode}\n\n${t.name}`;
    const mail = `mailto:?subject=${encodeURIComponent('Quiz report: ' + (t.cfg.title || 'Music quiz') + ' — ' + t.name)}&body=${encodeURIComponent(body)}`;
    const review = t.cfg.flags.feedback;
    if (MODE === 'canvas') return canvasDone(main, t, rep, st, review);
    main.append(h('div', { class: 'take done' },
      h('section', { class: 'card stage done-hero' },
        h('div', { class: 'eyebrow' }, t.preview ? 'Preview finished' : 'Submitted'),
        h('div', { class: 'score-line' },
          h('div', { class: 'score-big' }, fmtPts(st.points), h('span', null, '/' + st.n)),
          h('div', { class: 'score-meta' }, h('strong', null, Math.round(st.pct) + '%'), h('span', null, `${scoreNote(st)} · ${fmtDur(rep.totalSec)}`))),
        h('h2', { class: 'report-h' }, `Send this report code to ${teacher}`),
        h('output', { class: 'code code-lg', id: 'report-code' }, t.reportCode),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => copyText(t.reportCode, 'Report code') }, 'Copy report code'),
          SITE ? h('button', { type: 'button', class: 'btn', onclick: () => copyText(resultsLink(t.reportCode, t.code), 'Results link') }, 'Copy results link') : null,
          h('a', { class: 'btn', href: mail, target: '_blank', rel: 'noopener' }, 'Email it')),
        retakeBlock(t),
        h('p', { class: 'fine' }, SITE
          ? 'Send the code, or the results link, which opens your results on their own page. Nothing was uploaded — reopen this tab on the same device if you lose it.'
          : 'The code contains your name, score and results. Nothing was uploaded — if you lose this code, you can reopen this tab on the same device to see it again.')),
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'How you did'), typeBars(st), questionTable(rep, review ? t : null)),
      h('div', { class: 'btn-row center' }, h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { S.take = null; saveAttempt(); go(tv()); } }, 'Take another quiz'))));
  }


  // Canvas: the student's next step is to paste one link into the assignment.
  const canvasScore = (points, n, outOf) => (outOf ? Math.round((points / n) * outOf * 100) / 100 : null);
  function canvasDone(main, t, rep, st, review) {
    const link = resultsLink(t.reportCode, t.code);
    const linkBox = h('textarea', { class: 'code cv-result', rows: 3, readonly: true, spellcheck: 'false', 'aria-label': 'Your results link' });
    linkBox.value = link;
    linkBox.addEventListener('focus', () => linkBox.select());
    const outOf = t.cfg.canvasPts || 0;
    const scaled = canvasScore(st.points, st.n, outOf);
    main.append(h('div', { class: 'take done' },
      h('section', { class: 'card stage done-hero' },
        h('div', { class: 'eyebrow' }, t.preview ? 'Preview finished' : 'Finished'),
        h('div', { class: 'score-line' },
          h('div', { class: 'score-big' }, fmtPts(st.points), h('span', null, '/' + st.n)),
          h('div', { class: 'score-meta' }, h('strong', null, Math.round(st.pct) + '%'),
            h('span', null, scaled != null ? `${fmtPts(scaled)} of ${outOf} points` : `${scoreNote(st)} · ${fmtDur(rep.totalSec)}`))),
        h('h2', { class: 'report-h' }, 'Now hand it in on Canvas'),
        h('ol', { class: 'cv-steps' },
          h('li', null, 'Press ', h('b', null, 'Copy results link'), '.'),
          h('li', null, 'Go back to the assignment in Canvas and choose ', h('b', null, 'Start Assignment'), ' (or ', h('b', null, 'Submit Assignment'), ').'),
          h('li', null, 'Choose ', h('b', null, 'Website URL'), ', paste the link, and press ', h('b', null, 'Submit Assignment'), '.')),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => copyText(link, 'Results link') }, 'Copy results link')),
        linkBox,
        h('p', { class: 'fine' }, 'If the button doesn’t copy, click the link above, then copy it yourself (Ctrl+C, or ⌘C on a Mac). Keep this tab open until Canvas shows your submission.'),
        retakeBlock(t),
        retakesLeft(t) > 0 ? h('p', { class: 'fine' }, 'Each attempt has its own results link. If you retake the quiz, hand in the link for the attempt you want counted.') : null,
        h('details', { class: 'fine-details' }, h('summary', null, 'Report code (a backup)'),
          h('output', { class: 'code' }, t.reportCode))),
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'How you did'), typeBars(st), questionTable(rep, review ? t : null))));
  }

  // ---------- stats widgets ----------
  function bar(label, pts, n, sub) {
    const pct = n ? (pts / n) * 100 : 0;
    return h('div', { class: 'bar-row' },
      h('span', { class: 'bar-label' }, label),
      h('span', { class: 'bar', role: 'img', 'aria-label': `${Math.round(pct)}%` }, h('span', { class: 'bar-fill' + (pct >= 80 ? ' is-good' : pct < 50 ? ' is-bad' : ''), style: `width:${pct}%` })),
      h('span', { class: 'bar-val' }, `${fmtPts(pts)}/${n}`, sub ? h('small', null, sub) : null));
  }
  function typeBars(st) {
    const rows = MQ.TYPES.filter((t) => st.byType[t.id]).map((t) => bar(t.label, st.byType[t.id].points, st.byType[t.id].n, `${Math.round(st.byType[t.id].sec / st.byType[t.id].count)} s avg`));
    const clefs = ['treble', 'bass', 'grand'].filter((c) => st.byClef[c]).map((c) => bar(MQ.clefLabel(c), st.byClef[c].points, st.byClef[c].n));
    return h('div', { class: 'bars' }, h('div', { class: 'bars-group' }, h('h4', null, 'By question type'), rows),
      clefs.length > 1 ? h('div', { class: 'bars-group' }, h('h4', null, 'By clef'), clefs) : null);
  }
  // "3 wrong notes" for note-scored questions, or "12 fully correct" for the rest.
  function scoreNote(st) {
    if (st.noted) return `${st.wrong} wrong note${st.wrong === 1 ? '' : 's'} of ${st.notes}`;
    return `${st.full} fully correct`;
  }
  function resultCell(it) {
    if (it.notes != null) {
      if (!it.wrong) return h('span', { class: 'res is-good' }, '✓ Correct');
      if (!it.answered) return h('span', { class: 'res is-blank' }, '— Blank');
      return h('span', { class: 'res ' + (it.wrong < it.notes ? 'is-part' : 'is-bad') }, `${it.wrong < it.notes ? '◐' : '✗'} ${it.wrong} wrong of ${it.notes}`);
    }
    if (it.credit === 7) return h('span', { class: 'res is-good' }, '✓ Correct');
    if (!it.answered) return h('span', { class: 'res is-blank' }, '— Blank');
    if (it.credit > 0) return h('span', { class: 'res is-part' }, `◐ ${Math.round((it.credit / 7) * 100)}%`);
    return h('span', { class: 'res is-bad' }, '✗ Wrong');
  }
  // `quiz` (optional) supplies question text and answers: {qs, cfg} or a take record.
  function questionTable(rep, quiz, showKey) {
    const key = quiz && showKey !== false;
    const tbody = h('tbody');
    rep.items.forEach((it, i) => {
      const q = quiz && quiz.qs[i];
      tbody.append(h('tr', null,
        h('td', { class: 'num' }, String(i + 1)),
        h('td', null, q ? q.text : typeOf(it.type).label),
        h('td', null, it.type === 'analysis' ? 'Score' : it.type === 'rhythm' ? 'Rhythm' : MQ.CLEFS[it.clef].label),
        key ? h('td', { class: 'ans' }, q ? MQ.describeAnswer(q, quiz.cfg) : '') : null,
        h('td', null, resultCell(it)),
        h('td', { class: 'num' }, it.sec >= 63 ? '63+ s' : it.sec + ' s')));
    });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'qtable' },
      h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Question'), h('th', null, 'Clef'), key ? h('th', null, 'Answer') : null, h('th', null, 'Result'), h('th', { class: 'num' }, 'Time'))),
      tbody));
  }

  // ---------- grading ----------
  function knownQuizzes(extra) {
    const out = [], seen = new Set();
    const add = (code, source) => {
      try {
        const cfg = MQ.decodeQuiz(code);
        const id = MQ.quizId(code);
        if (seen.has(id)) return;
        seen.add(id);
        out.push({ id, code, cfg, qs: MQ.generateQuiz(cfg), source });
      } catch (e) { /* ignore bad entries */ }
    };
    if (S.grade.quiz.trim()) add(S.grade.quiz, 'pasted');
    (extra || []).forEach((c) => add(c, 'link'));
    if (S.code) add(S.code, 'builder');
    store.get('recent', []).forEach((r) => add(r.code, 'recent'));
    return out;
  }
  function renderGrade(main) {
    const g = S.grade;
    const ta = h('textarea', { id: 'grade-codes', rows: 4, spellcheck: 'false', autocomplete: 'off', placeholder: 'Paste one report code or results link per line' });
    ta.value = g.input;
    const qz = h('input', { type: 'text', id: 'grade-quiz', spellcheck: 'false', autocomplete: 'off', placeholder: 'Optional — the quiz code you shared' });
    qz.value = g.quiz;
    const results = h('div', { class: 'grade-results', 'aria-live': 'polite' });
    const run = () => { g.input = ta.value; g.quiz = qz.value; g.sel = 0; runGrade(results); };
    main.append(h('div', { class: 'grade' },
      h('section', { class: 'card grade-input' },
        h('div', { class: 'eyebrow' }, 'For teachers'),
        h('h1', { class: 'display' }, 'Grade reports'),
        h('p', { class: 'lede' }, 'Paste the report codes or results links students send you. Paste several at once, one per line, for a class summary.'),
        fld('Report codes or results links', ta),
        fld('Quiz code', qz, 'Quizzes you built or copied on this device are matched automatically. Adding the code shows each question and its answer.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: run }, 'Show results'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { ta.value = exampleReports().join('\n'); run(); } }, 'Load example reports')),
        h('details', { class: 'fine-details' }, h('summary', null, 'How can I trust a report code?'),
          h('p', null, 'Each code has a checksum, so a typo or missing piece is caught. It also carries a seal tied to the quiz it came from — when the quiz is known here, the seal is checked and edited codes show a warning. The seal discourages tampering, but it isn’t unbreakable: a determined student with the quiz code could forge one. Treat it like a signed paper, not a lock.'))),
      results));
    if (g.input.trim()) runGrade(results);
  }
  // One pasted line: a bare report code, a results link (…results.html#r=REPORT&q=QUIZ),
  // or a grade link (…#grade=REPORT). Returns the report code and the quiz code if the link has one.
  function parseGradeLine(ln) {
    const hashAt = ln.indexOf('#');
    if (hashAt < 0) return { report: ln, quiz: '' };
    let frag = ln.slice(hashAt + 1);
    try { frag = decodeURIComponent(frag); } catch (e) { /* keep it as typed */ }
    const parts = {};
    frag.split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1); });
    return { report: parts.r || parts.grade || ln, quiz: parts.q || '' };
  }
  function runGrade(host) {
    const g = S.grade;
    const lines = g.input.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const errors = [], reports = [], linkQuizzes = [];
    lines.forEach((ln, i) => {
      const p = parseGradeLine(ln);
      if (p.quiz) linkQuizzes.push(p.quiz);
      try { reports.push(MQ.decodeReport(p.report)); } catch (e) { errors.push(h('li', null, h('b', null, `Line ${i + 1}: `), e.message)); }
    });
    if (g.quiz.trim()) { try { MQ.decodeQuiz(g.quiz); } catch (e) { errors.push(h('li', null, h('b', null, 'Quiz code: '), e.message)); } }
    const quizzes = knownQuizzes(linkQuizzes);
    reports.forEach((r) => {
      r.quiz = quizzes.find((q) => q.id === r.quizId) || null;
      r.sealOk = r.quiz ? r.verifySeal(r.quiz.cfg) : null;
      r.stats = MQ.reportStats(r);
    });
    host.replaceChildren();
    if (!lines.length) { toast('Paste at least one report code.'); return; }
    if (errors.length) host.append(h('section', { class: 'card notice is-bad' }, h('h3', null, errors.length === 1 ? 'One line needs attention' : `${errors.length} lines need attention`), h('ul', null, errors)));
    if (!reports.length) return;
    if (reports.length > 1) host.append(classSummary(reports, host));
    g.sel = Math.min(g.sel, reports.length - 1);
    host.append(reportDetail(reports[g.sel]));
  }
  function verifyChips(r) {
    const chip = (tone, text) => h('span', { class: 'vchip is-' + tone }, text);
    return h('div', { class: 'vchips' },
      chip('good', '✓ Code intact'),
      r.quiz ? chip('good', '✓ Quiz: ' + (r.quiz.cfg.title || 'untitled')) : chip('warn', 'Quiz not on this device — add its code to see questions'),
      r.sealOk === true ? chip('good', '✓ Seal verified') : r.sealOk === false ? chip('bad', '⚠ Seal doesn’t match — this code may have been edited') : null,
      attemptChip(r, chip));
  }
  // Which attempt this was, and a warning when it goes past the quiz's retake limit.
  function attemptChip(r, chip) {
    if (!r.attempt) return null;
    const limit = r.quiz ? MQ.retakeLimit(r.quiz.cfg) : null;
    if (limit != null && r.attempt > limit + 1) {
      return chip('bad', `⚠ Attempt ${r.attempt} — the quiz allows ${limit + 1} attempt${limit ? 's' : ''}`);
    }
    return chip(r.attempt > 1 ? 'warn' : 'good', r.attempt > 1 ? `Attempt ${r.attempt}` : 'First attempt');
  }
  // opts: showKey (default true) — print the right answers; openAnswers — show the staff view
  // straight away; canvas — add the score scaled to the quiz's Canvas points.
  function reportDetail(r, opts) {
    const o = Object.assign({ showKey: true, openAnswers: false, canvas: false }, opts);
    const st = r.stats;
    const title = r.quiz ? r.quiz.cfg.title : `Quiz #${r.quizId.toString(16).toUpperCase().padStart(4, '0')}`;
    const outOf = o.canvas && r.quiz ? r.quiz.cfg.canvasPts || 0 : 0;
    const scaled = canvasScore(st.points, st.n, outOf);
    return h('section', { class: 'card report' },
      h('div', { class: 'report-top' },
        h('div', null,
          h('div', { class: 'eyebrow' }, 'Student report'),
          h('h2', { class: 'display student' }, r.name || 'Unnamed student'),
          h('p', { class: 'meta' }, `${title} · submitted ${fmtDate(r.submittedAt)} · ${fmtDur(r.totalSec)}`),
          verifyChips(r)),
        h('div', { class: 'score-block' },
          h('div', { class: 'score-big' }, fmtPts(st.points), h('span', null, '/' + st.n)),
          h('div', { class: 'score-pct' }, Math.round(st.pct) + '%'),
          scaled != null ? h('div', { class: 'canvas-score' }, 'For Canvas: ', h('b', null, `${fmtPts(scaled)} / ${outOf}`)) : null)),
      h('dl', { class: 'facts' },
        st.noted
          ? h('div', null, h('dt', null, 'Wrong notes'), h('dd', null, `${st.wrong} of ${st.notes}`))
          : h('div', null, h('dt', null, 'Fully correct'), h('dd', null, `${st.full} of ${st.count}`)),
        h('div', null, h('dt', null, 'Answered'), h('dd', null, `${st.answered} of ${st.count}`)),
        h('div', null, h('dt', null, 'Avg per question'), h('dd', null, Math.round(st.avgSec) + ' s')),
        h('div', null, h('dt', null, 'Longest'), h('dd', null, st.slowest >= 0 ? `Q${st.slowest + 1} · ${r.items[st.slowest].sec >= 63 ? '63+' : r.items[st.slowest].sec} s` : '—'))),
      typeBars(st),
      questionTable(r, r.quiz, o.showKey),
      answersSection(r, o));
  }
  // The student's answers, question by question, on the staff — right and wrong notes marked,
  // with the correct answer. Needs the quiz (its code on this device or pasted above).
  function answersSection(r, opts) {
    const o = Object.assign({ showKey: true, openAnswers: false }, opts);
    if (!r.answers) return h('p', { class: 'fine' }, 'This report was made before answers were included in report codes, so only scores are available.');
    if (!r.quiz) return h('p', { class: 'fine' }, 'This report includes the student’s answers. Add the quiz code above to see them on the staff.');
    const box = h('div', { class: 'ans-list' });
    const build = () => {
      const cfg = r.quiz.cfg, qs = r.quiz.qs;
      const jump = h('nav', { class: 'ans-jump', 'aria-label': 'Jump to a question' });
      const cards = r.items.map((it, i) => {
        const q = qs[i];
        if (!q) return null;
        const tone = it.credit === 7 ? 'is-right' : !it.answered ? 'is-blank' : it.credit > 0 ? 'is-part' : 'is-wrong';
        const id = `ans-${r.quizId}-${i}`;
        jump.append(h('a', { href: '#' + id, class: 'qdot ' + tone, onclick: (e) => { e.preventDefault(); document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, String(i + 1)));
        // Without the key, show exactly what the student entered; the result sits in the heading.
        const card = it.answered || q.type === 'progression' || !q.choices
          ? questionCard(q, cfg, { response: MQ.answerFor(q, r.answers[i]), locked: true, reveal: o.showKey, playsUsed: r.answers[i] && r.answers[i].plays })
          : h('div', null, h('p', { class: 'q-text' }, q.text),
            h('p', { class: 'result is-bad' }, h('strong', null, 'Left blank.'), o.showKey ? [' The answer is ', h('b', null, MQ.describeAnswer(q, cfg)), '.'] : null));
        return h('section', { class: 'ans-card', id },
          h('div', { class: 'ans-head' }, h('strong', null, `Question ${i + 1}`), resultCell(it), h('span', { class: 'ans-time' }, it.sec >= 63 ? '63+ s' : it.sec + ' s')),
          card);
      }).filter(Boolean);
      box.replaceChildren(jump, ...cards);
    };
    if (o.openAnswers) { build(); return h('div', { class: 'ans-wrap' }, box); }
    const btn = h('button', { type: 'button', class: 'btn', 'aria-expanded': 'false' }, 'See answers on the staff');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide answers' : 'See answers on the staff';
      if (!open) { box.replaceChildren(); return; }
      build();
    });
    return h('div', { class: 'ans-wrap' }, h('div', { class: 'btn-row' }, btn), box);
  }
  function classSummary(reports, host) {
    const pcts = reports.map((r) => r.stats.pct).sort((a, b) => a - b);
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const mid = pcts.length % 2 ? pcts[(pcts.length - 1) / 2] : (pcts[pcts.length / 2 - 1] + pcts[pcts.length / 2]) / 2;
    const agg = {};
    reports.forEach((r) => Object.entries(r.stats.byType).forEach(([k, v]) => { agg[k] = agg[k] || { points: 0, n: 0 }; agg[k].points += v.points; agg[k].n += v.n; }));
    const tbody = h('tbody');
    reports.forEach((r, i) => {
      tbody.append(h('tr', { class: i === S.grade.sel ? 'is-sel' : null },
        h('td', null, h('button', { type: 'button', class: 'linkish', onclick: () => { S.grade.sel = i; runGrade(host); } }, r.name || 'Unnamed'),
          r.attempt > 1 ? h('span', { class: 'attempt-tag' }, ` · attempt ${r.attempt}`) : null),
        h('td', { class: 'num' }, `${fmtPts(r.stats.points)}/${r.stats.n}`),
        h('td', { class: 'num' }, Math.round(r.stats.pct) + '%'),
        h('td', { class: 'num' }, fmtDur(r.totalSec)),
        h('td', null, fmtDate(r.submittedAt)),
        h('td', null, r.sealOk === true ? h('span', { class: 'res is-good' }, '✓ Verified') : r.sealOk === false ? h('span', { class: 'res is-bad' }, '⚠ Check') : h('span', { class: 'res is-blank' }, 'Quiz unknown'))));
    });
    const csv = () => {
      const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
      const rows = [['Student', 'Points', 'Out of', 'Percent', 'Minutes', 'Submitted', 'Quiz', 'Seal']].concat(reports.map((r) => [
        r.name, fmtPts(r.stats.points), r.stats.n, Math.round(r.stats.pct), (r.totalSec / 60).toFixed(1), new Date(r.submittedAt).toISOString(),
        r.quiz ? r.quiz.cfg.title : r.quizId, r.sealOk === true ? 'verified' : r.sealOk === false ? 'mismatch' : 'unknown']));
      copyText(rows.map((row) => row.map(esc).join(',')).join('\n'), 'Spreadsheet data');
    };
    return h('section', { class: 'card class' },
      h('div', { class: 'card-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Class summary'), h('h2', { class: 'card-title' }, `${reports.length} students`)),
        h('button', { type: 'button', class: 'btn sm', onclick: csv }, 'Copy for spreadsheet')),
      h('dl', { class: 'facts' },
        h('div', null, h('dt', null, 'Average'), h('dd', null, Math.round(avg) + '%')),
        h('div', null, h('dt', null, 'Median'), h('dd', null, Math.round(mid) + '%')),
        h('div', null, h('dt', null, 'Highest'), h('dd', null, Math.round(pcts[pcts.length - 1]) + '%')),
        h('div', null, h('dt', null, 'Lowest'), h('dd', null, Math.round(pcts[0]) + '%'))),
      h('div', { class: 'bars' }, h('div', { class: 'bars-group' }, h('h4', null, 'Class results by question type'),
        MQ.TYPES.filter((t) => agg[t.id]).map((t) => bar(t.label, agg[t.id].points / reports.length, agg[t.id].n / reports.length)))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'qtable' },
        h('thead', null, h('tr', null, h('th', null, 'Student'), h('th', { class: 'num' }, 'Score'), h('th', { class: 'num' }, '%'), h('th', { class: 'num' }, 'Time'), h('th', null, 'Submitted'), h('th', null, 'Check'))),
        tbody)),
      h('p', { class: 'fine' }, 'Select a name to see that student’s full report below.'));
  }
  // Builds sample reports for the quiz currently in the builder, so the grader has something to show.
  function exampleReports() {
    const cfg = S.cfg, code = S.code || MQ.encodeQuiz(cfg);
    const qs = MQ.generateQuiz(cfg);
    rememberQuiz(code, cfg);
    return [['Example: Avery Chen', 0.92], ['Example: Sam Ortiz', 0.7], ['Example: Priya Nair', 0.5]].map(([name, skill], k) => {
      const rng = MQ.mulberry32(cfg.seed + k * 977);
      const items = qs.map((q) => {
        const hard = q.type === 'scale' || q.type === 'chord' ? 0.15 : 0;
        const r = rng();
        const credit = r < skill - hard ? 7 : cfg.flags.partial && !q.choices && r < skill + 0.2 ? 3 + Math.floor(rng() * 3) : 0;
        const it = { type: q.type, clef: q.clef, credit, answered: r < 0.97, sec: Math.round(8 + rng() * (q.type === 'scale' ? 55 : 25)) };
        // Rhythm examples are scored by wrong notes: a few for a weaker student, none when it's right.
        if (q.type === 'rhythm') {
          it.notes = MQ.compareRhythm(q, null).notes;
          it.wrong = !it.answered ? it.notes : Math.min(it.notes, Math.round(it.notes * (1 - skill) * rng() * 1.6));
          it.credit = it.wrong ? Math.min(6, Math.round(((it.notes - it.wrong) / Math.max(1, it.notes)) * 7)) : 7;
        }
        return it;
      });
      const rh = MQ.rhythmSettings(cfg.rhythm);
      const scoring = qs.some((q) => q.type === 'rhythm') ? { mode: rh.score, outOf: rh.outOf } : null;
      return MQ.encodeReport({ name, submittedAt: Date.now() - (k + 1) * 3600e3, totalSec: items.reduce((s, it) => s + it.sec, 0), partial: cfg.flags.partial || !!scoring, items, scoring }, cfg, code);
    });
  }



  // ---------- Canvas ----------
  // Everything a teacher needs to run a quiz through a Canvas assignment: the link students open,
  // a ready-made assignment description, an embed for a Canvas page, and the settings to use.
  // Students submit their results link as a Website URL; SpeedGrader opens it.
  function openCanvasKit(cfg, changed) {
    if (!S.code) return;
    rememberQuiz(S.code, cfg);
    const dlg = h('dialog', { class: 'ex-dialog canvas-dialog', 'aria-labelledby': 'cv-title' });
    const close = () => { dlg.close(); dlg.remove(); };
    const body = h('div', { class: 'cv-body' });
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const box = (id, label, value, help, rows) => {
      const ta = h('textarea', { id, rows: rows || 2, readonly: true, spellcheck: 'false', class: 'cv-code' });
      ta.value = value;
      ta.addEventListener('focus', () => ta.select());
      return h('div', { class: 'cv-item' },
        h('div', { class: 'cv-item-head' }, h('span', { class: 'mini-label' }, label),
          h('button', { type: 'button', class: 'btn sm', onclick: () => copyText(value, label) }, 'Copy')),
        ta, help ? h('span', { class: 'help' }, help) : null);
    };
    const draw = () => {
      const link = canvasLink(S.code);
      const title = cfg.title || 'Music quiz';
      const pts = cfg.canvasPts || 0;
      if (!link) {
        body.replaceChildren(h('p', { class: 'warn-note' }, 'Canvas needs the hosted copy of Clefwork, which gives each quiz a web address. Open Clefwork from its website to set this up.'));
        return;
      }
      const describe = `<p><strong>Take the quiz:</strong> <a href="${esc(link)}" target="_blank" rel="noopener">Open “${esc(title)}”</a></p>\n`
        + `<ol>\n  <li>Type your first and last name, then answer every question.</li>\n`
        + `  <li>When you finish, press <strong>Copy results link</strong>.</li>\n`
        + `  <li>Come back to this assignment, choose <strong>Start Assignment</strong> (or <strong>Submit Assignment</strong>), pick <strong>Website URL</strong>, paste the link, and submit.</li>\n</ol>`;
      const embed = `<iframe src="${esc(link)}" title="${esc(title)}" width="100%" height="900" style="border: 0;" allow="clipboard-write"></iframe>`;
      const ptsIn = h('input', { type: 'number', id: 'cv-points', min: 0, max: 1000, inputmode: 'numeric', value: pts || '' , placeholder: 'e.g. 10' });
      ptsIn.addEventListener('change', () => {
        cfg.canvasPts = Math.max(0, Math.min(1000, Math.round(+ptsIn.value || 0)));
        changed();                 // the points travel inside the quiz code, so the links change
        rememberQuiz(S.code, cfg); // and this device should recognise the new code when grading
        draw();
      });
      body.replaceChildren(
        h('ol', { class: 'cv-steps' },
          h('li', null, 'In Canvas, create an ', h('b', null, 'Assignment'), '. Under ', h('b', null, 'Submission type'), ' choose ', h('b', null, 'Online'), ' and tick only ', h('b', null, 'Website URL'), '.'),
          h('li', null, 'Set ', h('b', null, 'Points'), pts ? [' to ', h('b', null, String(pts)), '.'] : ' to whatever the quiz is worth, and enter that number below.'),
          h('li', null, 'Open the assignment description’s ', h('b', null, 'HTML editor'), ' (the ', h('code', null, '</>'), ' button) and paste the description below. Save and publish.'),
          h('li', null, 'Students take the quiz, then submit their results link. In ', h('b', null, 'SpeedGrader'), ' each submission opens that student’s results — enter the score it shows.')),
        fld('Points in Canvas', ptsIn, pts ? `Results pages show each score out of ${pts}, ready to type into SpeedGrader.` : 'Optional. When set, results pages also show the score scaled to these points.'),
        box('cv-desc', 'Assignment description (HTML)', describe, 'Paste into the HTML editor of the Canvas assignment.', 7),
        box('cv-link', 'Quiz link', link, 'The same link on its own — for an announcement, a module item, or an external URL.'),
        box('cv-embed', 'Embed on a Canvas page (optional)', embed, 'Shows the quiz inside a Canvas page. Some schools block embedded sites; the link always works.', 3),
        h('p', { class: 'fine' }, 'Canvas can’t receive the grade by itself — that would need a server connected to Canvas. SpeedGrader shows you the score to enter. Correct answers stay off the results page unless the quiz lets students check answers; on the computer you built the quiz on, the results page’s ', h('b', null, 'Open in grade checker'), ' link shows everything.'));
    };
    dlg.append(
      h('div', { class: 'ex-head' },
        h('h2', { id: 'cv-title' }, 'Set up in Canvas'),
        h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: close, 'aria-label': 'Close' }, '✕')),
      body);
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    draw();
    dlg.showModal();
  }


  // ---------- Clefwork Keys: the builder ----------
  const KEYS_PRESETS = [
    { label: 'Name the key', prompts: 0b100, answers: 0b010 },
    { label: 'Find the key', prompts: 0b010, answers: 0b100 },
    { label: 'Read the staff', prompts: 0b001, answers: 0b110 },
    { label: 'Write it on the staff', prompts: 0b110, answers: 0b001 },
    { label: 'Every combination', prompts: 0b111, answers: 0b111 },
  ];
  function keysPresets(cfg) {
    return h('div', { class: 'presets' }, h('span', { class: 'mini-label' }, 'Or start from a preset'),
      h('div', { class: 'preset-row' }, KEYS_PRESETS.map((p) => h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
        const k = cfg.keys = MQ.keysSettings(cfg.keys);
        k.prompts = p.prompts; k.answers = p.answers;
        cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvShow = false; S.pvResp = null;
        saveDraft(); go('build'); toast(`Loaded the “${p.label}” preset`);
      } }, p.label))));
  }
  const NOTE_CHOICES = (() => {
    const out = [];
    for (let m = 36; m <= 84; m++) if (MQ.isWhiteKey(m)) out.push({ v: m, label: MQ.noteName({ step: [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][m % 12], alt: 0, oct: Math.floor(m / 12) - 1 }) + (m === 60 ? ' (middle C)' : '') });
    return out;
  })();
  function keysSection(cfg, changed, R) {
    const k = cfg.keys = MQ.keysSettings(cfg.keys);
    R.total = h('span', { class: 'mix-total' });
    const combos = h('ul', { class: 'keys-combos' });
    const warn = h('p', { class: 'warn-note', hidden: true }, 'Choose a way to show the note and a different way to answer — showing and answering the same way would just be copying.');
    const LABEL = { staff: 'grand staff', name: 'note name', piano: 'piano key' };
    const ANSWER = { staff: 'write it on the grand staff', name: 'type its name', piano: 'play it on the piano' };
    const drawCombos = () => {
      const list = MQ.keysCombos(k);
      warn.hidden = list.length > 0;
      combos.replaceChildren(...list.map(([a, b]) => h('li', null, h('b', null, 'Shown as a ' + LABEL[a]), ' → ', ANSWER[b])));
    };
    const count = counter('count-keys', 'Keys & Notes', (v) => { cfg.counts.keys = v; changed(); });
    count.sync(cfg.counts.keys || 0, 60);
    const low = selectEl('k-low', NOTE_CHOICES, k.low, (v) => { k.low = +v; if (k.high < k.low) { k.high = k.low; hi.value = k.high; } changed(); });
    const hi = selectEl('k-high', NOTE_CHOICES, k.high, (v) => { k.high = +v; if (k.low > k.high) { k.low = k.high; low.value = k.low; } changed(); });
    drawCombos();
    return sec('keys', 'Keys & notes', 'Each question shows one note in one way and asks for it in another. The piano plays each note as it’s pressed or typed.',
      h('div', { class: 'keys-count' }, h('span', { class: 'mini-label' }, 'How many questions'), count),
      grp('Show the note as', chips('k-prompts', MQ.KEYS_KINDS.map((x) => ({ label: x.show })), k.prompts, (m) => { k.prompts = m; changed(); drawCombos(); }, (x) => x.label)),
      grp('Students answer by', chips('k-answers', MQ.KEYS_KINDS.map((x) => ({ label: x.answer })), k.answers, (m) => { k.answers = m; changed(); drawCombos(); }, (x) => x.label)),
      warn,
      h('div', { class: 'keys-combo-box' }, h('span', { class: 'mini-label' }, 'The quiz mixes these'), combos),
      h('div', { class: 'row2' },
        grp('Lowest note', low, 'The piano starts at the C below it.'),
        grp('Highest note', hi, 'And ends at the B above it.')),
      grp('Sharps and flats', seg('k-acc', [{ v: 0, label: 'Naturals only' }, { v: 1, label: '+ Sharps' }, { v: 2, label: '+ Flats' }, { v: 3, label: 'Sharps & flats' }], cfg.accMode, (v) => { cfg.accMode = v; changed(); }),
        'Plain letters come up about half the time, B♭ E♭ A♭ D♭ most of the rest, and remote spellings rarely.'),
      h('div', { class: 'mix-foot' }, R.total));
  }

  // ---------- Clefwork Analysis: pictures of the score ----------
  // Pictures are kept on this device under their fingerprint, so the builder, a quiz in progress and
  // the grade checker all find them. The most recent dozen are kept; when storage is full the oldest
  // go first, and this visit keeps its own copies in memory either way.
  const SCORE_KEEP = 12;
  const SCORE_MEM = new Map();
  const SCORES = new Map();       // fingerprint → promise of the decoded picture, with a URL to show it
  const scoreKey = (hash) => 'score.' + (hash >>> 0).toString(16);
  const scoreData = (hash) => SCORE_MEM.get(hash >>> 0) || store.get(scoreKey(hash), null);
  function keepScore(data, hash) {
    SCORE_MEM.set(hash >>> 0, data);
    const list = store.get('scores', []).filter((x) => x !== hash >>> 0);
    list.unshift(hash >>> 0);
    for (;;) {
      try { localStorage.setItem('clefwork.' + scoreKey(hash), JSON.stringify(data)); break; } catch (e) {
        if (list.length < 2) return;
        store.del(scoreKey(list.pop()));
      }
    }
    list.slice(SCORE_KEEP).forEach((x) => store.del(scoreKey(x)));
    store.set('scores', list.slice(0, SCORE_KEEP));
  }
  function loadScore(hash) {
    if (hash == null) return Promise.resolve(null);
    const k = hash >>> 0;
    if (!SCORES.has(k)) {
      const data = scoreData(k);
      if (!data) return Promise.resolve(null);
      SCORES.set(k, MQ.decodeScore(data)
        .then(async (sc) => Object.assign(sc, { url: await MQ.scoreURL(sc) }))
        .catch(() => { SCORES.delete(k); return null; }));
    }
    return SCORES.get(k);
  }
  // Each box has a colour, shared by its highlight on the music and its answer boxes.
  const AN_COLORS = ['#e39b12', '#2b86d6', '#d8457b', '#23a065', '#8a5ad6', '#15a0a3'];
  const anColor = (i) => AN_COLORS[i % AN_COLORS.length];
  const ASK_LABEL = { roman: 'Roman numeral', symbol: 'Chord symbol', both: 'Roman numeral & chord symbol' };
  const pct = (v) => (v * 100).toFixed(3) + '%';
  const boxStyle = (r, color) => `--c:${color};left:${pct(r.x)};top:${pct(r.y)};width:${pct(r.w)};height:${pct(r.h)}`;
  const upperFirst = (inp) => {
    if (!/^[a-g]/.test(inp.value)) return;
    const at = inp.selectionStart;
    inp.value = inp.value[0].toUpperCase() + inp.value.slice(1);
    try { inp.setSelectionRange(at, at); } catch (e) { /* not focused */ }
  };

  // A Roman numeral as Clefwork prints it: the figures stacked beside the numeral.
  function romanDisplay(p) {
    const r = MQ.romanParts(p);
    if (!r) return '';
    if (r.text) return h('span', { class: 'fig-rn' }, r.text);
    const el = figuredDisplay(r.numeral, r.figure);
    if (r.target) el.append(accText(r.target));
    return el;
  }
  const orList = (items) => items.map((x, j) => [j ? h('span', { class: 'an-or' }, ' or ') : null, x]);
  const romanAnswers = (list) => orList(list.map((w) => romanDisplay(MQ.parseAnalysisRoman(w)) || w));
  const symbolAnswers = (list) => orList(list.map((w) => h('span', { class: 'fig-rn' }, MQ.symbolText(w))));

  // One answer box — k is 'r' (Roman numeral) or 's' (chord symbol) — with a preview of how it reads.
  let anUid = 0;
  function anInput(q, k, cfg, o, value, onInput) {
    const roman = k === 'r';
    // On the student's sheet the key explains what to type, so the boxes stay bare.
    const inp = h('input', { type: 'text', id: 'an-in-' + ++anUid, class: 'an-in', maxlength: 15, placeholder: o.sheet ? null : roman ? 'V65' : 'G7',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      'aria-label': `Box ${q.an.n + 1}: ${roman ? 'Roman numeral' : 'chord symbol'}` });
    inp.value = o.keyMode ? (roman ? q.an.roman[0] : q.an.symbol[0]) || '' : value || '';
    const pv = h('span', { class: 'an-pv' });
    const draw = () => {
      const t = inp.value.trim();
      const p = t ? (roman ? MQ.parseAnalysisRoman(t) : MQ.symbolOk(t)) : null;
      inp.classList.toggle('is-invalid', !!t && !p);
      pv.replaceChildren(!t ? '' : !p ? h('span', { class: 'fig-unread is-bad' }, roman ? 'not a numeral' : 'not a symbol')
        : roman ? romanDisplay(p) : h('span', { class: 'fig-rn' }, MQ.symbolText(t)));
    };
    inp.addEventListener('input', () => {
      if (!roman) upperFirst(inp);
      draw();
      if (onInput) onInput(inp.value);
    });
    if (o.locked || o.keyMode) inp.disabled = true;
    draw();
    const cell = h('div', { class: 'an-field' }, inp, pv);
    if (o.reveal && !o.keyMode) {
      const ok = MQ.markAnalysisPart(q, k, { [k]: value }, cfg);
      cell.classList.add(ok ? 'is-right' : 'is-wrong');
      pv.replaceChildren(ok ? h('span', { class: 'fig-mark is-right' }, '✓')
        : h('span', { class: 'fig-mark is-wrong' }, '✗ ', roman ? romanAnswers(q.an.roman) : symbolAnswers(q.an.symbol)));
    }
    return { el: cell, input: inp };
  }

  // Part of the score around one box — the whole system when there's room — with the box highlighted.
  function scoreCrop(sc, r, color) {
    let x0 = Math.max(0, r.x - Math.max(r.w * 1.5, 0.12)), x1 = Math.min(1, r.x + r.w + Math.max(r.w * 1.5, 0.12));
    let y0 = Math.max(0, r.y - Math.max(r.h * 0.6, 0.05)), y1 = Math.min(1, r.y + r.h + Math.max(r.h * 0.6, 0.05));
    const b = sc.bands[MQ.bandOf(r, sc.bands)];
    if (b.y1 - b.y0 < 0.45) { y0 = Math.min(y0, Math.max(0, b.y0 - 0.01)); y1 = Math.max(y1, Math.min(1, b.y1 + 0.01)); }
    const cw = x1 - x0, ch = y1 - y0;
    // No taller than 320px on screen, however narrow the part of the music is.
    const maxW = Math.round((320 * cw * sc.w) / (ch * sc.h));
    return h('div', { class: 'an-crop', style: `aspect-ratio:${(cw * sc.w).toFixed(1)} / ${(ch * sc.h).toFixed(1)};max-width:${maxW}px` },
      h('img', { src: sc.url, alt: 'The part of the score this question is about', draggable: 'false', style: `width:${pct(1 / cw)};left:${pct(-x0 / cw)};top:${pct(-y0 / ch)}` }),
      h('span', { class: 'an-hl is-active', style: boxStyle({ x: (r.x - x0) / cw, y: (r.y - y0) / ch, w: r.w / cw, h: r.h / ch }, color) }));
  }
  // One Analysis question on its own: in the grade checker, on results pages and in answer keys.
  function analysisCard(q, cfg, o) {
    const wrap = h('div', { class: 'qcard an-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, ASK_LABEL[q.an.ask])));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    const pic = h('div', { class: 'an-crop-host' });
    wrap.append(pic);
    loadScore(q.an.img).then((sc) => pic.replaceChildren(sc ? scoreCrop(sc, q.an.region, anColor(q.an.n))
      : h('p', { class: 'fine' }, 'The music isn’t saved on this device, so only the answers are shown.')));
    const resp = Object.assign({}, o.response);
    const row = h('div', { class: 'an-answers' });
    MQ.analysisParts(q).forEach((k) => {
      const f = anInput(q, k, cfg, o, resp[k], (v) => { resp[k] = v; if (o.onResponse) o.onResponse(Object.assign({}, resp)); });
      row.append(h('div', { class: 'an-answer' }, h('label', { class: 'mini-label', for: f.input.id }, k === 'r' ? 'Roman numeral' : 'Chord symbol'), f.el));
    });
    wrap.append(row);
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) wrap.append(resultLine(q, cfg, o.response));
    return wrap;
  }

  // A reminder of what the figures mean, and how to type them — printed above the music.
  function figuresKey(roman, symbol) {
    const fig = (f) => h('span', { class: 'fig-rn an-key-fig' }, !f ? h('span', { class: 'an-key-none' }, 'no figure')
      : h('span', { class: 'fig-stack' }, ...Array.from(f).map((d) => h('span', null, d))));
    const item = (f, text) => h('span', { class: 'an-key-item' }, fig(f), h('span', null, text));
    return h('aside', { class: 'an-key', 'aria-label': 'Key to figures and chord symbols' },
      roman ? [
        h('div', { class: 'an-key-row' }, h('b', null, 'Triads'), item('', 'root position'), item('6', '1st inversion'), item('64', '2nd inversion')),
        h('div', { class: 'an-key-row' }, h('b', null, 'Sevenths'), item('7', 'root position'), item('65', '1st inversion'), item('43', '2nd inversion'), item('42', '3rd inversion')),
        h('p', { class: 'an-key-how' }, 'Type the figures right after the numeral: V65, ii6, V42. Type o for ° (viio7) and /o for ø (vii/o7). Applied chords: V7/V.'),
      ] : null,
      symbol ? h('p', { class: 'an-key-how' }, 'Chord symbols: Dmi7, G7, Cma7, B°, Bmi7♭5, Csus4 — a slash names the bass note, as in C/E. Type b for ♭ and # for ♯.') : null);
  }

  // ---------- Clefwork Analysis: taking the quiz ----------
  // Every box is on one page: the music, cut between systems, with chord-symbol boxes above each
  // system and Roman numeral boxes below it, each under the middle of its highlight.
  function takeAnalysis(main) {
    const t = S.take, cfg = t.cfg;
    const checking = cfg.flags.feedback || (t.practice && t.practiceFeedback);
    const host = h('div', { class: 'an-scroll' }, h('p', { class: 'empty' }, 'Loading the music…'));
    const checkBtn = checking ? h('button', { type: 'button', class: 'btn', onclick: () => { t.checked[t.idx] = true; saveAttempt(); go(tv()); } }, 'Check') : null;
    const syncCheck = () => {
      if (!checkBtn) return;
      checkBtn.textContent = `Check box ${t.idx + 1}`;
      checkBtn.disabled = t.checked[t.idx] || !MQ.hasAnswer(t.qs[t.idx], t.resp[t.idx]);
    };
    const zoomVal = h('span', { class: 'an-zoom-val' });
    const setZoom = (z) => {
      S.azoom = Math.max(1, Math.min(2.5, z));
      zoomVal.textContent = Math.round(S.azoom * 100) + '%';
      const sheet = host.querySelector('.an-sheet');
      if (sheet) sheet.style.width = S.azoom * 100 + '%';
    };
    const asks = t.qs.map((q) => q.an.ask);
    main.append(h('div', { class: 'take is-analysis' }, progressHead(t),
      h('section', { class: 'card stage an-take' },
        h('div', { class: 'an-take-top' },
          h('p', { class: 'an-lede' }, 'Type your answer in the box beside each highlighted part of the music. The colours and numbers show which box goes with which part.'),
          h('div', { class: 'an-zoom', role: 'group', 'aria-label': 'Zoom the music' },
            h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Zoom out', onclick: () => setZoom(S.azoom - 0.25) }, '−'), zoomVal,
            h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Zoom in', onclick: () => setZoom(S.azoom + 0.25) }, '+'))),
        cfg.analysis.notes ? h('p', { class: 'an-notes' }, cfg.analysis.notes) : null,
        figuresKey(asks.some((a) => a !== 'symbol'), asks.some((a) => a !== 'roman')),
        host),
      h('div', { class: 'take-actions' }, h('div', { class: 'spacer' }), checkBtn,
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { t.reviewing = true; saveAttempt(); go(tv()); } }, t.practice ? 'Finish' : 'Review & submit'))));
    setZoom(S.azoom);
    syncCheck();
    loadScore(cfg.analysis.img && cfg.analysis.img.hash).then((sc) => {
      if (!host.isConnected || S.take !== t) return;
      if (!sc) {
        host.replaceChildren(h('p', { class: 'warn-note' }, 'The music for this quiz isn’t on this device any more. Open the quiz link from your teacher again — your answers so far are kept.'));
        return;
      }
      host.replaceChildren(analysisSheet(sc, t, syncCheck));
      setZoom(S.azoom);
      const box = host.querySelector(`.an-box[data-i="${t.idx}"] input`);
      if (box && t.idx > 0) box.focus({ preventScroll: true }), box.scrollIntoView({ block: 'center' });
    });
    startTicker();
  }
  function analysisSheet(sc, t, onActive) {
    const cfg = t.cfg, qs = t.qs;
    const sheet = h('div', { class: 'an-sheet', role: 'group', 'aria-label': `The music, with ${qs.length} box${qs.length > 1 ? 'es' : ''} to answer` });
    const hls = qs.map(() => []), boxes = qs.map(() => []);
    // The box being answered is the "current question": it collects the time and the Check button.
    const setActive = (i) => {
      t.idx = i;
      [hls, boxes].forEach((all) => all.forEach((list, j) => list.forEach((el) => el.classList.toggle('is-active', j === i))));
      document.querySelectorAll('.qdot').forEach((d, j) => { if (j === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
      onActive();
    };
    const focusBox = (i) => { const inp = boxes[i][0] && boxes[i][0].querySelector('input'); if (inp && !inp.disabled) inp.focus(); else setActive(i); };
    MQ.sheetPlan(qs, sc.bands).forEach((piece) => {
      if (piece.kind === 'strip') {
        const span = piece.y1 - piece.y0;
        const strip = h('div', { class: 'an-strip', style: `aspect-ratio:${sc.w} / ${(span * sc.h).toFixed(2)}` },
          h('img', { src: sc.url, alt: '', draggable: 'false', style: `top:${pct(-piece.y0 / span)}` }));
        qs.forEach((q, i) => {
          const r = q.an.region;
          if (r.y >= piece.y1 || r.y + r.h <= piece.y0) return;
          const hl = h('span', { class: 'an-hl', title: `Box ${i + 1}`, onclick: () => focusBox(i),
            style: boxStyle({ x: r.x, y: (r.y - piece.y0) / span, w: r.w, h: r.h / span }, anColor(i)) });
          hls[i].push(hl);
          strip.append(hl);
        });
        sheet.append(strip);
        return;
      }
      const lane = h('div', { class: 'an-lane is-' + piece.lane });
      piece.items.forEach(({ i, cx }) => {
        const q = qs[i], k = piece.lane === 'roman' ? 'r' : 's';
        const locked = !!t.checked[i];
        const f = anInput(q, k, cfg, { locked, reveal: locked, sheet: true }, (t.resp[i] || {})[k], (v) => {
          t.resp[i] = Object.assign({}, t.resp[i], { [k]: v });
          saveAttempt();
          const dot = document.querySelectorAll('.qdot')[i];
          if (dot) dot.classList.toggle('is-done', MQ.hasAnswer(q, t.resp[i]));
          setActive(i);
        });
        const box = h('div', { class: 'an-box' + (locked ? ' is-checked' : ''), style: `--c:${anColor(i)}`, 'data-i': i, 'data-cx': cx },
          h('span', { class: 'an-num', 'aria-hidden': 'true' }, String(i + 1)), f.el);
        f.input.addEventListener('focus', () => setActive(i));
        box.addEventListener('mouseenter', () => hls[i].forEach((el) => el.classList.add('is-hover')));
        box.addEventListener('mouseleave', () => hls[i].forEach((el) => el.classList.remove('is-hover')));
        box.addEventListener('click', (e) => { if (e.target === box) focusBox(i); });
        boxes[i].push(box);
        lane.append(box);
      });
      sheet.append(lane);
    });
    // Each box sits centred on its part of the music. A box that would overlap the one before it
    // moves over a little if it can, and otherwise takes another row.
    const layout = () => sheet.querySelectorAll('.an-lane').forEach((lane) => {
      const W = lane.clientWidth;
      if (!W) return;
      const list = Array.from(lane.children);
      const rowH = Math.max(0, ...list.map((b) => b.offsetHeight)) + 6;
      const rows = [];
      list.forEach((b) => {
        const bw = b.offsetWidth;
        let left = Math.max(0, Math.min(W - bw, +b.dataset.cx * W - bw / 2));
        let row = rows.findIndex((edge) => edge + 6 <= left || (edge + 6 - left <= bw * 0.4 && edge + 6 + bw <= W));
        if (row < 0) { row = rows.length; rows.push(0); }
        left = Math.max(left, rows[row] ? rows[row] + 6 : 0);
        rows[row] = left + bw;
        b.style.left = left + 'px';
        b.style.top = 8 + row * rowH + 'px';
      });
      lane.style.height = 10 + rows.length * rowH + 'px';
    });
    if (window.ResizeObserver) new ResizeObserver(layout).observe(sheet);
    requestAnimationFrame(layout);
    setActive(Math.max(0, Math.min(t.idx, qs.length - 1)));
    return sheet;
  }

  // ---------- Clefwork Analysis: the builder ----------
  function analysisReady() {
    if (S.aed) { toast(`Save or discard ${S.aed.index >= 0 ? 'box ' + (S.aed.index + 1) : 'the new box'} first.`, 'bad'); return false; }
    if (!S.aimg) { toast('Upload the picture of the music first.', 'bad'); return false; }
    return true;
  }
  // A new upload (a file, a drop or a paste), then turned into the black-and-white copy students see.
  async function takePicture(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Choose a picture (PNG or JPG). For a PDF, take a screenshot of the passage first.', 'bad'); return; }
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { toast('That picture couldn’t be opened. Try saving it as a PNG or JPG.', 'bad'); return; }
    S.aorig = { bmp, crop: null };
    await useScore(true);
  }
  let scoreBusy = false;
  async function useScore(fresh) {
    if (!S.aorig || scoreBusy) return;
    scoreBusy = true;
    const status = document.getElementById('an-status');
    if (status) status.textContent = 'Preparing the picture…';
    try {
      const sc = await MQ.encodeScore(S.aorig.bmp, Object.assign({}, S.aopt, { crop: S.aorig.crop }));
      S.aorig.crop = sc.crop;       // later detail and ink changes keep this trim, so boxes stay put
      sc.url = await MQ.scoreURL(sc);
      keepScore(sc.data, sc.hash);
      SCORES.set(sc.hash >>> 0, Promise.resolve(sc));
      const a = S.cfg.analysis = MQ.analysisSettings(S.cfg.analysis);
      const moved = fresh && a.img && a.img.hash !== sc.hash && a.regions.length;
      a.img = { hash: sc.hash, w: sc.w, h: sc.h };
      S.aimg = sc;
      saveDraft();
      go('build');
      if (moved) toast(`New picture — check that your ${a.regions.length} box${a.regions.length > 1 ? 'es' : ''} still sit on the right music.`);
    } catch (e) {
      toast(e.message || 'That picture couldn’t be used.', 'bad');
      if (status) status.textContent = '';
    } finally { scoreBusy = false; }
  }
  function analysisSections(cfg, changed, R) {
    const a = cfg.analysis = MQ.analysisSettings(cfg.analysis);
    R.total = h('span', { class: 'mix-total' });
    const status = h('span', { class: 'an-status', id: 'an-status', role: 'status' });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Picture of the music' });
    file.addEventListener('change', () => { takePicture(file.files[0]); file.value = ''; });
    const choose = (label, cls) => h('button', { type: 'button', class: cls, onclick: () => file.click() }, label);
    const dropOn = (el) => {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('is-over'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-over'); takePicture(e.dataTransfer.files[0]); });
    };
    let stage = null, layer = null, editor = null, list = null;
    let body;
    if (S.aimg === null && a.img) body = h('p', { class: 'empty' }, 'Loading the picture…');
    else if (!S.aimg) {
      body = h('div', { class: 'an-drop' },
        h('p', { class: 'an-drop-title' }, a.img ? 'This draft’s picture isn’t on this device any more' : 'Upload a picture of the music'),
        h('p', { class: 'help' }, a.img ? 'Upload the same picture again — your boxes and answers are kept.'
          : 'A scan, an export from notation software, or a screenshot (PNG or JPG). Drag it here, paste it, or choose it. For a PDF, take a screenshot of the passage.'),
        h('div', { class: 'btn-row center' }, choose('Choose a picture', 'btn btn-primary')), status, file);
      dropOn(body);
    } else {
      const off = !S.aorig;
      const opt = (k) => (v) => { S.aopt[k] = v; store.set('analysis-opts', S.aopt); useScore(false); };
      const detail = seg('an-detail', MQ.SCORE_DETAIL.map((d) => ({ v: d.id, label: d.label })), S.aopt.detail, opt('detail'));
      const ink = seg('an-ink', [{ v: 0, label: 'Lighter' }, { v: 1, label: 'Normal' }, { v: 2, label: 'Darker' }], S.aopt.ink, opt('ink'));
      if (off) [detail, ink].forEach((g) => g.querySelectorAll('button').forEach((b) => (b.disabled = true)));
      stage = h('div', { class: 'an-stage' });
      layer = h('div', { class: 'an-layer' });
      stage.append(h('img', { src: S.aimg.url, alt: 'The music', draggable: 'false' }), layer);
      editor = h('div', { class: 'an-editor-host' });
      list = h('div', { class: 'an-list-host' });
      body = h('div', { class: 'an-build' },
        h('div', { class: 'an-tools' },
          grp('Detail', detail, 'More detail makes the quiz link longer.'),
          grp('Ink', ink, 'Darker keeps faint printing; lighter drops smudges.'),
          h('div', { class: 'an-tools-end' }, choose('Replace picture', 'btn btn-quiet sm'), status, file)),
        off ? h('p', { class: 'help' }, 'To change the detail or ink, upload the picture again.') : null,
        h('p', { class: 'an-how' }, h('b', null, 'Drag a box'), ' around each chord or passage to ask about. You’ll choose what students write, then type the answer and save it.'),
        stage, editor, list);
      setupDrawing();
    }

    // ---------- drawing boxes ----------
    let justDragged = false;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const edName = () => (S.aed.index >= 0 ? 'box ' + (S.aed.index + 1) : 'the new box');
    function setupDrawing() {
      stage.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.an-pop')) return;
        const img = stage.querySelector('img').getBoundingClientRect();
        const at = (ev) => ({ x: clamp01((ev.clientX - img.left) / img.width), y: clamp01((ev.clientY - img.top) / img.height) });
        const p0 = at(e);
        const rectTo = (p) => ({ x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) });
        let ghost = null;
        const move = (ev) => {
          const p = at(ev);
          if (!ghost) {
            if (Math.hypot((p.x - p0.x) * img.width, (p.y - p0.y) * img.height) < 6) return;
            if (!S.aed && a.regions.length >= MQ.ANALYSIS_MAX) { toast(`A quiz can have up to ${MQ.ANALYSIS_MAX} boxes.`, 'bad'); stop(); return; }
            ghost = h('div', { class: 'an-reg is-draft is-drawing' });
            layer.querySelectorAll('.is-draft, .an-pop').forEach((x) => x.remove());
            layer.append(ghost);
            try { stage.setPointerCapture(ev.pointerId); } catch (err) { /* already released */ }
          }
          ghost.setAttribute('style', boxStyle(rectTo(p), 'var(--accent)'));
        };
        const up = (ev) => {
          stop();
          if (!ghost) return;
          justDragged = true;
          setTimeout(() => (justDragged = false), 0);
          const r = rectTo(at(ev));
          if (r.w * img.width < 8 || r.h * img.height < 8) { redraw(); return; }
          if (!S.aed) S.aed = { index: -1, ask: null, roman: '', symbol: '' };
          Object.assign(S.aed, r);
          if (!S.aed.ask) S.aed.asking = true;
          redraw();
          const first = layer.querySelector('.an-pop button') || editor.querySelector('input');
          if (first) first.focus({ preventScroll: true });
        };
        const stop = () => {
          stage.removeEventListener('pointermove', move);
          stage.removeEventListener('pointerup', up);
          stage.removeEventListener('pointercancel', stop);
        };
        stage.addEventListener('pointermove', move);
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', stop);
        e.preventDefault();
      });
    }
    function editBox(i) {
      if (justDragged) return;
      if (S.aed) { if (S.aed.index !== i) toast(`Save or discard ${edName()} first.`, 'bad'); return; }
      const r = a.regions[i];
      S.aed = { index: i, x: r.x, y: r.y, w: r.w, h: r.h, ask: r.ask || 'roman', roman: r.roman || '', symbol: r.symbol || '' };
      redraw();
      const first = editor.querySelector('input');
      if (first) { first.focus({ preventScroll: true }); editor.scrollIntoView({ block: 'nearest' }); }
    }
    function discard() { S.aed = null; redraw(); }
    function save() {
      const ed = S.aed;
      if (!ed) return;
      const tidy = (s) => MQ.alternatives(s).map((x) => x.replace(/♭/g, 'b').replace(/♯/g, '#'));
      const rs = tidy(ed.roman), ss = tidy(ed.symbol);
      const needR = ed.ask !== 'symbol', needS = ed.ask !== 'roman';
      const bad = rs.find((x) => !MQ.parseAnalysisRoman(x)) || ss.find((x) => !MQ.symbolOk(x));
      const msg = needR && !rs.length ? 'Type the Roman numeral students should write.'
        : needS && !ss.length ? 'Type the chord symbol students should write.'
          : bad ? `“${bad}” can’t be read — fix it before saving.` : '';
      if (msg) {
        toast(msg, 'bad');
        const inp = editor.querySelector(needR && !rs.length ? '#an-ed-r' : needS && !ss.length ? '#an-ed-s' : 'input.is-invalid');
        if (inp) inp.focus();
        return;
      }
      const r4 = (v) => Math.round(v * 10000) / 10000;
      const box = { x: r4(ed.x), y: r4(ed.y), w: r4(ed.w), h: r4(ed.h), ask: ed.ask, roman: rs.join(', '), symbol: ss.join(', ') };
      const all = a.regions.slice();
      if (ed.index >= 0) all[ed.index] = box; else all.push(box);
      // Boxes are numbered in reading order: system by system, left to right.
      a.regions = MQ.readingOrder(all, S.aimg && S.aimg.bands);
      cfg.counts.analysis = a.regions.length;
      S.aed = null;
      changed();
      redraw();
      toast(`Box ${a.regions.indexOf(box) + 1} saved`);
    }
    function removeBox(i, btn) {
      if (btn.dataset.sure !== '1') {
        btn.dataset.sure = '1';
        btn.textContent = 'Click again to delete';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.sure = ''; btn.textContent = 'Delete'; } }, 3000);
        return;
      }
      a.regions = a.regions.filter((_, j) => j !== i);
      cfg.counts.analysis = a.regions.length;
      if (S.aed && S.aed.index === i) S.aed = null;
      else if (S.aed && S.aed.index > i) S.aed.index--;
      changed();
      redraw();
      toast(`Box ${i + 1} deleted`);
    }
    function askPopover() {
      const ed = S.aed;
      // Below the box, unless it sits low on a tall picture and there's room above.
      const H = stage.clientHeight;
      const below = (1 - ed.y - ed.h) * H >= 150 || ed.y * H < 150;
      const pick = (k) => { ed.ask = k; ed.asking = false; redraw(); const f = editor.querySelector('input'); if (f) { f.focus({ preventScroll: true }); editor.scrollIntoView({ block: 'nearest' }); } };
      const pop = h('div', { class: 'an-pop', role: 'dialog', 'aria-label': 'What should students write for this box?',
        style: `left:max(0px, min(${pct(ed.x)}, calc(100% - 300px)));` + (below ? `top:calc(${pct(ed.y + ed.h)} + 8px)` : `bottom:calc(${pct(1 - ed.y)} + 8px)`) },
        h('p', { class: 'an-pop-q' }, 'What should students write here?'),
        h('div', { class: 'an-pop-row' },
          h('button', { type: 'button', class: 'btn btn-primary sm', onclick: () => pick('roman') }, 'Roman numeral'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => pick('symbol') }, 'Chord symbol'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => pick('both') }, 'Both')),
        h('button', { type: 'button', class: 'btn-link', onclick: discard }, 'Cancel'));
      pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') discard(); });
      pop.addEventListener('pointerdown', (e) => e.stopPropagation());
      return pop;
    }
    function drawStage() {
      if (!layer) return;
      layer.replaceChildren();
      a.regions.forEach((r, i) => {
        if (S.aed && S.aed.index === i) return;
        layer.append(h('button', { type: 'button', class: 'an-reg', style: boxStyle(r, anColor(i)), 'aria-label': `Edit box ${i + 1}`, onclick: () => editBox(i) },
          h('span', { class: 'an-reg-num' }, String(i + 1))));
      });
      if (S.aed) layer.append(h('div', { class: 'an-reg is-draft', style: boxStyle(S.aed, 'var(--accent)') }, h('span', { class: 'an-reg-num' }, S.aed.index >= 0 ? String(S.aed.index + 1) : 'New')));
      if (S.aed && S.aed.asking) layer.append(askPopover());
    }
    function drawEditor() {
      if (!editor) return;
      const ed = S.aed;
      if (!ed || ed.asking) { editor.replaceChildren(); return; }
      const want = MQ.ANALYSIS_ASKS[a.override] || '';
      const field = (k) => {
        const roman = k === 'r', key = roman ? 'roman' : 'symbol';
        const inp = h('input', { type: 'text', id: 'an-ed-' + k, class: 'an-ed-in', maxlength: 60, placeholder: roman ? 'e.g. V65' : 'e.g. G7/B',
          autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
        inp.value = ed[key];
        const pv = h('span', { class: 'fig-preview' });
        const draw = () => {
          const alts = MQ.alternatives(inp.value);
          const bad = alts.find((x) => (roman ? !MQ.parseAnalysisRoman(x) : !MQ.symbolOk(x)));
          inp.classList.toggle('is-invalid', !!bad);
          pv.replaceChildren(bad ? h('span', { class: 'fig-unread is-bad' }, `“${bad}” isn’t a ${roman ? 'Roman numeral Clefwork can read' : 'chord symbol Clefwork can read'}`)
            : roman ? h('span', null, romanAnswers(alts)) : h('span', null, symbolAnswers(alts)));
        };
        inp.addEventListener('input', () => { if (!roman) upperFirst(inp); ed[key] = inp.value; draw(); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') discard(); });
        draw();
        const needed = roman ? ed.ask !== 'symbol' : ed.ask !== 'roman';
        const quizWants = want && (roman ? want !== 'symbol' : want !== 'roman');
        return h('div', { class: 'an-ed-field' },
          h('label', { class: 'mini-label', for: inp.id }, roman ? 'Roman numeral' : 'Chord symbol',
            needed ? null : h('span', { class: 'an-opt' }, quizWants ? ' — the quiz-wide setting asks for this too' : ' — optional')),
          inp, pv);
      };
      const showR = ed.ask !== 'symbol' || (want && want !== 'symbol') || !!ed.roman;
      const showS = ed.ask !== 'roman' || (want && want !== 'roman') || !!ed.symbol;
      editor.replaceChildren(h('div', { class: 'an-editor', role: 'group', 'aria-label': ed.index >= 0 ? `Box ${ed.index + 1}` : 'New box' },
        h('div', { class: 'an-ed-head' }, h('strong', null, ed.index >= 0 ? `Box ${ed.index + 1}` : 'New box'),
          h('span', { class: 'help' }, 'Drag on the music to redraw this box.')),
        grp('Students write', seg('an-ed-ask', ['roman', 'symbol', 'both'].map((v) => ({ v, label: v === 'both' ? 'Both' : ASK_LABEL[v] })), ed.ask, (v) => { ed.ask = v; drawEditor(); })),
        h('div', { class: 'an-ed-fields' }, showR ? field('r') : null, showS ? field('s') : null),
        h('p', { class: 'help' }, 'If more than one answer is right, separate them with commas: I64, Cad64.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, ed.index >= 0 ? 'Save changes' : 'Save box'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: discard }, ed.index >= 0 ? 'Cancel changes' : 'Discard box'),
          ed.index >= 0 ? h('button', { type: 'button', class: 'btn btn-quiet an-del', onclick: (e) => removeBox(ed.index, e.currentTarget) }, 'Delete') : null)));
    }
    function drawList() {
      if (!list) return;
      if (!a.regions.length) { list.replaceChildren(h('p', { class: 'empty' }, 'No boxes yet.')); return; }
      list.replaceChildren(h('ol', { class: 'an-list' }, a.regions.map((r, i) => {
        const ask = MQ.askFor(r, a.override);
        const rs = MQ.alternatives(r.roman), ss = MQ.alternatives(r.symbol);
        return h('li', { class: 'an-item' + (S.aed && S.aed.index === i ? ' is-editing' : ''), style: `--c:${anColor(i)}` },
          h('span', { class: 'an-item-num' }, String(i + 1)),
          h('span', { class: 'an-item-main' },
            h('span', { class: 'an-item-ask' }, ASK_LABEL[ask]),
            h('span', { class: 'an-item-ans' },
              ask !== 'symbol' && rs.length ? romanAnswers(rs) : null,
              ask === 'both' ? h('span', { class: 'an-sep' }, ' · ') : null,
              ask !== 'roman' && ss.length ? symbolAnswers(ss) : null)),
          h('span', { class: 'an-item-act' },
            h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => editBox(i) }, 'Edit'),
            h('button', { type: 'button', class: 'btn btn-quiet sm an-del', onclick: (e) => removeBox(i, e.currentTarget) }, 'Delete')));
      })));
    }
    // ---------- the quiz-wide answer type ----------
    const warn = h('div', { class: 'an-miss' });
    const boxesText = (ns) => (ns.length === 1 ? `Box ${ns[0]}` : `Boxes ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);
    function syncWarn() {
      const m = MQ.missingAnswers(a);
      const note = (ns, lacks, has) => h('p', { class: 'warn-note' },
        `${boxesText(ns)} ${ns.length > 1 ? 'have' : 'has'} no ${lacks}, so ${ns.length > 1 ? 'they ask' : 'it asks'} for the ${has} only. Edit ${ns.length > 1 ? 'them' : 'it'} to add one.`);
      warn.replaceChildren(...[m.roman.length ? note(m.roman, 'Roman numeral', 'chord symbol') : null, m.symbol.length ? note(m.symbol, 'chord symbol', 'Roman numeral') : null].filter(Boolean));
    }
    function redraw() { drawStage(); drawEditor(); drawList(); syncWarn(); }
    const notes = h('textarea', { id: 'an-notes', rows: 2, maxlength: 200, placeholder: 'e.g. Key: G major. Give the Roman numeral and figures for each boxed chord.' });
    notes.value = a.notes;
    notes.addEventListener('input', () => { a.notes = notes.value; changed(); });
    redraw();
    return [
      sec('score', 'The music', 'Students see this black-and-white copy, with each box you draw lightly highlighted and their answer boxes beside the music.', body),
      sec('an-answers', 'Answers', 'Each box asks for what you chose when you drew it — or set the whole quiz here.',
        grp('Every box asks for', seg('an-over', [{ v: 0, label: 'Each box’s own choice' }, { v: 1, label: 'Roman numerals' }, { v: 2, label: 'Chord symbols' }, { v: 3, label: 'Both' }],
          a.override, (v) => { a.override = v; changed(); redraw(); })),
        warn,
        fld('Instructions for students', notes, 'Shown above the music — a good place for the key, if students aren’t finding it themselves.'),
        h('div', { class: 'mix-foot' }, R.total)),
    ];
  }


  // ---------- Clefwork Rhythm: hearing and writing rhythms ----------
  const saveListen = () => store.set('rhythm-listen', S.listen);
  const TEMPO_SIGNS = { q: '♩', h: '𝅗𝅥', 'q.': '♩.', e: '♪' };
  const tempoLabel = (info, bpm) => `${TEMPO_SIGNS[info.tempo]} = ${bpm}`;
  const PLAY_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4.5v11l9-5.5z" fill="currentColor"/></svg>';
  let rhUid = 0;

  // The staff students and teachers write on, with the note buttons and what each measure still needs.
  // model: {meter, measures, parts, layers}. opts: readOnly, marks, onChange(layers).
  function rhythmEditor(model, opts) {
    const o = opts || {};
    const uid = ++rhUid;
    const box = h('div', { class: 'rstaff-box' });
    const status = h('div', { class: 'rh-status', 'aria-live': 'polite' });
    const entry = S.rhEntry;
    const parts = model.parts || 1;
    let partBtns = [];
    const syncParts = () => partBtns.forEach((b, l) => b.setAttribute('aria-checked', String(staff.active === l)));
    const staff = new MQ.RhythmStaff(box, {
      meter: model.meter, measures: model.measures, parts, layers: model.layers, readOnly: !!o.readOnly, marks: o.marks || null,
      onChange: (layers) => { drawStatus(); if (o.onChange) o.onChange(layers); },
      onMove: () => syncParts(),
    });
    function drawStatus() {
      const info = MQ.rhythmMeter(model.meter), L = staff.layers();
      const rows = [];
      for (let l = 0; l < parts; l++) {
        const chips = [];
        for (let m = 0; m < model.measures; m++) {
          const note = MQ.measureNote(L[l][m], info);
          chips.push(h('span', { class: 'rh-chip ' + (!note ? 'is-ok' : note === 'empty' ? 'is-empty' : 'is-short') },
            h('b', null, String(m + 1)), !note ? ' ✓' : ' ' + note));
        }
        rows.push(h('div', { class: 'rh-status-row' }, parts > 1 ? h('span', { class: 'rh-status-part' }, l ? 'Stems down' : 'Stems up') : null, chips));
      }
      status.replaceChildren(...rows);
    }
    if (o.readOnly) return { el: h('div', { class: 'rh-editor' }, box), staff };
    drawStatus();

    // ---------- the note buttons ----------
    const toast2 = (msg) => { if (msg) toast(msg, 'bad'); };
    const valueBtns = MQ.RHYTHM_VALUES.map((v, k) => h('button', {
      type: 'button', class: 'rh-tool', title: `${v.name[0].toUpperCase() + v.name.slice(1)} (${v.id.toUpperCase()})`,
      onclick: () => add(k),
    }, svgEl(MQ.rhythmIcon(v.name)), h('span', null, v.name === 'sixteenth' ? '16th' : v.name[0].toUpperCase() + v.name.slice(1))));
    const modeBtn = (key, label, iconKind, title) => h('button', {
      type: 'button', class: 'rh-tool rh-mode', 'aria-pressed': String(!!entry[key]), title,
      onclick: () => flip(key),
    }, svgEl(MQ.rhythmIcon(iconKind)), h('span', null, label));
    const dotBtn = modeBtn('dot', 'Dot', 'dot', 'Dotted notes: turn on, then choose a value (.)');
    const tripBtn = modeBtn('trip', 'Triplet', 'triplet', 'Triplets: turn on, then choose a value (T)');
    const restBtn = modeBtn('rest', 'Rest', 'rest', 'Rests instead of notes (R)');
    function paint() {
      dotBtn.setAttribute('aria-pressed', String(!!entry.dot));
      tripBtn.setAttribute('aria-pressed', String(!!entry.trip));
      restBtn.setAttribute('aria-pressed', String(!!entry.rest));
      // A dotted sixteenth would need a thirty-second note to finish the beat.
      valueBtns[4].disabled = !!entry.dot;
    }
    function flip(key) {
      entry[key] = !entry[key];
      // A note is dotted or a triplet, not both.
      if (key === 'dot' && entry.dot) entry.trip = false;
      if (key === 'trip' && entry.trip) entry.dot = false;
      paint();
    }
    function add(k) {
      if (entry.dot && k === 4) { toast('Turn off Dot to write a sixteenth — a dotted sixteenth would need a thirty-second note to finish the beat.'); return; }
      toast2(staff.enter({ v: k, d: entry.dot ? 1 : 0, t: entry.trip ? 1 : 0, r: entry.rest ? 1 : 0 }));
      staff.focus();
    }
    const del = () => { if (!staff.remove(true)) toast('There’s nothing before the cursor to delete.'); staff.focus(); };
    const palette = h('div', { class: 'rh-palette', role: 'toolbar', 'aria-label': 'Note values' },
      ...valueBtns, h('span', { class: 'rh-sep', 'aria-hidden': 'true' }), dotBtn, tripBtn, restBtn,
      h('span', { class: 'rh-sep', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'rh-tool', title: 'Delete the selected note, or the one before the cursor (Backspace)', onclick: del },
        svgEl('<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="M9 6h11v14H9l-6-7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10l5 6M17 10l-5 6" stroke="currentColor" stroke-width="1.6"/></svg>'), h('span', null, 'Delete')),
      h('button', { type: 'button', class: 'rh-tool', title: 'Empty the measure the cursor is in', onclick: () => { if (!staff.clearMeasure()) toast('That measure is already empty.'); staff.focus(); } },
        svgEl('<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="M5 8h14M9 8V5h6v3M7 8l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'), h('span', null, 'Clear bar')));
    paint();

    // ---------- keyboard ----------
    const KEYS_V = { w: 0, 1: 0, h: 1, 2: 1, q: 2, 4: 2, e: 3, 8: 3, s: 4, 6: 4 };
    staff.svg.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let done = true;
      if (k in KEYS_V) add(KEYS_V[k]);
      else if (k === '.' || k === 'd' || e.code === 'Period' || e.code === 'NumpadDecimal') flip('dot');
      else if (k === 't' || k === '3') flip('trip');
      else if (k === 'r' || k === '0') flip('rest');
      else if (k === 'ArrowLeft') staff.move(-1);
      else if (k === 'ArrowRight') staff.move(1);
      else if (k === 'ArrowUp' && parts > 1) staff.setActive(0);
      else if (k === 'ArrowDown' && parts > 1) staff.setActive(1);
      else if (k === 'Backspace') del();
      else if (k === 'Delete') staff.remove(false);
      else if (k === 'Escape') { staff.sel = null; staff.moved(); }
      else done = false;
      if (done) e.preventDefault();
    });

    // ---------- which part is being written ----------
    let partRow = null;
    if (parts > 1) {
      const wrapP = h('div', { class: 'seg rh-parts', role: 'radiogroup', 'aria-label': 'Part to write' });
      partBtns = ['Stems up — piano', 'Stems down — oboe'].map((label, l) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(staff.active === l),
        onclick: () => { staff.setActive(l); staff.focus(); },
      }, label));
      wrapP.append(...partBtns);
      partRow = h('div', { class: 'rh-part-row' }, h('span', { class: 'mini-label' }, 'Writing'), wrapP);
    }
    return {
      el: h('div', { class: 'rh-editor', id: 'rh-ed-' + uid }, partRow, box, palette, status,
        h('p', { class: 'rh-keys' }, 'Click the staff to place the cursor, or click a note to change it. To write a dotted note or a triplet, turn on Dot or Triplet, then choose the value. Keys: W H Q E S add notes, period (or D) for Dot, T for Triplet, R for Rest, arrows move, Backspace deletes.')),
      staff,
    };
  }

  // Playing a rhythm: which measures, a count-off, the metronome, and each instrument's volume.
  // opts: {ex: {meter, measures, tempo, parts}, sources: [{label, primary, layers(), left(), use(), needsNotes}], staffs()}
  function listenPanel(opts) {
    const ex = opts.ex, uid = ++rhUid;
    const n = ex.measures;
    const sel = { a: 0, b: n - 1 };
    let playing = null;
    // ---------- measures ----------
    const cells = [];
    for (let m = 0; m < n; m++) cells.push(h('button', { type: 'button', class: 'rh-cell', 'data-m': m, 'aria-label': `Measure ${m + 1}` }, String(m + 1)));
    const allBtn = h('button', { type: 'button', class: 'rh-cell rh-all', onclick: () => setSel(0, n - 1) }, 'All');
    const pick = h('div', { class: 'rh-pick', role: 'group', 'aria-label': 'Measures to play' }, allBtn, ...cells);
    function setSel(a, b) {
      sel.a = Math.min(a, b); sel.b = Math.max(a, b);
      cells.forEach((c, m) => c.setAttribute('aria-pressed', String(m >= sel.a && m <= sel.b)));
      allBtn.setAttribute('aria-pressed', String(sel.a === 0 && sel.b === n - 1));
      what.textContent = sel.a === 0 && sel.b === n - 1 ? (n > 1 ? `All ${n} measures` : 'The whole example') : sel.a === sel.b ? `Measure ${sel.a + 1}` : `Measures ${sel.a + 1}–${sel.b + 1}`;
    }
    // Tap a measure, or drag across several.
    let anchor = null;
    const cellAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest ? el.closest('.rh-cell[data-m]') : null; };
    pick.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.rh-cell[data-m]');
      if (!c) return;
      e.preventDefault();
      anchor = +c.dataset.m;
      setSel(anchor, anchor);
      try { pick.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    });
    pick.addEventListener('pointermove', (e) => { if (anchor == null) return; const c = cellAt(e); if (c) setSel(anchor, +c.dataset.m); });
    const endDrag = () => { anchor = null; };
    pick.addEventListener('pointerup', endDrag);
    pick.addEventListener('pointercancel', endDrag);
    cells.forEach((c) => c.addEventListener('click', (e) => { if (e.detail === 0) setSel(+c.dataset.m, +c.dataset.m); }));
    const what = h('span', { class: 'rh-what' });
    // ---------- play buttons ----------
    const count = h('span', { class: 'rh-count', 'aria-live': 'off' });
    const items = opts.sources.map((src) => {
      const left = h('span', { class: 'rh-left' });
      const btn = h('button', { type: 'button', class: 'btn rh-play' + (src.primary ? ' btn-primary' : ''), onclick: () => (playing === src ? MQ.Audio.stop() : start(src)) });
      return { src, btn, left };
    });
    function paint() {
      items.forEach(({ src, btn, left }) => {
        const k = src.left ? src.left() : Infinity;
        btn.replaceChildren(svgEl(playing === src ? STOP : PLAY_ICON), document.createTextNode(playing === src ? 'Stop' : src.label));
        btn.classList.toggle('is-playing', playing === src);
        btn.disabled = playing !== src && k <= 0;
        left.textContent = k === Infinity ? '' : k <= 0 ? 'No plays left' : `${k} play${k === 1 ? '' : 's'} left`;
        left.classList.toggle('is-out', k <= 0);
      });
    }
    function highlight(m, beat) {
      cells.forEach((c, j) => c.classList.toggle('is-playing', j === m));
      (opts.staffs ? opts.staffs() : []).forEach((st) => st && st.setPlaying(m));
      count.textContent = m === -1 ? `Count-off ${beat}` : m >= 0 ? `Measure ${m + 1}` : '';
    }
    function start(src) {
      if (src.left && src.left() <= 0) { toast('There are no plays left for this.'); return; }
      const layers = src.layers();
      if (src.needsNotes && !layers.some((L) => L.some((m) => m && m.length))) { toast('Write some notes first — then you can hear them.'); return; }
      const pe = MQ.rhythmPlayEvents(ex, layers, { from: sel.a, to: sel.b, countIn: S.listen.countIn, metronome: S.listen.metro });
      const marks = pe.marks.map((mk) => ({ at: mk.at, fn: () => highlight(mk.m, mk.beat) }));
      const ok = MQ.Audio.sequence(pe.events, { total: pe.total, marks, done: () => { playing = null; highlight(-2); paint(); } });
      if (!ok) { toast('This browser can’t play sound.', 'bad'); return; }
      playing = src;
      if (src.use) src.use();
      paint();
    }
    // ---------- count-off, metronome, volume ----------
    const countSeg = seg('rh-countin-' + uid, [{ v: 0, label: 'None' }, { v: 1, label: '1 bar' }, { v: 2, label: '2 bars' }], S.listen.countIn, (v) => { S.listen.countIn = v; saveListen(); });
    const metro = toggle('rh-metro-' + uid, 'Metronome while playing', null, S.listen.metro, (v) => { S.listen.metro = v; saveListen(); });
    const slider = (voice, label) => {
      const inp = h('input', { type: 'range', min: 0, max: 100, class: 'rh-vol', 'aria-label': `${label} volume` });
      inp.value = Math.round(S.listen.vol[voice] * 100);
      inp.addEventListener('input', () => { S.listen.vol[voice] = inp.value / 100; MQ.Audio.setVolume(voice, inp.value / 100); saveListen(); });
      return h('label', { class: 'rh-vol-row' }, h('span', null, label), inp);
    };
    setSel(0, n - 1);
    paint();
    return h('div', { class: 'rh-listen' },
      h('div', { class: 'rh-play-row' }, ...items.map((it) => h('div', { class: 'rh-play-item' }, it.btn, it.left)), count),
      h('div', { class: 'rh-opts' },
        h('div', { class: 'rh-opt' }, h('span', { class: 'mini-label' }, 'Play'), pick, what),
        h('div', { class: 'rh-opt' }, h('span', { class: 'mini-label' }, 'Count-off'), countSeg),
        metro),
      h('div', { class: 'rh-vols' },
        h('span', { class: 'mini-label' }, 'Volume'),
        slider('piano', ex.parts > 1 ? 'Piano (stems up)' : 'Piano'), ex.parts > 1 ? slider('oboe', 'Oboe (stems down)') : null, slider('click', 'Click')));
  }

  function rhythmFacts(R, info) {
    return h('dl', { class: 'facts rh-facts' },
      h('div', null, h('dt', null, 'Time'), h('dd', null, info.label + (info.grouping ? ` (${info.grouping})` : ''))),
      h('div', null, h('dt', null, 'Tempo'), h('dd', null, tempoLabel(info, R.tempo))),
      h('div', null, h('dt', null, 'Measures'), h('dd', null, String(R.measures))),
      h('div', null, h('dt', null, 'Parts'), h('dd', null, R.parts > 1 ? 'Piano & oboe' : 'Piano')));
  }
  // One rhythm question: listen, then write it. In a quiz the plays can be limited; once checked,
  // and in the grade checker, they aren't.
  function rhythmCard(q, cfg, o) {
    const R = q.rh, info = MQ.rhythmMeter(R.meter);
    const reveal = !!o.reveal && !o.keyMode;
    const grader = !!o.locked && !o.plays;
    const wrap = h('div', { class: 'qcard rh-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, `${info.label} · ${R.measures} measure${R.measures > 1 ? 's' : ''}`)));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (!o.locked && !o.keyMode) {
      wrap.append(h('p', { class: 'q-hint' }, R.parts > 1
        ? 'Two parts play together: the piano, written with stems up, and the oboe, written with stems down. Write both.'
        : 'Listen as often as you’re allowed, then write the rhythm below.'));
    }
    wrap.append(rhythmFacts(R, info));
    const resp = R.layers.map((L, l) => L.map((_, m) => ((o.response && o.response[l] && o.response[l][m]) || []).map(MQ.rhythmEvent)));
    const limit = MQ.rhythmSettings(cfg.rhythm);
    const left = (k) => {
      const lim = o.plays && !o.locked ? (k === 'ex' ? limit.playsEx : limit.playsAns) || 0 : 0;
      return lim ? Math.max(0, lim - (o.plays[k] || 0)) : Infinity;
    };
    const use = (k) => () => { if (o.plays && !o.locked) { o.plays[k] = (o.plays[k] || 0) + 1; if (o.onPlays) o.onPlays(); } };
    let ed = null, key = null;
    const cmp = reveal ? MQ.compareRhythm(q, resp) : null;
    const sources = [{ label: 'Play the example', primary: true, layers: () => R.layers, left: () => left('ex'), use: use('ex') }];
    if (!o.keyMode) sources.push({ label: grader ? 'Play their answer' : 'Hear my answer', layers: () => (ed ? ed.staff.layers() : resp), needsNotes: true, left: () => left('ans'), use: use('ans') });
    wrap.append(listenPanel({ ex: R, sources, staffs: () => [ed && ed.staff, key].filter(Boolean) }));
    if (!o.keyMode) {
      ed = rhythmEditor({ meter: R.meter, measures: R.measures, parts: R.parts, layers: resp }, {
        readOnly: !!o.locked, marks: cmp ? { side: 'got', parts: cmp.parts } : null,
        onChange: (L) => { if (o.onResponse) o.onResponse(L.slice(0, R.parts).map((layer) => layer.slice(0, R.measures))); },
      });
      wrap.append(h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, grader ? 'Student’s answer' : o.locked ? 'Your answer' : 'Your answer — write the rhythm here'), ed.el));
    }
    if (reveal || o.keyMode) {
      const box = h('div', { class: 'rstaff-box' });
      key = new MQ.RhythmStaff(box, { meter: R.meter, measures: R.measures, parts: R.parts, layers: R.layers, readOnly: true, marks: cmp ? { side: 'want', parts: cmp.parts } : null });
      wrap.append(h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, cmp && cmp.wrong ? 'The answer — notes that were missed or wrong are in red' : 'The answer'), box));
    }
    if (o.playsUsed) {
      const t = (k) => `${o.playsUsed[k]} time${o.playsUsed[k] === 1 ? '' : 's'}`;
      wrap.append(h('p', { class: 'fine rh-plays' }, `Played the example ${t('ex')} and their answer ${t('ans')}.`));
    }
    if (cmp) {
      const right = Math.max(0, cmp.notes - cmp.wrong);
      wrap.append(!cmp.wrong ? h('p', { class: 'result is-good', role: 'status' }, h('strong', null, 'Correct.'), ` All ${cmp.notes} notes match.`)
        : h('p', { class: 'result is-bad', role: 'status' }, h('strong', null, `${cmp.wrong} wrong note${cmp.wrong === 1 ? '' : 's'}`), ` — ${right} of ${cmp.notes} points. `,
          'Red notes are the wrong length, in the wrong place, or extra; in the answer, red notes were missed or wrong.'));
    }
    return wrap;
  }

  // What students should know before a rhythm quiz: sound on, and how often they can listen.
  function rhythmIntro(cfg, qs) {
    const b = MQ.rhythmSettings(cfg.rhythm);
    const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
    const ex = b.playsEx ? `You can play each example ${times(b.playsEx)}` : 'You can play each example as often as you like';
    const ans = b.playsAns ? `, and hear your own answer ${times(b.playsAns)}` : ', and hear your own answer as often as you like';
    const notes = rhythmNotes(qs);
    const score = b.score === 'percent' ? ` The quiz is out of ${b.outOf} points — the share of its ${notes} notes you get right.`
      : ` Every note is worth a point — ${notes} in all — and each wrong or extra note costs one.`;
    return `Turn your sound on — headphones help. ${ex}${ans}.${score}`;
  }

  // ---------- Clefwork Rhythm: the builder ----------
  function rhythmReady() {
    const probs = MQ.rhythmProblems(S.cfg.rhythm);
    if (!probs.length) return true;
    toast(probs[0].text + (probs.length > 1 ? ` (${probs.length - 1} more to fix)` : ''), 'bad');
    S.rhEx = probs[0].ex;
    if (S.view === 'build') go('build');
    return false;
  }
  function meterPicker(meter, onPick) {
    const rows = [[4, 'Quarter-note beat'], [8, 'Eighth-note meters'], [2, 'Half-note beat']];
    const wrap = h('div', { class: 'rh-meters', role: 'radiogroup', 'aria-label': 'Time signature' });
    rows.forEach(([d, label]) => {
      const group = h('div', { class: 'seg' });
      MQ.RHYTHM_METERS.filter((m) => m.d === d).forEach((m) => {
        group.append(h('button', {
          type: 'button', role: 'radio', class: 'rh-meter', 'aria-checked': String(m.n === meter.n && m.d === meter.d), 'aria-label': `${m.n}/${m.d}`,
          onclick: () => onPick({ n: m.n, d: m.d, g: 0 }),
        }, h('span', { class: 'rh-frac', 'aria-hidden': 'true' }, h('span', null, String(m.n)), h('span', null, String(m.d)))));
      });
      wrap.append(h('div', { class: 'rh-meter-row' }, h('span', { class: 'rh-meter-label' }, label), group));
    });
    return wrap;
  }
  function rhythmSections(cfg, changed, R) {
    const rh = cfg.rhythm = MQ.rhythmSettings(cfg.rhythm);
    if (!rh.examples.length) rh.examples.push(MQ.rhythmExample());
    cfg.counts.rhythm = rh.auto.on ? rh.auto.count : rh.examples.length;
    S.rhEx = Math.max(0, Math.min(rh.examples.length - 1, S.rhEx || 0));
    R.total = h('span', { class: 'mix-total' });
    const mode = seg('rh-mode', [{ v: 0, label: 'Write the rhythms myself' }, { v: 1, label: 'Make them automatically' }], rh.auto.on ? 1 : 0, (v) => {
      rh.auto.on = !!v;
      cfg.counts.rhythm = rh.auto.on ? rh.auto.count : rh.examples.length;
      changed();
      go('build');
    });
    const PLAYS = [{ v: 0, label: 'Unlimited' }].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v, label: v === 1 ? 'Once' : `${v} times` })));
    const later = [scoringSection(cfg, changed, R),
      sec('rh-listen', 'Listening', 'How often students may play each example, and their own answer, before they submit. Choosing measures, the count-off and the metronome are up to them.',
        h('div', { class: 'row2' },
          fld('Plays of the example', selectEl('rh-plays-ex', PLAYS, rh.playsEx, (v) => { rh.playsEx = +v; changed(); }), 'Per example. Each play counts, however many measures it covers.'),
          fld('Plays of their answer', selectEl('rh-plays-ans', PLAYS, rh.playsAns, (v) => { rh.playsAns = +v; changed(); }), 'Per example. Students hear what they’ve written, on the same instruments.')))];
    if (rh.auto.on) {
      return [sec('rh-examples', 'Examples', 'Clefwork writes the rhythms from the level you choose. Everyone with the quiz code gets the same ones.',
        mode, autoPanel(cfg, changed), h('div', { class: 'mix-foot' }, R.total))].concat(later);
    }
    const tabs = h('div', { class: 'rh-tabs', role: 'tablist', 'aria-label': 'Examples' });
    const body = h('div', { class: 'rh-ex' });
    const edited = () => { cfg.counts.rhythm = rh.examples.length; changed(); drawTabs(); };
    function drawTabs() {
      tabs.replaceChildren(...rh.examples.map((ex, i) => {
        const ok = !MQ.exampleProblems(ex).length;
        return h('button', {
          type: 'button', role: 'tab', class: 'rh-tab', 'aria-selected': String(i === S.rhEx),
          title: ok ? 'Ready' : 'Not finished yet', onclick: () => { S.rhEx = i; drawTabs(); drawExample(); },
        }, h('span', null, `Example ${i + 1}`), h('span', { class: 'rh-tab-state ' + (ok ? 'is-ok' : 'is-open'), 'aria-label': ok ? 'ready' : 'not finished' }, ok ? '✓' : '•'));
      }), rh.examples.length < MQ.RHYTHM_MAX ? h('button', {
        type: 'button', class: 'rh-tab rh-add', onclick: () => {
          rh.examples.push(MQ.rhythmExample(rh.examples[S.rhEx]));
          S.rhEx = rh.examples.length - 1;
          edited(); drawExample();
          toast(`Example ${S.rhEx + 1} added — same time signature and tempo`);
        },
      }, '+ Add example') : null);
    }
    function drawExample() {
      const ex = MQ.exampleSettings(rh.examples[S.rhEx]);
      const info = MQ.rhythmMeter(ex.meter);
      const redo = () => { edited(); drawExample(); };
      // ---------- settings ----------
      const measures = seg('rh-measures', [1, 2, 3, 4].map((v) => ({ v, label: String(v) })), ex.measures, (v) => { ex.measures = v; redo(); });
      const meter = meterPicker(ex.meter, (m) => {
        // Keep the same speed of eighth notes when the beat changes (♩ = 90 in 4/4 is ♩. = 60 in 6/8).
        const before = MQ.RHYTHM_TEMPO_UNITS[info.tempo];
        ex.meter = m;
        const after = MQ.RHYTHM_TEMPO_UNITS[MQ.rhythmMeter(m).tempo];
        ex.tempo = Math.max(40, Math.min(240, Math.round((ex.tempo * before) / after)));
        redo();
      });
      const groups = MQ.rhythmGroupings(ex.meter);
      const grouping = groups && groups.length > 1
        ? grp('Beats', seg('rh-grouping', groups.map((g, i) => ({ v: i, label: g.join(' + ') })), ex.meter.g || 0, (v) => { ex.meter.g = v; redo(); }), 'How the eighths are grouped — it sets the beaming and where the metronome clicks.')
        : null;
      const tempoIn = h('input', { type: 'number', id: 'rh-tempo', min: 40, max: 240, inputmode: 'numeric' });
      const tempoRange = h('input', { type: 'range', min: 40, max: 240, class: 'rh-vol', 'aria-label': 'Tempo' });
      tempoIn.value = tempoRange.value = ex.tempo;
      const setTempo = (v, from) => {
        ex.tempo = Math.max(40, Math.min(240, Math.round(+v || 80)));
        if (from !== tempoIn) tempoIn.value = ex.tempo;
        if (from !== tempoRange) tempoRange.value = ex.tempo;
        edited();
      };
      tempoIn.addEventListener('change', () => setTempo(tempoIn.value, null));
      tempoRange.addEventListener('input', () => setTempo(tempoRange.value, tempoRange));
      const tempo = h('div', { class: 'rh-tempo' }, h('span', { class: 'rh-tempo-sign', 'aria-hidden': 'true' }, TEMPO_SIGNS[info.tempo] + ' ='), tempoIn, tempoRange);
      const twoParts = toggle('rh-parts', 'Two parts', 'Adds a part with stems down, played by the oboe. It can have its own rhythm.', ex.parts > 1, (v) => { ex.parts = v ? 2 : 1; redo(); });
      // ---------- the rhythm ----------
      const ed = rhythmEditor(ex, { onChange: (L) => { L.forEach((layer, l) => (ex.layers[l] = layer)); edited(); } });
      // ---------- duplicate, delete, clear ----------
      const delBtn = h('button', { type: 'button', class: 'btn btn-quiet sm an-del', disabled: rh.examples.length < 2 || null, onclick: () => {
        if (delBtn.dataset.sure !== '1') {
          delBtn.dataset.sure = '1';
          delBtn.textContent = 'Click again to delete';
          setTimeout(() => { if (delBtn.isConnected) { delBtn.dataset.sure = ''; delBtn.textContent = 'Delete example'; } }, 3000);
          return;
        }
        rh.examples.splice(S.rhEx, 1);
        toast(`Example ${S.rhEx + 1} deleted`);
        S.rhEx = Math.min(S.rhEx, rh.examples.length - 1);
        redo();
      } }, 'Delete example');
      const dupBtn = h('button', { type: 'button', class: 'btn btn-quiet sm', disabled: rh.examples.length >= MQ.RHYTHM_MAX || null, onclick: () => {
        rh.examples.splice(S.rhEx + 1, 0, JSON.parse(JSON.stringify(ex)));
        S.rhEx += 1;
        redo();
        toast(`Copied to example ${S.rhEx + 1}`);
      } }, 'Duplicate');
      body.replaceChildren(...[
        h('div', { class: 'rh-ex-head' }, h('h3', null, `Example ${S.rhEx + 1}`), h('div', { class: 'rh-ex-actions' }, dupBtn, delBtn)),
        grp('Time signature', meter),
        grouping,
        h('div', { class: 'row2' },
          grp('Measures', measures, 'One to four.'),
          grp('Tempo', tempo, `Beats per minute, counting ${MQ.RHYTHM_TEMPO_NAMES[info.tempo]}s.`)),
        twoParts,
        h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, ex.parts > 1 ? 'The rhythm — stems up for the piano, stems down for the oboe' : 'The rhythm'), ed.el),
        listenPanel({ ex, sources: [{ label: 'Play the rhythm', primary: true, layers: () => ex.layers }], staffs: () => [ed.staff] })].filter(Boolean));
    }
    drawTabs();
    drawExample();
    return [
      sec('rh-examples', 'Examples', 'Write each rhythm students will hear. Every measure has to be full before the quiz can be shared — rests count.',
        mode, tabs, body, h('div', { class: 'mix-foot' }, R.total)),
    ].concat(later);
  }
  // How the quiz is scored: a point for every note, or a percent of a total the teacher sets.
  function scoringSection(cfg, changed, R) {
    const rh = cfg.rhythm;
    const outIn = h('input', { type: 'number', id: 'rh-outof', min: 1, max: 1000, inputmode: 'numeric' });
    outIn.value = rh.outOf;
    outIn.addEventListener('change', () => { rh.outOf = Math.max(1, Math.min(1000, Math.round(+outIn.value || 100))); outIn.value = rh.outOf; changed(); });
    const outWrap = fld('Total points', outIn, 'The share of notes a student gets right, scaled to this total.');
    outWrap.hidden = rh.score !== 'percent';
    R.scoreInfo = h('p', { class: 'fine rh-score-info' });
    return sec('rh-score', 'Scoring', 'Graded note by note. A note the student misses or writes the wrong length is a wrong note, and so is every extra note they write. Rests only fill time, so two eighth rests match a quarter rest.',
      grp('Score the quiz', seg('rh-score', [{ v: 'notes', label: 'A point for every note' }, { v: 'percent', label: 'A percent of a total I choose' }], rh.score, (v) => {
        rh.score = v;
        outWrap.hidden = v !== 'percent';
        changed();
      })),
      outWrap, R.scoreInfo);
  }
  // Notes in the quiz's examples — what a note-scored quiz is out of.
  const rhythmNotes = (qs) => qs.filter((q) => q.type === 'rhythm').reduce((n, q) => n + MQ.compareRhythm(q, null).notes, 0);
  function rhythmScoreText(cfg, qs) {
    const b = MQ.rhythmSettings(cfg.rhythm), notes = rhythmNotes(qs);
    if (!notes) return '';
    if (b.score !== 'percent') return `These examples have ${notes} notes in all, so the quiz is out of ${notes}. Each wrong note costs a point.`;
    const eg = Math.min(3, notes);
    return `These examples have ${notes} notes in all. The quiz is out of ${b.outOf}: a student with ${eg} wrong note${eg === 1 ? '' : 's'} scores ${fmtPts(((notes - eg) / notes) * b.outOf)} of ${b.outOf}.`;
  }

  // ---------- Clefwork Rhythm: examples made automatically ----------
  function autoPanel(cfg, changed) {
    const a = cfg.rhythm.auto, c = a.custom;
    const preview = h('div', { class: 'rh-auto-list' });
    const redo = () => { cfg.counts.rhythm = a.count; changed(); drawPreview(); };
    const count = counter('rh-auto-count', 'examples', (v) => {
      a.count = Math.max(1, v);
      if (v < 1) count.sync(1, 20);
      redo();
    });
    count.sync(a.count, 20);
    // ---------- the level ----------
    const levels = h('div', { class: 'rh-levels', role: 'radiogroup', 'aria-label': 'Level' });
    const custom = h('div', { class: 'rh-custom' });
    const LIST = MQ.RHYTHM_LEVELS.map((L, i) => ({ id: i + 1, name: `Level ${i + 1} · ${L.name}`, blurb: L.blurb }))
      .concat([{ id: 7, name: 'Custom rules', blurb: 'Choose the time signatures, the shortest note, and whether to use dotted notes, triplets and notes off the beat.' }]);
    const drawLevels = () => {
      levels.replaceChildren(...LIST.map((L) => h('button', {
        type: 'button', role: 'radio', class: 'rh-level', 'aria-checked': String(a.level === L.id),
        onclick: () => { a.level = L.id; custom.hidden = a.level !== 7; drawLevels(); redo(); },
      }, h('strong', null, L.name), h('span', null, L.blurb))));
      custom.hidden = a.level !== 7;
    };
    // ---------- custom rules ----------
    const NUMS = [2, 3, 4, 5, 6].map((n) => ({ v: n, label: `${n}/4` }));
    const lo = selectEl('rh-c-lo', NUMS, c.lo, (v) => { c.lo = +v; if (c.hi < c.lo) { c.hi = c.lo; hi.value = String(c.hi); } redo(); });
    const hi = selectEl('rh-c-hi', NUMS, c.hi, (v) => { c.hi = +v; if (c.lo > c.hi) { c.lo = c.hi; lo.value = String(c.lo); } redo(); });
    const flip = (k) => (v) => { c[k] = v ? 1 : 0; redo(); };
    custom.append(
      h('div', { class: 'row2' }, fld('Time signatures from', lo), fld('To', hi)),
      h('div', { class: 'toggles' },
        toggle('rh-c-compound', 'Compound meters', '3/8, 6/8, 9/8 and 12/8.', c.compound, flip('compound')),
        toggle('rh-c-cut', 'Cut time', '2/2, and 3/2.', c.cut, flip('cut')),
        toggle('rh-c-uneven', 'Uneven meters', '5/8, 7/8, 8/8, 10/8 and 11/8.', c.uneven, flip('uneven'))),
      grp('Shortest note', seg('rh-c-short', [{ v: 2, label: 'Quarter' }, { v: 3, label: 'Eighth' }, { v: 4, label: 'Sixteenth' }], c.shortest, (v) => { c.shortest = v; redo(); })),
      h('div', { class: 'toggles' },
        toggle('rh-c-dotted', 'Dotted notes', 'Dotted halves, quarters and eighths.', c.dotted, flip('dotted')),
        toggle('rh-c-trip', 'Triplets', 'Quarter-note triplets, and eighth- and sixteenth-note triplets when the shortest note allows.', c.triplets, flip('triplets'))),
      grp('Notes off the beat', seg('rh-c-off', [{ v: 0, label: 'None' }, { v: 1, label: 'One or two' }, { v: 2, label: 'More' }], c.offbeats, (v) => { c.offbeats = v; redo(); }),
        'One or two in each example, or up to about one a measure.'));
    drawLevels();
    // ---------- tempo ----------
    const tempoIn = h('input', { type: 'number', id: 'rh-auto-tempo', min: 40, max: 240, inputmode: 'numeric' });
    tempoIn.value = a.tempo;
    tempoIn.addEventListener('change', () => { a.tempo = Math.max(40, Math.min(240, Math.round(+tempoIn.value || 80))); tempoIn.value = a.tempo; redo(); });
    // ---------- what it made ----------
    function drawPreview() {
      const qs = MQ.rhythmQuestions(cfg);
      preview.replaceChildren(...qs.map((q) => {
        const R = q.rh, info = MQ.rhythmMeter(R.meter);
        const box = h('div', { class: 'rstaff-box' });
        new MQ.RhythmStaff(box, { meter: R.meter, measures: R.measures, parts: R.parts, layers: R.layers, readOnly: true });
        return h('div', { class: 'rh-auto-item' },
          h('div', { class: 'rh-auto-head' }, h('strong', null, `Example ${R.n + 1}`),
            h('span', { class: 'help' }, `${info.label}${info.grouping ? ` (${info.grouping})` : ''} · ${tempoLabel(info, R.tempo)}`), rhythmPlayButton(R)),
          box);
      }));
    }
    const fresh = h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
      cfg.seed = MQ.randomSeed();
      redo();
      toast('New examples made — share the new code');
    } }, '↻ Make new examples');
    drawPreview();
    return h('div', { class: 'rh-auto' },
      h('div', { class: 'row2' },
        grp('How many examples', count, 'Up to 20.'),
        grp('Measures in each', seg('rh-auto-measures', [1, 2, 3, 4].map((v) => ({ v, label: String(v) })), a.measures, (v) => { a.measures = v; redo(); }))),
      grp('Level', levels),
      custom,
      grp('Tempo', h('div', { class: 'rh-tempo' }, h('span', { class: 'rh-tempo-sign', 'aria-hidden': 'true' }, '♩ ='), tempoIn),
        'In other meters the eighth notes keep this speed: ♩ = 80 is ♩. = 53 in 6/8.'),
      h('div', { class: 'rh-auto-top' }, h('span', { class: 'mini-label' }, 'The examples'), fresh),
      preview);
  }
  // Plays one example as written, with the listener's count-off and metronome.
  function rhythmPlayButton(ex) {
    const btn = h('button', { type: 'button', class: 'btn sm rh-mini-play' });
    const idle = () => { btn.classList.remove('is-playing'); btn.replaceChildren(svgEl(PLAY_ICON), document.createTextNode('Play')); };
    idle();
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-playing')) { MQ.Audio.stop(); return; }
      const pe = MQ.rhythmPlayEvents(ex, ex.layers, { countIn: S.listen.countIn, metronome: S.listen.metro });
      if (!MQ.Audio.sequence(pe.events, { total: pe.total, done: idle })) { toast('This browser can’t play sound.', 'bad'); return; }
      btn.classList.add('is-playing');
      btn.replaceChildren(svgEl(STOP), document.createTextNode('Stop'));
    });
    return btn;
  }
  // An answer-key entry: the example's rhythm, drawn small.
  function rhythmKeyItem(q) {
    const R = q.rh, info = MQ.rhythmMeter(R.meter);
    const box = h('div', { class: 'rstaff-box rh-key-staff' });
    new MQ.RhythmStaff(box, { meter: R.meter, measures: R.measures, parts: R.parts, layers: R.layers, readOnly: true });
    return h('li', null, h('span', { class: 'key-q' }, `Example ${R.n + 1}`, h('span', { class: 'key-clef' }, ` · ${info.label} · ${tempoLabel(info, R.tempo)}`)), box);
  }
  // On paper: an empty staff to write on, two measures to a line.
  function rhythmPrintArt(q, opts) {
    const R = q.rh, rows = [];
    const per = R.measures > 2 ? 2 : R.measures;
    for (let a = 0; a < R.measures; a += per) {
      const blank = { meter: R.meter, measures: Math.min(per, R.measures - a), parts: R.parts, layers: [[[], [], [], []], [[], [], [], []]] };
      rows.push(MQ.rhythmArt(blank, { first: a, showTime: a === 0, measureW: 300, heightIn: (opts && opts.height) || 1.25 }));
    }
    return rows;
  }

  // ---------- print: a paper copy of the quiz, as PDF or a Word document ----------
  // A standalone SVG for one question's staff: no colours from the app, drawn clefs when the
  // picture has to be rasterised, and cropped to the part of the staff that is used.
  function exportStaffSVG(q, opts) {
    const o = opts || {};
    const box = h('div');
    const wasFont = MQ.clefFont;
    if (o.drawnClefs) MQ.clefFont = false;
    const st = new MQ.Staff(box, {
      clef: q.clef, grand: !!q.grand, keySig: q.keySig || 0, keyAware: !!q.keyAware,
      columns: q.columns, readOnly: true, labels: false,
      chordLabels: q.chordLabels || null, barlines: !!q.chordLabels || q.type === 'figprog',
      colW: q.chordLabels ? 62 : null,
    });
    MQ.clefFont = wasFont;
    const svg = st.svg;
    const view = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const W = view[2] || 600;
    // Keep the staff plus room above and below for the notes students add.
    const staffTop = st.staves[0].by - 48, staffBottom = st.staves[st.staves.length - 1].by;
    const pad = 32;
    // Chord symbols and Roman numerals are drawn below the staff, so keep them in view.
    const below = q.chordLabels ? st.vbH - staffBottom : pad;
    const top = Math.max(0, staffTop - pad), height = Math.min(st.vbH - top, staffBottom + below - top);
    svg.setAttribute('viewBox', `0 ${top} ${W} ${height}`);
    svg.removeAttribute('style');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const inch = (q.grand ? 1.65 : 1) * (o.height || 1.25);   // a grand staff needs the extra room
    svg.setAttribute('width', (W / height) * inch * 96);
    svg.setAttribute('height', inch * 96);
    // The picture carries its own styling so it stands alone in a file or a Word document.
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = 'svg{background:#fff}.sl{stroke:#000;stroke-width:1.1;fill:none}.brace{fill:#000}'
      + '.clef-glyph{fill:#000;font-family:"Noto Music","Bravura Text",serif}.note{color:#000}.note .head{fill:#000}'
      + '.ledger{stroke:#000;stroke-width:1.3}.slot{display:none}.nlabel{display:none}'
      + '.clabel{font:bold 13px Georgia,serif;fill:#000}.clabel.is-small{font-size:10.5px;fill:#333}'
      + '.sacc{font-family:"Noto Music",serif}';
    svg.insertBefore(style, svg.firstChild);
    return { svg, markup: new XMLSerializer().serializeToString(svg), wIn: (W / height) * inch, hIn: inch };
  }


  // Every picture a question prints with: its staff, or for Keys questions the note shown
  // (staff or highlighted key) and the staff or keyboard to answer on.
  function pianoArt(lo, hi, highlight) {
    const markup = MQ.pianoMarkup(lo, hi, { highlight });
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const hIn = 1;
    return { svg, markup, wIn: (vb[2] / vb[3]) * hIn, hIn };
  }
  function exportArt(q, opts) {
    if (q.type === 'rhythm') return rhythmPrintArt(q, opts);
    if (q.type !== 'keys') return [exportStaffSVG(q, opts)];
    const k = q.keys;
    const staffOf = (notes) => exportStaffSVG({ type: 'keys', clef: 'grand', grand: true, columns: [{ given: notes, cap: notes.length ? 0 : 1 }] }, opts);
    const out = [];
    if (k.prompt === 'staff') out.push(staffOf([k.pitch]));
    if (k.prompt === 'piano') out.push(pianoArt(k.kbLo, k.kbHi, k.midi));
    if (k.answer === 'staff') out.push(staffOf([]));
    if (k.answer === 'piano') out.push(pianoArt(k.kbLo, k.kbHi, null));
    return out;
  }

  // Draw an SVG into a canvas and hand back PNG bytes for the Word document.
  function svgToPNG(markup, wIn, hIn, dpi) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(wIn * dpi));
        canvas.height = Math.max(1, Math.round(hIn * dpi));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('no image')); return; }
          blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('That staff could not be turned into a picture.'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    });
  }

  const printInfo = () => ({
    title: S.cfg.title || 'Music quiz',
    teacher: S.cfg.teacher || '',
    course: S.print.course || '',
    date: MQ.validDate(S.print.date) ? S.print.date : MQ.today(),
  });
  const printOpts = (extra) => Object.assign({
    paper: S.print.paper, staffHeight: S.print.staffH, qrSize: S.print.qr,
    quizId: S.code ? MQ.quizId(S.code) : 0,
  }, extra || {});
  const printPayload = () => (S.code ? (quizLink(S.code) || 'Clefwork quiz ' + MQ.normalize(S.code)) : 'Clefwork');

  function renderPrint(main) {
    const wrap = h('div', { class: 'print-view' });
    const form = h('div', { class: 'card print-form' });
    const preview = h('div', { class: 'print-preview' });
    main.append(h('div', { class: 'narrow-wide' }, wrap));
    wrap.append(form, preview);
    if (!S.print.date) S.print.date = MQ.today();
    const qs = S.code ? MQ.generateQuiz(S.cfg) : [];
    const frame = h('iframe', { class: 'print-frame', title: 'Print preview' });
    const status = h('p', { class: 'help print-status' });

    const buildSheet = () => {
      const model = MQ.printModel(qs, S.cfg);
      const opts = printOpts({ qrSVG: MQ.qrSVG(printPayload(), 96 * S.print.qr, { ecc: 'L' }) });
      return MQ.printHTML(model, printInfo(), opts, (q) => exportArt(q, { height: S.print.staffH }).map((a) => a.markup).join(''));
    };
    const fileStem = () => (S.cfg.title || 'quiz').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'quiz';
    // The page is drawn at its true size and scaled to fit the space, or to whatever the slider says.
    const stage = h('div', { class: 'print-stage' });
    const holder = h('div', { class: 'print-holder' }, frame);
    stage.append(holder);
    const zoomOut = h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Zoom out', onclick: () => setZoom(zoom - 10) }, '−');
    const zoomIn = h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Zoom in', onclick: () => setZoom(zoom + 10) }, '+');
    const slider = h('input', { type: 'range', min: 25, max: 200, step: 5, class: 'zoom-range', 'aria-label': 'Preview zoom' });
    const zoomLabel = h('span', { class: 'zoom-pct' });
    const fitBtn = h('button', { type: 'button', class: 'btn sm', onclick: () => { fitting = true; savePrint(); applyZoom(); } }, 'Fit page');
    slider.addEventListener('input', () => setZoom(+slider.value));
    let zoom = S.print.zoom || 100;
    let fitting = S.print.zoom == null || S.print.zoom === 0;
    function setZoom(v) {
      zoom = Math.max(25, Math.min(200, Math.round(v / 5) * 5));
      fitting = false;
      S.print.zoom = zoom;
      savePrint();
      applyZoom();
    }
    function pageSize() {
      const p = MQ.paperOf(S.print.paper);
      const k = p.unit === 'mm' ? 96 / 25.4 : 96;
      return { w: p.w * k, h: p.h * k };
    }
    function applyZoom() {
      const page = pageSize();
      const box = stage.getBoundingClientRect();
      if (fitting && box.width > 40) {
        const pad = 24;
        zoom = Math.max(10, Math.min(200, Math.floor(((Math.min((box.width - pad) / page.w, (box.height - pad) / page.h)) * 100) / 5) * 5));
        S.print.zoom = 0;
      }
      const k = zoom / 100;
      const doc = frame.contentDocument;
      const tall = doc && doc.body ? Math.max(doc.body.scrollHeight, page.h) : page.h;
      frame.style.width = page.w + 'px';
      frame.style.height = tall + 'px';
      frame.style.transform = `scale(${k})`;
      holder.style.width = page.w * k + 'px';
      holder.style.height = tall * k + 'px';
      slider.value = zoom;
      zoomLabel.textContent = zoom + '%';
      fitBtn.classList.toggle('is-on', fitting);
    }
    const draw = () => {
      if (!qs.length) { preview.replaceChildren(h('p', { class: 'empty' }, 'Add some questions on the Build a quiz tab first.')); return; }
      const html = buildSheet();
      preview.replaceChildren(h('div', { class: 'print-head' },
        h('span', { class: 'mini-label' }, 'Preview'),
        h('span', { class: 'help' }, `${qs.length} question${qs.length === 1 ? '' : 's'} · ${MQ.paperOf(S.print.paper).label}`),
        h('div', { class: 'zoom-bar' }, zoomOut, slider, zoomIn, zoomLabel, fitBtn)), stage);
      const doc = frame.contentDocument;
      doc.open(); doc.write(html); doc.close();
      // The sheet's height is only known once it has laid out.
      applyZoom();
      const settle = () => applyZoom();
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(settle, settle);
      setTimeout(settle, 120);
      setTimeout(settle, 600);
    };
    const changed = () => { savePrint(); draw(); };

    const paperSeg = grp('Paper size', seg('pr-paper', MQ.PAPERS.map((p) => ({ v: p.id, label: p.label })), S.print.paper, (v) => { S.print.paper = v; changed(); }));
    const dateIn = textIn('pr-date', S.print.date, 10, 'mm/dd/yyyy', (v) => {
      S.print.date = v;
      dateIn.classList.toggle('is-invalid', !!v.trim() && !MQ.validDate(v));
      if (MQ.validDate(v)) changed(); else savePrint();
    });
    const courseIn = textIn('pr-course', S.print.course, 60, 'e.g. Music Theory I', (v) => { S.print.course = v; changed(); });
    const printBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => doPDF(printBtn) }, 'Save as PDF');
    const wordBtn = h('button', { type: 'button', class: 'btn', onclick: () => doWord(wordBtn) }, 'Export Word (.docx)');
    form.append(
      h('div', { class: 'card-head' }, h('div', null, h('span', { class: 'eyebrow' }, 'For teachers'), h('h1', { class: 'display' }, 'Print the quiz'))),
      h('p', { class: 'lede' }, 'A paper copy with a blank for the point value beside every question, room to answer, and a QR code in the footer that opens the quiz.'),
      h('div', { class: 'row2' },
        fld('Quiz title', textIn('pr-title', S.cfg.title, 60, 'Quiz title', (v) => { S.cfg.title = v; saveDraft(); draw(); }), 'Copied from the quiz.'),
        fld('Teacher', textIn('pr-teacher', S.cfg.teacher, 40, 'Teacher', (v) => { S.cfg.teacher = v; saveDraft(); draw(); }), 'Copied from the quiz.')),
      h('div', { class: 'row2' },
        fld('Course', courseIn, 'Printed under the title.'),
        fld('Date created', dateIn, 'mm/dd/yyyy — today’s date unless you change it.')),
      paperSeg,
      h('div', { class: 'row2' },
        grp('Staff height', seg('pr-staff', [{ v: 1, label: '1 in' }, { v: 1.25, label: '1¼ in' }, { v: 1.5, label: '1½ in' }], S.print.staffH, (v) => { S.print.staffH = v; changed(); }), 'Never smaller than an inch.'),
        grp('QR code', seg('pr-qr', [{ v: 0.5, label: '½ in' }, { v: 0.75, label: '¾ in' }, { v: 1, label: '1 in' }], S.print.qr, (v) => { S.print.qr = v; changed(); }), 'Printed in the footer with the quiz ID.')),
      h('div', { class: 'btn-row' }, printBtn, wordBtn),
      status);

    // Measure with the same fonts the PDF uses, so lines wrap where they will print.
    function pdfMeasurer() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const FACE = { F1: '"Times New Roman", Times, serif', F2: 'bold "Times New Roman", Times, serif',
        F3: 'italic "Times New Roman", Times, serif', F4: 'Helvetica, Arial, sans-serif', F5: 'bold Helvetica, Arial, sans-serif' };
      return (str, size, font) => {
        ctx.font = `${size}px ${FACE[font] || FACE.F1}`.replace(/^(\d)/, '$1').replace(/^(.*?)px (bold|italic) /, '$2 $1px ');
        return ctx.measureText(str).width;
      };
    }

    async function doPDF(btn) {
      if (!qs.length) { toast('There are no questions to print'); return; }
      btn.disabled = true;
      status.textContent = 'Building the PDF…';
      try {
        MQ.pdfMeasurer = pdfMeasurer();
        const model = MQ.printModel(qs, S.cfg);
        // The PDF draws the staves as line work, so it uses the drawn clefs, not the music font.
        const art = new Map();
        model.forEach((it) => { if (it.staff) art.set(it.q, exportArt(it.q, { height: S.print.staffH, drawnClefs: true })); });
        const bytes = MQ.pdfSheet(model, printInfo(), printOpts({ qrPayload: printPayload() }), (q) => art.get(q) || null);
        const res = await saveFile(fileStem() + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
        status.textContent = res === 'saved' ? 'PDF saved.' : res === 'declined' ? 'Save cancelled.' : 'That download didn’t go through.';
      } catch (e) {
        status.textContent = 'Something went wrong building the PDF: ' + (e && e.message ? e.message : e);
      }
      btn.disabled = false;
    }

    async function doWord(btn) {
      if (!qs.length) { toast('There are no questions to print'); return; }
      btn.disabled = true;
      status.textContent = 'Building the Word document…';
      try {
        const model = MQ.printModel(qs, S.cfg);
        const byQuestion = [];
        for (const it of model) {
          if (!it.staff) { byQuestion.push(null); continue; }
          const pics = [];
          for (const art of exportArt(it.q, { height: S.print.staffH, drawnClefs: true })) {
            pics.push({ bytes: await svgToPNG(art.markup, art.wIn, art.hIn, 200), wIn: art.wIn, hIn: art.hIn });
          }
          byQuestion.push(pics);
        }
        const qr = MQ.qrPNG(printPayload(), { scale: 4, ecc: 'L' });
        const bytes = MQ.docxBytes(model, printInfo(), printOpts(), { byQuestion, qr: { bytes: qr.bytes, wIn: S.print.qr } });
        const res = await saveFile(fileStem() + '.docx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        status.textContent = res === 'saved' ? 'Word document saved.' : res === 'declined' ? 'Save cancelled.' : 'That download didn’t go through.';
      } catch (e) {
        status.textContent = 'Something went wrong building the document: ' + (e && e.message ? e.message : e);
      }
      btn.disabled = false;
    }

    draw();
    // Re-fit when the window changes size.
    if (S.printObserver) S.printObserver.disconnect();
    if (window.ResizeObserver) {
      S.printObserver = new ResizeObserver(() => { if (S.view === 'print') applyZoom(); });
      S.printObserver.observe(stage);
    }
  }


  // ---------- results page: one student's report from a link, for SpeedGrader ----------
  function hashParams() {
    const out = {};
    decodeURIComponent(location.hash.slice(1)).split('&').forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
    });
    return out;
  }
  function renderResults(main) {
    const p = hashParams();
    const wrap = h('div', { class: 'grade results-page' });
    main.append(wrap);
    const note = (title, ...text) => wrap.append(h('section', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Clefwork results'), h('h1', { class: 'display' }, title), h('p', { class: 'lede' }, ...text)));
    if (!p.r) { note('No results here', 'This page shows a student’s results. Open it from the results link the student submitted.'); return; }
    let r;
    try { r = MQ.decodeReport(p.r); } catch (e) { note('This results link is damaged', e.message, ' Ask the student to copy the link again.'); return; }
    let fromLink = null, linkError = null;
    if (p.q) {
      try { const cfg = MQ.decodeQuiz(p.q); fromLink = { id: MQ.quizId(p.q), code: p.q, cfg, qs: MQ.generateQuiz(cfg), source: 'link' }; }
      catch (e) { linkError = e.message; }
    }
    // The quiz from this device (built or shared here) is trusted with the answer key; the one in
    // the link is used for the questions.
    const local = knownQuizzes().find((q) => q.id === r.quizId) || null;
    const mismatch = fromLink && fromLink.id !== r.quizId;
    r.quiz = local || (fromLink && !mismatch ? fromLink : null);
    r.sealOk = r.quiz ? r.verifySeal(r.quiz.cfg) : null;
    r.stats = MQ.reportStats(r);
    const showKey = !!(r.quiz && (local || r.quiz.cfg.flags.feedback));
    if (mismatch) wrap.append(h('section', { class: 'card notice is-bad' }, h('h3', null, 'The quiz in this link doesn’t match the report'), h('p', null, 'The score is shown, but the questions can’t be — the link may have been edited.')));
    if (linkError) wrap.append(h('section', { class: 'card notice is-bad' }, h('h3', null, 'The quiz part of this link is damaged'), h('p', null, linkError)));
    wrap.append(reportDetail(r, { showKey, openAnswers: true, canvas: true }));
    wrap.append(h('p', { class: 'fine results-foot' },
      showKey ? 'Answers are marked against the quiz saved on this device.'
        : ['Correct answers are left off shared results. On the computer you built the quiz on, ',
          SITE ? h('a', { href: gradeLink(p.r), target: '_blank', rel: 'noopener' }, 'open this report in the grade checker') : 'open this report in the grade checker',
          ' to see them.']));
  }

  // ---------- shell ----------
  const VIEWS = { build: renderBuild, take: renderTake, grade: renderGrade, print: renderPrint, practice: (main) => (S.slots.practice ? renderTake(main) : renderBuild(main)) };
  function go(view) {
    if (MODE === 'canvas') view = 'take';             // the Canvas page only takes quizzes
    if (STUDENT && (view === 'grade' || view === 'print')) view = 'build';
    if (ANALYSIS && view === 'print') view = 'build';
    S.slot = view === 'practice' ? 'practice' : 'take';
    stopTicker();
    MQ.Audio.stop();
    S.view = view;
    document.querySelectorAll('.nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.view === view || (view === 'practice' && b.dataset.view === 'build') ? 'page' : 'false'));
    const main = document.getElementById('main');
    main.replaceChildren();
    main.dataset.view = view;
    VIEWS[view](main);
    try { history.replaceState(null, '', '#' + view); } catch (e) { /* sandboxed */ }
    store.set('view', view);
  }
  function init() {
    if (KEYS) {
      // Clefwork Keys: the same tabs, its own name.
      const name = document.querySelector('.brand-name');
      if (name) name.textContent = 'Clefwork Keys';
      document.title = 'Clefwork Keys';
    }
    if (ANALYSIS) {
      // Clefwork Analysis: its own name, and no Print tab — the quiz lives on the picture.
      const name = document.querySelector('.brand-name');
      if (name) name.textContent = 'Clefwork Analysis';
      document.title = 'Clefwork Analysis';
      const pr = document.querySelector('.nav [data-view="print"]');
      if (pr) pr.remove();
      document.querySelector('.flow').replaceChildren(
        h('li', null, h('b', null, '1'), ' Upload a picture of the music and box the chords to analyse'),
        h('li', null, h('b', null, '2'), ' Students type Roman numerals or chord symbols beside the music'),
        h('li', null, h('b', null, '3'), ' Students send back a report code — no accounts, no server'));
      if (S.cfg.analysis && S.cfg.analysis.img) {
        loadScore(S.cfg.analysis.img.hash).then((sc) => {
          S.aimg = sc || false;           // false: this device no longer has the draft's picture
          if (S.view === 'build') go('build');
        });
      }
      // A picture pasted anywhere on the Build tab is the score.
      document.addEventListener('paste', (e) => {
        if (S.view !== 'build') return;
        const f = Array.from((e.clipboardData && e.clipboardData.files) || []).find((x) => /^image\//.test(x.type));
        if (f) { e.preventDefault(); takePicture(f); }
      });
    }
    if (RHYTHM) {
      // Clefwork Rhythm: its own name and steps.
      const name = document.querySelector('.brand-name');
      if (name) name.textContent = 'Clefwork Rhythm';
      document.title = 'Clefwork Rhythm';
      document.querySelector('.flow').replaceChildren(
        h('li', null, h('b', null, '1'), ' Write rhythms of one to four measures, in one part or two'),
        h('li', null, h('b', null, '2'), ' Students listen and write what they hear on a one-line staff'),
        h('li', null, h('b', null, '3'), ' Students send back a report code — no accounts, no server'));
    }
    ['piano', 'oboe', 'click'].forEach((v) => MQ.Audio.setVolume(v, S.listen.vol[v]));
    if (!STUDENT && MODE !== 'results') {
      // Teacher tools lead back to the landing page, where the other tools are.
      const mast = document.querySelector('.mast');
      mast.insertBefore(h('a', { class: 'home-link', href: HOME, title: 'Choose another Clefwork tool' }, '← All tools'), mast.querySelector('.nav'));
    }
    if (MODE === 'results' || MODE === 'canvas') {
      // Single-purpose pages: no tabs, and the logo doesn't lead anywhere.
      document.querySelector('.nav').remove();
      const brand = document.querySelector('.brand');
      if (brand) brand.removeAttribute('href');
    }
    if (MODE === 'results') {
      document.querySelector('.flow').remove();
      document.title = 'Clefwork results';
      renderResults(document.getElementById('main'));
      window.addEventListener('hashchange', () => { const m = document.getElementById('main'); m.replaceChildren(); renderResults(m); });
      return;
    }
    // The builder always computes the current quiz code so other tabs can use it.
    S.code = sumCounts(S.cfg) ? MQ.encodeQuiz(S.cfg) : '';
    restoreAttempt();
    if (STUDENT) {
      // Student version: Practice + Take a quiz; no grading tab and no quiz codes to share.
      const nav = document.querySelector('.nav');
      if (MODE !== 'canvas') {
        nav.querySelector('[data-view="build"]').textContent = 'Practice';
        nav.querySelector('[data-view="grade"]').remove();
        nav.querySelector('[data-view="print"]').remove();
      }
      document.querySelector('.flow').replaceChildren(
        h('li', null, h('b', null, '1'), ' Choose what to practise and check your answers as you go'),
        h('li', null, h('b', null, '2'), ' For a quiz from your teacher, open ', h('strong', null, 'Take a quiz'), ' and paste the code'),
        h('li', null, h('b', null, '3'), ' When you finish a teacher’s quiz, send back your report code'));
      if (MODE === 'canvas') document.querySelector('.flow').replaceChildren(
        h('li', null, h('b', null, '1'), ' Type your name and take the quiz'),
        h('li', null, h('b', null, '2'), ' Copy your results link'),
        h('li', null, h('b', null, '3'), ' Paste it into the Canvas assignment as a Website URL'));
    }
    document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    let view = 'build';
    const hash = decodeURIComponent(location.hash.slice(1));
    const m = hash.match(/^(take|grade)=([\s\S]+)$/);
    if (m && m[1] === 'take') {
      // Anything after the code is named: &img=… carries an Analysis quiz's picture.
      const [codePart, ...more] = m[2].split('&');
      const extra = {};
      more.forEach((kv) => { const i = kv.indexOf('='); if (i > 0) extra[kv.slice(0, i)] = kv.slice(i + 1); });
      const clean = codePart.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      if (!(S.take && S.take.code === clean)) openQuiz(codePart, { img: extra.img });
      else if (extra.img && S.take.cfg.analysis && S.take.cfg.analysis.img) {
        // The same quiz, already under way: keep the link's picture in case this device lost it.
        const want = S.take.cfg.analysis.img.hash;
        try { if (MQ.hashOfData(extra.img) === want) keepScore(extra.img, want); } catch (e) { /* a damaged link changes nothing */ }
      }
      view = 'take';
    } else if (m && m[1] === 'grade' && !STUDENT) { S.grade.input = m[2]; view = 'grade'; }
    else if (VIEWS[hash]) view = hash;
    else if (S.take && S.take.started && !S.take.done) view = 'take';
    go(view);
    if (document.fonts && document.fonts.load) {
      const fail = () => { if (MQ.clefFont !== false) { MQ.clefFont = false; go(S.view); } };
      document.fonts.load('48px "Noto Music"', '\u{1D11E}').then((list) => { if (list && list.length) MQ.clefFont = true; else fail(); }, fail);
      setTimeout(() => { if (MQ.clefFont === undefined && !document.fonts.check('48px "Noto Music"', '\u{1D11E}')) fail(); }, 4000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
