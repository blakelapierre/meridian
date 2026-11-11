import { P2PRoom, type PeerInfo } from "@/lib/multiplayer";
import { createAudio } from "./audio";
import { createInput, type PlayMode } from "./input";
import { FOV, basisUp, clamp, tangentFrame, type V3 } from "./math";
import { createRenderer, type DrawEnt } from "./renderer";
import { createSim, type PostView, type Sheet, type Snap } from "./sim";
import { CENTER, SEA, snapFeet, upOf, voxelAt } from "./world";

export type HudPeer = { id: string; name: string; state: string; rtt: number | null; warden: boolean };

export type Hud = {
  phase: "menu" | "play";
  paused: boolean;
  mode: "field" | "fps" | "rts";
  hp: number;
  maxHp: number;
  stamina: number;
  gold: number;
  wave: number;
  score: number;
  banner: string;
  log: string[];
  warden: boolean;
  waiting: boolean;
  room: string | null;
  herald: boolean;
  peers: HudPeer[];
  nearHire: boolean;
  soldiers: { id: string; hp: number; max: number; sel: boolean; down: boolean }[];
  rays: number;
  quality: string;
  hurt: number;
  hire: number;
  sheet: Sheet & { next: number; staminaMax: number };
  chats: { name: string; text: string }[];
  post: PostView;
};

type ActMsg = {
  k: "act";
  what: "swing" | "bow";
  yaw: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
};

const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";

function code4(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

function sub(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function add(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(a: V3, s: number): V3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function norm(a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / l);
}

function lookAt(pos: V3, target: V3, up: V3) {
  const forward = norm(sub(target, pos));
  return { pos, ...basisUp(forward, up) };
}

function orient(up: V3, yaw: number, pitch: number): V3 {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const fx = -Math.sin(yaw) * cp;
  const fz = -Math.cos(yaw) * cp;
  const { east, north } = tangentFrame(up);
  return norm({
    x: east.x * fx + north.x * fz + up.x * sp,
    y: east.y * fx + north.y * fz + up.y * sp,
    z: east.z * fx + north.z * fz + up.z * sp,
  });
}

const SOFT = new Set([0, 6, 7, 9, 12]);

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      getCam?: () => { px: number; py: number; pz: number; cx: number; cy: number; cz: number; dist: number };
      getMail?: () => unknown;
    };
  }
}

