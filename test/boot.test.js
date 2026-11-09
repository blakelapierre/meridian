import test from "node:test";
import assert from "node:assert/strict";
import { bytesHash } from "../src/net/hello.js";
import { bootDone, bootNote, shouldPaint, shouldSimStep } from "../src/app/boot.js";
import { coreCount, createCores } from "../src/app/cores.js";
import { hashParts, runJob } from "../src/app/core-jobs.js";
import { openPicture } from "../src/app/picture.js";
import { paintFrame, paintRows } from "../src/engine/frame.js";

test("the boot curtain reports a stage and then gets out of the way", () => {
  const line = { textContent: "" };
  const bar = { style: { width: "" } };
  const root = {
    hidden: true,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    querySelector(sel) { return sel.includes("line") ? line : bar; },
  };
  const doc = { querySelector: () => root };
  assert.equal(bootNote("Reading the island", 0.28, doc), true);
  assert.equal(root.hidden, false);
  assert.equal(root.attrs["aria-busy"], "true");
  assert.equal(line.textContent, "Reading the island");
  assert.equal(bar.style.width, "28%");
  assert.equal(bootDone(doc), true);
  assert.equal(root.hidden, true);
  assert.equal(bootNote("x", 1, null), false);
});

test("a frame gives the UI a turn once the catch-up has spent its budget", () => {
  assert.equal(shouldSimStep(0, 40), true);
  assert.equal(shouldSimStep(1, 9), false);
  assert.equal(shouldSimStep(1, 8), true);
  assert.equal(shouldPaint(1, 40), true);
  assert.equal(shouldPaint(2, 20), false);
  assert.equal(shouldPaint(2, 14), true);
  assert.equal(coreCount(8), 2);
  assert.equal(coreCount(2), 1);
  assert.equal(coreCount(1), 1);
});

test("catalog hashing on a worker matches the page, and a missing worker stays inline", async () => {
  const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([9, 8])];
  assert.equal(hashParts(parts), bytesHash(parts));
  const cores = createCores({ url: null });
  assert.equal(cores.count, 0);
  assert.equal(await cores.run("hash", { parts }), bytesHash(parts));
  cores.close();
});

test("a picture band matches the same rows of a full frame", () => {
  const scene = {
    miss: [0.2, 0.3, 0.4, 1],
    objects: [{ type: "sphere", origin: [0, 0, 4], radius: 1, color: [1, 0, 0, 1] }],
    camera: { origin: [0, 0, 0], dir: [0, 0, 1], fov: 70, aspect: 1, planeDistance: 1 },
  };
  const full = paintFrame(scene, 8, 6);
  const band = paintRows(scene, 8, 6, 2, 4);
  assert.equal(band.length, full.length);
  assert.deepEqual(band.slice(2 * 8 * 4, 4 * 8 * 4), full.slice(2 * 8 * 4, 4 * 8 * 4));
  const slice = runJob("band", { scene, width: 8, height: 6, y0: 2, y1: 4 });
  assert.equal(slice.length, 2 * 8 * 4);
  assert.deepEqual(slice, full.slice(2 * 8 * 4, 4 * 8 * 4));
});

test("the picture stays on the page when a worker canvas is refused", () => {
  const canvas = { transferControlToOffscreen() { throw new Error("no"); } };
  const opened = openPicture(canvas, { search: "", WorkerImpl: function Worker() {} });
  assert.equal(opened.remote, false);
  assert.equal(opened.painter, null);
  const forced = openPicture(canvas, { search: "gl=main", WorkerImpl: function Worker() {} });
  assert.equal(forced.remote, false);
});
