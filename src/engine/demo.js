import { Mass, createUniverse } from "./physics.js";

export const DEMO_G = 6.67408e-7;

export function createDemo() {
  const sun = new Mass(1000000, [255, 210, 40, 255]);
  const bodies = [sun];
  const orbits = [
    [sun.size + 50, 10, [70, 130, 255, 255]],
    [sun.size + 110, 14, [220, 80, 50, 255]],
    [sun.size + 260, 12, [230, 230, 235, 255]],
  ];
  for (let i = 0; i < orbits.length; i++) {
    const [distance, radius, color] = orbits[i];
    const mass = (4 / 3) * Math.PI * radius * radius * radius;
    const speed = Math.sqrt(DEMO_G * sun.mass / distance);
    bodies.push(new Mass(mass, color, [distance, 0, 0], [0, speed, 0]));
  }
  const host = bodies[3];
  const hostRadius = host.size;
  const hostMass = 50000;
  const hostDistance = host.position[0];
  const vRel = Math.sqrt(DEMO_G * (sun.mass + hostMass) / hostDistance);
  host.velocity[1] = vRel * sun.mass / (sun.mass + hostMass);
  sun.velocity[1] = -vRel * hostMass / (sun.mass + hostMass);
  host.mass = hostMass;
  host.size = hostRadius;
  host.collisionSize = hostRadius;
  const moonRadius = 6;
  const moonMass = (4 / 3) * Math.PI * moonRadius * moonRadius * moonRadius;
  const moonDist = 28;
  const moonSpeed = Math.sqrt(DEMO_G * host.mass / moonDist);
  bodies.push(new Mass(
    moonMass,
    [150, 230, 255, 255],
    [host.position[0] + moonDist, host.position[1], 0],
    [0, host.velocity[1] + moonSpeed, 0],
  ));
  const state = createUniverse(bodies, {
    ticksPerStep: 60,
    stepsPerSecond: 900,
    gravityConstant: DEMO_G,
  });
  state.moonDistance = moonDist;
  return state;
}

// The pen's 1500-body disk. Not the five-body demo. Gravity is the exact pair
// pass, not an approximation. G is raised so an orbit is visible in a few steps.
export function createCrowd() {
  const G = DEMO_G * 1.28e7;
  const sun = new Mass(2000000, [255, 214, 90, 255]);
  sun.reflectivity = 0.25;
  const bodies = [sun];
  const count = 1499;
  const inner = sun.size + 18;
  const outer = 560;
  const radius = 4.5;
  const particle = (4 / 3) * Math.PI * radius * radius * radius;
  const palette = [[176, 198, 255, 255], [255, 176, 114, 255], [226, 228, 236, 255]];
  for (let i = 0; i < count; i++) {
    const dist = inner + (outer - inner) * Math.sqrt((i + 0.5) / count);
    const ang = i * 2.399963229728653;
    const lift = Math.sin(i * 12.9898) * dist * 0.05;
    const enclosed = sun.mass + particle * count * ((i + 0.5) / count) * 0.55;
    const speed = Math.sqrt(G * enclosed / dist) * (0.94 + (i % 5) * 0.025);
    const climb = Math.cos(i * 4.37) * speed * 0.035;
    const body = new Mass(
      particle,
      palette[i % 3],
      [Math.cos(ang) * dist, Math.sin(ang) * dist, lift],
      [-Math.sin(ang) * speed, Math.cos(ang) * speed, climb],
    );
    body.size = radius;
    body.collisionSize = radius;
    body.reflectivity = 0;
    bodies.push(body);
  }
  return createUniverse(bodies, {
    ticksPerStep: 60,
    stepsPerSecond: 900,
    gravityConstant: G,
  });
}

export function createShapes() {
  const G = DEMO_G;
  const K = 40000;
  const core = new Mass(20000, [90, 150, 255, 255]);
  core.charge = -4;
  core.reflectivity = 0.35;
  const bodies = [core];
  const moons = [
    [70, 1, 0.4, [255, 96, 64, 255]],
    [70, 1, 2.6, [255, 176, 64, 255]],
    [108, -1, 4.4, [150, 230, 255, 255]],
  ];
  for (let i = 0; i < moons.length; i++) {
    const dist = moons[i][0];
    const q = moons[i][1];
    const ang = moons[i][2];
    const color = moons[i][3];
    const mass = 4000;
    const toward = (G * core.mass - K * q * core.charge / mass) / (dist * dist);
    const speed = Math.sqrt(Math.max(0, toward) * dist);
    const body = new Mass(
      mass,
      color,
      [Math.cos(ang) * dist, Math.sin(ang) * dist, 0],
      [-Math.sin(ang) * speed, Math.cos(ang) * speed, 0],
    );
    body.charge = q;
    body.reflectivity = 0.4;
    bodies.push(body);
  }
  const left = new Mass(3000, [255, 70, 110, 255], [-28, 52, 0], [0, 0.12, 0]);
  const right = new Mass(3000, [255, 70, 110, 255], [28, 52, 0], [0, 0.12, 0]);
  left.charge = 2;
  right.charge = 2;
  bodies.push(left, right);
  const state = createUniverse(bodies, {
    ticksPerStep: 60,
    gravityConstant: G,
    coulombConstant: K,
  });
  state.shapes = [
    { type: "shape", kind: "plane", a: [0, -90, 0], b: [0, 1, 0], color: [0.16, 0.18, 0.22, 1], reflectivity: 0.08 },
    { type: "shape", kind: "disk", a: [-90, 0, 36], b: [0, 0, 1], r: 22, color: [0.95, 0.5, 0.15, 1], reflectivity: 0.2 },
    { type: "shape", kind: "box", a: [-20, 8, 48], b: [16, 16, 16], color: [0.3, 0.78, 0.38, 1], reflectivity: 0.15 },
    { type: "shape", kind: "capsule", a: [40, -28, 36], b: [40, 32, 36], r: 10, color: [0.3, 0.85, 0.92, 1], reflectivity: 0.2 },
    { type: "shape", kind: "cylinder", a: [100, -32, 28], b: [100, 36, 28], r: 12, color: [0.58, 0.36, 0.92, 1], reflectivity: 0.15 },
    { type: "shape", kind: "triangle", a: [20, 55, 20], b: [78, 70, 8], c: [36, 28, 52], color: [0.9, 0.9, 0.84, 1], reflectivity: 0.5 },
  ];
  return state;
}
