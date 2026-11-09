// Pure jobs for a worker. Relative imports only, so a worker can load this without the page import map.
import { blake3 } from "../../vendor/noble/hashes/blake3.js?v=1";
import { paintRows } from "../engine/frame.js";

export function hashParts(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return [...blake3(joined)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function runJob(name, payload = {}) {
  if (name === "hash") return hashParts(payload.parts || []);
  if (name === "band") {
    const width = payload.width | 0;
    const y0 = payload.y0 | 0;
    const y1 = payload.y1 | 0;
    const full = paintRows(payload.scene, width, payload.height | 0, y0, y1);
    return full.slice(y0 * width * 4, y1 * width * 4);
  }
  throw new Error(`unknown job ${name}`);
}
