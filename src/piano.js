/* Clefwork Keys — an on-screen piano. Keys are drawn in grey on white (so they print and export
   as they are), and the page's stylesheet colours them on screen. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const NS = 'http://www.w3.org/2000/svg';
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const isWhite = (m) => WHITE.includes(((m % 12) + 12) % 12);
  const WW = 24, WH = 116, BW = 14, BH = 72;

  // Where each key sits: white keys side by side, black keys over the gaps.
  function layout(lo, hi) {
    const keys = [];
    let x = 0;
    for (let m = lo; m <= hi; m++) {
      if (isWhite(m)) { keys.push({ m, white: true, x, w: WW, h: WH }); x += WW; }
    }
    const width = x;
    for (let m = lo; m <= hi; m++) {
      if (isWhite(m)) continue;
      const left = keys.find((k) => k.white && k.m === m - 1);
      if (!left) continue;
      keys.push({ m, white: false, x: left.x + WW - BW / 2, w: BW, h: BH });
    }
    return { keys, width, height: WH };
  }

  // Markup for a keyboard. state: {highlight, selected, right, wrong, expected, cursor} (MIDI numbers).
  function pianoMarkup(lo, hi, state) {
    const st = state || {};
    const { keys, width, height } = layout(lo, hi);
    const pad = 2;
    let s = `<svg xmlns="${NS}" class="piano" viewBox="${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}" width="${width + pad * 2}" height="${height + pad * 2}">`;
    const draw = (k) => {
      const cls = ['pk', k.white ? 'pk-white' : 'pk-black'];
      let fill = k.white ? '#ffffff' : '#1a1a1a';
      if (st.expected === k.m) { cls.push('is-expected'); fill = k.white ? '#d9d9d9' : '#555555'; }
      if (st.highlight === k.m) { cls.push('is-hl'); fill = k.white ? '#bdbdbd' : '#7a7a7a'; }
      if (st.selected === k.m) { cls.push('is-sel'); fill = k.white ? '#bdbdbd' : '#7a7a7a'; }
      if (st.right === k.m) cls.push('is-right');
      if (st.wrong === k.m) cls.push('is-wrong');
      if (st.cursor === k.m) cls.push('is-cursor');
      s += `<rect class="${cls.join(' ')}" data-midi="${k.m}" x="${k.x}" y="0" width="${k.w}" height="${k.h}" rx="${k.white ? 3 : 2}" fill="${fill}" stroke="#222222" stroke-width="1"/>`;
    };
    keys.filter((k) => k.white).forEach(draw);
    keys.filter((k) => !k.white).forEach(draw);
    // Middle C is marked with a dot, the one landmark students are told about.
    const c4 = keys.find((k) => k.m === 60);
    if (c4) s += `<circle class="pk-middle" cx="${c4.x + WW / 2}" cy="${WH - 12}" r="3.2" fill="#222222"/>`;
    return s + '</svg>';
  }

  class Piano {
    // opts: {lo, hi, highlight, selected, right, wrong, expected, readOnly, onPress(m)}
    constructor(host, opts) {
      this.o = Object.assign({ readOnly: false, sound: true }, opts);
      this.host = host;
      this.cursor = null;
      this.wrap = document.createElement('div');
      this.wrap.className = 'piano-wrap' + (this.o.readOnly ? ' is-readonly' : '');
      this.wrap.tabIndex = 0;
      this.wrap.setAttribute('role', 'group');
      this.wrap.setAttribute('aria-label', this.o.readOnly ? 'Piano keyboard' : 'Piano keyboard. Use the arrow keys to move and Enter to play a key.');
      host.append(this.wrap);
      this.render();
      this.wrap.addEventListener('pointerdown', (e) => {
        const key = e.target.closest && e.target.closest('rect[data-midi]');
        if (!key) return;
        e.preventDefault();
        this.press(+key.getAttribute('data-midi'));
      });
      this.wrap.addEventListener('keydown', (e) => {
        const lo = this.o.lo, hi = this.o.hi;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const from = this.cursor != null ? this.cursor : this.o.selected != null ? this.o.selected : 60;
          this.cursor = Math.max(lo, Math.min(hi, from + (e.key === 'ArrowRight' ? 1 : -1)));
          this.render();
          e.preventDefault();
        } else if ((e.key === 'Enter' || e.key === ' ') && this.cursor != null) {
          this.press(this.cursor);
          e.preventDefault();
        }
      });
    }
    press(m) {
      if (this.o.sound && MQ.Audio) MQ.Audio.play([[m]], 1.2);
      if (this.o.readOnly) return;               // a shown key can still be heard
      this.o.selected = m;
      this.render();
      if (this.o.onPress) this.o.onPress(m);
    }
    set(state) { Object.assign(this.o, state); this.render(); }
    render() {
      const o = this.o;
      this.wrap.innerHTML = pianoMarkup(o.lo, o.hi, {
        highlight: o.highlight, selected: o.selected, right: o.right, wrong: o.wrong, expected: o.expected, cursor: this.cursor,
      });
    }
  }

  Object.assign(MQ, { Piano, pianoMarkup, pianoLayout: layout, isWhiteKey: isWhite });
})(typeof window !== 'undefined' ? window : globalThis);
