import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BARE_STUBS, CORE_STUBS, compileProblem, coreShader, glslFunctions } from "../src/render/gpu.js";

const SRC = `#version 300 es
precision highp float;
out vec4 c;
float unused(float x) { return x * 2.0; }
float onlyByUnused2(float x) { return x; }
float unused2(float x) { return onlyByUnused2(x); }
vec3 heatShimmer(vec3 ro, vec3 rd) {
  if (rd.z > 0.0) { return rd * 2.0; }
  return rd;
}
float pineTop(vec2 p, float g, float dens, out vec3 info) { info = vec3(1.0); return g; }
void main() {
  vec3 rd = heatShimmer(vec3(0.0), vec3(1.0));
  vec3 info;
  for (int bounce = 0; bounce < 5; bounce++) {
    float mirror = bounce == 4 ? 0.0 : 1.0;
  }
  c = vec4(rd, pineTop(vec2(0.0), 1.0, 0.0, info));
}`;

test("glslFunctions finds each definition and its closing brace", () => {
  const fns = glslFunctions(SRC);
  assert.deepEqual(fns.map((f) => f.name), ["unused", "onlyByUnused2", "unused2", "heatShimmer", "pineTop", "main"]);
  const heat = fns.find((f) => f.name === "heatShimmer");
  assert.match(SRC.slice(heat.start, heat.end), /^vec3 heatShimmer[\s\S]*return rd;\n\}$/);
});

test("the core tier stubs the heavy effects, cuts the bounces and drops what nothing calls", () => {
  const core = coreShader(SRC);
  assert.match(core, /vec3 heatShimmer\(vec3 ro, vec3 rd\) \{\n  return rd;\n\}/);
  assert.doesNotMatch(core, /rd \* 2\.0/);
  assert.match(core, /bounce < 2/);
  assert.match(core, /bounce == 1 \? 0\.0/);
  assert.doesNotMatch(core, /float unused|onlyByUnused2/, "orphans go, including ones only an orphan called");
  assert.match(core, /void main\(\)/);
  assert.match(core, /info = vec3\(1\.0\)/, "core keeps the pines");
  const bare = coreShader(SRC, true);
  assert.match(bare, /bounce < 1/);
  assert.match(bare, /info = vec3\(0\.0\);\n  return -1\.0e9;/, "bare drops the pines");
  for (const name of Object.keys(CORE_STUBS)) assert.ok(name in BARE_STUBS);
});

test("a failed compile says which stage and tier, the size, the time, a lost context and glError", () => {
  assert.equal(
    compileProblem({ stage: "fragment", chars: 72838, ms: 5410, log: "", lost: true, error: "0x9242", status: null }, "lite"),
    "fragment, lite, 72838 chars, 5410 ms, context lost, glError 0x9242, status null: no log",
  );
  assert.equal(compileProblem({ stage: "vertex", chars: 177, ms: 1, log: "ERROR: 0:1: x\n" }, "vertex"), "vertex, vertex, 177 chars, 1 ms: ERROR: 0:1: x");
});

test("the boot ladder, the lost-context retry, and a CPU picture that draws (wiring)", () => {
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../src/app/render-worker.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(gpu, /const TIERS = \["full", "lite", "core", "bare"\];/);
  assert.match(gpu, /if \(compile\.last\?\.lost\) break;/, "a lost context stops the ladder");
  assert.match(gpu, /probe: a tiny shader compiles/);
  assert.match(gpu, /if \(!lite \|\| fullJob \|\| tier !== "lite"\) return false;/, "no full upgrade from core or bare");
  assert.match(worker, /webglcontextlost", \(e\) => e\.preventDefault\(\)/);
  assert.match(worker, /webglcontextrestored[\s\S]*tier: "core"/);
  assert.match(main, /if \(cores\.count > 0 && cpuBusy\) \{\s*lastScene = scene;\s*return scene;/, "no main-thread CPU frame while the cores are busy");
  assert.match(main, /swapCanvas\(canvas\.dataset\.gpuError \|\| "WebGL2 is not available", false\);\s*context = canvas\.getContext\("2d"/, "the CPU picture never reuses a WebGL canvas");
  assert.match(main, /capCpuCanvas\(canvas\);/);
});
