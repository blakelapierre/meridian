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

  let noise = null;
  function noiseBuffer(audio) {
    if (noise) return noise;
    noise = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  // Route a voice through an HRTF PannerNode when `place` is given ({ angle, dist, precise }),
  // else a StereoPanner. Angle is the bearing from facing (0 ahead, +right).
  function route(audio, node, place) {
    if (place && place.precise && audio.createPanner) {
      const panner = audio.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "linear";
      panner.refDistance = 1;
      panner.maxDistance = 10000;
      panner.rolloffFactor = 0; // distance is already in the gain
      const r = 2;
      if (panner.positionX) {
        panner.positionX.value = Math.sin(place.angle) * r;
        panner.positionZ.value = -Math.cos(place.angle) * r;
      } else panner.setPosition(Math.sin(place.angle) * r, 0, -Math.cos(place.angle) * r);
      node.connect(panner);
      panner.connect(master);
      return;
    }
    if (place && audio.createStereoPanner) {
      const stereo = audio.createStereoPanner();
      stereo.pan.value = Math.max(-1, Math.min(1, Math.sin(place.angle)));
      node.connect(stereo);
      stereo.connect(master);
      return;
    }
    node.connect(master);
  }

  // Ambient voices. Each is short, synthesized, and varied by `variant` (0..3) and a random detune.
  function voice(audio, kind, variant, amount, place) {
    const now = audio.currentTime;
    const out = audio.createGain();
    out.gain.value = 0;
    const tone = (type, from, to, dur, at = 0, level = 1) => {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now + at);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + at + dur);
      env.gain.setValueAtTime(0.0001, now + at);
      env.gain.exponentialRampToValueAtTime(level, now + at + Math.min(0.02, dur / 4));
      env.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(env);
      env.connect(out);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.02);
      return at + dur;
    };
    const hiss = (type, freq, q, dur, attack, level = 1) => {
      const src = audio.createBufferSource();
      src.buffer = noiseBuffer(audio);
      src.loop = true;
      const filter = audio.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const env = audio.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(level, now + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(filter);
      filter.connect(env);
      env.connect(out);
      src.start(now, Math.random() * 1.5);
      src.stop(now + dur + 0.05);
      return dur;
    };
    const jitter = 1 + (Math.random() - 0.5) * 0.12;
    let end = 0.5;
    switch (kind) {
      case "surf":
        end = hiss("lowpass", (500 + variant * 120) * jitter, 0.7, 2.2 + variant * 0.4, 0.9);
        break;
      case "gust":
        end = hiss("bandpass", (380 + variant * 90) * jitter, 1.2, 1.6 + variant * 0.5, 0.7, 0.8);
        break;
      case "rustle":
        end = hiss("highpass", 3200 * jitter, 0.8, 0.35 + variant * 0.1, 0.05, 0.6);
        break;
      case "bird": {
        const base = (2400 + variant * 450) * jitter;
        for (let i = 0; i < 2 + variant; i += 1) end = tone("sine", base, base * 1.35, 0.08, i * 0.13, 0.7);
        break;
      }
      case "gull":
        end = tone("sawtooth", 1250 * jitter, 700, 0.35, 0, 0.3);
        if (variant % 2) end = tone("sawtooth", 1300 * jitter, 760, 0.3, 0.42, 0.25);
        break;
      case "insect": {
        const base = (4200 + variant * 300) * jitter;
        for (let i = 0; i < 6; i += 1) end = tone("square", base, base, 0.03, i * 0.06, 0.12);
        break;
      }
      case "activity":
        end = tone("triangle", (120 + variant * 25) * jitter, 70, 0.12, 0, 0.8);
        end = tone("triangle", (110 + variant * 25) * jitter, 65, 0.12, 0.3, 0.6);
        break;
      case "rare":
        end = tone("sine", (330 + variant * 55) * jitter, (220 + variant * 40) * jitter, 2.4, 0, 0.6);
        break;
      default:
        return false;
    }
    out.gain.setValueAtTime(0.18 * Math.max(0, Math.min(1.5, amount)), now);
    route(audio, out, place);
    setTimeout(() => out.disconnect(), (end + 0.3) * 1000);
    return true;
  }

  return {
    ambient(kind, variant, amount, place) {
      const audio = context();
      if (!audio || !master) return false;
      return voice(audio, kind, variant, amount, place);
    },
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
    play(name, amount = 1, pan = 0) {
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
      if (pan && audio.createStereoPanner) {
        const stereo = audio.createStereoPanner();
        stereo.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(stereo);
        stereo.connect(master);
      } else {
        gain.connect(master);
      }
      osc.start(now);
      osc.stop(now + cue.dur);
      return true;
    },
  };
}
