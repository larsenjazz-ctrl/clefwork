/* Clefwork — chord playback with a simple synthesized piano (Web Audio; nothing to download).
   Each note is a few slightly stretched harmonics through a closing low-pass filter, with a fast
   attack and a decay that is quicker for higher notes. */
(function (root) {
  'use strict';
  const MQ = root.MQ;
  const PARTIALS = [[1, 1], [2, 0.42], [3, 0.2], [4, 0.1], [5, 0.05], [6, 0.025]];
  let ctx = null, master = null, voices = [], endTimer = null, onEnd = null;

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

  function note(m, t, dur, vel) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
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
    out.gain.setTargetAtTime(0, t + dur - 0.08, 0.025); // release before the next chord
    lp.connect(out);
    out.connect(master);
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
  function stop() {
    clearTimeout(endTimer);
    voices.forEach((o) => { try { o.stop(); } catch (e) { /* already stopped */ } });
    voices = [];
    const cb = onEnd;
    onEnd = null;
    if (cb) cb();
  }

  MQ.Audio = { play, stop };
})(window);
