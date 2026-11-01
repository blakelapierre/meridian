// Sphere octree from blakelapierre/nbody-raycaster@6506c5e.
// It sorts bodies and answers ray queries. It does not approximate forces.

export const RAY_OCTREE_AT = 32;
export const GPU_TREE_AT = 64;
export const OCTREE_MIN_HALF = 4;
export const MAX_OCTREE_BODIES = 8192;
export const MAX_OCTREE_NODES = 32768;
export const MAX_GPU_NODES = 2048;

const bodyX = new Float64Array(MAX_OCTREE_BODIES);
const bodyY = new Float64Array(MAX_OCTREE_BODIES);
const bodyZ = new Float64Array(MAX_OCTREE_BODIES);
const bodyM = new Float64Array(MAX_OCTREE_BODIES);
const bodyR = new Float64Array(MAX_OCTREE_BODIES);
const bodyIdx = new Int32Array(MAX_OCTREE_BODIES);
const sortTmp = new Int32Array(MAX_OCTREE_BODIES);
const rayObjs = new Array(MAX_OCTREE_BODIES);
const nodeX = new Float64Array(MAX_OCTREE_NODES);
const nodeY = new Float64Array(MAX_OCTREE_NODES);
const nodeZ = new Float64Array(MAX_OCTREE_NODES);
const nodeHalf = new Float64Array(MAX_OCTREE_NODES);
const nodeMass = new Float64Array(MAX_OCTREE_NODES);
const nodeComX = new Float64Array(MAX_OCTREE_NODES);
const nodeComY = new Float64Array(MAX_OCTREE_NODES);
const nodeComZ = new Float64Array(MAX_OCTREE_NODES);
const nodeRad = new Float64Array(MAX_OCTREE_NODES);
const nodeStart = new Int32Array(MAX_OCTREE_NODES);
const nodeLen = new Int32Array(MAX_OCTREE_NODES);
const nodeChild = new Int32Array(MAX_OCTREE_NODES);
const nodeIds = new Int16Array(MAX_OCTREE_NODES * 8);
const octStack = new Int32Array(MAX_OCTREE_NODES);
const order = [];

export const gpuNodeData = new Float32Array(MAX_GPU_NODES * 16);
let nodeN = 0;

export function gpuNodeCount() {
  return nodeN;
}

