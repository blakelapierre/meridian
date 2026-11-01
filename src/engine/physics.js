// N-body step from blakelapierre/nbody-raycaster@4698794.
// Velocities are units per second. One tick advances 1/ticksPerStep seconds.
// Game frames at 30 Hz use ticksPerStep 30. The toy solar system keeps 60.

const scratch = {
  dd: [0, 0, 0],
  oldp1: [0, 0, 0],
  oldp2: [0, 0, 0],
  pv1: [0, 0, 0],
  pv2: [0, 0, 0],
};

export class Mass {
  constructor(mass = 0, color = [255, 255, 255, 255], position = [0, 0, 0], velocity = [0, 0, 0]) {
    this.color = color.slice();
    this.position = position.slice();
    this.velocity = velocity.slice();
    this.acceleration = [0, 0, 0];
    this.gravity = [0, 0, 0];
    this.policy = "merge";
    this._visual = null;
    this._collision = null;
    this.mass = mass;
  }

  set mass(value) {
    this._mass = value;
    this._densityRadius = Math.cbrt((3 / (4 * Math.PI)) * Math.max(value, 0));
  }

  get mass() {
    return this._mass;
  }

  get size() {
    return this._visual ?? this._densityRadius;
  }

  set size(value) {
    this._visual = value;
  }

  get collisionSize() {
    return this._collision ?? this.size;
  }

  set collisionSize(value) {
    this._collision = value;
  }
}

export function createUniverse(bodies, options = {}) {
  return {
    universe: bodies.slice(),
    currentTick: 0,
    ticksPerStep: options.ticksPerStep ?? 60,
    stepsPerSecond: options.stepsPerSecond ?? 1,
    gravityConstant: options.gravityConstant ?? 6.67408e-7,
    speedlimit: options.speedlimit ?? 300000,
    events: [],
    collisionList: [],
  };
}

function predict(out, position, velocity, acceleration, o) {
  const dd = scratch.dd;
  dd[0] = acceleration[0] * o;
  dd[1] = acceleration[1] * o;
  dd[2] = acceleration[2] * o;
  dd[0] = velocity[0] + dd[0] * 0.5;
  dd[1] = velocity[1] + dd[1] * 0.5;
  dd[2] = velocity[2] + dd[2] * 0.5;
  out[0] = position[0] + dd[0] * o;
  out[1] = position[1] + dd[1] * o;
  out[2] = position[2] + dd[2] * o;
  return out;
}

export function tick(state) {
  state.currentTick++;
  const bodies = state.universe;
  const ticksPerStep = state.ticksPerStep;
  const half = 0.5 / ticksPerStep;
  const dt = 1 / ticksPerStep;
  const c2 = state.speedlimit * state.speedlimit;
  const collisionList = [];

  for (let i = 0; i < bodies.length; i++) {
    const mass = bodies[i];
    mass.position[0] += mass.velocity[0] * half;
    mass.position[1] += mass.velocity[1] * half;
    mass.position[2] += mass.velocity[2] * half;
    mass.gravity[0] = 0;
    mass.gravity[1] = 0;
    mass.gravity[2] = 0;
  }

  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const dx = a.position[0] - b.position[0];
      const dy = a.position[1] - b.position[1];
      const dz = a.position[2] - b.position[2];
      const distance = Math.hypot(dx, dy, dz);
      const o = -distance / c2 / ticksPerStep;
      const p1 = predict(scratch.oldp1, a.position, a.velocity, a.acceleration, o);
      const p2 = predict(scratch.oldp2, b.position, b.velocity, b.acceleration, o);
      const pv1x = p1[0] - b.position[0];
      const pv1y = p1[1] - b.position[1];
      const pv1z = p1[2] - b.position[2];
      const pv2x = p2[0] - a.position[0];
      const pv2y = p2[1] - a.position[1];
      const pv2z = p2[2] - a.position[2];
      const d1 = pv1x * pv1x + pv1y * pv1y + pv1z * pv1z;
      const d2 = pv2x * pv2x + pv2y * pv2y + pv2z * pv2z;
      const scalar = a.mass * b.mass * state.gravityConstant;
      if (d1 > 0) {
        const s = scalar / (d1 * Math.sqrt(d1));
        b.gravity[0] += pv1x * s;
        b.gravity[1] += pv1y * s;
        b.gravity[2] += pv1z * s;
      }
      if (d2 > 0) {
        const s = scalar / (d2 * Math.sqrt(d2));
        a.gravity[0] += pv2x * s;
        a.gravity[1] += pv2y * s;
        a.gravity[2] += pv2z * s;
      }
      if (distance < a.collisionSize + b.collisionSize) {
        if (a.mass <= b.mass) collisionList.push([a, b]);
        else collisionList.push([b, a]);
      }
    }
    if (a.mass !== 0) {
      a.gravity[0] /= a.mass;
      a.gravity[1] /= a.mass;
      a.gravity[2] /= a.mass;
    }
  }

  for (let i = 0; i < bodies.length; i++) {
    const mass = bodies[i];
    mass.velocity[0] += (mass.acceleration[0] + mass.gravity[0]) * dt;
    mass.velocity[1] += (mass.acceleration[1] + mass.gravity[1]) * dt;
    mass.velocity[2] += (mass.acceleration[2] + mass.gravity[2]) * dt;
    mass.position[0] += mass.velocity[0] * half;
    mass.position[1] += mass.velocity[1] * half;
    mass.position[2] += mass.velocity[2] * half;
  }

  resolveCollisions(state, collisionList);
  for (let i = 0; i < state.universe.length; i++) {
    const mass = state.universe[i];
    if (!mass.pinned || !mass.home) continue;
    mass.position[0] = mass.home[0];
    mass.position[1] = mass.home[1];
    mass.position[2] = mass.home[2];
    mass.velocity[0] = 0;
    mass.velocity[1] = 0;
    mass.velocity[2] = 0;
  }
  return state;
}

