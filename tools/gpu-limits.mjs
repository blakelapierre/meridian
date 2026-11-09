// Boot the view in headless Chrome (SwiftShader) with an emulated mobile GPU limit, in the page AND
// in the picture worker (patched before it runs). Prints the curtain line, #glerr and dataset.
// usage: node tools/gpu-limits.mjs <root> "<query>" <scenario> <waitMs> [out.png]
// scenarios: none | slow (each compileShader busy-waits 15 s) | units8 (MAX_TEXTURE_IMAGE_UNITS 8)
//            | bigfail (the full trace shader fails to compile, like a driver resource limit; lite compiles)
//            | slowfull (only the full-effects shader's compile busy-waits 20 s; no parallel compile)
//            | parallel (fake KHR_parallel_shader_compile: a full-effects program reports done 20 s after link)
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [root, query, scenario = "none", waitArg = "40000", out] = process.argv.slice(2);
const waitMs = Number(waitArg);
const patches = {
  none: "",
  slow: `(() => { const P = WebGL2RenderingContext.prototype; const c = P.compileShader; P.compileShader = function (s) { const t = Date.now(); while (Date.now() - t < 15000) {} return c.call(this, s); }; })();`,
  units8: `(() => { const P = WebGL2RenderingContext.prototype; const g = P.getParameter; P.getParameter = function (k) { if (k === 0x8872) return 8; return g.call(this, k); }; })();`,
  bigfail: `(() => { const P = WebGL2RenderingContext.prototype; const src = new WeakMap(); const ss = P.shaderSource; P.shaderSource = function (s, t) { src.set(s, t.includes("const bool LITE = false") ? 1e9 : t.length); return ss.call(this, s, t); }; const gp = P.getShaderParameter; P.getShaderParameter = function (s, k) { if (k === 0x8B81 && (src.get(s) || 0) > 5e8) return false; return gp.call(this, s, k); }; const gl = P.getShaderInfoLog; P.getShaderInfoLog = function (s) { if ((src.get(s) || 0) > 5e8) return "ERROR: emulated driver: shader too large"; return gl.call(this, s); }; })();`,
};
patches.slowfull = `(() => { const P = WebGL2RenderingContext.prototype; const full = new WeakSet(); const ss = P.shaderSource; P.shaderSource = function (s, t) { if (t.includes("const bool LITE = false")) full.add(s); return ss.call(this, s, t); }; const c = P.compileShader; P.compileShader = function (s) { if (full.has(s)) { const t = Date.now(); while (Date.now() - t < 20000) {} } return c.call(this, s); }; })();`;
patches.parallel = `(() => { const P = WebGL2RenderingContext.prototype; const EXT = { COMPLETION_STATUS_KHR: 0x91B1, MAX_SHADER_COMPILER_THREADS_KHR: 0x91B0 }; const ge = P.getExtension; P.getExtension = function (n) { return n === "KHR_parallel_shader_compile" ? EXT : ge.call(this, n); }; const full = new WeakSet(); const ss = P.shaderSource; P.shaderSource = function (s, t) { if (t.includes("const bool LITE = false")) full.add(s); return ss.call(this, s, t); }; const shaders = new WeakMap(); const at = P.attachShader; P.attachShader = function (p, s) { if (full.has(s)) shaders.set(p, true); return at.call(this, p, s); }; const linked = new WeakMap(); const lp = P.linkProgram; P.linkProgram = function (p) { linked.set(p, Date.now()); return lp.call(this, p); }; const gp = P.getProgramParameter; P.getProgramParameter = function (p, k) { if (k === 0x91B1) return !shaders.get(p) || Date.now() - linked.get(p) > 20000; return gp.call(this, p, k); }; })();`;
patches.nowebgl2 = `(() => { if (self.HTMLCanvasElement) { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, o) { return k === "webgl2" ? null : g.call(this, k, o); }; } if (self.OffscreenCanvas) { const og = OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext = function (k, o) { return k === "webgl2" ? null : og.call(this, k, o); }; } })();`;
patches.nooffscreen = `(() => { try { delete HTMLCanvasElement.prototype.transferControlToOffscreen; } catch {} try { delete self.OffscreenCanvas; } catch {} })();`;
patches.noworkermodule = `(() => { if (!self.Worker) return; const W = self.Worker; self.Worker = function (url, opts) { if (opts && opts.type === "module") throw new TypeError("Module scripts are not supported on DedicatedWorker yet"); return new W(url, opts); }; })();`;
patches.badworker = `(() => { if (!self.Worker) return; const W = self.Worker; self.Worker = function (url, opts) { return new W(String(url).replace(/render-worker\.js/, "render-worker-missing.js"), opts); }; })();`;
patches.badmodule = "";
const patch = patches[scenario];
// root may be a live site URL (e.g. https://…/meridian/) instead of a checkout.
const live = /^https?:/.test(root);
const site = live ? { toString: () => root, close: () => {} } : await (await import(join(root, "tools/serve.js"))).createStaticServer(root);
const url = `${String(site).replace(/\/$/, "")}/tools/view/index.html?${query}`;
const dir = await mkdtemp(join(tmpdir(), "m27r-"));
const child = spawn("/usr/bin/google-chrome", ["--headless=new", "--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=412,800", "--no-first-run", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${dir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
try {
  const port = await new Promise((done, fail) => { let buf = ""; const t = setTimeout(() => fail(new Error("no port")), 15000); child.stderr.on("data", (c) => { buf += c; const m = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) { clearTimeout(t); done(Number(m[1])); } }); });
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  ws.addEventListener("message", async (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Target.attachedToTarget") {
      const sid = m.params.sessionId;
      if (patch) await send("Runtime.evaluate", { expression: patch }, sid);
      await send("Runtime.runIfWaitingForDebugger", {}, sid);
    }
  });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" });
  await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  if (patch) await send("Page.addScriptToEvaluateOnNewDocument", { source: patch });
  await send("Page.enable");
  await send("Runtime.enable");
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.method === "Runtime.exceptionThrown") console.log("EXCEPTION", (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || "").slice(0, 300));
    if (m.method === "Runtime.consoleAPICalled" && /error|warn/.test(m.params.type)) console.log("CONSOLE", m.params.type, m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") console.log("LOG", m.params.entry.text.slice(0, 300), m.params.entry.url || "");
  });
  await send("Log.enable");
  if (scenario === "badmodule") await send("Fetch.enable", { patterns: [{ urlPattern: "*src/app/picture.js*" }] });
  ws.addEventListener("message", (ev) => { const m = JSON.parse(String(ev.data)); if (m.method === "Fetch.requestPaused") send("Fetch.failRequest", { requestId: m.params.requestId, errorReason: "Failed" }); });
  await send("Page.navigate", { url });
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < waitMs) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await Promise.race([new Promise((r) => setTimeout(() => r({ result: { result: { value: "(page busy: no answer in 5 s)" } } }), 5000)), send("Runtime.evaluate", { returnByValue: true, expression: `JSON.stringify({ q: location.search, boot: document.querySelector("#boot [data-boot-line]")?.textContent, bootHidden: document.querySelector("#boot")?.hidden, fx: document.querySelector("#fxnote")?.textContent || "", glerr: document.querySelector("#glerr")?.hidden ? "" : document.querySelector("#glerr")?.textContent, ds: Object.fromEntries(Object.entries(document.querySelector("canvas")?.dataset || {}).filter(([k]) => /renderer|picture|gpu|ready|center/.test(k))) })` })]);
    const v = r.result?.result?.value || "";
    if (v !== last) { console.log(`${Math.round((Date.now() - t0) / 1000)}s`, v.slice(0, 1400)); last = v; }
  }
  if (out) { const shot = await send("Page.captureScreenshot", { format: "png" }); await writeFile(out, Buffer.from(shot.result.data, "base64")); }
  ws.close();
} finally { child.kill("SIGKILL"); await site.close?.(); await rm(dir, { recursive: true, force: true }).catch(() => {}); }
process.exit(0);
