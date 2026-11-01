import { decode, encode } from "./cbor.js";
import { canonical } from "./chain.js";
import { exportKey, importKey, packFrame, packetValid, signBytes, unpackFrame } from "../net/identity.js";

export const SHEET = 15;

export function memoryStore(seed = {}) {
  const data = { ...seed };
  return {
    get: (key) => (key in data ? data[key] : null),
    set: (key, value) => {
      data[key] = value;
    },
    keys: () => Object.keys(data),
    drop: (key) => {
      delete data[key];
    },
  };
}

export function browserStore() {
  try {
    if (typeof localStorage === "undefined") return memoryStore();
    localStorage.getItem("meridian-probe");
  } catch {
    return memoryStore();
  }
  return {
    get: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // A full disk must not stop the keeper from linking.
      }
    },
    keys: () => {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key) out.push(key);
        }
      } catch {
        return out;
      }
      return out;
    },
    drop: (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // A locked store still lets this boot run.
      }
    },
  };
}

export function forgetKept(store) {
  if (!store?.keys || !store?.drop) return 0;
  const keys = store.keys().filter((key) => String(key).startsWith("meridian-"));
  for (const key of keys) store.drop(key);
  return keys.length;
}

function round(value, scale = 100) {
  return Math.round((value || 0) * scale);
}

export function bytesHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexBytes(text) {
  const hex = String(text || "");
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function saveIdentity(store, identity, slot = "self") {
  store.set(`meridian-id-${slot}`, exportKey(identity));
}

export function loadIdentity(store, slot = "self") {
  return importKey(store.get(`meridian-id-${slot}`) || "");
}

export function characterBody({
  at,
  yaw = 0,
  pitch = 0,
  skills = {},
  metal = 0,
  stone = 0,
  fiber = 0,
  sticks = 0,
  smokes = 0,
  notes = [],
  ground = [],
  seq = 1,
} = {}) {
  const trained = {};
  for (const [name, skill] of Object.entries(skills)) {
    const value = typeof skill === "number" ? skill : skill?.value || 0;
    trained[name] = round(value, 10);
  }
  return {
    seq: Math.max(1, Math.floor(seq)),
    at: [round(at?.[0], 100), round(at?.[1], 100), round(at?.[2], 100)],
    yaw: round(yaw, 1000),
    pitch: round(pitch, 1000),
    skills: trained,
    metal: Math.floor(metal),
    stone: Math.floor(stone),
    fiber: Math.floor(fiber),
    sticks: Math.floor(sticks),
    smokes: Math.floor(smokes),
    notes: notes.slice(-8).map((note) => String(note.line || note)).filter(Boolean),
    ground: ground.slice(-48).map((cell) => [
      Math.round((cell.point?.[0] || 0) * 10),
      Math.round((cell.point?.[1] || 0) * 10),
      String(cell.kind || "sand"),
    ]),
  };
}

export function encodeSheet(identity, body) {
  return packFrame(SHEET, signBytes(identity, encode(body)));
}

export function acceptSheet(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== SHEET) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  return { ok: true, body, pubkey: unpacked.pubkey, seq: body.seq || 0 };
}

export function saveSheet(store, body, slot = "self") {
  store.set(`meridian-sheet-${slot}`, JSON.stringify(body));
}

