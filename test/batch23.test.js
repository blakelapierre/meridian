import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { edgeCueRadii, rad } from "../src/render/radius.js";
import { summarize } from "../tools/scale/summary.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("edge cue on a tiny bench thumbnail no longer yields a negative radius", () => {
  // Blake's failure: ~10 px tall thumbnails at 24 clients gave h/2 - 6 - age*4 = -0.82.
  assert.equal(edgeCueRadii(18, 10.4, 0.05), null);
  assert.equal(edgeCueRadii(100, 12, 0), null);
  const r = edgeCueRadii(320, 180, 0.5);
  assert.deepEqual(r, { rx: 152, ry: 82 });
  for (let h = 0; h < 40; h += 0.7) for (const age of [0, 0.3, 1, 2]) {
    const v = edgeCueRadii(h * 1.8, h, age);
    if (v) assert.ok(v.rx > 0 && v.ry > 0);
  }
});

test("rad clamps negatives and NaN to 0", () => {
  assert.equal(rad(-3), 0); assert.equal(rad(NaN), 0); assert.equal(rad(2.5), 2.5);
});

test("every arc/ellipse in src and tools goes through a clamp", () => {
  for (const f of ["src/app/main.js", "src/render/chart.js"]) {
    for (const line of read(f).split("\n").filter((l) => /ctx\.(arc|ellipse)\(/.test(l))) {
      assert.match(line, /rad\(|radii\.|Math\.max\(/, `${f}: ${line.trim()}`);
    }
  }
});

test("sim-only clients skip the GPU context; bench uses them past the live budget", () => {
  const main = read("src/app/main.js"), bench = read("tools/scale/bench.js");
  assert.match(main, /SIM_ONLY \|\| opened\.mode\.where === "cpu" \? null : opened\.painter \|\| createGpuPainter/);
  assert.match(main, /SIM_ONLY \? \{ painter: null/);
  assert.match(main, /radius\.js\?v=\d+/);
  assert.match(bench, /simonly/); assert.match(bench, /LIVE_GL/);
});

test("summary reports error counts, gpu warnings and sim-only clients", () => {
  const html = summarize({ result: "fail", maxPassed: 1, levels: [{ clients: 2, ok: false, errorCount: 3, erroredClients: 2, warnings: ["#1 gpu: context lost"], simOnly: 0, failures: ["#0 errors: x"], snap: [] }] });
  assert.match(html, /<td>3 \(2 clients\)<\/td><td>1<\/td><td>0<\/td>/);
});
