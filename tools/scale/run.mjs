#!/usr/bin/env node
// Headless scaling bench. Serves nothing itself: start `node tools/serve.js` first.
//   node tools/scale/run.mjs --url http://127.0.0.1:8080 --max 50 --out scale.json [--lighthouse wss://...]
// Needs Playwright (npm i -D playwright, or PLAYWRIGHT=/path/to/playwright/index.mjs).
// Note: real peer-to-peer runs need a browser with WebRTC allowed; without a lighthouse
// the bench checks movement only.
import { writeFileSync } from "node:fs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = arg("url", "http://127.0.0.1:8080");
const q = new URLSearchParams({ auto: "1", max: arg("max", "50"), settle: arg("settle", "8"), budget: arg("budget", "2.5") });
if (arg("lighthouse")) q.set("lighthouse", arg("lighthouse"));
const out = arg("out", "scale.json");
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("[page]", m.text()); });
await page.goto(`${base}/tools/scale/index.html?${q}`);
const timeout = Number(arg("timeout", "1800")) * 1000;
await page.waitForFunction(() => window.benchResult, null, { timeout, polling: 1000 });
const result = await page.evaluate(() => window.benchResult);
if (arg("shot")) await page.screenshot({ path: arg("shot") });
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`${result.result}: ${result.maxPassed} clients passed${result.firstFailure ? `, failed at ${result.firstFailure.clients}: ${result.firstFailure.failures.slice(0, 3).join("; ")}` : ""} → ${out}`);
await browser.close();
process.exit(result.result === "pass" ? 0 : 1);
