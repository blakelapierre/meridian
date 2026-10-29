import { cameraBasis } from "../engine/cast.js";
import { ATLAS, SAND_TILE, WOOD_TILE, blitTexture, rectFor, sandTexture, woodTexture } from "./texture.js";

const MAX_SPHERES = 8;
const MAX_BOXES = 32;
const MAX_DIGS = 128;

const sphereData = new Float32Array(MAX_SPHERES * 4);
const sphereColor = new Float32Array(MAX_SPHERES * 4);
const boxMin = new Float32Array(MAX_BOXES * 4);
const boxMax = new Float32Array(MAX_BOXES * 4);
const boxColor = new Float32Array(MAX_BOXES * 4);
const digData = new Float32Array(MAX_DIGS * 4);
const RECT_SLOTS = 10;
const rectData = new Float32Array(RECT_SLOTS * 4);
const atlasData = new Uint8Array(ATLAS * ATLAS * 4);

function fail(canvas, reason) {
  canvas.dataset.gpuError = reason;
  return null;
}

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    compile.lastLog = log;
    return null;
  }
  return shader;
}

function texture(gl, width) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, null);
  return tex;
}

export function fitCanvas(canvas, scale = 1) {
  const boxW = canvas.clientWidth || window.innerWidth || 960;
  const boxH = canvas.clientHeight || window.innerHeight || 540;
  const fullW = Math.min(960, Math.max(1, Math.floor(boxW)));
  const fullH = Math.min(540, Math.max(1, Math.floor(boxH)));
  const width = Math.max(160, Math.min(fullW, Math.floor(fullW * scale)));
  const height = Math.max(90, Math.min(fullH, Math.floor(fullH * scale)));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

export function createGpuPainter(canvas) {
  let gl;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }
  if (!gl) return fail(canvas, "no context");
  gl.getExtension("EXT_color_buffer_float");
  const vert = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const frag = `#version 300 es
precision highp float;
uniform vec3 uOrigin;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uSun;
uniform vec4 uMiss;
uniform float uFov;
uniform float uAspect;
uniform float uPlane;
uniform vec2 uRes;
uniform int uSpheres;
uniform int uBoxes;
uniform int uDigs;
uniform vec4 uWork;
uniform float uTime;
uniform sampler2D uSphereTex;
uniform sampler2D uSphereColor;
uniform sampler2D uBoxMin;
uniform sampler2D uBoxMax;
uniform sampler2D uBoxColor;
uniform sampler2D uDigTex;
uniform sampler2D uTexRects;
uniform sampler2D uAtlas;
out vec4 fragColor;

vec3 tiled(int tile, vec2 uv, vec3 fallback) {
  vec4 rect = texelFetch(uTexRects, ivec2(tile, 0), 0);
  if (rect.w < 0.5) return fallback;
  float pad = 0.5 / ${ATLAS}.0;
  vec2 st = rect.xy + vec2(pad) + fract(uv) * (rect.z - pad * 2.0);
  return texture(uAtlas, st).rgb;
}

vec3 sphereAlbedo(vec3 n, int i, vec3 fallback) {
  float u = atan(n.z, n.x) * 0.15915494309189535 + 0.5;
  float v = asin(clamp(n.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5;
  return tiled(i, vec2(u, v), fallback);
}

bool sandPlane(vec3 ro, vec3 rd, out float t, out vec3 p) {
  if (rd.z > -1.0e-4) return false;
  t = -ro.z / rd.z;
  if (t < 0.02 || t > 400.0) return false;
  p = ro + rd * t;
  p.z = 0.0;
  return dot(p.xy, p.xy) <= 256.0 * 256.0;
}

bool columnAt(float ix, float iy) {
  for (int m = 0; m < 32; m++) {
    if (m >= uDigs) return false;
    vec4 other = texelFetch(uDigTex, ivec2(m, 0), 0);
    if (abs(other.x - ix) < 0.1 && abs(other.y - iy) < 0.1) return true;
  }
  return false;
}

bool cavity(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t, out vec3 p, out vec3 n) {
  float t0 = 0.0;
  float t1 = 1.0e30;
  int enterAxis = 2;
  int exitAxis = 2;
  float enterSign = 1.0;
  float exitSign = 1.0;
  for (int axis = 0; axis < 3; axis++) {
    float d = rd[axis];
    float o = ro[axis];
    if (abs(d) < 1.0e-8) {
      if (o < bmin[axis] || o > bmax[axis]) return false;
      continue;
    }
    float ta = (bmin[axis] - o) / d;
    float tb = (bmax[axis] - o) / d;
    float sa = -1.0;
    float sb = 1.0;
    if (ta > tb) {
      float swapT = ta;
      ta = tb;
      tb = swapT;
      float swapS = sa;
      sa = sb;
      sb = swapS;
    }
    if (ta > t0) {
      t0 = ta;
      enterAxis = axis;
      enterSign = sa;
    }
    if (tb < t1) {
      t1 = tb;
      exitAxis = axis;
      exitSign = sb;
    }
    if (t0 > t1) return false;
  }
  if (t1 < 0.02) return false;
  bool throughMouth = t0 > 0.02 && enterAxis == 2 && enterSign > 0.0;
  bool inside = t0 <= 0.02;
  if (!throughMouth && !inside) return false;
  if (exitAxis == 2 && exitSign > 0.0) return false;
  t = t1;
  p = ro + rd * t;
  if (exitAxis == 0) n = vec3(-exitSign, 0.0, 0.0);
  else if (exitAxis == 1) n = vec3(0.0, -exitSign, 0.0);
  else n = vec3(0.0, 0.0, -exitSign);
  return true;
}

bool boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t) {
  float tMin = 0.0;
  float tMax = 1.0e30;
  for (int axis = 0; axis < 3; axis++) {
    float d = rd[axis];
    float o = ro[axis];
    if (abs(d) < 1.0e-8) {
      if (o < bmin[axis] || o >= bmax[axis]) return false;
      continue;
    }
    float t1 = (bmin[axis] - o) / d;
    float t2 = (bmax[axis] - o) / d;
    if (t1 > t2) { float s = t1; t1 = t2; t2 = s; }
    tMin = max(tMin, t1);
    tMax = min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (tMax < 0.0) return false;
  t = tMin >= 0.0 ? tMin : tMax;
  return t >= 0.0;
}

bool sphereHit(vec3 ro, vec3 rd, vec4 sphere, out float t) {
  vec3 oc = sphere.xyz - ro;
  float b = dot(rd, oc);
  float c = dot(oc, oc) - sphere.w * sphere.w;
  float delta = b * b - c;
  if (delta < 0.0) return false;
  float root = sqrt(delta);
  t = b - root;
  if (t < 0.0) t = b + root;
  return t >= 0.0;
}

bool blocked(vec3 from, vec3 rd) {
  float t;
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= uBoxes) break;
    vec3 bmin = texelFetch(uBoxMin, ivec2(i, 0), 0).xyz;
    vec3 bmax = texelFetch(uBoxMax, ivec2(i, 0), 0).xyz;
    if (boxHit(from, rd, bmin, bmax, t) && t < 80.0) return true;
  }
  for (int i = 0; i < ${MAX_SPHERES}; i++) {
    if (i >= uSpheres) break;
    vec4 sphere = texelFetch(uSphereTex, ivec2(i, 0), 0);
    if (sphereHit(from, rd, sphere, t) && t < 80.0) return true;
  }
  return false;
}

vec3 skyColor(vec3 rd) {
  vec3 sun = normalize(uSun);
  float day = smoothstep(-0.02, 0.25, sun.z);
  float up = clamp(rd.z * 0.85 + 0.2, 0.0, 1.0);
  vec3 sky = mix(vec3(0.62, 0.68, 0.74), vec3(0.30, 0.50, 0.84), up);
  sky = mix(sky * 0.12, sky, day);
  float d = dot(rd, sun);
  float disc = smoothstep(0.99915, 0.99955, d);
  float glow = pow(max(d, 0.0), 220.0);
  return sky + vec3(1.0, 0.94, 0.72) * (disc * 3.0 + glow * 0.7) * day;
}

vec3 sunLit(vec3 p, vec3 n, vec3 albedo) {
  vec3 sun = normalize(uSun);
  float day = smoothstep(0.0, 0.2, sun.z);
  float ndotl = max(dot(n, sun), 0.0) * day;
  return albedo * (vec3(0.28, 0.30, 0.34) + vec3(1.05, 0.96, 0.84) * ndotl);
}

vec3 boxNormal(vec3 p, vec3 bmin, vec3 bmax) {
  vec3 q = (p - (bmin + bmax) * 0.5) / max((bmax - bmin) * 0.5, vec3(0.001));
  vec3 a = abs(q);
  if (a.x > a.y && a.x > a.z) return vec3(sign(q.x), 0.0, 0.0);
  if (a.y > a.z) return vec3(0.0, sign(q.y), 0.0);
  return vec3(0.0, 0.0, sign(q.z));
}

void main() {
  float uu = gl_FragCoord.x / uRes.x;
  float vv = 1.0 - gl_FragCoord.y / uRes.y;
  float halfAngle = tan(uFov * 0.008726646259971648) * uPlane;
  float px = (uu * 2.0 - 1.0) * uAspect * halfAngle;
  float py = (1.0 - vv * 2.0) * halfAngle;
  vec3 rd = normalize(uRight * px + uUp * py + uForward * uPlane);
  vec3 ro = uOrigin;
  vec3 accum = vec3(0.0);
  float thru = 1.0;
  for (int bounce = 0; bounce < 2; bounce++) {
    float bestT = 1.0e30;
    vec3 bestP = ro;
    vec3 bestN = vec3(0.0, 0.0, 1.0);
    vec3 bestRgb = uMiss.rgb;
    float bestRef = 0.0;
    bool found = false;
    float t;
    vec3 p;
    float sandT = 1.0e30;
    vec3 sandP = ro;
    bool sand = sandPlane(ro, rd, sandT, sandP);
    bool openMouth = false;
    float mouthFloor = 0.0;
    if (uDigs > 0) {
      ivec2 mouth = ivec2(floor(sandP.xy * 2.0));
      for (int n = 0; n < 32; n++) {
        if (n >= uDigs) break;
        vec4 dig = texelFetch(uDigTex, ivec2(n, 0), 0);
        if (sand && abs(dig.x - float(mouth.x)) < 0.1 && abs(dig.y - float(mouth.y)) < 0.1) {
          openMouth = true;
          mouthFloor = dig.z;
        }
        vec3 bmin = vec3(dig.x * 0.5, dig.y * 0.5, dig.z);
        vec3 bmax = vec3(bmin.x + 0.5, bmin.y + 0.5, 0.0);
        vec3 faceN;
        if (!cavity(ro, rd, bmin, bmax, t, p, faceN) || t <= 0.02 || t >= bestT) continue;
        bool floor = abs(faceN.z) > 0.5;
        if (!floor) {
          if (ro.z >= -0.05) continue;
          if (columnAt(dig.x - faceN.x, dig.y - faceN.y)) continue;
        }
        bestT = t;
        bestP = p;
        bestN = faceN;
        bestRgb = tiled(${SAND_TILE}, bestP.xy * 0.35, vec3(0.16, 0.13, 0.10)) * (floor ? 0.55 : 0.4);
        bestRef = 0.04;
        found = true;
      }
    }
    if (sand && openMouth && !found) {
      bestT = sandT;
      bestP = vec3(sandP.xy, mouthFloor);
      bestN = vec3(0.0, 0.0, 1.0);
      bestRgb = tiled(${SAND_TILE}, sandP.xy * 0.35, vec3(0.16, 0.13, 0.10)) * 0.55;
      bestRef = 0.04;
      found = true;
    } else if (sand && !openMouth && sandT < bestT) {
      bestT = sandT;
      bestP = sandP;
      bestN = vec3(0.0, 0.0, 1.0);
      bestRgb = tiled(${SAND_TILE}, sandP.xy * 0.35, vec3(0.55, 0.48, 0.32));
      bestRef = 0.2;
      found = true;
    }
    for (int i = 0; i < ${MAX_BOXES}; i++) {
      if (i >= uBoxes) break;
      vec3 bmin = texelFetch(uBoxMin, ivec2(i, 0), 0).xyz;
      vec3 bmax = texelFetch(uBoxMax, ivec2(i, 0), 0).xyz;
      if (!boxHit(ro, rd, bmin, bmax, t) || t <= 0.02 || t >= bestT) continue;
      bestT = t;
      bestP = ro + rd * t;
      bestN = boxNormal(bestP, bmin, bmax);
      vec4 col = texelFetch(uBoxColor, ivec2(i, 0), 0);
      vec2 woodUv = abs(bestN.z) > 0.5 ? bestP.xy : (abs(bestN.x) > 0.5 ? bestP.yz : bestP.xz);
      bestRgb = tiled(${WOOD_TILE}, woodUv * 0.5, col.rgb);
      bestRef = col.a;
      found = true;
    }
    for (int i = 0; i < ${MAX_SPHERES}; i++) {
      if (i >= uSpheres) break;
      vec4 sphere = texelFetch(uSphereTex, ivec2(i, 0), 0);
      if (!sphereHit(ro, rd, sphere, t) || t <= 0.02 || t >= bestT) continue;
      bestT = t;
      bestP = ro + rd * t;
      bestN = normalize(bestP - sphere.xyz);
      vec4 col = texelFetch(uSphereColor, ivec2(i, 0), 0);
      bestRgb = sphereAlbedo(bestN, i, col.rgb);
      bestRef = col.a;
      found = true;
    }
    if (rd.z < -0.001) {
      float waterT = (0.0 - ro.z) / rd.z;
      vec3 waterP = ro + rd * waterT;
      if (waterT > 0.02 && waterT < bestT && dot(waterP.xy, waterP.xy) > 256.0 * 256.0) {
        bestT = waterT;
        bestP = waterP;
        bestN = vec3(0.0, 0.0, 1.0);
        bestRgb = vec3(0.08, 0.22, 0.38);
        bestRef = 0.45;
        found = true;
      }
    }
    if (!found) {
      accum += thru * skyColor(rd);
      break;
    }
    if (dot(bestN, rd) > 0.0) bestN = -bestN;
    if (bounce == 0) bestRgb = sunLit(bestP, bestN, bestRgb);
    else {
      float nd = max(dot(bestN, normalize(uSun)), 0.0);
      bestRgb *= vec3(0.20, 0.22, 0.28) + vec3(1.08, 0.98, 0.86) * nd;
    }
    if (bounce == 0 && uWork.w > 0.5) {
      vec2 cell = uWork.xy;
      float rise = max(uWork.z, 0.08);
      float gt;
      float wide = rise < 0.4 ? 0.42 : 0.24;
      float deep = rise < 0.4 ? 0.42 : 0.08;
      vec3 bmin = vec3(cell.x - wide, cell.y - deep, 0.0);
      vec3 bmax = vec3(cell.x + wide, cell.y + deep, rise);
      bool piece = uWork.w > 3.5;
      bool rising = uWork.w < 1.5;
      vec3 tint = piece ? vec3(1.0, 0.72, 0.28) : vec3(0.2, 0.9, 1.0);
      if ((rising || piece) && boxHit(ro, rd, bmin, bmax, gt) && gt < bestT) {
        bestT = gt;
        bestP = ro + rd * gt;
        bestN = vec3(0.0, 0.0, 1.0);
        float band = 0.55 + 0.45 * sin(bestP.z * 16.0 - uTime * 8.0);
        float lip = smoothstep(rise - 0.12, rise, bestP.z);
        bestRgb = mix(tint * band, vec3(1.0, 0.95, 0.7), lip);
        bestRef = 0.0;
      } else {
        float dist = length(bestP.xy - cell);
        float ring = 0.28 + 0.05 * sin(uTime * 3.0);
        float mark = smoothstep(0.07, 0.0, abs(dist - ring));
        float pad = smoothstep(0.34, 0.08, dist);
        float scan = 0.55 + 0.45 * sin(uTime * 6.0 + dist * 20.0);
        bestRgb += tint * (mark * 0.95 + pad * 0.35 * scan);
      }
    }
    float mirror = bounce == 1 ? 0.0 : clamp(bestRef, 0.0, 1.0);
    accum += thru * bestRgb * (1.0 - mirror);
    thru *= mirror;
    if (thru <= 0.001) break;
    rd = normalize(reflect(rd, bestN));
    ro = bestP + bestN * 0.05;
  }
  fragColor = vec4(accum, 1.0);
}`;
  const vs = compile(gl, gl.VERTEX_SHADER, vert);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return fail(canvas, compile.lastLog || "shader");
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return fail(canvas, gl.getProgramInfoLog(program) || "link");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  let sphereTex;
  let sphereColorTex;
  let boxMinTex;
  let boxMaxTex;
  let boxColorTex;
  let digTex;
  let rectTex;
  let atlasTex;
  try {
    sphereTex = texture(gl, MAX_SPHERES);
    sphereColorTex = texture(gl, MAX_SPHERES);
    boxMinTex = texture(gl, MAX_BOXES);
    boxMaxTex = texture(gl, MAX_BOXES);
    boxColorTex = texture(gl, MAX_BOXES);
    digTex = texture(gl, MAX_DIGS);
    rectTex = texture(gl, RECT_SLOTS);
    atlasTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    blitTexture(atlasData, SAND_TILE, sandTexture());
    blitTexture(atlasData, WOOD_TILE, woodTexture());
    rectData.set(rectFor(SAND_TILE), SAND_TILE * 4);
    rectData.set(rectFor(WOOD_TILE), WOOD_TILE * 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlasData);
  } catch {
    return null;
  }
  const loc = (name) => gl.getUniformLocation(program, name);
  gl.useProgram(program);
  gl.uniform1i(loc("uSphereTex"), 0);
  gl.uniform1i(loc("uSphereColor"), 1);
  gl.uniform1i(loc("uBoxMin"), 2);
  gl.uniform1i(loc("uBoxMax"), 3);
  gl.uniform1i(loc("uBoxColor"), 4);
  gl.uniform1i(loc("uDigTex"), 5);
  gl.uniform1i(loc("uTexRects"), 6);
  gl.uniform1i(loc("uAtlas"), 7);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const upload = (unit, tex, width, data) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, 1, gl.RGBA, gl.FLOAT, data);
  };
  const boundTex = new Array(MAX_SPHERES);
  let atlasDirty = false;
  return {
    paint(scene) {
      sphereData.fill(0);
      sphereColor.fill(0);
      boxMin.fill(0);
      boxMax.fill(0);
      boxColor.fill(0);
      digData.fill(0);
      let spheres = 0;
      let boxes = 0;
      let digs = 0;
      for (const object of scene.objects) {
        if (object.type === "sphere" && spheres < MAX_SPHERES) {
          const at = spheres * 4;
          sphereData[at] = object.origin[0];
          sphereData[at + 1] = object.origin[1];
          sphereData[at + 2] = object.origin[2];
          sphereData[at + 3] = object.radius;
          sphereColor[at] = object.color[0];
          sphereColor[at + 1] = object.color[1];
          sphereColor[at + 2] = object.color[2];
          sphereColor[at + 3] = object.reflectivity || 0;
          if (object.texture) {
            rectData.set(rectFor(spheres), spheres * 4);
            if (boundTex[spheres] !== object.texture) {
              blitTexture(atlasData, spheres, object.texture);
              boundTex[spheres] = object.texture;
              atlasDirty = true;
            }
          } else {
            rectData[spheres * 4 + 3] = 0;
          }
          spheres += 1;
        } else if (object.type === "box" && boxes < MAX_BOXES) {
          const at = boxes * 4;
          boxMin.set(object.min, at);
          boxMax.set(object.max, at);
          boxColor.set(object.color, at);
          boxColor[at + 3] = object.reflectivity || 0;
          boxes += 1;
        } else if (object.type === "crust" && object.field) {
          const columns = new Map();
          for (const [key, sample] of object.field.overrides) {
            if (sample <= 0) continue;
            const [i, j, k] = key.split(",").map(Number);
            const bottom = k * 0.5;
            const id = `${i},${j}`;
            const prev = columns.get(id);
            if (prev === undefined || bottom < prev) columns.set(id, bottom);
          }
          for (const [id, bottom] of columns) {
            if (digs >= MAX_DIGS) break;
            const [i, j] = id.split(",").map(Number);
            const at = digs * 4;
            digData[at] = i;
            digData[at + 1] = j;
            digData[at + 2] = bottom;
            digData[at + 3] = 1;
            digs += 1;
          }
        }
      }
      const basis = cameraBasis(scene.camera);
      const miss = scene.miss || [0.45, 0.62, 0.85, 1];
      const sun = scene.sun || [0, 0, 1];
      gl.useProgram(program);
      gl.viewport(0, 0, canvas.width, canvas.height);
      upload(0, sphereTex, MAX_SPHERES, sphereData);
      upload(1, sphereColorTex, MAX_SPHERES, sphereColor);
      upload(2, boxMinTex, MAX_BOXES, boxMin);
      upload(3, boxMaxTex, MAX_BOXES, boxMax);
      upload(4, boxColorTex, MAX_BOXES, boxColor);
      upload(5, digTex, MAX_DIGS, digData);
      upload(6, rectTex, RECT_SLOTS, rectData);
      if (atlasDirty) {
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ATLAS, ATLAS, gl.RGBA, gl.UNSIGNED_BYTE, atlasData);
        atlasDirty = false;
      }
      gl.uniform3f(loc("uOrigin"), scene.camera.origin[0], scene.camera.origin[1], scene.camera.origin[2]);
      gl.uniform3f(loc("uForward"), basis.forward[0], basis.forward[1], basis.forward[2]);
      gl.uniform3f(loc("uRight"), basis.right[0], basis.right[1], basis.right[2]);
      gl.uniform3f(loc("uUp"), basis.up[0], basis.up[1], basis.up[2]);
      gl.uniform3f(loc("uSun"), sun[0], sun[1], sun[2]);
      gl.uniform4f(loc("uMiss"), miss[0], miss[1], miss[2], miss[3]);
      gl.uniform1f(loc("uFov"), scene.camera.fov);
      gl.uniform1f(loc("uAspect"), scene.camera.aspect);
      gl.uniform1f(loc("uPlane"), scene.camera.planeDistance);
      gl.uniform2f(loc("uRes"), canvas.width, canvas.height);
      gl.uniform1i(loc("uSpheres"), spheres);
      gl.uniform1i(loc("uBoxes"), boxes);
      gl.uniform1i(loc("uDigs"), digs);
      const work = scene.work;
      gl.uniform4f(loc("uWork"), work ? work.x : 0, work ? work.y : 0, work ? work.height : 0, work ? work.mode : 0);
      gl.uniform1f(loc("uTime"), scene.time || 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
  };
}
