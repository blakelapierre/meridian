// Scaling bench: grows from 2 clients to `max`, one per passed level, and stops on the first
// failure. Every client is a same-origin iframe of the view with its own ?ns= (storage and
// identity) and a seeded wander bot. Thumbnails paint at 1 fps (sim and net stay full speed);
// the large pane paints at full speed. Click a thumbnail to promote it.
//
// URL: ?max=50&settle=8&budget=2.5&lighthouse=ws://...&auto=1&expect=net|move
// window.benchResult holds the report when done (tools/scale/run.mjs reads it).

const params = new URLSearchParams(location.search);
const MAX = Math.max(2, Math.min(50, Number(params.get("max")) || 50));
const SETTLE_S = Number(params.get("settle")) || 8;
const BUDGET_M = Number(params.get("budget")) || 2.5;
const LINK_CAP = 8;
const lighthouse = params.get("lighthouse") || "";
// "net" also checks remote poses; it needs a lighthouse and working WebRTC.
const expectNet = (params.get("expect") || (lighthouse ? "net" : "move")) === "net";
const stage = document.querySelector("#stage");
const logBox = document.querySelector("#log");
const statusBox = document.querySelector("#status");
const clients = [];
let primary = 0;
let running = false;
let mainBot = true;
const report = { started: new Date().toISOString(), max: MAX, settleS: SETTLE_S, budgetM: BUDGET_M, expectNet, lighthouse: lighthouse ? "custom" : "none", levels: [], result: "running" };
window.benchResult = null;

const log = (line) => {
  logBox.textContent += `${line}\n`;
  logBox.scrollTop = logBox.scrollHeight;
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const probe = (client) => {
  try { return client.frame.contentWindow?.meridianProbe || null; } catch { return null; }
};

function clientUrl(i) {
  const q = new URLSearchParams({ ns: `scale${i}`, bot: String(1000 + i * 7919), paintfps: i === primary ? "0" : "1", touch: "0" });
  if (lighthouse) q.set("lighthouse", lighthouse);
  else q.set("lighthouse", "off");
  return `../view/index.html?${q}`;
}

function layout() {
  const thumbs = clients.filter((c) => c.index !== primary);
  const w = stage.clientWidth * 0.34;
  const cols = Math.max(2, Math.ceil(Math.sqrt(thumbs.length * 1.6)));
  const tw = w / cols;
  const th = tw * 0.5625;
  thumbs.forEach((c, k) => {
    const box = { left: `${stage.clientWidth * 0.66 + (k % cols) * tw}px`, top: `${Math.floor(k / cols) * th}px`, width: `${tw - 4}px`, height: `${th - 4}px` };
    Object.assign(c.frame.style, box);
    Object.assign(c.shield.style, box);
    c.frame.classList.remove("primary");
    c.shield.hidden = false;
  });
  const p = clients[primary];
  if (p) {
    p.frame.classList.add("primary");
    p.frame.removeAttribute("style");
    p.shield.hidden = true;
  }
}

// Promote: the old primary drops to 1 fps, the new one paints at full speed. No reload.
function promote(index) {
  const old = clients[primary];
  primary = index;
  probe(old)?.setPaintFps(1);
  probe(old)?.setBot(true);
  const now = clients[primary];
  probe(now)?.setPaintFps(0);
  probe(now)?.setBot(mainBot);
  now.frame.focus();
  layout();
}

function addClient() {
  const index = clients.length;
  const frame = document.createElement("iframe");
  frame.title = `client ${index}`;
  frame.src = clientUrl(index);
  const shield = document.createElement("div");
  shield.className = "shield";
  shield.innerHTML = `<span>#${index}</span>`;
  shield.addEventListener("click", () => promote(index));
  stage.append(frame, shield);
  clients.push({ index, frame, shield, lastMoved: 0 });
  layout();
}

async function waitReady(timeoutMs = 60000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (clients.every((c) => probe(c) && probe(c).fps() > 0)) return true;
    await sleep(250);
  }
  return false;
}

