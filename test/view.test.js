import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WebSocket } from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = [
  process.env.MERIDIAN_CHROME,
  "/opt/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
].find((path) => path && existsSync(path));

test("the view paints the dummy at the pad", { skip: !chrome, timeout: 20000 }, async () => {
  const site = await serve(root);
  const dir = await mkdtemp(join(tmpdir(), "meridian-view-"));
  const browser = spawn(chrome, [
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${dir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    const port = await debugPort(browser);
    await open(port, `${site}/tools/view/index.html?look=dummy&still=1`);
    const text = await pageText(port, "ready");
    assert.match(text, /ready/);
    const [red, , blue] = text.split(" ").pop().split(",").map(Number);
    assert.ok(red > blue, text);
  } finally {
    browser.kill("SIGKILL");
    await site.close();
    await rm(dir, { recursive: true, force: true });
  }
});

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

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
};

function serve(dir) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const path = join(dir, decodeURIComponent(url.pathname));
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
  if (!created.ok) throw new Error(`json/new ${created.status}`);
  return created.json();
}

async function pageText(port, needle) {
  const deadline = Date.now() + 15000;
  let socket;
  while (Date.now() < deadline) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((item) => item.type === "page" && item.url.includes("view"));
    if (!page) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }
    socket = new WebSocket(page.webSocketDebuggerUrl);
    break;
  }
  if (!socket) throw new Error("view never opened");
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
      expression: "document.querySelector('canvas')?.dataset.ready ? ('ready ' + document.querySelector('canvas').dataset.center) : ''",
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
  throw new Error(`view never painted\n${last}`);
}
