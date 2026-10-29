import { cueFor } from "./cues.js";

export function createListener() {
  let ctx = null;
  let master = null;
  let muted = false;

  function context() {
    if (muted) return null;
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  return {
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      if (muted && ctx && ctx.state === "running") ctx.suspend();
      if (!muted && ctx && ctx.state === "suspended") ctx.resume();
      return muted;
    },
    setLevel(level) {
      if (master) master.gain.value = 0.35 * Math.max(0, Math.min(1, level));
    },
    play(name, amount = 1) {
      const cue = cueFor(name);
      if (!cue) return false;
      const audio = context();
      if (!audio || !master) return false;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = cue.wave;
      osc.frequency.value = cue.freq;
      const now = audio.currentTime;
      gain.gain.setValueAtTime(cue.gain * Math.max(0, amount), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + cue.dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + cue.dur);
      return true;
    },
  };
}
