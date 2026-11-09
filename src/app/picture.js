// The picture runs on its own thread when the browser can hand it an OffscreenCanvas.
// The page keeps the buttons. ?gl=main forces the old on-page picture.

// How to draw. ?gl=main: the traced picture on the page thread; ?gl=cpu: the CPU picture only;
// ?gl=lite / ?gl=full: the small or the whole trace shader. Phones default to lite: the full
// shader (volcano, caves, ice) is very large, and mobile GPU compilers are slow on it.
export function pictureMode(search = "", ua = "", mobileHint = null) {
  const gl = new URLSearchParams(search).get("gl") || "";
  const mobile = mobileHint === true || /Android|iPhone|iPad|iPod|Mobile/i.test(String(ua));
  return {
    where: gl === "cpu" ? "cpu" : gl === "main" ? "main" : "worker",
    lite: gl === "lite" ? true : gl === "full" ? false : mobile,
    mobile,
  };
}
// How long the picture thread may take to say it is ready. It reports its stage first, and a
// phone may need most of a minute to compile; past this the page falls back to the CPU picture.
export const PICTURE_DEADLINE_MS = 90000;

export function openPicture(canvas, { search = "", WorkerImpl = globalThis.Worker, ua = globalThis.navigator?.userAgent || "", mobile = globalThis.navigator?.userAgentData?.mobile ?? null, deadlineMs = PICTURE_DEADLINE_MS } = {}) {
  const mode = pictureMode(search, ua, mobile);
  if (mode.where !== "worker" || !canvas || typeof canvas.transferControlToOffscreen !== "function" || typeof WorkerImpl !== "function") {
    return { painter: null, remote: false, mode };
  }
  let thread;
  try {
    thread = new WorkerImpl(new URL("./render-worker.js?v=9", import.meta.url), { type: "module" });
  } catch {
    return { painter: null, remote: false };
  }
  let offscreen;
  try { offscreen = canvas.transferControlToOffscreen(); } catch {
    thread.terminate?.();
    return { painter: null, remote: false };
  }
  let reason = "";
  let settled = false;
  let finish;
  const ready = new Promise((resolve) => { finish = resolve; });
  let stage = "starting the picture thread";
  let facts = null;
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
    facts: () => facts,
    onStage: null,
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
  thread.postMessage({ type: "init", canvas: offscreen, lite: mode.lite }, [offscreen]);
  return { painter, remote: true, thread, mode };
}
