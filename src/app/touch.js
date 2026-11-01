// Touch controls for the walk. Mounted only on a touch or coarse pointer
// (or ?touch=1). Desktop input is untouched: buttons replay the keymap as
// key events, the stick holds the same movement keys, and the look pad
// turns the camera without pointer lock.

export const BUTTONS = [
  { code: "Space", label: "Jump", hold: true },
  { code: "ControlLeft", label: "Crouch", hold: true },
  { code: "KeyE", label: "E Use" },
  { code: "KeyR", label: "R" },
  { code: "Digit1", label: "1 Line" },
  { code: "Digit3", label: "3 Tool" },
  { code: "KeyG", label: "G Throw" },
  { code: "KeyB", label: "B Buy" },
  { code: "KeyQ", label: "Q Auto" },
  { code: "Tab", label: "Tab" },
  { code: "KeyM", label: "M Map" },
  { code: "KeyV", label: "V View" },
  { code: "Escape", label: "Esc" },
];

export const STICK_CODES = ["KeyW", "KeyS", "KeyZ", "KeyC", "ShiftLeft"];

// Stick offset (dx right, dy down, in px) to the movement keys it holds.
export function stickKeys(dx, dy, radius = 60, dead = 0.28) {
  const held = new Set();
  const x = dx / radius;
  const y = dy / radius;
  const r = Math.hypot(x, y);
  if (r < dead) return held;
  if (y < -dead) held.add("KeyW");
  if (y > dead) held.add("KeyS");
  if (x < -dead) held.add("KeyZ");
  if (x > dead) held.add("KeyC");
  if (r > 0.95 && y < -0.6) held.add("ShiftLeft");
  return held;
}

// A short, still touch on the look pad is a tap: fire or use the aimed thing.
export function isTap(ms, moved) {
  return ms < 250 && moved < 12;
}

// Two fingers on the look pad: the change in spread becomes wheel steps (spread = in, -1),
// the midpoint drag orbits the camera. Returns the steps and the leftover spread.
export function pinchSteps(spread, step = 40) {
  const steps = Math.trunc(spread / step);
  return { steps, rest: spread - steps * step };
}

export function fullscreenSupported(doc = globalThis.document) {
  return Boolean(doc?.fullscreenEnabled && doc.documentElement?.requestFullscreen);
}

// A fullscreen toggle on documentElement. Hidden where the Fullscreen API is missing (iPhone Safari).
export function mountFullscreen(doc = globalThis.document) {
  if (!doc || !fullscreenSupported(doc)) return null;
  const button = doc.createElement("button");
  button.id = "fullscreen";
  button.type = "button";
  const sync = () => {
    const on = Boolean(doc.fullscreenElement);
    button.textContent = on ? "\u2922" : "\u26F6";
    button.title = on ? "Leave fullscreen" : "Fullscreen";
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.classList.toggle("on", on);
  };
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else await doc.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      button.hidden = true;
    }
  });
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  doc.addEventListener("fullscreenchange", sync);
  sync();
  doc.body.append(button);
  return button;
}

export function wantsTouch(win = globalThis) {
  const params = new URLSearchParams(win.location?.search || "");
  if (params.get("touch") === "0") return false;
  if (params.get("touch") === "1") return true;
  const media = (query) => Boolean(win.matchMedia?.(query).matches);
  if (media("(pointer: coarse)")) return true;
  // Some Android builds report a fine primary pointer. Any touch surface with
  // no fine pointer at all is still a phone or tablet.
  const touchy = (win.navigator?.maxTouchPoints || 0) > 0 || "ontouchstart" in win;
  return touchy && !media("(any-pointer: fine)");
}

