// Boot curtain and the rule for how much work one frame may do before it gives the UI a turn.

export function bootNote(text, fraction = 0, doc = globalThis.document) {
  const root = doc?.querySelector?.("#boot");
  if (!root) return false;
  root.hidden = false;
  root.setAttribute("aria-busy", "true");
  const line = root.querySelector("[data-boot-line]");
  const bar = root.querySelector("[data-boot-bar]");
  if (line && text) line.textContent = text;
  if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  return true;
}

export function bootDone(doc = globalThis.document) {
  const root = doc?.querySelector?.("#boot");
  if (!root) return false;
  root.hidden = true;
  root.setAttribute("aria-busy", "false");
  return true;
}

export function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

// The first physics step of a frame always runs. Later catch-up steps wait for the next frame
// once this one has already spent the budget, so a hitch cannot pile into a frozen page.
export function shouldSimStep(steps, elapsedMs, limit = 8) {
  return steps === 0 || elapsedMs <= limit;
}

// A heavy catch-up skips the picture for one frame. A single step still draws.
export function shouldPaint(steps, elapsedMs, limit = 14) {
  return steps <= 1 || elapsedMs <= limit;
}
