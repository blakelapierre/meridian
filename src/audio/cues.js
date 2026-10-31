export const CUES = {
  step: { freq: 90, dur: 0.06, gain: 0.07, wave: "triangle" },
  dig: { freq: 130, dur: 0.14, gain: 0.12, wave: "sawtooth" },
  fill: { freq: 210, dur: 0.1, gain: 0.08, wave: "triangle" },
  shot: { freq: 180, dur: 0.09, gain: 0.2, wave: "square" },
  place: { freq: 340, dur: 0.16, gain: 0.1, wave: "triangle" },
  salvage: { freq: 150, dur: 0.12, gain: 0.09, wave: "sawtooth" },
  hurt: { freq: 70, dur: 0.22, gain: 0.14, wave: "sine" },
  bind: { freq: 440, dur: 0.28, gain: 0.08, wave: "sine" },
  recall: { freq: 220, dur: 0.4, gain: 0.1, wave: "sine" },
  sea: { freq: 50, dur: 0.5, gain: 0.05, wave: "sine" },
};

export function seaGain(word) {
  if (word === "noon") return 0.5;
  if (word === "night") return 0.3;
  return 1;
}

export function cueFor(name) {
  return CUES[name] || null;
}

export function hearStep(previous, position, sprint = false) {
  if (!previous) return { cue: null, at: position.slice() };
  const dist = Math.hypot(position[0] - previous[0], position[1] - previous[1]);
  const need = sprint ? 1.15 : 0.72;
  if (dist < need) return { cue: null, at: previous };
  return { cue: "step", at: position.slice() };
}
