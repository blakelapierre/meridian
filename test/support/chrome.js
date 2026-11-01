// Finds a Chrome for the browser tests and probes whether WebRTC peer links can open here.
// Tests that need a peer link are reported as KNOWN-BLOCKED (with a reason) when the probe fails,
// never silently skipped. The probe only observes; it does not change any browser policy.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

export const chrome = [
  process.env.CHROME,
  process.env.MERIDIAN_CHROME,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
  "/opt/pw-browsers/chromium-1248/chrome-linux64/chrome",
].find((path) => path && existsSync(path));

export const chromeArgs = (dir) => [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=0",
  `--user-data-dir=${dir}`,
];

export const noChrome = chrome ? false : "no Chrome found (set CHROME=/path/to/chrome)";

let probed;
/** Resolves false when peer links work, or a "KNOWN-BLOCKED: ..." reason string. */
export function p2pBlocked() {
  probed ??= probe();
  return probed;
}

async function probe() {
  if (!chrome) return noChrome;
  if (process.env.MERIDIAN_P2P === "1") return false;
  if (process.env.MERIDIAN_P2P === "0") return "KNOWN-BLOCKED: MERIDIAN_P2P=0";
  const dir = await mkdtemp(join(tmpdir(), "meridian-p2p-"));
  const child = spawn(chrome, [...chromeArgs(dir), "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    const port = await new Promise((resolve, reject) => {
      let buf = "";
      const t = setTimeout(() => reject(new Error("no debug port")), 10000);
      child.stderr.on("data", (c) => {
        buf += c;
        const m = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
        if (m) { clearTimeout(t); resolve(Number(m[1])); }
      });
    });
    let page;
    for (let i = 0; i < 50 && !page; i++) {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((p) => p.type === "page");
      if (!page) await new Promise((r) => setTimeout(r, 100));
    }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.once("open", r));
    const expression = `new Promise((done) => {
      const a = new RTCPeerConnection(), b = new RTCPeerConnection();
      a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
      b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
      b.ondatachannel = (e) => { e.channel.onopen = () => done("open"); };
      a.createDataChannel("probe");
      a.createOffer().then((o) => a.setLocalDescription(o)).then(() => b.setRemoteDescription(a.localDescription))
        .then(() => b.createAnswer()).then((o) => b.setLocalDescription(o)).then(() => a.setRemoteDescription(b.localDescription))
        .catch((e) => done("error " + e));
      setTimeout(() => done("timeout"), 6000);
    })`;
    const result = await new Promise((resolve) => {
      ws.on("message", (raw) => { const m = JSON.parse(raw); if (m.id === 1) resolve(m.result?.result?.value); });
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true } }));
    });
    ws.close();
    return result === "open" ? false : `KNOWN-BLOCKED: this machine's WebRTC policy stops peer data channels (probe: ${result}); set MERIDIAN_P2P=1 to force`;
  } catch (error) {
    return `KNOWN-BLOCKED: WebRTC probe failed (${error.message})`;
  } finally {
    await killChrome(child);
    await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}

export function killChrome(child) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGKILL");
    setTimeout(resolve, 2000);
  });
}
