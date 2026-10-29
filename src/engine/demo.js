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
