export const LINE_RANGE_M = 40;

export function startBolt(eye, dir, speed = 80) {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return {
    position: eye.slice(),
    velocity: [dir[0] / len * speed, dir[1] / len * speed, dir[2] / len * speed],
    age: 0,
  };
}

export function stepBolt(bolt, dt, gravity = 9.81, wind = null) {
  if (wind) {
    bolt.velocity[0] += wind[0] * dt;
    bolt.velocity[1] += (wind[1] || 0) * dt;
  }
  bolt.velocity[2] -= gravity * dt;
  bolt.position[0] += bolt.velocity[0] * dt;
  bolt.position[1] += bolt.velocity[1] * dt;
  bolt.position[2] += bolt.velocity[2] * dt;
  bolt.age += dt;
  return bolt;
}

export function penFactor(armor = 0, pen = 1) {
  if (armor <= 0) return 1;
  return Math.max(0.2, 1 - armor / (armor + pen * 10));
}

export function boltHit(bolt, point, radius = 0.8) {
  return Math.hypot(bolt.position[0] - point[0], bolt.position[1] - point[1], bolt.position[2] - point[2]) <= radius;
}
