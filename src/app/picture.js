// The picture runs on its own thread when the browser can hand it an OffscreenCanvas.
// The page keeps the buttons. ?gl=main forces the old on-page picture.

// How to draw. ?gl=main: the traced picture on the page thread; ?gl=cpu: the CPU picture only.
// The picture boots on the lite trace shader (quick to compile, most of all on phones) and the
// full-effects shader builds in the background and swaps in when it links (`upgrade`).
// ?gl=full: the full shader from the start; ?gl=lite: stay lite.
export function pictureMode(search = "", ua = "", mobileHint = null) {
  const gl = new URLSearchParams(search).get("gl") || "";
  const mobile = mobileHint === true || /Android|iPhone|iPad|iPod|Mobile/i.test(String(ua));
  return {
    where: gl === "cpu" ? "cpu" : gl === "main" ? "main" : "worker",
    lite: gl !== "full",
    upgrade: gl !== "full" && gl !== "lite",
    mobile,
  };
}
// How long the picture thread may take to say it is ready. It reports its stage first, and a
// phone may need most of a minute to compile; past this the page falls back to the CPU picture.
export const PICTURE_DEADLINE_MS = 90000;

// Module workers (Chrome 80+, Safari 15+, Firefox 114+): an older browser ignores `type` and would
// load the thread as a classic script, which fails on its first import. The options getter is the
// standard probe: it is only read when the browser knows the option.
export function moduleWorkers(WorkerImpl = globalThis.Worker) {
  if (WorkerImpl && WorkerImpl.moduleProbe != null) return Boolean(WorkerImpl.moduleProbe);
  let known = false;
  try {
    const url = typeof Blob === "function" && globalThis.URL?.createObjectURL ? URL.createObjectURL(new Blob([""], { type: "text/javascript" })) : "data:text/javascript,";
    const probe = new WorkerImpl(url, { get type() { known = true; return "module"; } });
    probe.terminate?.();
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  } catch {}
  return known;
}

export function openPicture(canvas, { search = "", WorkerImpl = globalThis.Worker, ua = globalThis.navigator?.userAgent || "", mobile = globalThis.navigator?.userAgentData?.mobile ?? null, deadlineMs = PICTURE_DEADLINE_MS } = {}) {
  const mode = pictureMode(search, ua, mobile);
  // No picture thread possible (no OffscreenCanvas, no module workers, or it throws): trace on the
  // page thread instead. `mode` is always returned, since the page reads it.
  const onPage = (why) => ({ painter: null, remote: false, mode: { ...mode, where: "main", why } });
  if (mode.where !== "worker") return { painter: null, remote: false, mode };
  if (!canvas || typeof canvas.transferControlToOffscreen !== "function") return onPage("no OffscreenCanvas");
  if (typeof WorkerImpl !== "function" || !moduleWorkers(WorkerImpl)) return onPage("no module workers");
  let thread;
  try {
    thread = new WorkerImpl(new URL("./render-worker.js?v=10", import.meta.url), { type: "module" });
  } catch (error) {
    return onPage(`worker: ${error?.message || error}`);
  }
  let offscreen;
  try { offscreen = canvas.transferControlToOffscreen(); } catch (error) {
    thread.terminate?.();
    return onPage(`offscreen: ${error?.message || error}`);
  }
  let reason = "";
  let settled = false;
  let finish;
  const ready = new Promise((resolve) => { finish = resolve; });
  let stage = "starting the picture thread";
  let facts = null;
  let effects = { state: mode.lite ? "lite" : "full", log: "", ms: 0, parallel: false };
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    reason = `the picture thread did not start within ${Math.round(deadlineMs / 1000)} s (last: ${stage})`;
    finish(false);
  }, deadlineMs);
  const painter = {
    remote: true,
    ready,
    onProblem: null,
    onDrew: null,
    failReason: () => reason,
    stage: () => stage,
    effects: () => effects,
    facts: () => facts,
    onStage: null,
    onEffects: null,
    lite: mode.lite,
    // Stop the thread (after a failure, before the page takes the picture back).
    close() { try { thread.terminate?.(); } catch {} },
    resize(width, height) { thread.postMessage({ type: "size", width, height }); },
    paint(scene, width, height) {
      try {
        thread.postMessage({ type: "paint", scene, width, height });
        return true;
      } catch (error) {
        reason = String(error && error.message || error);
        painter.onProblem?.(reason);
        return false;
      }
    },
    paintStage(stage, width, height) {
      try {
        thread.postMessage({ type: "stage", stage, width, height });
        return true;
      } catch (error) {
        reason = String(error && error.message || error);
        painter.onProblem?.(reason);
        return false;
      }
    },
    present(blend) { thread.postMessage({ type: "present", blend }); },
    setSmoothing(on) { thread.postMessage({ type: "smooth", on }); },
  };
  thread.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.facts) facts = msg.facts;
    if (msg.type === "effects") {
      effects = { state: msg.state, log: msg.log || "", ms: msg.ms || 0, parallel: Boolean(msg.parallel) };
      painter.onEffects?.(effects);
      return;
    }
    if (msg.type === "stage") {
      stage = msg.stage || stage;
      painter.onStage?.(stage);
      return;
    }
    if (msg.type === "ready") {
      if (!settled) { settled = true; clearTimeout(timer); finish(true); }
    } else if (msg.type === "error") {
      reason = msg.reason || "picture";
      if (msg.look) painter.onDrew?.(0, msg.look);
      painter.onProblem?.(reason);
      if (!settled) { settled = true; clearTimeout(timer); finish(false); }
    } else if (msg.type === "drew") {
      painter.onDrew?.(msg.ms, msg.look);
    }
  };
  thread.onerror = (event) => {
    reason = reason || `picture worker: ${event?.message || "failed to load"}`;
    painter.onProblem?.(reason);
    if (!settled) { settled = true; clearTimeout(timer); finish(false); }
  };
  thread.postMessage({ type: "init", canvas: offscreen, lite: mode.lite, upgrade: mode.upgrade }, [offscreen]);
  return { painter, remote: true, thread, mode };
}