function buildOctree(n) {
  nodeN = 0;
  if (n < 1) return -1;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = bodyX[i];
    const y = bodyY[i];
    const z = bodyZ[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    bodyIdx[i] = i;
  }
  const root = nodeN++;
  nodeHalf[root] = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 1;
  nodeX[root] = (minX + maxX) / 2;
  nodeY[root] = (minY + maxY) / 2;
  nodeZ[root] = (minZ + maxZ) / 2;
  nodeStart[root] = 0;
  nodeLen[root] = n;
  nodeChild[root] = -1;
  const stack = [root];
  while (stack.length) {
    const id = stack.pop();
    if (nodeLen[id] <= 8 || nodeHalf[id] < OCTREE_MIN_HALF || nodeN + 8 > MAX_OCTREE_NODES) continue;
    const h = nodeHalf[id] / 2;
    const base = nodeN;
    nodeChild[id] = base;
    for (let k = 0; k < 8; k++) {
      const c = nodeN++;
      nodeHalf[c] = h;
      nodeChild[c] = -1;
      nodeLen[c] = 0;
      nodeX[c] = nodeX[id] + (k & 1 ? h : -h);
      nodeY[c] = nodeY[id] + (k & 2 ? h : -h);
      nodeZ[c] = nodeZ[id] + (k & 4 ? h : -h);
    }
    const st = nodeStart[id];
    const len = nodeLen[id];
    const counts = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < len; i++) {
      const bi = bodyIdx[st + i];
      const oct = (bodyX[bi] >= nodeX[id] ? 1 : 0)
        | (bodyY[bi] >= nodeY[id] ? 2 : 0)
        | (bodyZ[bi] >= nodeZ[id] ? 4 : 0);
      counts[oct] += 1;
    }
    let run = st;
    for (let k = 0; k < 8; k++) {
      nodeStart[base + k] = run;
      nodeLen[base + k] = counts[k];
      run += counts[k];
    }
    const fill = counts.slice();
    for (let k = 0; k < 8; k++) fill[k] = nodeStart[base + k] - st;
    for (let i = 0; i < len; i++) {
      const bi = bodyIdx[st + i];
      const oct = (bodyX[bi] >= nodeX[id] ? 1 : 0)
        | (bodyY[bi] >= nodeY[id] ? 2 : 0)
        | (bodyZ[bi] >= nodeZ[id] ? 4 : 0);
      sortTmp[st + fill[oct]] = bi;
      fill[oct] += 1;
    }
    for (let i = 0; i < len; i++) bodyIdx[st + i] = sortTmp[st + i];
    for (let k = 0; k < 8; k++) {
      if (nodeLen[base + k] > 0) stack.push(base + k);
    }
  }
  order.length = 0;
  const walk = [root];
  while (walk.length) {
    const id = walk.pop();
    order.push(id);
    const base = nodeChild[id];
    if (base >= 0) {
      for (let k = 0; k < 8; k++) {
        if (nodeLen[base + k] > 0) walk.push(base + k);
      }
    }
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const base = nodeChild[id];
    let mass = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let rad = 0;
    if (base < 0) {
      for (let j = 0; j < nodeLen[id]; j++) {
        const bi = bodyIdx[nodeStart[id] + j];
        const mm = bodyM[bi];
        mass += mm;
        cx += bodyX[bi] * mm;
        cy += bodyY[bi] * mm;
        cz += bodyZ[bi] * mm;
        if (bodyR[bi] > rad) rad = bodyR[bi];
      }
    } else {
      for (let k = 0; k < 8; k++) {
        if (nodeLen[base + k] <= 0) continue;
        const c = base + k;
        mass += nodeMass[c];
        cx += nodeComX[c] * nodeMass[c];
        cy += nodeComY[c] * nodeMass[c];
        cz += nodeComZ[c] * nodeMass[c];
        if (nodeRad[c] > rad) rad = nodeRad[c];
      }
    }
    nodeMass[id] = mass;
    nodeRad[id] = rad;
    nodeComX[id] = mass ? cx / mass : nodeX[id];
    nodeComY[id] = mass ? cy / mass : nodeY[id];
    nodeComZ[id] = mass ? cz / mass : nodeZ[id];
  }
  for (let id = 0; id < nodeN; id++) {
    if (nodeChild[id] >= 0) continue;
    const st = nodeStart[id];
    const len = nodeLen[id] < 8 ? nodeLen[id] : 8;
    for (let k = 0; k < len; k++) nodeIds[id * 8 + k] = bodyIdx[st + k];
  }
  return root;
}

