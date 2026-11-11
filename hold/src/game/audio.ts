export type AudioBus = ReturnType<typeof createAudio>;

export function createAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let music: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;
  let drone: OscillatorNode[] = [];

  let wind: AudioBufferSourceNode | null = null;

  function ensure(): AudioContext | null {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      sfx = ctx.createGain();
      music = ctx.createGain();
      sfx.gain.value = 0.8;
      music.gain.value = 0.22;
      master.gain.value = muted ? 0 : 0.9;
      sfx.connect(master);
      music.connect(master);
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      const g = ctx.createGain();
      a.type = "sine";
      b.type = "triangle";
      a.frequency.value = 55;
      b.frequency.value = 82.4;
      g.gain.value = 0.18;
      a.connect(g);
      b.connect(g);
      g.connect(music);
      a.start();
      b.start();
      drone = [a, b];
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = 0.28;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = "lowpass";
      windFilter.frequency.value = 380;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.045;
      src.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(music);
      src.start();
      wind = src;
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") void c.resume();
  }

  function setMuted(next: boolean) {
    muted = next;
    if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.03);
  }

  function toneAt(freq: number, dur: number, type: OscillatorType, gain: number, when: number, slide = 0) {
    if (!ctx || !sfx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(sfx);
    o.start(when);
    o.stop(when + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
    if (!ctx) return;
    toneAt(freq, dur, type, gain, ctx.currentTime, slide);
  }

  function burst(dur: number, gain: number, rate = 1) {
    if (!ctx || !sfx || !noise || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900 * rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  return {
    unlock,
    setMuted,
    get muted() {
      return muted;
    },
    resume() {
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    swing() {
      unlock();
      burst(0.12, 0.26, 0.5 + Math.random() * 0.2);
      burst(0.05, 0.1, 1.7);
      tone(188, 0.15, "sawtooth", 0.045, -110);
    },
    bow() {
      unlock();
      tone(170, 0.16, "triangle", 0.05, 70);
      tone(740, 0.08, "triangle", 0.06, -460);
      burst(0.05, 0.1, 2.3);
    },
    hit() {
      unlock();
      burst(0.09, 0.32, 0.55 + Math.random() * 0.25);
      tone(128, 0.12, "square", 0.05, -70);
    },
    hurt() {
      unlock();
      tone(110, 0.22, "sawtooth", 0.08, -70);
      burst(0.08, 0.12, 0.4);
    },
    step() {
      unlock();
      burst(0.045, 0.06, 0.35 + Math.random() * 0.2);
    },
    horn() {
      unlock();
      tone(196, 0.35, "triangle", 0.06, -20);
      tone(294, 0.4, "sine", 0.03, -10);
    },
    ui() {
      unlock();
      tone(520, 0.05, "sine", 0.04);
    },
    chat() {
      unlock();
      tone(860, 0.04, "sine", 0.035);
    },
    wing() {
      unlock();
      burst(0.09, 0.07, 1.7);
      burst(0.06, 0.04, 2.6);
      tone(490, 0.08, "sine", 0.03, 90);
    },
    coo() {
      unlock();
      if (!ctx) return;
      const t = ctx.currentTime;
      toneAt(360, 0.1, "triangle", 0.04, t, -40);
      toneAt(280, 0.16, "sine", 0.03, t + 0.08, -20);
    },
    coin() {
      unlock();
      if (!ctx) return;
      const t = ctx.currentTime;
      toneAt(880, 0.07, "square", 0.03, t, 60);
      toneAt(1320, 0.1, "square", 0.028, t + 0.07);
    },
    level() {
      unlock();
      if (!ctx) return;
      const t = ctx.currentTime;
      toneAt(392, 0.14, "sine", 0.05, t);
      toneAt(523, 0.18, "triangle", 0.045, t + 0.11);
      toneAt(784, 0.26, "sine", 0.04, t + 0.22);
    },
    dispose() {
      wind?.stop();
      wind = null;
      for (const o of drone) o.stop();
      drone = [];
      void ctx?.close();
      ctx = null;
    },
  };
}
