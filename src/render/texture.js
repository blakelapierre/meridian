export const ATLAS = 1024;
export const TEX_TILE = 128;
export const ATLAS_TILES = ATLAS / TEX_TILE;
export const SAND_TILE = 8;
export const WOOD_TILE = 9;

export function makeTexture(width, height, fill) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = fill(x, y, width, height);
      const i = (y * width + x) * 4;
      data[i] = px[0];
      data[i + 1] = px[1];
      data[i + 2] = px[2];
      data[i + 3] = px.length > 3 ? px[3] : 255;
    }
  }
  return { width, height, data, revision: 0 };
}

function texHash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function texNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const a = texHash(x0, y0);
  const b = texHash(x0 + 1, y0);
  const c = texHash(x0, y0 + 1);
  const d = texHash(x0 + 1, y0 + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function rectFor(tile) {
  const col = tile % ATLAS_TILES;
  const row = (tile / ATLAS_TILES) | 0;
  return [col / ATLAS_TILES, row / ATLAS_TILES, 1 / ATLAS_TILES, 1];
}

export function blitTexture(atlas, tile, tex) {
  const col = tile % ATLAS_TILES;
  const row = (tile / ATLAS_TILES) | 0;
  const x0 = col * TEX_TILE;
  const y0 = row * TEX_TILE;
  for (let y = 0; y < TEX_TILE; y++) {
    const sy = Math.min(tex.height - 1, (y * tex.height / TEX_TILE) | 0);
    const rowOff = (y0 + y) * ATLAS;
    const srcRow = sy * tex.width;
    for (let x = 0; x < TEX_TILE; x++) {
      const sx = Math.min(tex.width - 1, (x * tex.width / TEX_TILE) | 0);
      const si = (srcRow + sx) * 4;
      const di = (rowOff + x0 + x) * 4;
      atlas[di] = tex.data[si];
      atlas[di + 1] = tex.data[si + 1];
      atlas[di + 2] = tex.data[si + 2];
      atlas[di + 3] = tex.data[si + 3];
    }
  }
}

let sand;
let wood;
let dummy;

export function sandTexture() {
  if (!sand) {
    sand = makeTexture(128, 128, (x, y) => {
      const grain = texNoise(x / 9, y / 9);
      const speckle = texNoise(x / 3, y / 3);
      const mix = grain * 0.75 + speckle * 0.25;
      return [118 + mix * 90, 96 + mix * 70, 58 + mix * 36, 255];
    });
  }
  return sand;
}

export function woodTexture() {
  if (!wood) {
    wood = makeTexture(128, 128, (x, y) => {
      const ring = 0.5 + 0.5 * Math.sin(x * 0.45 + texNoise(x / 12, y / 20) * 3);
      return [78 + ring * 70, 48 + ring * 36, 24 + ring * 16, 255];
    });
  }
  return wood;
}

export function dummyTexture() {
  if (!dummy) {
    dummy = makeTexture(128, 128, (x, y, w, h) => {
      const u = x / w - 0.5;
      const v = y / h - 0.5;
      const ring = Math.floor(Math.hypot(u, v) * 8) % 2 === 0;
      return ring ? [214, 42, 32, 255] : [236, 214, 176, 255];
    });
  }
  return dummy;
}