function rayAabb(ox, oy, oz, dx, dy, dz, cx, cy, cz, h, limit) {
  let tmin = 0;
  let tmax = limit;
  const origin = [ox, oy, oz];
  const dir = [dx, dy, dz];
  const center = [cx, cy, cz];
  for (let axis = 0; axis < 3; axis++) {
    const d = dir[axis];
    const minB = center[axis] - h;
    const maxB = center[axis] + h;
    if (Math.abs(d) < 1e-12) {
      if (origin[axis] < minB || origin[axis] > maxB) return false;
      continue;
    }
    let t1 = (minB - origin[axis]) / d;
    let t2 = (maxB - origin[axis]) / d;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return tmax >= 0 && tmin < limit;
}

function indexSpheres(objects) {
  let n = 0;
  for (let i = 0; i < objects.length; i++) {
    const object = objects[i];
    if (!object || object.type !== "sphere") continue;
    if (n >= MAX_OCTREE_BODIES) return -1;
    const p = object.origin;
    bodyX[n] = p[0];
    bodyY[n] = p[1];
    bodyZ[n] = p[2];
    bodyM[n] = 1;
    bodyR[n] = object.radius;
    rayObjs[n] = object;
    n += 1;
  }
  if (n < RAY_OCTREE_AT) return -1;
  return buildOctree(n);
}

let heldObjects = null;
let heldRoot = -1;

export function raySphereRoot(objects) {
  if (heldObjects === objects) return heldRoot;
  if (heldObjects) return -1;
  return indexSpheres(objects);
}

export function holdRayObjects(objects, fn) {
  const prevObjects = heldObjects;
  const prevRoot = heldRoot;
  heldObjects = objects;
  heldRoot = indexSpheres(objects);
  try {
    return fn();
  } finally {
    heldObjects = prevObjects;
    heldRoot = prevObjects ? indexSpheres(prevObjects) : prevRoot;
  }
}

export function visitRayTree(origin, direction, root, test) {
  if (root < 0) return null;
  let best = null;
  let bestT = Infinity;
  const ox = origin[0];
  const oy = origin[1];
  const oz = origin[2];
  const dx = direction[0];
  const dy = direction[1];
  const dz = direction[2];
  let sp = 0;
  octStack[sp++] = root;
  while (sp > 0) {
    const id = octStack[--sp];
    const h = nodeHalf[id] + nodeRad[id];
    if (!rayAabb(ox, oy, oz, dx, dy, dz, nodeX[id], nodeY[id], nodeZ[id], h, bestT)) continue;
    const child = nodeChild[id];
    if (child < 0) {
      const st = nodeStart[id];
      const len = nodeLen[id];
      for (let k = 0; k < len; k++) {
        const hit = test(rayObjs[bodyIdx[st + k]]);
        if (hit && hit.t >= 0 && hit.t < bestT) {
          best = hit;
          bestT = hit.t;
        }
      }
    } else {
      for (let k = 0; k < 8; k++) {
        if (nodeLen[child + k] > 0 && sp < octStack.length) octStack[sp++] = child + k;
      }
    }
  }
  return best;
}

export function packGpuNodes(sphereData, count) {
  if (count < 1 || count > MAX_OCTREE_BODIES) return false;
  for (let i = 0; i < count; i++) {
    bodyX[i] = sphereData[i * 4];
    bodyY[i] = sphereData[i * 4 + 1];
    bodyZ[i] = sphereData[i * 4 + 2];
    bodyR[i] = sphereData[i * 4 + 3];
    bodyM[i] = 1;
  }
  const root = buildOctree(count);
  if (root < 0 || nodeN > MAX_GPU_NODES || nodeN < 1) return false;
  for (let id = 0; id < nodeN; id++) {
    if (nodeChild[id] < 0 && nodeLen[id] > 8) return false;
  }
  for (let id = 0; id < nodeN; id++) {
    const o = id * 16;
    const ids = id * 8;
    gpuNodeData[o] = nodeX[id];
    gpuNodeData[o + 1] = nodeY[id];
    gpuNodeData[o + 2] = nodeZ[id];
    gpuNodeData[o + 3] = nodeHalf[id] + nodeRad[id];
    gpuNodeData[o + 4] = nodeChild[id];
    gpuNodeData[o + 5] = nodeLen[id];
    gpuNodeData[o + 6] = nodeChild[id] < 0 ? nodeIds[ids] : 0;
    gpuNodeData[o + 7] = nodeChild[id] < 0 ? nodeIds[ids + 1] : 0;
    gpuNodeData[o + 8] = nodeChild[id] < 0 ? nodeIds[ids + 2] : 0;
    gpuNodeData[o + 9] = nodeChild[id] < 0 ? nodeIds[ids + 3] : 0;
    gpuNodeData[o + 10] = nodeChild[id] < 0 ? nodeIds[ids + 4] : 0;
    gpuNodeData[o + 11] = nodeChild[id] < 0 ? nodeIds[ids + 5] : 0;
    gpuNodeData[o + 12] = nodeChild[id] < 0 ? nodeIds[ids + 6] : 0;
    gpuNodeData[o + 13] = nodeChild[id] < 0 ? nodeIds[ids + 7] : 0;
  }
  return true;
}
