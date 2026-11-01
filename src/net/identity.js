import { hashes, keygen, sign, verify } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { certifyShot } from "../sim/cert.js";

hashes.sha512 = sha512;

const text = new TextEncoder();
const textOut = new TextDecoder();

export function keyPhrase(identity) {
  return exportKey(identity).replace(/(.{4})/g, "$1 ").trim();
}

const RECOVERY = ["ash", "bay", "cairn", "dune", "eel", "fir", "gull", "helm", "iris", "jade", "kelp", "lime", "moss", "nail", "oak", "pine", "quartz", "reed", "salt", "tide", "urn", "vine", "well", "yew"];

export function recoveryPhrase(identity, count = 6) {
  const bytes = identity?.pubkey;
  if (!bytes?.length) return "";
  const words = [];
  for (let i = 0; i < count; i++) words.push(RECOVERY[bytes[i % bytes.length] % RECOVERY.length]);
  return words.join(" ");
}

export function rememberKey(book, identity) {
  const phrase = recoveryPhrase(identity);
  if (!book || !phrase || !identity?.secret || !identity?.pubkey) return book || null;
  book[phrase] = { secret: identity.secret.slice(), pubkey: identity.pubkey.slice() };
  return book;
}

export function restoreKey(book, phrase) {
  const found = book?.[phrase];
  if (!found?.secret || !found?.pubkey) return null;
  return { secret: found.secret.slice(), pubkey: found.pubkey.slice() };
}

function hexOf(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function packBook(book) {
  const packed = {};
  for (const [phrase, key] of Object.entries(book || {})) {
    if (!key?.secret || !key?.pubkey) continue;
    packed[phrase] = { secret: hexOf(key.secret), pubkey: hexOf(key.pubkey) };
  }
  return JSON.stringify(packed);
}

export function unpackBook(text) {
  let packed = null;
  try { packed = JSON.parse(String(text || "")); } catch { return {}; }
  if (!packed || typeof packed !== "object") return {};
  const book = {};
  for (const [phrase, key] of Object.entries(packed)) {
    const restored = importKey(`${key?.secret || ""}${key?.pubkey || ""}`);
    if (restored) book[phrase] = restored;
  }
  return book;
}

export function exportKey(identity) {
  const bytes = new Uint8Array(identity.secret.length + identity.pubkey.length);
  bytes.set(identity.secret, 0);
  bytes.set(identity.pubkey, identity.secret.length);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function importKey(hex) {
  const cleaned = String(hex || "").replace(/\s+/g, "");
  if (!cleaned || cleaned.length < 4 || cleaned.length % 2) return null;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const value = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(value)) return null;
    bytes[i] = value;
  }
  if (bytes.length < 64) return null;
  return { secret: bytes.slice(0, 32), pubkey: bytes.slice(32, 64) };
}

export function createIdentity() {
  const { secretKey, publicKey } = keygen();
  return { secret: secretKey, pubkey: publicKey };
}

export function encodeShot({ weapon, originCm, dir, tick, nonce }) {
  const name = text.encode(weapon);
  const bytes = new Uint8Array(1 + name.length + 12 + 6 + 8);
  bytes[0] = name.length;
  bytes.set(name, 1);
  const view = new DataView(bytes.buffer);
  let offset = 1 + name.length;
  for (const value of originCm) {
    view.setInt32(offset, value, true);
    offset += 4;
  }
  for (const value of dir) {
    view.setInt16(offset, value, true);
    offset += 2;
  }
  view.setUint32(offset, tick >>> 0, true);
  view.setUint32(offset + 4, nonce >>> 0, true);
  return bytes;
}

export function decodeShot(bytes) {
  const nameLength = bytes[0];
  const weapon = textOut.decode(bytes.subarray(1, 1 + nameLength));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 1 + nameLength;
  const originCm = [];
  for (let i = 0; i < 3; i++) {
    originCm.push(view.getInt32(offset, true));
    offset += 4;
  }
  const dir = [];
  for (let i = 0; i < 3; i++) {
    dir.push(view.getInt16(offset, true));
    offset += 2;
  }
  return {
    weapon,
    originCm,
    dir,
    tick: view.getUint32(offset, true),
    nonce: view.getUint32(offset + 4, true),
  };
}

export function signBytes(identity, bytes) {
  return { bytes, sig: sign(bytes, identity.secret), pubkey: identity.pubkey };
}

export function packetValid(packet) {
  return verify(packet.sig, packet.bytes, packet.pubkey);
}

export function signShot(identity, shot) {
  return signBytes(identity, encodeShot(shot));
}

export function signVote(identity, { tick, nonce, hit }) {
  const bytes = new Uint8Array(41);
  bytes.set(identity.pubkey.subarray(0, 32), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(32, tick >>> 0, true);
  view.setUint32(36, nonce >>> 0, true);
  bytes[40] = hit ? 1 : 0;
  return { ...signBytes(identity, bytes), hit: hit ? "hit" : "miss" };
}

export function certifySigned(ballots) {
  const open = [];
  for (const ballot of ballots) {
    if (!packetValid(ballot)) continue;
    open.push(ballot.hit);
  }
  return certifyShot(open);
}

export function packFrame(kind, packet) {
  const frame = new Uint8Array(1 + 32 + 64 + packet.bytes.length);
  frame[0] = kind;
  frame.set(packet.pubkey.subarray(0, 32), 1);
  frame.set(packet.sig, 33);
  frame.set(packet.bytes, 97);
  return frame;
}

export function unpackFrame(frame) {
  const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  const pubkey = bytes.subarray(1, 33);
  const sig = bytes.subarray(33, 97);
  const payload = bytes.subarray(97);
  return { kind: bytes[0], pubkey, sig, bytes: payload };
}
