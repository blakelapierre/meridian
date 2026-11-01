import { Mass } from "../engine/physics.js";
import { PLANET_RADIUS_M } from "./shell.js";

// Real G. The central mass is whatever makes the surface 9.81 m/s².
export const CAIRN_G = 6.6743e-11;
export const SURFACE_G = 9.81;
export const LOOSE_CAP = 12;

export function centralMass(radius = PLANET_RADIUS_M, g = SURFACE_G) {
  return g * radius * radius / CAIRN_G;
}

export function createPlanet(radius = PLANET_RADIUS_M) {
  const planet = new Mass(centralMass(radius), [40, 44, 52, 255], [0, 0, -radius], [0, 0, 0]);
  planet.size = 0;
  planet.collisionSize = 0;
  planet.policy = "separate";
  planet.pinned = true;
  planet.home = [0, 0, -radius];
  return planet;
}

// Put the pinned planet on a world and let tick write gravity. Tests that
// inject tangentGravity leave this off.
export function attachPlanet(state, radius = PLANET_RADIUS_M) {
  const planet = createPlanet(radius);
  state.universe.push(planet);
  state.planet = planet;
  state.gravityConstant = CAIRN_G;
  return planet;
}

export function pullAt(planet, gravityConstant, point) {
  const dx = planet.position[0] - point[0];
  const dy = planet.position[1] - point[1];
  const dz = planet.position[2] - point[2];
  const d2 = dx * dx + dy * dy + dz * dz || 1;
  const d = Math.sqrt(d2);
  const accel = gravityConstant * planet.mass / d2;
  return [dx / d * accel, dy / d * accel, dz / d * accel];
}

export function looseBodies(state) {
  return state.universe.filter((body) => body.loose);
}

export function throwStone(state, eye, dir, speed = 14) {
  const loose = looseBodies(state);
  while (loose.length >= LOOSE_CAP) {
    const oldest = loose.shift();
    const index = state.universe.indexOf(oldest);
    if (index >= 0) state.universe.splice(index, 1);
  }
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const stone = new Mass(1.2, [140, 136, 124, 255], eye.slice(), [
    dir[0] / len * speed,
    dir[1] / len * speed,
    dir[2] / len * speed,
  ]);
  stone.policy = "separate";
  stone.size = 0.14;
  stone.collisionSize = 0.14;
  stone.loose = true;
  stone.age = 0;
  state.universe.push(stone);
  return stone;
}

// Rest a loose mass on the shell. A settled stone stops, so a still camera can stay still.
export function settleLoose(state, heightAt = () => 0) {
  for (let i = state.universe.length - 1; i >= 0; i -= 1) {
    const body = state.universe[i];
    if (!body.loose) continue;
    body.age = (body.age || 0) + 1;
    const floor = heightAt(body.position[0], body.position[1]) || 0;
    if (body.position[2] < floor) {
      body.position[2] = floor;
      if (body.velocity[2] < 0) body.velocity[2] *= -0.15;
      if (Math.abs(body.velocity[2]) < 0.35) body.velocity[2] = 0;
      body.velocity[0] *= 0.5;
      body.velocity[1] *= 0.5;
      if (Math.hypot(body.velocity[0], body.velocity[1]) < 0.05) {
        body.velocity[0] = 0;
        body.velocity[1] = 0;
      }
    }
    const gone = body.age > 900 || body.position[2] < floor - 8;
    if (gone) state.universe.splice(i, 1);
  }
}
