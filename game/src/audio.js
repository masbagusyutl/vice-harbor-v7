// Vice Harbor v7 — tiny WebAudio synth: engine, siren, blips, shots. No audio files.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return false; }
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(ctx.destination);
    engineOsc.start();
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(ctx.destination);
    sirenOsc.start();
    return true;
  }

  function blip(freq, dur = 0.12, type = 'sine', vol = 0.15) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setEngine(speed, on) {
      if (!ctx || muted) return;
      engineGain.gain.value = on ? 0.03 + Math.min(0.06, Math.abs(speed) * 0.002) : 0;
      engineOsc.frequency.value = 55 + Math.abs(speed) * 3.2;
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.value = on && !muted ? 0.035 : 0;
      if (on) sirenOsc.frequency.value = 700 + Math.sin(performance.now() * 0.006) * 260;
    },
    pickup() { blip(880, 0.1); setTimeout(() => blip(1320, 0.14), 90); },
    complete() { blip(523, 0.12); setTimeout(() => blip(659, 0.12), 110); setTimeout(() => blip(784, 0.2), 220); },
    shot() { blip(180, 0.08, 'square', 0.2); },
    click() { blip(600, 0.06, 'square', 0.08); },
    toggleMute() {
      muted = !muted;
      if (ctx) { engineGain.gain.value = 0; sirenGain.gain.value = 0; }
      return muted;
    },
  };
}
