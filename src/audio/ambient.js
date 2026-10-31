// Ambient soundscape: world-positioned sources scheduled with jittered gaps so the world almost
// always has something to hear and never loops. Pure scheduling here; play.js voices them.

export const SHORE_Y = -195; // the sea lies south of this line (main hears "sea" below y -190)

// interval: seconds between events [min, max]; when: day | night | any; place: where it sits.
export const AMBIENT_KINDS = {
  surf: { category: "weather", interval: [2.5, 6], when: "any", place: "shore", gain: 0.9 },
  gust: { category: "weather", interval: [7, 18], when: "any", place: "near", gain: 0.6 },
  bird: { category: "nature", interval: [3, 9], when: "day", place: "land", gain: 0.5 },
  gull: { category: "nature", interval: [6, 16], when: "day", place: "shore", gain: 0.55 },
  insect: { category: "nature", interval: [2, 6], when: "night", place: "land", gain: 0.35 },
  rustle: { category: "nature", interval: [4, 10], when: "any", place: "near", gain: 0.4 },
  activity: { category: "people", interval: [5, 12], when: "any", place: "actor", gain: 0.6 },
  rare: { category: "rare", interval: [45, 120], when: "any", place: "far", gain: 0.5 },
};

export function createAmbient() {
  return { next: {}, variant: {} };
}

function placeFor(kind, listener, actors, rand) {
  const [x, y] = listener;
  const ring = (min, max) => {
    const a = rand() * Math.PI * 2;
    const r = min + rand() * (max - min);
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  };
  switch (kind.place) {
    case "shore": {
      if (y - SHORE_Y > 140) return null; // too far inland to hear the shore
      return [x + (rand() * 2 - 1) * 40, SHORE_Y - rand() * 6];
    }
    case "land": {
      const spot = ring(8, 45);
      return spot[1] < SHORE_Y ? [spot[0], SHORE_Y + 4 + rand() * 20] : spot;
    }
    case "near":
      return ring(3, 14);
    case "actor": {
      if (!actors?.length) return null;
      const who = actors[Math.floor(rand() * actors.length) % actors.length];
      return [who[0] + (rand() - 0.5) * 2, who[1] + (rand() - 0.5) * 2];
    }
    case "far":
      return ring(40, 90);
    default:
      return null;
  }
}

// Advance the schedule to `now` (seconds). Returns the events due: { kind, category, at:[x,y], gain, variant }.
export function planAmbient(state, { now, listener, light = "day", actors = [], rand = Math.random }) {
  const night = light === "night";
  const due = [];
  for (const [name, kind] of Object.entries(AMBIENT_KINDS)) {
    if ((kind.when === "day" && night) || (kind.when === "night" && !night)) continue;
    const gap = () => kind.interval[0] + rand() * (kind.interval[1] - kind.interval[0]);
    if (state.next[name] === undefined) {
      state.next[name] = now + gap() * rand();
      continue;
    }
    if (now < state.next[name]) continue;
    state.next[name] = now + gap();
    const at = placeFor(kind, listener, actors, rand);
    if (!at) continue;
    // Never repeat the same voice twice running.
    let variant = Math.floor(rand() * 4);
    if (variant === state.variant[name]) variant = (variant + 1) % 4;
    state.variant[name] = variant;
    due.push({ kind: name, category: kind.category, at, gain: kind.gain * (0.75 + rand() * 0.5), variant });
  }
  return due;
}
