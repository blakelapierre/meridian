#!/usr/bin/env node
// Headless playthrough (Batch 18): drives one solo player through the building features with the
// same key/trigger paths a person uses (via meridianProbe hooks) and reports pass/fail per feature.
//   CHROME=/path/to/chrome node tools/playthrough/run.mjs [--out playthrough.json]
// No lighthouse, no WebRTC: everything here is local sim.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outAt = process.argv.indexOf("--out");
const out = outAt > 0 ? process.argv[outAt + 1] : "playthrough.json";
const { createStaticServer } = await import("../serve.js");
const site = await createStaticServer(root);
const url = `${String(site).replace(/\/$/, "")}/tools/view/index.html?lighthouse=off&nopaint=1`;
const chrome = spawn(process.env.CHROME || "/usr/bin/google-chrome", ["--headless=new", "--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--remote-debugging-port=0", `--user-data-dir=${mkdtempSync(join(tmpdir(), "pt-"))}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const port = await new Promise((ok) => { let b = ""; chrome.stderr.on("data", (d) => { b += d; const m = b.match(/127\.0\.0\.1:(\d+)/); if (m) ok(Number(m[1])); }); });
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok) => ws.once("open", ok));
let id = 0;
const waiting = new Map();
ws.on("message", (raw) => { const m = JSON.parse(raw); if (m.id && waiting.has(m.id)) waiting.get(m.id)(m); });
const ev = (expr) => new Promise((ok) => {
  const n = ++id;
  waiting.set(n, (m) => ok(m.result?.result?.value ?? { error: m.result?.exceptionDetails?.exception?.description || m.error?.message }));
  ws.send(JSON.stringify({ id: n, method: "Runtime.evaluate", params: { expression: `(()=>{const p=window.meridianProbe;return ${expr};})()`, returnByValue: true } }));
  setTimeout(() => ok({ error: "timeout" }), 15000);
});
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const until = async (expr, ms) => { const end = Date.now() + ms; for (;;) { const v = await ev(expr); if (v === true) return true; if (Date.now() > end) return false; await sleep(250); } };
const state = () => ev("p.state()");
const results = {};
const mark = async (name, pass, note = "") => { results[name] = { pass: Boolean(pass), note, state: await state() }; console.log(`${pass ? "PASS" : "FAIL"} ${name} ${note}`); };

try {
  if (!(await until("Boolean(p && p.state && p.tick() > 0)", 60000))) throw new Error(`probe never came up: ${JSON.stringify(await ev("typeof p + ' ' + document.title"))}`);
  // Stand 2 m south of the footing, looking north at normal pitch, hammer in hand.
  let s = await state();
  const foot = s.pieces.find((x) => x.startsWith("footing@")).split("@")[1].split(",").map(Number);
  const fx = foot[0] * 0.5, fy = foot[1] * 0.5;
  await ev(`p.slot("hammer")`);
  await ev(`p.teleport(${fx},${fy - 2})`);
  await ev("p.look(0,-0.25)");
  const aim = await ev("p.aim()");
  await mark("hammerAimNormalPitch", aim && aim.inRange, JSON.stringify(aim));
  await ev("p.hold(true)");
  await until(`p.state().pieces.some((x)=>x.startsWith("hearth@"))`, 240000);
  await ev("p.hold(false)");
  s = await state();
  await mark("hearth", s.pieces.some((x) => x.startsWith("hearth@")), `metal ${s.metal} stone ${s.stone}`);
  // Bind: E selects what is under the crosshair, E again acts on it.
  await ev("p.look(0,-0.25)");
  await ev(`p.key("KeyE")`); await sleep(400);
  await ev(`p.key("KeyE")`); await sleep(400);
  s = await state();
  await mark("bind", s.bound, `selection ${JSON.stringify(s.selection)} report ${s.report}`);
  await mark("deed", s.deed);
  // The vein beside the crate pays the fin's 8 metal.
  await ev(`p.slot("bit")`);
  await ev("p.teleport(8,-148)");
  await ev("p.look(0,-1.2)");
  await ev("p.hold(true)");
  await until("p.state().metal >= 8", 180000);
  await ev("p.hold(false)");
  s = await state();
  await mark("vein", s.metal >= 8, `metal ${s.metal}`);
  await ev(`p.slot("hammer")`);
  await ev(`p.teleport(${fx},${fy - 2})`);
  // Fin: hammer on the hearth while a fin is in the yard.
  await ev("p.look(0,-0.25)");
  await ev("p.hold(true)");
  await until(`p.state().pieces.some((x)=>x.startsWith("fin@"))`, 180000);
  await ev("p.hold(false)");
  s = await state();
  await mark("fin", s.pieces.some((x) => x.startsWith("fin@")), `fins ${s.fins}`);
  // Upkeep and fin pay (cloud-shaded) on the 1800-tick clock: run a few periods so the fin can
  // pay for the post, road and cart below.
  const before = await state();
  for (let i = 0; i < 4; i += 1) {
    await ev("p.skipTicks(1800 - (p.tick() % 1800) - 3)");
    await until(`p.state().upkeeps > ${before.upkeeps + i}`, 20000);
  }
  s = await state();
  await mark("upkeep", s.upkeeps >= before.upkeeps + 4, `upkeeps ${before.upkeeps}→${s.upkeeps} metal ${before.metal}→${s.metal}`);
  await mark("cloud", s.finMetal > before.finMetal, `fin paid ${s.finMetal - before.finMetal} metal (cloud-shaded flux)`);
  // Floor needs stone: dig with the bit until two stone turn up.
  await ev(`p.slot("bit")`);
  await ev("p.look(0,-1.2)");
  const stone0 = (await state()).stone;
  const spoil0 = (await state()).spoil;
  // Dig until the spoil bag is full, fill it back out ([ cycles dig → fill → smooth), repeat.
  let fills = 0;
  for (let i = 0; i < 8; i += 1) {
    await ev(`p.teleport(${fx + 3 + i * 1.5},${fy - 5})`);
    await ev("p.hold(true)");
    if (await until(`p.state().stone > ${stone0} || p.state().report === "full"`, 30000) && (await state()).stone > stone0) break;
    await ev(`p.key("BracketLeft")`);
    await ev(`p.teleport(${fx + 3 + i * 1.5},${fy - 8})`);
    await until("p.state().spoil === 0", 30000);
    fills += 1;
    await ev(`p.key("BracketLeft")`);
    await ev(`p.key("BracketLeft")`);
  }
  await ev("p.hold(false)");
  s = await state();
  await mark("spoilStone", s.stone > stone0, `stone ${stone0}→${s.stone} spoil ${spoil0}→${s.spoil} fills ${fills}`);
  await ev(`p.slot("hammer")`);
  await ev(`p.teleport(${fx - 2},${fy - 2})`);
  await ev("p.look(0,-0.25)");
  await ev(`p.key("KeyF")`); await sleep(300);
  s = await state();
  await mark("floor", s.pieces.some((x) => x.startsWith("floor@")), s.report);
  // Post beside the footing (supported by it).
  // West of the footing, looking east steeply enough that the ray lands on the cell itself.
  await ev(`p.teleport(${fx - 2.5},${fy})`);
  await ev("p.look(Math.PI/2,-0.69)");
  await ev(`p.key("KeyP")`); await sleep(300);
  s = await state();
  await mark("post", s.pieces.some((x) => x.startsWith("post@")), s.report);
  // Road then a cart on it.
  await ev(`p.teleport(${fx + 2},${fy - 2})`);
  await ev("p.look(0,-0.25)");
  await ev(`p.key("KeyL")`); await sleep(300);
  await ev(`p.key("KeyJ")`); await sleep(300);
  s = await state();
  await mark("cart", s.pieces.some((x) => x.startsWith("cart@")), `road ${s.pieces.some((x) => x.startsWith("road@"))} ${s.report}`);
  // Ledge near spawn: stand on top, walk off; then again tucked.
  const drop = async (tuck) => {
    await ev("p.slot(\"bit\")");
    const top = await ev("p.teleport(-13.8, -152.8)");
    const i0 = (await state()).integrity;
    await ev("p.look(-Math.PI/2,-0.2)");
    if (tuck) await ev(`p.key("ControlLeft",{up:false})`);
    await ev(`p.key("KeyW",{up:false})`);
    await sleep(3500);
    await ev(`dispatchEvent(new KeyboardEvent("keyup",{code:"KeyW"}))`);
    await ev(`dispatchEvent(new KeyboardEvent("keyup",{code:"ControlLeft"}))`);
    const i1 = (await state()).integrity;
    return { top, hurt: i0 - i1 };
  };
  const plain = await drop(false);
  const tucked = await drop(true);
  await mark("ledge", plain.top[2] > 4, `top z ${plain.top[2].toFixed(2)} hurt plain ${plain.hurt} tucked ${tucked.hurt}`);
} catch (error) {
  results.error = String(error);
  console.error(error);
} finally {
  writeFileSync(out, JSON.stringify(results, null, 2));
  chrome.kill("SIGKILL");
  await site.close();
}
const failed = Object.entries(results).filter(([k, v]) => k !== "error" && !v.pass).map(([k]) => k);
console.log(failed.length || results.error ? `FAILED: ${failed.join(", ")} ${results.error || ""}` : "ALL PASS");
process.exit(failed.length || results.error ? 1 : 0);
