import { radialDeadzone } from "./math";

export type PlayMode = "menu" | "field" | "fps" | "rts" | "pause";

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Tab",
  "ShiftLeft",
  "ShiftRight",
  "KeyE",
  "KeyF",
  "KeyV",
  "KeyJ",
  "KeyK",
]);

export type Input = ReturnType<typeof createInput>;

export function createInput(canvas: HTMLCanvasElement) {
  const real = new Set<string>();
  let forced: Set<string> | null = null;
  let lookX = 0;
  let lookY = 0;
  let virtualX = 0;
  let virtualY = 0;
  let sprintToggle = false;
  let attackEdge = false;
  let bowEdge = false;
  let interactEdge = false;
  let fpsEdge = false;
  let rtsEdge = false;
  let pauseEdge = false;
  let mode: PlayMode = "menu";
  let dragging = false;
  let dragX0 = 0;
  let dragY0 = 0;
  let dragX = 0;
  let dragY = 0;
  let order: { x: number; y: number } | null = null;
  let primary: { x: number; y: number; moved: boolean } | null = null;
  let finished: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let sens = 1;
  const prevPad = new Set<number>();
  let wantLock: (() => void) | null = null;

  function held(code: string): boolean {
    return (forced ?? real).has(code);
  }

  function setMode(next: PlayMode) {
    mode = next;
    if (next !== "rts") dragging = false;
  }

  function localPoint(e: PointerEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function typingTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (typingTarget(e)) {
      real.clear();
      return;
    }
    if (e.repeat) {
      real.add(e.code);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      return;
    }
    real.add(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (mode === "menu") return;
    if (e.code === "KeyJ") attackEdge = true;
    if (e.code === "KeyK") bowEdge = true;
    if (e.code === "KeyE") interactEdge = true;
    if (e.code === "KeyF") fpsEdge = true;
    if (e.code === "KeyV" || e.code === "Tab") rtsEdge = true;
    if (e.code === "Escape") pauseEdge = true;
  }
  function onKeyUp(e: KeyboardEvent) {
    real.delete(e.code);
  }
  function onBlur() {
    real.clear();
  }
  function onMove(e: MouseEvent) {
    const locked = document.pointerLockElement === canvas;
    const dragLook = (e.buttons & 2) === 2;
    if (locked || dragLook) {
      lookX += e.movementX;
      lookY += e.movementY;
    }
  }
  function onDown(e: PointerEvent) {
    if (e.button === 0) {
      const p = localPoint(e);
      if (mode === "rts") {
        dragging = true;
        dragX0 = p.x;
        dragY0 = p.y;
        dragX = p.x;
        dragY = p.y;
        primary = { x: p.x, y: p.y, moved: false };
      } else if (mode === "field" || mode === "fps") {
        if (document.pointerLockElement !== canvas) wantLock?.();
        else attackEdge = true;
      }
    } else if (e.button === 2) {
      const p = localPoint(e);
      if (mode === "rts") order = p;
      else if (mode === "field" || mode === "fps") bowEdge = true;
    }
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const p = localPoint(e);
    dragX = p.x;
    dragY = p.y;
    if (primary && Math.hypot(p.x - dragX0, p.y - dragY0) > 6) primary.moved = true;
  }
  function onUp(e: PointerEvent) {
    if (e.button === 0) {
      if (dragging && primary?.moved) {
        finished = { x0: dragX0, y0: dragY0, x1: dragX, y1: dragY };
      }
      dragging = false;
    }
  }
  function onContext(e: Event) {
    e.preventDefault();
  }
  function onVis() {
    if (document.hidden) real.clear();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("mousemove", onMove);
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("contextmenu", onContext);

  function samplePad() {
    if (forced) return;
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    let pad: Gamepad | null = null;
    for (const g of pads) {
      if (g && g.mapping === "standard") pad = g;
    }
    if (!pad) return;
    const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    if (Math.hypot(virtualX, virtualY) < 0.2) {
      virtualX = stick.x;
      virtualY = -stick.y;
    }
    const look = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.2);
    lookX += look.x * 18 * sens;
    lookY += look.y * 14 * sens;
    const down = (i: number) => Boolean(pad?.buttons[i]?.pressed);
    const edge = (i: number) => down(i) && !prevPad.has(i);
    if (edge(7) || edge(0)) attackEdge = true;
    if (edge(6) || edge(1)) bowEdge = true;
    if (edge(2)) interactEdge = true;
    if (edge(3)) rtsEdge = true;
    if (edge(9)) pauseEdge = true;
    prevPad.clear();
    for (let i = 0; i < pad.buttons.length; i++) if (pad.buttons[i].pressed) prevPad.add(i);
  }

  return {
    setMode,
    setWantLock(fn: () => void) {
      wantLock = fn;
    },
    setSens(v: number) {
      sens = v;
    },
    setKeys(codes: string[]) {
      forced = new Set(codes);
    },
    held,
    get virtualX() {
      return virtualX;
    },
    get virtualY() {
      return virtualY;
    },
    setVirtual(x: number, y: number) {
      virtualX = x;
      virtualY = y;
    },
    get sprintToggle() {
      return sprintToggle;
    },
    setSprintToggle(v: boolean) {
      sprintToggle = v;
    },
    addLook(dx: number, dy: number) {
      lookX += dx;
      lookY += dy;
    },
    pokeAttack() {
      attackEdge = true;
    },
    pokeBow() {
      bowEdge = true;
    },
    pokeInteract() {
      interactEdge = true;
    },
    pokeFps() {
      fpsEdge = true;
    },
    pokeRts() {
      rtsEdge = true;
    },
    samplePad,
    consumeLook() {
      const dx = lookX * sens;
      const dy = lookY * sens;
      lookX = 0;
      lookY = 0;
      return { dx, dy };
    },
    consumeEdges() {
      const edges = { attackEdge, bowEdge, interactEdge, fpsEdge, rtsEdge, pauseEdge };
      attackEdge = false;
      bowEdge = false;
      interactEdge = false;
      fpsEdge = false;
      rtsEdge = false;
      pauseEdge = false;
      return edges;
    },
    takePrimary() {
      const p = primary;
      primary = null;
      return p;
    },
    takeOrder() {
      const o = order;
      order = null;
      return o;
    },
    takeBox() {
      const f = finished;
      finished = null;
      return f;
    },
    dragRect() {
      if (!dragging) return null;
      return { x0: dragX0, y0: dragY0, x1: dragX, y1: dragY };
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("contextmenu", onContext);
    },
  };
}