export function mountTouch({ keys, look, fire, orbit = () => {}, zoom = () => {} }) {
  if (typeof document === "undefined" || !wantsTouch(window)) return null;
  document.documentElement.classList.add("touch");
  const press = (code, type) => dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  const root = document.createElement("div");
  root.id = "touch";
  root.innerHTML = `<div id="stickzone"></div><div id="stick"><div id="nub"></div></div><div id="lookpad"></div><div id="tbuttons"></div><button id="tfire">Fire</button>`;
  document.body.append(root);
  const stick = root.querySelector("#stick");
  const zone = root.querySelector("#stickzone");
  const nub = root.querySelector("#nub");
  const pad = root.querySelector("#lookpad");
  const fireButton = root.querySelector("#tfire");
  const bar = root.querySelector("#tbuttons");
  for (const spec of BUTTONS) {
    const button = document.createElement("button");
    button.textContent = spec.label;
    button.dataset.code = spec.code;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      try { button.setPointerCapture?.(event.pointerId); } catch {}
      press(spec.code, "keydown");
      if (!spec.hold) press(spec.code, "keyup");
    });
    const up = () => { if (spec.hold) press(spec.code, "keyup"); };
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    bar.append(button);
  }
  const info = document.createElement("button");
  info.textContent = "Info";
  info.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    document.documentElement.classList.toggle("touch-info");
  });
  bar.append(info);
  let stickId = null;
  let origin = [0, 0];
  const setStick = (dx, dy) => {
    const r = Math.hypot(dx, dy);
    const k = r > 44 ? 44 / r : 1;
    nub.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const held = stickKeys(dx, dy, 44);
    for (const code of STICK_CODES) {
      if (held.has(code)) keys.add(code);
      else keys.delete(code);
    }
  };
  // The stick floats: it centres where the thumb lands on the left side, and goes back when let go.
  const grab = (target, float) => (event) => {
    event.preventDefault();
    if (stickId !== null) return;
    stickId = event.pointerId;
    try { target.setPointerCapture?.(event.pointerId); } catch {}
    if (float) {
      const half = stick.offsetWidth / 2 || 50;
      stick.style.left = `${event.clientX - half}px`;
      stick.style.top = `${event.clientY - half}px`;
      stick.style.bottom = "auto";
      stick.classList.add("live");
    }
    const box = stick.getBoundingClientRect();
    origin = [box.left + box.width / 2, box.top + box.height / 2];
    setStick(event.clientX - origin[0], event.clientY - origin[1]);
  };
  const moveStick = (event) => {
    if (event.pointerId === stickId) setStick(event.clientX - origin[0], event.clientY - origin[1]);
  };
  const endStick = (event) => {
    if (event.pointerId !== stickId) return;
    stickId = null;
    setStick(0, 0);
    stick.style.left = "";
    stick.style.top = "";
    stick.style.bottom = "";
    stick.classList.remove("live");
  };
  for (const [target, float] of [[stick, false], [zone, true]]) {
    target.addEventListener("pointerdown", grab(target, float));
    target.addEventListener("pointermove", moveStick);
    target.addEventListener("pointerup", endStick);
    target.addEventListener("pointercancel", endStick);
  }
  // One finger looks (a still tap fires). Two fingers pinch to zoom and drag to orbit,
  // like the mouse wheel and right-drag. The stick lives on its own zone, so they never fight.
  const drags = new Map();
  let pinch = null;
  const pair = () => {
    const [a, b] = [...drags.values()];
    return { spread: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] };
  };
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    try { pad.setPointerCapture?.(event.pointerId); } catch {}
    drags.set(event.pointerId, { x: event.clientX, y: event.clientY, t: performance.now(), moved: 0 });
    if (drags.size === 2) {
      const now = pair();
      pinch = { spread: now.spread, mid: now.mid, rest: 0 };
      for (const drag of drags.values()) drag.moved = 99;
      orbit(0, 0, true);
    }
  });
  pad.addEventListener("pointermove", (event) => {
    const drag = drags.get(event.pointerId);
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.moved += Math.hypot(dx, dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (pinch && drags.size >= 2) {
      const now = pair();
      const { steps, rest } = pinchSteps(pinch.rest + now.spread - pinch.spread);
      pinch.rest = rest;
      for (let i = 0; i < Math.abs(steps); i += 1) zoom(steps > 0 ? -1 : 1);
      orbit(now.mid[0] - pinch.mid[0], now.mid[1] - pinch.mid[1], true);
      pinch.spread = now.spread;
      pinch.mid = now.mid;
      return;
    }
    if (!pinch) look(dx, dy);
  });
  const endPad = (event) => {
    const drag = drags.get(event.pointerId);
    drags.delete(event.pointerId);
    if (pinch) {
      if (drags.size < 2) orbit(0, 0, false);
      if (drags.size === 0) pinch = null;
      return;
    }
    if (!drag || event.type === "pointercancel") return;
    if (isTap(performance.now() - drag.t, drag.moved)) {
      fire(true);
      setTimeout(() => fire(false), 90);
    }
  };
  pad.addEventListener("pointerup", endPad);
  pad.addEventListener("pointercancel", endPad);
  fireButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    try { fireButton.setPointerCapture?.(event.pointerId); } catch {}
    fire(true);
  });
  const endFire = () => fire(false);
  fireButton.addEventListener("pointerup", endFire);
  fireButton.addEventListener("pointercancel", endFire);
  addEventListener("contextmenu", (event) => event.preventDefault());
  return root;
}
