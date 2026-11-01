#!/usr/bin/env node
// Headless scaling bench.
//   node tools/scale/run.mjs --url http://127.0.0.1:8080 --max 50 --out scale.json [--lighthouse wss://...]
//   node tools/scale/run.mjs --solo --max 4      # smoke: serves the repo itself, no lighthouse, movement checks only
// Uses Playwright when it is installed (PLAYWRIGHT=/path/to/playwright/index.mjs also works);
// otherwise drives a local Chrome over the DevTools protocol (CHROME=/path, or /usr/bin/google-chrome).
// Real peer-to-peer runs need a browser with WebRTC allowed; without a lighthouse the bench checks movement only.
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const solo = flag("solo");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let site = null;
let base = arg("url");
if (!base) {
  if (!solo) base = "http://127.0.0.1:8080";
  else {
    const { createStaticServer } = await import("../serve.js");
    site = await createStaticServer(root);
    base = String(site);
  }
}
const q = new URLSearchParams({ auto: "1", max: arg("max", solo ? "4" : "50"), settle: arg("settle", solo ? "5" : "8"), budget: arg("budget", "2.5") });
if (solo) {
  q.set("lighthouse", "off");
  q.set("expect", "move");
} else if (arg("lighthouse")) q.set("lighthouse", arg("lighthouse"));
const out = arg("out", solo ? "scale-solo.json" : "scale.json");
const timeout = Number(arg("timeout", solo ? "300" : "1800")) * 1000;
const url = `${base.replace(/\/$/, "")}/tools/scale/index.html?${q}`;

let result;
try {
  let playwright = null;
  try { playwright = await import(process.env.PLAYWRIGHT || "playwright"); } catch {}
  result = playwright ? await viaPlaywright(playwright.chromium) : await viaCdp();
} finally {
  await site?.close();
}
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`${result.result}: ${result.maxPassed} clients passed${result.firstFailure ? `, failed at ${result.firstFailure.clients}: ${result.firstFailure.failures.slice(0, 3).join("; ")}` : ""} → ${out}`);
process.exit(result.result === "pass" ? 0 : 1);

async function viaPlaywright(chromium) {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on("pageerror", (e) => console.error("[pageerror]", e.message));
    page.on("console", (m) => { if (m.type() === "error") console.error("[page]", m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.benchResult, null, { timeout, polling: 1000 });
    const value = await page.evaluate(() => window.benchResult);
    if (arg("shot")) await page.screenshot({ path: arg("shot") });
    return value;
  } finally {
    await browser.close();
  }
}

async function viaCdp() {
  const chrome = [process.env.CHROME, process.env.MERIDIAN_CHROME, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find((p) => p && existsSync(p));
  if (!chrome) throw new Error("No Playwright and no Chrome found: set CHROME=/path/to/chrome or npm i -D playwright");
  const { WebSocket } = await import("ws");
  const dir = await mkdtemp(join(tmpdir(), "meridian-scale-"));
  const child = spawn(chrome, ["--headless=new", "--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required",
    "--window-size=1600,900", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    const port = await new Promise((done, fail) => {
      let buf = "";
      const t = setTimeout(() => fail(new Error("chrome did not open a debug port")), 15000);
      child.stderr.on("data", (c) => {
        buf += c;
        const m = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
        if (m) { clearTimeout(t); done(Number(m[1])); }
      });
    });
    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.once("open", r));
    let id = 0;
    const pending = new Map();
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === "Runtime.exceptionThrown") console.error("[pageerror]", m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    });
    const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    await send("Runtime.enable");
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const m = await send("Runtime.evaluate", { expression: "window.benchResult ? JSON.stringify(window.benchResult) : ''", returnByValue: true });
      const text = m.result?.result?.value;
      if (text) { ws.close(); return JSON.parse(text); }
      await new Promise((r) => setTimeout(r, 1000));
    }
    ws.close();
    throw new Error(`bench did not finish in ${timeout / 1000}s`);
  } finally {
    await new Promise((r) => { child.once("exit", r); child.kill("SIGKILL"); setTimeout(r, 2000); });
    await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}
