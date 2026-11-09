import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { moduleWorkers, openPicture } from "../src/app/picture.js";

const html = readFileSync(new URL("../tools/view/index.html", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");

test("the boot guard is a classic inline script that runs before the game module", () => {
  const guard = html.indexOf("window.__meridianBootError = say");
  const mod = html.indexOf('<script type="module" src="../../src/app/main.js');
  assert.ok(guard > 0 && mod > guard, "guard first");
  assert.match(html, /addEventListener\("error"[\s\S]*?, true\);/, "capture phase: script load errors too");
  assert.match(html, /addEventListener\("unhandledrejection"/);
  assert.match(html, /<script nomodule>/);
  assert.match(html, /__meridianRunning/);
  assert.match(main, /globalThis\.__meridianRunning = true;/);
  assert.doesNotMatch(html + main, /The picture did not start\. Reload the page\./, "the old dead-stop text is gone");
});

test("the stale-page check: build.txt, the guard's BUILD and main.js?v agree", () => {
  const build = readFileSync(new URL("../tools/view/build.txt", import.meta.url), "utf8").trim();
  assert.match(build, /^\d+$/);
  assert.equal(html.match(/var BUILD = "(\d+)"/)[1], build);
  assert.equal(html.match(/main\.js\?v=(\d+)/)[1], build);
  assert.match(html, /fetch\("build\.txt\?t=" \+ Date\.now\(\), \{ cache: "no-store" \}\)/);
  assert.match(html, /searchParams\.get\("build"\) === live\) return;/, "redirects at most once per build");
});

test("no module workers or no OffscreenCanvas: trace on the page thread, and the mode is always there", () => {
  class OldWorker { static moduleProbe = false; constructor() { throw new Error("should not be made"); } }
  const a = openPicture({ transferControlToOffscreen: () => ({}) }, { search: "", WorkerImpl: OldWorker, ua: "Android" });
  assert.equal(a.remote, false);
  assert.equal(a.mode.where, "main");
  assert.match(a.mode.why, /module workers/);
  const b = openPicture({}, { search: "", WorkerImpl: OldWorker, ua: "Android" });
  assert.deepEqual([b.mode.where, b.mode.why], ["main", "no OffscreenCanvas"]);
  class Throws { static moduleProbe = true; constructor() { throw new Error("blocked"); } }
  const c = openPicture({ transferControlToOffscreen: () => ({}) }, { search: "", WorkerImpl: Throws, ua: "" });
  assert.deepEqual([c.mode.where, c.mode.why], ["main", "worker: blocked"]);
  assert.equal(openPicture({}, { search: "?gl=cpu" }).mode.where, "cpu");
});

test("the module-worker probe reads the type option only when the browser knows it", () => {
  class Knows { constructor(url, opts) { void opts.type; } terminate() {} }
  class Ignores { constructor() {} terminate() {} }
  assert.equal(moduleWorkers(Knows), true);
  assert.equal(moduleWorkers(Ignores), false);
});

test("content fetches retry a CDN 5xx instead of parsing its error page", () => {
  assert.match(main, /response\.status < 500/);
});