function checkLevel(n) {
  const failures = [];
  const snap = clients.map((c) => {
    const p = probe(c);
    if (!p) return { index: c.index, missing: true };
    return { index: c.index, id: p.id(), pose: p.pose(), remotes: p.remotes(), links: p.links().length, bot: p.bot(), fps: p.fps(), errors: p.errors(), gpuError: p.gpuError() };
  });
  const byId = new Map(snap.filter((s) => s.id).map((s) => [s.id, s]));
  let worst = 0;
  for (const s of snap) {
    const c = clients[s.index];
    if (s.missing) { failures.push(`#${s.index} has no probe`); continue; }
    const moved = (s.bot?.moved || 0) - c.lastMoved;
    c.lastMoved = s.bot?.moved || 0;
    s.movedThisLevel = Math.round(moved * 100) / 100;
    if (moved < 1) failures.push(`#${s.index} not moving (${moved.toFixed(2)} m)`);
    if (s.errors.length) failures.push(`#${s.index} errors: ${s.errors[0]}`);
    if (expectNet) {
      const want = Math.min(n - 1, LINK_CAP);
      if (s.remotes.length < want) failures.push(`#${s.index} sees ${s.remotes.length}/${want} peers`);
      for (const r of s.remotes) {
        const truth = byId.get(r.id);
        if (!truth) continue;
        const err = Math.hypot(r.x - truth.pose.x, r.y - truth.pose.y);
        worst = Math.max(worst, err);
        if (err > BUDGET_M) failures.push(`#${s.index} sees ${r.id} off by ${err.toFixed(2)} m`);
      }
    }
    c.shield.classList.toggle("bad", failures.some((f) => f.startsWith(`#${s.index} `)));
  }
  return { clients: n, ok: failures.length === 0, failures, worstPoseErrorM: Math.round(worst * 100) / 100, net: expectNet ? "checked" : "not checked (no lighthouse)", snap: snap.map(({ remotes, ...rest }) => ({ ...rest, remotes: remotes?.length ?? 0 })) };
}

async function run() {
  if (running) return;
  running = true;
  log(`start: 2 → ${MAX} clients, settle ${SETTLE_S}s, pose budget ${BUDGET_M} m, net ${expectNet ? "on" : "off"}`);
  while (clients.length < 2) addClient();
  for (let n = 2; n <= MAX && running; n += 1) {
    while (clients.length < n) addClient();
    statusBox.textContent = `level ${n}: loading`;
    if (!(await waitReady())) {
      report.levels.push({ clients: n, ok: false, failures: ["clients did not start in 60 s"] });
      break;
    }
    for (const c of clients) c.lastMoved = probe(c)?.bot()?.moved || 0;
    statusBox.textContent = `level ${n}: settling ${SETTLE_S}s`;
    await sleep(SETTLE_S * 1000);
    const level = checkLevel(n);
    report.levels.push(level);
    log(`level ${n}: ${level.ok ? "pass" : "FAIL"}${level.ok ? "" : ` · ${level.failures.slice(0, 3).join("; ")}`}`);
    if (!level.ok) break;
  }
  const last = report.levels.at(-1);
  const passed = report.levels.filter((l) => l.ok).length;
  report.result = last?.ok ? "pass" : "fail";
  report.maxPassed = passed ? report.levels.filter((l) => l.ok).at(-1).clients : 0;
  report.firstFailure = last?.ok ? null : last;
  report.finished = new Date().toISOString();
  statusBox.textContent = `${report.result}: ${report.maxPassed} clients passed${last?.ok ? "" : `, failed at ${last?.clients}`}`;
  log(statusBox.textContent);
  window.benchResult = report;
  running = false;
}

document.querySelector("#start").onclick = run;
document.querySelector("#stop").onclick = () => { running = false; };
document.querySelector("#max").value = String(MAX);
document.querySelector("#botToggle").onclick = (event) => {
  mainBot = !mainBot;
  probe(clients[primary])?.setBot(mainBot);
  event.target.textContent = `Main: ${mainBot ? "bot" : "manual"}`;
  if (!mainBot) clients[primary]?.frame.focus();
};
document.querySelector("#export").onclick = () => {
  const blob = new Blob([JSON.stringify(window.benchResult || report, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `meridian-scale-${Date.now()}.json` });
  a.click();
};
addEventListener("resize", layout);
if (params.get("auto") === "1") run();
