function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function coneRadians(weapon, speed, airborne) {
  let mrad = weapon.spreadMrad;
  if (speed >= 0.8) mrad *= weapon.moveSpread;
  if (airborne) mrad *= weapon.airSpread;
  return mrad / 1000;
}

function basis(forward) {
  const hint = Math.abs(forward[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const rx = forward[1] * hint[2] - forward[2] * hint[1];
  const ry = forward[2] * hint[0] - forward[0] * hint[2];
  const rz = forward[0] * hint[1] - forward[1] * hint[0];
  const scale = Math.hypot(rx, ry, rz);
  const right = [rx / scale, ry / scale, rz / scale];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { right, up };
}

export function shotDirection(forward, radians, seed) {
  const rand = mulberry32(seed);
  const radius = Math.tan(radians) * Math.sqrt(rand());
  const theta = rand() * Math.PI * 2;
  const { right, up } = basis(forward);
  const dir = [
    forward[0] + (right[0] * Math.cos(theta) + up[0] * Math.sin(theta)) * radius,
    forward[1] + (right[1] * Math.cos(theta) + up[1] * Math.sin(theta)) * radius,
    forward[2] + (right[2] * Math.cos(theta) + up[2] * Math.sin(theta)) * radius,
  ];
  const length = Math.hypot(dir[0], dir[1], dir[2]);
  return [dir[0] / length, dir[1] / length, dir[2] / length];
}

export function angularOffset(forward, direction) {
  const dot = forward[0] * direction[0] + forward[1] * direction[1] + forward[2] * direction[2];
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}
