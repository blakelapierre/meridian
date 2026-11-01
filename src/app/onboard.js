// First-run "how to play" card. Shown once per device (localStorage), dismissible, and reopened
// with the "?" button in the top-right corner. Skipped for harness pages (bots, iframes, stills).
export const ONBOARD_KEY = "meridian.onboard.v1";

export const DESKTOP_TIPS = [
  ["Click the picture", "lock the mouse to look around (Esc gives it back)"],
  ["W A S D", "move · Shift sprint · Space jump · Ctrl crouch · Q auto run"],
  ["Wheel / V", "camera distance / first or third person · hold right mouse to orbit"],
  ["E", "identify what the crosshair is on · Tab cycles people"],
  ["1 / 3", "line rifle / tool (bit digs, hammer builds) · hold left mouse to use"],
  ["M", "map: small, full, hidden"],
  ["L", "abilities log · I shows the network panel"],
];

export const TOUCH_TIPS = [
  ["Left stick", "move · push all the way to sprint"],
  ["Drag right side", "look · tap to fire or use the tool"],
  ["Pinch / two fingers", "camera distance / orbit · V View swaps first and third person"],
  ["Buttons", "Jump, Crouch, E Use, 1 Line, 3 Tool, M Map"],
  ["Info", "show the help, skills and network panels · Log opens abilities"],
];

export function shouldShow({ storage, params, embedded = false } = {}) {
  const p = params || new URLSearchParams();
  if (p.get("onboard") === "1") return true;
  if (p.get("onboard") === "0" || p.has("bot") || p.get("still") === "1" || p.has("look") || embedded) return false;
  try { return storage?.getItem(ONBOARD_KEY) !== "seen"; } catch { return true; }
}

export function markSeen(storage) {
  try { storage?.setItem(ONBOARD_KEY, "seen"); } catch {}
}

export function tipsFor(touch) {
  return touch ? TOUCH_TIPS : DESKTOP_TIPS;
}

/** Builds the card and the "?" button. Returns { open, close, card, button } or null without a DOM. */
export function mountOnboard({ doc = globalThis.document, win = globalThis.window, storage = globalThis.localStorage } = {}) {
  if (!doc?.createElement) return null;
  const touch = () => doc.documentElement.classList.contains("touch");
  const card = doc.createElement("section");
  card.id = "onboard";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.setAttribute("aria-labelledby", "onboard-title");
  card.hidden = true;
  const render = () => {
    const rows = tipsFor(touch()).map(([k, v]) => `<li><b>${k}</b> <span>${v}</span></li>`).join("");
    card.innerHTML = `<h2 id="onboard-title">How to play</h2><ul>${rows}</ul>`
      + `<p>Walk, look, dig and build. Skills rise as you practise them. Reopen this with the <b>?</b> button.</p>`
      + `<button type="button" class="ok">Got it</button>`;
    card.querySelector(".ok").addEventListener("click", close);
  };
  const button = doc.createElement("button");
  button.id = "howto";
  button.type = "button";
  button.textContent = "?";
  button.title = "How to play";
  button.setAttribute("aria-label", "How to play");
  button.setAttribute("aria-controls", "onboard");
  button.setAttribute("aria-expanded", "false");
  function open() {
    render();
    card.hidden = false;
    button.setAttribute("aria-expanded", "true");
    if (doc.pointerLockElement) doc.exitPointerLock?.();
    card.querySelector(".ok")?.focus?.();
  }
  function close() {
    card.hidden = true;
    button.setAttribute("aria-expanded", "false");
    markSeen(storage);
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (card.hidden) open(); else close();
  });
  card.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  // Keep game keys and clicks from reaching the walk while the card is up.
  for (const type of ["pointerdown", "mousedown", "touchstart", "click"]) card.addEventListener(type, (event) => event.stopPropagation());
  (doc.querySelector("#corner") || doc.body).prepend(button);
  doc.body.append(card);
  let embedded = false;
  try { embedded = win && win.top !== win; } catch { embedded = true; }
  const params = new URLSearchParams(win?.location?.search || "");
  if (shouldShow({ storage, params, embedded })) open();
  return { open, close, card, button };
}
