import { blake3 } from "@noble/hashes/blake3.js";

export function bytesHash(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return [...blake3(joined)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function acceptHello(localHash, remoteHash) {
  if (!localHash || !remoteHash) return true;
  return localHash === remoteHash;
}
