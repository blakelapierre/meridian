import test from "node:test";
import assert from "node:assert/strict";
import { classifyError, createErrorLog, errorInfoFromEvent, siteBase } from "../src/app/errsource.js";

const base = siteBase("https://blakelapierre.github.io/meridian/");
const ours = "https://blakelapierre.github.io/meridian/src/app/main.js?v=127";

test("siteBase strips the file name", () => {
  assert.deepEqual(siteBase("https://x.io/meridian/tools/view/index.html"), { origin: "https://x.io", path: "/meridian/tools/view/" });
});

test("errors from our files count", () => {
  assert.equal(classifyError({ filename: ours }, base).reason, "ours");
  assert.equal(classifyError({ stack: `TypeError: x\n    at f (${ours}:10:5)` }, base).count, true);
  assert.equal(classifyError({ stack: `f@${ours}:10:5` }, base).count, true); // Firefox format
});

test("extension and foreign-origin errors are ignored", () => {
  for (const filename of ["chrome-extension://abc/content.js", "moz-extension://abc/c.js", "safari-web-extension://abc/c.js", "https://evil.example/meridian/x.js", "https://blakelapierre.github.io/other/x.js"]) {
    const c = classifyError({ filename }, base);
    assert.equal(c.count, false, filename);
    assert.equal(c.reason, "foreign");
  }
  assert.equal(classifyError({ stack: "Error\n    at chrome-extension://abc/inject.js:1:2" }, base).count, false);
});

test("source-less errors are ignored", () => {
  assert.equal(classifyError({ message: "Script error." }, base).reason, "no-source");
});

test("an ours frame anywhere in the stack counts", () => {
  assert.equal(classifyError({ filename: "chrome-extension://abc/c.js", stack: `at g (${ours}:1:1)` }, base).count, true);
});

test("unhandledrejection reasons use the reason stack", () => {
  const info = errorInfoFromEvent({ type: "unhandledrejection", reason: { message: "boom", stack: `Error: boom\n    at chrome-extension://abc/x.js:1:1` } });
  assert.equal(classifyError(info, base).count, false);
  const info2 = errorInfoFromEvent({ type: "unhandledrejection", reason: { message: "boom", stack: `Error: boom\n    at ${ours}:3:1` } });
  assert.equal(classifyError(info2, base).count, true);
});

test("error log keeps ignored count and samples", () => {
  const log = createErrorLog(base, { samples: 2 });
  log.add({ message: "Script error." });
  log.add({ message: "ext", filename: "chrome-extension://a/b.js" });
  log.add({ message: "ext2", filename: "moz-extension://a/b.js" });
  log.add({ message: "real", filename: ours });
  assert.deepEqual(log.errors, ["real"]);
  assert.equal(log.ignored.count, 3);
  assert.deepEqual(log.ignored.samples, ["no-source: Script error.", "foreign: ext"]);
});

test("local dev server base", () => {
  const local = siteBase("http://127.0.0.1:8080/");
  assert.equal(classifyError({ filename: "http://127.0.0.1:8080/tools/scale/bench.js" }, local).count, true);
  assert.equal(classifyError({ filename: "http://127.0.0.1:9999/x.js" }, local).count, false);
});
