import type { V3 } from "./math";
import { FOV } from "./math";
import { WORLD_D, WORLD_H, WORLD_W, type World } from "./world";

export type DrawEnt = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  radius: number;
  kind: number;
  flash: number;
  selected: boolean;
  yaw: number;
  r: number;
  g: number;
  b: number;
};

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const TRACE = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uVox;
uniform vec3 uCam;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uRes;
uniform float uFov;
uniform vec3 uSun;
uniform float uTime;
uniform int uCount;
uniform vec4 uA[24];
uniform vec4 uB[24];
uniform vec4 uC[24];

const vec3 kPlanet = vec3(float(${WORLD_W}) * 0.5);

out vec4 fragColor;

float voxAt(ivec3 p) {
  if (p.x < 0 || p.y < 0 || p.z < 0 || p.x >= ${WORLD_W} || p.y >= ${WORLD_H} || p.z >= ${WORLD_D}) return 0.0;
  return floor(texelFetch(uVox, p, 0).r * 255.0 + 0.5);
}

bool brickOf(ivec3 cell, vec3 ro, vec3 rd, float maxDist, out float tHit, out vec3 nrm) {
  vec3 center = vec3(cell) + 0.5;
  vec3 radial = center - kPlanet;
  float rl = length(radial);
  if (rl < 1e-3) return false;
  radial /= rl;
  vec3 pole = abs(radial.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 east = cross(pole, radial);
  float el = length(east);
  east = el < 1e-4 ? vec3(1.0, 0.0, 0.0) : east / el;
  vec3 north = normalize(cross(radial, east));
  const float H = 0.78;
  vec3 o = vec3(dot(ro - center, east), dot(ro - center, north), dot(ro - center, radial));
  vec3 w = vec3(dot(rd, east), dot(rd, north), dot(rd, radial));
  vec3 invW = vec3(
    abs(w.x) < 1e-6 ? 1e8 : 1.0 / w.x,
    abs(w.y) < 1e-6 ? 1e8 : 1.0 / w.y,
    abs(w.z) < 1e-6 ? 1e8 : 1.0 / w.z
  );
  vec3 tA = (vec3(-H) - o) * invW;
  vec3 tB = (vec3(H) - o) * invW;
  vec3 tsm = min(tA, tB);
  vec3 tbg = max(tA, tB);
  float tN = max(max(tsm.x, tsm.y), tsm.z);
  float tF = min(min(tbg.x, tbg.y), tbg.z);
  if (tN > tF || tF < 0.02 || tN > maxDist || tN < 0.02) return false;
  tHit = tN;
  if (tsm.x >= tsm.y && tsm.x >= tsm.z) nrm = east * (w.x > 0.0 ? -1.0 : 1.0);
  else if (tsm.y >= tsm.z) nrm = north * (w.y > 0.0 ? -1.0 : 1.0);
  else nrm = radial * (w.z > 0.0 ? -1.0 : 1.0);
  return true;
}

vec3 brickFallback(vec3 axisN, ivec3 cell) {
  vec3 radial = vec3(cell) + 0.5 - kPlanet;
  float rl = length(radial);
  radial = rl < 1e-3 ? vec3(0.0, 1.0, 0.0) : radial / rl;
  vec3 pole = abs(radial.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 east = cross(pole, radial);
  float el = length(east);
  east = el < 1e-4 ? vec3(1.0, 0.0, 0.0) : east / el;
  vec3 north = normalize(cross(radial, east));
  float sr = dot(axisN, radial);
  float se = dot(axisN, east);
  float sn = dot(axisN, north);
  if (abs(sr) >= abs(se) && abs(sr) >= abs(sn)) return radial * (sr < 0.0 ? -1.0 : 1.0);
  if (abs(se) >= abs(sn)) return east * (se < 0.0 ? -1.0 : 1.0);
  return north * (sn < 0.0 ? -1.0 : 1.0);
}

bool dda(vec3 ro, vec3 rd, float maxDist, int maxSteps, out float tHit, out vec3 nrm, out float vid) {
  float t0 = 0.0;
  vec3 origin = ro;
  bool outside = ro.x < 0.0 || ro.y < 0.0 || ro.z < 0.0 || ro.x >= ${WORLD_W}.0 || ro.y >= ${WORLD_H}.0 || ro.z >= ${WORLD_D}.0;
  if (outside) {
    vec3 inv = vec3(
      abs(rd.x) < 1e-6 ? 1e8 : 1.0 / rd.x,
      abs(rd.y) < 1e-6 ? 1e8 : 1.0 / rd.y,
      abs(rd.z) < 1e-6 ? 1e8 : 1.0 / rd.z
    );
    vec3 bmin = vec3(0.02);
    vec3 bmax = vec3(${WORLD_W}.0 - 0.02, ${WORLD_H}.0 - 0.02, ${WORLD_D}.0 - 0.02);
    vec3 tA = (bmin - ro) * inv;
    vec3 tB = (bmax - ro) * inv;
    vec3 tsm = min(tA, tB);
    vec3 tbg = max(tA, tB);
    float tNear = max(max(tsm.x, tsm.y), tsm.z);
    float tFar = min(min(tbg.x, tbg.y), tbg.z);
    if (tNear > tFar || tFar < 0.0) return false;
    t0 = max(tNear, 0.0) + 0.04;
    if (t0 > maxDist) return false;
    origin = ro + rd * t0;
  }
  ivec3 mapPos = ivec3(floor(origin));
  ivec3 stepDir = ivec3(rd.x < 0.0 ? -1 : 1, rd.y < 0.0 ? -1 : 1, rd.z < 0.0 ? -1 : 1);
  vec3 delta = vec3(
    abs(rd.x) < 1e-5 ? 1e8 : abs(1.0 / rd.x),
    abs(rd.y) < 1e-5 ? 1e8 : abs(1.0 / rd.y),
    abs(rd.z) < 1e-5 ? 1e8 : abs(1.0 / rd.z)
  );
  vec3 side;
  side.x = (rd.x < 0.0 ? (origin.x - float(mapPos.x)) : (float(mapPos.x) + 1.0 - origin.x)) * delta.x;
  side.y = (rd.y < 0.0 ? (origin.y - float(mapPos.y)) : (float(mapPos.y) + 1.0 - origin.y)) * delta.y;
  side.z = (rd.z < 0.0 ? (origin.z - float(mapPos.z)) : (float(mapPos.z) + 1.0 - origin.z)) * delta.z;
  if (abs(rd.x) < 1e-5) { side.x = 1e8; stepDir.x = 0; }
  if (abs(rd.y) < 1e-5) { side.y = 1e8; stepDir.y = 0; }
  if (abs(rd.z) < 1e-5) { side.z = 1e8; stepDir.z = 0; }
  float dist = 0.0;
  vec3 mask = vec3(0.0);
  for (int i = 0; i < 112; i++) {
    if (i >= maxSteps || dist + t0 > maxDist) return false;
    if (mapPos.x < 0 || mapPos.y < 0 || mapPos.z < 0 || mapPos.x >= ${WORLD_W} || mapPos.y >= ${WORLD_H} || mapPos.z >= ${WORLD_D}) return false;
    float id = voxAt(mapPos);
    if (id > 0.5 && (dist > 0.001 || t0 > 0.0)) {
      float bt;
      vec3 bn;
      if (brickOf(mapPos, ro, rd, maxDist, bt, bn)) {
        tHit = bt;
        nrm = bn;
        vid = id;
        return true;
      }
      tHit = dist + t0;
      nrm = brickFallback(-vec3(stepDir) * mask, mapPos);
      vid = id;
      return true;
    }
    if (side.x <= side.y && side.x <= side.z) {
      dist = side.x;
      side.x += delta.x;
      mapPos.x += stepDir.x;
      mask = vec3(1.0, 0.0, 0.0);
    } else if (side.y <= side.z) {
      dist = side.y;
      side.y += delta.y;
      mapPos.y += stepDir.y;
      mask = vec3(0.0, 1.0, 0.0);
    } else {
      dist = side.z;
      side.z += delta.z;
      mapPos.z += stepDir.z;
      mask = vec3(0.0, 0.0, 1.0);
    }
  }
  return false;
}

float capHit(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra) {
  vec3 ba = pb - pa;
  vec3 oa = ro - pa;
  float baba = dot(ba, ba);
  float bard = dot(ba, rd);
  float baoa = dot(ba, oa);
  float rdoa = dot(rd, oa);
  float oaoa = dot(oa, oa);
  float a = baba - bard * bard;
  float b = baba * rdoa - baoa * bard;
  float c = baba * oaoa - baoa * baoa - ra * ra * baba;
  float h = b * b - a * c;
  if (h >= 0.0 && abs(a) > 1e-4) {
    float t = (-b - sqrt(h)) / a;
    float y = baoa + t * bard;
    if (t > 0.02 && y > 0.0 && y < baba) return t;
  }
  float best = -1.0;
  for (int k = 0; k < 2; k++) {
    vec3 c0 = k == 0 ? pa : pb;
    vec3 oc = ro - c0;
    float b2 = dot(rd, oc);
    float c2 = dot(oc, oc) - ra * ra;
    float h2 = b2 * b2 - c2;
    if (h2 > 0.0) {
      float t2 = -b2 - sqrt(h2);
      if (t2 > 0.02 && (best < 0.0 || t2 < best)) best = t2;
    }
  }
  return best;
}

vec3 albedoOf(float id, vec3 pos) {
  int k = int(id + 0.5);
  vec3 c = vec3(0.45);
  if (k == 1) c = vec3(0.34, 0.46, 0.22);
  else if (k == 2) c = vec3(0.46, 0.44, 0.40);
  else if (k == 3) c = vec3(0.40, 0.26, 0.14);
  else if (k == 4) c = vec3(0.74, 0.67, 0.52);
  else if (k == 5) c = vec3(0.55, 0.40, 0.20);
  else if (k == 6) c = vec3(0.16, 0.34, 0.40);
  else if (k == 7) c = vec3(0.72, 0.16, 0.14);
  else if (k == 8) c = vec3(0.62, 0.64, 0.68);
  else if (k == 9) c = vec3(0.20, 0.38, 0.16);
  else if (k == 10) c = vec3(0.50, 0.40, 0.26);
  else if (k == 11) c = vec3(0.62, 0.54, 0.36);
  else if (k == 12) c = vec3(1.0, 0.42, 0.12);
  else if (k == 13) c = vec3(0.34, 0.40, 0.32);
  else if (k == 14) c = vec3(0.72, 0.62, 0.28);
  float n = fract(sin(dot(floor(pos), vec3(12.9, 78.2, 45.1))) * 43758.5);
  return c * (0.90 + 0.12 * n);
}

float dayAmt() {
  return smoothstep(-0.12, 0.42, dot(uSun, normalize(uCam - kPlanet)));
}

vec3 sky(vec3 rd) {
  vec3 away = normalize(uCam - kPlanet);
  float day = dayAmt();
  float elev = dot(uSun, away);
  float h = clamp(dot(rd, away) * 0.55 + 0.42, 0.0, 1.0);
  vec3 zenith = mix(vec3(0.012, 0.016, 0.04), vec3(0.22, 0.34, 0.55), day);
  vec3 horizon = mix(vec3(0.05, 0.045, 0.07), vec3(0.93, 0.68, 0.44), day);
  float dusk = exp(-10.0 * elev * elev) * smoothstep(-0.4, 0.05, elev);
  horizon = mix(horizon, vec3(0.82, 0.30, 0.12), dusk * 0.85);
  vec3 col = mix(horizon, zenith, pow(h, 0.7));
  float sun = pow(max(dot(rd, uSun), 0.0), 220.0);
  col += vec3(1.0, 0.86, 0.55) * sun * smoothstep(-0.04, 0.12, elev);
  float star = step(0.994, fract(sin(dot(floor(rd * 26.0), vec3(27.1, 91.7, 13.3))) * 43758.5));
  col += vec3(0.75, 0.8, 0.95) * star * (1.0 - day) * step(0.25, h);
  return col;
}

float shadowOf(vec3 pos, vec3 n) {
  float ndl = dot(n, uSun);
  if (ndl <= 0.0) return 0.28;
  float t;
  vec3 nn;
  float id;
  vec3 ro = pos + n * 0.04 + uSun * 0.06;
  if (dda(ro, uSun, 22.0, 28, t, nn, id)) return 0.32;
  return 1.0;
}

vec3 shadeVoxel(vec3 pos, vec3 n, float id, vec3 rd) {
  vec3 alb = albedoOf(id, pos);
  int k = int(id + 0.5);
  if (k == 12) {
    float f = 0.75 + 0.25 * sin(uTime * 7.0 + pos.x * 3.0);
    return alb * (1.6 * f);
  }
  float ao = 0.62 + 0.38 * clamp(dot(n, normalize(pos - kPlanet)) * 0.5 + 0.5, 0.0, 1.0);
  float sh = shadowOf(pos, n);
  float ndl = max(dot(n, uSun), 0.0);
  float day = dayAmt();
  vec3 amb = mix(vec3(0.06, 0.07, 0.1), vec3(0.34, 0.30, 0.26), day);
  vec3 col = alb * ao * (amb + vec3(1.1, 0.95, 0.72) * ndl * sh);
  if (k == 7) col += alb * 0.35;
  if (k == 6) {
    vec3 refl = reflect(rd, n);
    float t2; vec3 n2; float id2;
    vec3 rc = sky(refl);
    if (dda(pos + n * 0.12, refl, 36.0, 32, t2, n2, id2)) {
      vec3 alb2 = albedoOf(id2, pos + refl * t2);
      float ndl2 = max(dot(normalize(n2), uSun), 0.0);
      rc = alb2 * (0.25 + 0.75 * ndl2);
    }
    col = mix(rc, vec3(0.10, 0.28, 0.36), 0.38);
  }
  return col;
}

vec3 entNormal(vec3 pos, vec3 pa, vec3 pb) {
  vec3 ba = pb - pa;
  float d = max(dot(ba, ba), 1e-4);
  float t = clamp(dot(pos - pa, ba) / d, 0.0, 1.0);
  vec3 c = pa + ba * t;
  return normalize(pos - c + vec3(1e-4, 0.0, 0.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;
  vec3 rd = normalize(uForward + uRight * uv.x * uFov + uUp * uv.y * uFov);
  float bestT = 96.0;
  int bestE = -1;
  vec4 bestA = vec4(0.0);
  vec4 bestB = vec4(0.0);
  vec4 bestC = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= uCount) break;
    float rad = fract(uA[i].w) * 8.0;
    float t = capHit(uCam, rd, uA[i].xyz, uB[i].xyz, max(rad, 0.04));
    if (t > 0.0 && t < bestT) {
      bestT = t;
      bestE = i;
      bestA = uA[i];
      bestB = uB[i];
      bestC = uC[i];
    }
  }
  float vt; vec3 vn; float vid;
  bool vh = dda(uCam, rd, min(bestT, 90.0), 96, vt, vn, vid);
  vec3 col;
  float fogT = 70.0;
  if (vh && vt < bestT) {
    vec3 pos = uCam + rd * vt;
    if (length(vn) < 0.1) vn = normalize(pos - kPlanet);
    vn = normalize(vn);
    col = shadeVoxel(pos, vn, vid, rd);
    fogT = vt;
  } else if (bestE >= 0) {
    vec3 pos = uCam + rd * bestT;
    vec3 pa = bestA.xyz;
    vec3 pb = bestB.xyz;
    vec3 n = entNormal(pos, pa, pb);
    float flash = fract(bestC.w);
    float selected = bestC.w > 1.5 ? 1.0 : 0.0;
    float yaw = bestB.w;
    int kind = int(floor(bestA.w));
    vec3 alb = bestC.xyz;
    if (kind <= 2) {
      vec3 upE = normalize((pa + pb) * 0.5 - kPlanet);
      vec3 pole = abs(upE.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 east = cross(pole, upE);
      float el = length(east);
      east = el < 1e-4 ? vec3(1.0, 0.0, 0.0) : east / el;
      vec3 north = normalize(cross(upE, east));
      vec3 face = east * (-sin(yaw)) + north * (-cos(yaw));
      vec3 nFlat = n - upE * dot(n, upE);
      float front = dot(normalize(nFlat + vec3(1e-4)), face);
      alb = mix(alb * 0.62, alb, smoothstep(-0.15, 0.75, front));
      float upN = dot(n, upE);
      if (front > 0.78 && upN > -0.2 && upN < 0.65) alb = mix(alb, vec3(0.08, 0.06, 0.05), 0.7);
    }
    if (selected > 0.5) alb = mix(alb, vec3(0.92, 0.78, 0.38), 0.35);
    alb = mix(alb, vec3(1.0), clamp(flash, 0.0, 1.0));
    float sh = kind == 5 ? 1.0 : shadowOf(pos, n);
    float ndl = max(dot(n, uSun), 0.0);
    float day = dayAmt();
    vec3 amb = mix(vec3(0.05, 0.06, 0.08), vec3(0.32, 0.28, 0.24), day);
    col = alb * (amb + vec3(1.05, 0.9, 0.7) * ndl * sh);
    fogT = bestT;
  } else {
    col = sky(rd);
    fogT = 90.0;
  }
  float fog = 1.0 - exp(-fogT * 0.005);
  col = mix(col, sky(rd) * 0.92, clamp(fog, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}`;

const PRESENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec3 col = texture(uTex, vUv).rgb;
  col = pow(max(col, 0.0), vec3(0.82));
  col = (col - 0.5) * 1.04 + 0.5;
  float v = length((vUv - 0.5) * vec2(1.15, 1.0));
  col *= 1.0 - 0.32 * smoothstep(0.35, 1.15, v);
  fragColor = vec4(max(col, 0.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string, name: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "no log";
    gl.deleteShader(sh);
    throw new Error(`${name}: ${log}`);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string, name: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs, name + " vert");
  const f = compile(gl, gl.FRAGMENT_SHADER, fs, name + " frag");
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "link error";
    gl.deleteProgram(p);
    throw new Error(`${name} link: ${log}`);
  }
  return p;
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const glNullable = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  if (!glNullable) {
    return {
      ok: false as const,
      error: "This browser has no WebGL2, so the vale cannot raytrace.",
      draw() {},
      resize() {},
      upload() {},
      setSun() {},
      dispose() {},
      setLong() {},
      get longSide() {
        return 0;
      },
    };
  }
  const gl: WebGL2RenderingContext = glNullable;
  if (gl.isContextLost()) {
    return {
      ok: false as const,
      error: "The raytracer context was lost before the first frame.",
      draw() {},
      resize() {},
      upload() {},
      setSun() {},
      dispose() {},
      setLong() {},
      get longSide() {
        return 0;
      },
    };
  }

  let trace: WebGLProgram;
  let present: WebGLProgram;
  try {
    trace = program(gl, VERT, TRACE, "trace");
    present = program(gl, VERT, PRESENT, "present");
  } catch (err) {
    const message = err instanceof Error ? err.message : "shader failed";
    return {
      ok: false as const,
      error: message,
      draw() {},
      resize() {},
      upload() {},
      setSun() {},
      dispose() {},
      setLong() {},
      get longSide() {
        return 0;
      },
    };
  }

  const loc = {
    vox: gl.getUniformLocation(trace, "uVox"),
    cam: gl.getUniformLocation(trace, "uCam"),
    forward: gl.getUniformLocation(trace, "uForward"),
    right: gl.getUniformLocation(trace, "uRight"),
    up: gl.getUniformLocation(trace, "uUp"),
    res: gl.getUniformLocation(trace, "uRes"),
    fov: gl.getUniformLocation(trace, "uFov"),
    sun: gl.getUniformLocation(trace, "uSun"),
    time: gl.getUniformLocation(trace, "uTime"),
    count: gl.getUniformLocation(trace, "uCount"),
    a: gl.getUniformLocation(trace, "uA"),
    b: gl.getUniformLocation(trace, "uB"),
    c: gl.getUniformLocation(trace, "uC"),
    tex: gl.getUniformLocation(present, "uTex"),
  };

  const voxTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, voxTex);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  const color = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  let bw = 0;
  let bh = 0;
  let longSide = 200;
  const A = new Float32Array(24 * 4);
  const B = new Float32Array(24 * 4);
  const C = new Float32Array(24 * 4);

  function ensure(w: number, h: number) {
    if (w === bw && h === bh) return;
    bw = w;
    bh = h;
    gl.bindTexture(gl.TEXTURE_2D, color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  }

  let sunX = 0.35;
  let sunY = 0.86;
  let sunZ = 0.28;

  function setSun(s: V3) {
    const l = Math.hypot(s.x, s.y, s.z) || 1;
    sunX = s.x / l;
    sunY = s.y / l;
    sunZ = s.z / l;
  }

  function upload(world: World) {
    gl.bindTexture(gl.TEXTURE_3D, voxTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, WORLD_W, WORLD_H, WORLD_D, 0, gl.RED, gl.UNSIGNED_BYTE, world.vox);
  }

  function draw(cam: { pos: V3; forward: V3; right: V3; up: V3 }, ents: DrawEnt[], time: number) {
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const aspect = cssW / cssH;
    let tw: number;
    let th: number;
    if (aspect >= 1) {
      tw = longSide;
      th = Math.max(64, Math.round(longSide / aspect));
    } else {
      th = longSide;
      tw = Math.max(64, Math.round(longSide * aspect));
    }
    ensure(tw, th);
    const count = Math.min(24, ents.length);
    A.fill(0);
    B.fill(0);
    C.fill(0);
    for (let i = 0; i < count; i++) {
      const e = ents[i];
      const o = i * 4;
      A[o] = e.ax;
      A[o + 1] = e.ay;
      A[o + 2] = e.az;
      A[o + 3] = e.kind + Math.min(7.9, Math.max(0, e.radius)) / 8;
      B[o] = e.bx;
      B[o + 1] = e.by;
      B[o + 2] = e.bz;
      B[o + 3] = e.yaw;
      C[o] = e.r;
      C[o + 1] = e.g;
      C[o + 2] = e.b;
      C[o + 3] = Math.min(0.99, e.flash) + (e.selected ? 2 : 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, tw, th);
    gl.useProgram(trace);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, voxTex);
    gl.uniform1i(loc.vox, 0);
    gl.uniform3f(loc.cam, cam.pos.x, cam.pos.y, cam.pos.z);
    gl.uniform3f(loc.forward, cam.forward.x, cam.forward.y, cam.forward.z);
    gl.uniform3f(loc.right, cam.right.x, cam.right.y, cam.right.z);
    gl.uniform3f(loc.up, cam.up.x, cam.up.y, cam.up.z);
    gl.uniform2f(loc.res, tw, th);
    gl.uniform1f(loc.fov, FOV);
    gl.uniform3f(loc.sun, sunX, sunY, sunZ);
    gl.uniform1f(loc.time, time);
    gl.uniform1i(loc.count, count);
    gl.uniform4fv(loc.a, A);
    gl.uniform4fv(loc.b, B);
    gl.uniform4fv(loc.c, C);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pw = Math.max(1, Math.round(cssW * dpr));
    const ph = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    gl.viewport(0, 0, pw, ph);
    gl.useProgram(present);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, color);
    gl.uniform1i(loc.tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    ok: true as const,
    error: null as string | null,
    upload,
    draw,
    setSun,
    resize() {},
    setLong(n: number) {
      longSide = Math.max(96, Math.min(480, Math.round(n)));
    },
    get longSide() {
      return longSide;
    },
    dispose() {
      gl.deleteProgram(trace);
      gl.deleteProgram(present);
      gl.deleteTexture(voxTex);
      gl.deleteTexture(color);
      gl.deleteFramebuffer(fbo);
    },
  };
}

export type Renderer = ReturnType<typeof createRenderer>;
