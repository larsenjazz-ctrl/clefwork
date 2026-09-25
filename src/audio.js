/* Clefwork — playback with simple synthesized instruments (Web Audio; nothing to download).
   The piano is a few slightly stretched harmonics through a closing low-pass filter, with a fast
   attack and a decay that is quicker for higher notes. The oboe (Clefwork Rhythm's second part) is
   a reedy, sustained tone with a little vibrato, and the metronome a short click. Rhythms are
   scheduled all at once; each instrument has its own volume. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const PARTIALS = [[1, 1], [2, 0.42], [3, 0.2], [4, 0.1], [5, 0.05], [6, 0.025]];
  // Oboe harmonics: a weak fundamental under strong 2nd to 4th harmonics gives the nasal colour.
  const OBOE = [0, 0.55, 0.9, 1, 0.7, 0.5, 0.42, 0.3, 0.22, 0.16, 0.11, 0.08, 0.05, 0.035];
  let ctx = null, master = null, voices = [], endTimer = null, onEnd = null, timers = [], oboeWave = null;
  const buses = {};
  const VOLUME = { piano: 0.8, oboe: 0.8, click: 0.6 };

  function ensure() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function bus(name) {
    if (!buses[name]) {
      buses[name] = ctx.createGain();
      buses[name].gain.value = VOLUME[name];
      buses[name].connect(master);
    }
    return buses[name];
  }
  // name: 'piano', 'oboe' or 'click'; v from 0 to 1. Takes effect straight away, even mid-phrase.
  function setVolume(name, v) {
    VOLUME[name] = Math.max(0, Math.min(1, v));
    if (buses[name]) buses[name].gain.setTargetAtTime(VOLUME[name], ctx.currentTime, 0.03);
  }
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function note(m, t, dur, vel, dest) {
    const f = freq(m);
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(Math.min(14000, f * 10), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2.5), t + Math.max(0.3, dur));
    const tau = 0.55 * Math.pow(0.5, (m - 60) / 30); // higher notes fade sooner
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(vel, t + 0.006);
    out.gain.setTargetAtTime(vel * 0.25, t + 0.006, tau);
    out.gain.setTargetAtTime(0, t + Math.max(0.03, dur - 0.08), 0.025); // release before the next note
    lp.connect(out);
    out.connect(dest || master);
    PARTIALS.forEach(([n, amp]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * n * (1 + 0.00035 * n * n); // slight piano-string stretch
      g.gain.value = amp;
      o.connect(g); g.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
      voices.push(o);
    });
  }

  function oboe(m, t, dur, vel, dest) {
    if (!oboeWave) {
      const imag = new Float32Array(OBOE);
      oboeWave = ctx.createPeriodicWave(new Float32Array(OBOE.length), imag);
    }
    const f = freq(m);
    const end = t + Math.max(0.06, dur - 0.03);       // a small gap, so repeated notes are heard
    const o = ctx.createOscillator();
    o.setPeriodicWave(oboeWave);
    o.frequency.setValueAtTime(f, t);
    const vib = ctx.createOscillator(), depth = ctx.createGain();
    vib.frequency.value = 5.4;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.005, t + Math.min(0.4, dur));
    vib.connect(depth); depth.connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.03);
    g.gain.setValueAtTime(vel, Math.max(t + 0.03, end - 0.04));
    g.gain.linearRampToValueAtTime(0.0001, end);
    o.connect(lp); lp.connect(g); g.connect(dest || master);
    o.start(t); o.stop(end + 0.05);
    vib.start(t); vib.stop(end + 0.05);
    voices.push(o, vib);
  }

  function click(t, accent, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.6, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + 0.08);
    voices.push(o);
  }

  // chords: array of arrays of MIDI numbers, played one after another, each `dur` seconds long.
  function play(chords, dur, done) {
    stop();
    if (!ensure()) return false;
    const t0 = ctx.currentTime + 0.05;
    chords.forEach((c, i) => {
      const vel = 0.32 / Math.sqrt(Math.max(1, c.length));
      c.forEach((m) => note(m, t0 + i * dur, dur, vel));
    });
    onEnd = done || null;
    endTimer = setTimeout(stop, (chords.length * dur + 0.2) * 1000);
    return true;
  }
  // A rhythm. events: [{at, dur, voice: 'piano' | 'oboe' | 'click', midi, accent}] with times in
  // seconds from the start. opts: total (seconds), marks ([{at, fn}] called as the music reaches
  // them), done (called when it ends or is stopped).
  function sequence(events, opts) {
    stop();
    if (!ensure()) return false;
    const o = opts || {};
    const t0 = ctx.currentTime + 0.12;
    events.forEach((e) => {
      const t = t0 + e.at;
      if (e.voice === 'click') click(t, e.accent, bus('click'));
      else if (e.voice === 'oboe') oboe(e.midi || 65, t, e.dur, 0.2, bus('oboe'));
      else note(e.midi || 72, t, e.dur, 0.3, bus('piano'));
    });
    onEnd = o.done || null;
    const lead = (t0 - ctx.currentTime) * 1000;
    (o.marks || []).forEach((mk) => timers.push(setTimeout(mk.fn, lead + mk.at * 1000)));
    endTimer = setTimeout(stop, lead + ((o.total || 0) + 0.3) * 1000);
    return true;
  }
  function stop() {
    clearTimeout(endTimer);
    timers.forEach(clearTimeout);
    timers = [];
    voices.forEach((o) => { try { o.stop(); } catch (e) { /* already stopped */ } });
    voices = [];
    const cb = onEnd;
    onEnd = null;
    if (cb) cb();
  }

  MQ.Audio = { play, sequence, stop, setVolume, volume: (name) => VOLUME[name] };
})(window);
