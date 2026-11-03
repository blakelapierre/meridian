// Per-field dirty masks for non-pose player state (Batch 16).
//
// After Torque's NetObject update masks (Torque3D, MIT; Tribes model, Frohnmayer & Gift 2000):
// state is split into fields with one bit each. A change marks the bit for every receiver; a send
// writes only marked fields; a lost packet re-marks just the fields it carried, and only if they
// have not changed (and been re-sent) since. Fresh JS for Meridian.
//
//   bytes: 0xD1, varint mask, then for each set bit (low to high) varint len + UTF-8 JSON value.
export const STATE = 0xd1;
export const FIELD = { stance: 1, wear: 2, held: 4, hp: 8 };
const NAMES = Object.keys(FIELD);
const enc = new TextEncoder();
const dec = new TextDecoder();

export function createState() {
  return { values: {}, versions: {}, receivers: new Map() };
}

// Set a field; marks it dirty for every receiver when the value really changed.
export function setField(s, name, value) {
  if (!(name in FIELD)) throw new Error(`unknown field ${name}`);
  if (JSON.stringify(s.values[name]) === JSON.stringify(value)) return false;
  s.values[name] = value;
  s.versions[name] = (s.versions[name] || 0) + 1;
  for (const r of s.receivers.values()) r.mask |= FIELD[name];
  return true;
}

export function addReceiver(s, id) {
  // A new receiver owes every known field (Torque's initial ghost update).
  let mask = 0;
  for (const name of NAMES) if (name in s.values) mask |= FIELD[name];
  const r = { mask, sentVersions: {} };
  s.receivers.set(id, r);
  return r;
}

export function dropReceiver(s, id) { s.receivers.delete(id); }

export function pendingMask(s, id) { return s.receivers.get(id)?.mask || 0; }

// Pack the dirty fields for one receiver. Returns { bytes, meta } (meta goes to onLoss) or null.
export function packFor(s, id) {
  const r = s.receivers.get(id) || addReceiver(s, id);
  if (!r.mask) return null;
  const out = [STATE];
  const mask = r.mask;
  let v = mask; while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; } out.push(v);
  const versions = {};
  for (const name of NAMES) {
    if (!(mask & FIELD[name])) continue;
    const body = enc.encode(JSON.stringify(s.values[name] ?? null));
    let n = body.length; while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n >>>= 7; } out.push(n);
    for (const x of body) out.push(x);
    versions[name] = s.versions[name] || 0;
    r.sentVersions[name] = versions[name];
  }
  r.mask = 0;
  return { bytes: Uint8Array.from(out), meta: { id, mask, versions } };
}

// The packet carrying `meta` was lost: re-mark fields still at the version it carried.
export function onLoss(s, meta) {
  const r = s.receivers.get(meta.id);
  if (!r) return 0;
  let back = 0;
  for (const [name, version] of Object.entries(meta.versions)) {
    if ((s.versions[name] || 0) === version && r.sentVersions[name] === version) back |= FIELD[name];
  }
  r.mask |= back;
  return back;
}

export function readState(bytes) {
  if (bytes?.[0] !== STATE) return null;
  let at = 1;
  const varint = () => { let v = 0; let sh = 0; for (;;) { if (at >= bytes.length) throw new Error("short"); const b = bytes[at++]; v += (b & 0x7f) * 2 ** sh; if (b < 0x80) return v; sh += 7; } };
  try {
    const mask = varint();
    const out = {};
    for (const name of NAMES) {
      if (!(mask & FIELD[name])) continue;
      const len = varint();
      if (at + len > bytes.length) return null;
      out[name] = JSON.parse(dec.decode(bytes.subarray(at, at + len)));
      at += len;
    }
    return out;
  } catch {
    return null;
  }
}