function resolveCollisions(state, collisionList) {
  const absorbed = new Set();
  for (let i = 0; i < collisionList.length; i++) {
    const smaller = collisionList[i][0];
    const greater = collisionList[i][1];
    if (absorbed.has(smaller) || absorbed.has(greater)) continue;
    if (!state.universe.includes(smaller) || !state.universe.includes(greater)) continue;
    const policy = pairPolicy(smaller, greater);
    if (policy === "merge") merge(state, smaller, greater, absorbed);
    else if (policy === "event") {
      state.events.push(["hit", smaller, greater]);
      removeBody(state, smaller);
      absorbed.add(smaller);
    } else separate(smaller, greater);
  }
}

function pairPolicy(a, b) {
  if (a.policy === "event" || b.policy === "event") return "event";
  if (a.policy === "separate" || b.policy === "separate") return "separate";
  return "merge";
}

function merge(state, smaller, greater, absorbed) {
  const m1 = greater.mass;
  const m2 = smaller.mass;
  const total = m1 + m2;
  if (!(total > 0)) return;
  const factor = m1 / total;
  const ratio = m2 / total;
  greater.color[0] = greater.color[0] * factor + smaller.color[0] * ratio;
  greater.color[1] = greater.color[1] * factor + smaller.color[1] * ratio;
  greater.color[2] = greater.color[2] * factor + smaller.color[2] * ratio;
  greater.color[3] = greater.color[3] * factor + smaller.color[3] * ratio;
  greater.velocity[0] = (greater.velocity[0] * m1 + smaller.velocity[0] * m2) / total;
  greater.velocity[1] = (greater.velocity[1] * m1 + smaller.velocity[1] * m2) / total;
  greater.velocity[2] = (greater.velocity[2] * m1 + smaller.velocity[2] * m2) / total;
  greater.mass = total;
  absorbed.add(smaller);
  removeBody(state, smaller);
  state.events.push(["absorbed", smaller, greater]);
}

function separate(a, b) {
  let dx = b.position[0] - a.position[0];
  let dy = b.position[1] - a.position[1];
  let dz = b.position[2] - a.position[2];
  let distance = Math.hypot(dx, dy, dz);
  const need = a.collisionSize + b.collisionSize;
  if (distance === 0) {
    dx = 1;
    dy = 0;
    dz = 0;
    distance = 1;
  }
  const nx = dx / distance;
  const ny = dy / distance;
  const nz = dz / distance;
  const push = need - distance;
  if (push > 0) {
    const halfPush = push / 2;
    a.position[0] -= nx * halfPush;
    a.position[1] -= ny * halfPush;
    a.position[2] -= nz * halfPush;
    b.position[0] += nx * halfPush;
    b.position[1] += ny * halfPush;
    b.position[2] += nz * halfPush;
  }
  const rel = (b.velocity[0] - a.velocity[0]) * nx
    + (b.velocity[1] - a.velocity[1]) * ny
    + (b.velocity[2] - a.velocity[2]) * nz;
  if (rel < 0) {
    a.velocity[0] += rel * nx;
    a.velocity[1] += rel * ny;
    a.velocity[2] += rel * nz;
    b.velocity[0] -= rel * nx;
    b.velocity[1] -= rel * ny;
    b.velocity[2] -= rel * nz;
  }
}

function removeBody(state, body) {
  const index = state.universe.indexOf(body);
  if (index >= 0) state.universe.splice(index, 1);
}

export function runTicks(state, count) {
  for (let i = 0; i < count; i++) tick(state);
  return state;
}

export function snapshot(state) {
  return state.universe.map((body) => ({
    mass: body.mass,
    position: body.position.slice(),
    velocity: body.velocity.slice(),
  }));
}
