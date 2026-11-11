// Star and planet integrated by the n-body tick. The vale stays fixed in the
// planet frame: spin is an orientation about a tilted axis (a sphere has no
// torque), and knights feel the same pairwise pull toward the planet's mass.

import { cross, dot3, tangentFrame, vadd, vnorm, vscale, type V3 } from "./math";
import { Mass, createUniverse, tick, type Universe } from "./nbody";
import { CENTER, SEA } from "./world";

export const G = 1;
export const SURFACE_G = 32;
export const ORBIT_PERIOD = 110;
export const SPIN_PERIOD = 42;
export const SPIN_TILT = 0.41;

const SPAWN = vnorm({ x: 0.62, y: 0.42, z: 0.66 });

export type HoldCosmos = {
  uni: Universe;
  star: Mass;
  planet: Mass;
  axis: V3;
  spin: number;
  bank: number;
  separation0: number;
};

export function createHoldCosmos(): HoldCosmos {
  const Mp = (SURFACE_G * SEA * SEA) / G;
  const a = 28 * SEA;
  const omega = (Math.PI * 2) / ORBIT_PERIOD;
  const mSum = (omega * omega * a * a * a) / G;
  const Ms = mSum - Mp;
  const rStar = (a * Mp) / mSum;
  const rPlanet = (a * Ms) / mSum;
  const vStar = omega * rStar;
  const vPlanet = omega * rPlanet;
  const { east } = tangentFrame(SPAWN);
  const star = new Mass(
    Ms,
    [255, 214, 140, 255],
    [SPAWN.x * rStar, SPAWN.y * rStar, SPAWN.z * rStar],
    [east.x * -vStar, east.y * -vStar, east.z * -vStar],
  );
  const planet = new Mass(
    Mp,
    [90, 120, 70, 255],
    [SPAWN.x * -rPlanet, SPAWN.y * -rPlanet, SPAWN.z * -rPlanet],
    [east.x * vPlanet, east.y * vPlanet, east.z * vPlanet],
  );
  star.policy = "separate";
  planet.policy = "separate";
  star.collisionSize = 1;
  planet.collisionSize = 1;
  const uni = createUniverse([star, planet], {
    ticksPerStep: 60,
    gravityConstant: G,
    coulombConstant: 0,
    speedlimit: 3e5,
  });
  const pole = vnorm(
    cross(
      { x: planet.position[0], y: planet.position[1], z: planet.position[2] },
      { x: planet.velocity[0], y: planet.velocity[1], z: planet.velocity[2] },
    ),
  );
  const axis = vnorm(vadd(vscale(pole, Math.cos(SPIN_TILT)), vscale(SPAWN, Math.sin(SPIN_TILT))));
  return { uni, star, planet, axis, spin: 0, bank: 0, separation0: a };
}

export function stepCosmos(c: HoldCosmos, dt: number) {
  c.bank += dt;
  const quantum = 1 / 60;
  const spinRate = (Math.PI * 2) / SPIN_PERIOD;
  let n = 0;
  while (c.bank >= quantum && n < 5) {
    tick(c.uni);
    c.spin += spinRate * quantum;
    c.bank -= quantum;
    n += 1;
  }
  if (n === 5) c.bank = 0;
}

function rodrigues(v: V3, axis: V3, ang: number): V3 {
  const co = Math.cos(ang);
  const si = Math.sin(ang);
  const d = dot3(axis, v);
  const cr = cross(axis, v);
  return {
    x: v.x * co + cr.x * si + axis.x * d * (1 - co),
    y: v.y * co + cr.y * si + axis.y * d * (1 - co),
    z: v.z * co + cr.z * si + axis.z * d * (1 - co),
  };
}

/** Sun direction in the planet frame, after the axial spin. */
export function sunOf(c: HoldCosmos): V3 {
  return rodrigues(
    vnorm({
      x: c.star.position[0] - c.planet.position[0],
      y: c.star.position[1] - c.planet.position[1],
      z: c.star.position[2] - c.planet.position[2],
    }),
    c.axis,
    -c.spin,
  );
}

/** Inward acceleration at a voxel point. Pair formula G*Mp*(center-pos)/r^3. */
export function pullInward(c: HoldCosmos, x: number, y: number, z: number): number {
  const dx = CENTER - x;
  const dy = CENTER - y;
  const dz = CENTER - z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (!(d2 > 1e-4)) return 0;
  const inv = (c.uni.gravityConstant * c.planet.mass) / (d2 * Math.sqrt(d2));
  return (d2 * inv) / Math.sqrt(d2);
}

export function separationOf(c: HoldCosmos): number {
  const dx = c.star.position[0] - c.planet.position[0];
  const dy = c.star.position[1] - c.planet.position[1];
  const dz = c.star.position[2] - c.planet.position[2];
  return Math.hypot(dx, dy, dz);
}
