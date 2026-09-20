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
    const list = key === 'custom' ? cfg.custom || [] : cfg.voicings || [];
    const n = cfg.counts[key] == null ? list.length : cfg.counts[key];
    return Math.min(n, list.length);
  };
  const sumCounts = (cfg) => MQ.BUILT_IN.reduce((s, t) => s + (cfg.counts[t.id] || 0), 0) + listCount(cfg, 'custom') + listCount(cfg, 'voicing') + listCount(cfg, 'vprog') + listCount(cfg, 'progression');
  const usesGrand = (cfg) => (listCount(cfg, 'voicing') > 0 || listCount(cfg, 'vprog') > 0)
    || (listCount(cfg, 'progression') > 0 && cfg.progs.some((e) => e.staff === 'grand'))
    || ((cfg.counts.chord || 0) > 0 && !!(cfg.chordStaff & 4) && !(cfg.v && cfg.v < 7));
  const clefsText = (cfg) => [cfg.clefs & 1 ? 'treble' : null, cfg.clefs & 2 ? 'bass' : null].filter(Boolean).join(' & ') + ' clef' + (usesGrand(cfg) ? ' + grand staff' : '');
  const clonePlaced = (pl) => (pl ? pl.map((c) => (c || []).map((p) => ({ ...p }))) : null);
  // The student version (practice + take a quiz, no quiz codes shown) is the same app with this flag set.
  const STUDENT = !!window.CLEFWORK_STUDENT;
  // Where this app is published, so links work even from inside the artifact viewer.
  const SITE = (window.CLEFWORK_BASE || '').replace(/[^/]*$/, '');
  const quizLink = (code) => (SITE ? SITE + 'student.html#take=' + MQ.normalize(code) : '');
  const resultsLink = (code) => (SITE ? SITE + 'index.html#grade=' + MQ.normalize(code) : '');
  const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();

  // ---------- state ----------
  function loadDraft() {
    const d = store.get('draft', null);
    const base = MQ.defaultConfig();
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
  };
  const savePrint = () => store.set('print', S.print);
  // S.take is whichever quiz the current tab works with: a teacher's quiz, or (student version) a practice run.
  Object.defineProperty(S, 'take', { get: () => S.slots[S.slot], set: (v) => { S.slots[S.slot] = v; } });
  const tv = () => (S.slot === 'practice' ? 'practice' : 'take');
  const saveDraft = () => store.set('draft', S.cfg);
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
    if (frac > 0 && q.type === 'figprog') {
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

  function questionCard(q, cfg, o) {
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
      h('div', { class: 'presets' }, h('span', { class: 'mini-label' }, STUDENT ? 'Presets' : 'Or start from a preset'),
        h('div', { class: 'preset-row' }, MQ.PRESETS.map((p) => h('button', { type: 'button', class: 'btn btn-quiet sm', onclick: () => {
          const keep = { custom: cfg.counts.custom, voicing: cfg.counts.voicing, progression: cfg.counts.progression };
          S.cfg = p.apply(S.cfg); Object.assign(S.cfg.counts, keep);
          S.cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvShow = false; S.pvResp = null;
          saveDraft(); go('build'); toast(`Loaded the “${p.label}” preset`);
        } }, p.label))))));

    form.append(sec('staff', 'Staff & notes', 'Applies to every question type.',
      h('div', { class: 'row2' },
        grp('Clefs', chips('q-clefs', [{ label: 'Treble' }, { label: 'Bass' }, { label: 'Grand staff' }], cfg.clefs, (m) => { cfg.clefs = m; changed(); }, (x) => x.label), 'Each tab can override this.'),
        grp('Ledger lines', seg('q-ledger', [0, 1, 2, 3].map((v) => ({ v, label: v === 0 ? 'None' : v === 1 ? '1' : String(v) })), cfg.ledger, (v) => { cfg.ledger = v; changed(); }), 'Maximum above or below the staff.')),
      grp('Starting notes', seg('q-acc', [{ v: 0, label: 'Naturals only' }, { v: 1, label: '+ Sharps' }, { v: 2, label: '+ Flats' }, { v: 3, label: 'Sharps & flats' }], cfg.accMode, (v) => { cfg.accMode = v; changed(); }),
        'Applies to printed and named notes. Answers can still need accidentals — a major 3rd above D is F♯.')));

    // ---------- question types: one tab each, with a counter for how many to ask ----------
    R.total = h('span', { class: 'mix-total' });
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
    form.append(sec('types', 'Question types', 'Choose a type to change its settings. The counter on each tab sets how many of those questions the quiz asks.',
      h('div', { class: 'types-top' }, clearBtn),
      strip, panels, h('div', { class: 'mix-foot' }, R.total)));

    const timeIn = h('input', { type: 'number', id: 'q-time', min: 0, max: 120, inputmode: 'numeric' });
    timeIn.value = cfg.timeLimit;
    timeIn.addEventListener('change', () => { const v = Math.max(0, Math.min(120, Math.round(+timeIn.value || 0))); timeIn.value = v; cfg.timeLimit = v; changed(); });
    const flag = (k, label, desc) => toggle('f-' + k, label, desc, cfg.flags[k], (v) => { cfg.flags[k] = v; changed(); });
    form.append(sec('rules', 'Quiz rules', null,
      h('div', { class: 'row2' }, fld('Time limit in minutes', timeIn, '0 means no limit. The quiz submits itself when time runs out.')),
      h('div', { class: 'toggles' },
        flag('shuffle', 'Shuffle question order', 'Mixes the question types together instead of grouping them.'),
        flag('partial', 'Partial credit', 'Chords and scales earn credit for each correct note.'),
        STUDENT ? null : flag('feedback', 'Let students check answers', 'Students can check each question and see the right answer. Best for practice.'),
        flag('labels', 'Show note names while dragging', STUDENT ? 'The note’s name appears as you move it.' : 'Practice mode: the note’s name appears as students move it.'),
        flag('enharmonic', 'Accept enharmonic spellings', 'Counts G♭ as correct when the answer is F♯.'),
        flag('noHelpers', 'Hide starting and helper notes', 'Students write every note themselves: both notes of an interval, every note of a scale, and a chord’s bass note.'))));

    // Side: share + preview + answer key
    R.summary = h('p', { class: 'share-summary' });
    R.code = h('output', { class: 'code', id: 'quiz-code', 'aria-label': 'Quiz code' });
    R.copy = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { rememberQuiz(S.code, cfg); copyText(S.code, 'Quiz code'); } }, 'Copy quiz code');
    R.link = SITE || !inFrame ? h('button', { type: 'button', class: 'btn', onclick: () => {
      rememberQuiz(S.code, cfg);
      copyText(quizLink(S.code) || location.href.split('#')[0] + '#take=' + MQ.normalize(S.code), 'Quiz link');
    } }, 'Copy quiz link') : null;
    R.tryBtn = h('button', { type: 'button', class: 'btn', onclick: () => {
      rememberQuiz(S.code, cfg);
      if (openQuiz(S.code, { preview: true })) { S.take.name = 'Teacher preview'; go('take'); }
    } }, 'Try it as a student');
    R.exportBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => openExport(cfg) }, 'Export to spreadsheet');
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
    } else side.append(h('section', { class: 'card share' },
      h('div', { class: 'eyebrow' }, 'Share with students'),
      R.summary, R.code,
      h('div', { class: 'btn-row' }, R.copy, R.link, R.tryBtn, R.exportBtn),
      h('p', { class: 'fine' }, SITE
        ? ['The quiz link opens the quiz straight away. The code holds every setting, so nothing is stored online, and everyone with the same code gets the same questions.']
        : ['The code holds every setting, so nothing is stored online. Students paste it on the ', h('b', null, 'Take a quiz'), ' tab, and everyone with the same code gets the same questions.']),
      h('button', { type: 'button', class: 'btn-link', onclick: () => { cfg.seed = MQ.randomSeed(); S.pvIdx = 0; S.pvResp = null; changed(); toast('New questions generated — share the new code'); } }, 'Make a new set of questions with these settings')));

    R.keyList = h('ol', { class: 'key-list' });
    if (!STUDENT) side.append(h('details', { class: 'card key' }, h('summary', null, 'Answer key'), R.keyList));

    R.pvCount = h('span', { class: 'pv-count' });
    R.pvHost = h('div', { class: 'pv-host' });
    R.prev = h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Previous question', onclick: () => { S.pvIdx--; S.pvResp = null; renderPreview(); } }, '‹ Prev');
    R.next = h('button', { type: 'button', class: 'btn btn-quiet sm', 'aria-label': 'Next question', onclick: () => { S.pvIdx++; S.pvResp = null; renderPreview(); } }, 'Next ›');
    R.show = toggle('pv-show', 'Show answer', null, S.pvShow, (v) => { S.pvShow = v; renderPreview(); });
    side.append(h('section', { class: 'card preview' },
      h('div', { class: 'card-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Preview'), R.pvCount), h('div', { class: 'pager' }, R.prev, R.next)),
      R.pvHost, STUDENT ? null : h('div', { class: 'pv-foot' }, R.show)));

    function renderPreview() {
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
      R.total.textContent = `${total} question${total === 1 ? '' : 's'} in the quiz`;
      if (!total) {
        S.code = ''; S.qs = [];
        if (R.code) R.code.textContent = '—';
        R.summary.textContent = STUDENT ? 'Add at least one question to start.' : 'Add at least one question to get a code.';
        [R.copy, R.link, R.tryBtn, R.exportBtn, R.startBtn].forEach((b) => b && (b.disabled = true));
      } else {
        S.code = MQ.encodeQuiz(cfg);
        S.qs = MQ.generateQuiz(cfg);
        if (R.code) R.code.textContent = S.code;
        [R.copy, R.link, R.tryBtn, R.exportBtn, R.startBtn].forEach((b) => b && (b.disabled = false));
        const est = Math.max(1, Math.round((MQ.BUILT_IN.reduce((s, t) => s + t.est * (cfg.counts[t.id] || 0), 0) + 40 * listCount(cfg, 'custom') + 55 * listCount(cfg, 'voicing') + 90 * listCount(cfg, 'vprog') + 70 * listCount(cfg, 'progression')) / 60));
        R.summary.replaceChildren(h('b', null, STUDENT ? 'Your practice' : cfg.title || 'Untitled quiz'), ` — ${total} questions · ${clefsText(cfg)} · about ${est} min${cfg.timeLimit ? ` · ${cfg.timeLimit}-minute limit` : ''}`);
      }
      R.keyList.replaceChildren(...S.qs.map((q) => h('li', null, h('span', { class: 'key-q' }, q.text, h('span', { class: 'key-clef' }, ' · ' + MQ.clefLabel(q.clef))), h('span', { class: 'key-a' }, MQ.describeAnswer(q, cfg)))));
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
      const qs = MQ.generateQuiz(cfg);
      S.take = {
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
    if (listCount(cfg, 'progression')) types.push(`Chord progressions (${listCount(cfg, 'progression')})`);
    main.append(h('div', { class: 'narrow' }, h('section', { class: 'card stage' },
      h('div', { class: 'eyebrow' }, t.preview ? 'Preview — this is what students see' : 'Quiz'),
      h('h1', { class: 'display' }, cfg.title || 'Music quiz'),
      cfg.teacher ? h('p', { class: 'lede' }, 'From ' + cfg.teacher) : null,
      h('dl', { class: 'facts' },
        h('div', null, h('dt', null, 'Questions'), h('dd', null, String(t.qs.length))),
        h('div', null, h('dt', null, 'Time limit'), h('dd', null, cfg.timeLimit ? cfg.timeLimit + ' min' : 'None')),
        h('div', null, h('dt', null, 'Clefs'), h('dd', null, [cfg.clefs & 1 ? 'Treble' : null, cfg.clefs & 2 ? 'Bass' : null, usesGrand(cfg) ? 'Grand staff' : null].filter(Boolean).join(', ')))),
      h('p', { class: 'types-line' }, types.join(' · ')),
      fld('Your name', name),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: start }, 'Start quiz'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { S.take = null; saveAttempt(); go(tv()); } }, 'Use a different code')),
      h('p', { class: 'fine' }, 'Your answers stay on this device. When you finish, you’ll get a report code to send your teacher.'))));
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
    const t = S.take, i = t.idx, q = t.qs[i];
    const locked = t.checked[i];
    const card = questionCard(q, t.cfg, {
      response: t.resp[i], locked, reveal: locked,
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
          : t.practice ? 'You can still go back and change anything before you see your results.' : 'You can still go back and change anything. Once you submit, you’ll get your report code.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: submitQuiz }, t.practice ? 'See my results' : 'Submit quiz'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { t.reviewing = false; saveAttempt(); go(tv()); } }, 'Keep working')))));
    startTicker();
  }
  function submitQuiz() {
    const t = S.take;
    if (!t || t.done) return;
    stopTicker();
    const partial = t.cfg.flags.partial;
    const items = t.qs.map((q, i) => {
      const frac = MQ.gradeQuestion(q, t.resp[i], t.cfg);
      const credit = frac === 1 ? 7 : partial ? Math.min(6, Math.round(frac * 7)) : 0;
      return { type: q.type, clef: q.clef, credit, answered: MQ.hasAnswer(q, t.resp[i]), sec: t.secs[i] };
    });
    t.report = { name: t.name, submittedAt: Date.now(), totalSec: t.secs.reduce((a, b) => a + b, 0), partial, items };
    // The report code also carries what the student entered, so the teacher can see it on the staff.
    if (!t.practice) t.reportCode = MQ.encodeReport(Object.assign({}, t.report, { answers: { qs: t.qs, resp: t.resp } }), t.cfg, t.code);
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
          h('div', { class: 'score-meta' }, h('strong', null, Math.round(st.pct) + '%'), h('span', null, `${st.full} fully correct · ${fmtDur(rep.totalSec)}`))),
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
    main.append(h('div', { class: 'take done' },
      h('section', { class: 'card stage done-hero' },
        h('div', { class: 'eyebrow' }, t.preview ? 'Preview finished' : 'Submitted'),
        h('div', { class: 'score-line' },
          h('div', { class: 'score-big' }, fmtPts(st.points), h('span', null, '/' + st.n)),
          h('div', { class: 'score-meta' }, h('strong', null, Math.round(st.pct) + '%'), h('span', null, `${st.full} fully correct · ${fmtDur(rep.totalSec)}`))),
        h('h2', { class: 'report-h' }, `Send this report code to ${teacher}`),
        h('output', { class: 'code code-lg', id: 'report-code' }, t.reportCode),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => copyText(t.reportCode, 'Report code') }, 'Copy report code'),
          SITE ? h('button', { type: 'button', class: 'btn', onclick: () => copyText(resultsLink(t.reportCode), 'Results link') }, 'Copy results link') : null,
          h('a', { class: 'btn', href: mail, target: '_blank', rel: 'noopener' }, 'Email it')),
        h('p', { class: 'fine' }, SITE
          ? 'Send the code, or the results link, which opens it straight in your teacher’s grade checker. Nothing was uploaded — reopen this tab on the same device if you lose it.'
          : 'The code contains your name, score and results. Nothing was uploaded — if you lose this code, you can reopen this tab on the same device to see it again.')),
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'How you did'), typeBars(st), questionTable(rep, review ? t : null)),
      h('div', { class: 'btn-row center' }, h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { S.take = null; saveAttempt(); go(tv()); } }, 'Take another quiz'))));
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
    const rows = MQ.TYPES.filter((t) => st.byType[t.id]).map((t) => bar(t.label, st.byType[t.id].points, st.byType[t.id].n, `${Math.round(st.byType[t.id].sec / st.byType[t.id].n)} s avg`));
    const clefs = ['treble', 'bass', 'grand'].filter((c) => st.byClef[c]).map((c) => bar(MQ.clefLabel(c), st.byClef[c].points, st.byClef[c].n));
    return h('div', { class: 'bars' }, h('div', { class: 'bars-group' }, h('h4', null, 'By question type'), rows),
      clefs.length > 1 ? h('div', { class: 'bars-group' }, h('h4', null, 'By clef'), clefs) : null);
  }
  function resultCell(it) {
    if (it.credit === 7) return h('span', { class: 'res is-good' }, '✓ Correct');
    if (!it.answered) return h('span', { class: 'res is-blank' }, '— Blank');
    if (it.credit > 0) return h('span', { class: 'res is-part' }, `◐ ${Math.round((it.credit / 7) * 100)}%`);
    return h('span', { class: 'res is-bad' }, '✗ Wrong');
  }
  // `quiz` (optional) supplies question text and answers: {qs, cfg} or a take record.
  function questionTable(rep, quiz) {
    const tbody = h('tbody');
    rep.items.forEach((it, i) => {
      const q = quiz && quiz.qs[i];
      tbody.append(h('tr', null,
        h('td', { class: 'num' }, String(i + 1)),
        h('td', null, q ? q.text : typeOf(it.type).label),
        h('td', null, MQ.CLEFS[it.clef].label),
        quiz ? h('td', { class: 'ans' }, q ? MQ.describeAnswer(q, quiz.cfg) : '') : null,
        h('td', null, resultCell(it)),
        h('td', { class: 'num' }, it.sec >= 63 ? '63+ s' : it.sec + ' s')));
    });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'qtable' },
      h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Question'), h('th', null, 'Clef'), quiz ? h('th', null, 'Answer') : null, h('th', null, 'Result'), h('th', { class: 'num' }, 'Time'))),
      tbody));
  }

  // ---------- grading ----------
  function knownQuizzes() {
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
    if (S.code) add(S.code, 'builder');
    store.get('recent', []).forEach((r) => add(r.code, 'recent'));
    return out;
  }
  function renderGrade(main) {
    const g = S.grade;
    const ta = h('textarea', { id: 'grade-codes', rows: 4, spellcheck: 'false', autocomplete: 'off', placeholder: 'Paste one report code per line' });
    ta.value = g.input;
    const qz = h('input', { type: 'text', id: 'grade-quiz', spellcheck: 'false', autocomplete: 'off', placeholder: 'Optional — the quiz code you shared' });
    qz.value = g.quiz;
    const results = h('div', { class: 'grade-results', 'aria-live': 'polite' });
    const run = () => { g.input = ta.value; g.quiz = qz.value; g.sel = 0; runGrade(results); };
    main.append(h('div', { class: 'grade' },
      h('section', { class: 'card grade-input' },
        h('div', { class: 'eyebrow' }, 'For teachers'),
        h('h1', { class: 'display' }, 'Grade reports'),
        h('p', { class: 'lede' }, 'Paste the report codes students send you. Paste several at once, one per line, for a class summary.'),
        fld('Report codes', ta),
        fld('Quiz code', qz, 'Quizzes you built or copied on this device are matched automatically. Adding the code shows each question and its answer.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: run }, 'Show results'),
          h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { ta.value = exampleReports().join('\n'); run(); } }, 'Load example reports')),
        h('details', { class: 'fine-details' }, h('summary', null, 'How can I trust a report code?'),
          h('p', null, 'Each code has a checksum, so a typo or missing piece is caught. It also carries a seal tied to the quiz it came from — when the quiz is known here, the seal is checked and edited codes show a warning. The seal discourages tampering, but it isn’t unbreakable: a determined student with the quiz code could forge one. Treat it like a signed paper, not a lock.'))),
      results));
    if (g.input.trim()) runGrade(results);
  }
  function runGrade(host) {
    const g = S.grade;
    const lines = g.input.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const errors = [], reports = [];
    lines.forEach((ln, i) => {
      try { reports.push(MQ.decodeReport(ln)); } catch (e) { errors.push(h('li', null, h('b', null, `Line ${i + 1}: `), e.message)); }
    });
    if (g.quiz.trim()) { try { MQ.decodeQuiz(g.quiz); } catch (e) { errors.push(h('li', null, h('b', null, 'Quiz code: '), e.message)); } }
    const quizzes = knownQuizzes();
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
      r.sealOk === true ? chip('good', '✓ Seal verified') : r.sealOk === false ? chip('bad', '⚠ Seal doesn’t match — this code may have been edited') : null);
  }
  function reportDetail(r) {
    const st = r.stats;
    const title = r.quiz ? r.quiz.cfg.title : `Quiz #${r.quizId.toString(16).toUpperCase().padStart(4, '0')}`;
    return h('section', { class: 'card report' },
      h('div', { class: 'report-top' },
        h('div', null,
          h('div', { class: 'eyebrow' }, 'Student report'),
          h('h2', { class: 'display student' }, r.name || 'Unnamed student'),
          h('p', { class: 'meta' }, `${title} · submitted ${fmtDate(r.submittedAt)} · ${fmtDur(r.totalSec)}`),
          verifyChips(r)),
        h('div', { class: 'score-block' },
          h('div', { class: 'score-big' }, fmtPts(st.points), h('span', null, '/' + st.n)),
          h('div', { class: 'score-pct' }, Math.round(st.pct) + '%'))),
      h('dl', { class: 'facts' },
        h('div', null, h('dt', null, 'Fully correct'), h('dd', null, `${st.full} of ${st.n}`)),
        h('div', null, h('dt', null, 'Answered'), h('dd', null, `${st.answered} of ${st.n}`)),
        h('div', null, h('dt', null, 'Avg per question'), h('dd', null, Math.round(st.avgSec) + ' s')),
        h('div', null, h('dt', null, 'Longest'), h('dd', null, st.slowest >= 0 ? `Q${st.slowest + 1} · ${r.items[st.slowest].sec >= 63 ? '63+' : r.items[st.slowest].sec} s` : '—'))),
      typeBars(st),
      questionTable(r, r.quiz),
      answersSection(r));
  }
  // The student's answers, question by question, on the staff — right and wrong notes marked,
  // with the correct answer. Needs the quiz (its code on this device or pasted above).
  function answersSection(r) {
    if (!r.answers) return h('p', { class: 'fine' }, 'This report was made before answers were included in report codes, so only scores are available.');
    if (!r.quiz) return h('p', { class: 'fine' }, 'This report includes the student’s answers. Add the quiz code above to see them on the staff.');
    const box = h('div', { class: 'ans-list' });
    const btn = h('button', { type: 'button', class: 'btn', 'aria-expanded': 'false' }, 'See answers on the staff');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide answers' : 'See answers on the staff';
      if (!open) { box.replaceChildren(); return; }
      const cfg = r.quiz.cfg, qs = r.quiz.qs;
      const jump = h('nav', { class: 'ans-jump', 'aria-label': 'Jump to a question' });
      const cards = r.items.map((it, i) => {
        const q = qs[i];
        if (!q) return null;
        const tone = it.credit === 7 ? 'is-right' : !it.answered ? 'is-blank' : it.credit > 0 ? 'is-part' : 'is-wrong';
        const id = `ans-${r.quizId}-${i}`;
        jump.append(h('a', { href: '#' + id, class: 'qdot ' + tone, onclick: (e) => { e.preventDefault(); document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, String(i + 1)));
        return h('section', { class: 'ans-card', id },
          h('div', { class: 'ans-head' }, h('strong', null, `Question ${i + 1}`), resultCell(it), h('span', { class: 'ans-time' }, it.sec >= 63 ? '63+ s' : it.sec + ' s')),
          it.answered || q.type === 'progression' || !q.choices
            ? questionCard(q, cfg, { response: MQ.answerFor(q, r.answers[i]), locked: true, reveal: true })
            : h('div', null, h('p', { class: 'q-text' }, q.text), h('p', { class: 'result is-bad' }, h('strong', null, 'Left blank.'), ' The answer is ', h('b', null, MQ.describeAnswer(q, cfg)), '.')));
      }).filter(Boolean);
      box.replaceChildren(jump, ...cards);
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
        h('td', null, h('button', { type: 'button', class: 'linkish', onclick: () => { S.grade.sel = i; runGrade(host); } }, r.name || 'Unnamed')),
        h('td', { class: 'num' }, `${fmtPts(r.stats.points)}/${r.stats.n}`),
        h('td', { class: 'num' }, Math.round(r.stats.pct) + '%'),
        h('td', { class: 'num' }, fmtDur(r.totalSec)),
        h('td', null, fmtDate(r.submittedAt)),
        h('td', null, r.sealOk === true ? h('span', { class: 'res is-good' }, '✓ Verified') : r.sealOk === false ? h('span', { class: 'res is-bad' }, '⚠ Check') : h('span', { class: 'res is-blank' }, 'Quiz unknown'))));
    });
    const csv = () => {
      const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
      const rows = [['Student', 'Points', 'Questions', 'Percent', 'Minutes', 'Submitted', 'Quiz', 'Seal']].concat(reports.map((r) => [
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
        return { type: q.type, clef: q.clef, credit, answered: r < 0.97, sec: Math.round(8 + rng() * (q.type === 'scale' ? 55 : 25)) };
      });
      return MQ.encodeReport({ name, submittedAt: Date.now() - (k + 1) * 3600e3, totalSec: items.reduce((s, it) => s + it.sec, 0), partial: cfg.flags.partial, items }, cfg, code);
    });
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
    const inch = (q.grand ? 1.45 : 1) * (o.height || 1.25);
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
      return MQ.printHTML(model, printInfo(), opts, (q) => exportStaffSVG(q, { height: S.print.staffH }).markup);
    };
    const fileStem = () => (S.cfg.title || 'quiz').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'quiz';
    const draw = () => {
      if (!qs.length) { preview.replaceChildren(h('p', { class: 'empty' }, 'Add some questions on the Build a quiz tab first.')); return; }
      const html = buildSheet();
      preview.replaceChildren(h('div', { class: 'print-head' },
        h('span', { class: 'mini-label' }, 'Preview'),
        h('span', { class: 'help' }, `${qs.length} question${qs.length === 1 ? '' : 's'} · ${MQ.paperOf(S.print.paper).label}`)), frame);
      const doc = frame.contentDocument;
      doc.open(); doc.write(html); doc.close();
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
        model.forEach((it) => { if (it.staff) art.set(it.q, exportStaffSVG(it.q, { height: S.print.staffH, drawnClefs: true })); });
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
          const art = exportStaffSVG(it.q, { height: S.print.staffH, drawnClefs: true });
          const bytes = await svgToPNG(art.markup, art.wIn, art.hIn, 200);
          byQuestion.push({ bytes, wIn: art.wIn, hIn: art.hIn });
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
  }

  // ---------- shell ----------
  const VIEWS = { build: renderBuild, take: renderTake, grade: renderGrade, print: renderPrint, practice: (main) => (S.slots.practice ? renderTake(main) : renderBuild(main)) };
  function go(view) {
    if (STUDENT && (view === 'grade' || view === 'print')) view = 'build';
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
    // The builder always computes the current quiz code so other tabs can use it.
    S.code = sumCounts(S.cfg) ? MQ.encodeQuiz(S.cfg) : '';
    restoreAttempt();
    if (STUDENT) {
      // Student version: Practice + Take a quiz; no grading tab and no quiz codes to share.
      const nav = document.querySelector('.nav');
      nav.querySelector('[data-view="build"]').textContent = 'Practice';
      nav.querySelector('[data-view="grade"]').remove();
      nav.querySelector('[data-view="print"]').remove();
      document.querySelector('.flow').replaceChildren(
        h('li', null, h('b', null, '1'), ' Choose what to practise and check your answers as you go'),
        h('li', null, h('b', null, '2'), ' For a quiz from your teacher, open ', h('strong', null, 'Take a quiz'), ' and paste the code'),
        h('li', null, h('b', null, '3'), ' When you finish a teacher’s quiz, send back your report code'));
    }
    document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    let view = 'build';
    const hash = decodeURIComponent(location.hash.slice(1));
    const m = hash.match(/^(take|grade)=(.+)$/);
    if (m && m[1] === 'take') {
      const clean = m[2].replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      if (!(S.take && S.take.code === clean)) openQuiz(m[2]);
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
