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

// The first minute. Each step has a goal in metres (x east, y north) the page marks on screen
// with its distance, a radius that counts as arrived, and the slot it hands the player.
// Positions follow content/atoll.json: dummy (10, -125), pad (0, -125), gate volume from y -110.
export const TOUR_START = { x: 0, y: -133, yaw: 0 };
export const TOUR = [
  { id: "walk", goal: [0, -125, 0], radius: 4, name: "marker",
    desktop: "Click the picture, then hold W to walk to the yellow marker.",
    touch: "Drag the left side to walk to the yellow marker.", done: "Made it" },
  { id: "shoot", goal: [10, -125, 1.3], name: "dummy", slot: "line", face: true,
    desktop: "Put the white dot on the red dummy and click to shoot.",
    touch: "Drag the right side to put the dot on the red dummy, then tap Fire.", done: "Hit the dummy" },
  { id: "dig", slot: "bit", pitch: -1.1,
    desktop: "Hold the mouse button to dig the sand at your feet.",
    touch: "Hold Fire to dig the sand at your feet.", done: "Dug a pit" },
  { id: "gate", goal: [0, -106, 0], radius: 7, name: "gate", face: true,
    desktop: "Hold W to walk to the gate marker, then press E to join the strike.",
    touch: "Walk to the gate marker, then tap E Use to join the strike.", done: "Joined the strike" },
];
export const TOUR_KEY = "meridian-tour-2";

export function createTour(done = []) {
  return { index: TOUR.findIndex((step) => !done.includes(step.id)), confirm: "", confirmUntil: 0, skip: false };
}

// The angle in radians between the look direction and the direction to the goal (yaw 0 is north).
export function goalOffset(from, yaw, goal) {
  const bearing = Math.atan2(goal[0] - from[0], goal[1] - from[1]);
  let off = bearing - yaw;
  while (off > Math.PI) off -= 2 * Math.PI;
  while (off < -Math.PI) off += 2 * Math.PI;
  return off;
}

// facts: { position, yaw, hits, nearShots, digs, joined }. Returns true when a step just finished.
// Generous: a shot within about 8 degrees of the dummy counts, and a skip always counts.
export function stepTour(tour, facts, now) {
  if (tour.index < 0) return false;
  const step = TOUR[tour.index];
  const near = step.goal && facts.position
    ? Math.hypot(step.goal[0] - facts.position[0], step.goal[1] - facts.position[1]) <= (step.radius || 0)
    : false;
  const met = tour.skip
    || (step.id === "walk" ? near
    : step.id === "shoot" ? facts.hits > 0 || facts.nearShots > 0
    : step.id === "dig" ? facts.digs > 0
    : facts.joined);
  if (!met) return false;
  tour.confirm = tour.skip ? "Skipped" : step.done;
  tour.skip = false;
  tour.confirmUntil = now + 2500;
  tour.index += 1;
  if (tour.index >= TOUR.length) tour.index = -1;
  return true;
}

export function tourStep(tour) {
  return tour && tour.index >= 0 ? TOUR[tour.index] : null;
}

export function tourLine(tour, touch, now) {
  const tick = tour.confirmUntil > now && tour.confirm ? `✓ ${tour.confirm}. ` : "";
  if (tour.index < 0) return tick ? `${tick}That is the first minute. The world is yours.` : "";
  const step = TOUR[tour.index];
  return `${tick}${tour.index + 1}/${TOUR.length} ${touch ? step.touch : step.desktop}`;
}

export function tourDone(tour) {
  return TOUR.slice(0, tour.index < 0 ? TOUR.length : tour.index).map((step) => step.id);
}
