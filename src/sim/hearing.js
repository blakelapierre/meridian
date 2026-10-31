// Hearing progression: what a sound becomes for this listener, given their hearing skills.
// Pure functions so the audio, the visual cues and the tests all agree.
import { hearAt } from "./perception.js";

// Sound category -> the noticing sub-skill that trains on it and sharpens it.
export const SOUND_SKILL = {
  nature: "nature", // birds, gulls, insects, grass
  people: "footsteps", // steps, voices, digging nearby
  combat: "mechanics", // shots, impacts, machinery
  weather: "weather", // surf, wind, rain
  rare: "rare", // the odd, hidden things
};
export const CATEGORIES = Object.keys(SOUND_SKILL);

// Visual cue tint per category (rgb 0..255).
export const CUE_TINT = {
  nature: [150, 220, 140],
  people: [255, 214, 150],
  combat: [255, 120, 110],
  weather: [150, 200, 255],
  rare: [215, 160, 255],
};

const unit = (value) => Math.max(0, Math.min(1, (value || 0) / 100));

// How strongly this listener notices a category, 0..1. The parent hearing skill counts for some of it.
export function noticing(skills, category) {
  const sub = skills?.[SOUND_SKILL[category]]?.value || 0;
  const ear = skills?.hearing?.value || 0;
  return Math.min(1, unit(sub) * 0.7 + unit(ear) * 0.3);
}

// Angular blur (radians) on where a sound seems to come from. Low Localization blurs it wide.
export function panSpread(skills) {
  return (1 - unit(skills?.localization?.value)) * 1.2 + 0.05;
}

// Hear one source. Returns null when it is out of reach or masked; otherwise
// { gain, pan, dist, angle, noticed, spread } where angle is the (jittered) bearing relative to the
// facing (0 ahead, +right). `mask` is the loudness of what is already playing nearby (0..1).
export function hearSource(listener, yaw, source, hearing, skills, category = "nature", { mask = 0, rand = Math.random } = {}) {
  const note = noticing(skills, category);
  const reach = { ...hearing, range: hearing.range * (1 + note * 0.6) };
  const heard = hearAt(listener, yaw, source, reach);
  if (!heard) return null;
  const clear = heard.gain * (0.6 + 0.4 * note);
  if (clear < mask * 0.35 * (1 - note)) return null;
  const dx = source[0] - listener[0];
  const dy = source[1] - listener[1];
  const right = dx * Math.cos(yaw) - dy * Math.sin(yaw);
  const ahead = dx * Math.sin(yaw) + dy * Math.cos(yaw);
  const spread = panSpread(skills);
  const angle = Math.atan2(right, ahead) + (rand() * 2 - 1) * spread;
  return { gain: clear, pan: Math.sin(angle), dist: heard.dist, angle, noticed: note, spread };
}

// Which skills one heard sound trains: the parent, the category, and Localization when it is off to a side.
export function exposureSkills(heard, category) {
  if (!heard || heard.gain < 0.08) return [];
  const names = ["hearing", SOUND_SKILL[category]];
  if (Math.abs(heard.pan) > 0.3) names.push("localization");
  return names;
}

// Visual cue for a heard sound, or null when this listener would not notice it.
// Low skill: only a faint shimmer at the screen edge. Higher: arcs/pulses, narrower as Localization rises.
export function cueStyle(skills, category, gain = 1) {
  const note = noticing(skills, category);
  const loc = unit(skills?.localization?.value);
  if (note < 0.05 && loc < 0.1) return null;
  const opacity = Math.min(0.55, (0.08 + note * 0.45) * Math.min(1, 0.4 + gain));
  return {
    tint: CUE_TINT[category] || CUE_TINT.nature,
    opacity,
    spread: (100 * (1 - loc) + 10) * (Math.PI / 180),
    shimmer: note < 0.15,
    pulse: note >= 0.15,
    blip: note >= 0.5 && loc >= 0.6,
  };
}

// Awareness: someone moving toward you outside your view. Returns the bearing when noticed.
export function sensePresence(listener, yaw, other, awareness, { fov = Math.PI / 3 } = {}) {
  const level = unit(awareness);
  if (level < 0.1) return null;
  const dx = other[0] - listener[0];
  const dy = other[1] - listener[1];
  const dist = Math.hypot(dx, dy);
  const reach = 6 + level * 24;
  if (dist > reach || dist < 0.5) return null;
  const angle = Math.atan2(dx * Math.cos(yaw) - dy * Math.sin(yaw), dx * Math.sin(yaw) + dy * Math.cos(yaw));
  if (Math.abs(angle) < fov) return null;
  return { angle, dist, strength: (1 - dist / reach) * level };
}

// Dark adaptation: how much of the night's dimming the eye wins back (0..0.5).
export function darkLift(dark, night) {
  return night ? unit(dark) * 0.5 : 0;
}
