// The picture runs on its own thread when the browser can hand it an OffscreenCanvas.
// The page keeps the buttons. ?gl=main forces the old on-page picture.

export function openPicture(canvas, { search = "", WorkerImpl = globalThis.Worker } = {}) {
  const forceMain = new URLSearchParams(search).get("gl") === "main";
  if (forceMain || !canvas || typeof canvas.transferControlToOffscreen !== "function" || typeof WorkerImpl !== "function") {
    return { painter: null, remote: false };
  }
  let thread;
  try {
    thread = new WorkerImpl(new URL("./render-worker.js?v=2", import.meta.url), { type: "module" });
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
  const timer = setTimeout(() => { if (!settled) { settled = true; finish(false); } }, 12000);
  const painter = {
    remote: true,
    ready,
    onProblem: null,
    onDrew: null,
    failReason: () => reason,
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
    present(blend) { thread.postMessage({ type: "present", blend }); },
    setSmoothing(on) { thread.postMessage({ type: "smooth", on }); },
  };
  thread.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.type === "ready") {
      if (!settled) { settled = true; clearTimeout(timer); finish(true); }
    } else if (msg.type === "error") {
      reason = msg.reason || "picture";
      painter.onProblem?.(reason);
      if (!settled) { settled = true; clearTimeout(timer); finish(false); }
    } else if (msg.type === "drew") {
      painter.onDrew?.(msg.ms);
    }
  };
  thread.onerror = () => {
    reason = reason || "picture worker";
    painter.onProblem?.(reason);
    if (!settled) { settled = true; clearTimeout(timer); finish(false); }
  };
  thread.postMessage({ type: "init", canvas: offscreen }, [offscreen]);
  return { painter, remote: true, thread };
}
