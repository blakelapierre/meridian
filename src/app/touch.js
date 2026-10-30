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

export function wantsTouch(win = globalThis) {
  const params = new URLSearchParams(win.location?.search || "");
  if (params.get("touch") === "0") return false;
  if (params.get("touch") === "1") return true;
  return Boolean(win.matchMedia?.("(pointer: coarse)").matches);
}

export function mountTouch({ keys, look, fire }) {
  if (typeof document === "undefined" || !wantsTouch(window)) return null;
  document.documentElement.classList.add("touch");
  const press = (code, type) => dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  const root = document.createElement("div");
  root.id = "touch";
  root.innerHTML = `<div id="stick"><div id="nub"></div></div><div id="lookpad"></div><div id="tbuttons"></div><button id="tfire">Fire</button>`;
  document.body.append(root);
  const stick = root.querySelector("#stick");
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
      button.setPointerCapture?.(event.pointerId);
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
    const k = r > 60 ? 60 / r : 1;
    nub.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const held = stickKeys(dx, dy);
    for (const code of STICK_CODES) {
      if (held.has(code)) keys.add(code);
      else keys.delete(code);
    }
  };
  stick.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    stickId = event.pointerId;
    stick.setPointerCapture?.(event.pointerId);
    const box = stick.getBoundingClientRect();
    origin = [box.left + box.width / 2, box.top + box.height / 2];
    setStick(event.clientX - origin[0], event.clientY - origin[1]);
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId === stickId) setStick(event.clientX - origin[0], event.clientY - origin[1]);
  });
  const endStick = (event) => {
    if (event.pointerId !== stickId) return;
    stickId = null;
    setStick(0, 0);
  };
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);
  const drags = new Map();
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pad.setPointerCapture?.(event.pointerId);
    drags.set(event.pointerId, { x: event.clientX, y: event.clientY, t: performance.now(), moved: 0 });
  });
  pad.addEventListener("pointermove", (event) => {
    const drag = drags.get(event.pointerId);
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.moved += Math.hypot(dx, dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
    look(dx, dy);
  });
  const endPad = (event) => {
    const drag = drags.get(event.pointerId);
    drags.delete(event.pointerId);
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
    fireButton.setPointerCapture?.(event.pointerId);
    fire(true);
  });
  const endFire = () => fire(false);
  fireButton.addEventListener("pointerup", endFire);
  fireButton.addEventListener("pointercancel", endFire);
  addEventListener("contextmenu", (event) => event.preventDefault());
  return root;
}
