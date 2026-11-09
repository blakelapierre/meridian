import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { GPU_NEEDS, gpuCapsProblem } from "../src/render/gpu.js";
import { PICTURE_DEADLINE_MS, openPicture, pictureMode } from "../src/app/picture.js";

const PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const DESK = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// A picture thread we drive by hand: it records what the page sent and lets the test answer.
function fakeWorker() {
  const made = [];
  class FakeWorker {
    constructor(url) {
      this.url = String(url);
      this.sent = [];
      this.terminated = false;
      made.push(this);
    }
    postMessage(msg) { this.sent.push(msg); }
    terminate() { this.terminated = true; }
    say(msg) { this.onmessage?.({ data: msg }); }
  }
  return { FakeWorker, made };
}
const fakeCanvas = () => ({ transferControlToOffscreen: () => ({ offscreen: true }) });

test("phones get the lite trace by default; ?gl= picks the path and the shader", () => {
  assert.deepEqual(pictureMode("", PHONE), { where: "worker", lite: true, mobile: true });
  assert.deepEqual(pictureMode("", DESK), { where: "worker", lite: false, mobile: false });
  assert.equal(pictureMode("", DESK, true).lite, true, "userAgentData.mobile counts");
  assert.equal(pictureMode("?gl=full", PHONE).lite, false);
  assert.equal(pictureMode("?gl=lite", DESK).lite, true);
  assert.equal(pictureMode("?gl=main", DESK).where, "main");
  assert.equal(pictureMode("?gl=cpu", PHONE).where, "cpu");
});

test("capability check names the missing cap; WebGL2 minimums pass", () => {
  const ok = { textureUnits: 16, textureSize: 4096, fragmentVectors: 256, highpBits: 23 };
  assert.equal(gpuCapsProblem(ok), "");
  assert.match(gpuCapsProblem({ ...ok, textureUnits: 8 }), /only 8 texture units \(needs 16\)/);
  assert.match(gpuCapsProblem({ ...ok, textureSize: 512 }), /max texture 512 < 1024/);
  assert.match(gpuCapsProblem({ ...ok, fragmentVectors: 128 }), /fragment uniform vectors/);
  assert.match(gpuCapsProblem({ ...ok, highpBits: 0 }), /highp/);
  assert.match(gpuCapsProblem(null), /no WebGL2/);
  assert.equal(GPU_NEEDS.textureUnits, 16);
});

test("the picture thread is told lite or full, and its stage notes reach the page", async () => {
  const { FakeWorker, made } = fakeWorker();
  const opened = openPicture(fakeCanvas(), { search: "", WorkerImpl: FakeWorker, ua: PHONE, mobile: null, deadlineMs: 5000 });
  assert.equal(opened.remote, true);
  const w = made[0];
  assert.equal(w.sent[0].type, "init");
  assert.equal(w.sent[0].lite, true);
  const seen = [];
  opened.painter.onStage = (s) => seen.push(s);
  w.say({ type: "stage", stage: "compiling the picture (lite)" });
  assert.deepEqual(seen, ["compiling the picture (lite)"]);
  assert.equal(opened.painter.stage(), "compiling the picture (lite)");
  w.say({ type: "ready", info: "gpu", facts: { lite: true, compileMs: 1234, caps: "units 16" } });
  assert.equal(await opened.painter.ready, true);
  assert.equal(opened.painter.facts().compileMs, 1234);
});

test("a thread that never answers times out with its last stage, and can be closed for the CPU picture", async () => {
  const { FakeWorker, made } = fakeWorker();
  const opened = openPicture(fakeCanvas(), { search: "?gl=full", WorkerImpl: FakeWorker, ua: PHONE, deadlineMs: 30 });
  made[0].say({ type: "stage", stage: "compiling the picture" });
  assert.equal(made[0].sent[0].lite, false);
  assert.equal(await opened.painter.ready, false);
  assert.match(opened.painter.failReason(), /did not start within 0 s \(last: compiling the picture\)/);
  opened.painter.close();
  assert.equal(made[0].terminated, true);
  // A late "ready" after the deadline does not flip the answer.
  made[0].say({ type: "ready" });
  assert.equal(await opened.painter.ready, false);
});

test("a thread that fails says why (the real error text), with its GPU facts", async () => {
  const { FakeWorker, made } = fakeWorker();
  const opened = openPicture(fakeCanvas(), { search: "", WorkerImpl: FakeWorker, ua: DESK, deadlineMs: 5000 });
  made[0].say({ type: "error", reason: "only 8 texture units (needs 16)", facts: { caps: "units 8" } });
  assert.equal(await opened.painter.ready, false);
  assert.equal(opened.painter.failReason(), "only 8 texture units (needs 16)");
  assert.equal(opened.painter.facts().caps, "units 8");
  assert.ok(PICTURE_DEADLINE_MS >= 60000, "phones get most of a minute and more");
  // ?gl=cpu never starts a thread.
  const cpu = openPicture(fakeCanvas(), { search: "?gl=cpu", WorkerImpl: FakeWorker, ua: DESK });
  assert.equal(cpu.painter, null);
  assert.equal(cpu.mode.where, "cpu");
});

test("the page falls back to the CPU picture instead of a dead stop; the shader degrades to lite", () => {
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.doesNotMatch(main, /The picture did not start\. Reload the page\./);
  assert.match(main, /if \(!pictureUp\) \{[\s\S]{0,300}fallBackToCpu\(reason, Date\.now\(\) - wakeStart\);\n    pictureUp = true;/);
  assert.match(main, /const fresh = canvas\.cloneNode\(false\);[\s\S]{0,400}canvas\.replaceWith\(fresh\);\n  canvas = fresh;\n  bindCanvasLoss\(canvas\);\n  bindCanvasInput\(canvas\);/);
  assert.match(main, /const GL_DEBUG = new URLSearchParams\(location\.search\)\.get\("debug"\) === "1";/);
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(gpu, /const capsProblem = gpuCapsProblem\(caps\);\n  if \(capsProblem\) return fail\(canvas, capsProblem\);/);
  assert.match(gpu, /if \(vs && !fs && !lite\) \{[\s\S]{0,300}lite = true;\n    fragBody = fragFor\(true\);/);
  assert.match(gpu, /const bool LITE = \$\{liteNow \? "true" : "false"\};/);
  assert.match(gpu, /if \(LITE \|\| uVolcano < 0\.5\) return color;/);
  assert.match(gpu, /warm: warmTree,/);
  const worker = readFileSync(new URL("../src/app/render-worker.js", import.meta.url), "utf8");
  assert.match(worker, /self\.postMessage\(\{ type: "stage"/);
  assert.match(worker, /createGpuPainter\(canvas, \{ lite: Boolean\(msg\.lite\) \}\)/);
  assert.match(worker, /painter\.warm\?\.\(\)/);
});
