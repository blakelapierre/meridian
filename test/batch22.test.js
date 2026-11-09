import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalHub, localSocket, isLocalHubUrl } from "../src/net/localhub.js";
import { lighthouseUrl, signalMode } from "../src/app/demo.js";
import { summarize } from "../tools/scale/summary.js";

const tick = () => new Promise((r) => setTimeout(r, 5));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("bc: urls pick the in-tab lighthouse", () => {
  const p = new URLSearchParams("lighthouse=bc:room1");
  assert.equal(lighthouseUrl(p, "blakelapierre.github.io"), "bc:room1");
  assert.equal(signalMode(p, "bc:room1"), "lighthouse");
  assert.ok(isLocalHubUrl("bc:x")); assert.ok(!isLocalHubUrl("wss://x"));
});

test("local hub: subscribe, roster diffs, list, signal relay, drop on close", async () => {
  const hub = createLocalHub();
  const inbox = { a: [], b: [] };
  const a = hub.connect((t) => inbox.a.push(JSON.parse(t)));
  const b = hub.connect((t) => inbox.b.push(JSON.parse(t)));
  a.send(JSON.stringify({ type: "announce", pubkey: "A", cell: "c", proto: 2 }));
  a.send(JSON.stringify({ type: "subscribe", cell: "c" }));
  b.send(JSON.stringify({ type: "announce", pubkey: "B", cell: "c", proto: 2 }));
  b.send(JSON.stringify({ type: "list", cell: "c" }));
  b.send(JSON.stringify({ type: "signal", to: "A", from: "B", blob: "hi" }));
  await tick();
  assert.deepEqual(inbox.a[0].peers.map((p) => p.pubkey), ["A"]);
  assert.equal(inbox.a[0].sub, true);
  assert.deepEqual(inbox.a.find((m) => m.type === "roster").add.map((p) => p.pubkey), ["B"]);
  assert.equal(inbox.a.find((m) => m.type === "signal").blob, "hi");
  assert.deepEqual(inbox.b.find((m) => m.type === "present").peers.map((p) => p.pubkey).sort(), ["A", "B"]);
  b.close(); await tick();
  assert.deepEqual(inbox.a.at(-1).drop, ["B"]);
  assert.equal(hub.size(), 1);
});

test("iframes share the top window's hub; socket shim opens and relays", async () => {
  const top = { meridianLocalHubs: {} }; top.parent = top;
  const f1 = { parent: top }, f2 = { parent: top };
  const s1 = localSocket("bc:r", f1), s2 = localSocket("bc:r", f2);
  const got = [];
  s1.addEventListener("message", (e) => got.push(JSON.parse(e.data)));
  await new Promise((r) => s1.addEventListener("open", r));
  await tick();
  s1.send(JSON.stringify({ type: "announce", pubkey: "one", cell: "c" }));
  s2.send(JSON.stringify({ type: "signal", to: "one", from: "two", blob: "x" }));
  await tick();
  assert.equal(got[0].from, "two");
  assert.ok(top.meridianLocalHubs.r);
});

test("summary table escapes and reports each level", () => {
  const html = summarize({ result: "fail", maxPassed: 2, firstFailure: { clients: 3 }, lighthouse: "in-tab", expectNet: true,
    levels: [{ clients: 2, ok: true, worstPoseErrorM: 0.3, snap: [{ simHz: 30, remotes: 1 }] }, { clients: 3, ok: false, failures: ["#1 <x>"], snap: [] }] });
  assert.match(html, /FAIL/); assert.match(html, /&lt;x&gt;/); assert.match(html, /<td>30<\/td>/);
});

test("bench is static, in-tab by default, and cache-busted", () => {
  const bench = read("tools/scale/bench.js"), page = read("tools/scale/index.html"), room = read("src/net/room.js");
  assert.match(page, /bench\.js\?v=5/); assert.match(bench, /summary\.js\?v=\d+/); assert.match(room, /localhub\.js\?v=\d+/);
  assert.match(bench, /"bc:"/); assert.match(bench, /MIN_HZ/); assert.match(bench, /MIN_FPS/);
  assert.match(bench, /fresh: "1"/);
  assert.match(read("README.md"), /blakelapierre\.github\.io\/meridian\/tools\/scale\/index\.html/);
});
