import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WebSocket } from "ws";
import { createLighthouse } from "../tools/signal/server.js";
import { acceptPosition, decodePosition, encodePosition } from "../src/net/position.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = [
  process.env.MERIDIAN_CHROME,
  "/opt/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
  "/opt/pw-browsers/chromium-1248/chrome-linux64/chrome",
].find((path) => path && existsSync(path));

test("the lighthouse forwards an opaque blob and refuses a huge one", async () => {
  const server = await createLighthouse(0);
  const a = new WebSocket(server.url);
  const b = new WebSocket(server.url);
  await Promise.all([opened(a), opened(b)]);
  a.send(JSON.stringify({ type: "announce", pubkey: "a", cell: "atoll-0" }));
  b.send(JSON.stringify({ type: "announce", pubkey: "b", cell: "atoll-0" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const heard = new Promise((resolve) => {
    b.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "signal") resolve(message);
    });
  });
  a.send(JSON.stringify({ type: "signal", to: "b", from: "a", blob: "sdp-offer" }));
  const message = await heard;
  assert.equal(message.blob, "sdp-offer");
  assert.equal(message.from, "a");
  const rejected = new Promise((resolve) => {
    a.on("message", (raw) => {
      const body = JSON.parse(raw.toString());
      if (body.type === "reject") resolve(body);
    });
  });
  a.send(JSON.stringify({ type: "signal", to: "b", from: "a", blob: "x".repeat(70_000) }));
  assert.equal((await rejected).reason, "blob");
  a.terminate();
  b.terminate();
  await server.close();
});

test("an older position packet does not overwrite a newer one", () => {
  const first = encodePosition({ tick: 2, x: 1.5, y: -12.5, z: 0 });
  const late = encodePosition({ tick: 1, x: 9, y: 9, z: 9 });
  const latest = acceptPosition(acceptPosition(null, first), late);
  assert.equal(latest.tick, 2);
  assert.equal(latest.x, 1.5);
  assert.equal(latest.y, -12.5);
  assert.deepEqual(decodePosition(first), { tick: 2, x: 1.5, y: -12.5, z: 0 });
});

test("two browsers trade an unreliable position", { skip: !chrome, timeout: 20000 }, async () => {
  const lighthouse = await createLighthouse(0);
  const site = await serve(root);
  const dirA = await mkdtemp(join(tmpdir(), "meridian-a-"));
  const dirB = await mkdtemp(join(tmpdir(), "meridian-b-"));
  const browserA = launch(dirA);
  const browserB = launch(dirB);
  try {
    const portA = await debugPort(browserA);
    const portB = await debugPort(browserB);
    const query = `signal=${encodeURIComponent(lighthouse.url)}`;
    await open(portA, `${site}/tools/link/index.html?id=a&to=b&offer=1&${query}`);
    await open(portB, `${site}/tools/link/index.html?id=b&to=a&${query}`);
    const text = await pageText(portB, "remote ");
    assert.match(text, /remote -?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+ @\d+/);
  } finally {
    browserA.kill("SIGKILL");
    browserB.kill("SIGKILL");
    await lighthouse.close();
    await site.close();
    await rm(dirA, { recursive: true, force: true });
    await rm(dirB, { recursive: true, force: true });
  }
});

function launch(dir) {
  return spawn(chrome, [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-features=WebRtcHideLocalIpsWithMdns",
    "--remote-debugging-port=0",
    `--user-data-dir=${dir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
}

function opened(socket) {
  return new Promise((resolve) => socket.once("open", resolve));
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

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };

function serve(dir) {
  const server = createServer(async (request, response) => {
    const path = join(dir, decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname));
    try {
      const body = await readFile(path);
      response.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        toString() { return `http://127.0.0.1:${port}`; },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

async function open(port, url) {
  const created = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!created.ok) {
    const again = await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: "PUT" });
    if (!again.ok) throw new Error(`json/new ${created.status}`);
    return again.json();
  }
  return created.json();
}

async function pageText(port, needle) {
  const deadline = Date.now() + 12000;
  let socket;
  while (Date.now() < deadline) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((item) => item.type === "page" && item.url.includes("link"));
    if (!page) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }
    socket = new WebSocket(page.webSocketDebuggerUrl);
    break;
  }
  if (!socket) throw new Error("link page never opened");
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
  throw new Error(`position never arrived\n${last}`);
}
