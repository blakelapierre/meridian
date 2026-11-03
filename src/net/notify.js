// Packet notify layer for the unreliable `snap` channel (Batch 16).
//
// Idea from the Tribes/Torque networking model (Frohnmayer & Gift, "The TRIBES Engine Networking
// Model", GDC 2000; Torque3D is MIT): every unreliable packet carries a sequence number plus an
// ack of the newest sequence seen and a 32-bit window of earlier ones. The sender then learns, per
// packet, whether it arrived or was lost, and each kind of state decides for itself what to do
// about a loss (most-recent-state data resends only what is still current). Written fresh for
// Meridian; no Torque code is used.
//
//   frame: 0xC4, varint seq, varint ack, u32le ackBits, then items: kind u8, varint len, bytes.
//   ack = newest seq received (0 = none yet); bit i of ackBits = seq (ack - 1 - i) was received.
//   An item-less frame is a bare ack.
export const NOTIFY = 0xc4;
export const KIND = { pose: 1, state: 2 };
const WINDOW = 32;
const REORDER = 3; // a seq is lost once the peer has acked this many newer ones without it
const RING = 128;

export function createNotify() {
  return {
    seq: 0, // last seq we sent
    sent: new Map(), // seq -> { at, items, bytes }
    recvTop: 0, // newest seq received
    recvBits: 0, // window below recvTop
    ackDue: false,
    lastOutMs: -1e9,
    stats: { sent: 0, acked: 0, lost: 0, bytesOut: 0, bytesIn: 0, rtt: 0, loss: 0, packetsIn: 0 },
  };
}

function writeVarint(out, v) { v >>>= 0; while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; } out.push(v); }

// items: [{ kind, bytes, meta }]; meta comes back in the ack/loss callbacks.
export function wrap(n, items, nowMs) {
  n.seq += 1;
  const out = [NOTIFY];
  writeVarint(out, n.seq);
  writeVarint(out, n.recvTop);
  const b = n.recvBits >>> 0;
  out.push(b & 255, (b >>> 8) & 255, (b >>> 16) & 255, (b >>> 24) & 255);
  for (const item of items) { out.push(item.kind & 255); writeVarint(out, item.bytes.length); for (const x of item.bytes) out.push(x); }
  const bytes = Uint8Array.from(out);
  n.sent.set(n.seq, { at: nowMs, items: items.map((i) => ({ kind: i.kind, meta: i.meta })), size: bytes.length });
  if (n.sent.size > RING) n.sent.delete(n.sent.keys().next().value);
  n.ackDue = false;
  n.lastOutMs = nowMs;
  n.stats.sent += 1;
  n.stats.bytesOut += bytes.length;
  return bytes;
}

export function isNotify(bytes) { return bytes?.[0] === NOTIFY && bytes.length >= 7; }

// Returns { items, acked:[{seq, items, rtt}], lost:[{seq, items}] } or null when malformed.
export function unwrap(n, bytes, nowMs) {
  if (!isNotify(bytes)) return null;
  let at = 1;
  const varint = () => { let v = 0; let s = 0; for (;;) { if (at >= bytes.length) throw new Error("short"); const b = bytes[at++]; v += (b & 0x7f) * 2 ** s; if (b < 0x80) return v; s += 7; } };
  try {
    const seq = varint();
    const ack = varint();
    if (at + 4 > bytes.length) return null;
    const bits = (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
    at += 4;
    const items = [];
    while (at < bytes.length) {
      const kind = bytes[at++];
      const len = varint();
      if (at + len > bytes.length) return null;
      items.push({ kind, bytes: bytes.subarray(at, at + len) });
      at += len;
    }
    n.stats.bytesIn += bytes.length;
    n.stats.packetsIn += 1;
    // Record what we received, for our next header.
    if (seq > n.recvTop) {
      const shift = seq - n.recvTop;
      const old = n.recvTop ? (shift < WINDOW ? (n.recvBits << shift) >>> 0 : 0) : 0;
      const topBit = n.recvTop && shift <= WINDOW ? (1 << (shift - 1)) >>> 0 : 0;
      n.recvBits = (old | topBit) >>> 0;
      n.recvTop = seq;
    } else if (seq < n.recvTop && n.recvTop - seq <= WINDOW) {
      n.recvBits = (n.recvBits | (1 << (n.recvTop - seq - 1))) >>> 0;
    } else if (seq === n.recvTop) {
      return { items: [], acked: [], lost: [], dup: true };
    }
    if (items.length) n.ackDue = true;
    return { items, ...settle(n, ack, bits, nowMs) };
  } catch {
    return null;
  }
}

function settle(n, ack, bits, nowMs) {
  const acked = [];
  const lost = [];
  if (!ack) return { acked, lost };
  const got = (s) => s === ack || (s < ack && ack - s <= WINDOW && ((bits >>> (ack - s - 1)) & 1) === 1);
  for (const [s, rec] of [...n.sent]) {
    if (s > ack) continue;
    if (got(s)) {
      const rtt = nowMs - rec.at;
      n.stats.rtt = n.stats.rtt ? n.stats.rtt * 0.875 + rtt * 0.125 : rtt;
      n.stats.acked += 1;
      n.stats.loss *= 0.97;
      acked.push({ seq: s, items: rec.items, rtt });
      n.sent.delete(s);
    } else if (ack - s >= REORDER) {
      n.stats.lost += 1;
      n.stats.loss = n.stats.loss * 0.97 + 0.03;
      lost.push({ seq: s, items: rec.items });
      n.sent.delete(s);
    }
  }
  return { acked, lost };
}

// A receiver with nothing of its own to send still owes an ack now and then.
export function bareAckDue(n, nowMs, gapMs = 100) {
  return n.ackDue && nowMs - n.lastOutMs >= gapMs;
}

export function notifyStats(n) {
  const s = n.stats;
  return { sent: s.sent, acked: s.acked, lost: s.lost, loss: s.loss, rtt: s.rtt, bytesOut: s.bytesOut, bytesIn: s.bytesIn, inFlight: n.sent.size };
}