export function startGame(opts: {
  view: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  mini: HTMLCanvasElement;
  onHud: (h: Hud) => void;
  onError: (message: string | null) => void;
}) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const selfId = `p${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const audio = createAudio();
  const input = createInput(opts.view);
  const renderer = createRenderer(opts.view);
  const sim = createSim(selfId, "Aldren");
  if (!renderer.ok) opts.onError(renderer.error);
  else {
    renderer.upload(sim.world);
    opts.onError(null);
  }

  let paused = false;
  let returnMode: "field" | "fps" = "field";
  let room: P2PRoom | null = null;
  let roomCode: string | null = null;
  let herald = false;
  let seenPeers = new Set<string>();
  let peerSnap: PeerInfo[] = [];
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let hudAcc = 0;
  let sendAcc = 0;
  let swingT = 0;
  let shake = 0;
  let foot = 0;
  let slow = 0;
  let fast = 0;
  let waitFor = 0;
  let cam = lookAt(
    { x: CENTER, y: CENTER + SEA + 18, z: CENTER + 8 },
    { x: CENTER, y: CENTER, z: CENTER },
    { x: 0, y: 1, z: 0 },
  );
  const chats: { name: string; text: string }[] = [];
  let qualityLock: number | null = null;
  let lastGold = 0;
  let lastHurt = 0;
  let miniAcc = 1;
  try {
    const savedQ = localStorage.getItem("ashen-hold-rays");
    if (savedQ === "auto") qualityLock = null;
    else if (savedQ) {
      const n = Number(savedQ);
      if (n >= 96 && n <= 480) {
        qualityLock = n;
        renderer.setLong(n);
      }
    }
  } catch {
    /* ignore */
  }
  const octx = opts.overlay.getContext("2d");
  const mctx = opts.mini.getContext("2d");
  const map = document.createElement("canvas");
  map.width = 80;
  map.height = 80;

  window.__controlsTest = {
    getYaw: () => sim.player().yaw,
    getSpeed: () => Math.hypot(sim.player().vx, sim.player().vz),
    setKeys: (codes) => input.setKeys(codes),
    getMail: () => ({
      warden: sim.isWarden,
      playing: sim.playing,
      log: sim.log.slice(0, 3),
      flying: sim.postView().flying,
      birds: sim.birdDraw(),
    }),
    getCam: () => {
      const p = sim.player();
      return {
        px: +p.x.toFixed(2),
        py: +p.y.toFixed(2),
        pz: +p.z.toFixed(2),
        cx: +cam.pos.x.toFixed(2),
        cy: +cam.pos.y.toFixed(2),
        cz: +cam.pos.z.toFixed(2),
        dist: +Math.hypot(cam.pos.x - p.x, cam.pos.y - p.y, cam.pos.z - p.z).toFixed(2),
      };
    },
  };

  function pushChat(name: string, text: string) {
    chats.push({ name, text });
    if (chats.length > 8) chats.shift();
  }

  function qualityName(): string {
    if (qualityLock === null) return "Auto";
    if (qualityLock <= 140) return "Coarse";
    if (qualityLock <= 220) return "Fair";
    if (qualityLock <= 320) return "Fine";
    return "Keen";
  }

  function lock() {
    const canvas = opts.view;
    try {
      const ret = canvas.requestPointerLock({ unadjustedMovement: true });
      void Promise.resolve(ret).catch(() => {
        try {
          canvas.requestPointerLock();
        } catch {
          /* ignore */
        }
      });
    } catch {
      try {
        canvas.requestPointerLock();
      } catch {
        /* ignore */
      }
    }
  }
  input.setWantLock(() => {
    if (!paused && sim.playing && sim.mode !== "rts") lock();
  });

  function closeRoom() {
    room?.close();
    room = null;
    seenPeers = new Set();
    peerSnap = [];
    herald = false;
  }

  function handle(from: string, data: unknown) {
    if (!data || typeof data !== "object") return;
    const msg = data as { k?: string };
    if (msg.k === "hello") {
      const name = typeof (data as { name?: unknown }).name === "string" ? (data as { name: string }).name : "Captain";
      if (sim.isWarden) {
        sim.ensurePeer(from, name.slice(0, 24));
        room?.send(sim.toSnap(), from);
      }
      return;
    }
    if (msg.k === "pose") {
      const p = data as { id?: string; x?: number; y?: number; z?: number; yaw?: number; vx?: number; vz?: number };
      if (p.id && typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number") {
        sim.applyPose(p.id, p.x, p.y, p.z, p.yaw ?? 0, p.vx ?? 0, p.vz ?? 0);
      }
      return;
    }
    if (msg.k === "chat") {
      const c = data as { name?: string; text?: string };
      const text = typeof c.text === "string" ? c.text.slice(0, 140) : "";
      if (!text) return;
      pushChat(typeof c.name === "string" ? c.name.slice(0, 24) : "Captain", text);
      audio.chat();
      return;
    }
    if (msg.k === "act") {
      const a = data as ActMsg;
      if (a.what === "swing" || a.what === "bow") {
        const y = typeof a.y === "number" ? a.y : (sim.byId(from)?.y ?? CENTER);
        sim.resolveAct(from, a.what, a.x, y, a.z, a.yaw, { x: a.dx, y: a.dy, z: a.dz });
      }
      return;
    }
    if (msg.k === "order") {
      const o = data as { ids?: string[]; op?: "move" | "attack"; x?: number; y?: number; z?: number; target?: string };
      if (o.ids && (o.op === "move" || o.op === "attack") && typeof o.x === "number" && typeof o.z === "number") {
        sim.applyOrder(from, o.ids, o.op, o.x, o.y ?? 0, o.z, o.target);
      }
      return;
    }
    if (msg.k === "post") {
      const c = data as { to?: string; text?: string; map?: string; where?: string; fromName?: string };
      const text = typeof c.text === "string" ? c.text : "";
      const map = typeof c.map === "string" ? c.map : "";
      const knight = sim.byId(from);
      sim.launchPost({
        fromId: from,
        fromName: typeof c.fromName === "string" ? c.fromName : knight?.name || "Captain",
        to: typeof c.to === "string" ? c.to : "hold",
        text,
        map,
        where: typeof c.where === "string" ? c.where : "",
        origin: knight ? { x: knight.x, y: knight.y, z: knight.z } : { ...sim.player() },
      });
      return;
    }
    if (msg.k === "hire") {
      sim.hireFor(from);
      return;
    }
    if (msg.k === "snap") sim.applySnap(data as Snap);
  }

  function connect(code: string, name: string, join: boolean) {
    closeRoom();
    roomCode = code.toLowerCase();
    sim.setName(name);
    if (join) sim.beginWait();
    else sim.beginPlay();
    room = new P2PRoom({
      room: `hold-${roomCode}`,
      selfId,
      name: name.slice(0, 24),
      onPeersChanged(peers) {
        peerSnap = peers;
        sim.setPeers(peers.filter((p) => p.connectionState === "connected").map((p) => p.id));
        const ids = new Set(peers.map((p) => p.id));
        for (const p of peers) {
          if (!seenPeers.has(p.id)) {
            seenPeers.add(p.id);
            room?.send({ k: "hello", name: name.slice(0, 24) }, p.id);
            if (sim.isWarden) room?.send(sim.toSnap(), p.id);
          }
        }
        for (const id of [...seenPeers]) {
          if (!ids.has(id)) {
            seenPeers.delete(id);
            sim.dropPeer(id);
          }
        }
      },
      onMessage: handle,
      onConnected() {
        herald = true;
      },
    });
    void room.join();
  }

  function modeNow(): PlayMode {
    if (!sim.playing) return "menu";
    if (paused) return "pause";
    return sim.mode;
  }

  function cssSize() {
    const r = opts.view.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  function project(p: V3) {
    const { w, h } = cssSize();
    const rel = sub(p, cam.pos);
    const z = dot(rel, cam.forward);
    if (z < 0.25) return null;
    const x = dot(rel, cam.right);
    const y = dot(rel, cam.up);
    const aspect = w / h;
    const nx = x / z / FOV / aspect;
    const ny = y / z / FOV;
    return { x: (nx * 0.5 + 0.5) * w, y: (0.5 - ny * 0.5) * h, z };
  }

  function pointerRay(px: number, py: number): V3 {
    const { w, h } = cssSize();
    const nx = (px / w) * 2 - 1;
    const ny = 1 - (py / h) * 2;
    const aspect = w / h;
    return norm(add(add(cam.forward, scale(cam.right, nx * aspect * FOV)), scale(cam.up, ny * FOV)));
  }

  function groundAt(px: number, py: number): V3 | null {
    const dir = pointerRay(px, py);
    let p = { ...cam.pos };
    for (let i = 0; i < 96; i++) {
      p = add(p, scale(dir, 0.7));
      const id = voxelAt(sim.world, p.x, p.y, p.z);
      if (id !== 0 && id !== 9 && id !== 7 && id !== 12) return snapFeet(sim.world, p.x, p.y, p.z);
    }
    return null;
  }

  function pickEnt(px: number, py: number) {
    let best: { id: string; d: number; kind: string; owner: string } | null = null;
    for (const e of sim.ents) {
      if (e.hp <= 0) continue;
      const up = upOf(e.x, e.y, e.z);
      const y = e.y + up.y * e.height * 0.6;
      const s = project({ x: e.x + up.x * e.height * 0.6, y, z: e.z + up.z * e.height * 0.6 });
      if (!s) continue;
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < 28 && (!best || d < best.d)) best = { id: e.id, d, kind: e.kind, owner: e.owner };
    }
    return best;
  }

  function issue(op: "move" | "attack", x: number, y: number, z: number, target?: string) {
    const ids = sim.selectedIds();
    if (!ids.length) return;
    if (sim.isWarden) sim.orderLocal(ids, op, x, y, z, target);
    else room?.send({ k: "order", ids, op, x, y, z, target });
    audio.ui();
  }

  function updateCamera() {
    if (!sim.playing || sim.waiting) {
      const ang = reduce ? 0.6 : 0.6 + sim.time * 0.08;
      const hold = sim.world.spawn;
      const up = upOf(hold.x, hold.y, hold.z);
      const { east, north } = tangentFrame(up);
      const pos = add(add(add(hold, scale(up, 26)), scale(north, 10)), scale(east, Math.sin(ang) * 16));
      cam = lookAt(pos, add(hold, scale(up, 3)), up);
      return;
    }
    const p = sim.player();
    const feet = { x: p.x, y: p.y, z: p.z };
    const up = upOf(p.x, p.y, p.z);
    if (sim.mode === "rts") {
      const focus = sim.rtsFocus();
      const fup = upOf(focus.x, focus.y, focus.z);
      const back = orient(fup, sim.rtsYaw, 0);
      const pos = add(add(focus, scale(fup, sim.rtsDist * 0.82)), scale(back, -sim.rtsDist * 0.25));
      cam = lookAt(pos, focus, fup);
      return;
    }
    const aim = orient(up, sim.lookYaw, sim.lookPitch);
    if (sim.mode === "fps") {
      let pos = add(feet, scale(up, p.state === "down" ? 1.5 : p.height * 0.86));
      if (shake > 0) pos = add(pos, scale(basisUp(aim, up).right, Math.sin(sim.time * 46) * shake));
      cam = { pos, ...basisUp(aim, up) };
      return;
    }
    const flat = orient(up, sim.lookYaw, 0);
    const focus = add(add(feet, scale(up, p.height * 1.05)), scale(aim, 14));
    let pos = add(add(feet, scale(up, 14)), scale(flat, -4));
    for (const [back, lift] of [
      [16, 11],
      [12, 9],
      [8, 7],
      [5, 6],
    ] as const) {
      const desired = add(add(feet, scale(flat, -back)), scale(up, lift));
      const mid = add(feet, scale(sub(desired, feet), 0.55));
      if (
        SOFT.has(voxelAt(sim.world, desired.x, desired.y, desired.z)) &&
        SOFT.has(voxelAt(sim.world, mid.x, mid.y, mid.z))
      ) {
        pos = desired;
        break;
      }
    }
    if (shake > 0) pos = add(pos, scale(basisUp(flat, up).right, Math.sin(sim.time * 40) * shake));
    cam = lookAt(pos, focus, up);
  }

  function buildDraw(): DrawEnt[] {
    const list: DrawEnt[] = [];
    const colors: Record<string, [number, number, number]> = {
      self: [0.74, 0.18, 0.16],
      knight: [0.35, 0.5, 0.68],
      soldier: [0.68, 0.54, 0.26],
      bandit: [0.4, 0.13, 0.12],
      wolf: [0.46, 0.42, 0.36],
      villager: [0.64, 0.52, 0.36],
    };
    const kindN: Record<string, number> = { knight: 0, soldier: 1, bandit: 2, wolf: 3, villager: 4 };
    for (const e of sim.ents) {
      if (e.hp <= 0 && e.kind !== "knight") continue;
      if (sim.mode === "fps" && e.id === sim.selfId && e.state !== "down") continue;
      const up = upOf(e.x, e.y, e.z);
      const h = e.state === "down" ? e.height * 0.28 : e.height;
      const key = e.id === sim.selfId ? "self" : e.kind;
      const c = colors[key] ?? colors.knight;
      list.push({
        ax: e.x,
        ay: e.y,
        az: e.z,
        bx: e.x + up.x * h,
        by: e.y + up.y * h,
        bz: e.z + up.z * h,
        radius: e.radius,
        kind: kindN[e.kind] ?? 0,
        flash: e.flash,
        selected: e.selected,
        yaw: e.yaw,
        r: c[0],
        g: c[1],
        b: c[2],
      });
    }
    const p = sim.player();
    if (sim.playing && !sim.waiting && p.state !== "down") {
      const swing = swingT > 0 ? 1 - swingT / 0.28 : 0;
      if (sim.mode === "fps") {
        const s = Math.sin(Math.max(0, swing) * Math.PI);
        const hand = add(add(add(cam.pos, scale(cam.right, 0.24)), scale(cam.up, -0.22)), scale(cam.forward, 0.42));
        const tip = add(add(add(hand, scale(cam.forward, 0.82)), scale(cam.right, 0.18 - 0.72 * s)), scale(cam.up, 0.08 + 0.2 * s));
        list.push({
          ax: hand.x,
          ay: hand.y,
          az: hand.z,
          bx: tip.x,
          by: tip.y,
          bz: tip.z,
          radius: 0.045,
          kind: 5,
          flash: 0,
          selected: false,
          yaw: 0,
          r: 0.84,
          g: 0.86,
          b: 0.9,
        });
      } else {
        const up = upOf(p.x, p.y, p.z);
        const ang = p.yaw + (swing - 0.25) * 1.5;
        const f = orient(up, ang, 0);
        const rgt = basisUp(f, up).right;
        const y0 = add(add({ x: p.x, y: p.y, z: p.z }, scale(up, p.height * 0.62)), scale(rgt, 0.85));
        const tip = add(add(y0, scale(f, 2.4)), scale(up, 0.45));
        list.push({
          ax: y0.x,
          ay: y0.y,
          az: y0.z,
          bx: tip.x,
          by: tip.y,
          bz: tip.z,
          radius: 0.12,
          kind: 5,
          flash: 0,
          selected: false,
          yaw: p.yaw,
          r: 0.8,
          g: 0.82,
          b: 0.86,
        });
      }
    }
    for (const b of sim.birdDraw()) {
      const up = upOf(b.x, b.y, b.z);
      const { east } = tangentFrame(up);
      let head = { x: b.hx, y: b.hy, z: b.hz };
      if (Math.hypot(head.x, head.y, head.z) < 0.05) head = east;
      head = norm(head);
      const wing = Math.sin(b.flap) * 0.9;
      const dark = b.species === "pigeon" ? [0.62, 0.63, 0.66] : [0.18, 0.19, 0.22];
      const tint = b.carry ? [0.72, 0.58, 0.32] : dark;
      const tail = add({ x: b.x, y: b.y, z: b.z }, scale(head, -0.55));
      const nose = add(add({ x: b.x, y: b.y, z: b.z }, scale(head, 0.85)), scale(up, 0.12));
      list.push({
        ax: tail.x,
        ay: tail.y,
        az: tail.z,
        bx: nose.x,
        by: nose.y,
        bz: nose.z,
        radius: 0.22,
        kind: 6,
        flash: 0,
        selected: false,
        yaw: 0,
        r: tint[0],
        g: tint[1],
        b: tint[2],
      });
      const span = add({ x: b.x, y: b.y, z: b.z }, scale(east, 1.15));
      const tip = add(add(span, scale(up, wing)), scale(head, 0.15));
      list.push({
        ax: b.x,
        ay: b.y,
        az: b.z,
        bx: tip.x,
        by: tip.y,
        bz: tip.z,
        radius: 0.1,
        kind: 6,
        flash: 0,
        selected: false,
        yaw: 0,
        r: dark[0],
        g: dark[1],
        b: dark[2],
      });
    }
    if (list.length <= 24) return list;
    list.sort((a, b) => {
      const bias = (e: DrawEnt) => (e.kind === 6 ? -40 : 0);
      const da = Math.hypot(a.ax - cam.pos.x, a.ay - cam.pos.y, a.az - cam.pos.z) + bias(a);
      const db = Math.hypot(b.ax - cam.pos.x, b.ay - cam.pos.y, b.az - cam.pos.z) + bias(b);
      return da - db;
    });
    return list.slice(0, 24);
  }

  function drawOverlay() {
    if (!octx) return;
    const { w, h } = cssSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (opts.overlay.width !== pw || opts.overlay.height !== ph) {
      opts.overlay.width = pw;
      opts.overlay.height = ph;
    }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, w, h);
    if (sim.playing && !sim.waiting && sim.mode !== "rts" && !paused) {
      octx.strokeStyle = "rgba(231,215,184,0.85)";
      octx.lineWidth = 1.5;
      octx.beginPath();
      octx.moveTo(w / 2 - 7, h / 2);
      octx.lineTo(w / 2 - 2, h / 2);
      octx.moveTo(w / 2 + 2, h / 2);
      octx.lineTo(w / 2 + 7, h / 2);
      octx.moveTo(w / 2, h / 2 - 7);
      octx.lineTo(w / 2, h / 2 - 2);
      octx.moveTo(w / 2, h / 2 + 2);
      octx.lineTo(w / 2, h / 2 + 7);
      octx.stroke();
      if (sim.hitMark > 0) {
        octx.strokeStyle = `rgba(196,161,90,${sim.hitMark})`;
        octx.strokeRect(w / 2 - 10, h / 2 - 10, 20, 20);
      }
    }
    const drag = input.dragRect();
    if (drag && sim.mode === "rts") {
      octx.strokeStyle = "rgba(196,161,90,0.9)";
      octx.fillStyle = "rgba(196,161,90,0.15)";
      const x = Math.min(drag.x0, drag.x1);
      const y = Math.min(drag.y0, drag.y1);
      const rw = Math.abs(drag.x1 - drag.x0);
      const rh = Math.abs(drag.y1 - drag.y0);
      octx.fillRect(x, y, rw, rh);
      octx.strokeRect(x, y, rw, rh);
    }
    octx.font = "600 13px 'Source Sans 3', sans-serif";
    octx.textAlign = "center";
    for (const f of sim.floaters) {
      const s = project({ x: f.x, y: f.y, z: f.z });
      if (!s) continue;
      octx.globalAlpha = Math.max(0, Math.min(1, f.life));
      octx.fillStyle = f.kind === "gold" ? "#c4a15a" : "#e7d7b8";
      octx.fillText(f.text, s.x, s.y);
    }
    octx.globalAlpha = 1;
    if (sim.hurt > 0.02) {
      const g = octx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(120,16,12,${Math.min(0.55, sim.hurt * 0.5)})`);
      octx.fillStyle = g;
      octx.fillRect(0, 0, w, h);
    }
  }

  const MINI_SPAN = 48;
  const mapCtx = map.getContext("2d");

  function paintMini() {
    if (!mapCtx || !sim.playing) return;
    const cells = 32;
    const p = sim.player();
    const up = upOf(p.x, p.y, p.z);
    const { east, north } = tangentFrame(up);
    const colors = [
      "#140e0a",
      "#5a7344",
      "#6a655c",
      "#6a4a2c",
      "#c9b89a",
      "#8a6840",
      "#245868",
      "#9c2f2f",
      "#8e949c",
      "#345c38",
      "#8a6a44",
      "#c2ae78",
      "#d06a28",
      "#4e5c4c",
      "#c4a45a",
    ];
    mapCtx.fillStyle = "#140e0a";
    mapCtx.fillRect(0, 0, 80, 80);
    const cell = 80 / cells;
    for (let iz = 0; iz < cells; iz++) {
      for (let ix = 0; ix < cells; ix++) {
        const ex = ((ix + 0.5) / cells - 0.5) * MINI_SPAN;
        const nz = (0.5 - (iz + 0.5) / cells) * MINI_SPAN;
        const x = p.x + east.x * ex + north.x * nz;
        const y = p.y + east.y * ex + north.y * nz;
        const z = p.z + east.z * ex + north.z * nz;
        const u = upOf(x, y, z);
        let id = 0;
        for (let s = 0; s < 16; s++) {
          const k = 5 - s * 0.85;
          const vid = voxelAt(sim.world, x + u.x * k, y + u.y * k, z + u.z * k);
          if (vid !== 0 && vid !== 9 && vid !== 7 && vid !== 12) {
            id = vid;
            break;
          }
        }
        if (!id) continue;
        mapCtx.fillStyle = colors[id] ?? "#231812";
        mapCtx.fillRect(ix * cell, iz * cell, cell + 0.6, cell + 0.6);
      }
    }
  }

  function drawMini() {
    if (!mctx || !sim.playing) return;
    const size = 132;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    if (opts.mini.width !== px) {
      opts.mini.width = px;
      opts.mini.height = px;
    }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.drawImage(map, 0, 0, size, size);
    const p = sim.player();
    const up = upOf(p.x, p.y, p.z);
    const { east, north } = tangentFrame(up);
    for (const e of sim.ents) {
      if (e.hp <= 0 && e.kind !== "knight") continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dz = e.z - p.z;
      const ex = dx * east.x + dy * east.y + dz * east.z;
      const nz = dx * north.x + dy * north.y + dz * north.z;
      if (Math.abs(ex) > MINI_SPAN * 0.5 || Math.abs(nz) > MINI_SPAN * 0.5) continue;
      const sx = (ex / MINI_SPAN + 0.5) * size;
      const sy = (0.5 - nz / MINI_SPAN) * size;
      mctx.fillStyle =
        e.id === sim.selfId ? "#e7d7b8" : e.kind === "soldier" ? "#c4a15a" : e.kind === "bandit" ? "#9c2f2f" : e.kind === "wolf" ? "#8a8078" : "#6a8f72";
      mctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }
    for (const b of sim.birdDraw()) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const dz = b.z - p.z;
      const ex = dx * east.x + dy * east.y + dz * east.z;
      const nz = dx * north.x + dy * north.y + dz * north.z;
      if (Math.abs(ex) > MINI_SPAN * 0.5 || Math.abs(nz) > MINI_SPAN * 0.5) continue;
      const sx = (ex / MINI_SPAN + 0.5) * size;
      const sy = (0.5 - nz / MINI_SPAN) * size;
      mctx.fillStyle = b.carry ? "#c4a15a" : "#2c2824";
      mctx.fillRect(sx - 1.5, sy - 2.5, 3, 2);
    }
    mctx.strokeStyle = "#e7d7b8";
    mctx.beginPath();
    mctx.arc(size * 0.5, size * 0.5, 4, 0, Math.PI * 2);
    mctx.stroke();
  }

  function emitHud() {
    const p = sim.player();
    opts.onHud({
      phase: sim.playing ? "play" : "menu",
      paused,
      mode: sim.mode,
      hp: p.hp,
      maxHp: p.maxHp,
      stamina: sim.stamina,
      gold: sim.goldSelf,
      wave: sim.wave,
      score: sim.score,
      banner: sim.banner(),
      log: [...sim.log],
      warden: sim.isWarden,
      waiting: sim.waiting,
      room: roomCode,
      herald,
      peers: peerSnap.map((peer) => ({
        id: peer.id,
        name: peer.name || "Captain",
        state: peer.connectionState,
        rtt: peer.rttMs,
        warden: peer.id === sim.wardenId,
      })),
      nearHire: sim.nearHire(),
      soldiers: sim.soldiers(),
      rays: renderer.longSide,
      quality: qualityName(),
      hurt: sim.hurt,
      hire: sim.hirePrice(),
      sheet: sim.sheetView(),
      chats: chats.map((c) => ({ name: c.name, text: c.text })),
      post: sim.postView(),
    });
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    input.samplePad();
    input.setMode(modeNow());
    const look = paused ? { dx: 0, dy: 0 } : input.consumeLook();
    const edges = input.consumeEdges();
    if (!paused) sim.applyLook(look.dx, look.dy);
    if (edges.pauseEdge && sim.playing) {
      paused = !paused;
      if (paused) document.exitPointerLock();
      else if (sim.mode !== "rts") lock();
    }
    if (edges.fpsEdge && sim.playing && !paused) {
      if (sim.mode === "fps") sim.mode = "field";
      else {
        returnMode = "fps";
        sim.mode = "fps";
        lock();
      }
    }
    if (edges.rtsEdge && sim.playing && !paused) {
      if (sim.mode === "rts") {
        sim.mode = returnMode === "fps" ? "fps" : "field";
        if (sim.mode === "fps") lock();
      } else {
        returnMode = sim.mode === "fps" ? "fps" : "field";
        sim.mode = "rts";
        const p = sim.player();
        sim.focusRts({ x: p.x, y: p.y, z: p.z });
        document.exitPointerLock();
      }
    }
    if (edges.attackEdge && sim.playing && !paused && sim.mode !== "rts" && sim.cdReady("swing")) {
      swingT = 0.28;
      audio.swing();
      shake = Math.max(shake, 0.05);
      const yaw = sim.lookYaw;
      sim.player().yaw = yaw;
      if (sim.isWarden) {
        if (sim.trySwing(yaw)) {
          audio.hit();
          shake = 0.1;
        }
      } else {
        sim.markSwingCd();
        const e = sim.player();
        const d = orient(upOf(e.x, e.y, e.z), yaw, sim.lookPitch);
        room?.send({ k: "act", what: "swing", yaw, x: e.x, y: e.y, z: e.z, dx: d.x, dy: d.y, dz: d.z });
      }
    }
    if (edges.bowEdge && sim.playing && !paused && sim.mode !== "rts" && sim.cdReady("bow")) {
      audio.bow();
      const d = cam.forward;
      if (sim.isWarden) {
        if (sim.tryBow(d)) audio.hit();
      } else {
        sim.markBowCd();
        const e = sim.player();
        room?.send({ k: "act", what: "bow", yaw: sim.lookYaw, x: e.x, y: e.y, z: e.z, dx: d.x, dy: d.y, dz: d.z });
      }
    }
    if (edges.interactEdge && sim.playing && !paused) {
      if (sim.isWarden) {
        if (sim.tryHire()) audio.horn();
      } else room?.send({ k: "hire" });
    }

    const box = input.takeBox();
    if (box && sim.mode === "rts") {
      const ids: string[] = [];
      for (const e of sim.ents) {
        if (e.kind !== "soldier" || e.owner !== sim.selfId || e.hp <= 0) continue;
        const up = upOf(e.x, e.y, e.z);
        const s = project({
          x: e.x + up.x * e.height * 0.55,
          y: e.y + up.y * e.height * 0.55,
          z: e.z + up.z * e.height * 0.55,
        });
        if (!s) continue;
        const x0 = Math.min(box.x0, box.x1);
        const x1 = Math.max(box.x0, box.x1);
        const y0 = Math.min(box.y0, box.y1);
        const y1 = Math.max(box.y0, box.y1);
        if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) ids.push(e.id);
      }
      sim.select(ids, false);
    }
    const primary = input.takePrimary();
    if (primary && !primary.moved && sim.mode === "rts") {
      const hit = pickEnt(primary.x, primary.y);
      if (hit?.kind === "soldier" && hit.owner === sim.selfId) sim.select([hit.id], input.held("ShiftLeft"));
      else sim.select([], false);
    }
    const order = input.takeOrder();
    if (order && sim.mode === "rts") {
      const hit = pickEnt(order.x, order.y);
      if (hit && (hit.kind === "bandit" || hit.kind === "wolf")) {
        const foe = sim.byId(hit.id);
        issue("attack", foe?.x ?? 0, foe?.y ?? 0, foe?.z ?? 0, hit.id);
      } else {
        const g = groundAt(order.x, order.y);
        if (g) issue("move", g.x, g.y, g.z);
      }
    }

    const held = paused ? () => false : (code: string) => input.held(code);
    const vx = paused ? 0 : input.virtualX;
    const vy = paused ? 0 : input.virtualY;
    acc += dt;
    const step = 1 / 60;
    while (acc >= step) {
      sim.step(step, held, vx, vy, input.sprintToggle);
      acc -= step;
    }
    const missing = Boolean(room) && !sim.isWarden && !peerSnap.some((p) => p.id === sim.wardenId);
    if (sim.noteWarden(dt, missing) === "seize") {
      audio.horn();
      room?.broadcast(sim.toSnap());
    }
    if (sim.waiting) {
      waitFor += dt;
      if (waitFor > 8 && peerSnap.length === 0) {
        sim.assumeWatch();
        audio.horn();
        sim.pushLog("No warden answered. Your browser takes the watch.");
      }
    } else waitFor = 0;
    swingT = Math.max(0, swingT - dt);
    shake = Math.max(0, shake - dt * 0.6);
    const speed = Math.hypot(sim.player().vx, sim.player().vz);
    if (sim.playing && !paused && speed > 2) {
      foot += dt;
      if (foot > (speed > 7 ? 0.28 : 0.42)) {
        foot = 0;
        audio.step();
      }
    }
    sendAcc += dt;
    if (room && sendAcc > 0.1) {
      sendAcc = 0;
      if (sim.isWarden && !sim.waiting) room.broadcast(sim.toSnap());
      else if (sim.playing && !sim.waiting) room.broadcast(sim.pose());
    }
    updateCamera();
    const t0 = performance.now();
    renderer.draw(cam, buildDraw(), sim.time);
    const frameMs = performance.now() - t0;
    if (qualityLock === null) {
      if (frameMs > 48) {
        slow += 1;
        fast = 0;
        if (slow > 6) {
          renderer.setLong(renderer.longSide - 28);
          slow = 0;
        }
      } else if (frameMs < 22) {
        fast += 1;
        slow = 0;
        if (fast > 20) {
          renderer.setLong(renderer.longSide + 24);
          fast = 0;
        }
      }
    }
    if (sim.playing) {
      miniAcc += dt;
      if (miniAcc > 0.45) {
        miniAcc = 0;
        paintMini();
      }
      if (sim.takeLevelPing()) audio.level();
      if (sim.takeMailPing()) audio.coo();
      const goldNow = sim.goldSelf;
      if (goldNow > lastGold) audio.coin();
      lastGold = goldNow;
      if (sim.hurt > 0.9 && lastHurt < 0.4) audio.hurt();
      lastHurt = sim.hurt;
    }
    drawOverlay();
    drawMini();
    hudAcc += dt;
    if (hudAcc > 0.12) {
      hudAcc = 0;
      emitHud();
    }
    opts.view.style.cursor = !sim.playing || paused ? "default" : sim.mode === "rts" ? "crosshair" : document.pointerLockElement === opts.view ? "none" : "crosshair";
    raf = requestAnimationFrame(frame);
  }

  function onWheel(e: WheelEvent) {
    if (sim.mode !== "rts") return;
    e.preventDefault();
    sim.rtsDist += Math.sign(e.deltaY) * 1.4;
  }
  opts.view.addEventListener("wheel", onWheel, { passive: false });

  emitHud();
  updateCamera();
  renderer.draw(cam, buildDraw(), sim.time);
  raf = requestAnimationFrame(frame);

  return {
    beginSolo(name: string) {
      sim.setName(name.slice(0, 24) || "Aldren");
      sim.beginPlay();
      paused = false;
      audio.unlock();
      audio.ui();
      lock();
      emitHud();
    },
    beginHost(name: string) {
      const code = code4();
      connect(code, name.slice(0, 24) || "Aldren", false);
      paused = false;
      audio.unlock();
      audio.horn();
      lock();
      emitHud();
      return code;
    },
    beginJoin(name: string, code: string) {
      const clean = code.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4);
      if (clean.length < 4) return false;
      connect(clean, name.slice(0, 24) || "Aldren", true);
      paused = false;
      audio.unlock();
      audio.ui();
      emitHud();
      return true;
    },
    openGates(name: string) {
      if (room) return roomCode;
      const code = code4();
      connect(code, name.slice(0, 24) || "Aldren", false);
      audio.horn();
      emitHud();
      return code;
    },
    leaveRealm() {
      closeRoom();
      roomCode = null;
      if (!sim.isWarden) sim.assumeWatch();
      emitHud();
    },
    assume() {
      if (sim.assumeWatch()) {
        audio.horn();
        room?.broadcast(sim.toSnap());
      }
      emitHud();
    },
    togglePause() {
      if (!sim.playing) return;
      paused = !paused;
      if (paused) document.exitPointerLock();
      emitHud();
    },
    resume() {
      paused = false;
      audio.unlock();
      if (sim.mode !== "rts") lock();
      emitHud();
    },
    setVirtual(x: number, y: number) {
      input.setVirtual(x, y);
    },
    setSprint(v: boolean) {
      input.setSprintToggle(v);
    },
    addLook(dx: number, dy: number) {
      input.addLook(dx, dy);
    },
    attack() {
      input.pokeAttack();
    },
    bow() {
      input.pokeBow();
    },
    interact() {
      input.pokeInteract();
    },
    toggleFps() {
      input.pokeFps();
    },
    toggleRts() {
      input.pokeRts();
    },
    selectAll() {
      sim.select(
        sim.soldiers().filter((s) => !s.down).map((s) => s.id),
        false,
      );
    },
    selectOne(id: string) {
      sim.select([id], false);
    },
    setSens(v: number) {
      input.setSens(v);
    },
    setMuted(v: boolean) {
      audio.setMuted(v);
    },
    focusMini(nx: number, nz: number) {
      const p = sim.player();
      const up = upOf(p.x, p.y, p.z);
      const { east, north } = tangentFrame(up);
      const ex = (nx - 0.5) * MINI_SPAN;
      const nzAmt = (0.5 - nz) * MINI_SPAN;
      const pos = {
        x: p.x + east.x * ex + north.x * nzAmt,
        y: p.y + east.y * ex + north.y * nzAmt,
        z: p.z + east.z * ex + north.z * nzAmt,
      };
      sim.focusRts(snapFeet(sim.world, pos.x, pos.y, pos.z) ?? pos);
      if (sim.mode !== "rts") {
        returnMode = sim.mode === "fps" ? "fps" : "field";
        sim.mode = "rts";
      }
    },
    setRays(n: number | null) {
      if (n === null) {
        qualityLock = null;
        try {
          localStorage.setItem("ashen-hold-rays", "auto");
        } catch {
          /* ignore */
        }
        return;
      }
      const v = Math.max(96, Math.min(480, Math.round(n)));
      qualityLock = v;
      renderer.setLong(v);
      try {
        localStorage.setItem("ashen-hold-rays", String(v));
      } catch {
        /* ignore */
      }
    },
    spend(attr: "might" | "grace" | "wit" | "vigor") {
      if (sim.spend(attr)) audio.ui();
    },
    sendChat(text: string) {
      const clean = text.replace(/\s+/g, " ").trim().slice(0, 140);
      if (!clean || !sim.playing) return;
      const who = sim.player().name.slice(0, 24) || "Aldren";
      pushChat(who, clean);
      room?.send({ k: "chat", name: who, text: clean });
      audio.chat();
    },
    looseRaven(to: string, text: string, pin: boolean) {
      const clean = text.replace(/\s+/g, " ").trim().slice(0, 160);
      if ((!clean && !pin) || !sim.playing) return false;
      const sketched = pin ? sim.sketchMap() : { map: "", where: "" };
      const fromName = sim.player().name.slice(0, 24) || "Aldren";
      const origin = { x: sim.player().x, y: sim.player().y, z: sim.player().z };
      if (sim.isWarden) {
        const ok = sim.launchPost({
          fromId: sim.selfId,
          fromName,
          to,
          text: clean,
          map: sketched.map,
          where: sketched.where,
          origin,
        });
        if (ok) audio.wing();
        return ok;
      }
      room?.send({ k: "post", to, text: clean, map: sketched.map, where: sketched.where, fromName });
      audio.wing();
      return true;
    },
    readPost() {
      sim.readPost();
    },
    unlockAudio() {
      audio.unlock();
    },
    destroy() {
      cancelAnimationFrame(raf);
      opts.view.removeEventListener("wheel", onWheel);
      input.dispose();
      closeRoom();
      renderer.dispose();
      audio.dispose();
      delete window.__controlsTest;
    },
  };
}

export type GameApi = ReturnType<typeof startGame>;
