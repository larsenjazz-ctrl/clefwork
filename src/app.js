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
    el.style.top = frameFitted ? nearTap(64) + 'px' : '';
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
    if (key === 'analysis') return Math.min(cfg.counts.analysis || 0, MQ.analysisRegionCount(cfg.analysis));
    if (key === 'rhythm') {
      const b = MQ.rhythmSettings(cfg.rhythm);
      return b.auto.on ? b.auto.count : Math.min(cfg.counts.rhythm || 0, b.examples.length);
    }
    if (key === 'melody') {
      const b = MQ.melodySettings(cfg.melody);
      return b.auto.on ? b.auto.count : Math.min(cfg.counts.melody || 0, b.examples.length);
    }
    if (key === 'cgtable' || key === 'cgtritone' || key === 'cgphrase') return Math.min(MQ.GRAPH_MAX, cfg.counts[key] || 0);
    if (MQ.TERM_COUNTS.includes(key)) return Math.min(key === 'tmhdyn' || key === 'tmhtempo' ? MQ.TERMS_HEAR_MAX : MQ.TERMS_MAX, cfg.counts[key] || 0);
    const list = key === 'custom' ? cfg.custom || [] : cfg.voicings || [];
    const n = cfg.counts[key] == null ? list.length : cfg.counts[key];
    return Math.min(n, list.length);
  };
  const sumCounts = (cfg) => MQ.BUILT_IN.reduce((s, t) => s + (cfg.counts[t.id] || 0), 0) + listCount(cfg, 'custom') + listCount(cfg, 'voicing') + listCount(cfg, 'vprog') + listCount(cfg, 'progression')
    + listCount(cfg, 'keys') + listCount(cfg, 'analysis') + listCount(cfg, 'rhythm') + listCount(cfg, 'melody')
    + Math.min(MQ.DEGREE_MAX, cfg.counts.degree || 0) + graphCount(cfg) + termCount(cfg);
  // Clefwork Chord Graph: its tables and phrases.
  const graphCount = (cfg) => listCount(cfg, 'cgtable') + listCount(cfg, 'cgtritone') + listCount(cfg, 'cgphrase');
  // Clefwork Terms: all five kinds of question, and the ones that are heard.
  const termCount = (cfg) => MQ.termCount(cfg);
  const termHeard = (cfg) => listCount(cfg, 'tmhdyn') + listCount(cfg, 'tmhtempo');
  const usesGrand = (cfg) => (listCount(cfg, 'voicing') > 0 || listCount(cfg, 'vprog') > 0)
    || (listCount(cfg, 'progression') > 0 && cfg.progs.some((e) => e.staff === 'grand'))
    || ((cfg.counts.chord || 0) > 0 && !!(cfg.chordStaff & 4) && !(cfg.v && cfg.v < 7));
  const onlyKeys = (cfg) => !!(cfg.counts.keys && sumCounts(cfg) === cfg.counts.keys);
  const onlyAnalysis = (cfg) => !!(listCount(cfg, 'analysis') && sumCounts(cfg) === listCount(cfg, 'analysis'));
  const onlyRhythm = (cfg) => !!(listCount(cfg, 'rhythm') && sumCounts(cfg) === listCount(cfg, 'rhythm'));
  const onlyMelody = (cfg) => !!(listCount(cfg, 'melody') && sumCounts(cfg) === listCount(cfg, 'melody'));
  const onlyGraph = (cfg) => !!(graphCount(cfg) && sumCounts(cfg) === graphCount(cfg));
  const onlyTerms = (cfg) => !!(termCount(cfg) && sumCounts(cfg) === termCount(cfg));
  // Clefwork Rhythm quizzes are rhythmic dictation or rhythm grids.
  const gridQuiz = (cfg) => MQ.rhythmSettings(cfg.rhythm).task === 'grid';
  // A rhythm grid's rhythm is read, heard, or both.
  const gridHow = (cfg) => ['read', 'heard', 'read and heard'][MQ.rhythmSettings(cfg.rhythm).grid.show];
  const clefsText = (cfg) => onlyTerms(cfg) ? (termHeard(cfg) ? 'multiple choice, read and heard' : 'multiple choice') : onlyGraph(cfg) ? 'chord symbols and Roman numerals' : onlyMelody(cfg) ? 'heard, then written on the staff' : onlyRhythm(cfg) ? (gridQuiz(cfg) ? `${gridHow(cfg)}, then shown on a grid` : 'heard, then written on a one-line staff') : onlyAnalysis(cfg) ? 'answered beside a picture of the score' : onlyKeys(cfg) ? 'grand staff, note names & piano' : [cfg.clefs & 1 ? 'treble' : null, cfg.clefs & 2 ? 'bass' : null].filter(Boolean).join(' & ') + ' clef' + (usesGrand(cfg) ? ' + grand staff' : '');
  const clonePlaced = (pl) => (pl ? pl.map((c) => (c || []).map((p) => ({ ...p }))) : null);
  // The student version (practice + take a quiz, no quiz codes shown) is the same app with this flag set.
  const STUDENT = !!window.CLEFWORK_STUDENT;
  // Where this app is published, so links work even from inside the artifact viewer.
  // Served from this computer (a test before publishing), links stay on this computer instead.
  const LOCAL = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const SITE = LOCAL ? location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '') : (window.CLEFWORK_BASE || '').replace(/[^/]*$/, '');
  const quizLink = (code) => (SITE ? SITE + 'student.html#take=' + withScore(code) : '');
  // The Canvas edition: a page that only takes the quiz, and a results page that stands alone.
  const MODE = window.CLEFWORK_MODE || '';
  const KEYS = MODE === 'keys';                      // Clefwork Keys: the piano and note-name app
  const ANALYSIS = MODE === 'analysis';              // Clefwork Analysis: questions on a picture of the score
  const RHYTHM = MODE === 'rhythm';                  // Clefwork Rhythm: rhythmic dictation
  const MELODY = MODE === 'melody';                  // Clefwork Melody: melodic dictation
  const GRAPH = MODE === 'graph';                    // Clefwork Chord Graph: chord tables and phrases
  const TERMS = MODE === 'terms';                    // Clefwork Terms: dynamics, tempo and instruments, read and heard
  const DICTATION = RHYTHM || MELODY;
  const DRAFT = KEYS ? 'draft-keys' : ANALYSIS ? 'draft-analysis' : RHYTHM ? 'draft-rhythm' : MELODY ? 'draft-melody' : GRAPH ? 'draft-graph' : TERMS ? 'draft-terms' : 'draft';
  // An Analysis quiz's pictures travel in its links, after the code: #take=CODE&img=…, and &img2=…
  // and so on for a quiz on more than one score.
  const withScore = (code) => {
    const base = MQ.normalize(code);
    if (!(ANALYSIS && S.code && base === MQ.normalize(S.code))) return base;
    return base + MQ.analysisScores(S.cfg.analysis).map((sc, k) => { const d = sc.img && scoreData(sc.img.hash); return d ? `&img${k ? k + 1 : ''}=${d}` : ''; }).join('');
  };
  const canvasLink = (code) => (SITE ? SITE + 'take.html#take=' + withScore(code) : '');
  const resultsLink = (report, quiz) => (SITE
    ? SITE + 'results.html#r=' + MQ.normalize(report) + (quiz ? '&q=' + MQ.normalize(quiz) : '') : '');
  const gradeLink = (report, quiz) => (SITE ? SITE + 'clefwork.html#grade=' + MQ.normalize(report) + (quiz ? '&q=' + MQ.normalize(quiz) : '') : '');
  // Where the landing page lives: beside a page of the site, or the site's for a copy in the artifact viewer.
  const HOME = /\.html$/.test(location.pathname) || !SITE ? 'index.html' : SITE;
  const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();

  // ---------- embedded in another page (Canvas) ----------
  // The hosted pages can sit in an iframe on a Canvas page. Canvas resizes an iframe that asks with an
  // lti.frameResize message, so the whole quiz shows without being cut off or scrolling inside the frame.
  // Once the frame fits the quiz, messages and dialogs open near the last tap: the frame's own middle or
  // bottom can be far off screen. (Claude artifacts are framed too, but aren't the hosted site.)
  const EMBEDDED = inFrame && !!SITE && location.href.indexOf(SITE) === 0;
  const LAUNCH_HASH = location.hash;          // the link the frame opened, before the app tidies it
  let frameFitted = false, lastTapY = 0, sentHeight = 0;
  function fitFrame() {
    const want = Math.max(640, Math.ceil(document.body.offsetHeight) + 8);
    if (Math.abs(want - sentHeight) < 4) return;
    sentHeight = want;
    try { window.parent.postMessage({ subject: 'lti.frameResize', height: want }, '*'); } catch (e) { /* no parent to ask */ }
    setTimeout(() => {
      if (Math.abs(window.innerHeight - want) < 4 && !frameFitted) { frameFitted = true; document.documentElement.classList.add('is-fitted'); }
    }, 500);
  }
  if (EMBEDDED) {
    if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(fitFrame)).observe(document.body);
    document.addEventListener('pointerdown', (e) => { lastTapY = e.pageY; }, true);
    document.addEventListener('focusin', (e) => { if (e.target.getBoundingClientRect) lastTapY = e.target.getBoundingClientRect().top + window.scrollY; });
  }
  // Where a message or dialog should appear in a frame that has grown to fit the quiz.
  const nearTap = (above) => Math.max(12, lastTapY - above);
  // The same quiz in its own browser tab — on tablets the Canvas app can't always show the keyboard
  // in an embedded page. A tab has its own storage, so the quiz starts fresh there.
  function ownTabHref() {
    const base = location.href.split('#')[0];
    const t = S.take;
    const launch = LAUNCH_HASH.match(/^#take=([^&]+)/);
    const launched = launch ? decodeURIComponent(launch[1]).replace(/[^0-9A-Za-z]/g, '').toUpperCase() : '';
    if (t && !t.practice && t.code && t.code !== launched) return base + '#take=' + t.code;
    return base + LAUNCH_HASH;
  }
  const ownTabLink = (cls, text) => h('a', { class: cls, href: ownTabHref(), target: '_blank', rel: 'noopener' }, text || 'Open in its own tab ↗');

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
  function melodyDefault() {
    const c = rhythmDefault();
    c.title = 'Melodic Dictation';
    c.melody = { examples: [], auto: { on: true } };       // melodies made automatically, to start with
    return c;
  }
  // A worksheet set to start from: two diatonic tables, a tritone graph and two phrases (one major,
  // one minor), in the order the worksheets come.
  function graphDefault() {
    const c = MQ.defaultConfig();
    Object.keys(c.counts).forEach((k) => (c.counts[k] = 0));
    Object.assign(c.counts, { cgtable: 2, cgtritone: 1, cgphrase: 2 });
    c.title = 'Chord Graph';
    c.flags.shuffle = false;
    c.flags.partial = true;
    c.graph = MQ.graphSettings(null);
    return c;
  }
  // A quiz of every kind to start from: the terms first, then the listening, in the order the tabs come.
  function termsDefault() {
    const c = MQ.defaultConfig();
    Object.keys(c.counts).forEach((k) => (c.counts[k] = 0));
    Object.assign(c.counts, { tmdyn: 5, tmtempo: 5, tminst: 5, tmvocab: 6, tmhdyn: 3, tmhtempo: 3 });
    c.title = 'Musical Terms';
    c.flags.shuffle = false;
    c.terms = MQ.termSettings(null);
    return c;
  }
  function loadDraft() {
    const d = store.get(DRAFT, null);
    const base = KEYS ? keysDefault() : ANALYSIS ? analysisDefault() : RHYTHM ? rhythmDefault() : MELODY ? melodyDefault() : GRAPH ? graphDefault() : TERMS ? termsDefault() : MQ.defaultConfig();
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
    rhEx: 0, mlEx: 0, mlValue: 2,
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
  // o.choiceLabel (optional) draws a choice's label; o.choiceClass adds to the group's class.
  function choiceGroup(q, o) {
    const g = h('div', { class: 'choices' + (o.choiceClass ? ' ' + o.choiceClass : ''), role: 'radiogroup', 'aria-label': 'Answer choices' });
    q.choices.forEach((c, i) => {
      let cls = 'choice';
      if (o.reveal) { if (i === q.answer) cls += ' is-right'; else if (i === o.response) cls += ' is-wrong'; }
      const b = h('button', { type: 'button', class: cls, role: 'radio', 'aria-checked': String(o.response === i), disabled: o.locked || null, onclick: () => {
        g.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        if (o.onResponse) o.onResponse(i);
      } }, h('span', { class: 'choice-key', 'aria-hidden': 'true' }, 'ABCDEF'[i]), h('span', null, o.choiceLabel ? o.choiceLabel(c, i) : c));
      g.append(b);
    });
    return g;
  }
  function resultLine(q, cfg, response) {
    const frac = MQ.gradeQuestion(q, response, cfg);
    if (MQ.isGraph(q)) {
      // The table or phrase itself shows what's right; say how much.
      const c = MQ.compareGraph(q, response, cfg), what = q.type === 'cgphrase' ? 'points' : 'answers';
      if (frac === 1) return h('p', { class: 'result is-good', role: 'status' }, h('strong', null, 'Correct.'), q.type === 'cgphrase' ? ' Every measure and rule checks out.' : ' Every box is right.');
      return h('p', { class: 'result is-bad', role: 'status' }, h('strong', null, frac > 0 ? `Partly right — ${fmtPts(c.notes - c.wrong)} of ${c.notes} ${what}.` : 'Not quite.'),
        q.type === 'cgphrase' ? ' The marks show which measures and rules need another look.' : ' The right answers are under the boxes marked in red or amber.');
    }
    const ans = MQ.describeAnswer(q, cfg);
    if (frac === 1) return h('p', { class: 'result is-good', role: 'status' }, h('strong', null, 'Correct.'), ' ', ans);
    let lead = 'Not quite.';
    if (frac > 0 && q.type === 'analysis' && q.an.ask === 'key') {
      lead = MQ.analysisKeyPartRight(q, 'b', response) ? 'Partly right — the right chord, but not the new key.' : 'Partly right — the new key, but not the chord where it changes.';
    } else if (frac > 0 && q.type === 'analysis' && q.an.ask === 'nht') {
      const c = MQ.compareNHT(q, response);
      lead = `Partly right — ${c.right} of ${c.total}${c.extra ? `, less ${c.extra} extra` : ''}.`;
    } else if (frac > 0 && q.type === 'analysis') {
      lead = 'Partly right — 1 of 2 answers.';
    } else if (frac > 0 && q.type === 'figprog') {
      const need = q.figuredList.length;
      lead = `Partly right — ${Math.round(frac * need)} of ${need} chords.`;
    } else if (frac > 0 && q.type === 'progression') {
      const need = MQ.progAnswerCount(q);
      lead = `Partly right — ${Math.round(frac * need)} of ${need} answers.`;
    } else if (frac > 0 && q.type === 'degree') {
      const need = q.deg.notes.length;
      lead = `Partly right — ${Math.round(frac * need)} of ${need} notes.`;
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
  // ---------- the quality sign of a Roman numeral ----------
  // Every box that asks for a Roman numeral has a menu of signs: ° (diminished and fully diminished),
  // ø (half-diminished, the same chord as mi7♭5) and + (augmented). The sign goes straight after the
  // numeral — viiø7, vii°7/V — so the answer stored and graded is the text a student could have typed.
  const RN_MARKS = [{ v: '', label: '— no sign' }, { v: '°', label: '° dim' }, { v: 'ø', label: 'ø half-dim' }, { v: '+', label: '+ aug' }];
  const RN_HEAD = /^(\s*[b#♭♯]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))(ø|Ø|\/o|°|º|˚|dim|o|\+|aug)?/;
  const markOf = (t) => {
    const m = String(t || '').match(RN_HEAD);
    return !m || !m[2] ? '' : /ø|Ø|\/o/.test(m[2]) ? 'ø' : /\+|aug/.test(m[2]) ? '+' : '°';
  };
  const withoutMark = (t) => String(t || '').replace(RN_HEAD, '$1');
  const withMark = (t, mark) => (RN_HEAD.test(String(t || '')) ? String(t).replace(RN_HEAD, '$1' + (mark || '')) : String(t || ''));
  // The sign menu for a numeral box. Call it before adding the box's own input listener. It shows the
  // stored answer's sign in the menu and the rest in the box; a sign typed in the box (o, /o, °) sets the
  // menu, and moves out of the box when it loses focus. full() is the answer with the sign in place.
  function markPicker(id, inp, onChange) {
    const stored = inp.value;
    inp.value = withoutMark(stored);
    let typed = false;                     // the menu's sign came from the box, not from the menu
    const sel = selectEl(id, RN_MARKS, markOf(stored), () => { typed = false; inp.value = withoutMark(inp.value); onChange(); });
    sel.classList.add('rn-mark');
    sel.setAttribute('aria-label', 'Chord quality sign');
    sel.title = 'Chord quality sign: ° diminished or fully diminished, ø half-diminished (mi7♭5), + augmented';
    inp.addEventListener('input', () => {
      const m = markOf(inp.value);
      if (m) { sel.value = m; typed = true; } else if (typed) { sel.value = ''; typed = false; }
    });
    inp.addEventListener('blur', () => { if (markOf(inp.value)) { inp.value = withoutMark(inp.value); typed = false; onChange(); } });
    return { sel, full: () => withMark(inp.value, sel.value) };
  }
  // Typed numeral + sign menu + figure dropdown. Typing "V65" fills the dropdown when the box loses focus.
  function figuredInput(id, value, o, onChange) {
    const cur = { text: (value && value.text) || '', fig: (value && value.fig) || '' };
    const inp = h('input', { type: 'text', id, class: 'fig-in', placeholder: 'V', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 10, 'aria-label': 'Roman numeral' });
    inp.value = cur.text;
    const mark = markPicker(id + '-mark', inp, () => fire());
    const sel = selectEl(id + '-fig', MQ.FIGURES.map((f) => ({ v: f.fig, label: f.label })), cur.fig, (v) => { cur.fig = v; fire(); });
    sel.setAttribute('aria-label', 'Figured bass');
    sel.classList.add('fig-sel');
    const preview = h('span', { class: 'fig-preview' });
    const fire = () => { cur.text = mark.full(); draw(); onChange({ text: cur.text, fig: cur.fig }); };
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
      // A figure typed into the box moves the dropdown to match as you type.
      const digits = (inp.value.match(/[\d/]+\s*$/) || [''])[0].replace(/[\s/]/g, '');
      if (digits) {
        const fig = digits === '63' ? '6' : digits === '53' ? '' : digits === '2' ? '42' : digits;
        if (MQ.FIGURES.some((f) => f.fig === fig)) { cur.fig = fig; sel.value = fig; sel.classList.remove('is-invalid'); }
        else sel.classList.add('is-invalid'); // not one of the six figures
      } else sel.classList.remove('is-invalid');
      fire();
    });
    inp.addEventListener('blur', () => {
      // Tidy "V65" into the numeral box plus the dropdown.
      const parsed = MQ.parseFigured(mark.full());
      if (parsed && /\d/.test(inp.value)) {
        cur.fig = parsed.figure;
        inp.value = inp.value.replace(/[\d/]+\s*$/, '');
        sel.value = cur.fig;
        fire();
      }
    });
    if (o.locked) { inp.disabled = true; sel.disabled = true; mark.sel.disabled = true; }
    draw();
    return h('div', { class: 'fig-answer' }, h('div', { class: 'fig-row' }, inp, mark.sel, sel), preview);
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
      const grid = h('div', { class: 'fig-answers' + (list.length > 1 ? ' is-multi' : ''), style: `--n:${list.length}` });
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
        const send = () => { if (o.onResponse) o.onResponse({ r: resp.r.slice(), s: resp.s.slice() }); };
        const mark = k === 'r' ? markPicker(`pg-${uid}-m-${i}`, inp, () => { resp.r[i] = mark.full(); send(); }) : null;
        if (o.locked || o.keyMode) { inp.disabled = true; if (mark) mark.sel.disabled = true; }
        if (marks) inp.classList.add(marks[i][k] ? 'is-right' : 'is-wrong');
        inp.addEventListener('input', () => {
          // Chord symbols start with a capital root letter (Roman numerals keep their case — it matters).
          if (k === 's' && /^[a-g]/.test(inp.value)) {
            const at = inp.selectionStart;
            inp.value = inp.value[0].toUpperCase() + inp.value.slice(1);
            try { inp.setSelectionRange(at, at); } catch (e) { /* not focused */ }
          }
          resp[k][i] = mark ? mark.full() : inp.value;
          send();
        });
        cell.append(inp);
        if (mark) cell.append(mark.sel);
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

  // ---------- scale degrees ----------
  // The melody printed on the staff a line at a time, with a menu under every note for its degree.
  // ---------- scale degrees: builder settings ----------
  // What share of each melody's notes get a box: a slider in tens. Clefwork picks the notes at random.
  function degreeShareField(d, changed) {
    const text = (v) => (v >= 100 ? 'Every note' : `${v}% of the notes`);
    const out = h('output', { class: 'dg-share-val', for: 'q-degshare' }, text(d.share));
    const slider = h('input', { type: 'range', id: 'q-degshare', class: 'dg-share', min: 10, max: 100, step: 10, value: d.share });
    slider.addEventListener('input', () => { out.textContent = text(+slider.value); });
    slider.addEventListener('change', () => { d.share = +slider.value; changed(); });
    return h('div', { class: 'fld' },
      h('label', { class: 'mini-label', for: 'q-degshare' }, 'Notes to label'),
      h('div', { class: 'dg-share-row' }, slider, out),
      h('span', { class: 'help' }, 'Clefwork picks that share of each melody’s notes at random (always at least one). Only those notes are numbered and get an answer box; the rest are left for context.'));
  }
  // Scoring: each melody one question, each labelled note a point, or the notes' share of a total.
  function degreeScoreField(d, changed) {
    const outIn = h('input', { type: 'number', id: 'q-degout', min: 1, max: 1000, inputmode: 'numeric', value: d.outOf });
    outIn.addEventListener('change', () => {
      d.outOf = Math.max(1, Math.min(1000, Math.round(+outIn.value || 100)));
      outIn.value = d.outOf;
      changed();
    });
    const outFld = fld('Total points', outIn, 'The score is the share of labelled notes answered correctly, times this total — ready to type into a gradebook.');
    outFld.hidden = d.score !== 'percent';
    return h('div', null,
      grp('Scoring', seg('q-degscore', [{ v: 'question', label: 'Each melody is one question' }, { v: 'notes', label: 'Each note is a point' }, { v: 'percent', label: 'Percent of a total' }],
        d.score, (v) => { d.score = v; outFld.hidden = v !== 'percent'; changed(); }),
      'With note or percent scoring, a melody is worth one point for each labelled note, and any other questions in the quiz count one point each.'),
      outFld);
  }
  // Labels for the notes asked about in measures a … a+n−1: [measure][event] → text, or null.
  function degreeLabels(D, a, n, next) {
    const asked = new Set(D.notes.map((x) => x.m + ':' + x.i));
    return D.layers[0].slice(a, a + n).map((bar, mm) => bar.map((e, i) => (asked.has(a + mm + ':' + i) ? next() : null)));
  }
  const DEG_OPTS = [{ v: '', label: '–' }].concat([1, 2, 3, 4, 5, 6, 7].map((n) => ({ v: String(n), label: String(n) })));
  let dgUid = 0;
  function degreeCard(q, cfg, o) {
    const D = q.deg, uid = ++dgUid, info = MQ.rhythmMeter(D.meter);
    const reveal = !!o.reveal && !o.keyMode;
    const resp = o.keyMode ? D.notes.map((n) => n.deg) : MQ.cleanDegrees(q, o.response);
    const marks = reveal ? MQ.markDegrees(q, resp) : null;
    const wrap = h('div', { class: 'qcard dg-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label,
      h('span', { class: 'q-clef' }, `${MQ.melodyKeyName(D.key)} · ${info.label} · ${MQ.clefLabel(D.clef)}`)));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (q.hint && !o.locked && !o.keyMode) wrap.append(h('p', { class: 'q-hint' }, q.hint, ' Choose a scale degree for each numbered note.'));
    // Listening, when the quiz allows it: the tonic chord, and the melody at its tempo.
    if (MQ.degreeSettings(cfg.deg).hear && !o.keyMode) {
      const play = (pe) => { if (!MQ.Audio.sequence(pe.events, { total: pe.total })) toast('This browser can’t play sound.', 'bad'); };
      wrap.append(h('div', { class: 'btn-row dg-hear' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => play(MQ.melodyKeyEvents(D, D.tempo)) }, '♪ Hear the key'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => play(MQ.rhythmPlayEvents({ meter: D.meter, measures: D.measures, tempo: D.tempo, parts: 1 }, D.layers)) }, '♪ Hear the melody'),
        h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => MQ.Audio.stop() }, 'Stop')));
    }
    // Two measures a line. Each note is numbered in blue above the staff (n1, n2 …), and each line's
    // answer boxes, numbered the same way, sit in a row under it with room to spare.
    // (One measure a line on a phone, so the numbers stay big enough to read.)
    const per = Math.min(D.measures, window.innerWidth < 600 ? 1 : 2);
    const lines = h('div', { class: 'dg-lines' });
    let j = 0;
    for (let a = 0; a < D.measures; a += per) {
      const n = Math.min(per, D.measures - a);
      const bars = D.layers[0].slice(a, a + n);
      const first = j;
      const labels = degreeLabels(D, a, n, () => 'n' + ++j);
      const model = { meter: D.meter, measures: n, layers: [bars], key: D.key, clef: D.clef };
      const b = MQ.melodyMarkup(model, { first: a, showTime: a === 0, perLine: n, print: true, open: a + n < D.measures, noteLabels: labels });
      const pic = h('div', { class: 'dg-pic' });
      pic.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="mstaff dg-staff" viewBox="0 0 ${Math.round(b.W)} ${b.H}" role="img" aria-label="Measures ${a + 1} to ${a + n}, notes n${first + 1} to n${j}">${b.inner}</svg>`;
      const row = h('div', { class: 'dg-answers' });
      for (let k = first; k < j; k++) {
        const id = `dg-${uid}-${k}`;
        const sel = selectEl(id, DEG_OPTS, resp[k] ? String(resp[k]) : '', (v) => {
          resp[k] = v ? +v : 0;
          if (o.onResponse) o.onResponse(resp.slice());
        });
        sel.setAttribute('aria-label', `Note n${k + 1}, measure ${D.notes[k].m + 1}: scale degree`);
        if (o.locked || o.keyMode) sel.disabled = true;
        const cell = h('div', { class: 'dg-box' }, h('label', { class: 'dg-n', for: id }, 'n' + (k + 1)), sel);
        if (marks) {
          cell.classList.add(marks[k] ? 'is-right' : 'is-wrong');
          if (!marks[k]) cell.append(h('span', { class: 'dg-fix', title: 'The right degree' }, '→ ' + D.notes[k].deg));
        }
        row.append(cell);
      }
      // A line can grow to half again its drawn size; a one-measure line stays in proportion.
      lines.append(h('div', { class: 'dg-line' }, h('div', { class: 'dg-pic-wrap', style: `max-width:${Math.round(b.W * 1.5)}px` }, pic), row));
    }
    wrap.append(lines);
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) wrap.append(resultLine(q, cfg, resp));
    return wrap;
  }
  // ---------- Clefwork Chord Graph: tables and phrases ----------
  // A chord symbol box capitalises its root as you type; a box it can't read turns red.
  const capRoot = (inp) => {
    if (!/^[a-g]/.test(inp.value)) return;
    const at = inp.selectionStart;
    inp.value = inp.value[0].toUpperCase() + inp.value.slice(1);
    try { inp.setSelectionRange(at, at); } catch (e) { /* not focused */ }
  };
  const graphReadable = (kind, text) => !String(text || '').trim() || (kind === 'rn' ? !!MQ.parseAnalysisRoman(text) : !!MQ.readGraphChord(text));
  // Chords to hear from a row of a table, or a phrase: what's printed or typed, left to right, one a
  // beat; anything unreadable is a silent beat.
  const heardChords = (chords) => (chords.some(Boolean) ? chords.map((c) => (c ? MQ.hearChord(c) : [])) : 'Type some chords first — then you can hear them.');
  const cgKeyText = (q) => (q.type === 'cgphrase' ? `${q.ph.mode} key · ${q.ph.bars} measures` : MQ.graphKeyTitle(MQ.makeKey('major', q.cg.fifths)) + (q.cg.rows.some((r) => r.key && r.key.mode === 'minor') ? ' · relative minor' : ''));
  // A table's answer key, with the italic box in italics.
  const graphAnswer = (q) => MQ.describeGraph(q, (t) => h('i', { class: 'cg-italic' }, accText(t)));
  let cgUid = 0;
  function graphTableCard(q, cfg, o) {
    const T = q.cg, uid = ++cgUid;
    const reveal = !!o.reveal && !o.keyMode;
    const resp = T.slots.map((sl, i) => (o.keyMode ? sl.shown : (o.response && o.response[i]) || ''));
    const marks = reveal ? MQ.markGraphTable(q, resp, cfg) : null;
    const wrap = h('div', { class: 'qcard cg-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, cgKeyText(q))));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (q.hint && !o.locked && !o.keyMode) wrap.append(h('p', { class: 'q-hint' }, q.hint));
    const send = () => { if (o.onResponse) o.onResponse(resp.slice()); };
    const box = (i) => {
      const sl = T.slots[i];
      const inp = h('input', { type: 'text', class: 'cg-in' + (sl.kind === 'rn' ? ' is-rn' : ''), id: `cg-${uid}-${i}`, autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 12, 'aria-label': sl.label || `Answer ${i + 1}` });
      inp.value = resp[i];
      const paint = () => inp.classList.toggle('is-invalid', !graphReadable(sl.kind, inp.value));
      inp.addEventListener('input', () => { if (sl.kind !== 'rn') capRoot(inp); resp[i] = inp.value; paint(); send(); });
      if (o.locked || o.keyMode) inp.disabled = true;
      paint();
      // In italics: a tritone substitute that's right though it looks wrong (minor's VI).
      const out = h('span', { class: 'cg-slot' + (sl.italic ? ' is-italic' : ''), title: sl.italic ? 'A perfect fifth above VI: the tritone substitute of V7/ii°, from melodic minor’s raised sixth' : null }, inp);
      if (marks) {
        const m = marks[i], want = T.slots[m.want];
        inp.classList.add(m.credit === 1 ? 'is-right' : m.credit > 0 ? 'is-part' : 'is-wrong');
        if (m.credit < 1) out.append(h('span', { class: 'cg-fix', title: 'The right answer' }, accText(want.shown + (want.other ? ` or ${want.other}` : ''))));
      }
      return out;
    };
    // The chord in a cell, for playing: the printed chord, or the first box's.
    const cellChord = (cell) => MQ.readGraphChord(cell.text != null ? cell.text : resp[cell.slots[0]]);
    const tbody = h('tbody');
    T.rows.forEach((row) => {
      const tr = h('tr', { class: row.play ? 'is-chords' : null });
      if (row.head) {
        const th = h('th', { scope: 'row', class: 'cg-head' + (row.head.sub ? ' is-sub' : '') + (row.head.key ? ' is-key' : ''), rowspan: row.head.span || null });
        th.append(row.head.slots ? box(row.head.slots[0]) : h('span', { class: 'cg-head-text' }, accText(row.head.text)));
        if (row.play) th.append(playButton(() => heardChords(row.cells.map((c) => (c ? cellChord(c) : null))), 0.9, row.name + ' chords', 'play-inline cg-play'));
        tr.append(th);
      }
      row.cells.forEach((cell) => {
        if (!cell) { tr.append(h('td', { class: 'cg-void' })); return; }
        const td = h('td', { class: 'cg-cell' + (cell.slots ? ' is-ans' : ' is-given') });
        if (cell.cap) td.append(h('span', { class: 'cg-cap' }, accText(cell.cap)));
        if (cell.slots) {
          const inner = h('span', { class: 'cg-slots' + (cell.slots.length > 1 ? ' is-two' : '') });
          cell.slots.forEach((i, k) => { if (k) inner.append(h('span', { class: 'cg-or' }, 'or')); inner.append(box(i)); });
          td.append(inner);
        } else td.append(h('span', { class: 'cg-given' }, accText(cell.text)));
        tr.append(td);
      });
      tbody.append(tr);
    });
    wrap.append(h('div', { class: 'cg-scroll' }, h('table', { class: 'cg-table' + (T.kind === 'tritone' ? ' is-tt' : '') }, tbody)));
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), 'shown in the table.'));
    else if (o.reveal) wrap.append(resultLine(q, cfg, resp));
    return wrap;
  }
  // The chord graph, drawn as the phrase worksheet shows it: each column's chord, with what can stand
  // in for it above and below, and arrows the way the chords move.
  function graphStrip(mode) {
    const cols = MQ.GRAPH_VIEW[mode], I = MQ.GRAPH_RN[mode][1];
    const said = cols.map((c) => c[0] + (c.length > 1 ? ` (or ${c.slice(1).join(' or ')})` : '')).join(', then ');
    const strip = h('div', { class: 'cg-graph', role: 'img', 'aria-label': `The chord graph in ${mode}: ${said}.` });
    cols.forEach((c, i) => {
      if (i) strip.append(h('span', { class: 'cg-g-arrow', 'aria-hidden': 'true' }, '→'));
      strip.append(h('span', { class: 'cg-g-col', 'aria-hidden': 'true' },
        h('span', { class: 'cg-g-alt' }, c[1] || ''), h('span', { class: 'cg-g-main' }, c[0]), h('span', { class: 'cg-g-alt' }, c[2] || '')));
    });
    const sub = mode === 'minor' ? 'iv can stand in for ii° or V, and VII for V' : 'IV can stand in for ii or V, and vii° for V';
    const dec = mode === 'minor' ? 'VI or III' : 'vi or iii';
    return h('figure', { class: 'cg-graph-wrap' }, strip,
      h('figcaption', { class: 'cg-graph-cap' }, `Chords move to the right. ${sub}. From ${I}, go anywhere; V can also go to ${dec} (a deceptive cadence), or to ${mode === 'minor' ? 'iv' : 'IV'} and on to ${I}.`));
  }
  function phraseCard(q, cfg, o) {
    const P = q.ph, uid = ++cgUid;
    const reveal = !!o.reveal && !o.keyMode;
    const got = o.response || {};
    const resp = o.keyMode
      ? { r: MQ.graphExample(P), s: P.symbols ? MQ.graphExampleSymbols(P) : [] }
      : { r: Array.from({ length: P.bars }, (_, i) => (got.r && got.r[i]) || ''), s: Array.from({ length: P.bars }, (_, i) => (got.s && got.s[i]) || '') };
    const check = reveal ? MQ.checkPhrase(q, resp, cfg) : null;
    const wrap = h('div', { class: 'qcard cg-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, cgKeyText(q) + (P.symbols ? ` · symbols in ${MQ.graphKeyTitle(P.key)}` : ''))));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (q.hint && !o.locked && !o.keyMode) wrap.append(h('p', { class: 'q-hint' }, q.hint, P.symbols ? ' Type mi or - for minor, o or dim for diminished.' : ''));
    if (P.showGraph) wrap.append(graphStrip(P.mode));
    const send = () => { if (o.onResponse) o.onResponse({ r: resp.r.slice(), s: resp.s.slice() }); };
    const bars = [];
    for (let i = 0; i < P.bars; i++) {
      const cell = h('div', { class: 'cg-bar' }, h('span', { class: 'cg-bar-n' }, String(i + 1)));
      const inp = h('input', { type: 'text', class: 'pg-in cg-rn', id: `cgp-${uid}-${i}`, placeholder: 'RN', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 10, 'aria-label': `Measure ${i + 1}: Roman numeral` });
      inp.value = resp.r[i] || '';
      const mark = markPicker(`cgp-${uid}-m-${i}`, inp, () => { resp.r[i] = mark.full(); send(); });
      inp.addEventListener('input', () => { resp.r[i] = mark.full(); inp.classList.toggle('is-invalid', !graphReadable('rn', resp.r[i])); send(); });
      if (o.locked || o.keyMode) { inp.disabled = true; mark.sel.disabled = true; }
      cell.append(h('div', { class: 'cg-bar-rn' }, inp, mark.sel));
      if (P.symbols) {
        const sy = h('input', { type: 'text', class: 'pg-in cg-sym', id: `cgs-${uid}-${i}`, placeholder: 'Chord', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: 12, 'aria-label': `Measure ${i + 1}: chord symbol` });
        sy.value = resp.s[i] || '';
        sy.addEventListener('input', () => { capRoot(sy); resp.s[i] = sy.value; sy.classList.toggle('is-invalid', !graphReadable('chord', sy.value)); send(); });
        if (o.locked || o.keyMode) sy.disabled = true;
        if (check) {
          const c = check.symbols[i];
          sy.classList.add(c === 1 ? 'is-right' : c > 0 ? 'is-part' : 'is-wrong');
          if (c < 1 && check.chords[i]) cell.append(sy, h('span', { class: 'pg-fix' }, accText(MQ.symbolOf(MQ.chordForNumeral(P.key, check.chords[i])))));
          else cell.append(sy);
        } else cell.append(sy);
      }
      if (check) {
        inp.classList.add(check.bars[i].ok ? 'is-right' : 'is-wrong');
        if (!check.bars[i].ok) cell.append(h('span', { class: 'cg-why' }, check.bars[i].why));
      }
      bars.push(cell);
    }
    // Two lines of measures, as on the worksheet, each between double bars.
    const half = P.bars > 4 ? P.bars / 2 : P.bars;
    const lines = h('div', { class: 'cg-bars' });
    for (let a = 0; a < P.bars; a += half) lines.append(h('div', { class: 'cg-line', style: `--n:${half}` }, ...bars.slice(a, a + half)));
    const typed = () => heardChords(resp.r.map((t) => (String(t || '').trim() ? MQ.parseRoman(t, P.key) : null)));
    wrap.append(h('div', { class: 'pg-hear' }, playButton(typed, 1, 'your phrase', 'play-inline'), h('span', null, `Hear your phrase in ${MQ.graphKeyTitle(P.key)}`)), lines);
    if (check && check.rules.length) {
      wrap.append(h('ul', { class: 'cg-rules' }, check.rules.map((r) => h('li', { class: r.ok ? 'is-right' : 'is-wrong' }, h('span', { 'aria-hidden': 'true' }, r.ok ? '✓ ' : '✗ '), r.label, h('span', { class: 'sr-only' }, r.ok ? ' — kept' : ' — not kept')))));
    }
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) wrap.append(resultLine(q, cfg, resp));
    return wrap;
  }
  // ---------- Clefwork Terms: multiple choice, read and heard ----------
  // A dynamic marking as it is printed: bold italic letters, or a hairpin opening (<) or closing (>).
  const hairpinSvg = (dir) => svgEl(`<svg class="tm-hairpin" viewBox="0 0 64 22" aria-hidden="true"><path d="${dir > 0 ? 'M60 3L4 11L60 19' : 'M4 3L60 11L4 19'}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  function dynMark(t, cls) {
    const c = 'tm-dyn' + (t.hairpin ? ' is-hairpin' : '') + (cls ? ' ' + cls : '');
    if (t.hairpin) return h('span', { class: c, role: 'img', 'aria-label': `${t.name} hairpin (${t.sign})` }, hairpinSvg(t.hairpin));
    return h('span', { class: c }, t.sign);
  }
  const termMark = (p, cls) => (p.sign ? dynMark(p.sign, cls) : h('span', { class: 'tm-term' + (cls ? ' ' + cls : '') }, p.term.term));
  // The listening part of a question: one play button (both playings, when there are two, with the
  // gap between), how many plays are left, which playing is sounding, and a sound check that doesn't
  // count. In a quiz the plays can be limited; once checked, and in the grade checker, they aren't.
  function termListen(q, cfg, o) {
    const H = q.tm.hear, set = MQ.termSettings(cfg.terms)[H.kind === 'dyn' ? 'hdyn' : 'htempo'];
    const limit = o.plays && !o.locked ? set.plays : 0;
    const left = () => (limit ? Math.max(0, limit - (o.plays.ex || 0)) : Infinity);
    const twice = H.takes.length > 1;
    const btn = h('button', { type: 'button', class: 'btn btn-primary rh-play' });
    const leftEl = h('span', { class: 'rh-left' });
    const now = h('span', { class: 'tm-now', 'aria-live': 'polite' });
    let playing = false;
    const paint = () => {
      const k = left();
      btn.replaceChildren(svgEl(playing ? STOP : PLAY_ICON), document.createTextNode(playing ? 'Stop' : twice ? 'Play it twice' : 'Play the melody'));
      btn.classList.toggle('is-playing', playing);
      btn.disabled = !playing && k <= 0;
      leftEl.textContent = k === Infinity ? '' : k <= 0 ? 'No plays left' : `${k} play${k === 1 ? '' : 's'} left`;
      leftEl.classList.toggle('is-out', k <= 0);
    };
    btn.addEventListener('click', async () => {
      if (playing) { MQ.Audio.stop(); return; }
      if (left() <= 0) { toast('There are no plays left for this.'); return; }
      // A library melody's notes load the first time one is played.
      if (H.lib && !MQ.LIBRARY_DATA) {
        btn.disabled = true;
        now.textContent = 'Loading the melody…';
        try { await MQ.libraryLoad(); } catch (e) { toast(e.message, 'bad'); now.textContent = ''; paint(); return; }
        now.textContent = '';
        paint();
      }
      const pe = MQ.termPlayEvents(q);
      const said = twice ? ['First time…', 'Second time…'] : ['Playing…'];
      const marks = pe.marks.map((mk) => ({ at: mk.at, fn: () => { now.textContent = said[mk.take]; } }));
      const ok = MQ.Audio.sequence(pe.events, { total: pe.total, marks, done: () => { playing = false; now.textContent = ''; paint(); } });
      if (!ok) { toast('This browser can’t play sound.', 'bad'); return; }
      playing = true;
      if (o.plays && !o.locked) { o.plays.ex = (o.plays.ex || 0) + 1; if (o.onPlays) o.onPlays(); }
      paint();
    });
    const check = h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => { const pe = MQ.termSoundCheck(); if (!MQ.Audio.sequence(pe.events, { total: pe.total })) toast('This browser can’t play sound.', 'bad'); } }, 'Sound check');
    paint();
    const how = [twice ? 'You’ll hear the same melody twice, with a short pause between.' : null, H.beat ? 'A click marks every beat.' : null].filter(Boolean).join(' ');
    return h('div', { class: 'rh-listen tm-listen' },
      h('div', { class: 'rh-play-row' }, h('div', { class: 'rh-play-item' }, btn, leftEl), now),
      how ? h('p', { class: 'fine tm-how' }, how) : null,
      o.locked || o.keyMode ? null : h('div', { class: 'tm-check' }, check,
        h('span', { class: 'fine' }, H.kind === 'dyn' ? 'Plays a chord at mf. Set your volume so it’s comfortable, then leave it there — the dynamics are heard against it.' : 'Plays a short chord, so you can set your volume. It doesn’t use up a play.')));
  }
  function termCard(q, cfg, o) {
    const T = q.tm;
    const wrap = h('div', { class: 'qcard tm-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, MQ.termCat(q))));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, T.parts ? T.parts.map((p) => (typeof p === 'string' ? p : termMark(p, 'is-inline'))) : q.text));
    if (q.hint && !o.locked && !o.keyMode) wrap.append(h('p', { class: 'q-hint' }, q.hint));
    // The marking, term or instrument asked about, large, as a flash card would show it.
    const sh = T.show;
    if (sh) {
      wrap.append(h('div', { class: 'tm-show' }, sh.sign ? dynMark(sh, 'is-big')
        : sh.term ? [h('span', { class: 'tm-term is-big' }, sh.term), sh.abbr ? h('span', { class: 'tm-abbr' }, sh.abbr) : null]
          : sh.vocab ? h('span', { class: 'tm-term is-big is-word' }, sh.vocab.term)
          : h('span', { class: 'tm-inst is-big' }, sh.inst.name.charAt(0).toUpperCase() + sh.inst.name.slice(1))));
    }
    if (T.hear) wrap.append(termListen(q, cfg, o));
    if (o.playsUsed && T.hear) wrap.append(h('p', { class: 'fine rh-plays' }, `Played the melody ${o.playsUsed.ex} time${o.playsUsed.ex === 1 ? '' : 's'}.`));
    const label = (c) => {
      if (T.choiceKind === 'dyn') { const t = MQ.TERM_DYNAMICS.find((d) => d.sign === c); return t ? dynMark(t) : c; }
      return T.choiceKind === 'tempo' ? h('span', { class: 'tm-term' }, c) : c;
    };
    const long = q.choices.some((c) => c.length > 16);
    wrap.append(choiceGroup(q, Object.assign({}, o, { choiceLabel: label, choiceClass: 'tm-choices' + (T.choiceKind === 'dyn' ? ' is-signs' : long ? ' is-long' : '') })));
    if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) wrap.append(resultLine(q, cfg, o.response));
    // Why a tricky instrument is where it is, when the answer line doesn't already say; and the piece a
    // listening question played.
    if ((o.reveal || o.keyMode) && T.why && T.more) wrap.append(h('p', { class: 'tm-why' }, T.why));
    if ((o.reveal || o.keyMode) && T.piece && MQ.libraryName(T.piece)) wrap.append(h('p', { class: 'tm-why' }, 'The melody: ', h('i', null, MQ.libraryName(T.piece)), '.'));
    return wrap;
  }
  function questionCard(q, cfg, o) {
    if (q.type === 'term') return termCard(q, cfg, o);
    if (q.type === 'cgtable' || q.type === 'cgtritone') return graphTableCard(q, cfg, o);
    if (q.type === 'cgphrase') return phraseCard(q, cfg, o);
    if (q.type === 'degree') return degreeCard(q, cfg, o);
    if (q.type === 'melody') return melodyCard(q, cfg, o);
    if (q.type === 'rhythm') return rhythmCard(q, cfg, o);
    if (q.type === 'rgrid') return gridCard(q, cfg, o);
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
      KEYS ? keysPresets(cfg) : GRAPH ? graphPresets(cfg) : TERMS ? termPresets(cfg) : ANALYSIS || DICTATION ? null : h('div', { class: 'presets' }, h('span', { class: 'mini-label' }, STUDENT ? 'Presets' : 'Or start from a preset'),
        h('div', { class: 'preset-row' }, MQ.PRESETS.map((p) => h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
          const keep = { custom: cfg.counts.custom, voicing: cfg.counts.voicing, progression: cfg.counts.progression };
          S.cfg = p.apply(S.cfg); Object.assign(S.cfg.counts, keep);
          S.cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvShow = false; S.pvResp = null;
          saveDraft(); go('build'); toast(`Loaded the “${p.label}” preset`);
        } }, p.label))))));

    if (KEYS) form.append(keysSection(cfg, changed, R));
    if (ANALYSIS) form.append(...analysisSections(cfg, changed, R));
    if (RHYTHM) form.append(...rhythmSections(cfg, changed, R));
    if (MELODY) form.append(...melodySections(cfg, changed, R));
    if (GRAPH) form.append(graphKeysSection(cfg, changed));
    if (TERMS) form.append(termChoicesSection(cfg, changed));
    if (!KEYS && !ANALYSIS && !DICTATION && !GRAPH && !TERMS) form.append(sec('staff', 'Staff & notes', 'Applies to every question type.',
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
      degree: () => {
        const d = cfg.deg = MQ.degreeSettings(cfg.deg);
        const levelHelp = h('span', { class: 'help' }, MQ.MELODY_LEVELS[d.level - 1].blurb);
        const srcPick = grp('Melodies', seg('q-degsrc', [{ v: 0, label: 'Made by Clefwork' }, { v: 1, label: 'Chosen from the library' }], d.src, (v) => {
          d.src = v;
          if (v) cfg.counts.degree = d.mel.length;
          changed(); go('build');
        }));
        if (d.src) return [
          h('p', { class: 'help' }, 'Students choose the scale degree, 1 to 7, under every note of a melody from a real piece. Each note is an equal share of the question. In minor keys a raised 6th or 7th is still 6 or 7.'),
          srcPick,
          libraryMode({
            id: 'dg-lib', need: 'melody', max: 8, limit: MQ.DEGREE_MAX, list: d.mel, pick: (d.pick = d.pick || {}), noun: 'melody', keyMax: true, autoFill: true,
            make: (piece, x) => MQ.libraryMelody(piece, x.part, x.from, x.count), preview: melodyPreview,
            changed: () => { cfg.counts.degree = d.mel.length; changed(); },
          }),
          h('p', { class: 'help' }, 'Each melody is one question, in its own key and clef, as the piece has it. A chromatic note takes the number of its letter (F♯ in C major is 4).'),
          grp('Listening', seg('q-deghear', [{ v: 1, label: 'Students may hear the melody and the key' }, { v: 0, label: 'Reading only' }], d.hear, (v) => { d.hear = v; changed(); })),
          degreeShareField(d, changed),
          degreeScoreField(d, changed),
        ];
        return [
          h('p', { class: 'help' }, 'Clefwork writes each melody the way Clefwork Melody makes its dictation melodies, and prints it with its key signature. Students choose the scale degree, 1 to 7, under every note; each note is an equal share of the question. In minor keys a raised 6th or 7th is still 6 or 7. Each question is one melody.'),
          srcPick,
          grp('Measures in each melody', seg('q-degbars', [1, 2, 3, 4, 5, 6, 7, 8].map((v) => ({ v, label: String(v) })), d.measures, (v) => { d.measures = v; changed(); })),
          h('div', { class: 'row2' },
            grp('Key', seg('q-degkey', [{ v: 1, label: 'Major' }, { v: 2, label: 'Minor' }, { v: 3, label: 'Both' }], d.keyMode, (v) => { d.keyMode = v; changed(); })),
            grp('Key signatures up to', seg('q-degmax', [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ v, label: v === 0 ? 'None' : String(v) })), d.keyMax, (v) => { d.keyMax = v; changed(); }), 'Sharps or flats in the key.')),
          h('div', { class: 'fld' }, h('span', { class: 'mini-label', id: 'q-deglevel-l' }, 'Melody level'),
            (() => { const el = seg('q-deglevel', MQ.MELODY_LEVELS.map((L, i) => ({ v: i + 1, label: L.name })), d.level, (v) => { d.level = v; levelHelp.textContent = MQ.MELODY_LEVELS[v - 1].blurb; changed(); }); el.setAttribute('aria-labelledby', 'q-deglevel-l'); return el; })(),
            levelHelp),
          grp('Clefs', chips('q-degclefs', [{ label: 'Treble' }, { label: 'Bass' }], d.clefs, (m) => { d.clefs = m || 1; changed(); }, (x) => x.label)),
          grp('Listening', seg('q-deghear', [{ v: 1, label: 'Students may hear the melody and the key' }, { v: 0, label: 'Reading only' }], d.hear, (v) => { d.hear = v; changed(); })),
          degreeShareField(d, changed),
          degreeScoreField(d, changed),
        ];
      },
      cgtable: () => graphTablePanel(cfg, changed),
      cgtritone: () => graphTritonePanel(cfg, changed),
      cgphrase: () => graphPhrasePanel(cfg, changed),
      tmdyn: () => termDynPanel(cfg, changed),
      tmtempo: () => termTempoPanel(cfg, changed),
      tminst: () => termInstPanel(cfg, changed),
      tmhdyn: () => termHearDynPanel(cfg, changed),
      tmhtempo: () => termHearTempoPanel(cfg, changed),
      tmvocab: () => termVocabPanel(cfg, changed),
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
    const TABS = GRAPH ? [
      { id: 'cgtable', label: 'Diatonic Tables', max: MQ.GRAPH_MAX }, { id: 'cgtritone', label: 'Tritone Graphs', max: MQ.GRAPH_MAX },
      { id: 'cgphrase', label: 'Musical Phrases', max: MQ.GRAPH_MAX },
    ] : TERMS ? MQ.TERM_TABS.map((t) => ({ id: t.id, label: t.label, max: t.max, blurb: t.blurb })) : [
      { id: 'place', label: 'Place the Note' }, { id: 'identify', label: 'Name the Note' },
      { id: 'degree', label: 'Scale Degrees', max: MQ.DEGREE_MAX },
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
    if (!TABS.some((t) => t.id === S.buildTab)) S.buildTab = TABS[0].id;
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
      // Clefwork Terms' tabs are kinds of one question type, so they bring their own heading.
      const type = typeOf(tb.id) || { label: tb.label, blurb: tb.blurb };
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
      t.ctr.sync(n, t.list ? len : t.max || 30);
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
    if (!KEYS && !ANALYSIS && !DICTATION) form.append(sec('types', GRAPH ? 'Worksheets' : 'Question types', GRAPH
      ? 'Choose a worksheet to change its settings. The counter on each tab sets how many the quiz asks — each table or phrase is one question, in its own key.'
      : 'Choose a type to change its settings. The counter on each tab sets how many of those questions the quiz asks.',
      h('div', { class: 'types-top' }, clearBtn),
      strip, panels, h('div', { class: 'mix-foot' }, R.total)));
    if (GRAPH) form.append(graphScoreSection(cfg, changed));

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
        ANALYSIS || DICTATION ? null : flag('shuffle', 'Shuffle question order', 'Mixes the question types together instead of grouping them.'),
        KEYS || DICTATION || TERMS ? null : ANALYSIS ? flag('partial', 'Partial credit', 'A box that asks for both earns half credit for each right answer.')
          : GRAPH ? flag('partial', 'Partial credit', 'When each table or phrase is one question: a table earns credit for each right answer, a phrase for each measure and rule. Without it, only a perfect one counts.')
          : flag('partial', 'Partial credit', 'Chords and scales earn credit for each correct note.'),
        STUDENT ? null : flag('feedback', 'Let students check answers', 'Students can check each question and see the right answer. Best for practice.'),
        ANALYSIS || DICTATION || GRAPH || TERMS ? null : flag('labels', 'Show note names while dragging', STUDENT ? 'The note’s name appears as you move it.' : 'Practice mode: the note’s name appears as students move it.'),
        DICTATION || TERMS ? null : ANALYSIS ? flag('enharmonic', 'Accept enharmonic spellings', 'Counts a G♭7 chord symbol as correct when the answer is F♯7.')
          : GRAPH ? flag('enharmonic', 'Accept enharmonic spellings', 'Counts A♯mi as correct when the answer is B♭mi. Tritone substitutes always take either spelling (C♭7 or B7).')
          : flag('enharmonic', 'Accept enharmonic spellings', 'Counts G♭ as correct when the answer is F♯.'),
        KEYS || ANALYSIS || DICTATION || GRAPH || TERMS ? null : flag('noHelpers', 'Hide starting and helper notes', 'Students write every note themselves: both notes of an interval, every note of a scale, and a chord’s bass note.'))));

    // Side: share + preview + answer key
    R.summary = h('p', { class: 'share-summary' });
    R.code = h('output', { class: 'code', id: 'quiz-code', 'aria-label': 'Quiz code' });
    R.copy = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { if ((RHYTHM && !rhythmReady()) || (MELODY && !melodyReady())) return; rememberQuiz(S.code, cfg); copyText(S.code, 'Quiz code'); } }, 'Copy quiz code');
    R.link = SITE || !inFrame ? h('button', { type: 'button', class: ANALYSIS ? 'btn btn-primary' : 'btn', onclick: () => {
      if ((ANALYSIS && !analysisReady()) || (RHYTHM && !rhythmReady()) || (MELODY && !melodyReady())) return;
      rememberQuiz(S.code, cfg);
      copyText(quizLink(S.code) || location.href.split('#')[0] + '#take=' + withScore(S.code), 'Quiz link');
    } }, 'Copy quiz link') : null;
    R.tryBtn = h('button', { type: 'button', class: 'btn', onclick: () => {
      if ((ANALYSIS && !analysisReady()) || (RHYTHM && !rhythmReady()) || (MELODY && !melodyReady())) return;
      rememberQuiz(S.code, cfg);
      if (openQuiz(S.code, { preview: true })) { S.take.name = 'Teacher preview'; go('take'); }
    } }, 'Try it as a student');
    R.exportBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { if ((!RHYTHM || rhythmReady()) && (!MELODY || melodyReady())) openExport(cfg); } }, 'Export to spreadsheet');
    R.canvasBtn = h('button', { type: 'button', class: 'btn', onclick: () => { if ((!ANALYSIS || analysisReady()) && (!RHYTHM || rhythmReady()) && (!MELODY || melodyReady())) openCanvasKit(cfg, changed); } }, 'Set up in Canvas');
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
      R.summary, DICTATION ? (R.ready = h('div', { class: 'rh-ready' })) : null, R.code,
      h('div', { class: 'btn-row' }, R.copy, R.link, R.tryBtn, R.canvasBtn, R.exportBtn),
      h('p', { class: 'fine' }, SITE
        ? ['The quiz link opens the quiz straight away. The code holds every setting, so nothing is stored online, and everyone with the same code gets the same questions.']
        : ['The code holds every setting, so nothing is stored online. Students paste it on the ', h('b', null, 'Take a quiz'), ' tab, and everyone with the same code gets the same questions.']),
      DICTATION ? null : h('button', { type: 'button', class: 'btn-link', onclick: () => { cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvResp = null; changed(); toast('New questions generated — share the new code'); } }, 'Make a new set of questions with these settings')));

    R.keyList = h('ol', { class: 'key-list' });
    if (!STUDENT) side.append(h('details', { class: 'card key' }, h('summary', null, 'Answer key'), R.keyList));

    if (!ANALYSIS && !DICTATION) R.pvCount = h('span', { class: 'pv-count' });
    R.pvHost = h('div', { class: 'pv-host' });
    R.prev = h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Previous question', onclick: () => { S.pvIdx--; S.pvResp = null; renderPreview(); } }, '‹ Prev');
    R.next = h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Next question', onclick: () => { S.pvIdx++; S.pvResp = null; renderPreview(); } }, 'Next ›');
    R.show = toggle('pv-show', 'Show answer', null, S.pvShow, (v) => { S.pvShow = v; renderPreview(); });
    if (!ANALYSIS && !DICTATION) side.append(h('section', { class: 'card preview' },
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
      R.total.textContent = GRAPH ? `${total} worksheet${total === 1 ? '' : 's'} in the quiz` : MELODY ? `${total} melod${total === 1 ? 'y' : 'ies'} in the quiz` : RHYTHM ? `${total} example${total === 1 ? '' : 's'} in the quiz` : `${total} question${total === 1 ? '' : 's'} in the quiz`;
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
        const est = Math.max(1, Math.round((MQ.BUILT_IN.reduce((s, t) => s + t.est * (cfg.counts[t.id] || 0), 0) + 40 * listCount(cfg, 'custom') + 55 * listCount(cfg, 'voicing') + 90 * listCount(cfg, 'vprog') + 70 * listCount(cfg, 'progression') + 15 * listCount(cfg, 'keys') + 30 * listCount(cfg, 'analysis') + 120 * listCount(cfg, 'rhythm') + 180 * listCount(cfg, 'melody') + 60 * Math.min(MQ.DEGREE_MAX, cfg.counts.degree || 0)
          + 150 * listCount(cfg, 'cgtable') + 180 * listCount(cfg, 'cgtritone') + 120 * listCount(cfg, 'cgphrase')
          + 15 * (termCount(cfg) - termHeard(cfg)) + 40 * termHeard(cfg)) / 60));
        const sb = DICTATION ? dictation(cfg) : null;
        const dsc = !sb ? quizScoring(cfg, S.qs) : null;          // scale degrees scored by note or percent
        const outOf = sb ? (sb.score === 'percent' ? ` · out of ${sb.outOf} points` : ` · out of ${rhythmNotes(S.qs)} notes`)
          : dsc ? ` · out of ${fmtPts(MQ.reportStats({ items: S.qs.map((q) => ({ type: q.type, clef: q.clef, credit: 7, answered: true, sec: 0, notes: q.type === 'degree' ? q.deg.notes.length : MQ.isGraph(q) ? MQ.graphPoints(q) : undefined, wrong: 0 })), scoring: dsc }).n)} points` : '';
        const noun = MELODY ? (total === 1 ? 'melody' : 'melodies') : `${RHYTHM ? 'example' : GRAPH ? 'worksheet' : 'question'}${total === 1 ? '' : 's'}`;
        R.summary.replaceChildren(h('b', null, STUDENT ? 'Your practice' : cfg.title || 'Untitled quiz'), ` — ${total} ${noun} · ${clefsText(cfg)}${outOf} · about ${est} min${cfg.timeLimit ? ` · ${cfg.timeLimit}-minute limit` : ''}`);
      }
      if (R.scoreInfo) R.scoreInfo.textContent = total ? rhythmScoreText(cfg, S.qs) : '';
      if (R.ready) {
        const probs = MELODY ? MQ.melodyProblems(cfg.melody) : MQ.rhythmProblems(cfg.rhythm);
        R.ready.replaceChildren(probs.length
          ? h('p', { class: 'warn-note' }, `Not ready to share yet. ${probs[0].text}${probs.length > 1 ? ` (${probs.length - 1} more to fix)` : ''}`)
          : h('p', { class: 'fine rh-ready-ok' }, '✓ Every measure is complete.'));
      }
      R.keyList.replaceChildren(...S.qs.map((q) => q.type === 'melody' ? melodyKeyItem(q) : q.type === 'rhythm' ? rhythmKeyItem(q) : q.type === 'rgrid' ? gridKeyItem(q) : h('li', null, h('span', { class: 'key-q' }, q.text, q.type === 'analysis' || MQ.isGraph(q) ? null : h('span', { class: 'key-clef' }, ' · ' + (q.type === 'term' ? MQ.termCat(q) : MQ.clefLabel(q.clef)))), h('span', { class: 'key-a' }, q.cg ? graphAnswer(q) : q.type === 'analysis' || MQ.isGraph(q) ? accText(MQ.describeAnswer(q, cfg)) : MQ.describeAnswer(q, cfg)))));
      if (R.linkSize) {
        const kb = S.aimg ? Math.max(1, Math.round(withScore(S.code).length / 1024)) : 0;
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
  // Rhythm examples count as rhythm grids when that's the quiz's task.
  const typeCount = (cfg, id) => (id === 'rgrid' ? (gridQuiz(cfg) ? listCount(cfg, 'rhythm') : 0)
    : id === 'rhythm' && gridQuiz(cfg) ? 0
    : id === 'degree' ? Math.min(MQ.DEGREE_MAX, cfg.counts.degree || 0)
    : MQ.GRAPH_TYPES.includes(id) ? listCount(cfg, id)
    : id === 'term' ? termCount(cfg)
    : MQ.BUILT_IN.some((t) => t.id === id) ? cfg.counts[id] || 0 : listCount(cfg, id));
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
        // The music comes in the link, a picture for each score. Check each belongs to this quiz before keeping it.
        const imgs = [opts && opts.img].concat((opts && opts.more) || []);
        MQ.analysisScores(cfg.analysis).forEach((sc, k) => {
          if (!sc.regions.length) return;
          const want = sc.img && sc.img.hash, img = imgs[k];
          if (img) {
            let got = null;
            try { got = MQ.hashOfData(img); } catch (e) { /* unreadable */ }
            if (got !== want) throw new MQ.CodeError('The music in this link is damaged or cut short — some email programs break long links. Ask your teacher for the link again, or open it from Canvas.');
            keepScore(img, want);
          } else if (!want || !scoreData(want)) {
            throw new MQ.CodeError('This quiz is on a picture of the music, which comes in the quiz link — the code on its own doesn’t carry it. Open the link your teacher sent.');
          }
        });
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
      // Opened from a link, the take page explains instead (see takeLinkError).
      if (opts && opts.link) S.linkError = { code: code.replace(/[^0-9A-Za-z]/g, '').toUpperCase(), img: opts.img || '', more: opts.more || [], message: e.message || 'That code didn’t work.' };
      else toast(e.message || 'That code didn’t work.', 'bad');
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
      EMBEDDED ? ownTabLink('btn btn-quiet sm take-bar-tab', 'Own tab ↗') : null,
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
    if (frameFitted) dlg.style.margin = `${nearTap(140)}px auto auto`;
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
    if (S.linkError && S.slot === 'take') return takeLinkError(main);
    const t = S.take;
    if (S.slot === 'take') main.append(startOverBar(t));
    if (!t) return takeLoad(main);
    if (!t.started) return takeIntro(main);
    if (t.done) return takeDone(main);
    return t.reviewing ? takeReview(main) : takeQuestion(main);
  }
  // A quiz link (or a scanned QR code) that didn't open: say why, rather than showing whatever quiz
  // this device had open before.
  function takeLinkError(main) {
    const E = S.linkError;
    const newer = /newer version/i.test(E.message);
    const leave = () => { S.linkError = null; go(tv()); };
    const retry = () => {
      location.href = location.pathname + location.search + '#take=' + E.code + (E.img ? '&img=' + E.img : '') + (E.more || []).map((d, k) => (d ? `&img${k + 2}=${d}` : '')).join('');
      location.reload();
    };
    main.append(h('div', { class: 'narrow' }, h('section', { class: 'card stage' },
      h('div', { class: 'eyebrow' }, 'Quiz link'),
      h('h1', { class: 'display' }, 'This quiz didn’t open'),
      h('p', { class: 'lede' }, E.message),
      newer ? h('p', null, 'The quiz uses something this page doesn’t have yet. If your teacher has just updated Clefwork, the site can take a few minutes to catch up — wait a little, then try again.') : null,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: retry }, 'Try again'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: leave }, S.take ? `Back to ${S.take.cfg.title || 'your last quiz'}` : 'Type a quiz code instead')))));
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
    if (cfg.counts.degree) types.push(`Scale degrees (${cfg.counts.degree} melod${cfg.counts.degree === 1 ? 'y' : 'ies'})`);
    if (listCount(cfg, 'cgtable')) types.push(`Diatonic progression tables (${listCount(cfg, 'cgtable')})`);
    if (listCount(cfg, 'cgtritone')) types.push(`Tritone substitution graphs (${listCount(cfg, 'cgtritone')})`);
    if (listCount(cfg, 'cgphrase')) types.push(`Musical phrases (${listCount(cfg, 'cgphrase')})`);
    MQ.TERM_TABS.forEach((tb) => { if (listCount(cfg, tb.id)) types.push(`${tb.label} (${listCount(cfg, tb.id)})`); });
    if (listCount(cfg, 'progression')) types.push(`Chord progressions (${listCount(cfg, 'progression')})`);
    if (listCount(cfg, 'rhythm')) types.push(`${gridQuiz(cfg) ? 'Rhythm grid' : 'Rhythmic dictation'} (${listCount(cfg, 'rhythm')} example${listCount(cfg, 'rhythm') > 1 ? 's' : ''})`);
    if (listCount(cfg, 'melody')) types.push(`Melodic dictation (${listCount(cfg, 'melody')} melod${listCount(cfg, 'melody') > 1 ? 'ies' : 'y'})`);
    if (listCount(cfg, 'analysis')) {
      const asks = MQ.analysisQuestions(cfg).map((q) => q.an.ask);
      const kinds = [asks.some((a) => a === 'roman' || a === 'both') ? 'Roman numerals' : null, asks.some((a) => a === 'symbol' || a === 'both') ? 'chord symbols' : null,
        asks.includes('nht') ? 'non-harmonic tones' : null, asks.includes('key') ? 'key changes' : null, asks.includes('open') ? 'the opening key' : null].filter(Boolean);
      types.push(`Analysis (${listCount(cfg, 'analysis')} boxes) — ${kinds.length > 1 ? kinds.slice(0, -1).join(', ') + ' and ' + kinds[kinds.length - 1] : kinds[0]}`);
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
        onlyTerms(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, termHeard(cfg) ? 'Multiple choice, listening' : 'Multiple choice'))
          : onlyGraph(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, 'Tables, phrases'))
          : onlyMelody(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, 'Listening, the staff'))
          : onlyRhythm(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, !gridQuiz(cfg) ? 'Listening, one-line staff' : ['Reading rhythm, a grid', 'Listening, a grid', 'Reading & listening, a grid'][MQ.rhythmSettings(cfg.rhythm).grid.show]))
          : onlyAnalysis(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, 'A picture of the score'))
          : onlyKeys(cfg)
          ? h('div', null, h('dt', null, 'Uses'), h('dd', null, 'Grand staff, piano'))
          : h('div', null, h('dt', null, 'Clefs'), h('dd', null, [cfg.clefs & 1 ? 'Treble' : null, cfg.clefs & 2 ? 'Bass' : null, usesGrand(cfg) ? 'Grand staff' : null].filter(Boolean).join(', ')))),
      h('p', { class: 'types-line' }, types.join(' · ')),
      onlyAnalysis(cfg) && cfg.analysis.notes ? h('p', { class: 'an-notes' }, accText(cfg.analysis.notes)) : null,
      listCount(cfg, 'rhythm') || listCount(cfg, 'melody') ? h('p', { class: 'an-notes rh-intro' }, rhythmIntro(cfg, t.qs)) : null,
      graphCount(cfg) ? h('p', { class: 'an-notes' }, graphIntro(cfg, t.qs)) : null,
      termCount(cfg) ? h('p', { class: 'an-notes rh-intro' }, termIntro(cfg)) : null,
      EMBEDDED ? h('p', { class: 'frame-note' }, h('strong', null, 'On a tablet or phone? '),
        'If the keyboard doesn’t come up or the quiz is cut off, ', ownTabLink('', 'open the quiz in its own tab ↗'), ' before you start.') : null,
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
    const heard = q.type === 'rhythm' || q.type === 'melody' || (q.type === 'rgrid' && q.rh.grid.show > 0) || (q.type === 'term' && !!q.tm.hear);
    if (heard && !t.plays) t.plays = t.qs.map(() => ({ ex: 0, ans: 0 }));
    const card = questionCard(q, t.cfg, {
      response: t.resp[i], locked, reveal: locked,
      plays: heard ? t.plays[i] : null, onPlays: saveAttempt,
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
  // How a quiz is scored when it isn't one point a question: rhythm and melody dictation by note, and
  // scale degrees when the teacher chose note or percent scoring.
  function quizScoring(cfg, qs) {
    if (qs.some((q) => q.type === 'rhythm' || q.type === 'melody' || q.type === 'rgrid')) {
      const rh = dictation(cfg);
      return { mode: rh.score, outOf: rh.outOf, split: rh.split ? 1 : 0 };
    }
    if (qs.some((q) => MQ.isGraph(q))) {
      // Chord Graph: every answer a point ('notes' in the report), or their share of a total.
      const g = MQ.graphSettings(cfg.graph);
      return g.score === 'question' ? null : { mode: g.score === 'percent' ? 'percent' : 'notes', outOf: g.outOf, split: 0 };
    }
    const d = MQ.degreeSettings(cfg.deg);
    return d.score !== 'question' && qs.some((q) => q.type === 'degree') ? { mode: d.score, outOf: d.outOf, split: 0 } : null;
  }
  function submitQuiz() {
    const t = S.take;
    if (!t || t.done) return;
    stopTicker();
    // Rhythm quizzes are scored note by note, so they always give partial credit.
    const rhythm = t.qs.some((q) => q.type === 'rhythm' || q.type === 'melody' || q.type === 'rgrid');
    // Chord Graph quizzes scored by answer give credit for each one, whatever the partial-credit switch says.
    const byAnswer = t.qs.some((q) => MQ.isGraph(q)) && !!quizScoring(t.cfg, t.qs);
    const partial = t.cfg.flags.partial || rhythm || byAnswer;
    const items = t.qs.map((q, i) => {
      const frac = MQ.gradeQuestion(q, t.resp[i], t.cfg);
      const credit = frac === 1 ? 7 : partial ? Math.min(6, Math.round(frac * 7)) : 0;
      const it = { type: q.type, clef: q.clef, credit, answered: MQ.hasAnswer(q, t.resp[i]), sec: t.secs[i] };
      if (q.type === 'rhythm') { const c = MQ.compareRhythm(q, t.resp[i]); it.notes = c.notes; it.wrong = c.wrong; }
      if (q.type === 'rgrid') { const c = MQ.compareGrid(q, t.resp[i]); it.notes = c.notes; it.wrong = c.wrong; }
      if (q.type === 'melody') { const c = MQ.compareMelody(q, t.resp[i]); Object.assign(it, { notes: c.notes, wrong: c.wrong, pw: c.pw, rw: c.rw }); }
      if (q.type === 'degree') Object.assign(it, MQ.compareDegrees(q, t.resp[i]));
      if (MQ.isGraph(q)) Object.assign(it, MQ.compareGraph(q, t.resp[i], t.cfg));
      return it;
    });
    t.report = {
      name: t.name, submittedAt: Date.now(), totalSec: t.secs.reduce((a, b) => a + b, 0), partial, items, attempt: t.attempt || 1,
      scoring: quizScoring(t.cfg, t.qs),
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
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'How you did'), typeBars(st, rep, t.qs), questionTable(rep, t))));
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
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'How you did'), typeBars(st, rep, t.qs), questionTable(rep, review ? t : null)),
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
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'How you did'), typeBars(st, rep, t.qs), questionTable(rep, review ? t : null))));
  }

  // ---------- stats widgets ----------
  function bar(label, pts, n, sub) {
    const pct = n ? (pts / n) * 100 : 0;
    return h('div', { class: 'bar-row' },
      h('span', { class: 'bar-label' }, label),
      h('span', { class: 'bar', role: 'img', 'aria-label': `${Math.round(pct)}%` }, h('span', { class: 'bar-fill' + (pct >= 80 ? ' is-good' : pct < 50 ? ' is-bad' : ''), style: `width:${pct}%` })),
      h('span', { class: 'bar-val' }, `${fmtPts(pts)}/${n}`, sub ? h('small', null, sub) : null));
  }
  // rep and qs (optional): the report and its quiz's questions, so Musical Terms can be split by kind.
  function typeBars(st, rep, qs) {
    let rows = MQ.TYPES.filter((t) => st.byType[t.id]).map((t) => bar(t.label, st.byType[t.id].points, st.byType[t.id].n, `${Math.round(st.byType[t.id].sec / st.byType[t.id].count)} s avg`));
    if (st.byType.term && rep && qs && qs.length === rep.items.length) {
      const by = {};
      rep.items.forEach((it, i) => {
        if (it.type !== 'term' || !qs[i] || !qs[i].tm) return;
        const k = MQ.termCat(qs[i]), x = MQ.reportStats({ items: [it], scoring: null });
        by[k] = by[k] || { points: 0, n: 0, sec: 0, count: 0 };
        by[k].points += x.points; by[k].n += x.n; by[k].sec += it.sec; by[k].count++;
      });
      const kinds = MQ.TERM_TABS.map((tb) => tb.label).filter((k) => by[k]);
      const at = MQ.TYPES.filter((t) => st.byType[t.id]).findIndex((t) => t.id === 'term');
      if (kinds.length > 1 && at >= 0) rows.splice(at, 1, ...kinds.map((k) => bar(k, by[k].points, by[k].n, `${Math.round(by[k].sec / by[k].count)} s avg`)));
    }
    const clefs = ['treble', 'bass', 'grand'].filter((c) => st.byClef[c]).map((c) => bar(MQ.clefLabel(c), st.byClef[c].points, st.byClef[c].n));
    return h('div', { class: 'bars' }, h('div', { class: 'bars-group' }, h('h4', null, 'By question type'), rows),
      clefs.length > 1 ? h('div', { class: 'bars-group' }, h('h4', null, 'By clef'), clefs) : null);
  }
  // "3 wrong notes" for note-scored questions, or "12 fully correct" for the rest.
  function scoreNote(st) {
    if (st.noted && st.graph) return `${fmtPts(st.notes - st.wrong)} of ${st.notes} answers right`;
    if (st.noted) return `${st.wrong} wrong note${st.wrong === 1 ? '' : 's'} of ${st.notes}`;
    return `${st.full} fully correct`;
  }
  function resultCell(it) {
    if (it.notes != null && MQ.GRAPH_TYPES.includes(it.type)) {
      // Chord Graph: points out of points, halves included.
      if (!it.wrong) return h('span', { class: 'res is-good' }, '✓ Correct');
      if (!it.answered) return h('span', { class: 'res is-blank' }, '— Blank');
      return h('span', { class: 'res ' + (it.wrong < it.notes ? 'is-part' : 'is-bad') }, `${it.wrong < it.notes ? '◐' : '✗'} ${fmtPts(it.notes - it.wrong)} of ${it.notes}`);
    }
    if (it.notes != null) {
      if (!it.wrong) return h('span', { class: 'res is-good' }, '✓ Correct');
      if (!it.answered) return h('span', { class: 'res is-blank' }, '— Blank');
      const detail = it.pw != null ? ` (${it.pw} pitch, ${it.rw} rhythm)` : '';
      return h('span', { class: 'res ' + (it.wrong < it.notes ? 'is-part' : 'is-bad') }, `${it.wrong < it.notes ? '◐' : '✗'} ${it.wrong} wrong of ${it.notes}${detail}`);
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
        h('td', null, it.type === 'analysis' ? 'Score' : it.type === 'rhythm' ? 'Rhythm' : it.type === 'rgrid' ? 'Grid' : it.type === 'cgphrase' ? 'Phrase' : MQ.GRAPH_TYPES.includes(it.type) ? 'Table' : it.type === 'term' ? (q && q.tm ? MQ.termCat(q) : 'Terms') : MQ.CLEFS[it.clef].label),
        key ? h('td', { class: 'ans' + (q && (q.mel || q.rh || q.cg || q.ph) ? ' is-long' : '') }, q ? (q.cg ? graphAnswer(q) : q.ph ? accText(MQ.describeAnswer(q, quiz.cfg)) : MQ.describeAnswer(q, quiz.cfg)) : '') : null,
        h('td', null, resultCell(it)),
        h('td', { class: 'num' }, it.sec >= 63 ? '63+ s' : it.sec + ' s')));
    });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'qtable' },
      h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Question'), h('th', null, rep.items.every((it) => it.type === 'term') ? 'Kind' : 'Clef'), key ? h('th', null, 'Answer') : null, h('th', null, 'Result'), h('th', { class: 'num' }, 'Time'))),
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
        st.noted && st.graph
          ? h('div', null, h('dt', null, 'Answers right'), h('dd', null, `${fmtPts(st.notes - st.wrong)} of ${st.notes}`))
          : st.noted
          ? h('div', null, h('dt', null, 'Wrong notes'), h('dd', null, `${st.wrong} of ${st.notes}`))
          : h('div', null, h('dt', null, 'Fully correct'), h('dd', null, `${st.full} of ${st.count}`)),
        h('div', null, h('dt', null, 'Answered'), h('dd', null, `${st.answered} of ${st.count}`)),
        h('div', null, h('dt', null, 'Avg per question'), h('dd', null, Math.round(st.avgSec) + ' s')),
        h('div', null, h('dt', null, 'Longest'), h('dd', null, st.slowest >= 0 ? `Q${st.slowest + 1} · ${r.items[st.slowest].sec >= 63 ? '63+' : r.items[st.slowest].sec} s` : '—'))),
      typeBars(st, r, r.quiz && r.quiz.qs),
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
        const lost = MQ.answerLost(q, r.answers[i]);
        let card;
        try {
          card = it.answered || q.type === 'progression' || q.type === 'term' || !q.choices
            ? questionCard(q, cfg, { response: MQ.answerFor(q, r.answers[i]), locked: true, reveal: o.showKey && !lost, playsUsed: r.answers[i] && r.answers[i].plays })
            : h('div', null, h('p', { class: 'q-text' }, q.text),
              h('p', { class: 'result is-bad' }, h('strong', null, 'Left blank.'), o.showKey ? [' The answer is ', h('b', null, MQ.describeAnswer(q, cfg)), '.'] : null));
          // No notes to mark: the verdict is in the heading, so just give the answer.
          if (lost && o.showKey) card.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
        } catch (e) {
          // One question that can't be drawn mustn't take the rest of the report with it.
          card = h('div', null, h('p', { class: 'q-text' }, q.text),
            h('p', { class: 'warn-note' }, 'This answer couldn’t be shown. The score above is still right.'),
            o.showKey ? h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)) : null);
        }
        return h('section', { class: 'ans-card', id },
          h('div', { class: 'ans-head' }, h('strong', null, `Question ${i + 1}`), resultCell(it), h('span', { class: 'ans-time' }, it.sec >= 63 ? '63+ s' : it.sec + ' s')),
          lost && it.answered ? h('p', { class: 'warn-note' }, 'This report was made before Clefwork saved the chords students write on the staff, so the notes for this question aren’t in the code. The score is right. Reports made from now on include them.') : null,
          card);
      }).filter(Boolean);
      box.replaceChildren(jump, ...cards);
    };
    if (o.openAnswers) { build(); return h('div', { class: 'ans-wrap' }, box); }
    // Chord Graph answers are tables and phrases, not notes on a staff.
    const seeText = r.items.every((it) => MQ.GRAPH_TYPES.includes(it.type) || it.type === 'term') ? 'See answers' : 'See answers on the staff';
    const btn = h('button', { type: 'button', class: 'btn', 'aria-expanded': 'false' }, seeText);
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide answers' : seeText;
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
        if (q.type === 'melody') {
          it.notes = MQ.compareMelody(q, null).notes;
          it.pw = !it.answered ? it.notes : Math.min(it.notes, Math.round(it.notes * (1 - skill) * rng() * 1.4));
          it.rw = !it.answered ? it.notes : Math.min(it.notes, Math.round(it.notes * (1 - skill) * rng()));
          it.wrong = Math.min(it.notes, Math.max(it.pw, it.rw));
          it.credit = it.wrong ? Math.min(6, Math.round(((it.notes - it.wrong) / Math.max(1, it.notes)) * 7)) : 7;
        }
        if (MQ.isGraph(q)) {
          it.notes = MQ.graphPoints(q);
          it.wrong = !it.answered ? it.notes : Math.min(it.notes, Math.round(it.notes * (1 - skill) * rng() * 2.4) / 2);
          it.credit = it.wrong ? Math.min(6, Math.round(((it.notes - it.wrong) / Math.max(1, it.notes)) * 7)) : 7;
        }
        if (q.type === 'degree') {
          it.notes = q.deg.notes.length;
          it.wrong = !it.answered ? it.notes : Math.min(it.notes, Math.round(it.notes * (1 - skill) * rng() * 1.4));
          it.credit = it.wrong ? Math.min(6, Math.round(((it.notes - it.wrong) / Math.max(1, it.notes)) * 7)) : 7;
        }
        if (q.type === 'rhythm' || q.type === 'rgrid') {
          it.notes = q.type === 'rgrid' ? MQ.compareGrid(q, null).notes : MQ.compareRhythm(q, null).notes;
          it.wrong = !it.answered ? it.notes : Math.min(it.notes, Math.round(it.notes * (1 - skill) * rng() * 1.6));
          it.credit = it.wrong ? Math.min(6, Math.round(((it.notes - it.wrong) / Math.max(1, it.notes)) * 7)) : 7;
        }
        return it;
      });
      const scoring = quizScoring(cfg, qs);
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
      const steps = `<ol>\n  <li>Type your first and last name, then answer every question.</li>\n`
        + `  <li>When you finish, press <strong>Copy results link</strong>.</li>\n`
        + `  <li>Come back to this assignment, choose <strong>Start Assignment</strong> (or <strong>Submit Assignment</strong>), pick <strong>Website URL</strong>, paste the link, and submit.</li>\n</ol>`;
      const tabLink = `<a href="${esc(link)}" target="_blank" rel="noopener">open “${esc(title)}” in its own tab</a>`;
      // The recommended description: the steps, the quiz embedded under them, and its link. The quiz asks
      // Canvas to resize the frame to fit it; the link is for tablets and the Canvas app, where an
      // embedded page can't always bring up the keyboard.
      const embedded = `<p><strong>Take the quiz below.</strong> On a tablet, a phone or the Canvas app, ${tabLink} instead.</p>\n`
        + steps + `\n`
        + `<iframe src="${esc(link)}" title="${esc(title)}" width="100%" height="1000" style="border: 0; width: 100%;" allow="clipboard-write"></iframe>\n`
        + `<p>Quiz not showing, or the keyboard won’t come up? ${tabLink}.</p>`;
      // Link only: for schools that block embedded sites.
      const describe = `<p><strong>Take the quiz:</strong> <a href="${esc(link)}" target="_blank" rel="noopener">Open “${esc(title)}”</a></p>\n` + steps;
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
          h('li', null, 'Open the assignment description’s ', h('b', null, 'HTML editor'), ' (the ', h('code', null, '</>'), ' button) and paste the first box below — the quiz and its link in one. Save and publish.'),
          h('li', null, 'Students take the quiz, then submit their results link. In ', h('b', null, 'SpeedGrader'), ' each submission opens that student’s results — enter the score it shows.')),
        fld('Points in Canvas', ptsIn, pts ? `Results pages show each score out of ${pts}, ready to type into SpeedGrader.` : 'Optional. When set, results pages also show the score scaled to these points.'),
        box('cv-embed', 'Embed the quiz in Canvas, with the link to the quiz (recommended)', embedded,
          'Students read the steps, take the quiz right in the assignment, and have the link for a tablet, a phone or the Canvas app — where an embedded page can’t always bring up the keyboard. In a web browser the quiz grows to fit, so nothing is cut off. Works on a Canvas page too.', 8),
        box('cv-desc', 'Link only (if your school blocks embedded sites)', describe, 'The steps and a link that opens the quiz in its own tab.', 6),
        box('cv-link', 'Quiz link', link, 'The link on its own — for an announcement, a module item, or an external URL.'),
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

  // ---------- Clefwork Chord Graph: the builder ----------
  // Starting points modelled on the worksheets: tables, tritone graphs, phrases, or all three.
  const GRAPH_PRESETS = [
    { label: 'Diatonic tables', title: 'Diatonic Progression Table', counts: { cgtable: 4 } },
    { label: 'Tritone graphs', title: 'Tritone Substitution Graph', counts: { cgtritone: 3 } },
    { label: 'Musical phrases', title: 'Creating a Musical Phrase', counts: { cgphrase: 8 }, phrase: { mode: 3 } },
    { label: 'All three', title: 'Chord Graph', counts: { cgtable: 2, cgtritone: 1, cgphrase: 2 } },
  ];
  function graphPresets(cfg) {
    return h('div', { class: 'presets' }, h('span', { class: 'mini-label' }, 'Or start from a worksheet'),
      h('div', { class: 'preset-row' }, GRAPH_PRESETS.map((p) => h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
        const g = cfg.graph = MQ.graphSettings(cfg.graph);
        MQ.GRAPH_TYPES.forEach((k) => (cfg.counts[k] = p.counts[k] || 0));
        if (p.phrase) Object.assign(g.phrase, p.phrase);
        cfg.title = p.title;
        cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvShow = false; S.pvResp = null;
        saveDraft(); go('build'); toast(`Loaded the “${p.label}” worksheet`);
      } }, p.label))));
  }
  // The keys the tables and phrases are in, what the chords are, and how strictly they're marked.
  const GRAPH_KEY_SETS = [
    { label: 'Up to 3 ♯ or ♭', max: 3 }, { label: 'Up to 5', max: 5 }, { label: 'All 15', max: 7 },
  ];
  function graphKeysSection(cfg, changed) {
    const g = cfg.graph = MQ.graphSettings(cfg.graph);
    const keys = [];
    for (let f = -7; f <= 7; f++) keys.push({ f, major: MQ.MAJOR_KEYS[f + 7], minor: MQ.MINOR_KEYS[f + 7] });
    const findBox = grp('The relative minor', seg('cg-find', [{ v: 0, label: 'Printed — the key is given' }, { v: 1, label: 'Students work it out' }], g.findMinor, (v) => { g.findMinor = v; changed(); }),
      'Worked out, the tables leave the minor key’s name blank (a box of its own in the diatonic table) and don’t print its first chord.');
    findBox.hidden = !g.minor;
    return sec('cg-keys', 'Keys & chords', 'Every table is in one major key and its relative minor, and every phrase in one key — each in a different key while the choice lasts.',
      grp('Keys', chips('cg-keys', keys, g.keys, (m) => { g.keys = m; changed(); }, (x) => x.major, (x) => `${x.major} major and ${x.minor} minor — ${sigLabel(x.f).toLowerCase()}`),
        'Major keys, from seven flats to seven sharps. Each brings its relative minor.'),
      h('div', { class: 'btn-row cg-keysets' }, GRAPH_KEY_SETS.map((k) => h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
        g.keys = 0;
        for (let f = -k.max; f <= k.max; f++) g.keys |= MQ.graphKeyBit(f);
        saveDraft(); go('build');
      } }, k.label))),
      h('div', { class: 'row2' },
        grp('Chords', seg('cg-size', [{ v: 0, label: 'Triads' }, { v: 1, label: 'Seventh chords' }], g.sevenths, (v) => { g.sevenths = v; changed(); }),
          'Triads are B♭, Cmi, A°; sevenths B♭ma7, Cmi7, Ami7♭5. Tritone substitutes are always dominant sevenths.'),
        grp('Relative minor', seg('cg-minor', [{ v: 1, label: 'Include it' }, { v: 0, label: 'Major key only' }], g.minor, (v) => { g.minor = v; findBox.hidden = !v; changed(); }),
          'Minor uses VII, III and VI from the natural minor and ii° and V from the harmonic minor.')),
      findBox,
      grp('Chord quality', seg('cg-quality', [{ v: 0, label: 'Root and quality must be right' }, { v: 1, label: 'Half credit for the right root' }, { v: 2, label: 'Only the root counts' }], g.quality, (v) => { g.quality = v; changed(); }),
        'When the answer is Gmi, what G earns. The worksheets ask for the root and, preferably, the quality. Roman numerals work the same way: the right degree in the wrong case or quality.'));
  }
  function graphTablePanel(cfg, changed) {
    const g = cfg.graph = MQ.graphSettings(cfg.graph);
    return [
      h('p', { class: 'help' }, 'The key’s chords in the order the graph moves — vii° iii vi ii V I — with the major key’s numerals over its chord symbols, and the relative minor’s (VII III VI ii° V i) beneath. Above and below go the common-tone substitutions: IV for ii, vii° or IV for V (iv for ii°, VII or iv for V in minor). A box with two answers takes them in either order.'),
      grp('Roman numerals', seg('cg-romans', [{ v: 1, label: 'Printed — students write the chord symbols' }, { v: 0, label: 'Students write the numerals too' }], g.romans, (v) => { g.romans = v; changed(); })),
      grp('Common-tone substitutions', seg('cg-subs', [{ v: 1, label: 'Include them' }, { v: 0, label: 'Leave them out' }], g.subs, (v) => { g.subs = v; changed(); })),
    ];
  }
  function graphTritonePanel(cfg, changed) {
    const g = cfg.graph = MQ.graphSettings(cfg.graph);
    return [
      h('p', { class: 'help' }, 'The key’s chords round the circle of fifths — I vii° iii vi ii V I — for the major key and its relative minor. Above the major row and below the minor row go the tritone substitutes: the dominant seventh a half step above the next chord, which it leads to — a tritone from the chord it replaces. In minor, VI falls to ii° by a tritone, so VI’s substitute is a perfect fifth above it (B♭7 for E♭ in G minor: the tritone substitute of V7/ii°, from melodic minor’s raised sixth); that box is in italics, since it looks wrong but is right. Either spelling of a substitute counts (C♭7 or B7). The first chord of the major row is printed to give the key.'),
      grp('Roman numerals', seg('cg-ttromans', [{ v: 0, label: 'Hidden, as on the worksheet' }, { v: 1, label: 'Shown above each chord' }], g.ttRomans, (v) => { g.ttRomans = v; changed(); })),
    ];
  }
  function graphPhrasePanel(cfg, changed) {
    const g = cfg.graph = MQ.graphSettings(cfg.graph), p = g.phrase;
    const RULE_TEXT = [
      { label: 'Start on the tonic', title: 'The first measure is I (i in minor).' },
      { label: 'End with a cadence', title: 'The last chord is I (i), and the chord before it V, vii° or IV (V, VII or iv in minor).' },
      { label: 'Follow the chord graph', title: 'Each chord moves one column to the right in the graph, or stays; from I anything goes; V may also go to vi, iii or IV.' },
      { label: 'Half cadence halfway', title: 'Eight-measure phrases: measure 4 is V, vii° or IV (V, VII or iv in minor).' },
    ];
    return [
      h('p', { class: 'help' }, 'Students write a phrase in Roman numerals, one chord a measure, on two lines like the worksheet. There’s no single answer: each measure earns a point when its chord is one of the key’s (and, with the graph rule, follows from the chord before), and each other rule is a point. Students can hear their phrase; the answer key shows an example.'),
      h('div', { class: 'row2' },
        grp('Key', seg('cg-pmode', [{ v: 1, label: 'Major' }, { v: 2, label: 'Minor' }, { v: 3, label: 'Both' }], p.mode, (v) => { p.mode = v; changed(); }), 'Both takes turns, major first.'),
        grp('Measures', seg('cg-pbars', [{ v: 4, label: '4' }, { v: 8, label: '8' }], p.bars, (v) => { p.bars = v; changed(); }))),
      grp('Rules', chips('cg-prules', RULE_TEXT, p.rules, (m) => { p.rules = m; changed(); }, (x) => x.label, (x) => x.title, true),
        'The half cadence applies to eight-measure phrases.'),
      grp('Chord symbols', seg('cg-psym', [{ v: 0, label: 'Roman numerals only' }, { v: 1, label: 'Chord symbols too, in a key the quiz picks' }], p.symbols, (v) => { p.symbols = v; changed(); }),
        'Each chord symbol is a point, marked against the numeral the student wrote above it.'),
      grp('The chord graph', seg('cg-pgraph', [{ v: 1, label: 'Show it beside the phrase' }, { v: 0, label: 'Leave it out' }], p.showGraph, (v) => { p.showGraph = v; changed(); })),
    ];
  }
  function graphScoreSection(cfg, changed) {
    const g = cfg.graph = MQ.graphSettings(cfg.graph);
    const outIn = h('input', { type: 'number', id: 'cg-out', min: 1, max: 1000, inputmode: 'numeric', value: g.outOf });
    outIn.addEventListener('change', () => {
      g.outOf = Math.max(1, Math.min(1000, Math.round(+outIn.value || 100)));
      outIn.value = g.outOf;
      changed();
    });
    const outFld = fld('Total points', outIn, 'The score is the share of answers right, times this total — ready to type into a gradebook.');
    outFld.hidden = g.score !== 'percent';
    return sec('cg-score', 'Scoring', null,
      grp('Scoring', seg('cg-score', [{ v: 'answers', label: 'Each answer is a point' }, { v: 'question', label: 'Each table or phrase is one question' }, { v: 'percent', label: 'Percent of a total' }],
        g.score, (v) => { g.score = v; outFld.hidden = v !== 'percent'; changed(); }),
      'Each answer a point: a table is worth a point for every box, a phrase a point for every measure, rule and chord symbol — like marking the worksheet by hand. Half credit for a right root counts half a point.'),
      outFld);
  }

  // ---------- the library: public-domain pieces to use as examples ----------
  // Plays measures of a library piece (all its parts, or some), on the piano.
  function libraryEvents(piece, o) {
    const info = MQ.rhythmMeter(piece.meter), upb = MQ.RHYTHM_TEMPO_UNITS[info.tempo];
    const sec = 60 / ((o && o.tempo) || piece.tempo || 96) / upb, events = [];
    let end = 0;
    MQ.libraryNotes(piece, o).forEach((n) => {
      const vel = 0.3 / Math.sqrt(Math.max(1, n.midi.length));
      n.midi.forEach((m) => events.push({ at: n.u * sec, dur: n.d * sec, voice: 'piano', midi: m, vel }));
      end = Math.max(end, (n.u + n.d) * sec);
    });
    return { events, total: end + 0.2, marks: [] };
  }
  function libraryPlayButton(get, label) {
    const btn = h('button', { type: 'button', class: 'btn sm rh-mini-play' });
    const idle = () => { btn.classList.remove('is-playing'); btn.replaceChildren(svgEl(PLAY_ICON), document.createTextNode(label || 'Play')); };
    idle();
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-playing')) { MQ.Audio.stop(); return; }
      const pe = get();
      if (!MQ.Audio.sequence(pe.events, { total: pe.total, done: idle })) { toast('This browser can’t play sound.', 'bad'); return; }
      btn.classList.add('is-playing');
      btn.replaceChildren(svgEl(STOP), document.createTextNode('Stop'));
    });
    return btn;
  }
  // A library score's picture: from beside this page, or from the Clefwork site. Engraved scores are
  // gzipped SVG (.svg.gz), unpacked here unless the server already did.
  async function libraryScore(piece) {
    const tries = ['library/' + piece.score].concat(SITE ? [SITE + 'library/' + piece.score] : []);
    for (const url of tries) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        let blob = await res.blob();
        if (/\.svg(\.gz)?$/.test(piece.score)) {
          const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
          if (head[0] === 0x1f && head[1] === 0x8b) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
          blob = new Blob([blob], { type: 'image/svg+xml' });
        }
        return blob;
      } catch (e) { /* try the next place */ }
    }
    throw new Error(location.protocol === 'file:' ? 'Library scores load from the Clefwork website — open Clefwork Analysis there.' : 'The score couldn’t be loaded. Check the internet connection and try again.');
  }
  // A picture of the score, drawn white-backed and large enough for the analysis tools to read. An
  // engraved score's SVG gives only its shape (a viewBox), so it's given a size to draw at: 2400 wide.
  async function libraryBitmap(blob) {
    if (blob.type === 'image/svg+xml') {
      const text = await blob.text(), vb = text.match(/viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
      if (vb) blob = new Blob([text.replace(/<svg\b([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg\b([^>]*?)\sheight="[^"]*"/, '<svg$1')
        .replace(/<svg\b/, `<svg width="2400" height="${Math.round((2400 * +vb[2]) / +vb[1])}"`)], { type: 'image/svg+xml' });
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('The score couldn’t be drawn.')); img.src = url; });
      const w0 = img.naturalWidth || 1600, h0 = img.naturalHeight || 1200, k = Math.min(3, 2400 / w0);
      const c = document.createElement('canvas');
      c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return await createImageBitmap(c);
    } finally { URL.revokeObjectURL(url); }
  }
  // The library window. o.need: 'melody' (measures of one part to write as a melody), 'rhythm' (one or
  // two parts' rhythm), or 'score' (a picture to analyse); o.max: the most measures; o.onPick(piece,
  // {part, parts, from, count}) — or, for a score, o.onPick(piece).
  function openLibrary(o) {
    if (!MQ.LIBRARY_DATA) {
      toast('Opening the library…');
      MQ.libraryLoad().then(() => openLibrary(o), (e) => toast(e.message, 'bad'));
      return;
    }
    const need = o.need, max = o.max || 8;
    const st = S.lib = S.lib || { kind: '', text: '' };
    const dlg = h('dialog', { class: 'ex-dialog lib-dialog', 'aria-labelledby': 'lib-title' });
    const close = () => { MQ.Audio.stop(); dlg.close(); };
    const listEl = h('div', { class: 'lib-list', role: 'listbox', 'aria-label': 'Pieces' });
    const detail = h('div', { class: 'lib-detail' });
    const search = h('input', { type: 'search', class: 'lib-search', placeholder: 'Search by title, composer or style', 'aria-label': 'Search the library' });
    search.value = st.text;
    const fits = (p) => (need === 'score' ? !!p.score : MQ.libraryHeard(p));
    const kinds = [{ v: '', label: 'All' }].concat(MQ.LIBRARY_KINDS.map((k) => ({ v: k.id, label: k.label })));
    const kindSeg = seg('lib-kind', kinds, st.kind, (v) => { st.kind = v; drawList(); });
    let chosen = null, preset = null;
    const shown = () => MQ.libraryList({ kind: st.kind || null, text: st.text }).filter(fits);
    // A piece chosen at random from those listed — and for a melody or rhythm, measures that fit.
    const surprise = h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
      const list = shown();
      if (!list.length) { toast('No pieces match — clear the search or choose All.'); return; }
      if (need === 'score') { chosen = list[Math.floor(Math.random() * list.length)]; preset = null; }
      else {
        const [x] = MQ.libraryRandom({ need, kinds: MQ.LIBRARY_KINDS.map((k) => k.id), only: list.map((p) => p.id), count: 1, measures: Math.min(max, 4), max, ties: !!o.ties });
        if (!x) { toast('None of these pieces has measures that fit — try other pieces.'); return; }
        chosen = x.piece;
        preset = { part: x.part, parts: x.parts, from: x.from, count: x.count };
      }
      drawList(); drawDetail();
      const el = listEl.querySelector('[aria-selected="true"]');
      if (el) el.scrollIntoView({ block: 'nearest' });
    } }, '🎲 Pick at random');
    function drawList() {
      const list = shown();
      listEl.replaceChildren(...(list.length ? list.map((p) => {
        const b = h('button', { type: 'button', role: 'option', class: 'lib-item', 'aria-selected': String(chosen === p), onclick: () => { chosen = p; drawList(); drawDetail(); } },
          h('span', { class: 'lib-name' }, p.title),
          h('span', { class: 'lib-meta' }, MQ.libraryLine(p)),
          h('span', { class: 'lib-tags' }, h('span', { class: 'lib-tag' }, MQ.LIBRARY_KINDS.find((k) => k.id === p.kind).label),
            MQ.libraryHeard(p) ? h('span', { class: 'lib-tag is-heard' }, '♪ Can be heard') : null, p.score ? h('span', { class: 'lib-tag' }, 'Score') : null));
        return b;
      }) : [h('p', { class: 'empty' }, need === 'score' ? 'No scores match.' : 'No pieces you can hear match.')]));
    }
    function drawDetail() {
      const p = chosen;
      if (!p) { detail.replaceChildren(h('p', { class: 'help' }, 'Choose a piece to see it here.')); return; }
      const head = [h('h3', { class: 'lib-d-title' }, p.title), h('p', { class: 'lib-meta' }, MQ.libraryLine(p)),
        h('p', { class: 'fine lib-src' }, `${p.license}. ${p.source}.`)];
      if (need === 'score') {
        const img = h('div', { class: 'lib-score' }, h('p', { class: 'help' }, 'Loading the score…'));
        const use = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: () => { close(); o.onPick(p); } }, 'Use this score');
        detail.replaceChildren(...head, img, h('div', { class: 'btn-row' }, use, MQ.libraryHeard(p) ? libraryPlayButton(() => libraryEvents(p), 'Hear it') : null));
        libraryScore(p).then((blob) => {
          const url = URL.createObjectURL(blob);
          img.replaceChildren(h('img', { src: url, alt: `The score of ${p.title}` }));
          use.disabled = false;
        }, (e) => img.replaceChildren(h('p', { class: 'warn-note' }, e.message)));
        return;
      }
      // Measures to take: one part (a melody) or up to two (a rhythm), from a measure, so many long —
      // or the ones chosen at random.
      const sel = preset ? Object.assign({}, preset) : { part: 0, parts: [0], from: 0, count: Math.min(max, p.bars, 4) };
      preset = null;
      const partNames = p.parts.map((P, i) => ({ v: i, label: P.name || `Part ${i + 1}` }));
      const partPick = p.parts.length < 2 ? null : need === 'rhythm'
        ? grp('Parts', chips('lib-parts', p.parts, 1, (m) => { sel.parts = p.parts.map((_, i) => i).filter((i) => m & (1 << i)).slice(0, 2); sel.part = sel.parts[0]; draw(); }, (P, i) => P.name || 'Part', null), 'One or two: the first plays on the piano, the second on the oboe.')
        : grp('Part', seg('lib-part', partNames, sel.part, (v) => { sel.part = v; sel.parts = [v]; draw(); }));
      const fromIn = h('input', { type: 'number', id: 'lib-from', min: 1, max: p.bars, value: sel.from + 1, inputmode: 'numeric' });
      const countSeg = seg('lib-count', Array.from({ length: Math.min(max, p.bars) }, (_, i) => ({ v: i + 1, label: String(i + 1) })), sel.count, (v) => { sel.count = v; draw(); });
      fromIn.addEventListener('change', () => { sel.from = Math.max(0, Math.min(p.bars - 1, Math.round(+fromIn.value || 1) - 1)); fromIn.value = sel.from + 1; draw(); });
      const staffBox = h('div', { class: 'rstaff-box mstaff-box lib-staff' });
      const problems = h('div', { class: 'lib-probs' });
      const use = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        close();
        o.onPick(p, { part: sel.part, parts: sel.parts.slice(), from: sel.from, count: Math.min(sel.count, p.bars - sel.from) });
      } }, need === 'rhythm' ? 'Use this rhythm' : 'Use this melody');
      const play = libraryPlayButton(() => libraryEvents(p, { from: sel.from, to: sel.from + sel.count - 1, parts: need === 'rhythm' ? sel.parts : [sel.part] }), 'Play these measures');
      const all = libraryPlayButton(() => libraryEvents(p), 'Play the whole piece');
      function draw() {
        const count = Math.min(sel.count, p.bars - sel.from);
        const probs = [].concat(...(need === 'rhythm' ? sel.parts : [sel.part]).map((pi) => MQ.libraryExcerptProblems(p, pi, sel.from, count, { max, rhythmOnly: need === 'rhythm', ties: !!o.ties })));
        problems.replaceChildren(...(probs.length ? [h('p', { class: 'warn-note' }, `These measures can’t be used: ${probs.slice(0, 3).join(' ')}${probs.length > 3 ? ' …' : ''} Try other measures.`)] : []));
        use.disabled = !!probs.length || !sel.parts.length;
        staffBox.replaceChildren();
        const ex = MQ.libraryMelody(p, sel.part, sel.from, count);
        try { new MQ.MelodyStaff(staffBox, { meter: ex.meter, measures: count, parts: 1, layers: ex.layers, key: ex.key, clef: ex.clef, slots: count, readOnly: true }); } catch (e) { staffBox.append(h('p', { class: 'help' }, 'This part can’t be drawn here.')); }
      }
      detail.replaceChildren(...head,
        h('p', { class: 'help' }, `${MQ.melodyKeyName(p.key)} · ${p.meter.n}/${p.meter.d} · ${p.bars} measures`),
        partPick,
        h('div', { class: 'row2' }, fld('Starting at measure', fromIn), grp('Measures', countSeg, `Up to ${Math.min(max, p.bars)}.`)),
        staffBox, problems, h('div', { class: 'btn-row' }, use, play, all));
      draw();
    }
    search.addEventListener('input', () => { st.text = search.value; drawList(); });
    dlg.append(
      h('div', { class: 'ex-head' }, h('h2', { id: 'lib-title' }, o.title || 'Choose from the library'),
        h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: close, 'aria-label': 'Close' }, '✕')),
      h('p', { class: 'fine' }, need === 'score' ? 'Public-domain scores to analyse. Choose one, then box the chords as you would with your own picture.'
        : 'Public-domain pieces you can hear. Choose a piece and the measures to use; they’re copied into your quiz, so you can still change them.'),
      h('div', { class: 'lib-filters' }, kindSeg, search, surprise),
      h('div', { class: 'lib-body' }, listEl, detail));
    document.body.append(dlg);
    dlg.addEventListener('close', () => { MQ.Audio.stop(); dlg.remove(); });
    drawList(); drawDetail();
    dlg.showModal();
  }

  // ---------- the library: a builder's examples, chosen at random ----------
  // A builder's library mode: Clefwork chooses excerpts at random — how many, how long, from which kinds
  // of piece — and the teacher can swap any one for another, remove it, or choose one themselves. The
  // measures are copied in as written examples, so the quiz code carries them and they can be edited.
  // o: {id, need 'melody' | 'rhythm', max (measures), limit (examples), list (the examples, changed in
  // place), pick (its settings, kept with the draft), make(piece, sel) → an example, ok(example) → whether
  // it fits this tool, preview(example) → an element, noun, keyMax (offer a key-signature limit), parts
  // (offer two parts), changed()}.
  const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function libraryMode(o) {
    const P = o.pick;
    P.count = Math.max(1, Math.min(o.limit, P.count || Math.min(4, o.limit)));
    P.measures = Math.max(1, Math.min(o.max, P.measures || Math.min(4, o.max)));
    P.kinds = (P.kinds & 7) || 1;
    if (P.keyMax == null) P.keyMax = 4;
    P.parts = P.parts === 2 ? 2 : 1;
    const listEl = h('div', { class: 'lib-picks' });
    const status = h('p', { class: 'help', role: 'status' });
    const kinds = () => MQ.LIBRARY_KINDS.filter((_, i) => P.kinds & (1 << i)).map((k) => k.id);
    const label = (piece, x) => `${piece.title} — ${piece.by}, ${x.count > 1 ? `measures ${x.from + 1}–${x.from + x.count}` : `measure ${x.from + 1}`}`;
    const made = (x) => {
      const ex = o.make(x.piece, x);
      ex.from = label(x.piece, x);
      ex.lib = { id: x.piece.id, part: x.part, parts: x.parts, from: x.from, count: x.count };
      return ex;
    };
    const used = () => o.list.filter((ex) => ex.lib).map((ex) => ex.lib.id);
    async function choose(n, skip) {
      status.textContent = 'Choosing from the library…';
      try { await MQ.libraryLoad(); } catch (e) { status.textContent = ''; toast(e.message, 'bad'); return []; }
      const got = [], tried = (skip || []).slice();
      // More than needed, since some may not fit this tool (a rhythm grid's boxes, say).
      for (let round = 0; round < 3 && got.length < n; round++) {
        const xs = MQ.libraryRandom({ need: o.need, kinds: kinds(), count: (n - got.length) * 3, measures: P.measures, keyMax: o.keyMax ? P.keyMax : null, parts: o.parts ? P.parts : 1, max: o.max, skip: tried, ties: !!o.ties });
        if (!xs.length) break;
        xs.forEach((x) => { tried.push(x.piece.id); if (got.length < n) { const ex = made(x); if (!o.ok || o.ok(ex)) got.push(ex); } });
      }
      status.textContent = got.length < n ? `Only ${got.length} fit these choices — try more kinds of piece${o.keyMax ? ', more sharps and flats' : ''} or fewer measures.` : '';
      return got;
    }
    function draw() {
      listEl.replaceChildren(...(o.list.length ? o.list.map((ex, i) => h('div', { class: 'lib-pick' },
        h('div', { class: 'lib-pick-head' },
          h('strong', null, `${cap1(o.noun)} ${i + 1}`),
          h('span', { class: 'lib-pick-from' }, ex.from || 'Written by you'),
          h('span', { class: 'lib-pick-acts' },
            ex.lib ? h('button', { type: 'button', class: 'btn btn-quiet sm', title: 'Swap for another, chosen at random', onclick: async () => {
              const keep = Object.assign({}, P);
              P.measures = ex.lib.count;
              const [x] = await choose(1, used());
              Object.assign(P, keep);
              if (x) { o.list[i] = x; o.changed(); draw(); }
            } }, '🎲 Another') : null,
            h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': `Remove ${o.noun} ${i + 1}`, onclick: () => { o.list.splice(i, 1); o.changed(); draw(); } }, 'Remove'))),
        o.preview(ex)))
        : [h('p', { class: 'empty' }, `No ${o.noun}s yet. Choose some at random, or pick them yourself.`)]));
    }
    const countIn = counter(o.id + '-n', o.noun, (v) => { P.count = Math.max(1, v); saveDraft(); });
    countIn.sync(P.count, o.limit);
    const random = h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
      const got = await choose(P.count);
      if (!got.length) return;
      o.list.splice(0, o.list.length, ...got);
      o.changed(); draw();
      toast(`${got.length} ${o.noun}${got.length === 1 ? '' : 's'} chosen from the library`);
    } }, '🎲 Choose at random');
    const yourself = h('button', { type: 'button', class: 'btn', onclick: () => {
      if (o.list.length >= o.limit) { toast(`A quiz can have up to ${o.limit}.`); return; }
      openLibrary({ need: o.need, max: o.max, ties: o.ties, title: `A ${o.noun} from the library`, onPick: (piece, sel) => { o.list.push(made(Object.assign({ piece }, sel))); o.changed(); draw(); } });
    } }, '♪ Choose one yourself');
    draw();
    if (!o.list.length && o.autoFill) random.click();
    return h('div', { class: 'lib-mode' },
      h('p', { class: 'help' }, `Clefwork chooses ${o.noun}s from the library of public-domain pieces and copies the measures into the quiz. Choose again for others, swap any one, or pick one yourself; under “Write … myself” you can edit them.`),
      h('div', { class: 'row2' }, grp(`How many ${o.noun}s`, countIn, `Up to ${o.limit}.`),
        grp('Measures in each', seg(o.id + '-m', Array.from({ length: o.max }, (_, i) => ({ v: i + 1, label: String(i + 1) })), P.measures, (v) => { P.measures = v; saveDraft(); }))),
      grp('From', chips(o.id + '-k', MQ.LIBRARY_KINDS, P.kinds, (m) => { P.kinds = m; saveDraft(); }, (k) => `${k.plural} · ${MQ.libraryIndexList({ kind: k.id, heard: true }).length}`),
        o.need === 'rhythm' ? 'A piece’s top part — a hymn’s soprano, a piano piece’s right hand.' : 'Each piece’s top line: a hymn’s soprano, a piano piece’s right hand.'),
      o.keyMax ? grp('Key signatures up to', seg(o.id + '-key', [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ v, label: v ? String(v) : 'None' })), P.keyMax, (v) => { P.keyMax = v; saveDraft(); }), 'Sharps or flats.') : null,
      o.parts ? grp('Parts', seg(o.id + '-parts', [{ v: 1, label: 'One — the top part' }, { v: 2, label: 'Two — the top and bottom parts' }], P.parts, (v) => { P.parts = v; saveDraft(); }), 'Two parts play on the piano and the oboe.') : null,
      h('div', { class: 'btn-row' }, random, yourself), status, listEl);
  }
  const melodyPreview = (ex) => {
    const box = h('div', { class: 'rstaff-box mstaff-box' });
    try { new MQ.MelodyStaff(box, { meter: ex.meter, measures: ex.measures, parts: 1, layers: ex.layers, key: ex.key, clef: ex.clef, slots: ex.measures, readOnly: true }); } catch (e) { /* drawn without the staff */ }
    return h('div', { class: 'lib-pick-body' }, h('div', { class: 'lib-pick-meta' }, h('span', { class: 'help' }, `${MQ.melodyKeyName(ex.key)} · ${ex.meter.n}/${ex.meter.d} · ${ex.measures} measure${ex.measures > 1 ? 's' : ''}`), rhythmPlayButton(ex)), box);
  };
  const rhythmPreview = (ex) => {
    const box = h('div', { class: 'rstaff-box' });
    try { new MQ.RhythmStaff(box, { meter: ex.meter, measures: ex.measures, parts: ex.parts, layers: ex.layers, readOnly: true }); } catch (e) { /* drawn without the staff */ }
    return h('div', { class: 'lib-pick-body' }, h('div', { class: 'lib-pick-meta' }, h('span', { class: 'help' }, `${ex.meter.n}/${ex.meter.d} · ${ex.measures} measure${ex.measures > 1 ? 's' : ''}${ex.parts > 1 ? ' · two parts' : ''}`), rhythmPlayButton(ex)), box);
  };
  // A written example that's still empty (the one a new quiz starts with).
  const blankExample = (ex) => !ex.layers || !ex.layers.some((L) => L && L.some((m) => m && m.length));

  // ---------- Clefwork Terms: the builder ----------
  const TERM_PRESETS = [
    { label: 'Dynamics & tempo', title: 'Dynamics and Tempo', counts: { tmdyn: 10, tmtempo: 10 } },
    { label: 'Instrument families', title: 'Instrument Families', counts: { tminst: 12 } },
    { label: 'Textbook vocabulary', title: 'Musical Vocabulary', counts: { tmvocab: 15 } },
    { label: 'Listening', title: 'Hearing Dynamics and Tempo', counts: { tmhdyn: 6, tmhtempo: 6 } },
    { label: 'Everything', title: 'Musical Terms', counts: { tmdyn: 5, tmtempo: 5, tminst: 5, tmvocab: 6, tmhdyn: 3, tmhtempo: 3 } },
  ];
  function termPresets(cfg) {
    return h('div', { class: 'presets' }, h('span', { class: 'mini-label' }, 'Or start from a preset'),
      h('div', { class: 'preset-row' }, TERM_PRESETS.map((p) => h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
        cfg.terms = MQ.termSettings(cfg.terms);
        MQ.TERM_COUNTS.forEach((k) => (cfg.counts[k] = p.counts[k] || 0));
        cfg.title = p.title;
        cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvShow = false; S.pvResp = null;
        saveDraft(); go('build'); toast(`Loaded the “${p.label}” preset`);
      } }, p.label))));
  }
  function termChoicesSection(cfg, changed) {
    const s = cfg.terms = MQ.termSettings(cfg.terms);
    return sec('tm-choices', 'Answer choices', 'Every question is multiple choice, with one right answer.',
      grp('Choices in each question', seg('tm-nchoices', [3, 4, 5, 6].map((v) => ({ v, label: String(v) })), s.choices, (v) => { s.choices = v; changed(); }),
        'Except where the question sets them: an instrument’s family lists every family in the quiz, louder or softer (faster or slower) has three, and how a melody changes lists the changes you choose. A question has fewer when too few terms fit.'));
  }
  const TERM_PLAYS = [{ v: 0, label: 'Unlimited' }].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v, label: v === 1 ? 'Once' : `${v} times` })));
  function termDynPanel(cfg, changed) {
    const d = (cfg.terms = MQ.termSettings(cfg.terms)).dyn;
    const ASKS = [
      { label: 'What a marking means', title: 'What does mf mean? — Moderately loud' },
      { label: 'The marking for a meaning', title: 'Which marking means “very soft”? — pp' },
      { label: 'Loudest or softest', title: 'Which of these is the loudest? — ff (of p, mf, f, ff)' },
      { label: 'The Italian name', title: 'What is the Italian name for mf? — mezzo forte' },
    ];
    return [
      h('p', { class: 'help' }, 'Students see a marking as it’s printed in music — mf in bold italics, a hairpin drawn opening or closing — and choose what it means or what it’s called; or read a meaning and choose the marking. Markings that mean the same thing (decresc., dim. and >) never appear in one question together.'),
      grp('Markings', chips('tm-dyn-terms', MQ.TERM_DYNAMICS, d.terms, (m) => { d.terms = m; changed(); }, (t) => dynMark(t), (t) => `${t.hairpin ? `${t.name} hairpin` : `${t.sign} — ${t.name}`}: ${t.means}`),
        'Every question is about one of these. The other choices come from these first, then from the rest of the list.'),
      grp('Ways of asking', chips('tm-dyn-ask', ASKS, d.ask, (m) => { d.ask = m; changed(); }, (x) => x.label, (x) => x.title),
        'The questions take turns. Loudest or softest needs at least two of ppp to fff.'),
    ];
  }
  function termTempoPanel(cfg, changed) {
    const t = (cfg.terms = MQ.termSettings(cfg.terms)).tempo;
    const ASKS = [
      { label: 'What a term means', title: 'What does Andante mean? — At a walking pace' },
      { label: 'The term for a meaning', title: 'Which term means “gradually slower”? — ritardando' },
      { label: 'Fastest or slowest', title: 'Which of these is the fastest? — Presto (of Largo, Andante, Allegro, Presto)' },
      { label: 'Beats per minute', title: 'About how many beats a minute is Allegro? — 120–156' },
    ];
    return [
      h('p', { class: 'help' }, 'Tempo markings from Grave to Prestissimo, and the words for changing tempo. Tempos next to each other (Largo and Lento, Moderato and Allegretto) are too close to tell apart, so they never appear in one question together. The beats a minute are the usual metronome ranges, which books give a little differently.'),
      grp('Terms', chips('tm-tempo-terms', MQ.TERM_TEMPOS, t.terms, (m) => { t.terms = m; changed(); }, (x) => x.term, (x) => `${x.term}${x.abbr ? ` (${x.abbr})` : ''}: ${x.means}${x.bpm ? `, about ${MQ.termBpmText(x)} beats a minute` : ''}`),
        'The first eleven are tempos, slowest to fastest; the last five change the tempo.'),
      grp('Ways of asking', chips('tm-tempo-ask', ASKS, t.ask, (m) => { t.ask = m; changed(); }, (x) => x.label, (x) => x.title),
        'The questions take turns. Fastest or slowest and beats per minute use the tempos, not the changes.'),
    ];
  }
  function termInstPanel(cfg, changed) {
    const ins = (cfg.terms = MQ.termSettings(cfg.terms)).inst;
    const warn = h('p', { class: 'warn-note' });
    const sync = () => {
      const n = ins.pick.filter(Boolean).length;
      warn.hidden = n >= 2;
      warn.textContent = n ? 'Choose instruments from at least two families. Until then, every family is a choice.' : 'Choose some instruments. Until then, the quiz uses the usual orchestra instruments.';
    };
    sync();
    const ASKS = [
      { label: 'An instrument’s family', title: 'Which instrument family is the saxophone in? — Woodwind' },
      { label: 'Which one is in a family', title: 'Which of these is a brass instrument? — Trombone' },
      { label: 'Which one isn’t', title: 'Which of these is not a woodwind instrument? — Trumpet' },
    ];
    return [
      h('p', { class: 'help' }, 'Choose the instruments to ask about. A family with none chosen is left out, and isn’t offered as a choice. The piano is in the keyboard family here: leave keyboards out if your class counts it with the strings or percussion. For instruments that often catch students out — the saxophone, flute, French horn, English horn, harp, timpani, xylophone — the answer says why.'),
      ...MQ.TERM_FAMILIES.map((F, fi) => grp(F.label, chips('tm-inst-' + F.id, F.list, ins.pick[fi], (m) => { ins.pick[fi] = m; sync(); changed(); }, (x) => x.name, (x) => x.why || null, true))),
      warn,
      grp('Ways of asking', chips('tm-inst-ask', ASKS, ins.ask, (m) => { ins.ask = m; changed(); }, (x) => x.label, (x) => x.title), 'The questions take turns.'),
    ];
  }
  function termVocabPanel(cfg, changed) {
    const v = (cfg.terms = MQ.termSettings(cfg.terms)).vocab;
    const CATS = MQ.TERM_VOCAB_CATS;
    const ASKS = [
      { label: 'The definition of a term', title: 'Which definition fits “enharmonic”? — One pitch with two different note names' },
      { label: 'The term for a definition', title: 'Which term means “short lines that extend the staff”? — ledger lines' },
    ];
    // Every term in the chosen categories, with its definition and page, to check the wording.
    const list = h('div', { class: 'tm-vlist' });
    const drawList = () => {
      list.replaceChildren(...CATS.map((c, ci) => (v.cats & (1 << ci) ? h('div', { class: 'tm-vcat' }, h('h4', null, c.label),
        h('dl', null, MQ.TERM_VOCAB.filter((t) => t.cat === ci && (!v.book || t.pg)).map((t) => h('div', { class: t.pg ? null : 'is-common' },
          h('dt', null, t.term), h('dd', null, t.means, t.pg ? h('span', { class: 'tm-pg' }, ` p. ${t.pg}`) : h('span', { class: 'tm-pg' }, ' common')))))) : null)));
    };
    drawList();
    return [
      h('p', { class: 'help' }, 'The first six categories are the bold-face terms of the course textbook, Harmony in Contemporary Music, as the book defines them (with a few common terms that fit there); the answer to each gives its page. The last four are other common terms that aren’t in the book. The wrong choices come from the same category first. Terms that could fit one definition — half step and semitone, bar and measure — never share a question.'),
      grp('Categories', chips('tm-vocab-cats', CATS, v.cats, (m) => { v.cats = m; drawList(); changed(); }, (c) => `${c.label} · ${c.book ? c.fromBook : c.count}`, (c) => (c.book ? `${c.fromBook} terms from the textbook, ${c.count - c.fromBook} common ones` : `${c.count} common terms, not in the textbook`)),
        'The number is how many terms each has; the first six are from the textbook.'),
      grp('Which terms', seg('tm-vocab-book', [{ v: 0, label: 'Textbook and common terms' }, { v: 1, label: 'Only the textbook’s terms' }], v.book, (x) => { v.book = x; drawList(); changed(); }),
        'Only the textbook’s terms leaves out the common ones in the first six categories. Categories with no textbook terms still use theirs.'),
      grp('Ways of asking', chips('tm-vocab-ask', ASKS, v.ask, (m) => { v.ask = m; changed(); }, (x) => x.label, (x) => x.title), 'The questions take turns.'),
      h('details', { class: 'fine-details tm-vterms' }, h('summary', null, 'See the terms and definitions'), list),
    ];
  }
  // Where a listening tab's melodies come from: Clefwork's own, or library pieces of the kinds chosen.
  function termMelodySource(b, id, changed) {
    const kinds = h('div', { hidden: !b.lib || null },
      grp('Kinds of piece', chips(id + '-kinds', MQ.LIBRARY_KINDS, b.lib || 1, (m) => { b.lib = m; changed(); }, (k) => `${k.plural} · ${MQ.libraryIndexList({ kind: k.id, heard: true }).length}`),
        'The number is how many pieces of each kind the library has. Each question plays the opening of a phrase: two measures, or four for a change.'));
    return [grp('Melodies', seg(id + '-src', [{ v: 0, label: 'Made by Clefwork' }, { v: 1, label: 'From the library' }], b.lib ? 1 : 0, (v) => {
      b.lib = v ? b.lib || 1 : 0;
      b.libv = MQ.LIBRARY_VERSION || 1;
      kinds.hidden = !v;
      changed();
    }), 'Library pieces are public domain: folk songs, hymns, and classical melodies, some with chords.'), kinds];
  }
  function termHearDynPanel(cfg, changed) {
    const d = (cfg.terms = MQ.termSettings(cfg.terms)).hdyn;
    const TASKS = [
      { label: 'Louder or softer', title: 'The melody twice: was it louder, softer or about the same the second time?' },
      { label: 'Name the dynamic', title: 'The melody twice, the first time mf: which marking fits the second time?' },
      { label: 'How it changes', title: 'The melody once: crescendo, decrescendo, the same all through, or a sudden change' },
    ];
    const LEVELS = MQ.TERM_HEAR_LEVELS.map((L) => MQ.TERM_DYNAMICS[L.dyn]);
    return [
      h('p', { class: 'help' }, 'Clefwork makes a short melody for each question, as Clefwork Melody does at its easy level, and plays it on the piano. Loudness can only be judged against something, so each question plays the melody twice, or once while it changes — never one playing on its own. The dynamics are about 5½ dB apart, and louder notes are brighter, as on a real piano. Students can play a sound check first to set their volume.'),
      grp('Tasks', chips('tm-hdyn-tasks', TASKS, d.tasks, (m) => { d.tasks = m; changed(); }, (x) => x.label, (x) => x.title), 'The questions take turns.'),
      grp('Dynamics played', chips('tm-hdyn-levels', LEVELS, d.levels, (m) => { d.levels = m; changed(); }, (t) => dynMark(t), (t) => `${t.sign} — ${t.name}`),
        'For louder or softer, and naming the dynamic. Choose at least two. Changes always go between pp or p and f or ff.'),
      grp('Changes to choose from', chips('tm-hdyn-changes', MQ.TERM_DYN_CHANGES, d.changes, (m) => { d.changes = m; changed(); }, (x) => x.label), 'Every one chosen is a choice in How it changes. Choose at least two.'),
      grp('The other choices', seg('tm-hdyn-spread', [{ v: 1, label: 'Far apart — easier' }, { v: 0, label: 'Close together — harder' }], d.spread, (v) => { d.spread = v; changed(); }),
        'Far apart: in louder or softer the two playings are at least two steps apart (mf and ff, not mf and f), and in naming the dynamic the wrong choices are at least two steps from the answer.'),
      fld('Plays of each melody', selectEl('tm-hdyn-plays', TERM_PLAYS, d.plays, (v) => { d.plays = +v; changed(); }), 'Per question. Both playings together count as one play; the sound check doesn’t count.'),
      ...termMelodySource(d, 'tm-hdyn', changed),
    ];
  }
  function termHearTempoPanel(cfg, changed) {
    const t = (cfg.terms = MQ.termSettings(cfg.terms)).htempo;
    const TASKS = [
      { label: 'Faster or slower', title: 'The melody twice: was it faster, slower or about the same the second time?' },
      { label: 'Name the tempo', title: 'The melody once, at a tempo from Largo to Presto: which marking fits it?' },
      { label: 'How it changes', title: 'The melody once: accelerando, ritardando, a steady tempo, or slowing then a tempo' },
    ];
    const TEMPOS = MQ.TERM_HEAR_TEMPOS.map((x) => Object.assign({ bpm: x.bpm }, { term: MQ.TERM_TEMPOS[x.tempo].term }));
    return [
      h('p', { class: 'help' }, 'Clefwork makes a short melody for each question and plays it on the piano. To name a tempo, the melody plays near the middle of the marking’s range — Largo at about 50 beats a minute, Presto at about 184 — and a short melody at a fast tempo plays through more than once, so there’s time to hear it. Changes speed up or slow down from the second measure.'),
      grp('Tasks', chips('tm-htempo-tasks', TASKS, t.tasks, (m) => { t.tasks = m; changed(); }, (x) => x.label, (x) => x.title), 'The questions take turns.'),
      grp('Tempos played', chips('tm-htempo-tempos', TEMPOS, t.tempos, (m) => { t.tempos = m; changed(); }, (x) => `${x.term} · ${x.bpm}`, (x) => `${x.term}, played at about ${x.bpm} beats a minute`),
        'For naming the tempo: the answers, and the other choices. Choose at least two.'),
      grp('Changes to choose from', chips('tm-htempo-changes', MQ.TERM_TEMPO_CHANGES, t.changes, (m) => { t.changes = m; changed(); }, (x) => x.label), 'Every one chosen is a choice in How it changes. Choose at least two.'),
      h('div', { class: 'row2' },
        grp('The other choices', seg('tm-htempo-spread', [{ v: 1, label: 'Far apart — easier' }, { v: 0, label: 'Close together — harder' }], t.spread, (v) => { t.spread = v; changed(); }),
          'Far apart: the wrong tempos are at least two away from the answer (Andante against Largo or Allegro, not Adagio or Moderato), and faster or slower is at least 1.4 times as fast.'),
        grp('The beat', seg('tm-htempo-beat', [{ v: 1, label: 'A click on every beat' }, { v: 0, label: 'The melody alone' }], t.beat, (v) => { t.beat = v; changed(); }))),
      fld('Plays of each melody', selectEl('tm-htempo-plays', TERM_PLAYS, t.plays, (v) => { t.plays = +v; changed(); }), 'Per question. Both playings together count as one play; the sound check doesn’t count.'),
      ...termMelodySource(t, 'tm-htempo', changed),
    ];
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
  const ASK_LABEL = { roman: 'Roman numeral', symbol: 'Chord symbol', both: 'Roman numeral & chord symbol', nht: 'Non-harmonic tones', key: 'Key change', open: 'Opening key' };
  const letter = (i) => String.fromCharCode(97 + (i % 26));
  const KEY_COLOR = '#7b3fd4';
  // A menu of every key, major then minor; value: an index into MQ.ANALYSIS_KEYS (−1: none chosen).
  function keySelect(id, value, onPick, none) {
    const opts = [{ v: -1, label: none || '— choose the key —' }].concat(MQ.ANALYSIS_KEYS.map((k, j) => ({ v: j, label: MQ.analysisKeyText(k) })));
    return selectEl(id, opts, value == null ? -1 : value, (v) => onPick(+v < 0 ? null : +v));
  }
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
  // One stage of linked boxes: the numeral (or a dash, going on from the box before) and its figures.
  function stageDisplay(st) {
    if (!st) return '';
    if (st.base && st.base.kind !== 'rn') return romanDisplay(st.base);
    const r = st.base ? MQ.romanParts(st.base) : null;
    const toks = MQ.figTokens(st.figs).map((x) => x.replace('#', '♯').replace('b', '♭'));
    const el = h('span', { class: 'fig-rn' }, r ? accText(r.numeral) : '–');
    if (toks.length === 1) el.append(h('sub', { class: 'fig-one' }, toks[0]));
    else if (toks.length) el.append(h('span', { class: 'fig-stack' + (toks.length > 2 ? ' is-three' : '') }, ...toks.map((x) => h('span', null, x))));
    if (r && r.target) el.append(accText(r.target));
    return el;
  }
  const romanOrStage = (w, chain) => (chain ? stageDisplay(MQ.parseStage(w)) : romanDisplay(MQ.parseAnalysisRoman(w))) || romanDisplay(MQ.parseAnalysisRoman(w)) || stageDisplay(MQ.parseStage(w));
  const orList = (items) => items.map((x, j) => [j ? h('span', { class: 'an-or' }, ' or ') : null, x]);
  const romanAnswers = (list, chain) => orList(list.map((w) => romanOrStage(w, chain) || w));
  // Circles on the music and the lines joining pairs, placed in a view of the picture ({x0, y0, cw, ch}
  // — all of it unless given). T gives the circles' size; c and l are the circles and pairs to draw.
  // o: {color, sel (a circle), marks {c, l} (true right, false wrong, null), missed (dashed: what the
  // student didn't find), tags (true letters, 'kind' letters and kinds)}.
  const SVGNS = 'http://www.w3.org/2000/svg';
  function circleLayer(T, c, l, view, o) {
    const v = Object.assign({ x0: 0, y0: 0, cw: 1, ch: 1 }, view), opt = o || {};
    const X = (x) => (x - v.x0) / v.cw, Y = (y) => (y - v.y0) / v.ch;
    const markCls = (m) => (m === true ? ' is-right' : m === false ? ' is-wrong' : '');
    const pairOf = (i) => l.findIndex((p) => p.a === i || p.b === i);
    const out = [];
    if (l.length) {
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'an-pairs');
      svg.setAttribute('viewBox', '0 0 1000 1000');
      svg.setAttribute('preserveAspectRatio', 'none');
      l.forEach((p, k) => {
        const A = c[p.a], B = c[p.b];
        if (!A || !B) return;
        // From edge to edge, so the line doesn't cross the notes.
        const dx = (B.x - A.x) / T.rx, dy = (B.y - A.y) / T.ry, d = Math.hypot(dx, dy) || 1, cut = d > 2.2 ? 1 / d : 0;
        const ln = document.createElementNS(SVGNS, 'line');
        ln.setAttribute('x1', (X(A.x + (B.x - A.x) * cut) * 1000).toFixed(1));
        ln.setAttribute('y1', (Y(A.y + (B.y - A.y) * cut) * 1000).toFixed(1));
        ln.setAttribute('x2', (X(B.x - (B.x - A.x) * cut) * 1000).toFixed(1));
        ln.setAttribute('y2', (Y(B.y - (B.y - A.y) * cut) * 1000).toFixed(1));
        ln.setAttribute('class', 'an-pair' + markCls(opt.marks && opt.marks.l ? opt.marks.l[k] : null) + (opt.missed ? ' is-missed' : ''));
        ln.setAttribute('style', `--c:${opt.color || 'var(--accent)'}`);
        svg.append(ln);
      });
      out.push(svg);
    }
    c.forEach((p, i) => {
      if (!p) return;                                   // a circle left out (null keeps the others' places)
      const k = pairOf(i);
      const m = !opt.marks ? null : k >= 0 ? (opt.marks.l || [])[k] : (opt.marks.c || [])[i];
      const tag = opt.tags ? letter(i) + (opt.tags === 'kind' && k < 0 && p.t >= 0 ? ' ' + MQ.nhtShort(p.t) : '') : null;
      out.push(h('span', {
        class: 'an-circ' + markCls(m) + (opt.missed ? ' is-missed' : '') + (opt.sel === i ? ' is-sel' : ''),
        style: `--c:${opt.color || 'var(--accent)'};left:${pct(X(p.x - T.rx))};top:${pct(Y(p.y - T.ry))};width:${pct((2 * T.rx) / v.cw)};height:${pct((2 * T.ry) / v.ch)}`,
      }, tag ? h('span', { class: 'an-circ-tag' }, tag) : null));
    });
    return out;
  }
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
    // Linked boxes read their figures as intervals above the bass; the next box takes figures alone.
    const chain = roman && (q.an.link || q.an.linked);
    if (roman && q.an.linked) { inp.placeholder = o.sheet ? 'figs' : '53'; inp.setAttribute('aria-label', `Box ${q.an.n + 1}: figures, going on from box ${q.an.n}`); }
    const answer = () => (mark ? mark.full() : inp.value);
    const mark = roman && !q.an.linked ? markPicker(inp.id + '-mark', inp, () => { draw(); if (onInput) onInput(answer()); }) : null;
    const pv = h('span', { class: 'an-pv' });
    const draw = () => {
      const t = answer().trim();
      const p = t ? (chain ? MQ.parseStage(t) : roman ? MQ.parseAnalysisRoman(t) : MQ.symbolOk(t)) : null;
      inp.classList.toggle('is-invalid', !!t && !p);
      pv.replaceChildren(!t ? '' : !p ? h('span', { class: 'fig-unread is-bad' }, chain && q.an.linked ? 'not figures' : roman ? 'not a numeral' : 'not a symbol')
        : chain ? stageDisplay(p) : roman ? romanDisplay(p) : h('span', { class: 'fig-rn' }, MQ.symbolText(t)));
    };
    inp.addEventListener('input', () => {
      if (!roman) upperFirst(inp);
      draw();
      if (onInput) onInput(answer());
    });
    if (o.locked || o.keyMode) { inp.disabled = true; if (mark) mark.sel.disabled = true; }
    draw();
    const cell = h('div', { class: 'an-field' }, inp, mark ? mark.sel : null, pv);
    if (o.reveal && !o.keyMode) {
      const ok = MQ.markAnalysisPart(q, k, { [k]: value }, cfg);
      cell.classList.add(ok ? 'is-right' : 'is-wrong');
      pv.replaceChildren(ok ? h('span', { class: 'fig-mark is-right' }, '✓')
        : h('span', { class: 'fig-mark is-wrong' }, '✗ ', roman ? romanAnswers(q.an.roman, chain) : symbolAnswers(q.an.symbol)));
    }
    return { el: cell, input: inp };
  }

  // Part of the score around one box — the whole system when there's room — with the box highlighted.
  // overlay(view) (optional) adds circles, in the crop's view of the picture; noHl leaves out the
  // highlight of r (which then only says what to show).
  function scoreCrop(sc, r, color, overlay, noHl) {
    let x0 = Math.max(0, r.x - Math.max(r.w * 1.5, 0.12)), x1 = Math.min(1, r.x + r.w + Math.max(r.w * 1.5, 0.12));
    let y0 = Math.max(0, r.y - Math.max(r.h * 0.6, 0.05)), y1 = Math.min(1, r.y + r.h + Math.max(r.h * 0.6, 0.05));
    const b = sc.bands[MQ.bandOf(r, sc.bands)];
    if (b.y1 - b.y0 < 0.45) { y0 = Math.min(y0, Math.max(0, b.y0 - 0.01)); y1 = Math.max(y1, Math.min(1, b.y1 + 0.01)); }
    const cw = x1 - x0, ch = y1 - y0;
    // No taller than 320px on screen, however narrow the part of the music is.
    const maxW = Math.round((320 * cw * sc.w) / (ch * sc.h));
    return h('div', { class: 'an-crop', style: `aspect-ratio:${(cw * sc.w).toFixed(1)} / ${(ch * sc.h).toFixed(1)};max-width:${Math.max(maxW, overlay ? 640 : 0)}px` },
      h('img', { src: sc.url, alt: 'The part of the score this question is about', draggable: 'false', style: `width:${pct(1 / cw)};left:${pct(-x0 / cw)};top:${pct(-y0 / ch)}` }),
      noHl ? null : h('span', { class: 'an-hl is-active', style: boxStyle({ x: (r.x - x0) / cw, y: (r.y - y0) / ch, w: r.w / cw, h: r.h / ch }, color) }),
      overlay ? overlay({ x0, y0, cw, ch }) : null);
  }
  // One Analysis question on its own: in the grade checker, on results pages and in answer keys.
  function analysisCard(q, cfg, o) {
    const wrap = h('div', { class: 'qcard an-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, ASK_LABEL[q.an.ask])));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    const pic = h('div', { class: 'an-crop-host' });
    wrap.append(pic);
    if (q.an.ask === 'nht') return nhtCard(q, cfg, o, wrap, pic);
    if (q.an.ask === 'key') return keyCard(q, cfg, o, wrap, pic);
    if (q.an.ask === 'open') {
      const v = o.response || {}, ok = MQ.gradeAnalysis(q, v) === 1, reveal = !!o.reveal && !o.keyMode;
      pic.remove();
      wrap.append(h('ul', { class: 'an-nht-list' }, h('li', { class: reveal ? (ok ? 'is-right' : 'is-wrong') : '' }, h('b', null, 'Opening key: '),
        o.keyMode ? MQ.analysisKeyText(q.an.key) : v.k != null ? MQ.analysisKeyText(MQ.ANALYSIS_KEYS[v.k]) : h('i', null, 'not chosen'), reveal ? (ok ? ' ✓' : ' ✗') : '')));
      if (o.keyMode) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
      else if (o.reveal) wrap.append(resultLine(q, cfg, o.response));
      return wrap;
    }
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

  // A key change on its own: the student's box (marked once checked) beside the teacher's, and the new key.
  // Shared results without the answers show only what the student drew.
  function keyCard(q, cfg, o, wrap, pic) {
    const v = o.response || {}, key = !!o.keyMode, reveal = !!o.reveal && !key, T = q.an.region, b = key ? null : v.b;
    const showT = key || reveal || !q.an.hide;
    const union = (a, c) => (!a ? c : !c ? a : { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.max(a.x + a.w, c.x + c.w) - Math.min(a.x, c.x), h: Math.max(a.y + a.h, c.y + c.h) - Math.min(a.y, c.y) });
    const basis = union(showT ? T : null, b) || T;
    const okB = q.an.hide && b ? MQ.keyBoxRight(T, b, q.an.tol) : null;
    const overlay = (view) => {
      const at = (r) => boxStyle({ x: (r.x - view.x0) / view.cw, y: (r.y - view.y0) / view.ch, w: r.w / view.cw, h: r.h / view.ch }, KEY_COLOR);
      return [showT ? h('span', { class: 'an-kbox is-answer' + (q.an.hide ? '' : ' is-shown'), style: at(T) }) : null,
        b ? h('span', { class: 'an-kbox' + (reveal ? (okB ? ' is-right' : ' is-wrong') : ''), style: at(b) }, h('span', { class: 'an-kmark-tag' }, 'Student')) : null].filter(Boolean);
    };
    loadScore(q.an.img).then((sc) => pic.replaceChildren(sc ? scoreCrop(sc, basis, KEY_COLOR, overlay, true)
      : h('p', { class: 'fine' }, 'The music isn’t saved on this device, so only the answers are shown.')));
    const lines = [];
    if (q.an.hide) lines.push(h('li', { class: reveal ? (okB ? 'is-right' : 'is-wrong') : '' }, h('b', null, 'Where: '), !b ? h('i', null, 'no box drawn') : reveal ? (okB ? 'the right chord ✓' : 'not the chord where the key changes ✗') : 'box drawn'));
    if (q.an.askKey || !q.an.hide) {
      const okK = MQ.analysisKeyPartRight(q, 'k', v);
      lines.push(h('li', { class: reveal ? (okK ? 'is-right' : 'is-wrong') : '' }, h('b', null, 'New key: '), key ? MQ.analysisKeyText(q.an.key) : v.k != null ? MQ.analysisKeyText(MQ.ANALYSIS_KEYS[v.k]) : h('i', null, 'not chosen'), reveal ? (okK ? ' ✓' : ' ✗') : ''));
    }
    if (!key) wrap.append(h('ul', { class: 'an-nht-list' }, lines));
    if (key) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) {
      wrap.append(resultLine(q, cfg, o.response));
      if (q.an.hide) wrap.append(h('p', { class: 'fine' }, `The dashed box is the answer. A box counts when its sides are within ${q.an.tol}% of the answer’s width and it sits mostly within the answer’s height.`));
    }
    return wrap;
  }
  // What the student didn't find: the teacher's circles and pairs with nothing on them (null keeps the
  // other circles' places, so the pairs still point at the right ones).
  function nhtMissed(T, cmp) {
    const l = T.l.filter((_, k) => !cmp.foundL[k]);
    const c = T.c.map((x, j) => {
      const alone = !MQ.analysisInPair(T.l, j) && !cmp.foundC[j];
      const inMissedPair = l.some((p) => p.a === j || p.b === j);
      return alone || inMissedPair ? x : null;
    });
    return { c, l };
  }
  // A box of non-harmonic tones, on its own: the student's circles (marked once checked, with what they
  // missed dashed), or the teacher's in an answer key, and what each one was named.
  function nhtCard(q, cfg, o, wrap, pic) {
    const T = q.an.nht, resp = o.response || {}, mine = { c: resp.c || [], l: resp.l || [] };
    const key = !!o.keyMode, reveal = !!o.reveal && !key;
    const cmp = MQ.compareNHT(q, mine);
    const color = anColor(q.an.n);
    const overlay = (view) => {
      if (key) return circleLayer(T, T.c, T.l, view, { color, tags: 'kind' });
      const els = circleLayer(T, mine.c, mine.l, view, { color, tags: true, marks: reveal ? { c: cmp.gotC, l: cmp.gotL } : null });
      if (reveal) { const ms = nhtMissed(T, cmp); els.push(...circleLayer(T, ms.c, ms.l, view, { color, missed: true })); }
      return els;
    };
    loadScore(q.an.img).then((sc) => pic.replaceChildren(sc ? scoreCrop(sc, q.an.region, color, overlay)
      : h('p', { class: 'fine' }, 'The music isn’t saved on this device, so only the answers are shown.')));
    const items = [];
    const src = key ? T : mine;
    src.c.forEach((c, i) => {
      if (MQ.analysisInPair(src.l, i)) return;
      const ok = reveal ? cmp.gotC[i] : null;
      items.push(h('li', { class: ok === true ? 'is-right' : ok === false ? 'is-wrong' : '' }, h('b', null, letter(i)), ' ', c.t >= 0 ? MQ.NHT_TYPES[c.t].name : h('i', null, 'not named'), ok == null ? null : ok ? ' ✓' : ' ✗'));
    });
    src.l.forEach((l, k) => {
      const ok = reveal ? cmp.gotL[k] : null;
      items.push(h('li', { class: ok === true ? 'is-right' : ok === false ? 'is-wrong' : '' }, h('b', null, `${letter(l.a)}–${letter(l.b)}`), ' ', l.t >= 0 ? MQ.NHT_PAIRS[l.t].name : h('i', null, 'not named'), ok == null ? null : ok ? ' ✓' : ' ✗'));
    });
    wrap.append(items.length ? h('ul', { class: 'an-nht-list' }, items) : h('p', { class: 'fine' }, key ? 'No circles.' : 'No circles drawn.'));
    if (key) wrap.append(h('p', { class: 'result is-key' }, h('strong', null, 'Answer: '), MQ.describeAnswer(q, cfg)));
    else if (o.reveal) {
      wrap.append(resultLine(q, cfg, o.response));
      if (cmp.right < cmp.total) wrap.append(h('p', { class: 'fine' }, 'Dashed circles show what was missed.'));
    }
    return wrap;
  }
  // A reminder of what the figures mean, and how to type them — printed above the music.
  function figuresKey(roman, symbol, more) {
    const m = more || {};
    const fig = (f) => h('span', { class: 'fig-rn an-key-fig' }, !f ? h('span', { class: 'an-key-none' }, 'no figure')
      : h('span', { class: 'fig-stack' }, ...Array.from(f).map((d) => h('span', null, d))));
    const item = (f, text) => h('span', { class: 'an-key-item' }, fig(f), h('span', null, text));
    return h('aside', { class: 'an-key', 'aria-label': 'Key to figures and chord symbols' },
      roman ? [
        h('div', { class: 'an-key-row' }, h('b', null, 'Triads'), item('', 'root position'), item('6', '1st inversion'), item('64', '2nd inversion')),
        h('div', { class: 'an-key-row' }, h('b', null, 'Sevenths'), item('7', 'root position'), item('65', '1st inversion'), item('43', '2nd inversion'), item('42', '3rd inversion')),
        h('p', { class: 'an-key-how' }, 'Type the figures right after the numeral: V65, ii6, V42. Choose ° or ø from the menu under the box, or type o for ° (viio7) and /o for ø (vii/o7). Applied chords: V7/V.'),
      ] : null,
      symbol ? h('p', { class: 'an-key-how' }, 'Chord symbols: Dmi7, G7, Cma7, B°, Bmi7♭5, Csus4 — a slash names the bass note, as in C/E. Type b for ♭ and # for ♯.') : null,
      m.chains ? h('p', { class: 'an-key-how' }, h('b', null, 'Boxes joined by a line'), ' are one chord, its figures changing (V 6–5 over 4–3): type the numeral and figures in the first box (V64) and just the figures in the next (53).') : null,
      m.keys ? h('p', { class: 'an-key-how' }, h('b', null, 'Key changes: '), 'choose Draw the box, then drag across the chord where the new key begins. You can zoom in first, and draw it again if you need to.') : null,
      m.nht ? h('p', { class: 'an-key-how' }, h('b', null, 'Non-harmonic tones: '), 'click a note in the box to circle it, then choose what it is. For a suspension or an anticipation, circle both notes and join them (Join to…), then name the pair. Click a circle to choose it; ✕ removes it.') : null);
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
    // Zoom 2×: twice as big, centred on the box being answered — and kept on it from box to box.
    const zoom2 = h('button', { type: 'button', class: 'btn sm an-zoom2', title: 'Make the music twice as big, centred on the box you’re answering', onclick: () => { setZoom(S.azoom >= 2 ? 1 : 2); centre(true); } });
    let centred = -1;
    const centre = (force) => requestAnimationFrame(() => {
      if (S.azoom <= 1 || (!force && centred === t.idx)) return;
      const hl = host.querySelector('.an-hl.is-active');
      if (!hl) return;
      centred = t.idx;
      hl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const a = hl.getBoundingClientRect(), b = host.getBoundingClientRect();
      host.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
    });
    const setZoom = (z) => {
      S.azoom = Math.max(1, Math.min(2.5, z));
      zoomVal.textContent = Math.round(S.azoom * 100) + '%';
      zoom2.setAttribute('aria-pressed', String(S.azoom >= 2));
      zoom2.textContent = S.azoom >= 2 ? '🔍 Back to 100%' : '🔍 Zoom 2×';
      host.querySelectorAll('.an-sheet').forEach((sheet) => (sheet.style.width = S.azoom * 100 + '%'));
    };
    const asks = t.qs.map((q) => q.an.ask);
    const hasNht = asks.includes('nht');
    main.append(h('div', { class: 'take is-analysis' }, progressHead(t),
      h('section', { class: 'card stage an-take' },
        h('div', { class: 'an-take-top' },
          h('p', { class: 'an-lede' }, (asks.some((a) => a !== 'nht') ? 'Type your answer in the box beside each highlighted part of the music. ' : '')
            + (hasNht ? 'For non-harmonic tones, click each one in its box to circle it, then name it. ' : '') + 'The colours and numbers show which box goes with which part.'),
          h('div', { class: 'an-zoom', role: 'group', 'aria-label': 'Zoom the music' },
            zoom2,
            h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Zoom out', onclick: () => setZoom(S.azoom - 0.25) }, '−'), zoomVal,
            h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Zoom in', onclick: () => setZoom(S.azoom + 0.25) }, '+'))),
        cfg.analysis.notes ? h('p', { class: 'an-notes' }, cfg.analysis.notes) : null,
        figuresKey(asks.some((a) => a === 'roman' || a === 'both'), asks.some((a) => a === 'symbol' || a === 'both'), { chains: t.qs.some((q) => q.an.link), nht: hasNht, keys: t.qs.some((q) => q.an.ask === 'key' && q.an.hide) }),
        host),
      h('div', { class: 'take-actions' }, h('div', { class: 'spacer' }), checkBtn,
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { t.reviewing = true; saveAttempt(); go(tv()); } }, t.practice ? 'Finish' : 'Review & submit'))));
    setZoom(S.azoom);
    syncCheck();
    // Each score's music, one after another, each with its own boxes.
    const scores = MQ.analysisScores(cfg.analysis);
    Promise.all(scores.map((sc) => loadScore(sc.img && sc.img.hash))).then((pics) => {
      if (!host.isConnected || S.take !== t) return;
      const ids = scores.map((_, k) => t.qs.map((q, i) => ((q.an.score || 0) === k ? i : -1)).filter((i) => i >= 0));
      if (pics.some((sc, k) => ids[k].length && !sc)) {
        host.replaceChildren(h('p', { class: 'warn-note' }, 'The music for this quiz isn’t on this device any more. Open the quiz link from your teacher again — your answers so far are kept.'));
        return;
      }
      const shared = { hls: t.qs.map(() => []), boxes: t.qs.map(() => []) };
      host.replaceChildren(...scores.map((sc, k) => {
        if (!ids[k].length) return null;
        const sheet = analysisSheet(pics[k], t, () => { syncCheck(); centre(false); }, ids[k], shared, sc.keys, scores.slice(0, k).reduce((n, x) => n + x.keys.length, 0), sc.open);
        return scores.length < 2 ? sheet : h('section', { class: 'an-score', 'aria-label': `Score ${k + 1}` },
          h('h3', { class: 'an-score-title' }, `Score ${k + 1}`, sc.title ? h('span', null, ` — ${sc.title}`) : null), sheet);
      }).filter(Boolean));
      setZoom(S.azoom);
      const box = host.querySelector(`.an-box[data-i="${t.idx}"] input`);
      if (box && t.idx > 0) box.focus({ preventScroll: true }), box.scrollIntoView({ block: 'center' });
    });
    startTicker();
  }
  // One score's sheet: ids (optional) are the questions on it; shared holds every box and highlight,
  // so a quiz on several scores has one box being answered at a time.
  // keys (optional): the score's key changes, so the ones shown to students are drawn on the music.
  // open (optional): the key the score begins in, shown above the music when students are told it.
  function analysisSheet(sc, t, onActive, ids0, shared, keys, keyBase, open) {
    const cfg = t.cfg, all = t.qs;
    const ids = ids0 || all.map((_, i) => i), qs = ids.map((i) => all[i]);
    const sheet = h('div', { class: 'an-sheet', role: 'group', 'aria-label': `The music, with ${qs.length} box${qs.length > 1 ? 'es' : ''} to answer` });
    const hls = shared ? shared.hls : all.map(() => []), boxes = shared ? shared.boxes : all.map(() => []);
    const nv = {};                  // boxes of non-harmonic tones: their circles' layers and their panel
    const kparts = [];              // each strip's layer for the boxes students draw around key changes
    let drawFor = null;             // the key change a student is drawing a box for
    // The box being answered is the "current question": it collects the time and the Check button.
    const setActive = (i) => {
      t.idx = i;
      [hls, boxes].forEach((all) => all.forEach((list, j) => list.forEach((el) => el.classList.toggle('is-active', j === i))));
      document.querySelectorAll('.qdot').forEach((d, j) => { if (j === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
      onActive();
    };
    const focusBox = (i) => { const inp = boxes[i][0] && boxes[i][0].querySelector('input, select'); if (inp && !inp.disabled) inp.focus(); else setActive(i); };
    const answered = (i) => {
      saveAttempt();
      const dot = document.querySelectorAll('.qdot')[i];
      if (dot) dot.classList.toggle('is-done', MQ.hasAnswer(all[i], t.resp[i]));
    };
    // ---------- non-harmonic tones ----------
    // The circles a student has drawn (or, when the notes are circled for them, the teacher's to name).
    const circlesOf = (i) => {
      const T = all[i].an.nht, r = t.resp[i] || {};
      if (T.mode && !r.c) return { c: T.c.map((c) => ({ x: c.x, y: c.y, t: -1 })), l: T.l.map((l) => ({ a: l.a, b: l.b, t: -1 })) };
      return { c: (r.c || []).map((c) => Object.assign({}, c)), l: (r.l || []).map((l) => Object.assign({}, l)) };
    };
    const setCircles = (i, v) => { t.resp[i] = Object.assign({}, t.resp[i], v); answered(i); setActive(i); nv[i].panel.draw(); paint(i); };
    function paint(i) {
      const v = nv[i], q = all[i], T = q.an.nht, mine = circlesOf(i), locked = !!t.checked[i];
      const cmp = locked ? MQ.compareNHT(q, mine) : null;
      v.parts.forEach(({ ov, piece }) => {
        const view = { x0: 0, y0: piece.y0, cw: 1, ch: piece.y1 - piece.y0 };
        const els = circleLayer(T, mine.c, mine.l, view, { color: anColor(i), tags: true, sel: v.sel, marks: cmp ? { c: cmp.gotC, l: cmp.gotL } : null });
        if (cmp) { const ms = nhtMissed(T, cmp); els.push(...circleLayer(T, ms.c, ms.l, view, { color: anColor(i), missed: true })); }
        ov.replaceChildren(...els);
      });
    }
    const dropCircle = (v, j) => ({
      c: v.c.filter((_, k) => k !== j),
      l: v.l.filter((l) => l.a !== j && l.b !== j).map((l) => ({ a: l.a > j ? l.a - 1 : l.a, b: l.b > j ? l.b - 1 : l.b, t: l.t })),
    });
    function placeCircle(i, p) {
      const T = all[i].an.nht, v = circlesOf(i), r = all[i].an.region;
      if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) return;
      const hit = v.c.findIndex((c) => ((p.x - c.x) / T.rx) ** 2 + ((p.y - c.y) / T.ry) ** 2 <= 1);
      if (hit >= 0) { nv[i].sel = hit; setActive(i); paint(i); nv[i].panel.focusRow(hit); return; }
      if (v.c.length >= 63) { toast('That’s as many circles as a box can have.', 'bad'); return; }
      v.c.push({ x: p.x, y: p.y, t: -1 });
      nv[i].sel = v.c.length - 1;
      setCircles(i, v);
      nv[i].panel.focusRow(v.c.length - 1);
    }
    // The panel under the system: each circle and pair, with a menu to name it.
    function nhtPanel(i) {
      const q = all[i], T = q.an.nht, el = h('div', { class: 'an-nht', style: `--c:${anColor(i)}`, 'data-i': i });
      const kinds = [{ v: -1, label: '— what is it? —' }].concat(q.an.opts.nht.map((k) => ({ v: k, label: `${MQ.NHT_TYPES[k].name} (${MQ.NHT_TYPES[k].id})` })));
      const pairKinds = [{ v: -1, label: '— name the pair —' }].concat(q.an.opts.pairs.map((k) => ({ v: k, label: MQ.NHT_PAIRS[k].name })));
      const markEl = (ok) => (ok == null ? null : h('span', { class: 'fig-mark ' + (ok ? 'is-right' : 'is-wrong') }, ok ? '✓' : '✗'));
      const panel = { el };
      panel.draw = () => {
        const v = circlesOf(i), locked = !!t.checked[i], find = !T.mode && !locked;
        const cmp = locked ? MQ.compareNHT(q, v) : null;
        const rows = [];
        v.c.forEach((c, j) => {
          if (MQ.analysisInPair(v.l, j)) return;
          const sel = selectEl(`an-nt-${i}-${j}`, kinds, c.t, (x) => { const w = circlesOf(i); w.c[j].t = +x; setCircles(i, w); });
          sel.setAttribute('aria-label', `Box ${i + 1}, circle ${letter(j)}: what is it?`);
          sel.dataset.row = j;
          sel.disabled = locked;
          sel.addEventListener('focus', () => { nv[i].sel = j; setActive(i); paint(i); });
          const others = v.c.map((_, k) => k).filter((k) => k !== j && !MQ.analysisInPair(v.l, k));
          const join = find && others.length ? selectEl(`an-nj-${i}-${j}`, [{ v: '', label: 'Join to…' }].concat(others.map((k) => ({ v: k, label: `circle ${letter(k)}` }))), '', (x) => {
            if (x === '') return;
            const w = circlesOf(i);
            w.l.push({ a: Math.min(j, +x), b: Math.max(j, +x), t: -1 });
            setCircles(i, w);
          }) : null;
          if (join) join.setAttribute('aria-label', `Join circle ${letter(j)} to another, for a suspension or an anticipation`);
          const del = find ? h('button', { type: 'button', class: 'btn btn-quiet sm', title: 'Remove this circle', 'aria-label': `Remove circle ${letter(j)}`, onclick: () => { nv[i].sel = null; setCircles(i, dropCircle(circlesOf(i), j)); } }, '✕') : null;
          rows.push(h('div', { class: 'an-c-row' }, h('span', { class: 'an-c-tag' }, letter(j)), sel, join, del, markEl(cmp ? cmp.gotC[j] : null)));
        });
        v.l.forEach((l, k) => {
          const sel = selectEl(`an-np-${i}-${k}`, pairKinds, l.t, (x) => { const w = circlesOf(i); w.l[k].t = +x; setCircles(i, w); });
          sel.setAttribute('aria-label', `Box ${i + 1}, circles ${letter(l.a)} and ${letter(l.b)} joined: what are they?`);
          sel.disabled = locked;
          sel.addEventListener('focus', () => setActive(i));
          const un = find ? h('button', { type: 'button', class: 'btn btn-quiet sm', title: 'Take the line away', 'aria-label': `Unjoin circles ${letter(l.a)} and ${letter(l.b)}`, onclick: () => { const w = circlesOf(i); w.l.splice(k, 1); setCircles(i, w); } }, '✕') : null;
          rows.push(h('div', { class: 'an-c-row is-pair' }, h('span', { class: 'an-c-tag' }, `${letter(l.a)}–${letter(l.b)}`), sel, un, markEl(cmp ? cmp.gotL[k] : null)));
        });
        const missed = cmp ? cmp.foundC.filter((f, j) => !f && !MQ.analysisInPair(T.l, j)).length + cmp.foundL.filter((f) => !f).length : 0;
        el.classList.toggle('is-checked', locked);
        const was = el.contains(document.activeElement) ? document.activeElement.id : null;
        el.replaceChildren(...[
          h('div', { class: 'an-nht-head' }, h('span', { class: 'an-num', 'aria-hidden': 'true' }, String(i + 1)),
            h('span', null, T.mode ? `Name each circled note in box ${i + 1}.` : `Click each non-harmonic tone in box ${i + 1} to circle it, then name it.`)),
          rows.length ? h('div', { class: 'an-c-rows' }, rows) : h('p', { class: 'help an-c-none' }, 'No circles yet.'),
          missed ? h('p', { class: 'fine' }, `${missed} missed — shown dashed on the music.`) : null].filter(Boolean));
        const again = was && document.getElementById(was);
        if (again) again.focus({ preventScroll: true });
      };
      panel.focusRow = (j) => { const x = el.querySelector(`select[data-row="${j}"]`); if (x && !x.disabled) x.focus({ preventScroll: true }); };
      panel.draw();
      return panel;
    }
    // ---------- key changes ----------
    const keyPanels = [];
    const setDraw = (i) => { drawFor = i; sheet.classList.toggle('is-drawing', i != null); redrawKeyPanels(); };
    const redrawKeyPanels = () => keyPanels.forEach((p) => p.draw());
    function paintKeys() {
      kparts.forEach(({ ov, piece }) => {
        const span = piece.y1 - piece.y0, els = [];
        ids.forEach((i) => {
          const q = all[i], b = q.an.ask === 'key' && q.an.hide && t.resp[i] && t.resp[i].b;
          if (!b || b.y >= piece.y1 || b.y + b.h <= piece.y0) return;
          const locked = !!t.checked[i], ok = locked ? MQ.keyBoxRight(q.an.region, b, q.an.tol) : null;
          els.push(h('span', { class: 'an-kbox' + (ok === true ? ' is-right' : ok === false ? ' is-wrong' : ''), style: boxStyle({ x: b.x, y: (b.y - piece.y0) / span, w: b.w, h: b.h / span }, KEY_COLOR) },
            h('span', { class: 'an-kmark-tag' }, `Key change ${q.an.kc + 1}`)));
          if (locked && !ok) {
            const r = q.an.region;
            if (r.y < piece.y1 && r.y + r.h > piece.y0) els.push(h('span', { class: 'an-kbox is-answer', style: boxStyle({ x: r.x, y: (r.y - piece.y0) / span, w: r.w, h: r.h / span }, KEY_COLOR) }));
          }
        });
        ov.replaceChildren(...els);
      });
    }
    // The opening key: a menu of keys.
    function openPanel(i) {
      const q = all[i], el = h('div', { class: 'an-nht an-key', style: `--c:${KEY_COLOR}`, 'data-i': i });
      const draw = () => {
        const v = t.resp[i] || {}, locked = !!t.checked[i];
        const sel = keySelect(`an-open-${i}`, v.k, (k) => { const r = Object.assign({}, t.resp[i]); if (k == null) delete r.k; else r.k = k; t.resp[i] = r; answered(i); setActive(i); draw(); });
        sel.disabled = locked;
        sel.setAttribute('aria-label', 'The key the music begins in');
        sel.addEventListener('focus', () => setActive(i));
        const ok = locked ? MQ.gradeAnalysis(q, v) === 1 : null;
        el.replaceChildren(
          h('div', { class: 'an-nht-head' }, h('span', { class: 'an-num an-num-key', 'aria-hidden': 'true' }, String(i + 1)), h('span', null, 'What key does the music begin in?')),
          h('div', { class: 'an-c-rows' }, h('div', { class: 'an-c-row' }, sel, ok == null ? null : h('span', { class: 'fig-mark ' + (ok ? 'is-right' : 'is-wrong') }, ok ? '✓' : `✗ ${MQ.analysisKeyText(q.an.key)}`))));
      };
      el.addEventListener('focusin', () => setActive(i));
      boxes[i].push(el);
      draw();
      return el;
    }
    function keyPanel(i) {
      const q = all[i], el = h('div', { class: 'an-nht an-key', style: `--c:${KEY_COLOR}`, 'data-i': i });
      const panel = {
        draw() {
          const v = t.resp[i] || {}, locked = !!t.checked[i];
          const mk = (p) => (locked ? h('span', { class: 'fig-mark ' + (MQ.analysisKeyPartRight(q, p, v) ? 'is-right' : 'is-wrong') }, MQ.analysisKeyPartRight(q, p, v) ? '✓' : '✗') : null);
          const rows = [];
          if (q.an.hide) {
            const drawing = drawFor === i;
            rows.push(h('div', { class: 'an-c-row' },
              h('button', { type: 'button', class: 'btn sm' + (drawing ? ' btn-primary' : ''), disabled: locked, 'aria-pressed': String(drawing), onclick: () => { setDraw(drawing ? null : i); setActive(i); } },
                drawing ? 'Now drag on the music…' : v.b ? 'Draw the box again' : 'Draw the box'),
              v.b && !locked ? h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => { const r = Object.assign({}, t.resp[i]); delete r.b; t.resp[i] = r; answered(i); paintKeys(); panel.draw(); } }, 'Clear') : null,
              v.b ? h('span', { class: 'help' }, 'Box drawn') : null, mk('b')));
          }
          if (q.an.askKey || !q.an.hide) {
            const sel = keySelect(`an-key-${i}`, v.k, (k) => { const r = Object.assign({}, t.resp[i]); if (k == null) delete r.k; else r.k = k; t.resp[i] = r; answered(i); setActive(i); panel.draw(); });
            sel.disabled = locked;
            sel.setAttribute('aria-label', `Key change ${q.an.kc + 1}: the new key`);
            sel.addEventListener('focus', () => setActive(i));
            rows.push(h('div', { class: 'an-c-row' }, h('span', { class: 'help' }, 'New key'), sel, mk('k')));
          }
          const was = el.contains(document.activeElement) ? document.activeElement.id : null;
          el.replaceChildren(
            h('div', { class: 'an-nht-head' }, h('span', { class: 'an-num an-num-key', 'aria-hidden': 'true' }, 'K' + (q.an.kc + 1)),
              h('span', null, q.an.hide ? `Key change ${q.an.kc + 1}: drag a box around the chord where the key changes${q.an.askKey ? ', and name the new key' : ''}.` : `Key change ${q.an.kc + 1}: the key changes at the marked chord — what is the new key?`)),
            h('div', { class: 'an-c-rows' }, rows),
            locked && q.an.hide && !MQ.analysisKeyPartRight(q, 'b', v) ? h('p', { class: 'fine' }, 'The dashed box shows where it is.') : document.createTextNode(''));
          const again = was && document.getElementById(was);
          if (again) again.focus({ preventScroll: true });
        },
      };
      el.addEventListener('focusin', () => setActive(i));
      el.addEventListener('mouseenter', () => hls[i].forEach((x) => x.classList.add('is-hover')));
      el.addEventListener('mouseleave', () => hls[i].forEach((x) => x.classList.remove('is-hover')));
      boxes[i].push(el);
      keyPanels.push(panel);
      panel.draw();
      return el;
    }
    MQ.sheetPlan(qs, sc.bands).forEach((piece) => {
      if (piece.kind === 'strip') {
        const span = piece.y1 - piece.y0;
        const strip = h('div', { class: 'an-strip', style: `aspect-ratio:${sc.w} / ${(span * sc.h).toFixed(2)}` },
          h('img', { src: sc.url, alt: '', draggable: 'false', style: `top:${pct(-piece.y0 / span)}` }));
        // Key changes students are shown, that ask nothing: a marker with the new key.
        (keys || []).forEach((m, j) => {
          if (m.hide || m.ask || m.y >= piece.y1 || m.y + m.h <= piece.y0) return;
          strip.append(h('span', { class: 'an-kmark', style: boxStyle({ x: m.x, y: (m.y - piece.y0) / span, w: m.w, h: m.h / span }, KEY_COLOR) },
            h('span', { class: 'an-kmark-tag' }, `Key change ${(keyBase || 0) + j + 1}${m.key ? ` — ${MQ.analysisKeyText(m.key)}` : ''}`)));
        });
        // The boxes students draw for key changes they find.
        const kov = h('div', { class: 'an-ov an-kov' });
        strip.append(kov);
        kparts.push({ ov: kov, piece, strip });
        qs.forEach((q, j) => {
          const r = q.an.region, i = ids[j];
          if ((q.an.ask === 'key' && q.an.hide) || !r) return;
          if (r.y >= piece.y1 || r.y + r.h <= piece.y0) return;
          if (q.an.ask === 'key') {
            const hl = h('span', { class: 'an-hl an-kmark is-asked', title: `Key change ${q.an.kc + 1}`, onclick: () => focusBox(i), style: boxStyle({ x: r.x, y: (r.y - piece.y0) / span, w: r.w, h: r.h / span }, KEY_COLOR) },
              h('span', { class: 'an-kmark-tag' }, `Key change ${q.an.kc + 1}: new key?`));
            hls[i].push(hl);
            strip.append(hl);
            return;
          }
          const nht = q.an.ask === 'nht';
          const hl = h('span', { class: 'an-hl' + (nht && !q.an.nht.mode ? ' is-nht' : ''), title: `Box ${i + 1}`, onclick: nht && !q.an.nht.mode ? null : () => focusBox(i),
            style: boxStyle({ x: r.x, y: (r.y - piece.y0) / span, w: r.w, h: r.h / span }, anColor(i)) });
          hls[i].push(hl);
          strip.append(hl);
          if (!nht) return;
          // Its circles, over the music; in a box where students find the notes, a click adds one.
          const ov = h('div', { class: 'an-ov' });
          strip.append(ov);
          (nv[i] = nv[i] || { parts: [], sel: null }).parts.push({ ov, piece });
          hl.addEventListener('pointerdown', (e) => {
            if (e.button > 0 || q.an.nht.mode || t.checked[i]) return;
            e.preventDefault();
            const R = strip.getBoundingClientRect();
            placeCircle(i, { x: (e.clientX - R.left) / R.width, y: piece.y0 + ((e.clientY - R.top) / R.height) * span });
          });
        });
        sheet.append(strip);
        return;
      }
      if (piece.lane === 'nht') {
        const lane = h('div', { class: 'an-lane is-nht' });
        piece.items.forEach(({ i: j }) => {
          const i = ids[j];
          if (all[i].an.ask === 'key') { lane.append(keyPanel(i)); return; }
          nv[i] = nv[i] || { parts: [], sel: null };
          nv[i].panel = nhtPanel(i);
          const el = nv[i].panel.el;
          el.addEventListener('focusin', () => setActive(i));
          el.addEventListener('mouseenter', () => hls[i].forEach((x) => x.classList.add('is-hover')));
          el.addEventListener('mouseleave', () => hls[i].forEach((x) => x.classList.remove('is-hover')));
          boxes[i].push(el);
          lane.append(el);
        });
        sheet.append(lane);
        return;
      }
      const lane = h('div', { class: 'an-lane is-' + piece.lane });
      piece.items.forEach(({ i: j, cx }) => {
        const i = ids[j], q = all[i], k = piece.lane === 'roman' ? 'r' : 's';
        const locked = !!t.checked[i];
        const f = anInput(q, k, cfg, { locked, reveal: locked, sheet: true }, (t.resp[i] || {})[k], (v) => {
          t.resp[i] = Object.assign({}, t.resp[i], { [k]: v });
          answered(i);
          setActive(i);
        });
        const box = h('div', { class: 'an-box' + (locked ? ' is-checked' : '') + (k === 'r' && q.an.linked ? ' is-linked' : ''), style: `--c:${anColor(i)}`, 'data-i': i, 'data-cx': cx, 'data-link': k === 'r' && q.an.link ? '1' : null },
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
    Object.keys(nv).forEach((i) => { if (nv[i].panel) paint(+i); });
    // Key changes students find: their panels go above the music, where they give nothing away.
    // The opening key first, then the key changes students find.
    const hidden = ids.filter((i) => all[i].an.ask === 'open').concat(ids.filter((i) => all[i].an.ask === 'key' && all[i].an.hide));
    if (hidden.length) sheet.prepend(h('div', { class: 'an-lane is-nht an-keys-top' }, hidden.map((i) => (all[i].an.ask === 'open' ? openPanel(i) : keyPanel(i)))));
    if (open && open.show === 1 && open.key) sheet.prepend(h('p', { class: 'an-notes an-open-key' }, `Key: ${MQ.analysisKeyText(open.key)}`));
    paintKeys();
    // Drawing a box around a key change: drag on the music while "Draw the box" is on.
    kparts.forEach(({ strip, piece }) => {
      const span = piece.y1 - piece.y0;
      strip.addEventListener('pointerdown', (e) => {
        if (drawFor == null || e.button > 0) return;
        e.preventDefault(); e.stopPropagation();
        const i = drawFor, R = strip.getBoundingClientRect();
        const at = (ev) => ({ x: Math.max(0, Math.min(1, (ev.clientX - R.left) / R.width)), y: piece.y0 + Math.max(0, Math.min(1, (ev.clientY - R.top) / R.height)) * span });
        const p0 = at(e);
        const rect = (p) => ({ x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) });
        const ghost = h('span', { class: 'an-kbox is-drawing', style: `--c:${KEY_COLOR}` });
        strip.append(ghost);
        try { strip.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
        const show = (b) => ghost.setAttribute('style', boxStyle({ x: b.x, y: (b.y - piece.y0) / span, w: b.w, h: b.h / span }, KEY_COLOR));
        const move = (ev) => show(rect(at(ev)));
        const up = (ev) => {
          strip.removeEventListener('pointermove', move); strip.removeEventListener('pointerup', up); strip.removeEventListener('pointercancel', up);
          ghost.remove();
          const b = rect(at(ev));
          if (b.w * R.width < 6 || b.h * R.height < 6) { toast('Drag across the chord to draw a box around it.'); return; }
          const r4 = (v) => Math.round(v * 10000) / 10000;
          t.resp[i] = Object.assign({}, t.resp[i], { b: { x: r4(b.x), y: r4(b.y), w: r4(b.w), h: r4(b.h) } });
          setDraw(null);
          answered(i); setActive(i); paintKeys(); redrawKeyPanels();
        };
        strip.addEventListener('pointermove', move); strip.addEventListener('pointerup', up); strip.addEventListener('pointercancel', up);
      }, true);
      strip.addEventListener('click', (e) => { if (drawFor != null) { e.stopPropagation(); e.preventDefault(); } }, true);
    });
    // Each box sits centred on its part of the music. A box that would overlap the one before it
    // moves over a little if it can, and otherwise takes another row. Linked boxes get a line between.
    const layout = () => sheet.querySelectorAll('.an-lane:not(.is-nht)').forEach((lane) => {
      const W = lane.clientWidth;
      if (!W) return;
      lane.querySelectorAll('svg.an-chain').forEach((x) => x.remove());
      const list = Array.from(lane.querySelectorAll(':scope > .an-box'));
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
      const H = 10 + rows.length * rowH;
      lane.style.height = H + 'px';
      const pairs = list.filter((b) => b.dataset.link === '1').map((a) => [a, list.find((b) => +b.dataset.i === +a.dataset.i + 1)]).filter((x) => x[1]);
      if (!pairs.length) return;
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'an-chain');
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      pairs.forEach(([a, b]) => {
        const ln = document.createElementNS(SVGNS, 'line');
        const ya = a.offsetTop + a.offsetHeight / 2, yb = b.offsetTop + b.offsetHeight / 2;
        ln.setAttribute('x1', a.offsetLeft + a.offsetWidth); ln.setAttribute('y1', ya);
        ln.setAttribute('x2', b.offsetLeft); ln.setAttribute('y2', yb);
        ln.setAttribute('style', `--c:${a.style.getPropertyValue('--c')}`);
        svg.append(ln);
      });
      lane.prepend(svg);
    });
    if (window.ResizeObserver) new ResizeObserver(layout).observe(sheet);
    requestAnimationFrame(layout);
    setActive(Math.max(0, Math.min(t.idx, all.length - 1)));
    return sheet;
  }

  // ---------- Clefwork Analysis: the builder ----------
  function analysisReady() {
    if (S.aed) { toast(`Save or discard ${S.aed.index >= 0 ? 'box ' + (S.aed.index + 1) : 'the new box'} first.`, 'bad'); return false; }
    const scores = MQ.analysisScores(S.cfg.analysis);
    const k = scores.findIndex((sc) => !sc.img || !scoreData(sc.img.hash));
    if (k >= 0) { toast(scores.length < 2 ? 'Upload the picture of the music first.' : `Score ${k + 1} has no picture yet — add one, or remove that score.`, 'bad'); return false; }
    if (!MQ.analysisRegionCount(S.cfg.analysis)) { toast('Drag a box on the music for each question first.', 'bad'); return false; }
    const probs = analysisProblems(MQ.analysisSettings(S.cfg.analysis));
    if (probs.length) { toast(probs[0], 'bad'); return false; }
    return true;
  }
  // What stops linked boxes and boxes of non-harmonic tones from working, in words.
  function analysisProblems(a) {
    const out = [];
    let from = 0;
    MQ.analysisScores(a).forEach((sc) => {
      MQ.analysisLinkProblems(sc.regions, a.override, from).forEach((t) => out.push(t));
      sc.regions.forEach((r, i) => {
        if (r.ask !== 'nht') return;
        const off = r.nht.c.filter((c, j) => !MQ.analysisInPair(r.nht.l, j) && c.t >= 0 && !a.nhtOpts.includes(MQ.NHT_TYPES[c.t].id)).map((c) => MQ.NHT_TYPES[c.t].name)
          .concat(r.nht.l.filter((l) => l.t >= 0 && !a.pairOpts.includes(MQ.NHT_PAIRS[l.t].id)).map((l) => MQ.NHT_PAIRS[l.t].name));
        if (off.length) out.push(`Box ${from + i + 1}’s answer ${off.length > 1 ? 'uses' : 'is'} ${[...new Set(off)].join(', ')}, which isn’t in the students’ menu — add it below.`);
      });
      if (sc.open && sc.open.show > 0 && !sc.open.key) out.push(`${MQ.analysisScores(a).length > 1 ? `Score ${MQ.analysisScores(a).indexOf(sc) + 1}: c` : 'C'}hoose the opening key${sc.open.show === 2 ? ' students should name' : ' to show'}, or set it to Not shown.`);
      from += sc.regions.length;
    });
    return out;
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
      const a = S.cfg.analysis = MQ.analysisSettings(S.cfg.analysis);
      const cur = MQ.analysisScores(a)[S.anScore || 0] || a;     // the score being worked on
      let sc = await MQ.encodeScore(S.aorig.bmp, Object.assign({}, S.aopt, { crop: S.aorig.crop }));
      // The same picture again, for a draft made before empty bands were taken out: keep its old trim,
      // so the boxes still sit on the right music.
      if (fresh && cur.img && cur.regions.length && sc.hash !== cur.img.hash && sc.crop.cuts.length) {
        const old = await MQ.encodeScore(S.aorig.bmp, Object.assign({}, S.aopt, { gaps: false }));
        if (old.hash === cur.img.hash) sc = old;
      }
      S.aorig.crop = sc.crop;       // later detail and ink changes keep this trim, so boxes stay put
      sc.url = await MQ.scoreURL(sc);
      keepScore(sc.data, sc.hash);
      SCORES.set(sc.hash >>> 0, Promise.resolve(sc));
      const moved = fresh && cur.img && cur.img.hash !== sc.hash && cur.regions.length;
      cur.img = { hash: sc.hash, w: sc.w, h: sc.h };
      S.aimg = sc;
      saveDraft();
      go('build');
      if (moved) toast(`New picture — check that your ${cur.regions.length} box${cur.regions.length > 1 ? 'es' : ''} still sit on the right music.`);
    } catch (e) {
      toast(e.message || 'That picture couldn’t be used.', 'bad');
      if (status) status.textContent = '';
    } finally { scoreBusy = false; }
  }
  function analysisSections(cfg, changed, R) {
    const a = cfg.analysis = MQ.analysisSettings(cfg.analysis);
    // The quiz's scores, and the one being worked on: its boxes are numbered on from the scores before.
    const scores = MQ.analysisScores(a);
    S.anScore = Math.max(0, Math.min(scores.length - 1, S.anScore || 0));
    const cur = scores[S.anScore];
    const offset = scores.slice(0, S.anScore).reduce((n, sc) => n + sc.regions.length, 0);
    const kOffset = scores.slice(0, S.anScore).reduce((n, sc) => n + sc.keys.length, 0);       // key changes are numbered on their own
    const total = () => { cfg.counts.analysis = MQ.analysisRegionCount(a); };
    R.total = h('span', { class: 'mix-total' });
    const status = h('span', { class: 'an-status', id: 'an-status', role: 'status' });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Picture of the music' });
    file.addEventListener('change', () => { takePicture(file.files[0]); file.value = ''; });
    const choose = (label, cls) => h('button', { type: 'button', class: cls, onclick: () => file.click() }, label);
    // A public-domain score from the library, used as if it had been uploaded. Its name becomes the
    // score's name, and with one score, the notes for students when they're empty.
    const useLibraryScore = async (piece) => {
      const st = document.getElementById('an-status');
      if (st) st.textContent = 'Loading the score…';
      try {
        const bmp = await libraryBitmap(await libraryScore(piece));
        S.aorig = { bmp, crop: null };
        const name = `${piece.title} — ${piece.by}${piece.year ? `, ${piece.year}` : ''}`;
        cur.title = name;
        // The piece's key, ready for the opening-key setting — not shown to students until chosen.
        if (piece.key) cur.open = { key: { fifths: piece.key.fifths, mode: piece.key.mode }, show: cur.open && cur.open.show ? cur.open.show : 0 };
        if (!a.notes && scores.length < 2) a.notes = name;
        await useScore(true);
      } catch (e) { toast(e.message || 'That score couldn’t be used.', 'bad'); if (st) st.textContent = ''; }
    };
    const fromLibrary = (label, cls) => h('button', { type: 'button', class: cls, onclick: () => openLibrary({ need: 'score', title: 'A score from the library', onPick: useLibraryScore }) }, label);
    // Or one the app chooses: any piece with a score, or (when Clefwork has chosen before) another.
    const randomScore = (label, cls) => h('button', { type: 'button', class: cls, onclick: async () => {
      try { await MQ.libraryLoad(); } catch (e) { toast(e.message, 'bad'); return; }
      const have = new Set(scores.map((sc) => sc.title));
      const list = MQ.libraryList({ scored: true }).filter((p) => !have.has(`${p.title} — ${p.by}${p.year ? `, ${p.year}` : ''}`));
      if (!list.length) return;
      useLibraryScore(list[Math.floor(Math.random() * list.length)]);
    } }, label);
    const hasLib = MQ.libraryIndexList({ scored: true }).length > 0;
    // ---------- the scores ----------
    const switchScore = (k) => {
      if (S.aed) { toast(`Save or discard ${S.aed.index >= 0 ? 'box ' + (offset + S.aed.index + 1) : 'the new box'} first.`, 'bad'); return; }
      S.anScore = k;
      S.aorig = null;
      const sc = MQ.analysisScores(a)[k];
      S.aimg = sc && sc.img ? null : undefined;
      go('build');
      if (sc && sc.img) loadScore(sc.img.hash).then((pic) => { if (S.anScore === k) { S.aimg = pic || false; go('build'); } });
    };
    const addScore = () => {
      if (S.aed) { toast('Save or discard the box you’re editing first.', 'bad'); return; }
      a.more.push({ img: null, regions: [], title: '' });
      changed();
      switchScore(a.more.length);
    };
    const removeScore = (btn) => {
      if (btn.dataset.sure !== '1') {
        btn.dataset.sure = '1';
        btn.textContent = 'Click again to remove this score and its boxes';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.sure = ''; btn.textContent = 'Remove this score'; } }, 3000);
        return;
      }
      S.aed = null;
      const k = S.anScore;
      if (k === 0) { const m = a.more.shift(); Object.assign(a, { img: m.img, regions: m.regions, title: m.title }); }
      else a.more.splice(k - 1, 1);
      total(); changed();
      toast(`Score ${k + 1} removed`);
      switchScore(Math.max(0, k - 1));
    };
    const scoreTabs = scores.length < 2 && !cur.img ? null : h('div', { class: 'rh-tabs an-score-tabs', role: 'tablist', 'aria-label': 'Scores' });
    const drawTabs = () => {
      if (!scoreTabs) return;
      scoreTabs.replaceChildren(...MQ.analysisScores(a).map((sc, k) => h('button', { type: 'button', role: 'tab', class: 'rh-tab', 'aria-selected': String(k === S.anScore), onclick: () => switchScore(k) },
        h('span', null, `Score ${k + 1}`), h('span', { class: 'rh-tab-state ' + (sc.img && sc.regions.length ? 'is-ok' : 'is-open') }, ` · ${sc.regions.length} box${sc.regions.length === 1 ? '' : 'es'}`))),
      scores.length < MQ.ANALYSIS_SCORES ? h('button', { type: 'button', class: 'rh-tab rh-add', onclick: addScore }, '+ Add a score') : null);
    };
    const titleFld = scores.length < 2 ? null : fld(`Name of score ${S.anScore + 1}`, textIn('an-title', cur.title, 120, 'e.g. Bach, Chorale No. 26', (v) => { cur.title = v; changed(); }),
      'Shown to students above this score.');
    const dropOn = (el) => {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('is-over'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-over'); takePicture(e.dataTransfer.files[0]); });
    };
    let stage = null, layer = null, editor = null, list = null;
    let body;
    if (S.aimg === null && cur.img) body = h('p', { class: 'empty' }, 'Loading the picture…');
    else if (!S.aimg) {
      body = h('div', { class: 'an-drop' },
        h('p', { class: 'an-drop-title' }, cur.img ? 'This draft’s picture isn’t on this device any more' : scores.length > 1 ? `The music for score ${S.anScore + 1}` : 'Upload a picture of the music'),
        h('p', { class: 'help' }, cur.img ? 'Upload the same picture again — your boxes and answers are kept.'
          : 'A scan, an export from notation software, or a screenshot (PNG or JPG). Drag it here, paste it, or choose it. For a PDF, take a screenshot of the passage. Or use a public-domain score from the library — choose one, or let Clefwork pick.'),
        h('div', { class: 'btn-row center' }, choose('Choose a picture', 'btn btn-primary'), hasLib ? fromLibrary('Choose from the library', 'btn') : null, hasLib ? randomScore('🎲 A score at random', 'btn') : null),
        scores.length > 1 ? h('div', { class: 'btn-row center' }, h('button', { type: 'button', class: 'btn btn-quiet sm an-del', onclick: (e) => removeScore(e.currentTarget) }, 'Remove this score')) : null,
        status, file);
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
      // Zoom 2×: the music twice as big, to box small notes — scrolled to the box being edited.
      const wrapStage = h('div', { class: 'an-stage-wrap' }, stage);
      const zoomBtn = h('button', { type: 'button', class: 'btn btn-quiet sm an-zoom2', onclick: () => { S.abZoom = !S.abZoom; applyZoom(true); } });
      const applyZoom = (scroll) => {
        wrapStage.classList.toggle('is-zoomed', !!S.abZoom);
        zoomBtn.setAttribute('aria-pressed', String(!!S.abZoom));
        zoomBtn.textContent = S.abZoom ? '🔍 Back to 100%' : '🔍 Zoom 2×';
        if (!scroll || !S.abZoom) return;
        requestAnimationFrame(() => {
          const r = S.aed || cur.regions[cur.regions.length - 1];
          if (!r) return;
          wrapStage.scrollLeft = (r.x + r.w / 2) * stage.clientWidth - wrapStage.clientWidth / 2;
          wrapStage.scrollTop = (r.y + r.h / 2) * stage.clientHeight - wrapStage.clientHeight / 2;
        });
      };
      applyZoom(false);
      stage.wrap = wrapStage;
      stage.zoomBtn = zoomBtn;
      editor = h('div', { class: 'an-editor-host' });
      list = h('div', { class: 'an-list-host' });
      body = h('div', { class: 'an-build' },
        h('div', { class: 'an-tools' },
          grp('Detail', detail, 'More detail makes the quiz link longer.'),
          grp('Ink', ink, 'Darker keeps faint printing; lighter drops smudges.'),
          h('div', { class: 'an-tools-end' }, choose('Replace picture', 'btn btn-quiet sm'), hasLib ? fromLibrary('From the library', 'btn btn-quiet sm') : null, hasLib ? randomScore('🎲 At random', 'btn btn-quiet sm') : null,
            scores.length > 1 ? h('button', { type: 'button', class: 'btn btn-quiet sm an-del', onclick: (e) => removeScore(e.currentTarget) }, 'Remove this score') : null, status, file)),
        off ? h('p', { class: 'help' }, 'To change the detail or ink, upload the picture again.') : null,
        openKeyField(),
        h('div', { class: 'an-how-row' }, h('p', { class: 'an-how' }, h('b', null, 'Drag a box'), ' around each chord or passage to ask about. You’ll choose what students write — a Roman numeral, a chord symbol, or the non-harmonic tones in it — then give the answer and save it.'), stage.zoomBtn),
        stage.wrap, editor, list);
      setupDrawing();
    }

    // ---------- the key the music begins in ----------
    function openKeyField() {
      const o = cur.open = MQ.analysisOpenSettings(cur.open);
      const help = h('span', { class: 'help' });
      const sync = () => {
        help.textContent = o.show === 2 ? (o.key ? 'A question: students choose the key from a menu of every major and minor key. Leave the key out of your instructions.' : 'Choose the key students should name.')
          : o.show === 1 ? (o.key ? `Students see “Key: ${MQ.analysisKeyText(o.key)}” above the music.` : 'Choose the key to show.')
            : 'Students aren’t told the key here — give it in your instructions if you like, or ask them to identify it.';
      };
      const keySel = keySelect('an-open-key', o.key ? MQ.analysisKeyIndex(o.key) : -1, (k) => { o.key = k == null ? null : Object.assign({}, MQ.ANALYSIS_KEYS[k]); total(); changed(); sync(); syncWarn(); }, '— not set —');
      const how = seg('an-open-show', [{ v: 0, label: 'Not shown' }, { v: 1, label: 'Shown to students' }, { v: 2, label: 'Students identify it' }], o.show, (v) => { o.show = v; total(); changed(); sync(); syncWarn(); });
      sync();
      return h('div', { class: 'an-open-row' }, fld(scores.length > 1 ? `Opening key of score ${S.anScore + 1}` : 'Opening key', keySel), grp('Students', how, null), help);
    }

    // ---------- drawing boxes ----------
    let justDragged = false;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const edName = () => (S.aed.ask === 'key' ? (S.aed.keyIndex >= 0 ? 'key change ' + (kOffset + S.aed.keyIndex + 1) : 'the new key change')
      : S.aed.index >= 0 ? 'box ' + (offset + S.aed.index + 1) : 'the new box');
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
            if (!S.aed && cur.regions.length >= MQ.ANALYSIS_MAX) { toast(`A score can have up to ${MQ.ANALYSIS_MAX} boxes.`, 'bad'); stop(); return; }
            ghost = h('div', { class: 'an-reg is-draft is-drawing' });
            layer.querySelectorAll('.is-draft, .an-pop').forEach((x) => x.remove());
            layer.append(ghost);
            try { stage.setPointerCapture(ev.pointerId); } catch (err) { /* already released */ }
          }
          ghost.setAttribute('style', boxStyle(rectTo(p), 'var(--accent)'));
        };
        const up = (ev) => {
          stop();
          if (!ghost) { if (S.aed && S.aed.ask === 'nht' && !S.aed.asking) placeCircle(at(ev)); return; }
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
    // ---------- circling non-harmonic tones ----------
    // A circle a little bigger than a notehead on a page of music, to start with; the size can be changed.
    const newNht = () => { const W = S.aimg.w, H = S.aimg.h, px = Math.max(7, Math.round(W * 0.008)); return { mode: 0, rx: px / W, ry: px / H, c: [], l: [] }; };
    const dropCircle = (T, j) => {
      T.c.splice(j, 1);
      T.l = T.l.filter((l) => l.a !== j && l.b !== j).map((l) => ({ a: l.a > j ? l.a - 1 : l.a, b: l.b > j ? l.b - 1 : l.b, t: l.t }));
    };
    function placeCircle(p) {
      const ed = S.aed, T = ed.nht, m = 0.004;
      if (p.x < ed.x - m || p.x > ed.x + ed.w + m || p.y < ed.y - m || p.y > ed.y + ed.h + m) { toast('Click a note inside the box — or drag to draw the box again.'); return; }
      const hit = T.c.findIndex((c) => ((p.x - c.x) / T.rx) ** 2 + ((p.y - c.y) / T.ry) ** 2 <= 1);
      if (hit < 0 && T.c.length >= 63) { toast('A box can have up to 63 circles.', 'bad'); return; }
      if (hit < 0) T.c.push({ x: p.x, y: p.y, t: -1 });
      ed.sel = hit >= 0 ? hit : T.c.length - 1;
      drawStage(); drawEditor();
      const sel = editor.querySelector(`select[data-row="${ed.sel}"]`);
      if (sel) sel.focus({ preventScroll: true });
    }
    function editBox(i) {
      if (justDragged) return;
      if (S.aed) { if (S.aed.index !== i) toast(`Save or discard ${edName()} first.`, 'bad'); return; }
      const r = cur.regions[i];
      S.aed = { index: i, x: r.x, y: r.y, w: r.w, h: r.h, ask: r.ask || 'roman', roman: r.roman || '', symbol: r.symbol || '', link: r.link ? 1 : 0,
        nht: r.nht ? JSON.parse(JSON.stringify(r.nht)) : null, sel: null };
      redraw();
      const first = editor.querySelector('input');
      if (first) { first.focus({ preventScroll: true }); editor.scrollIntoView({ block: 'nearest' }); }
    }
    function discard() { S.aed = null; redraw(); }
    function editKey(j) {
      if (justDragged) return;
      if (S.aed) { if (S.aed.keyIndex !== j) toast(`Save or discard ${edName()} first.`, 'bad'); return; }
      const m = cur.keys[j];
      S.aed = { index: -1, keyIndex: j, ask: 'key', x: m.x, y: m.y, w: m.w, h: m.h, hide: m.hide, key: m.key ? Object.assign({}, m.key) : null, keyAsk: m.ask };
      redraw();
      editor.scrollIntoView({ block: 'nearest' });
    }
    function saveKey(ed) {
      const r4 = (v) => Math.round(v * 10000) / 10000;
      const m = MQ.analysisKeySettings({ x: r4(ed.x), y: r4(ed.y), w: r4(ed.w), h: r4(ed.h), hide: ed.hide, key: ed.key, ask: ed.keyAsk });
      const list = cur.keys.slice();
      if (ed.keyIndex >= 0) list[ed.keyIndex] = m; else list.push(m);
      if (list.length > 15) { toast('A score can have up to 15 key changes.', 'bad'); return; }
      // Numbered in reading order, like the boxes.
      cur.keys = MQ.readingOrder(list, S.aimg && S.aimg.bands);
      total();
      S.aed = null;
      changed();
      redraw();
      toast(`Key change ${kOffset + cur.keys.indexOf(m) + 1} saved${!m.hide && !m.ask ? ' — students see it marked' : ''}`);
    }
    function removeKey(j, btn) {
      if (btn.dataset.sure !== '1') {
        btn.dataset.sure = '1';
        btn.textContent = 'Click again to delete';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.sure = ''; btn.textContent = 'Delete'; } }, 3000);
        return;
      }
      cur.keys = cur.keys.filter((_, k) => k !== j);
      total();
      if (S.aed && S.aed.keyIndex === j) S.aed = null;
      changed();
      redraw();
      toast(`Key change ${kOffset + j + 1} deleted`);
    }
    // ---------- the editor for a key change ----------
    function keyEditor(ed) {
      const name = ed.keyIndex >= 0 ? `Key change ${kOffset + ed.keyIndex + 1}` : 'New key change';
      const keySel = keySelect('an-ed-key', ed.key ? MQ.analysisKeyIndex(ed.key) : -1, (k) => { ed.key = k == null ? null : Object.assign({}, MQ.ANALYSIS_KEYS[k]); if (!ed.key) ed.keyAsk = 0; drawEditor(); }, '— not given —');
      const what = ed.hide ? (ed.keyAsk ? 'A question: students find the chord where the key changes, and name the new key — half a point each.' : 'A question: students find the chord where the key changes and box it themselves.')
        : ed.keyAsk ? 'A question: students see the chord marked and name the new key.' : 'Not a question: students see the chord marked' + (ed.key ? `, labelled ${MQ.analysisKeyText(ed.key)}` : '') + ', so they know where the new key begins.';
      return h('div', { class: 'an-editor', role: 'group', 'aria-label': name },
        h('div', { class: 'an-ed-head' }, h('strong', null, name), h('span', { class: 'help' }, 'Box the chord where the new key begins. Drag on the music to draw it again.')),
        grp('Students', seg('an-ed-hide', [{ v: 0, label: 'See it highlighted' }, { v: 1, label: 'Find it and box it themselves' }], ed.hide, (v) => { ed.hide = v; drawEditor(); drawStage(); })),
        h('div', { class: 'row2' },
          fld('The new key', keySel, ed.hide ? 'Shown with the answer.' : 'Shown with the highlight, unless students name it.'),
          h('div', { class: 'fld' }, toggle('an-ed-keyask', 'Students name the new key', ed.key ? 'From a menu of every major and minor key.' : 'Choose the new key first.', ed.keyAsk, (v) => { ed.keyAsk = v && ed.key ? 1 : 0; drawEditor(); }))),
        h('p', { class: 'help an-linked-note' }, what),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, ed.keyIndex >= 0 ? 'Save changes' : 'Save key change'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: discard }, ed.keyIndex >= 0 ? 'Cancel changes' : 'Discard'),
          ed.keyIndex >= 0 ? h('button', { type: 'button', class: 'btn btn-quiet an-del', onclick: (e) => removeKey(ed.keyIndex, e.currentTarget) }, 'Delete') : null));
    }
    function saveNht(ed) {
      const T = MQ.nhtSettings(JSON.parse(JSON.stringify(ed.nht))), m = 0.004;
      // Circles outside the box are left out, and the rest go left to right.
      const inBox = T.c.map((c, j) => j).filter((j) => { const c = T.c[j]; return c.x >= ed.x - m && c.x <= ed.x + ed.w + m && c.y >= ed.y - m && c.y <= ed.y + ed.h + m; })
        .sort((p, q) => T.c[p].x - T.c[q].x);
      const lost = T.c.length - inBox.length;
      const at = new Map(inBox.map((j, k) => [j, k]));
      T.c = inBox.map((j) => T.c[j]);
      T.l = T.l.filter((l) => at.has(l.a) && at.has(l.b)).map((l) => ({ a: Math.min(at.get(l.a), at.get(l.b)), b: Math.max(at.get(l.a), at.get(l.b)), t: l.t }));
      T.c.forEach((c, j) => { if (MQ.analysisInPair(T.l, j)) c.t = -1; });
      const unnamed = T.c.findIndex((c, j) => c.t < 0 && !MQ.analysisInPair(T.l, j));
      const unpaired = T.l.findIndex((l) => l.t < 0);
      const msg = !T.c.length ? 'Click the non-harmonic tones in the box to circle them first.'
        : unnamed >= 0 ? `Choose what circle ${letter(unnamed)} is.` : unpaired >= 0 ? `Choose what the pair ${letter(T.l[unpaired].a)}–${letter(T.l[unpaired].b)} is.` : '';
      if (msg) { toast(msg, 'bad'); return null; }
      // Every kind used is in the students' menu.
      const addT = T.c.filter((c) => c.t >= 0).map((c) => MQ.NHT_TYPES[c.t].id).filter((id) => !a.nhtOpts.includes(id));
      const addP = T.l.map((l) => MQ.NHT_PAIRS[l.t].id).filter((id) => !a.pairOpts.includes(id));
      if (addT.length || addP.length) {
        a.nhtOpts = MQ.analysisSettings(Object.assign({}, a, { nhtOpts: a.nhtOpts.concat(addT) })).nhtOpts;
        a.pairOpts = MQ.analysisSettings(Object.assign({}, a, { pairOpts: a.pairOpts.concat(addP) })).pairOpts;
        setTimeout(() => toast(`Added to the students’ menu: ${addT.map((id) => MQ.NHT_TYPES[MQ.nhtIndex(id)].name).concat(addP.map((id) => MQ.NHT_PAIRS[MQ.pairIndex(id)].name)).join(', ')}`), 1200);
      }
      if (lost) setTimeout(() => toast(`${lost} circle${lost > 1 ? 's were' : ' was'} outside the box and left out.`), 2400);
      const r4 = (v) => Math.round(v * 10000) / 10000;
      return { x: r4(ed.x), y: r4(ed.y), w: r4(ed.w), h: r4(ed.h), ask: 'nht', roman: '', symbol: '', nht: T };
    }
    function save() {
      const ed = S.aed;
      if (!ed) return;
      if (ed.ask === 'key') return saveKey(ed);
      if (ed.ask === 'nht') {
        const box = saveNht(ed);
        if (!box) return;
        return keep(ed, box);
      }
      const tidy = (s) => MQ.alternatives(s).map((x) => x.replace(/♭/g, 'b').replace(/♯/g, '#'));
      const rs = tidy(ed.roman), ss = tidy(ed.symbol);
      const needR = ed.ask !== 'symbol', needS = ed.ask !== 'roman';
      const bad = rs.find((x) => !MQ.parseAnalysisRoman(x) && !MQ.parseStage(x)) || ss.find((x) => !MQ.symbolOk(x));
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
      if (ed.link && ed.ask !== 'symbol') box.link = 1;
      keep(ed, box);
    }
    function keep(ed, box) {
      const all = cur.regions.slice();
      if (ed.index >= 0) all[ed.index] = box; else all.push(box);
      // Boxes are numbered in reading order: system by system, left to right.
      cur.regions = MQ.readingOrder(all, S.aimg && S.aimg.bands);
      total();
      S.aed = null;
      changed();
      redraw();
      toast(`Box ${offset + cur.regions.indexOf(box) + 1} saved`);
    }
    function removeBox(i, btn) {
      if (btn.dataset.sure !== '1') {
        btn.dataset.sure = '1';
        btn.textContent = 'Click again to delete';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.sure = ''; btn.textContent = 'Delete'; } }, 3000);
        return;
      }
      cur.regions = cur.regions.filter((_, j) => j !== i);
      total();
      if (S.aed && S.aed.index === i) S.aed = null;
      else if (S.aed && S.aed.index > i) S.aed.index--;
      changed();
      redraw();
      toast(`Box ${offset + i + 1} deleted`);
    }
    function askPopover() {
      const ed = S.aed;
      // Below the box, unless it sits low on a tall picture and there's room above.
      const H = stage.clientHeight;
      const below = (1 - ed.y - ed.h) * H >= 150 || ed.y * H < 150;
      const pick = (k) => {
        ed.ask = k; ed.asking = false;
        if (k === 'nht' && !ed.nht) ed.nht = newNht();
        if (k === 'key') Object.assign(ed, { keyIndex: -1, hide: 1, key: null, keyAsk: 0 });
        redraw();
        const f = editor.querySelector('input:not([type=range]), select');
        if (f && k !== 'nht') { f.focus({ preventScroll: true }); editor.scrollIntoView({ block: 'nearest' }); }
        if (k === 'nht') toast('Now click each non-harmonic tone inside the box to circle it.');
      };
      const pop = h('div', { class: 'an-pop', role: 'dialog', 'aria-label': 'What is this box for?',
        style: `left:max(0px, min(${pct(ed.x)}, calc(100% - 300px)));` + (below ? `top:calc(${pct(ed.y + ed.h)} + 8px)` : `bottom:calc(${pct(1 - ed.y)} + 8px)`) },
        h('p', { class: 'an-pop-q' }, 'What should students do here?'),
        h('div', { class: 'an-pop-row' },
          h('button', { type: 'button', class: 'btn btn-primary sm', onclick: () => pick('roman') }, 'Roman numeral'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => pick('symbol') }, 'Chord symbol'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => pick('both') }, 'Both'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => pick('nht') }, 'Non-harmonic tones'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => pick('key') }, 'Key change')),
        h('button', { type: 'button', class: 'btn-link', onclick: discard }, 'Cancel'));
      pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') discard(); });
      pop.addEventListener('pointerdown', (e) => e.stopPropagation());
      return pop;
    }
    function drawStage() {
      if (!layer) return;
      layer.replaceChildren();
      // Linked boxes: a line from each to the next, on the music.
      const chains = MQ.analysisChains(cur.regions, a.override);
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'an-pairs an-links');
      svg.setAttribute('viewBox', '0 0 1000 1000');
      svg.setAttribute('preserveAspectRatio', 'none');
      cur.regions.forEach((r, i) => {
        const n = cur.regions[i + 1];
        if (!r.link || !n) return;
        const ln = document.createElementNS(SVGNS, 'line');
        // Under the two boxes, from the middle of one to the middle of the next.
        const y = Math.min(0.998, Math.max(r.y + r.h, n.y + n.h) + 0.008) * 1000;
        ln.setAttribute('x1', (r.x + r.w / 2) * 1000); ln.setAttribute('y1', y);
        ln.setAttribute('x2', (n.x + n.w / 2) * 1000); ln.setAttribute('y2', y);
        ln.setAttribute('class', 'an-pair' + (chains[i].link ? '' : ' is-wrong'));
        ln.setAttribute('style', `--c:${anColor(offset + i)}`);
        svg.append(ln);
      });
      layer.append(svg);
      cur.regions.forEach((r, i) => {
        if (S.aed && S.aed.index === i) return;
        layer.append(h('button', { type: 'button', class: 'an-reg', style: boxStyle(r, anColor(offset + i)), 'aria-label': `Edit box ${offset + i + 1}`, onclick: () => editBox(i) },
          h('span', { class: 'an-reg-num' }, String(offset + i + 1))));
        if (r.ask === 'nht') layer.append(...circleLayer(r.nht, r.nht.c, r.nht.l, null, { color: anColor(offset + i) }));
      });
      cur.keys.forEach((m, j) => {
        if (S.aed && S.aed.keyIndex === j) return;
        layer.append(h('button', { type: 'button', class: 'an-reg is-key' + (m.hide ? ' is-hidden' : ''), style: boxStyle(m, KEY_COLOR), 'aria-label': `Edit key change ${kOffset + j + 1}`, onclick: () => editKey(j) },
          h('span', { class: 'an-reg-num' }, `Key ${kOffset + j + 1}${m.key ? ' · ' + MQ.analysisKeyText(m.key) : ''}${m.hide ? ' · hidden' : ''}`)));
      });
      if (S.aed) layer.append(h('div', { class: 'an-reg is-draft' + (S.aed.ask === 'key' ? ' is-key' : ''), style: boxStyle(S.aed, S.aed.ask === 'key' ? KEY_COLOR : 'var(--accent)') },
        h('span', { class: 'an-reg-num' }, S.aed.ask === 'key' ? (S.aed.keyIndex >= 0 ? `Key ${kOffset + S.aed.keyIndex + 1}` : 'New key change') : S.aed.index >= 0 ? String(offset + S.aed.index + 1) : 'New')));
      if (S.aed && S.aed.ask === 'nht' && S.aed.nht && !S.aed.asking) layer.append(...circleLayer(S.aed.nht, S.aed.nht.c, S.aed.nht.l, null, { color: 'var(--accent)', tags: 'kind', sel: S.aed.sel }));
      if (S.aed && S.aed.asking) layer.append(askPopover());
    }
    // ---------- the editor for a box of non-harmonic tones ----------
    function nhtEditor(ed) {
      const T = ed.nht, W = S.aimg.w, H = S.aimg.h;
      const kinds = [{ v: -1, label: '— what is it? —' }].concat(MQ.NHT_TYPES.map((x, j) => ({ v: j, label: `${x.name} (${x.id})` })));
      const pairKinds = [{ v: -1, label: '— what is the pair? —' }].concat(MQ.NHT_PAIRS.map((x, j) => ({ v: j, label: x.name })));
      const again = () => { drawStage(); drawEditor(); };
      const rows = [];
      T.c.forEach((c, j) => {
        if (MQ.analysisInPair(T.l, j)) return;
        const sel = selectEl(`an-ed-ct-${j}`, kinds, c.t, (v) => { c.t = +v; drawStage(); });
        sel.dataset.row = j;
        sel.setAttribute('aria-label', `Circle ${letter(j)}: what is it?`);
        sel.addEventListener('focus', () => { if (ed.sel !== j) { ed.sel = j; drawStage(); } });
        const others = T.c.map((_, k) => k).filter((k) => k !== j && !MQ.analysisInPair(T.l, k));
        const join = others.length ? selectEl(`an-ed-cj-${j}`, [{ v: '', label: 'Join to…' }].concat(others.map((k) => ({ v: k, label: `circle ${letter(k)}` }))), '', (v) => {
          if (v === '') return;
          T.l.push({ a: Math.min(j, +v), b: Math.max(j, +v), t: -1 });
          again();
        }) : null;
        if (join) join.setAttribute('aria-label', `Join circle ${letter(j)} to another`);
        rows.push(h('div', { class: 'an-c-row' + (ed.sel === j ? ' is-sel' : '') }, h('span', { class: 'an-c-tag' }, letter(j)), sel, join,
          h('button', { type: 'button', class: 'btn btn-quiet sm an-del', onclick: () => { dropCircle(T, j); ed.sel = null; again(); } }, 'Remove')));
      });
      T.l.forEach((l, k) => {
        const sel = selectEl(`an-ed-cp-${k}`, pairKinds, l.t, (v) => { l.t = +v; });
        sel.setAttribute('aria-label', `Circles ${letter(l.a)} and ${letter(l.b)}: what is the pair?`);
        rows.push(h('div', { class: 'an-c-row is-pair' }, h('span', { class: 'an-c-tag' }, `${letter(l.a)}–${letter(l.b)}`), sel,
          h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => { T.l.splice(k, 1); again(); } }, 'Unjoin')));
      });
      const size = h('input', { type: 'range', id: 'an-ed-size', min: 4, max: 60, step: 1, 'aria-label': 'Circle size' });
      size.value = String(Math.round(T.rx * W));
      size.addEventListener('input', () => { T.rx = +size.value / W; T.ry = +size.value / H; drawStage(); });
      return h('div', { class: 'an-editor', role: 'group', 'aria-label': ed.index >= 0 ? `Box ${offset + ed.index + 1}` : 'New box' },
        h('div', { class: 'an-ed-head' }, h('strong', null, `${ed.index >= 0 ? `Box ${offset + ed.index + 1}` : 'New box'} — non-harmonic tones`),
          h('span', { class: 'help' }, 'Click a note inside the box to circle it; click a circle to choose it. Drag on the music to draw the box again.')),
        h('div', { class: 'row2' },
          grp('Students', seg('an-ed-mode', [{ v: 0, label: 'Find and circle the notes' }, { v: 1, label: 'Name the circled notes' }], T.mode, (v) => { T.mode = v; }),
            T.mode ? 'Students see your circles and choose what each one is.' : 'Students circle the notes themselves; each one in the wrong place costs a point.'),
          fld('Circle size', size, 'Make the circles a little bigger than a notehead.')),
        rows.length ? h('div', { class: 'an-c-rows' }, rows) : h('p', { class: 'empty' }, 'No circles yet — click a non-harmonic tone in the box.'),
        h('p', { class: 'help' }, 'For a suspension or an anticipation, circle both notes — the dissonance and the note it resolves to (or the note it anticipates) — then join them and name the pair.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, ed.index >= 0 ? 'Save changes' : 'Save box'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: discard }, ed.index >= 0 ? 'Cancel changes' : 'Discard box'),
          ed.index >= 0 ? h('button', { type: 'button', class: 'btn btn-quiet an-del', onclick: (e) => removeBox(ed.index, e.currentTarget) }, 'Delete') : null));
    }
    function drawEditor() {
      if (!editor) return;
      const ed = S.aed;
      if (!ed || ed.asking) { editor.replaceChildren(); return; }
      if (ed.ask === 'nht') { editor.replaceChildren(nhtEditor(ed)); return; }
      if (ed.ask === 'key') { editor.replaceChildren(keyEditor(ed)); return; }
      const want = MQ.ANALYSIS_ASKS[a.override] || '';
      // Linked from the box before (in reading order): this box's figures go on from its chord.
      const prev = ed.index > 0 ? cur.regions[ed.index - 1] : null;
      const linkedIn = !!(prev && prev.link && prev.ask !== 'nht');
      const field = (k) => {
        const roman = k === 'r', key = roman ? 'roman' : 'symbol';
        const inp = h('input', { type: 'text', id: 'an-ed-' + k, class: 'an-ed-in', maxlength: 60, placeholder: roman ? (linkedIn ? 'e.g. 53' : 'e.g. V65') : 'e.g. G7/B',
          autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
        inp.value = ed[key];
        const pv = h('span', { class: 'fig-preview' });
        const draw = () => {
          const alts = MQ.alternatives(inp.value);
          const bad = alts.find((x) => (roman ? !MQ.parseAnalysisRoman(x) && !MQ.parseStage(x) : !MQ.symbolOk(x)));
          inp.classList.toggle('is-invalid', !!bad);
          pv.replaceChildren(bad ? h('span', { class: 'fig-unread is-bad' }, `“${bad}” isn’t a ${roman ? 'Roman numeral Clefwork can read' : 'chord symbol Clefwork can read'}`)
            : roman ? h('span', null, romanAnswers(alts, ed.link || linkedIn)) : h('span', null, symbolAnswers(alts)));
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
      editor.replaceChildren(h('div', { class: 'an-editor', role: 'group', 'aria-label': ed.index >= 0 ? `Box ${offset + ed.index + 1}` : 'New box' },
        h('div', { class: 'an-ed-head' }, h('strong', null, ed.index >= 0 ? `Box ${offset + ed.index + 1}` : 'New box'),
          h('span', { class: 'help' }, 'Drag on the music to redraw this box.')),
        grp('Students write', seg('an-ed-ask', ['roman', 'symbol', 'both'].map((v) => ({ v, label: v === 'both' ? 'Both' : ASK_LABEL[v] })), ed.ask, (v) => { ed.ask = v; drawEditor(); })),
        h('div', { class: 'an-ed-fields' }, showR ? field('r') : null, showS ? field('s') : null),
        linkedIn && ed.ask !== 'symbol' ? h('p', { class: 'help an-linked-note' }, `Linked from box ${offset + ed.index}: the same chord, so type just its figures here — 53 after V64, or 7 after V8.`) : null,
        ed.ask !== 'symbol' ? toggle('an-ed-link', 'Linked to the next box', 'The same chord, its figures changing — as V 6–5 over 4–3, or I 9–8. Students type the numeral and figures in this box (V64) and just the figures in the next one (53), and a line joins the two.', ed.link, (v) => { ed.link = v ? 1 : 0; drawEditor(); }) : null,
        h('p', { class: 'help' }, 'If more than one answer is right, separate them with commas: I64, Cad64.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, ed.index >= 0 ? 'Save changes' : 'Save box'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: discard }, ed.index >= 0 ? 'Cancel changes' : 'Discard box'),
          ed.index >= 0 ? h('button', { type: 'button', class: 'btn btn-quiet an-del', onclick: (e) => removeBox(ed.index, e.currentTarget) }, 'Delete') : null)));
    }
    function drawList() {
      if (!list) return;
      const keyList = !cur.keys.length ? null : h('ol', { class: 'an-list an-keylist' }, cur.keys.map((m, j) => h('li', { class: 'an-item' + (S.aed && S.aed.keyIndex === j ? ' is-editing' : ''), style: `--c:${KEY_COLOR}` },
        h('span', { class: 'an-item-num an-num-key' }, 'K' + (kOffset + j + 1)),
        h('span', { class: 'an-item-main' },
          h('span', { class: 'an-item-ask' }, `Key change — ${m.hide ? 'students find it' : 'shown to students'}${m.ask ? ' and name the new key' : ''}`),
          h('span', { class: 'an-item-ans an-item-nht' }, m.key ? `New key: ${MQ.analysisKeyText(m.key)}` : 'New key not given', !m.hide && !m.ask ? ' · a marker, not a question' : '')),
        h('span', { class: 'an-item-act' },
          h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => editKey(j) }, 'Edit'),
          h('button', { type: 'button', class: 'btn btn-quiet sm an-del', onclick: (e) => removeKey(j, e.currentTarget) }, 'Delete')))));
      if (!cur.regions.length) { list.replaceChildren(h('p', { class: 'empty' }, scores.length > 1 ? 'No boxes on this score yet.' : 'No boxes yet.'), keyList || ''); return; }
      const chains = MQ.analysisChains(cur.regions, a.override);
      list.replaceChildren(h('ol', { class: 'an-list', start: offset + 1 }, cur.regions.map((r, i) => {
        const ask = MQ.askFor(r, a.override);
        const rs = MQ.alternatives(r.roman), ss = MQ.alternatives(r.symbol);
        const ch = chains[i], inChain = ch.link || ch.linked;
        return h('li', { class: 'an-item' + (S.aed && S.aed.index === i ? ' is-editing' : ''), style: `--c:${anColor(offset + i)}` },
          h('span', { class: 'an-item-num' }, String(offset + i + 1)),
          h('span', { class: 'an-item-main' },
            h('span', { class: 'an-item-ask' }, ASK_LABEL[ask] + (ask === 'nht' ? (r.nht.mode ? ' — circled for students' : ' — students circle them') : '')
              + (ch.link ? ` — linked to box ${offset + i + 2}` : ch.linked ? ' — figures, from the box before' : '')),
            ask === 'nht' ? h('span', { class: 'an-item-ans an-item-nht' }, MQ.nhtAnswerText(r.nht)) : h('span', { class: 'an-item-ans' },
              ask !== 'symbol' && rs.length ? romanAnswers(rs, inChain) : null,
              ask === 'both' ? h('span', { class: 'an-sep' }, ' · ') : null,
              ask !== 'roman' && ss.length ? symbolAnswers(ss) : null)),
          h('span', { class: 'an-item-act' },
            h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => editBox(i) }, 'Edit'),
            h('button', { type: 'button', class: 'btn btn-quiet sm an-del', onclick: (e) => removeBox(i, e.currentTarget) }, 'Delete')));
      })), keyList || '');
    }
    // ---------- the quiz-wide answer type ----------
    const warn = h('div', { class: 'an-miss' });
    const boxesText = (ns) => (ns.length === 1 ? `Box ${ns[0]}` : `Boxes ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);
    function syncWarn() {
      const m = MQ.missingAnswers(a);
      const note = (ns, lacks, has) => h('p', { class: 'warn-note' },
        `${boxesText(ns)} ${ns.length > 1 ? 'have' : 'has'} no ${lacks}, so ${ns.length > 1 ? 'they ask' : 'it asks'} for the ${has} only. Edit ${ns.length > 1 ? 'them' : 'it'} to add one.`);
      warn.replaceChildren(...[m.roman.length ? note(m.roman, 'Roman numeral', 'chord symbol') : null, m.symbol.length ? note(m.symbol, 'chord symbol', 'Roman numeral') : null].filter(Boolean),
        ...analysisProblems(a).map((t) => h('p', { class: 'warn-note' }, t)));
      menus.hidden = !MQ.analysisScores(a).some((sc) => sc.regions.some((r) => r.ask === 'nht'));
      keyTol.hidden = !MQ.analysisScores(a).some((sc) => sc.keys.some((m) => m.hide));
      if (MQ.analysisScores(a).some((sc) => sc.open.show === 2) && /\bkey\b/i.test(a.notes || '')) warn.append(h('p', { class: 'warn-note' }, 'Students are asked to identify the opening key, but your instructions mention a key — check they don’t give it away.'));
    }
    // How close a student's box around a key change must come to yours.
    const keyTol = grp('Key changes students find', seg('an-keytol', MQ.ANALYSIS_KEY_TOLS.map((v) => ({ v, label: v === 10 ? 'Close (10%)' : v === 15 ? 'Normal (15%)' : 'Loose (25%)' })), a.keyTol, (v) => { a.keyTol = v; changed(); }),
      'A student’s box counts when each side is within this share of your box’s width, and most of it (60%) is within your box’s height — it needn’t reach from top to bottom. Use Loose for a whole page of small music.');
    // The menus students choose from, for circled notes and pairs.
    const maskOf = (list, ids) => list.reduce((m, x, j) => (ids.includes(x.id) ? m | (1 << j) : m), 0);
    const idsOf = (list, m) => list.filter((_, j) => m & (1 << j)).map((x) => x.id);
    const menus = h('div', { class: 'an-menus' },
      grp('Students name circled notes from', chips('an-nht-opts', MQ.NHT_TYPES, maskOf(MQ.NHT_TYPES, a.nhtOpts), (m) => { a.nhtOpts = idsOf(MQ.NHT_TYPES, m); changed(); syncWarn(); }, (x) => x.id, (x) => x.name),
        'Hover for the full names. Non-harmonic tone (NT) as your answer accepts any kind; Neighbor tone (N) accepts upper and lower neighbors too.'),
      grp('…and pairs (two circles joined by a line) from', chips('an-pair-opts', MQ.NHT_PAIRS, maskOf(MQ.NHT_PAIRS, a.pairOpts), (m) => { a.pairOpts = idsOf(MQ.NHT_PAIRS, m); changed(); syncWarn(); }, (x) => x.id, (x) => x.name, true),
        'Suspension or Retardation as your answer accepts any of its kinds.'));
    function redraw() { drawStage(); drawEditor(); drawList(); syncWarn(); drawTabs(); }
    const notes = h('textarea', { id: 'an-notes', rows: 2, maxlength: 200, placeholder: 'e.g. Key: G major. Give the Roman numeral and figures for each boxed chord.' });
    notes.value = a.notes;
    notes.addEventListener('input', () => { a.notes = notes.value; changed(); });
    redraw();
    return [
      sec('score', scores.length > 1 ? 'The music — several scores' : 'The music', `Students see this black-and-white copy, with each box you draw lightly highlighted and their answer boxes beside the music. Each box is a question.${scores.length > 1 ? ' The scores come one after another, and the boxes are numbered on from one to the next.' : ' Add a score to ask about more than one piece.'}`,
        scoreTabs, titleFld, body),
      sec('an-answers', 'Answers', 'Each box asks for what you chose when you drew it — or set the whole quiz here.',
        grp('Every box asks for', seg('an-over', [{ v: 0, label: 'Each box’s own choice' }, { v: 1, label: 'Roman numerals' }, { v: 2, label: 'Chord symbols' }, { v: 3, label: 'Both' }],
          a.override, (v) => { a.override = v; changed(); redraw(); })),
        warn,
        menus,
        keyTol,
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
  // model: {meter, measures, parts, layers}. opts: readOnly, marks, onChange(layers), first (the number
  // of the measure before the first, for a rhythm grid's excerpt), noTriplets (a rhythm grid has none).
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
      meter: model.meter, measures: model.measures, parts, layers: model.layers, readOnly: !!o.readOnly, marks: o.marks || null, first: o.first || 0,
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
    if (o.noTriplets) { entry.trip = false; tripBtn.hidden = true; }
    const tie = () => { toast2(staff.toggleTie()); staff.focus(); };
    const tieBtn = h('button', { type: 'button', class: 'rh-tool', title: 'Tie the selected note, or the one before the cursor, to the next note — over the bar line too (~)', onclick: tie, hidden: !!o.noTies },
      svgEl(MQ.rhythmIcon('tie')), h('span', null, 'Tie'));
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
      ...valueBtns, h('span', { class: 'rh-sep', 'aria-hidden': 'true' }), dotBtn, tripBtn, restBtn, tieBtn,
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
      else if ((k === 't' || k === '3') && !o.noTriplets) flip('trip');
      else if (k === 'r' || k === '0') flip('rest');
      else if ((k === '~' || k === '`') && !o.noTies) tie();
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
        h('p', { class: 'rh-keys' }, 'Click the staff to place the cursor, or click a note to change it. To write a dotted note or a triplet, turn on Dot or Triplet, then choose the value. To tie a note to the next — in its measure or over the bar line — choose Tie after writing it. Keys: W H Q E S add notes, period (or D) for Dot, T for Triplet, R for Rest, ~ for Tie, arrows move, Backspace deletes.')),
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
      const layers = src.custom ? null : src.layers();
      if (src.needsNotes && !layers.some((L) => L.some((m) => m && m.length))) { toast('Write some notes first — then you can hear them.'); return; }
      const pe = src.custom ? src.custom() : MQ.rhythmPlayEvents(ex, layers, { from: sel.a, to: sel.b, countIn: S.listen.countIn, metronome: S.listen.metro });
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
    const b = dictation(cfg);
    if (!listCount(cfg, 'melody') && b.task === 'grid') return gridIntro(b, qs);
    const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
    const ex = b.playsEx ? `You can play each example ${times(b.playsEx)}` : 'You can play each example as often as you like';
    const ans = b.playsAns ? `, and hear your own answer ${times(b.playsAns)}` : ', and hear your own answer as often as you like';
    const notes = rhythmNotes(qs);
    const score = b.score === 'percent' ? ` The quiz is out of ${b.outOf} points — the share of its ${notes} notes you get right.`
      : ` Every note is worth a point — ${notes} in all — and each wrong or extra note costs one.`;
    return `Turn your sound on — headphones help. ${ex}${ans}.${score}`;
  }

  // What students should know before a rhythm-grid quiz.
  function gridIntro(b, qs) {
    const G = b.grid, notes = rhythmNotes(qs), what = G.rests ? 'note and rest' : 'note';
    const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
    const how = `For every ${what}, click the box where it starts and choose its value, then drag its arrow across the boxes it lasts.`;
    const listen = G.show === 0 ? '' : `Turn your sound on. ${b.playsEx ? `You can play each example ${times(b.playsEx)}` : 'You can play each example as often as you like'}${b.playsAns ? `, and hear your grid ${times(b.playsAns)}` : ', and hear your grid as often as you like'}. `;
    const score = b.score === 'percent' ? ` The quiz is out of ${b.outOf} points — the share of its ${notes} ${G.rests ? 'notes and rests' : 'notes'} you get right.`
      : ` Every ${what} is worth a point — ${notes} in all — and each wrong or extra one costs one.`;
    return `${listen}${how}${score}`;
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
    const grid = rh.task === 'grid';
    const src = rh.auto.on ? 1 : rh.src === 2 ? 2 : 0;
    if (src === 0 && !rh.examples.length) rh.examples.push(MQ.rhythmExample(null, grid));
    cfg.counts.rhythm = rh.auto.on ? rh.auto.count : rh.examples.length;
    S.rhEx = Math.max(0, Math.min(rh.examples.length - 1, S.rhEx || 0));
    R.total = h('span', { class: 'mix-total' });
    const mode = seg('rh-mode', [{ v: 0, label: 'Write the rhythms myself' }, { v: 1, label: 'Make them automatically' }, { v: 2, label: 'Choose them from the library' }], src, (v) => {
      rh.auto.on = v === 1;
      rh.src = v;
      if (v === 2) rh.examples = rh.examples.filter((ex) => !blankExample(ex));
      cfg.counts.rhythm = rh.auto.on ? rh.auto.count : rh.examples.length;
      changed();
      go('build');
    });
    // ---------- dictation or a grid ----------
    const TASKS = [
      { v: 'dictation', name: 'Rhythmic dictation', blurb: 'Students hear each rhythm and write it on a one-line staff.' },
      { v: 'grid', name: 'Rhythm grid', blurb: 'Students show on a grid of beats and boxes where each note starts and how long it lasts — reading the rhythm, hearing it, or both.' },
    ];
    const taskPick = h('div', { class: 'rh-levels rh-tasks', role: 'radiogroup', 'aria-label': 'Quiz type' }, TASKS.map((t) => h('button', {
      type: 'button', role: 'radio', class: 'rh-level', 'aria-checked': String(rh.task === t.v),
      onclick: () => {
        if (rh.task === t.v) return;
        rh.task = t.v;
        MQ.rhythmSettings(rh);
        // The default title follows the quiz type.
        if (cfg.title === 'Rhythmic Dictation' && t.v === 'grid') cfg.title = 'Rhythm Grid';
        else if (cfg.title === 'Rhythm Grid' && t.v === 'dictation') cfg.title = 'Rhythmic Dictation';
        cfg.counts.rhythm = rh.auto.on ? rh.auto.count : rh.examples.length;
        changed();
        go('build');
      },
    }, h('strong', null, t.name), h('span', null, t.blurb))));
    const first = [sec('rh-task', 'Quiz type', 'What students do with each rhythm.', taskPick)];
    if (grid) {
      const G = rh.grid;
      const again = () => { changed(); go('build'); };
      first.push(sec('rg-grid', 'The grid', 'One row for each measure, with the beats across the top and each beat split into boxes. Students write each note’s value in the box where it starts and drag its arrow across the boxes it lasts.',
        grp('Each box is', seg('rg-box', [{ v: 3, label: 'A sixteenth note' }, { v: 6, label: 'An eighth note' }, { v: 12, label: 'A quarter note' }], G.box, (v) => { G.box = v; again(); }),
          'A half note covers 8 sixteenth-note boxes, 4 eighth-note boxes or 2 quarter-note boxes. Nothing in the rhythm can be shorter than a box.'),
        grp('The rhythm is', seg('rg-show', [{ v: 0, label: 'Shown' }, { v: 1, label: 'Played' }, { v: 2, label: 'Shown and played' }], G.show, (v) => { G.show = v; again(); }),
          'Shown: printed above the grid, as on a worksheet. Played: students listen, as in dictation. Shown and played: both.'),
        grp('Rests', seg('rg-rests', [{ v: 0, label: 'Leave them blank' }, { v: 1, label: 'Mark them too' }], G.rests, (v) => { G.rests = v; again(); }),
          'Marked rests are graded like notes. Otherwise rests stay blank, and any a student marks are ignored.')));
    }
    const later = [scoringSection(rh, changed, R, null, grid
      ? 'Graded note by note. A note is right when it starts in the right box, has the right value, and its arrow covers the right number of boxes. A note missed or wrong is a wrong note, and so is every extra one. Rests count too when students mark them.' : null)];
    if (!grid || rh.grid.show > 0) later.push(listeningSection(rh, changed));
    if (rh.auto.on) {
      return first.concat([sec('rh-examples', 'Examples', 'Clefwork writes the rhythms from the level you choose. Everyone with the quiz code gets the same ones.',
        mode, autoPanel(cfg, changed), h('div', { class: 'mix-foot' }, R.total))], later);
    }
    if (src === 2) {
      rh.pick = rh.pick || {};
      const lib = libraryMode({
        id: 'rh-lib', need: 'rhythm', max: 4, limit: MQ.RHYTHM_MAX, list: rh.examples, pick: rh.pick, noun: 'rhythm', parts: !grid, ties: !grid, autoFill: true,
        make: (piece, x) => {
          const ex = MQ.libraryRhythm(piece, grid ? [x.parts[0]] : x.parts, x.from, x.count);
          if (grid) { ex.parts = 1; ex.first = x.from + 1; }
          return MQ.exampleSettings(ex);
        },
        ok: (ex) => !MQ.exampleProblems(ex, grid ? rh.grid : null).length, preview: rhythmPreview,
        changed: () => { cfg.counts.rhythm = rh.examples.length; changed(); },
      });
      return first.concat([sec('rh-examples', 'Examples', 'Rhythms from real music. Everyone with the quiz code gets the same ones.', mode, lib, h('div', { class: 'mix-foot' }, R.total))], later);
    }
    const tabs = h('div', { class: 'rh-tabs', role: 'tablist', 'aria-label': 'Examples' });
    const body = h('div', { class: 'rh-ex' });
    const edited = () => { cfg.counts.rhythm = rh.examples.length; changed(); drawTabs(); };
    function drawTabs() {
      tabs.replaceChildren(...rh.examples.map((ex, i) => {
        const ok = !MQ.exampleProblems(ex, grid ? rh.grid : null).length;
        return h('button', {
          type: 'button', role: 'tab', class: 'rh-tab', 'aria-selected': String(i === S.rhEx),
          title: ok ? 'Ready' : 'Not finished yet', onclick: () => { S.rhEx = i; drawTabs(); drawExample(); },
        }, h('span', null, `Example ${i + 1}`), h('span', { class: 'rh-tab-state ' + (ok ? 'is-ok' : 'is-open'), 'aria-label': ok ? 'ready' : 'not finished' }, ok ? '✓' : '•'));
      }), rh.examples.length < MQ.RHYTHM_MAX ? h('button', {
        type: 'button', class: 'rh-tab rh-add', onclick: () => {
          rh.examples.push(MQ.rhythmExample(rh.examples[S.rhEx], grid));
          S.rhEx = rh.examples.length - 1;
          edited(); drawExample();
          toast(grid ? `Example ${S.rhEx + 1} added — same time signature, carrying on the measure numbers` : `Example ${S.rhEx + 1} added — same time signature and tempo`);
        },
      }, '+ Add example') : null,
      rh.examples.length < MQ.RHYTHM_MAX ? h('button', {
        type: 'button', class: 'rh-tab rh-add', onclick: () => openLibrary({
          need: 'rhythm', max: 4, ties: !grid, title: 'A rhythm from the library',
          onPick: (piece, sel) => {
            const ex = MQ.libraryRhythm(piece, grid ? [sel.parts[0]] : sel.parts, sel.from, sel.count);
            if (grid) { ex.parts = 1; ex.first = sel.from + 1; }
            rh.examples.push(MQ.exampleSettings(ex));
            S.rhEx = rh.examples.length - 1;
            edited(); drawExample();
            toast(`Example ${S.rhEx + 1}: measures ${sel.from + 1}–${sel.from + sel.count} of ${piece.title}`);
          },
        }),
      }, '♪ From the library') : null);
    }
    function drawExample() {
      const ex = MQ.exampleSettings(rh.examples[S.rhEx]);
      const info = MQ.rhythmMeter(ex.meter);
      const redo = () => { edited(); drawExample(); };
      // ---------- settings ----------
      const measures = seg('rh-measures', [1, 2, 3, 4].map((v) => ({ v, label: String(v) })), ex.measures, (v) => { ex.measures = v; redo(); });
      // A rhythm grid can number its measures from anywhere — an excerpt from m. 46.
      const firstIn = h('input', { type: 'number', id: 'rg-first', min: 1, max: 999, inputmode: 'numeric' });
      firstIn.value = ex.first;
      firstIn.addEventListener('change', () => { ex.first = Math.max(1, Math.min(999, Math.round(+firstIn.value || 1))); firstIn.value = ex.first; redo(); });
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
      const twoParts = grid ? null : toggle('rh-parts', 'Two parts', 'Adds a part with stems down, played by the oboe. It can have its own rhythm.', ex.parts > 1, (v) => { ex.parts = v ? 2 : 1; redo(); });
      // ---------- the rhythm ----------
      // A rhythm grid: the answer on its grid, redrawn as the rhythm is written.
      const gridView = grid ? h('div', { class: 'rgrid-box' }) : null;
      const drawGrid = () => {
        if (!gridView) return;
        const probs = MQ.gridProblems(ex, rh.grid);
        if (probs.length) { gridView.replaceChildren(h('p', { class: 'warn-note' }, probs[0])); return; }
        const q = MQ.gridQuestion(ex, MQ.rhythmMeter(ex.meter), S.rhEx, rh.grid);
        gridView.replaceChildren();
        new MQ.RhythmGrid(gridView, { meter: ex.meter, measures: ex.measures, first: ex.first, box: rh.grid.box, readOnly: true, answer: MQ.gridAnswerEntries(q), dimRests: !rh.grid.rests });
      };
      const ed = rhythmEditor(ex, { noTriplets: grid, noTies: grid, first: grid ? ex.first - 1 : 0, onChange: (L) => { L.forEach((layer, l) => (ex.layers[l] = layer)); edited(); drawGrid(); } });
      drawGrid();
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
        grid ? h('div', { class: 'row2' },
          grp('Measures', measures, 'One to four.'),
          grp('First measure number', firstIn, 'Where the excerpt starts — m. 46 labels the rows 46, 47 …')) : null,
        h('div', { class: 'row2' },
          grid ? null : grp('Measures', measures, 'One to four.'),
          grp('Tempo', tempo, `Beats per minute, counting ${MQ.RHYTHM_TEMPO_NAMES[info.tempo]}s.${grid && !rh.grid.show ? ' Used when you play it here.' : ''}`)),
        twoParts,
        h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, ex.parts > 1 ? 'The rhythm — stems up for the piano, stems down for the oboe' : 'The rhythm'), ed.el),
        gridView ? h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, 'The answer on the grid'), gridView) : null,
        listenPanel({ ex, sources: [{ label: 'Play the rhythm', primary: true, layers: () => ex.layers }], staffs: () => [ed.staff] })].filter(Boolean));
    }
    drawTabs();
    drawExample();
    return first.concat([
      sec('rh-examples', 'Examples', grid ? 'Write each rhythm for the grid. Every measure has to be full before the quiz can be shared — rests count.' : 'Write each rhythm students will hear. Every measure has to be full before the quiz can be shared — rests count.',
        mode, tabs, body, h('div', { class: 'mix-foot' }, R.total)),
    ], later);
  }
  // How often students may listen — shared by Clefwork Rhythm and Melody (block: cfg.rhythm or cfg.melody).
  function listeningSection(block, changed) {
    const PLAYS = [{ v: 0, label: 'Unlimited' }].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v, label: v === 1 ? 'Once' : `${v} times` })));
    return sec('rh-listen', 'Listening', 'How often students may play each example, and their own answer, before they submit. Choosing measures, the count-off and the metronome are up to them.',
      h('div', { class: 'row2' },
        fld('Plays of the example', selectEl('rh-plays-ex', PLAYS, block.playsEx, (v) => { block.playsEx = +v; changed(); }), 'Per example. Each play counts, however many measures it covers.'),
        fld('Plays of their answer', selectEl('rh-plays-ans', PLAYS, block.playsAns, (v) => { block.playsAns = +v; changed(); }), 'Per example. Students hear what they’ve written, on the same instruments.')));
  }
  // How the quiz is scored: a point for every note, or a percent of a total the teacher sets.
  // `extra`: more controls to add (Clefwork Melody's).
  function scoringSection(block, changed, R, extra, desc) {
    const rh = block;
    const outIn = h('input', { type: 'number', id: 'rh-outof', min: 1, max: 1000, inputmode: 'numeric' });
    outIn.value = rh.outOf;
    outIn.addEventListener('change', () => { rh.outOf = Math.max(1, Math.min(1000, Math.round(+outIn.value || 100))); outIn.value = rh.outOf; changed(); });
    const outWrap = fld('Total points', outIn, 'The share of notes a student gets right, scaled to this total.');
    outWrap.hidden = rh.score !== 'percent';
    R.scoreInfo = h('p', { class: 'fine rh-score-info' });
    return sec('rh-score', 'Scoring', desc || 'Graded note by note. A note the student misses or writes the wrong length is a wrong note, and so is every extra note they write. Rests only fill time, so two eighth rests match a quarter rest, and tied notes are one note, so two tied quarters match a half note.',
      grp('Score the quiz', seg('rh-score', [{ v: 'notes', label: 'A point for every note' }, { v: 'percent', label: 'A percent of a total I choose' }], rh.score, (v) => {
        rh.score = v;
        outWrap.hidden = v !== 'percent';
        changed();
      })),
      outWrap, ...(extra || []), R.scoreInfo);
  }
  // Notes in the quiz's examples — what a note-scored quiz is out of.
  const rhythmNotes = (qs) => qs.reduce((n, q) => n + (q.type === 'rhythm' ? MQ.compareRhythm(q, null).notes : q.type === 'melody' ? MQ.compareMelody(q, null).notes : q.type === 'rgrid' ? MQ.compareGrid(q, null).notes : 0), 0);
  // The listening and scoring settings of a rhythm or melody quiz.
  const dictation = (cfg) => (listCount(cfg, 'melody') ? MQ.melodySettings(cfg.melody) : MQ.rhythmSettings(cfg.rhythm));
  function rhythmScoreText(cfg, qs) {
    const b = dictation(cfg), notes = rhythmNotes(qs);
    if (!notes) return '';
    if (b.score !== 'percent') return `These examples have ${notes} notes in all, so the quiz is out of ${notes}. Each wrong note costs a point.`;
    const eg = Math.min(3, notes);
    return `These examples have ${notes} notes in all. The quiz is out of ${b.outOf}: a student with ${eg} wrong note${eg === 1 ? '' : 's'} scores ${fmtPts(((notes - eg) / notes) * b.outOf)} of ${b.outOf}.`;
  }

  // ---------- Clefwork Rhythm: examples made automatically ----------
  function autoPanel(cfg, changed) {
    const a = cfg.rhythm.auto, c = a.custom;
    const grid = cfg.rhythm.task === 'grid';
    const preview = h('div', { class: 'rh-auto-list' });
    // Any change moves the quiz onto the newest generator (an untouched draft keeps its examples).
    const redo = () => { a.gen = MQ.RHYTHM_GEN; cfg.counts.rhythm = a.count; changed(); drawPreview(); };
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
    custom.append(...customRhythmRules(c, redo));
    drawLevels();
    // ---------- tempo ----------
    const tempoIn = tempoInput('rh-auto-tempo', a, redo);
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
      grp('Level', levels, grid ? `For a grid, triplets are left out, no note is shorter than a box (${MQ.gridBoxName(cfg.rhythm.grid.box)} note), and only time signatures whose beats split into whole boxes are used.` : null),
      custom,
      grid ? null : toggle('rh-auto-ties', 'Ties', 'Tie some notes to the next: held over the bar line, or an off-beat note held over the next beat — about one tie every two measures. The rhythms are otherwise the same.', a.ties, (v) => { a.ties = v ? 1 : 0; redo(); }),
      grp('Tempo', tempoIn, 'In other meters the eighth notes keep this speed: ♩ = 80 is ♩. = 53 in 6/8.'),
      h('div', { class: 'rh-auto-top' }, h('span', { class: 'mini-label' }, 'The examples'), fresh),
      preview);
  }
  // The quarter-note tempo of automatic examples.
  function tempoInput(id, a, redo) {
    const inp = h('input', { type: 'number', id, min: 40, max: 240, inputmode: 'numeric' });
    inp.value = a.tempo;
    inp.addEventListener('change', () => { a.tempo = Math.max(40, Math.min(240, Math.round(+inp.value || 80))); inp.value = a.tempo; redo(); });
    return h('div', { class: 'rh-tempo' }, h('span', { class: 'rh-tempo-sign', 'aria-hidden': 'true' }, '♩ ='), inp);
  }
  // The rhythm side of custom rules, for automatic rhythms and melodies.
  function customRhythmRules(c, redo) {
    const NUMS = [2, 3, 4, 5, 6].map((n) => ({ v: n, label: `${n}/4` }));
    const lo = selectEl('rh-c-lo', NUMS, c.lo, (v) => { c.lo = +v; if (c.hi < c.lo) { c.hi = c.lo; hi.value = String(c.hi); } redo(); });
    const hi = selectEl('rh-c-hi', NUMS, c.hi, (v) => { c.hi = +v; if (c.lo > c.hi) { c.lo = c.hi; lo.value = String(c.lo); } redo(); });
    const flip = (k) => (v) => { c[k] = v ? 1 : 0; redo(); };
    return [
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
        'One or two in each example, or up to about one a measure.'),
      grp('Rests', seg('rh-c-rests', [{ v: 0, label: 'None' }, { v: 1, label: 'A few' }, { v: 2, label: 'Some' }, { v: 3, label: 'Many' }], c.rests, (v) => { c.rests = v; redo(); }),
        'How many measures have a rest: none, up to a quarter of them, a fifth to a half, or up to four in five. With notes off the beat, rests can fall on the beat too.'),
    ];
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

  // ---------- Clefwork Rhythm: the rhythm grid ----------
  const barsText = (first, n) => (n > 1 ? `m. ${first}–${first + n - 1}` : `m. ${first}`);
  // The grid students fill in, with the note buttons. model: {meter, measures, first, box, entries}.
  // opts: readOnly, marks, answer, dimRests, onChange(entries).
  function gridEditor(model, opts) {
    const o = opts || {};
    const box = h('div', { class: 'rgrid-box' });
    const status = h('p', { class: 'g-status', 'aria-live': 'polite' });
    let grid = null;
    const drawStatus = () => {
      if (!grid || o.readOnly) return;
      status.textContent = grid.where() + (grid.sel
        ? ' Drag its arrow — or press Shift and → or ← — to show how long it lasts, or choose another value to change it.'
        : ' Choose the value of the note that starts here.')
        + (grid.svg.classList.contains('is-wide') && grid.sel ? ' (On a small screen, use Longer and Shorter.)' : '');
    };
    grid = new MQ.RhythmGrid(box, {
      meter: model.meter, measures: model.measures, first: model.first, box: model.box, entries: model.entries,
      readOnly: !!o.readOnly, marks: o.marks || null, answer: o.answer || null, dimRests: !!o.dimRests,
      onChange: (E) => { if (o.onChange) o.onChange(E); }, onMove: drawStatus,
    });
    if (o.readOnly) return { el: h('div', { class: 'rh-editor' }, box), grid };
    const entry = S.rhEntry;
    const place = (k) => {
      if (entry.dot && k === 4) { toast('Turn off Dot to write a sixteenth — a dotted sixteenth would need a thirty-second note to finish the beat.'); return; }
      grid.place({ v: k, d: entry.dot ? 1 : 0, r: entry.rest ? 1 : 0 });
      grid.focus();
    };
    const valueBtns = MQ.RHYTHM_VALUES.map((v, k) => h('button', {
      type: 'button', class: 'rh-tool', title: `${v.name[0].toUpperCase() + v.name.slice(1)} (${v.id.toUpperCase()})`,
      // Nothing shorter than a box fits the grid.
      disabled: v.units < model.box || null, onclick: () => place(k),
    }, svgEl(MQ.rhythmIcon(v.name)), h('span', null, v.name === 'sixteenth' ? '16th' : v.name[0].toUpperCase() + v.name.slice(1))));
    const modeBtn = (key, label, iconKind, title) => h('button', { type: 'button', class: 'rh-tool rh-mode', 'aria-pressed': String(!!entry[key]), title, onclick: () => flip(key) }, svgEl(MQ.rhythmIcon(iconKind)), h('span', null, label));
    const dotBtn = modeBtn('dot', 'Dot', 'dot', 'Dotted notes: turn on, then choose a value (.)');
    const restBtn = modeBtn('rest', 'Rest', 'rest', 'Rests instead of notes (R)');
    function paint() {
      dotBtn.setAttribute('aria-pressed', String(!!entry.dot));
      restBtn.setAttribute('aria-pressed', String(!!entry.rest));
      valueBtns[4].disabled = !!entry.dot || model.box > 3 || null;
    }
    function flip(key) { entry[key] = !entry[key]; paint(); }
    const del = () => { if (!grid.remove()) toast('Click a note first, then delete it.'); grid.focus(); };
    const arrow = (d) => `<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const sizeBtn = (label, title, d, delta) => h('button', { type: 'button', class: 'rh-tool', title, onclick: () => { if (!grid.resize(delta)) toast(delta > 0 ? 'It can’t reach any further — the next note or the bar line is in the way.' : 'A note covers at least one box.'); grid.focus(); } }, svgEl(arrow(d)), h('span', null, label));
    const palette = h('div', { class: 'rh-palette', role: 'toolbar', 'aria-label': 'Note values' },
      ...valueBtns, h('span', { class: 'rh-sep', 'aria-hidden': 'true' }), dotBtn, restBtn,
      h('span', { class: 'rh-sep', 'aria-hidden': 'true' }),
      sizeBtn('Shorter', 'Covers one box fewer (Shift + ←)', 'M15 7l-6 6 6 6', -1),
      sizeBtn('Longer', 'Covers one box more (Shift + →)', 'M9 7l6 6-6 6', 1),
      h('span', { class: 'rh-sep', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'rh-tool', title: 'Delete the selected note (Backspace)', onclick: del },
        svgEl('<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="M9 6h11v14H9l-6-7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10l5 6M17 10l-5 6" stroke="currentColor" stroke-width="1.6"/></svg>'), h('span', null, 'Delete')),
      h('button', { type: 'button', class: 'rh-tool', title: 'Empty the measure you’re in', onclick: () => { if (!grid.clearRow()) toast('That measure is already empty.'); grid.focus(); } },
        svgEl('<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="M5 8h14M9 8V5h6v3M7 8l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'), h('span', null, 'Clear row')));
    paint();
    const KEYS_V = { w: 0, 1: 0, h: 1, 2: 1, q: 2, 4: 2, e: 3, 8: 3, s: 4, 6: 4 };
    grid.svg.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let done = true;
      if (k in KEYS_V) { if (!valueBtns[KEYS_V[k]].disabled || (KEYS_V[k] === 4 && entry.dot)) place(KEYS_V[k]); else toast(`Each box is ${MQ.gridBoxName(model.box) === 'eighth' ? 'an' : 'a'} ${MQ.gridBoxName(model.box)} note — nothing shorter fits.`); }
      else if (k === '.' || k === 'd' || e.code === 'Period' || e.code === 'NumpadDecimal') flip('dot');
      else if (k === 'r' || k === '0') flip('rest');
      else if (k === 'ArrowRight' && e.shiftKey) grid.resize(1);
      else if (k === 'ArrowLeft' && e.shiftKey) grid.resize(-1);
      else if (k === 'ArrowRight') grid.move(1);
      else if (k === 'ArrowLeft') grid.move(-1);
      else if (k === 'ArrowDown') grid.moveRow(1);
      else if (k === 'ArrowUp') grid.moveRow(-1);
      else if (k === 'Backspace' || k === 'Delete') del();
      else if (k === 'Escape') grid.deselect();
      else done = false;
      if (done) e.preventDefault();
    });
    drawStatus();
    return {
      el: h('div', { class: 'rh-editor rg-editor' }, box, palette, status,
        h('p', { class: 'rh-keys' }, 'Click the box where a note starts (or drag across the boxes it lasts), then choose its value. Drag a note’s arrow to show how long it lasts. Keys: W H Q E S write notes, period (or D) for Dot, R for Rest, arrows move, Shift + → ← make a note longer or shorter, Backspace deletes.')),
      grid,
    };
  }
  // A rhythm written out, its measures numbered from its first.
  function notationRow(R) {
    const box = h('div', { class: 'rstaff-box rg-notation' });
    const staff = new MQ.RhythmStaff(box, { meter: R.meter, measures: R.measures, parts: 1, layers: R.layers, readOnly: true, first: (R.first || 1) - 1 });
    return { el: box, staff };
  }
  function gridFacts(R, info) {
    const G = R.grid;
    return h('dl', { class: 'facts rh-facts' },
      h('div', null, h('dt', null, 'Time'), h('dd', null, info.label + (info.grouping ? ` (${info.grouping})` : ''))),
      h('div', null, h('dt', null, 'Measures'), h('dd', null, barsText(R.first || 1, R.measures))),
      h('div', null, h('dt', null, 'Each box'), h('dd', null, `${MQ.gridBoxName(G.box)[0].toUpperCase() + MQ.gridBoxName(G.box).slice(1)} note`)),
      G.show > 0 ? h('div', null, h('dt', null, 'Tempo'), h('dd', null, tempoLabel(info, R.tempo))) : null,
      h('div', null, h('dt', null, 'Rests'), h('dd', null, G.rests ? 'Mark them too' : 'Leave blank')));
  }
  // One rhythm-grid question: read (or hear) the rhythm, then fill in the grid.
  function gridCard(q, cfg, o) {
    const R = q.rh, G = R.grid, info = MQ.rhythmMeter(R.meter);
    const reveal = !!o.reveal && !o.keyMode;
    const grader = !!o.locked && !o.plays;
    const heard = G.show > 0, seen = G.show !== 1;
    const wrap = h('div', { class: 'qcard rh-card rg-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, `${info.label} · ${barsText(R.first || 1, R.measures)}`)));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (!o.locked && !o.keyMode) {
      wrap.append(h('p', { class: 'q-hint' }, `${seen ? (heard ? 'Read the rhythm — you can play it too.' : 'Read the rhythm.') : 'Listen as often as you’re allowed.'} For each note, click the box where it starts and choose its value, then drag its arrow across the boxes it lasts.${G.rests ? ' Mark the rests the same way.' : ' Leave the rests blank.'}`));
    }
    wrap.append(gridFacts(R, info));
    const resp = o.response || null;
    const cmp = reveal ? MQ.compareGrid(q, resp) : null;
    let ed = null, answerGrid = null;
    const music = seen || o.keyMode || reveal ? notationRow(R) : null;
    if (music && (seen || reveal)) wrap.append(h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, seen ? 'The rhythm' : 'The rhythm that was played'), music.el));
    if (heard) {
      const limit = MQ.rhythmSettings(cfg.rhythm);
      const left = (k) => {
        const lim = o.plays && !o.locked ? (k === 'ex' ? limit.playsEx : limit.playsAns) || 0 : 0;
        return lim ? Math.max(0, lim - (o.plays[k] || 0)) : Infinity;
      };
      const use = (k) => () => { if (o.plays && !o.locked) { o.plays[k] = (o.plays[k] || 0) + 1; if (o.onPlays) o.onPlays(); } };
      const sources = [{ label: 'Play the example', primary: true, layers: () => R.layers, left: () => left('ex'), use: use('ex') }];
      if (!o.keyMode) sources.push({ label: grader ? 'Play their answer' : 'Hear my answer', layers: () => MQ.gridLayers(ed ? ed.grid.entries() : resp, R.measures, G.box), needsNotes: true, left: () => left('ans'), use: use('ans') });
      wrap.append(listenPanel({ ex: R, sources, staffs: () => [music && seen ? music.staff : null, ed && ed.grid, answerGrid].filter(Boolean) }));
    }
    if (!o.keyMode) {
      ed = gridEditor({ meter: R.meter, measures: R.measures, first: R.first, box: G.box, entries: resp }, {
        readOnly: !!o.locked, marks: cmp ? { side: 'got', measures: cmp.measures } : null,
        onChange: (E) => { if (o.onResponse) o.onResponse(E); },
      });
      wrap.append(h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, grader ? 'Student’s grid' : o.locked ? 'Your grid' : 'Your answer — fill in the grid'), ed.el));
    }
    if (reveal || o.keyMode) {
      const box = h('div', { class: 'rgrid-box' });
      answerGrid = new MQ.RhythmGrid(box, {
        meter: R.meter, measures: R.measures, first: R.first, box: G.box, readOnly: true, answer: MQ.gridAnswerEntries(q),
        marks: cmp ? { side: 'want', measures: cmp.measures } : null, dimRests: !G.rests,
      });
      wrap.append(h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, cmp && cmp.wrong ? 'The answer — notes that were missed or wrong are in red' : 'The answer'), box));
    }
    if (o.playsUsed && heard) {
      const t = (k) => `${o.playsUsed[k]} time${o.playsUsed[k] === 1 ? '' : 's'}`;
      wrap.append(h('p', { class: 'fine rh-plays' }, `Played the example ${t('ex')} and their answer ${t('ans')}.`));
    }
    if (cmp) {
      const right = Math.max(0, cmp.notes - cmp.wrong), what = G.rests ? 'notes and rests' : 'notes';
      wrap.append(!cmp.wrong ? h('p', { class: 'result is-good', role: 'status' }, h('strong', null, 'Correct.'), ` All ${cmp.notes} ${what} are in the right boxes.`)
        : h('p', { class: 'result is-bad', role: 'status' }, h('strong', null, `${cmp.wrong} wrong`), ` — ${right} of ${cmp.notes} points. `,
          'Red notes start in the wrong box, have the wrong value, last the wrong number of boxes, or are extra; in the answer, red notes were missed or wrong.'));
    }
    return wrap;
  }
  // An answer-key entry: the example's rhythm on its grid.
  function gridKeyItem(q) {
    const R = q.rh, info = MQ.rhythmMeter(R.meter);
    const box = h('div', { class: 'rgrid-box rh-key-staff' });
    new MQ.RhythmGrid(box, { meter: R.meter, measures: R.measures, first: R.first, box: R.grid.box, readOnly: true, answer: MQ.gridAnswerEntries(q), dimRests: !R.grid.rests });
    return h('li', null, h('span', { class: 'key-q' }, `Example ${R.n + 1}`, h('span', { class: 'key-clef' }, ` · ${info.label} · ${barsText(R.first || 1, R.measures)} · ${MQ.gridBoxName(R.grid.box)}-note boxes`)), box);
  }
  // On paper, as on a worksheet: the rhythm (unless students only hear it), then an empty grid.
  function gridPrintArt(q, opts) {
    const R = q.rh, rows = [];
    if (R.grid.show !== 1) {
      const art = MQ.rhythmArt({ meter: R.meter, measures: R.measures, parts: 1, layers: R.layers }, { first: (R.first || 1) - 1, heightIn: (opts && opts.height) || 1.25 });
      // No wider than the page (or a Word document's margins).
      const f = Math.min(1, 6 / art.wIn);
      art.wIn *= f; art.hIn *= f;
      rows.push(art);
    }
    rows.push(MQ.gridArt({ meter: R.meter, measures: R.measures, first: R.first, box: R.grid.box, entries: [] }, { wIn: 6 }));
    return rows;
  }

  // ---------- Clefwork Melody: hearing and writing melodies ----------
  const ACC_ICON = (alt) => `<svg class="rh-icon" viewBox="-12 -19 24 34" aria-hidden="true"><g fill="currentColor" color="currentColor">${MQ.ACC_SVG[alt]}</g></svg>`;
  // The staff a melody is written on, with the note buttons and what each measure still needs.
  // model: {meter, measures, layers, key, clef}. opts: readOnly, marks, first, onChange(layers).
  function melodyEditor(model, opts) {
    const o = opts || {};
    const uid = ++rhUid;
    const box = h('div', { class: 'rstaff-box mstaff-box' });
    const status = h('div', { class: 'rh-status', 'aria-live': 'polite' });
    const entry = S.rhEntry;
    const staff = new MQ.MelodyStaff(box, {
      meter: model.meter, measures: model.measures, parts: 1, layers: model.layers, key: model.key, clef: model.clef, first: o.first || null,
      slots: MQ.MELODY_MEASURES, readOnly: !!o.readOnly, marks: o.marks || null, sound: !o.readOnly,
      onChange: (layers) => { drawStatus(); if (o.onChange) o.onChange(layers); },
    });
    function drawStatus() {
      const info = MQ.rhythmMeter(model.meter), L = staff.layers()[0];
      const chips = [];
      for (let m = 0; m < model.measures; m++) {
        const note = MQ.measureNote(L[m], info);
        chips.push(h('span', { class: 'rh-chip ' + (!note ? 'is-ok' : note === 'empty' ? 'is-empty' : 'is-short') }, h('b', null, String(m + 1)), !note ? ' ✓' : ' ' + note));
      }
      status.replaceChildren(h('div', { class: 'rh-status-row' }, chips));
    }
    if (o.readOnly) return { el: h('div', { class: 'rh-editor' }, box), staff };
    drawStatus();
    // ---------- the note buttons ----------
    const add = (k) => {
      if (entry.dot && k === 4) { toast('Turn off Dot to write a sixteenth — a dotted sixteenth would need a thirty-second note to finish the beat.'); return; }
      S.mlValue = k;
      const msg = staff.enter({ v: k, d: entry.dot ? 1 : 0, t: entry.trip ? 1 : 0, r: entry.rest ? 1 : 0 });
      if (msg) toast(msg, 'bad');
      staff.focus();
    };
    const valueBtns = MQ.RHYTHM_VALUES.map((v, k) => h('button', {
      type: 'button', class: 'rh-tool', title: `${v.name[0].toUpperCase() + v.name.slice(1)} (${['1', '2', '4', '8', '6'][k]})`, onclick: () => add(k),
    }, svgEl(MQ.rhythmIcon(v.name)), h('span', null, v.name === 'sixteenth' ? '16th' : v.name[0].toUpperCase() + v.name.slice(1))));
    const modeBtn = (key, label, iconKind, title) => h('button', { type: 'button', class: 'rh-tool rh-mode', 'aria-pressed': String(!!entry[key]), title, onclick: () => flip(key) }, svgEl(MQ.rhythmIcon(iconKind)), h('span', null, label));
    const dotBtn = modeBtn('dot', 'Dot', 'dot', 'Dotted notes: turn on, then choose a value (.)');
    const tripBtn = modeBtn('trip', 'Triplet', 'triplet', 'Triplets: turn on, then choose a value (T)');
    const restBtn = modeBtn('rest', 'Rest', 'rest', 'Rests instead of notes (R)');
    const tie = () => { const msg = staff.toggleTie(); if (msg) toast(msg, 'bad'); staff.focus(); };
    const tieBtn = h('button', { type: 'button', class: 'rh-tool', title: 'Tie the selected note, or the one before the cursor, to the next note — over the bar line too (~)', onclick: tie },
      svgEl(MQ.rhythmIcon('tie')), h('span', null, 'Tie'));
    function paint() {
      dotBtn.setAttribute('aria-pressed', String(!!entry.dot));
      tripBtn.setAttribute('aria-pressed', String(!!entry.trip));
      restBtn.setAttribute('aria-pressed', String(!!entry.rest));
      valueBtns[4].disabled = !!entry.dot;
    }
    function flip(key) {
      entry[key] = !entry[key];
      if (key === 'dot' && entry.dot) entry.trip = false;
      if (key === 'trip' && entry.trip) entry.dot = false;
      paint();
    }
    const need = () => toast('Select a note first — click it on the staff.');
    const pitchBtn = (label, title, iconHTML, fn) => h('button', { type: 'button', class: 'rh-tool', title, onclick: () => { fn(); staff.focus(); } }, svgEl(iconHTML), h('span', null, label));
    const arrow = (d) => `<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const palette = h('div', { class: 'rh-palette', role: 'toolbar', 'aria-label': 'Notes' },
      ...valueBtns, h('span', { class: 'rh-sep', 'aria-hidden': 'true' }), dotBtn, tripBtn, restBtn, tieBtn,
      h('span', { class: 'rh-sep', 'aria-hidden': 'true' }),
      pitchBtn('Sharp', 'Make the note sharp (+)', ACC_ICON(1), () => staff.setAlt(1) || need()),
      pitchBtn('Flat', 'Make the note flat (−)', ACC_ICON(-1), () => staff.setAlt(-1) || need()),
      pitchBtn('Natural', 'Make the note natural (=)', ACC_ICON(0), () => staff.setAlt(0) || need()),
      pitchBtn('Up', 'Up a step (↑; Shift for an octave)', arrow('M6 15l6-6 6 6'), () => staff.nudge(1)),
      pitchBtn('Down', 'Down a step (↓; Shift for an octave)', arrow('M6 10l6 6 6-6'), () => staff.nudge(-1)),
      h('span', { class: 'rh-sep', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'rh-tool', title: 'Delete the selected note, or the one before the cursor (Backspace)', onclick: () => { if (!staff.remove(true)) toast('There’s nothing before the cursor to delete.'); staff.focus(); } },
        svgEl('<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="M9 6h11v14H9l-6-7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10l5 6M17 10l-5 6" stroke="currentColor" stroke-width="1.6"/></svg>'), h('span', null, 'Delete')),
      h('button', { type: 'button', class: 'rh-tool', title: 'Empty the measure the cursor is in', onclick: () => { if (!staff.clearMeasure()) toast('That measure is already empty.'); staff.focus(); } },
        svgEl('<svg class="rh-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="M5 8h14M9 8V5h6v3M7 8l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'), h('span', null, 'Clear bar')));
    paint();
    // ---------- keyboard ----------
    const DIGITS = { 1: 0, 2: 1, 4: 2, 8: 3, 6: 4 };
    staff.svg.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let done = true;
      if (k in DIGITS) add(DIGITS[k]);
      else if ('abcdefg'.includes(k) && k.length === 1) {
        const v = S.mlValue == null ? 2 : S.mlValue;
        const msg = staff.enterLetter('cdefgab'.indexOf(k), { v, d: entry.dot && v !== 4 ? 1 : 0, t: entry.trip ? 1 : 0, r: 0 });
        if (msg) toast(msg, 'bad');
      } else if (k === '.' || e.code === 'Period' || e.code === 'NumpadDecimal') flip('dot');
      else if (k === 't' || k === '3') flip('trip');
      else if (k === 'r' || k === '0') flip('rest');
      else if (k === '~' || k === '`') tie();
      else if (k === '+' || k === '#') { if (!staff.setAlt(1)) need(); }
      else if (k === '-' || k === '_') { if (!staff.setAlt(-1)) need(); }
      else if (k === '=' || k === 'n') { if (!staff.setAlt(0)) need(); }
      else if (k === 'ArrowUp') staff.nudge(e.shiftKey ? 7 : 1);
      else if (k === 'ArrowDown') staff.nudge(e.shiftKey ? -7 : -1);
      else if (k === 'ArrowLeft') staff.move(-1);
      else if (k === 'ArrowRight') staff.move(1);
      else if (k === 'Backspace') { if (!staff.remove(true)) toast('There’s nothing before the cursor to delete.'); }
      else if (k === 'Delete') staff.remove(false);
      else if (k === 'Escape') { staff.sel = null; staff.moved(); }
      else done = false;
      if (done) e.preventDefault();
    });
    return {
      el: h('div', { class: 'rh-editor', id: 'ml-ed-' + uid }, box, palette, status,
        h('p', { class: 'rh-keys' }, 'Click the staff where the next note goes, then choose its value — or type the letter name (A–G). Drag a note, or use ↑ ↓, to move it; ♯ ♭ ♮ change the note just written or clicked. Tie joins a note to the next one, in its measure or over the bar line; tied notes keep the same pitch. Keys: 1 2 4 8 6 for whole to sixteenth, period for Dot, T for Triplet, R for Rest, ~ for Tie, + − = for sharp, flat and natural.')),
      staff,
    };
  }
  function melodyFacts(M, info) {
    return h('dl', { class: 'facts rh-facts' },
      h('div', null, h('dt', null, 'Key'), h('dd', null, MQ.melodyKeyName(M.key))),
      h('div', null, h('dt', null, 'Time'), h('dd', null, info.label + (info.grouping ? ` (${info.grouping})` : ''))),
      h('div', null, h('dt', null, 'Tempo'), h('dd', null, tempoLabel(info, M.tempo))),
      h('div', null, h('dt', null, 'Measures'), h('dd', null, String(M.measures))),
      M.first ? h('div', null, h('dt', null, 'First note'), h('dd', null, MQ.fullName(M.first))) : null);
  }
  // "Hear the key": the tonic chord, which doesn't use up a play.
  const keySource = (M) => ({ label: 'Hear the key', custom: () => MQ.melodyKeyEvents(M, M.tempo) });
  // One melody question: listen, then write it — as the rhythm card, on a staff with pitches.
  function melodyCard(q, cfg, o) {
    const M = q.mel, info = MQ.rhythmMeter(M.meter);
    const reveal = !!o.reveal && !o.keyMode;
    const grader = !!o.locked && !o.plays;
    const wrap = h('div', { class: 'qcard rh-card ml-card' + (o.compact ? ' is-compact' : '') });
    wrap.append(h('div', { class: 'q-eyebrow' }, typeOf(q.type).label, h('span', { class: 'q-clef' }, `${MQ.melodyKeyName(M.key)} · ${info.label} · ${M.measures} measure${M.measures > 1 ? 's' : ''}`)));
    wrap.append(h(o.compact ? 'h3' : 'h2', { class: 'q-text' }, q.text));
    if (!o.locked && !o.keyMode) {
      wrap.append(h('p', { class: 'q-hint' }, M.first
        ? `Listen, then write the melody — pitches and rhythm. It starts on ${MQ.fullName(M.first)}; “Hear the key” plays the tonic chord.`
        : 'Listen, then write the melody — pitches and rhythm. “Hear the key” plays the tonic chord.'));
    }
    wrap.append(melodyFacts(M, info));
    const resp = [M.layers[0].map((_, m) => ((o.response && o.response[0] && o.response[0][m]) || []).map(MQ.rhythmEvent))];
    const limit = MQ.melodySettings(cfg.melody);
    const left = (k) => {
      const lim = o.plays && !o.locked ? (k === 'ex' ? limit.playsEx : limit.playsAns) || 0 : 0;
      return lim ? Math.max(0, lim - (o.plays[k] || 0)) : Infinity;
    };
    const use = (k) => () => { if (o.plays && !o.locked) { o.plays[k] = (o.plays[k] || 0) + 1; if (o.onPlays) o.onPlays(); } };
    let ed = null, key = null;
    const cmp = reveal ? MQ.compareMelody(q, resp) : null;
    const sources = [{ label: 'Play the melody', primary: true, layers: () => M.layers, left: () => left('ex'), use: use('ex') }];
    if (!o.keyMode) sources.push({ label: grader ? 'Play their answer' : 'Hear my answer', layers: () => (ed ? ed.staff.layers() : resp), needsNotes: true, left: () => left('ans'), use: use('ans') });
    sources.push(keySource(M));
    wrap.append(listenPanel({ ex: M, sources, staffs: () => [ed && ed.staff, key].filter(Boolean) }));
    if (!o.keyMode) {
      ed = melodyEditor({ meter: M.meter, measures: M.measures, layers: resp, key: M.key, clef: M.clef }, {
        readOnly: !!o.locked, first: M.first, marks: cmp ? { side: 'got', parts: cmp.parts } : null,
        onChange: (L) => { if (o.onResponse) o.onResponse([L[0].slice(0, M.measures)]); },
      });
      wrap.append(h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, grader ? 'Student’s answer' : o.locked ? 'Your answer' : 'Your answer — write the melody here'), ed.el));
    }
    if (reveal || o.keyMode) {
      const box = h('div', { class: 'rstaff-box mstaff-box' });
      key = new MQ.MelodyStaff(box, { meter: M.meter, measures: M.measures, parts: 1, layers: M.layers, key: M.key, clef: M.clef, slots: MQ.MELODY_MEASURES, readOnly: true, marks: cmp ? { side: 'want', parts: cmp.parts } : null });
      wrap.append(h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, cmp && cmp.wrong ? 'The answer — notes that were missed or wrong are in red' : 'The answer'), box));
    }
    if (o.playsUsed) {
      const t = (k) => `${o.playsUsed[k]} time${o.playsUsed[k] === 1 ? '' : 's'}`;
      wrap.append(h('p', { class: 'fine rh-plays' }, `Played the melody ${t('ex')} and their answer ${t('ans')}.`));
    }
    if (cmp) {
      const lost = MQ.melodyLost(cmp, M.split), right = Math.max(0, cmp.notes - lost);
      const detail = ` (${cmp.pw} pitch, ${cmp.rw} rhythm)`;
      wrap.append(!cmp.wrong ? h('p', { class: 'result is-good', role: 'status' }, h('strong', null, 'Correct.'), ` All ${cmp.notes} notes match, pitch and rhythm.`)
        : h('p', { class: 'result is-bad', role: 'status' }, h('strong', null, `${cmp.wrong} wrong note${cmp.wrong === 1 ? '' : 's'}${detail}`), ` — ${fmtPts(right)} of ${cmp.notes} points. `,
          'Red notes have the wrong pitch or rhythm, or are extra; in the answer, red notes were missed or wrong.'));
    }
    return wrap;
  }

  // ---------- Clefwork Melody: the builder ----------
  function melodyReady() {
    const probs = MQ.melodyProblems(S.cfg.melody);
    if (!probs.length) return true;
    toast(probs[0].text + (probs.length > 1 ? ` (${probs.length - 1} more to fix)` : ''), 'bad');
    S.mlEx = probs[0].ex;
    if (S.view === 'build') go('build');
    return false;
  }
  // Key: major or minor, and its signature.
  function keyPicker(key, onPick) {
    const modeSeg = seg('ml-key-mode', [{ v: 'major', label: 'Major' }, { v: 'minor', label: 'Minor' }], key.mode, (v) => { onPick({ fifths: key.fifths, mode: v }); });
    const names = key.mode === 'minor' ? MQ.MINOR_KEYS : MQ.MAJOR_KEYS;
    const sel = selectEl('ml-key', FIFTHS.map((f) => ({ v: f, label: `${names[f + 7]} ${key.mode} — ${sigLabel(f).toLowerCase()}` })), key.fifths, (v) => onPick({ fifths: +v, mode: key.mode }));
    return h('div', { class: 'ml-key-pick' }, modeSeg, sel);
  }
  function melodySections(cfg, changed, R) {
    const mb = cfg.melody = MQ.melodySettings(cfg.melody);
    // Three ways to fill the quiz: written here, made by Clefwork, or chosen from the library (which
    // are written melodies too, so only the builder knows the difference).
    const src = mb.auto.on ? 1 : mb.src === 2 ? 2 : 0;
    if (src === 0 && !mb.examples.length) mb.examples.push(MQ.newMelody());
    cfg.counts.melody = mb.auto.on ? mb.auto.count : mb.examples.length;
    S.mlEx = Math.max(0, Math.min(mb.examples.length - 1, S.mlEx || 0));
    R.total = h('span', { class: 'mix-total' });
    const mode = seg('ml-mode', [{ v: 0, label: 'Write the melodies myself' }, { v: 1, label: 'Make them automatically' }, { v: 2, label: 'Choose them from the library' }], src, (v) => {
      mb.auto.on = v === 1;
      mb.src = v;
      if (v === 2) mb.examples = mb.examples.filter((ex) => !blankExample(ex));
      cfg.counts.melody = mb.auto.on ? mb.auto.count : mb.examples.length;
      changed();
      go('build');
    });
    const extra = [
      toggle('ml-first', 'Tell students the first note', 'Shown with the key and tempo, and new notes start from it.', mb.first, (v) => { mb.first = v ? 1 : 0; changed(); }),
      grp('Pitch and rhythm', seg('ml-split', [{ v: 0, label: 'A note is right when both are' }, { v: 1, label: 'Half a point each' }], mb.split, (v) => { mb.split = v; changed(); }),
        'Half a point each: a note with the right rhythm and the wrong pitch still earns half its point.'),
    ];
    const later = [scoringSection(mb, changed, R, extra), listeningSection(mb, changed)];
    if (mb.auto.on) {
      return [sec('ml-examples', 'Melodies', 'Clefwork writes the melodies from the level and keys you choose. Everyone with the quiz code gets the same ones.',
        mode, melodyAutoPanel(cfg, changed), h('div', { class: 'mix-foot' }, R.total))].concat(later);
    }
    if (src === 2) {
      mb.pick = mb.pick || {};
      const lib = libraryMode({
        id: 'ml-lib', need: 'melody', max: MQ.MELODY_MEASURES, limit: MQ.MELODY_MAX, list: mb.examples, pick: mb.pick, noun: 'melody', keyMax: true, ties: true, autoFill: true,
        make: (piece, x) => MQ.libraryMelody(piece, x.part, x.from, x.count), preview: melodyPreview,
        changed: () => { cfg.counts.melody = mb.examples.length; changed(); },
      });
      return [sec('ml-examples', 'Melodies', 'Melodies from real music. Everyone with the quiz code gets the same ones.', mode, lib, h('div', { class: 'mix-foot' }, R.total))].concat(later);
    }
    const tabs = h('div', { class: 'rh-tabs', role: 'tablist', 'aria-label': 'Melodies' });
    const body = h('div', { class: 'rh-ex' });
    const edited = () => { cfg.counts.melody = mb.examples.length; changed(); drawTabs(); };
    function drawTabs() {
      tabs.replaceChildren(...mb.examples.map((ex, i) => {
        const ok = !MQ.melodyProblems({ examples: [ex] }).length;
        return h('button', {
          type: 'button', role: 'tab', class: 'rh-tab', 'aria-selected': String(i === S.mlEx), title: ok ? 'Ready' : 'Not finished yet',
          onclick: () => { S.mlEx = i; drawTabs(); drawExample(); },
        }, h('span', null, `Melody ${i + 1}`), h('span', { class: 'rh-tab-state ' + (ok ? 'is-ok' : 'is-open') }, ok ? '✓' : '•'));
      }), mb.examples.length < MQ.MELODY_MAX ? h('button', {
        type: 'button', class: 'rh-tab rh-add', onclick: () => {
          mb.examples.push(MQ.newMelody(mb.examples[S.mlEx]));
          S.mlEx = mb.examples.length - 1;
          edited(); drawExample();
          toast(`Melody ${S.mlEx + 1} added — same key, meter and tempo`);
        },
      }, '+ Add melody') : null,
      mb.examples.length < MQ.MELODY_MAX ? h('button', {
        type: 'button', class: 'rh-tab rh-add', onclick: () => openLibrary({
          need: 'melody', max: MQ.MELODY_MEASURES, ties: true, title: 'A melody from the library',
          onPick: (piece, sel) => {
            mb.examples.push(MQ.libraryMelody(piece, sel.part, sel.from, sel.count));
            S.mlEx = mb.examples.length - 1;
            edited(); drawExample();
            toast(`Melody ${S.mlEx + 1}: measures ${sel.from + 1}–${sel.from + sel.count} of ${piece.title}`);
          },
        }),
      }, '♪ From the library') : null);
    }
    function drawExample() {
      const ex = MQ.melodyExample(mb.examples[S.mlEx]);
      const info = MQ.rhythmMeter(ex.meter);
      const redo = () => { edited(); drawExample(); };
      const meter = meterPicker(ex.meter, (m) => {
        const before = MQ.RHYTHM_TEMPO_UNITS[info.tempo];
        ex.meter = m;
        ex.tempo = Math.max(40, Math.min(240, Math.round((ex.tempo * before) / MQ.RHYTHM_TEMPO_UNITS[MQ.rhythmMeter(m).tempo])));
        redo();
      });
      const groups = MQ.rhythmGroupings(ex.meter);
      const grouping = groups && groups.length > 1 ? grp('Beats', seg('ml-grouping', groups.map((g, i) => ({ v: i, label: g.join(' + ') })), ex.meter.g || 0, (v) => { ex.meter.g = v; redo(); })) : null;
      const tempoIn = h('input', { type: 'number', id: 'ml-tempo', min: 40, max: 240, inputmode: 'numeric' });
      tempoIn.value = ex.tempo;
      tempoIn.addEventListener('change', () => { ex.tempo = Math.max(40, Math.min(240, Math.round(+tempoIn.value || 72))); tempoIn.value = ex.tempo; edited(); });
      const ed = melodyEditor(ex, { first: mb.first ? MQ.melodyFirstNote(ex.layers) : null, onChange: (L) => { ex.layers[0] = L[0]; edited(); } });
      const delBtn = h('button', { type: 'button', class: 'btn btn-quiet sm an-del', disabled: mb.examples.length < 2 || null, onclick: () => {
        if (delBtn.dataset.sure !== '1') {
          delBtn.dataset.sure = '1';
          delBtn.textContent = 'Click again to delete';
          setTimeout(() => { if (delBtn.isConnected) { delBtn.dataset.sure = ''; delBtn.textContent = 'Delete melody'; } }, 3000);
          return;
        }
        mb.examples.splice(S.mlEx, 1);
        toast(`Melody ${S.mlEx + 1} deleted`);
        S.mlEx = Math.min(S.mlEx, mb.examples.length - 1);
        redo();
      } }, 'Delete melody');
      const dupBtn = h('button', { type: 'button', class: 'btn btn-quiet sm', disabled: mb.examples.length >= MQ.MELODY_MAX || null, onclick: () => {
        mb.examples.splice(S.mlEx + 1, 0, JSON.parse(JSON.stringify(ex)));
        S.mlEx += 1;
        redo();
        toast(`Copied to melody ${S.mlEx + 1}`);
      } }, 'Duplicate');
      body.replaceChildren(...[
        h('div', { class: 'rh-ex-head' }, h('h3', null, `Melody ${S.mlEx + 1}`), h('div', { class: 'rh-ex-actions' }, dupBtn, delBtn)),
        h('div', { class: 'row2' },
          grp('Key', keyPicker(ex.key, (k) => { ex.key = k; redo(); }), 'Notes you write take the key signature’s sharps and flats.'),
          grp('Clef', seg('ml-clef', [{ v: 'treble', label: 'Treble' }, { v: 'bass', label: 'Bass' }], ex.clef, (v) => { ex.clef = v; redo(); }))),
        grp('Time signature', meter),
        grouping,
        h('div', { class: 'row2' },
          grp('Measures', seg('ml-measures', [1, 2, 3, 4, 5, 6, 7, 8].map((v) => ({ v, label: String(v) })), ex.measures, (v) => { ex.measures = v; redo(); }), 'One to eight.'),
          grp('Tempo', h('div', { class: 'rh-tempo' }, h('span', { class: 'rh-tempo-sign', 'aria-hidden': 'true' }, TEMPO_SIGNS[info.tempo] + ' ='), tempoIn), `Beats per minute, counting ${MQ.RHYTHM_TEMPO_NAMES[info.tempo]}s.`)),
        h('div', { class: 'rh-block' }, h('span', { class: 'mini-label' }, 'The melody'), ed.el),
        listenPanel({ ex, sources: [{ label: 'Play the melody', primary: true, layers: () => ex.layers }, keySource(ex)], staffs: () => [ed.staff] }),
      ].filter(Boolean));
    }
    drawTabs();
    drawExample();
    return [sec('ml-examples', 'Melodies', 'Write each melody students will hear. Every measure has to be full before the quiz can be shared — rests count.',
      mode, tabs, body, h('div', { class: 'mix-foot' }, R.total))].concat(later);
  }
  // ---------- Clefwork Melody: melodies made automatically ----------
  function melodyAutoPanel(cfg, changed) {
    const a = cfg.melody.auto, c = a.custom;
    const preview = h('div', { class: 'rh-auto-list' });
    const redo = () => { a.gen = MQ.MELODY_GEN; cfg.counts.melody = a.count; changed(); drawPreview(); };
    const count = counter('ml-auto-count', 'melodies', (v) => { a.count = Math.max(1, v); if (v < 1) count.sync(1, 20); redo(); });
    count.sync(a.count, 20);
    const levels = h('div', { class: 'rh-levels', role: 'radiogroup', 'aria-label': 'Level' });
    const custom = h('div', { class: 'rh-custom' });
    const LIST = MQ.MELODY_LEVELS.map((L, i) => ({ id: i + 1, name: `Level ${i + 1} · ${L.name}`, blurb: L.blurb }))
      .concat([{ id: 7, name: 'Custom rules', blurb: 'Choose the rhythm rules, the range and the largest leap yourself.' }]);
    const drawLevels = () => {
      levels.replaceChildren(...LIST.map((L) => h('button', {
        type: 'button', role: 'radio', class: 'rh-level', 'aria-checked': String(a.level === L.id),
        onclick: () => { a.level = L.id; drawLevels(); redo(); },
      }, h('strong', null, L.name), h('span', null, L.blurb))));
      custom.hidden = a.level !== 7;
    };
    custom.append(
      grp('Range', seg('ml-c-range', ['A fifth', 'A sixth', 'An octave', 'A tenth', 'A twelfth'].map((label, v) => ({ v, label })), c.range, (v) => { c.range = v; redo(); }), 'From the lowest note to the highest.'),
      grp('Largest leap', seg('ml-c-leap', ['A third', 'A fourth', 'A fifth', 'A sixth', 'An octave'].map((label, v) => ({ v, label })), c.leap, (v) => { c.leap = v; redo(); })),
      ...customRhythmRules(c, redo));
    drawLevels();
    function drawPreview() {
      const qs = MQ.melodyQuestions(cfg);
      preview.replaceChildren(...qs.map((q) => {
        const M = q.mel, info = MQ.rhythmMeter(M.meter);
        const box = h('div', { class: 'rstaff-box mstaff-box' });
        new MQ.MelodyStaff(box, { meter: M.meter, measures: M.measures, parts: 1, layers: M.layers, key: M.key, clef: M.clef, slots: MQ.MELODY_MEASURES, readOnly: true });
        return h('div', { class: 'rh-auto-item' },
          h('div', { class: 'rh-auto-head' }, h('strong', null, `Melody ${M.n + 1}`),
            h('span', { class: 'help' }, `${MQ.melodyKeyName(M.key)} · ${info.label} · ${tempoLabel(info, M.tempo)}`), rhythmPlayButton(M)),
          box);
      }));
    }
    const fresh = h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => { cfg.seed = MQ.randomSeed(); redo(); toast('New melodies made — share the new code'); } }, '↻ Make new melodies');
    drawPreview();
    return h('div', { class: 'rh-auto' },
      h('div', { class: 'row2' },
        grp('How many melodies', count, 'Up to 20.'),
        grp('Measures in each', seg('ml-auto-measures', [1, 2, 3, 4, 5, 6, 7, 8].map((v) => ({ v, label: String(v) })), a.measures, (v) => { a.measures = v; redo(); }))),
      h('div', { class: 'row2' },
        grp('Keys', seg('ml-keymode', [{ v: 1, label: 'Major' }, { v: 2, label: 'Minor' }, { v: 3, label: 'Both' }], a.keyMode, (v) => { a.keyMode = v; redo(); })),
        grp('Key signatures up to', seg('ml-keymax', [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ v, label: v ? String(v) : 'None' })), a.keyMax, (v) => { a.keyMax = v; redo(); }), 'Sharps or flats.')),
      grp('Clef', seg('ml-clefs', [{ v: 1, label: 'Treble' }, { v: 2, label: 'Bass' }, { v: 3, label: 'Both' }], a.clefs, (v) => { a.clefs = v; redo(); })),
      toggle('ml-chromatic', 'Allow chromatic notes', 'Notes from outside the key: a half step below or above the note they lead to, on weak beats — neighbours from level 1, approaches such as F♯ to G from level 3, flats (in major keys) from level 5. Off: only notes of the key. Minor keys always use their raised sixth and seventh.', a.chromatic, (v) => { a.chromatic = v ? 1 : 0; redo(); }),
      toggle('ml-ties', 'Ties', 'Tie some notes to the next: held over the bar line, or an off-beat note held over the next beat (an anticipation, taking the next note’s pitch) — about one tie every two measures.', a.ties, (v) => { a.ties = v ? 1 : 0; redo(); }),
      grp('Level', levels),
      custom,
      grp('Tempo', tempoInput('ml-auto-tempo', a, redo), 'In other meters the eighth notes keep this speed: ♩ = 72 is ♩. = 48 in 6/8.'),
      h('div', { class: 'rh-auto-top' }, h('span', { class: 'mini-label' }, 'The melodies'), fresh),
      preview);
  }
  function melodyKeyItem(q) {
    const M = q.mel, info = MQ.rhythmMeter(M.meter);
    const box = h('div', { class: 'rstaff-box rh-key-staff mstaff-box' });
    new MQ.MelodyStaff(box, { meter: M.meter, measures: M.measures, parts: 1, layers: M.layers, key: M.key, clef: M.clef, slots: MQ.MELODY_MEASURES, readOnly: true });
    return h('li', null, h('span', { class: 'key-q' }, `Melody ${M.n + 1}`, h('span', { class: 'key-clef' }, ` · ${MQ.melodyKeyName(M.key)} · ${info.label} · ${tempoLabel(info, M.tempo)}`)), box);
  }
  // On paper: an empty staff with the clef, key signature and time signature, two measures to a line.
  // Scale degrees on paper: the melody two measures a line, its notes numbered n1, n2 … above the staff
  // to match the answer blanks.
  function degreePrintArt(q, opts) {
    const D = q.deg, rows = [];
    const per = D.measures > 2 ? 2 : D.measures;
    let j = 0;
    for (let a = 0; a < D.measures; a += per) {
      const n = Math.min(per, D.measures - a);
      const bars = D.layers[0].slice(a, a + n);
      const labels = degreeLabels(D, a, n, () => 'n' + ++j);
      rows.push(MQ.melodyArt({ meter: D.meter, measures: n, layers: [bars], key: D.key, clef: D.clef },
        { first: a, showTime: a === 0, measureW: 300, perLine: n, open: a + n < D.measures, noteLabels: labels, heightIn: (opts && opts.height) || 1.25, drawnClefs: opts && opts.drawnClefs }));
    }
    return rows;
  }
  function melodyPrintArt(q, opts) {
    const M = q.mel, rows = [];
    const per = M.measures > 2 ? 2 : M.measures;
    for (let a = 0; a < M.measures; a += per) {
      const blank = { meter: M.meter, measures: Math.min(per, M.measures - a), layers: [[[], [], [], [], [], [], [], []]], key: M.key, clef: M.clef };
      rows.push(MQ.melodyArt(blank, { first: a, showTime: a === 0, measureW: 300, perLine: per, heightIn: (opts && opts.height) || 1.25, drawnClefs: opts && opts.drawnClefs }));
    }
    return rows;
  }

  // ---------- Clefwork Chord Graph: intro and paper ----------
  // What students read before they start.
  function graphIntro(cfg, qs) {
    const g = MQ.graphSettings(cfg.graph), sc = quizScoring(cfg, qs), parts = [];
    if (qs.some((q) => q.type !== 'cgphrase')) parts.push(`Write chord symbols as you would on paper: B♭ for major, Gmi, Gm or G- for minor, A°, Ao or Adim for diminished${g.sevenths ? '; B♭ma7, Gmi7, F7 and Ami7♭5 (or Aø) for sevenths' : ''}.`);
    if (qs.some((q) => q.type === 'cgphrase')) parts.push('Each phrase shows the rules it’s marked on, and the speaker button plays it.');
    parts.push(!sc ? 'Each table or phrase is one question.' : sc.mode === 'percent' ? `The quiz is out of ${sc.outOf} points — your share of the answers.` : 'Every answer is a point.');
    if (g.quality === 1) parts.push('The right root with the wrong quality earns half.');
    if (g.quality === 2) parts.push('Only the root of each chord is marked.');
    return parts.join(' ');
  }
  // On paper: the table as on the worksheet — printed cells filled in, answer cells empty, "or" where
  // a cell takes two — or a phrase's measures, two lines of them, with the chord graph above.
  const svgText = (x, y, str, size, o) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${(o && o.anchor) || 'middle'}" font-family="Georgia, 'Times New Roman', serif"${o && o.bold ? ' font-weight="bold" class="clabel"' : ''} fill="#000">${MQ.printEscape(str)}</text>`;
  const svgBox = (x, y, w, hgt) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" fill="none" stroke="#000" stroke-width="1.1"/>`;
  const svgLine = (x1, y1, x2, y2, w) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${w || 1.1}"/>`;
  function svgArt(markup, W, H) {
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    return { svg, markup, wIn: W / 96, hIn: H / 96 };
  }
  // Up to two lines of a head label, split between words.
  function headLines(text, max) {
    if (text.length <= max) return [text];
    const words = text.split(' ');
    let a = '';
    while (words.length && (a + ' ' + words[0]).trim().length <= max) a = (a + ' ' + words.shift()).trim();
    return [a, words.join(' ')];
  }
  function graphPrintArt(q) {
    if (q.type === 'cgphrase') return [phrasePrintArt(q)];
    const T = q.cg;
    const HEAD = 124, COL = T.kind === 'tritone' ? 72 : 82, W = HEAD + COL * T.cols + 2;
    // Rows of chords are tall enough to write in; rows of printed numerals are shorter.
    const rowH = (row) => (T.kind === 'tritone' ? 42 : row.play || row.cells.some((c) => c && c.slots) ? 40 : 28);
    let y = 1, out = '';
    const tops = T.rows.map((row) => { const t = y; y += rowH(row); return t; });
    const H = y + 1;
    T.rows.forEach((row, ri) => {
      const top = tops[ri], hgt = rowH(row);
      if (row.head) {
        const span = row.head.span || 1;
        const hh = T.rows.slice(ri, ri + span).reduce((a, r) => a + rowH(r), 0);
        out += svgBox(1, top, HEAD, hh);
        if (!row.head.slots) {
          const lines = headLines(row.head.text, 16), size = row.head.key ? 15 : 12.5;
          const mid = top + hh / 2 + size * 0.36 - (lines.length - 1) * size * 0.55;
          lines.forEach((ln, k) => { out += svgText(1 + HEAD / 2, mid + k * size * 1.1, ln, size, { bold: !!row.head.key }); });
        }
      }
      row.cells.forEach((cell, c) => {
        if (!cell) return;
        const x = 1 + HEAD + c * COL;
        out += svgBox(x, top, COL, hgt);
        if (cell.cap) out += svgText(x + 4, top + 10, cell.cap, 8.5, { anchor: 'start' });
        if (cell.text) out += svgText(x + COL / 2, top + hgt / 2 + 5, cell.text, row.play || T.kind === 'tritone' ? 14 : 12.5, { bold: !row.play && T.kind !== 'tritone' });
        else if (cell.slots.length > 1) out += svgText(x + COL / 2, top + hgt / 2 + 4, 'or', 10);
      });
    });
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" class="cg-art" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out}</svg>`;
    return [svgArt(markup, W, H)];
  }
  function phrasePrintArt(q) {
    const P = q.ph, W = 640;
    let out = '', y = 4;
    if (P.showGraph) {
      // The graph: each column's chord, its stand-ins above and below, arrows between.
      const cols = MQ.GRAPH_VIEW[P.mode], step = W / cols.length;
      cols.forEach((c, i) => {
        const cx = step * i + step / 2;
        if (c[1]) out += svgText(cx, y + 12, c[1], 10.5);
        out += svgText(cx, y + 30, c[0], 14, { bold: true });
        if (c[2]) out += svgText(cx, y + 46, c[2], 10.5);
        if (i) {
          const x1 = cx - step + 22, x2 = cx - 22;
          out += svgLine(x1, y + 25, x2, y + 25, 1) + `<path d="M${x2} ${y + 25}l-6 -3.2v6.4z" fill="#000"/>`;
        }
      });
      y += 60;
    }
    const half = P.bars > 4 ? P.bars / 2 : P.bars, rows = P.symbols ? 2 : 1, lineH = rows === 2 ? 62 : 38;
    const x0 = 8, x1 = W - 8, mw = (x1 - x0) / half;
    for (let a = 0; a < P.bars; a += half) {
      const top = y + 4, bot = top + lineH;
      // Double bars at both ends, single bars between, a writing line under each row.
      out += svgLine(x0, top, x0, bot, 1.1) + svgLine(x0 + 3.5, top, x0 + 3.5, bot, 1.1);
      out += svgLine(x1 - 3.5, top, x1 - 3.5, bot, 1.1) + svgLine(x1, top, x1, bot, 2.2);
      for (let m = 1; m < half; m++) out += svgLine(x0 + m * mw, top, x0 + m * mw, bot, 1.1);
      for (let m = 0; m < half; m++) out += svgText(x0 + m * mw + 10, top + 12, String(a + m + 1), 11, { anchor: 'start' });
      out += svgLine(x0, top + 32, x1, top + 32, 0.7);
      if (rows === 2) out += svgLine(x0, bot - 4, x1, bot - 4, 0.7);
      y = bot + 12;
    }
    if (rows === 2) out += svgText(x0, y + 4, `Top line: Roman numerals · bottom line: chord symbols in ${MQ.graphKeyTitle(P.key)}`, 9.5, { anchor: 'start' });
    const H = y + (rows === 2 ? 10 : 0);
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" class="cg-art" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out}</svg>`;
    return svgArt(markup, W, H);
  }

  // ---------- Clefwork Terms: intro and paper ----------
  // What students read before they start: one answer each, and for the listening questions, sound on.
  function termIntro(cfg) {
    const s = MQ.termSettings(cfg.terms), parts = ['Every question is multiple choice: choose one answer.'];
    if (termHeard(cfg)) {
      const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
      const often = (n) => (n ? times(n) : 'as often as you like');
      const d = listCount(cfg, 'tmhdyn') ? s.hdyn.plays : null, t = listCount(cfg, 'tmhtempo') ? s.htempo.plays : null;
      parts.push('Some questions are heard, so turn your sound on — headphones help — and play Sound check to set your volume before you start.');
      parts.push(d == null || t == null || d === t ? `You can play each melody ${often(d == null ? t : d)}.` : `You can play each dynamics melody ${often(d)}, and each tempo melody ${often(t)}.`);
    }
    return parts.join(' ');
  }
  // On paper: the marking or term asked about, as it's printed in music. Listening questions print
  // their choices, for a teacher who plays the melodies to the class.
  function termPrintArt(q) {
    const sh = q.tm.show;
    if (!sh || !(sh.sign || sh.term)) return [];
    const W = 260, H = 52;
    const body = sh.hairpin
      ? (sh.hairpin > 0 ? svgLine(24, 26, 200, 10, 2) + svgLine(24, 26, 200, 42, 2) : svgLine(24, 10, 200, 26, 2) + svgLine(24, 42, 200, 26, 2))
      : `<text x="24" y="37" font-size="${sh.sign ? 32 : 24}" text-anchor="start" font-family="Georgia, 'Times New Roman', serif" font-weight="bold"${sh.sign ? ' font-style="italic"' : ''} class="clabel" fill="#000">${MQ.printEscape(sh.sign || sh.term + (sh.abbr ? ` (${sh.abbr})` : ''))}</text>`;
    return [svgArt(`<svg xmlns="http://www.w3.org/2000/svg" class="tm-art" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`, W, H)];
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
    if (q.type === 'term') return termPrintArt(q);
    if (MQ.isGraph(q)) return graphPrintArt(q);
    if (q.type === 'melody') return melodyPrintArt(q, opts);
    if (q.type === 'degree') return degreePrintArt(q, opts);
    if (q.type === 'rhythm') return rhythmPrintArt(q, opts);
    if (q.type === 'rgrid') return gridPrintArt(q, opts);
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
    // Where the QR code leads: the quiz, ready to take online.
    qrLink: S.code ? quizLink(S.code) : '',
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
    // The whole quiz travels in the QR code's link, so a long quiz makes a finer code. Phones read
    // printed squares of about 0.4 mm or more most easily.
    const qrNote = h('span');
    const qrHelp = () => {
      let need = 1;
      try { const m = MQ.qrMatrix(printPayload(), { ecc: 'L' }); need = [0.5, 0.75, 1].find((x) => x >= ((m.size + 8) * 0.4) / 25.4) || 1; } catch (e) { /* too long: the largest */ }
      qrNote.textContent = 'In the footer: students scan it to open the quiz online and take it there.'
        + (S.print.qr < need ? ` This quiz’s code is detailed — at ${need === 1 ? '1' : '¾'} in phones read it more easily.` : '');
    };
    qrHelp();
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
        grp('QR code', seg('pr-qr', [{ v: 0.5, label: '½ in' }, { v: 0.75, label: '¾ in' }, { v: 1, label: '1 in' }], S.print.qr, (v) => { S.print.qr = v; qrHelp(); changed(); }), qrNote)),
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
          SITE ? h('a', { href: gradeLink(p.r, p.q), target: '_blank', rel: 'noopener' }, 'open this report in the grade checker') : 'open this report in the grade checker',
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
        h('li', null, h('b', null, '1'), ' Write rhythms, or let Clefwork make them'),
        h('li', null, h('b', null, '2'), ' Students write what they hear on a one-line staff, or show each note’s start and length on a grid'),
        h('li', null, h('b', null, '3'), ' Students send back a report code — no accounts, no server'));
    }
    if (GRAPH) {
      const name = document.querySelector('.brand-name');
      if (name) name.textContent = 'Clefwork Chord Graph';
      document.title = 'Clefwork Chord Graph';
      document.querySelector('.flow').replaceChildren(
        h('li', null, h('b', null, '1'), ' Choose the keys and worksheets: diatonic tables, tritone graphs and phrases'),
        h('li', null, h('b', null, '2'), ' Students write chord symbols and Roman numerals in the tables, and compose phrases'),
        h('li', null, h('b', null, '3'), ' Students send back a report code — no accounts, no server'));
    }
    if (TERMS) {
      const name = document.querySelector('.brand-name');
      if (name) name.textContent = 'Clefwork Terms';
      document.title = 'Clefwork Terms';
      document.querySelector('.flow').replaceChildren(
        h('li', null, h('b', null, '1'), ' Choose the dynamics, tempo markings and instruments to ask about, and what students hear'),
        h('li', null, h('b', null, '2'), ' Students answer multiple-choice questions, some of them by ear'),
        h('li', null, h('b', null, '3'), ' Students send back a report code — no accounts, no server'));
    }
    if (MELODY) {
      const name = document.querySelector('.brand-name');
      if (name) name.textContent = 'Clefwork Melody';
      document.title = 'Clefwork Melody';
      document.querySelector('.flow').replaceChildren(
        h('li', null, h('b', null, '1'), ' Write melodies of one to eight measures, or let Clefwork make them'),
        h('li', null, h('b', null, '2'), ' Students listen and write the pitches and rhythm on the staff'),
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
    document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => { S.linkError = null; go(b.dataset.view); }));
    let view = 'build';
    const hash = decodeURIComponent(location.hash.slice(1));
    const m = hash.match(/^(take|grade)=([\s\S]+)$/);
    if (m && m[1] === 'take') {
      // Anything after the code is named: &img=… carries an Analysis quiz's picture.
      const [codePart, ...more] = m[2].split('&');
      const extra = {};
      more.forEach((kv) => { const i = kv.indexOf('='); if (i > 0) extra[kv.slice(0, i)] = kv.slice(i + 1); });
      const clean = codePart.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      const moreImgs = [2, 3, 4, 5, 6].map((k) => extra['img' + k] || '');
      while (moreImgs.length && !moreImgs[moreImgs.length - 1]) moreImgs.pop();
      if (!(S.take && S.take.code === clean)) openQuiz(codePart, { img: extra.img, more: moreImgs, link: true });
      else if (S.take.cfg.analysis) {
        // The same quiz, already under way: keep the link's pictures in case this device lost them.
        MQ.analysisScores(S.take.cfg.analysis).forEach((sc, k) => {
          const d = k ? moreImgs[k - 1] : extra.img;
          try { if (d && sc.img && MQ.hashOfData(d) === sc.img.hash) keepScore(d, sc.img.hash); } catch (e) { /* a damaged link changes nothing */ }
        });
      }
      view = 'take';
    } else if (m && m[1] === 'grade' && !STUDENT) {
      // #grade=REPORT&q=QUIZ carries the quiz too, so the checker can show questions and answers.
      const one = m[2].match(/^([0-9A-Za-z-]+)&q=([0-9A-Za-z-]+)$/);
      if (one) { S.grade.input = one[1]; S.grade.quiz = one[2]; } else S.grade.input = m[2];
      view = 'grade';
    }
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
