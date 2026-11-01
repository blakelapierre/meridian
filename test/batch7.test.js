import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { createRequire } from "node:module";
import { helloMessage, readHello } from "../src/net/wire.js";
import { lighthouseLine, lighthouseUrl } from "../src/app/demo.js";
import { createWander, stepWander, rng } from "../src/app/bot.js";
import { pinchSteps, BUTTONS, fullscreenSupported } from "../src/app/touch.js";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the game canvas has no CSS background (it hid the WebGL layer on Android Chrome)", () => {
  const html = read("tools/view/index.html");
  const rule = html.match(/body > canvas\s*\{[^}]*\}/)?.[0] || "";
  assert.ok(rule, "body > canvas rule present");
  assert.doesNotMatch(rule, /background/);
});

test("the view shows a GL error banner and a reset control", () => {
  const html = read("tools/view/index.html");
  assert.match(html, /id="glerr"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /src\/app\/ns\.js\?v=\d+/);
  assert.match(html, /rel="icon"/);
});

test("hello carries the real fov when known and stays the old shape without it", () => {
  assert.deepEqual(readHello(helloMessage("ab")), { proto: readHello(helloMessage("ab")).proto, catalog: "ab" });
  assert.equal(readHello(helloMessage("ab")).fov, undefined);
  const hello = readHello(helloMessage("ab", 1.7321));
  assert.equal(hello.fov, 1.732);
  assert.equal(readHello(JSON.stringify({ t: "hello", proto: 3, catalog: "", fov: 99 })).fov, undefined);
});

test("no lighthouse configured: solo with a clear offline note, ?lighthouse= still overrides", () => {
  const config = JSON.parse(read("content/lighthouse.json"));
  assert.equal(config.url, null);
  assert.equal(lighthouseUrl(new URLSearchParams(""), "blakelapierre.github.io", config), null);
  assert.equal(lighthouseUrl(new URLSearchParams("lighthouse=wss://example.test"), "blakelapierre.github.io", config), "wss://example.test");
  assert.equal(lighthouseLine("offline"), "multiplayer server offline · playing solo");
  assert.equal(lighthouseLine("off"), "");
});

test("no tunnel hostnames are shipped", () => {
  const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (["node_modules", ".git", "vendor"].includes(name)) return [];
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
  for (const path of walk(".").filter((p) => /\.(js|mjs|json|html|md)$/.test(p) && !p.endsWith("batch7.test.js"))) {
    assert.doesNotMatch(read(path), /trycloudflare/, path);
  }
});

test("the wander bot is seeded, moves toward goals and recovers when stuck", () => {
  const a = rng(7); const b = rng(7);
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
  const bot = createWander(3, { center: [0, 0], radius: 10 });
  const state = { x: 0, y: 0, yaw: 0 };
  let sawForward = false;
  for (let i = 0; i < 400; i += 1) {
    const held = stepWander(bot, state, 0.1);
    if (held.has("KeyW")) { sawForward = true; state.x += Math.sin(state.yaw) * 0.4; state.y += Math.cos(state.yaw) * 0.4; }
    if (held.has("KeyD")) state.yaw += 0.2;
    if (held.has("KeyA")) state.yaw -= 0.2;
  }
  assert.ok(sawForward);
  assert.ok(bot.moved > 10, `moved ${bot.moved}`);
  assert.ok(bot.picks > 1);
  const stuck = createWander(5, { center: [50, 50], radius: 1 });
  for (let i = 0; i < 40; i += 1) stepWander(stuck, { x: 0, y: 0, yaw: 0 }, 0.1);
  assert.ok(stuck.rescues >= 1);
});

test("touch camera: pinch maps to wheel steps, V toggles the view, fullscreen hides when unsupported", () => {
  assert.deepEqual(pinchSteps(95), { steps: 2, rest: 15 });
  assert.deepEqual(pinchSteps(-41), { steps: -1, rest: -1 });
  assert.ok(BUTTONS.some((b) => b.code === "KeyV"));
  assert.equal(fullscreenSupported({ fullscreenEnabled: false, documentElement: { requestFullscreen() {} } }), false);
  assert.equal(fullscreenSupported({ fullscreenEnabled: true, documentElement: { requestFullscreen() {} } }), true);
});

test("?ns= scopes storage keys and leaves others alone", () => {
  const require = createRequire(import.meta.url);
  const backing = new Map();
  const real = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null), setItem: (k, v) => backing.set(k, v), removeItem: (k) => backing.delete(k),
    key: (i) => [...backing.keys()][i] ?? null, get length() { return backing.size; },
  };
  backing.set("meridian-id-self", "outer");
  const source = read("src/app/ns.js");
  const scope = {};
  new Function("globalThis", "window", source)(scope, undefined);
  const scoped = scope.meridianNamespace.namespaced(real, "ns:a:");
  assert.equal(scoped.getItem("meridian-id-self"), null);
  scoped.setItem("meridian-id-self", "inner");
  assert.equal(backing.get("ns:a:meridian-id-self"), "inner");
  assert.equal(scoped.length, 1);
  scoped.clear();
  assert.equal(backing.get("meridian-id-self"), "outer");
  assert.equal(backing.size, 1);
  assert.ok(require);
});

// ?v= drift: every import of the same file must carry the same version, and the view's
// entry must match, so a changed module is never paired with a stale cached sibling.
test("?v= cache numbers do not drift between importers", () => {
  const files = ["tools/view/index.html", "tools/scale/index.html", "index.html"];
  const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
  files.push(...walk("src").filter((p) => p.endsWith(".js")), ...walk("tools/scale").filter((p) => p.endsWith(".js")));
  const seen = new Map();
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/["']([.\w/-]+\.(?:js|json|svg))\?v=(\d+)["']/g)) {
      const target = relative(root, resolve(root, dirname(file), m[1]));
      const prior = seen.get(target);
      if (prior) assert.equal(m[2], prior.v, `${target}: v=${m[2]} in ${file} but v=${prior.v} in ${prior.file}`);
      else seen.set(target, { v: m[2], file });
    }
  }
  assert.ok(seen.size > 5);
});
