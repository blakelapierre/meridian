const text = new TextEncoder();
const textOut = new TextDecoder();

function concat(parts) {
  let size = 0;
  for (const part of parts) size += part.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function head(major, length) {
  if (!Number.isInteger(length) || length < 0 || length > 0xffffffff) throw new Error("cbor length");
  if (length < 24) return Uint8Array.of((major << 5) | length);
  if (length < 256) return Uint8Array.of((major << 5) | 24, length);
  if (length < 65536) return Uint8Array.of((major << 5) | 25, length >> 8, length & 255);
  const out = new Uint8Array(5);
  out[0] = (major << 5) | 26;
  new DataView(out.buffer).setUint32(1, length);
  return out;
}

function compareBytes(a, b) {
  const count = Math.min(a.length, b.length);
  for (let i = 0; i < count; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export function encode(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("cbor float");
    if (value >= 0) return head(0, value);
    return head(1, -1 - value);
  }
  if (typeof value === "string") {
    const bytes = text.encode(value);
    return concat([head(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) return concat([head(2, value.length), value]);
  if (Array.isArray(value)) {
    const parts = value.map(encode);
    return concat([head(4, parts.length), ...parts]);
  }
  if (value && typeof value === "object") {
    const pairs = Object.keys(value).map((key) => [encode(key), encode(value[key])]);
    pairs.sort((a, b) => compareBytes(a[0], b[0]));
    return concat([head(5, pairs.length), ...pairs.flat()]);
  }
  throw new Error("cbor");
}

function read(bytes, view, offset) {
  const info = bytes[offset] & 31;
  const major = bytes[offset] >> 5;
  let cursor = offset + 1;
  let argument;
  if (info < 24) argument = info;
  else if (info === 24) argument = bytes[cursor++];
  else if (info === 25) {
    argument = view.getUint16(cursor);
    cursor += 2;
  } else if (info === 26) {
    argument = view.getUint32(cursor);
    cursor += 4;
  } else throw new Error("cbor length");
  if (major === 0) return { value: argument, offset: cursor };
  if (major === 1) return { value: -1 - argument, offset: cursor };
  if (major === 2) return { value: bytes.slice(cursor, cursor + argument), offset: cursor + argument };
  if (major === 3) return { value: textOut.decode(bytes.subarray(cursor, cursor + argument)), offset: cursor + argument };
  if (major === 4) {
    const value = [];
    for (let i = 0; i < argument; i++) {
      const item = read(bytes, view, cursor);
      value.push(item.value);
      cursor = item.offset;
    }
    return { value, offset: cursor };
  }
  if (major === 5) {
    const value = {};
    for (let i = 0; i < argument; i++) {
      const key = read(bytes, view, cursor);
      const item = read(bytes, view, key.offset);
      if (typeof key.value !== "string") throw new Error("cbor key");
      value[key.value] = item.value;
      cursor = item.offset;
    }
    return { value, offset: cursor };
  }
  throw new Error("cbor major");
}

export function decode(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return read(bytes, view, 0).value;
}
