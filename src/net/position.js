export function encodePosition({ tick, x, y, z }) {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, tick, true);
  view.setInt32(4, Math.round(x * 100), true);
  view.setInt32(8, Math.round(y * 100), true);
  view.setInt32(12, Math.round(z * 100), true);
  return buffer;
}

export function decodePosition(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    tick: view.getUint32(0, true),
    x: view.getInt32(4, true) / 100,
    y: view.getInt32(8, true) / 100,
    z: view.getInt32(12, true) / 100,
  };
}

export function acceptPosition(latest, packet) {
  const next = decodePosition(packet);
  if (latest && next.tick < latest.tick) return latest;
  return next;
}
