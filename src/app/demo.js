// Demo mode, the first-minute tour, slot picks, and where the lighthouse is.
// Pure helpers so node tests can drive them without a page.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

// The public build hides the debug panels. ?debug=1 shows them; ?demo=1 forces demo anywhere.
export function demoMode(params, hostname = "") {
  if (params.get("debug") === "1" || params.get("demo") === "0") return false;
  if (params.get("demo") === "1") return true;
  return /(^|\.)github\.io$/.test(hostname);
}

export function isLocalHost(hostname = "") {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

// ?lighthouse= or ?signal= wins, then content/lighthouse.json, then the dev lighthouse on a local host.
// A public host never tries localhost. null means play solo.
export function lighthouseUrl(params, hostname = "", config = null) {
  const asked = params.get("lighthouse") || params.get("signal");
  if (asked === "off" || asked === "none") return null;
  if (asked && /^wss?:\/\//.test(asked)) return asked;
  const local = isLocalHost(hostname);
  const configured = config && typeof config.url === "string" && /^wss?:\/\//.test(config.url) ? config.url : null;
  if (local) return (config && config.local) || "ws://127.0.0.1:8787";
  if (configured && !/^wss?:\/\/(127\.0\.0\.1|localhost)/.test(configured)) return configured;
  return null;
}

// 1 is the line. 3 takes the bit out first, then swaps bit and hammer.
export function nextSlot(slot, code, chosen) {
  if (code === "Digit1") return { slot: "line", chosen };
  if (code !== "Digit3") return { slot, chosen };
  if (!chosen || (slot !== "bit" && slot !== "hammer")) return { slot: "bit", chosen: true };
  return { slot: slot === "bit" ? "hammer" : "bit", chosen: true };
}

export const TOUR = [
  { id: "walk", desktop: "Click the picture, then hold W to walk. Move the mouse to look.", touch: "Drag the left side to walk. Drag the right side to look.", done: "Walked" },
  { id: "shoot", desktop: "Press 1 for the line. Aim at the red dummy and click.", touch: "Tap 1 Line. Aim at the red dummy and tap Fire.", done: "Hit the dummy" },
  { id: "dig", desktop: "Press 3 for the bit. Look down at the sand and hold the mouse.", touch: "Tap 3 Tool. Look down at the sand and hold Fire.", done: "Dug a pit" },
  { id: "map", desktop: "Press M for the map.", touch: "Tap M Map.", done: "Opened the map" },
];

export function createTour(done = []) {
  return { index: TOUR.findIndex((step) => !done.includes(step.id)), confirm: "", confirmUntil: 0 };
}

// facts: { walked: metres, hits, digs, mapOpen }. Returns true when a step just finished.
export function stepTour(tour, facts, now) {
  if (tour.index < 0) return false;
  const step = TOUR[tour.index];
  const met = step.id === "walk" ? facts.walked >= 3
    : step.id === "shoot" ? facts.hits > 0
    : step.id === "dig" ? facts.digs > 0
    : facts.mapOpen;
  if (!met) return false;
  tour.confirm = step.done;
  tour.confirmUntil = now + 2500;
  tour.index += 1;
  if (tour.index >= TOUR.length) tour.index = -1;
  return true;
}

export function tourLine(tour, touch, now) {
  const tick = tour.confirmUntil > now && tour.confirm ? `✓ ${tour.confirm}. ` : "";
  if (tour.index < 0) return tick ? `${tick}That is the first minute. F3 shows the debug panels.` : "";
  const step = TOUR[tour.index];
  return `${tick}${tour.index + 1}/${TOUR.length} ${touch ? step.touch : step.desktop}`;
}

export function tourDone(tour) {
  return TOUR.slice(0, tour.index < 0 ? TOUR.length : tour.index).map((step) => step.id);
}
