import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WebSocket } from "ws";
import { createLighthouse } from "../tools/signal/server.js";
import { createStaticServer } from "../tools/serve.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = [
  process.env.MERIDIAN_CHROME,
  "/opt/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
].find((path) => path && existsSync(path));

test("two browsers apply one dig and print the same hash", { skip: !chrome, timeout: 20000 }, async () => {
  const lighthouse = await createLighthouse(0);
  const site = await createStaticServer(root);
  const dirA = await mkdtemp(join(tmpdir(), "meridian-dig-a-"));
  const dirB = await mkdtemp(join(tmpdir(), "meridian-dig-b-"));
  const browserA = launch(chrome, dirA);
  const browserB = launch(chrome, dirB);
  try {
    const portA = await debugPort(browserA);
    const portB = await debugPort(browserB);
    const query = `signal=${encodeURIComponent(lighthouse.url)}`;
    await open(portA, `${site}/tools/dig/index.html?id=a&to=b&offer=1&${query}`);
    await open(portB, `${site}/tools/dig/index.html?id=b&to=a&${query}`);
    const leader = await pageText(portA, "dig", "voxel 500");
    const witness = await pageText(portB, "dig", "voxel 500");
    assert.match(leader, /applied/);
    assert.match(witness, /applied/);
    assert.equal(leader.match(/hash ([0-9a-f]+)/)[1], witness.match(/hash ([0-9a-f]+)/)[1]);
  } finally {
    browserA.kill("SIGKILL");
    browserB.kill("SIGKILL");
    await lighthouse.close();
    await site.close();
    await rm(dirA, { recursive: true, force: true });
    await rm(dirB, { recursive: true, force: true });
  }
});

function launch(bin, dir) {
  return spawn(bin, [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-features=WebRtcHideLocalIpsWithMdns",
    "--remote-debugging-port=0",
    `--user-data-dir=${dir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
}

function debugPort(child) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`chrome did not open a debug port\n${buffer}`)), 8000);
    child.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve(Number(match[1]));
    });
  });
}

async function open(port, url) {
  const created = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!created.ok) throw new Error(`json/new ${created.status}`);
  return created.json();
}

async function pageText(port, urlPart, needle) {
  const deadline = Date.now() + 15000;
  let socket;
  while (Date.now() < deadline) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((item) => item.type === "page" && item.url.includes(urlPart));
    if (!page) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }
    socket = new WebSocket(page.webSocketDebuggerUrl);
    break;
  }
  if (!socket) throw new Error("dig page never opened");
  await new Promise((resolve) => socket.once("open", resolve));
  let id = 0;
  const pending = new Map();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id && pending.has(message.id)) pending.get(message.id)(message.result);
  });
  const send = (method, params) => new Promise((resolve) => {
    const next = ++id;
    pending.set(next, resolve);
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  let last = "";
  while (Date.now() < deadline) {
    const result = await send("Runtime.evaluate", {
      expression: "document.querySelector('pre')?.textContent || ''",
      returnByValue: true,
    });
    last = result?.result?.value || "";
    if (last.includes(needle)) {
      socket.close();
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  socket.close();
  throw new Error(`dig did not agree\n${last}`);
}