export function loadSheet(store, slot = "self") {
  const raw = store.get(`meridian-sheet-${slot}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function applyCharacter(sheet, { player, skills, yard, survey, notes } = {}) {
  if (!sheet) return false;
  if (player && sheet.at) {
    player.position[0] = sheet.at[0] / 100;
    player.position[1] = sheet.at[1] / 100;
    player.position[2] = (sheet.at[2] || 0) / 100;
  }
  for (const [name, value] of Object.entries(sheet.skills || {})) {
    if (!skills?.[name]) continue;
    skills[name].value = value / 10;
    skills[name].xp = value / 10;
  }
  if (yard) {
    if (sheet.metal != null) yard.metal = sheet.metal;
    if (sheet.stone != null) yard.stone = sheet.stone;
    if (sheet.fiber != null) yard.fiber = sheet.fiber;
    if (sheet.sticks != null) yard.sticks = sheet.sticks;
    if (sheet.smokes != null) yard.smokes = sheet.smokes;
  }
  if (notes && sheet.notes) {
    notes.length = 0;
    for (const line of sheet.notes) notes.push({ line, kind: "kept" });
  }
  if (survey && sheet.ground) {
    for (const [x, y, kind] of sheet.ground) {
      survey.ground.set(`kept:${x}:${y}`, {
        kind,
        point: [x / 10, y / 10, 0],
        depth: kind === "pit" ? -0.5 : 0,
      });
    }
  }
  return { yaw: (sheet.yaw || 0) / 1000, pitch: (sheet.pitch || 0) / 1000 };
}

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += ABC[(n >> 18) & 63];
    out += ABC[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ABC[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? ABC[n & 63] : "=";
  }
  return out;
}

export function base64ToBytes(text) {
  const clean = String(text || "").replace(/=+$/, "");
  const at = (char) => {
    const n = ABC.indexOf(char);
    return n < 0 ? 0 : n;
  };
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (at(clean[i]) << 18) | (at(clean[i + 1]) << 12) | (at(clean[i + 2]) << 6) | at(clean[i + 3]);
    out.push((n >> 16) & 255);
    if (i + 2 < clean.length) out.push((n >> 8) & 255);
    if (i + 3 < clean.length) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

function writeVar(bytes, value) {
  let n = value;
  while (n >= 128) {
    bytes.push((n & 127) | 128);
    n >>= 7;
  }
  bytes.push(n);
}

function readVar(bytes, offset) {
  let n = 0;
  let shift = 0;
  while (offset.index < bytes.length) {
    const byte = bytes[offset.index];
    offset.index += 1;
    n |= (byte & 127) << shift;
    if ((byte & 128) === 0) return n;
    shift += 7;
  }
  return n;
}

export function packPlate(plate) {
  const data = plate?.data;
  if (!data) return "";
  const bytes = [];
  let skip = 0;
  const pixels = data.length / 4;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const i = pixel * 4;
    if (data[i + 3] === 0) {
      skip += 1;
      continue;
    }
    writeVar(bytes, skip);
    skip = 0;
    bytes.push(data[i], data[i + 1], data[i + 2]);
  }
  writeVar(bytes, skip);
  return bytesToBase64(Uint8Array.from(bytes));
}

export function unpackPlate(plate, packed) {
  if (!plate || !packed) return false;
  const bytes = base64ToBytes(packed);
  if (!bytes.length) return false;
  plate.data.fill(0);
  const offset = { index: 0 };
  let pixel = 0;
  const pixels = plate.data.length / 4;
  while (offset.index < bytes.length && pixel < pixels) {
    const skip = readVar(bytes, offset);
    pixel += skip;
    if (offset.index >= bytes.length || pixel >= pixels) break;
    const i = pixel * 4;
    plate.data[i] = bytes[offset.index];
    plate.data[i + 1] = bytes[offset.index + 1];
    plate.data[i + 2] = bytes[offset.index + 2];
    plate.data[i + 3] = 255;
    offset.index += 3;
    pixel += 1;
  }
  plate.dirty = true;
  return true;
}

export function savePlate(store, plate, slot = "self") {
  store.set(`meridian-plate-${slot}`, packPlate(plate));
}

export function loadPlate(store, slot = "self") {
  return store.get(`meridian-plate-${slot}`);
}

// World save format. 1 (unversioned): crust keys on a 50 cm voxel grid. 2: 25 cm voxels plus wear.
// 3: frames are tagged with the wire format they are stored in (`frameWire`). Frames stay as verbatim
// v1 signed frames (hex), which every peer and old build can read. The archive may also keep a
// `replay` field: a base64 wire-v2 deflated pack of the same frames, rebuilt whenever `replayOf`
// no longer matches the frame list.
export const WORLD_VERSION = 3;
export const FRAME_WIRE = "v1-hex";
// Frame kinds whose payload carries voxel indices (terrain ops 1-4, terrain chain blocks 11).
const VOXEL_FRAME_KINDS = new Set([1, 2, 3, 4, 11]);

export function emptyWorld() {
  return { version: WORLD_VERSION, blocks: [], frames: [], sheets: {}, frameWire: FRAME_WIRE };
}

// v1 -> v2: each 50 cm voxel override becomes the 8 25 cm voxels it covers, with its signed distance
// halved (a sample is measured in voxel edges: 500 mm then, 250 mm now). Stored terrain frames and
// chain blocks name old indices and cannot be re-signed, so they are dropped; the expanded crust
// snapshot already holds their result. Wall/yard frames use the separate 0.5 m build grid and stay.
export function migrateWorld(world) {
  const version = world.version || 1;
  if (version >= WORLD_VERSION) return world;
  // v2 -> v3 only adds the frame wire tag; the frames themselves are already verbatim v1.
  if (version === 2) return { ...world, version: WORLD_VERSION, frameWire: FRAME_WIRE };
  const crust = [];
  for (const [key, sample] of world.crust || []) {
    const [i, j, k] = String(key).split(",").map(Number);
    if (![i, j, k].every(Number.isFinite)) continue;
    const half = Math.round(sample / 2);
    for (let a = 0; a < 2; a += 1) for (let b = 0; b < 2; b += 1) for (let c = 0; c < 2; c += 1) {
      crust.push([`${i * 2 + a},${j * 2 + b},${k * 2 + c}`, half]);
    }
  }
  const frames = (world.frames || []).filter((text) => !VOXEL_FRAME_KINDS.has(parseInt(String(text).slice(0, 2), 16)));
  return { ...world, version: WORLD_VERSION, blocks: [], frames, crust, frameWire: FRAME_WIRE };
}

export function loadWorld(store, key = "meridian-world") {
  const raw = store.get(key);
  if (!raw) return emptyWorld();
  try {
    const parsed = JSON.parse(raw);
    const world = migrateWorld({
      version: Number.isInteger(parsed.version) ? parsed.version : 1,
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      frames: Array.isArray(parsed.frames) ? parsed.frames : [],
      sheets: parsed.sheets && typeof parsed.sheets === "object" ? parsed.sheets : {},
      crust: Array.isArray(parsed.crust) ? parsed.crust : [],
      wear: typeof parsed.wear === "string" || Array.isArray(parsed.wear) ? parsed.wear : undefined,
      frameWire: typeof parsed.frameWire === "string" ? parsed.frameWire : undefined,
      replay: typeof parsed.replay === "string" ? parsed.replay : undefined,
      replayOf: typeof parsed.replayOf === "string" ? parsed.replayOf : undefined,
    });
    // Write a migrated save back at once so the old grid is never read again.
    if (parsed.version !== WORLD_VERSION) saveWorld(store, world, key);
    return world;
  } catch {
    return emptyWorld();
  }
}

export function saveWorld(store, world, key = "meridian-world") {
  store.set(key, JSON.stringify({ ...world, version: WORLD_VERSION, frameWire: FRAME_WIRE }));
}

export function packBlock(block) {
  const copy = canonical(block);
  return {
    ...copy,
    prev: bytesHex(copy.prev),
    state: bytesHex(copy.state),
    ops: copy.ops.map((op) => ({ ...op, before: bytesHex(op.before) })),
  };
}

export function unpackStoredBlock(stored) {
  return {
    ...stored,
    prev: hexBytes(stored.prev),
    state: hexBytes(stored.state),
    ops: stored.ops.map((op) => ({ ...op, before: hexBytes(op.before) })),
  };
}

export function chainBlocks(chain) {
  const list = [];
  const seen = new Set();
  let key = chain.tip;
  while (key && !seen.has(key)) {
    seen.add(key);
    const node = chain.blocks.get(key);
    if (!node) break;
    if (node.block.height > 0) list.push(node.block);
    key = node.parent;
  }
  return list.reverse();
}

export function keepSheet(world, accepted, frameHex) {
  const who = bytesHex(accepted.pubkey);
  const prev = world.sheets[who];
  if (prev && prev.seq > accepted.seq) return false;
  world.sheets[who] = { seq: accepted.seq, frame: frameHex };
  return true;
}

export function keepFrame(world, frame) {
  const text = bytesHex(frame);
  if (world.frames.includes(text)) return false;
  world.frames.push(text);
  if (world.frames.length > 160) world.frames.shift();
  return true;
}
