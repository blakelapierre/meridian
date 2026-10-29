export const AI_ORDER = ["surveyor", "miner", "builder", "marksman"];

export const AGENDAS = {
  surveyor: {
    title: "Surveyor",
    agenda: "Name the beach. Do not dig or shoot.",
    home: [-6, -150],
    loop: [[-6, -150], [-6, -140], [8, -140], [8, -150]],
  },
  miner: {
    title: "Miner",
    agenda: "Open pits in the sand. Leave the dummy alone.",
    home: [6, -152],
    dig: [6, -148],
  },
  builder: {
    title: "Builder",
    agenda: "Raise a wall, salvage it, and raise another.",
    home: [4, -140],
    work: [1.2, -140],
  },
  marksman: {
    title: "Marksman",
    agenda: "Drill the dummy from the pad. Do not dig.",
    home: [0, -128],
    aim: [10, -125],
  },
};

export function createAgent(name) {
  return { name, index: 0, salvage: false };
}

export function steerTo(from, yaw, target) {
  const dx = target[0] - from[0];
  const dy = target[1] - from[1];
  const face = Math.atan2(dx, dy);
  let diff = face - yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-0.12, Math.min(0.12, diff));
  return {
    yaw: yaw + step,
    pitch: -0.2,
    forward: Math.abs(diff) < 0.5 ? 1 : 0,
    dist: Math.hypot(dx, dy),
    face,
  };
}

function idle(steer) {
  return { ...steer, slot: "bit", hold: false, shot: false, identify: false, salvage: false };
}

export function stepAgenda(name, agent, sense) {
  const agenda = AGENDAS[name];
  if (name === "surveyor") {
    const point = agenda.loop[agent.index % agenda.loop.length];
    const steer = steerTo([sense.x, sense.y], sense.yaw, point);
    if (steer.dist < 1.5) agent.index += 1;
    return {
      ...idle(steer),
      pitch: -0.35,
      identify: sense.tick % 90 === 0,
      zoom: sense.tick % 200 === 0 ? -1 : sense.tick % 200 === 40 ? 1 : 0,
    };
  }
  if (name === "miner") {
    const steer = steerTo([sense.x, sense.y], sense.yaw, agenda.dig);
    const there = steer.dist < 1.2;
    return { ...idle(steer), forward: there ? 0 : steer.forward, pitch: there ? -1.05 : -0.4, slot: "bit", hold: there };
  }
  if (name === "builder") {
    const steer = steerTo([sense.x, sense.y], sense.yaw, agenda.work);
    const there = steer.dist < 1.4;
    const salvage = there && !!sense.wall;
    return {
      ...idle(steer),
      forward: there ? 0 : steer.forward,
      pitch: -0.9,
      slot: "hammer",
      hold: there && !salvage,
      salvage,
    };
  }
  const steer = steerTo([sense.x, sense.y], sense.yaw, agenda.home);
  const there = steer.dist < 1.5;
  const face = there ? steerTo([sense.x, sense.y], sense.yaw, agenda.aim) : steer;
  return {
    ...idle(face),
    forward: there ? 0 : steer.forward,
    pitch: there ? -0.05 : -0.2,
    slot: "line",
    shot: there && Math.abs(face.face - sense.yaw) < 0.35 && sense.tick % 8 === 0,
  };
}
