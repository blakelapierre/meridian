import { steerTo } from "./ai.js";

// Goals a local pilot can run with the player's own hands.
// The order is the order a new body should meet the beach.
export const PILOT_GOALS = [
  { id: "survey", title: "Survey", line: "Walk and look. Eyesight and the chart." },
  { id: "dig", title: "Dig", line: "Open the sand underfoot. Mining." },
  { id: "raise", title: "Raise", line: "A wall beside the footing, if you have the metal." },
  { id: "drill", title: "Drill", line: "Shoot the dummy. Marksmanship." },
  { id: "hunt", title: "Hunt", line: "The line on a beast, not the dummy." },
  { id: "speak", title: "Speak", line: "Walk up to someone in Southmere and use them." },
];

const DEFAULTS = ["survey", "dig", "raise"];

export function createPilot(picked = DEFAULTS) {
  const known = new Set(PILOT_GOALS.map((goal) => goal.id));
  const list = (picked || []).filter((id) => known.has(id));
  return { on: false, picked: list.length ? list : DEFAULTS.slice(), index: 0, work: 0, origin: null, quarry: "" };
}

export function togglePilotGoal(pilot, id) {
  if (!PILOT_GOALS.some((goal) => goal.id === id)) return pilot.picked;
  pilot.picked = pilot.picked.includes(id) ? pilot.picked.filter((goal) => goal !== id) : [...pilot.picked, id];
  if (!pilot.picked.length) pilot.on = false;
  pilot.work = 0;
  pilot.origin = null;
  return pilot.picked;
}

function chosen(pilot) {
  return PILOT_GOALS.map((goal) => goal.id).filter((id) => pilot.picked.includes(id));
}

function hands(steer, extra = {}) {
  return {
    yaw: steer.yaw,
    pitch: extra.pitch ?? -0.2,
    forward: extra.forward ?? 0,
    slot: extra.slot || "bit",
    hold: !!extra.hold,
    shot: !!extra.shot,
    identify: !!extra.identify,
    salvage: false,
    zoom: 0,
    goal: extra.goal,
  };
}

function advance(pilot) {
  pilot.index += 1;
  pilot.work = 0;
  pilot.origin = null;
  pilot.quarry = "";
}

export function stepPilot(pilot, sense) {
  if (!pilot?.on) return null;
  const order = chosen(pilot);
  if (!order.length) return null;
  const goal = order[pilot.index % order.length];
  const from = [sense.x, sense.y];
  if (goal === "survey") {
    if (!pilot.origin) pilot.origin = from.slice();
    const corner = [[8, 0], [8, 8], [0, 8], [0, 0]][pilot.work % 4];
    const steer = steerTo(from, sense.yaw, [pilot.origin[0] + corner[0], pilot.origin[1] + corner[1]]);
    if (steer.dist < 1.6) {
      pilot.work += 1;
      if (pilot.work >= 4) advance(pilot);
    }
    return hands(steer, { goal, forward: steer.forward, pitch: -0.35, identify: sense.tick % 90 === 0 });
  }
  if (goal === "dig") {
    pilot.work += 1;
    if (pilot.work > 90) advance(pilot);
    const steer = steerTo(from, sense.yaw, from);
    return hands(steer, { goal, pitch: -1.05, slot: "bit", hold: pilot.work <= 90 });
  }
  if (goal === "raise") {
    if ((sense.metal ?? 0) < 6 || !sense.open || sense.raised) {
      advance(pilot);
      return hands(steerTo(from, sense.yaw, from), { goal });
    }
    const steer = steerTo(from, sense.yaw, [sense.open[0], sense.open[1] - 1.3]);
    const there = steer.dist < 1.3;
    pilot.work += there ? 1 : 0;
    if (pilot.work > 400) advance(pilot);
    return hands(steer, { goal, forward: there ? 0 : steer.forward, pitch: -0.9, slot: "hammer", hold: there });
  }
  if (goal === "drill") {
    if (!sense.dummy || sense.dummyUp === false) {
      advance(pilot);
      return hands(steerTo(from, sense.yaw, from), { goal });
    }
    const pad = [sense.dummy[0], sense.dummy[1] - 8];
    const there = Math.hypot(from[0] - pad[0], from[1] - pad[1]) < 1.5;
    const face = there ? steerTo(from, sense.yaw, sense.dummy) : steerTo(from, sense.yaw, pad);
    pilot.work += there ? 1 : 0;
    if (pilot.work > 180) advance(pilot);
    return hands(face, {
      goal,
      forward: there ? 0 : face.forward,
      pitch: there ? -0.05 : -0.2,
      slot: "line",
      shot: there && Math.abs(face.face - sense.yaw) < 0.4 && sense.tick % 8 === 0,
    });
  }
  if (goal === "hunt") {
    const live = (sense.beasts || []).filter((beast) => beast && Number.isFinite(beast.x));
    if (!live.length) {
      advance(pilot);
      return hands(steerTo(from, sense.yaw, from), { goal });
    }
    if (pilot.quarry && !live.some((beast) => beast.id === pilot.quarry)) {
      advance(pilot);
      return hands(steerTo(from, sense.yaw, from), { goal });
    }
    if (!pilot.quarry) pilot.quarry = live[0].id;
    const beast = live.find((one) => one.id === pilot.quarry) || live[0];
    const dist = Math.hypot(beast.x - from[0], beast.y - from[1]);
    const steer = steerTo(from, sense.yaw, [beast.x, beast.y]);
    const there = dist < 10;
    return hands(steer, {
      goal,
      forward: there ? 0 : steer.forward,
      pitch: there ? -0.08 : -0.15,
      slot: "line",
      shot: there && Math.abs(steer.face - sense.yaw) < 0.45 && sense.tick % 8 === 0,
    });
  }
  const folk = sense.people || [];
  if (!folk.length) {
    advance(pilot);
    return hands(steerTo(from, sense.yaw, from), { goal });
  }
  let near = folk[0];
  let best = Infinity;
  for (const person of folk) {
    const dist = Math.hypot(person.x - from[0], person.y - from[1]);
    if (dist < best) {
      best = dist;
      near = person;
    }
  }
  const steer = steerTo(from, sense.yaw, [near.x, near.y]);
  const there = best < 2.6;
  if (there) advance(pilot);
  return hands(steer, { goal, forward: there ? 0 : steer.forward, pitch: 0, identify: there });
}
