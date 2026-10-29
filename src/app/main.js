import { paintFrame } from "../engine/frame.js";
import { cast, project, worldToScreen } from "../engine/cast.js";
import { buildScene } from "../render/scene.js";
import { createGpuPainter, fitCanvas } from "../render/gpu.js";
import { createFps } from "../render/fps.js";
import { createPacer } from "../render/pace.js";
import { createPlayer, createPlayerWorld, createStamina, TANGENT_GRAVITY } from "../sim/player.js";
import { DAY_TICKS } from "../sim/sun.js";
import { columnFloor } from "../sim/crust.js";
import { bitAim } from "../sim/bit.js";
import { toolAim } from "../sim/aim.js";
import { adoptSalvage, adoptWall, createYard, tryPlaceWall, trySalvage } from "../sim/build.js";
import { lookDirection, stepHands } from "../sim/hands.js";
import { createJump } from "../sim/jump.js";
import { createSkills, grantUse, SKILL_NAMES } from "../sim/skills.js";
import { chaseOrigin, createCameraSpring, stepCamera, CHASE } from "../sim/body.js";
import { cycleTarget, listTargets } from "../sim/target.js";
import { OPTICS, rangeRead, relaxOrbit, stepZoom, zoomFov } from "../sim/sight.js";
import { appraise, subjectFromHit } from "../sim/appraise.js";
import { acceptSalvage, acceptWall, encodeSalvage, encodeWall } from "../net/walls.js";
import { applyDummyHit, createDummy, resolveShot, stepDummy } from "../sim/fire.js";
import { createIdentity } from "../net/identity.js";
import { createTerrain } from "../net/terrain.js";
import { connectPeer, createRoom } from "../net/room.js";
import { acceptShot, encodeShot } from "../net/shots.js";
import { acceptPosition, encodePosition } from "../net/position.js";
import { createEntry, entryLine, SMOKE, stepEntry } from "../sim/enter.js";
import { pubkeyHex } from "../sim/keeper.js";
import { acceptBlock, createChain, hex, installTip, tipOf } from "../sim/chain.js";
import { decode } from "../sim/cbor.js";
import { decodeBlock } from "../net/blocks.js";

const canvas = document.querySelector("canvas");
let painter = createGpuPainter(canvas);
let context = null;
let viewScale = 0.5;
if (painter) {
  fitCanvas(canvas, viewScale);
  canvas.style.imageRendering = "auto";
  canvas.dataset.renderer = "webgl2";
  addEventListener("resize", () => fitCanvas(canvas, viewScale));
} else {
  context = canvas.getContext("2d", { alpha: false });
  if (context) context.imageSmoothingEnabled = false;
  canvas.dataset.renderer = "cpu";
}
const width = canvas.width;
const height = canvas.height;
const params = new URLSearchParams(location.search);
const quiet = params.get("quiet") === "1";
const paceBus = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("meridian-pace");
let primaryHolding = true;
if (quiet && paceBus) {
  paceBus.onmessage = (event) => {
    if (event.data?.role === "primary") primaryHolding = event.data.holding !== false;
  };
}
const followId = params.get("follow");
const keys = new Set();
const peer = Boolean(params.get("id"));

const atoll = await fetch("/content/atoll.json").then((response) => response.json());
const spawn = params.get("gate") === "1"
  ? { x: 0, y: -11200, z: 0 }
  : params.get("look") === "dummy" ? atoll.placements.accuracyPad : atoll.placements.spawnFeet;
const player = createPlayer([spawn.x / 100, spawn.y / 100, spawn.z / 100]);
const world = createPlayerWorld(player);
world.tangentGravity = TANGENT_GRAVITY;
const stamina = createStamina();
const identity = createIdentity();
const terrain = createTerrain({
  identity,
  leader: params.get("offer") === "1" || !peer,
});
const dummy = createDummy();
const yard = createYard(atoll.placements.footing);
const worldChain = createChain();
const fromChain = new Set();
const entry = createEntry(atoll);
let entryState = { joined: false, prompt: "", notice: "" };
const seenShots = new Set();
const seenWalls = new Set();
let slot = params.get("look") === "dummy" ? "line" : "bit";
let raising = null;
let work = null;
const fps = createFps();
let yaw = params.get("autobit") === "1" ? 0 : (params.get("look") === "dummy" ? Math.PI / 2 : 0);
let pitch = params.get("autobit") === "1" ? -1.2 : (params.get("look") === "dummy" ? -0.075 : 0);
let view = params.get("view") === "first" || params.get("look") === "dummy" ? "first" : "third";
let tick = (0.87 / (Math.PI * 2)) * DAY_TICKS;
let trigger = false;
let shotQueued = false;
let cooldown = 0;
let report = "";
let useEdge = false;
let buyEdge = false;
let selectEdge = false;
let actEdge = false;
let cycleEdge = 0;
let orbitYaw = 0;
let orbitPitch = 0;
let cameraDistance = CHASE;
let rightDown = false;
let rightMoved = false;
let optics = "none";
let zoom = { distance: CHASE, first: false, level: 0, forced: false };
let rangeText = "";
let selection = null;
const skills = createSkills();
const jump = createJump();
let ops = null;
const links = [];
let followed = null;
const poses = new Map();
let cameraSpring = null;
let cameraPos = null;

function openLinks() {
  return links.filter((link) => link.ops.readyState === "open");
}

const lanes = new Map();

function enqueue(link, frames) {
  if (!frames.length) return;
  let queue = lanes.get(link);
  if (!queue) {
    queue = [];
    lanes.set(link, queue);
  }
  for (const frame of frames) queue.push(new Uint8Array(frame));
  pump(link);
}

function pump(link) {
  const queue = lanes.get(link);
  const channel = link.ops;
  if (!queue || !queue.length || channel.readyState !== "open") return;
  while (queue.length && channel.bufferedAmount < 65536) {
    try {
      channel.send(queue[0]);
    } catch {
      return;
    }
    queue.shift();
  }
}

function sendOps(frame) {
  const open = openLinks();
  if (!open.length) {
    if (peer) shotFrames.push(frame);
    return;
  }
  for (const link of open) enqueue(link, [frame]);
}
const shotFrames = [];

addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Digit1") slot = "line";
  if (event.code === "Digit3") slot = slot === "bit" ? "hammer" : "bit";
  if (event.code === "Tab") event.preventDefault();
  if (event.repeat) return;
  if (event.code === "KeyE") {
    if (entryState.prompt) useEdge = true;
    else selectEdge = true;
  }
  if (event.code === "KeyB") buyEdge = true;
  if (event.code === "KeyU") actEdge = true;
  if (event.code === "Tab") cycleEdge = event.shiftKey ? -1 : 1;
  if (event.code === "KeyV" && !followId) {
    if (view === "third") {
      view = "first";
      zoom = { ...zoom, first: true, forced: true, level: 0 };
    } else {
      view = "third";
      zoom = { distance: CHASE, first: false, level: 0, forced: false };
      cameraDistance = CHASE;
    }
    cameraSpring = null;
  }
  if (event.code === "KeyR") {
    optics = OPTICS[(OPTICS.indexOf(optics) + 1) % OPTICS.length];
  }
  if (event.code === "Space") event.preventDefault();
});
addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 2) {
    rightDown = true;
    rightMoved = false;
    return;
  }
  if (event.button !== 0) return;
  trigger = true;
  if (slot === "line") shotQueued = true;
});
addEventListener("mouseup", (event) => {
  if (event.button === 0) trigger = false;
  if (event.button !== 2) return;
  const orbiting = rightMoved;
  rightDown = false;
  if (orbiting || followId || slot !== "hammer") return;
  const mark = refreshAim(input());
  if (!mark.inRange) {
    report = "far";
    return;
  }
  const saved = trySalvage(yard, mark.cell);
  report = saved.ok ? "salvage" : saved.reason;
  if (!saved.ok) return;
  const nonce = Math.floor(tick);
  const frame = encodeSalvage(identity, { nonce, cell: mark.cell });
  sendOps(frame);
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("click", () => canvas.requestPointerLock());
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const before = zoom.level;
  const wasFirst = zoom.first;
  zoom = stepZoom(zoom, Math.sign(event.deltaY) || 1, skills.eyesight.value, optics);
  cameraDistance = zoom.distance;
  if ((zoom.first && !wasFirst) || zoom.level > before) grantUse(skills, "eyesight", { tick, gap: 30 });
}, { passive: false });
addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
  if (rightDown) {
    orbitYaw += event.movementX * 0.004;
    orbitPitch = Math.max(-1, Math.min(0.8, orbitPitch - event.movementY * 0.004));
    if (event.movementX || event.movementY) rightMoved = true;
    return;
  }
  if (followId) return;
  yaw += event.movementX * 0.0022;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - event.movementY * 0.0022));
});

function input() {
  return {
    yaw,
    pitch,
    forward: (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0),
    strafe: (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0),
    sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
    crouch: keys.has("ControlLeft") || keys.has("ControlRight"),
    jump: keys.has("Space"),
  };
}

function eyeOf(sample) {
  return [
    player.position[0],
    player.position[1],
    player.position[2] + (sample?.crouch ? 1.1 : 1.65),
  ];
}

function otherActors() {
  const list = [];
  for (const pose of poses.values()) {
    if (pose.yaw === undefined) continue;
    list.push({ feet: [pose.x, pose.y, pose.z], yaw: pose.yaw });
  }
  return list;
}

function cameraAim(sample = {}) {
  const bodyYaw = sample.yaw ?? yaw;
  const bodyPitch = sample.pitch ?? pitch;
  const first = zoom.first || (view === "first" && !followId);
  if (first) {
    return {
      yaw: bodyYaw,
      pitch: bodyPitch,
      distance: null,
      third: false,
      fov: zoomFov(zoom.level, skills.eyesight.value, optics),
    };
  }
  return {
    yaw: bodyYaw + orbitYaw,
    pitch: Math.max(-1.2, Math.min(1.2, bodyPitch + orbitPitch)),
    distance: cameraDistance,
    third: true,
    fov: 70,
  };
}

function aimCamera(sample, dt) {
  const eased = relaxOrbit(orbitYaw, orbitPitch, dt, rightDown);
  orbitYaw = eased.yaw;
  orbitPitch = eased.pitch;
  const aim = cameraAim(sample);
  const feet = followId && followed && followed.yaw !== undefined
    ? [followed.x, followed.y, followed.z]
    : player.position;
  if (!aim.third) {
    const eye = followId ? 1.65 : (sample.crouch ? 1.1 : 1.65);
    cameraPos = [feet[0], feet[1], feet[2] + eye];
    cameraSpring = null;
    return;
  }
  const ideal = chaseOrigin(feet, aim.yaw, aim.pitch, followId ? false : !!sample.crouch, aim.distance);
  if (!cameraSpring) cameraSpring = createCameraSpring(ideal);
  cameraPos = stepCamera(cameraSpring, ideal, dt);
}

function sceneFor(sample, width, height) {
  const aim = cameraAim(sample);
  return buildScene({
    feet: player.position,
    yaw: sample.yaw ?? yaw,
    pitch: sample.pitch ?? pitch,
    crouch: !!sample.crouch,
    tick,
    atoll,
    crust: terrain.log.crust,
    pieces: yard.pieces,
    width,
    height,
    view: followId ? "third" : view,
    self: !followId && aim.third,
    others: otherActors(),
    cameraOrigin: cameraPos,
    cameraDir: aim.third ? lookDirection(aim.yaw, aim.pitch) : lookDirection(aim.yaw, aim.pitch),
    fov: aim.fov,
  });
}

function refreshAim(sample = {}) {
  if (slot !== "bit" && slot !== "hammer") return { inRange: false, kind: "" };
  const yawNow = sample.yaw ?? yaw;
  const pitchNow = sample.pitch ?? pitch;
  const objects = sceneFor(sample, 16, 9).objects.filter((object) => !object.self);
  return toolAim(slot, eyeOf(sample), lookDirection(yawNow, pitchNow), objects, yard.pieces);
}

function adoptTarget(subject) {
  const id = subject.id || (subject.cell ? `${subject.kind}:${subject.cell[0]}:${subject.cell[1]}` : subject.kind);
  const result = appraise(skills.appraisal.value, subject);
  if (result.known) grantUse(skills, "appraisal", { tick });
  selection = { ...subject, id, line: result.line, canAct: result.canAct };
  report = result.line;
}

function cycle(step) {
  const next = cycleTarget(listTargets({
    dummy: atoll.placements.dummy,
    others: otherActors(),
    pieces: yard.pieces,
    props: atoll.props,
    feet: player.position,
  }), selection?.id, step);
  if (!next) {
    report = "nothing to target";
    return;
  }
  adoptTarget(next);
}

function identify(sample) {
  const scene = sceneFor(sample, 16, 9);
  const dir = project(0.5, 0.5, scene.camera);
  const hit = cast(scene.camera.origin, dir, scene.objects.filter((object) => !object.self), scene.miss);
  const subject = subjectFromHit(hit, yard.pieces);
  if (!subject) {
    selection = null;
    report = "nothing to identify";
    return;
  }
  adoptTarget(subject);
}

function actOn(sample) {
  if (!selection) {
    report = "no target";
    return;
  }
  if (!selection.canAct) {
    report = "You do not know what to do with that.";
    return;
  }
  const eye = eyeOf(sample);
  const point = selection.point || eye;
  const dist = Math.hypot(point[0] - eye[0], point[1] - eye[1], (point[2] || 0) - eye[2]);
  if (selection.kind === "sand") {
    if (dist > 4) {
      report = "too far";
      return;
    }
    terrain.dig(eye, point, { peer: witnessed() });
    grantUse(skills, "mining", { tick, gap: 30 });
    report = "dig";
    return;
  }
  if (selection.kind === "wall" && selection.cell) {
    if (dist > 4) {
      report = "too far";
      return;
    }
    const saved = trySalvage(yard, selection.cell);
    report = saved.ok ? "salvage" : saved.reason;
    if (!saved.ok) return;
    sendOps(encodeSalvage(identity, { nonce: Math.floor(tick), cell: selection.cell }));
    return;
  }
  if (selection.kind === "dummy") {
    const pad = atoll.placements.dummy;
    const target = [pad.x / 100, pad.y / 100, 0.9];
    const delta = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const reach = Math.hypot(delta[0], delta[1], delta[2]);
    if (reach > 40 || reach < 1e-6) {
      report = "too far";
      return;
    }
    const shot = resolveShot({
      eye,
      forward: delta.map((value) => value / reach),
      speed: Math.hypot(player.velocity[0], player.velocity[1]),
      airborne: player.position[2] > 0.05,
      seed: tick,
      objects: sceneFor(sample, 16, 9).objects.filter((object) => !object.self),
    });
    if (!shot.hitbox) {
      report = "miss";
      return;
    }
    const applied = applyDummyHit(dummy, shot.hitbox);
    grantUse(skills, "marksmanship", { tick });
    report = `${applied.hitbox} ${applied.damage}`;
    return;
  }
  report = selection.action;
}

function showSight(mark) {
  const sight = document.querySelector("#sight");
  if (!sight) return;
  const tool = slot === "line" || slot === "bit" || slot === "hammer";
  sight.style.display = tool ? "block" : "none";
  sight.dataset.tool = slot;
  sight.classList.toggle("hot", !!mark?.inRange);
  sight.classList.toggle("cold", (slot === "bit" || slot === "hammer") && !mark?.inRange);
  canvas.dataset.aim = slot === "bit" || slot === "hammer" ? (mark?.inRange ? mark.kind : "far") : "";
}

function paintSkills() {
  const list = document.querySelector("#skills");
  if (!list) return;
  list.replaceChildren(...SKILL_NAMES.map((name) => {
    const skill = skills[name];
    const label = document.createElement("span");
    label.textContent = name;
    const track = document.createElement("span");
    track.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.min(100, skill.value)}%`;
    track.append(fill);
    const value = document.createElement("b");
    value.textContent = String(Math.floor(skill.value));
    const row = document.createElement("li");
    row.append(label, track, value);
    return row;
  }));
}

function publish() {
  const voxel = terrain.voxel();
  const tip = tipOf(worldChain).block;
  const tipWrite = tip.ops.at(-1)?.writes.at(-1);
  const shown = voxel !== null ? voxel : tipWrite ? terrain.log.crust.sampleIndex(tipWrite[0], tipWrite[1], tipWrite[2]) : null;
  let hash = terrain.hash();
  if (!hash && tip.height) hash = hex(terrain.log.crust.hash(tip.chunk[0], tip.chunk[1], tip.chunk[2]));
  const ground = shown === null ? "sand is intact" : `voxel ${shown} hash ${hash}`;
  const body = dummy.health === 0 ? "dummy dead" : `dummy ${dummy.health}`;
  const bit = document.querySelector("#bit");
  const walls = yard.pieces.filter((piece) => piece.id === "wall").length;
  const pace = canvas.dataset.pace || "vsync";
  const rate = canvas.dataset.fps || "0";
  const aim = canvas.dataset.aim ? ` · ${canvas.dataset.aim}` : "";
  const contract = entryState.joined ? "" : entryState.prompt;
  const strike = entryState.joined ? entryLine(entryState) : contract;
  const archives = links.filter((link) => link.role === "archive" && link.ops.readyState === "open").length;
  const official = terrain.log.seq > tip.seq ? "provisional" : tip.height ? "official" : "";
  const chainNote = `block ${tip.height}${official ? ` ${official}` : ""}`;
  const seen = poses.size;
  const known = selection ? ` · ${selection.line}` : "";
  const skillNote = Object.entries(skills)
    .filter(([, skill]) => skill.value > 0)
    .map(([name, skill]) => `${name} ${Math.floor(skill.value)}`)
    .join(" ");
  const eyeView = zoom.first || view === "first";
  const charge = jump.lift ? " · rising" : "";
  const opticNote = optics === "none" ? "" : ` · ${optics}`;
  const rangeNote = rangeText ? ` · ${rangeText}` : "";
  if (bit) bit.textContent = `${eyeView ? "eyes" : view} · ${skillNote || "skills 0"}${charge}${opticNote}${rangeNote}${known} · ${slot}${aim} · metal ${yard.metal} · walls ${walls}${strike ? ` · ${strike}` : ""}${report ? ` · ${report}` : ""}${archives ? " · archive" : ""}${seen ? ` · seen ${seen}` : ""} · ${chainNote} · ${body} · ${ground} · ${rate} fps · ${pace} ${canvas.width}×${canvas.height}`;
  const range = document.querySelector("#range");
  if (range) range.textContent = rangeText;
  const counter = document.querySelector("#fps");
  if (counter) counter.textContent = `${rate} fps`;
  canvas.dataset.walls = String(walls);
  canvas.dataset.metal = String(yard.metal);
  canvas.dataset.voxel = shown === null ? "" : String(shown);
  canvas.dataset.hash = hash;
  canvas.dataset.dummy = String(dummy.health);
  canvas.dataset.slot = slot;
  canvas.dataset.view = view;
  canvas.dataset.block = String(tipOf(worldChain).block.height);
  canvas.dataset.prompt = entryState.prompt || "";
  canvas.dataset.scrip = entryState.scrip == null ? "" : String(entryState.scrip);
  canvas.dataset.body = entryState.body || "beach";
  paintSkills();
}

function markTarget(scene) {
  const el = document.querySelector("#target");
  if (!el) return;
  if (!selection?.point) {
    el.style.display = "none";
    return;
  }
  const screen = worldToScreen(selection.point, scene.camera);
  if (!screen) {
    el.style.display = "none";
    return;
  }
  const x = Math.min(0.97, Math.max(0.03, screen.x));
  const y = Math.min(0.97, Math.max(0.03, screen.y));
  el.style.display = "block";
  el.style.left = `${x * 100}%`;
  el.style.top = `${y * 100}%`;
  el.dataset.edge = screen.x < 0 || screen.x > 1 || screen.y < 0 || screen.y > 1 ? "edge" : "";
}

function paint(sample) {
  const scene = sceneFor(sample, canvas.width, canvas.height);
  scene.work = work;
  scene.time = tick / 30;
  markTarget(scene);
  const dir = project(0.5, 0.5, scene.camera);
  const hit = cast(scene.camera.origin, dir, scene.objects, scene.miss);
  const ranged = cast(scene.camera.origin, dir, scene.objects.filter((object) => !object.self), scene.miss);
  const reading = rangeRead(ranged?.object ? ranged.t : null, skills.ranging.value, optics);
  rangeText = reading?.text || "";
  if (reading?.meters != null) grantUse(skills, "ranging", { tick, gap: 45 });
  const color = hit.color || scene.miss;
  canvas.dataset.center = `${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)}`;
  showSight(slot === "bit" || slot === "hammer" ? refreshAim(sample) : null);
  if (painter) {
    if (!painter.paint(scene)) canvas.dataset.gpuError = canvas.dataset.gpuError || "draw";
    return scene;
  }
  if (!context) {
    painter = null;
    canvas.width = 160;
    canvas.height = 90;
    context = canvas.getContext("2d", { alpha: false });
    canvas.dataset.renderer = "cpu";
    canvas.style.imageRendering = "pixelated";
  }
  const pixels = paintFrame(scene, canvas.width, canvas.height);
  if (slot === "line") {
    const center = (Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4;
    pixels[center] = 255;
    pixels[center + 1] = 255;
    pixels[center + 2] = 255;
  }
  context.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
  return scene;
}

function fire(sample) {
  const scene = sceneFor(sample, canvas.width, canvas.height);
  const speed = Math.hypot(player.velocity[0], player.velocity[1]);
  const eye = eyeOf(sample);
  const forward = lookDirection(sample.yaw, sample.pitch);
  const shot = resolveShot({
    eye,
    forward,
    speed,
    airborne: player.position[2] > 0.05,
    seed: tick,
    objects: scene.objects.filter((object) => !object.self),
  });
  const nonce = Math.floor(tick);
  seenShots.add(nonce);
  if (!shot.hitbox) {
    report = "miss";
  } else {
    const applied = applyDummyHit(dummy, shot.hitbox);
    grantUse(skills, "marksmanship", { tick });
    report = `${applied.hitbox} ${applied.damage}`;
  }
  const frame = encodeShot(identity, {
    nonce,
    origin: eye,
    dir: shot.dir,
    hitbox: shot.hitbox || "miss",
  });
  sendOps(frame);
}

function ownKeys() {
  const keys = new Set();
  for (const op of terrain.log.ops) {
    const body = decode(op.proposal).body;
    for (const write of body.writes) keys.add(`${write[0]},${write[1]},${write[2]}`);
  }
  return keys;
}

function onOps(bytes) {
  if (bytes[0] === 11) {
    const decoded = decodeBlock(bytes);
    if (!decoded.ok) return;
    const accepted = acceptBlock(worldChain, decoded.block);
    if (!accepted.ok || accepted.duplicate) return;
    installTip(terrain.log.crust, worldChain, fromChain, ownKeys());
    if (accepted.tip) report = `block ${tipOf(worldChain).block.height}`;
    for (const link of openLinks()) {
      try {
        link.ops.send(bytes);
      } catch {
        // A peer that already has the block will ignore the extra copy.
      }
    }
    return;
  }
  if (bytes[0] === 10) {
    const accepted = acceptSalvage(bytes);
    if (!accepted.ok) return;
    adoptSalvage(yard, accepted.cell);
    report = "salvage";
    return;
  }
  if (bytes[0] === 9) {
    const accepted = acceptWall(bytes);
    if (!accepted.ok || seenWalls.has(accepted.nonce)) return;
    const placed = adoptWall(yard, accepted.cell);
    if (!placed.ok) return;
    seenWalls.add(accepted.nonce);
    report = "wall";
    return;
  }
  if (bytes[0] !== 7) {
    terrain.receive(bytes);
    return;
  }
  const scene = buildScene({
    feet: player.position,
    yaw,
    pitch,
    tick,
    atoll,
    crust: terrain.log.crust,
    pieces: yard.pieces,
    width,
    height,
  });
  const accepted = acceptShot(bytes, scene.objects);
  if (!accepted.ok || accepted.hitbox === "miss" || seenShots.has(accepted.nonce)) {
    if (accepted.reason === "split") report = "split";
    return;
  }
  seenShots.add(accepted.nonce);
  const applied = applyDummyHit(dummy, accepted.hitbox);
  report = `${applied.hitbox} ${applied.damage}`;
}

function flush() {
  const open = openLinks();
  if (open.length) {
    const frames = [...terrain.take(), ...shotFrames.splice(0)];
    for (const link of open) enqueue(link, frames);
  }
  for (const link of links) pump(link);
  publish();
}

if (params.get("autobit") === "1") {
  const aim = bitAim(player.position, yaw, pitch);
  for (let step = 0; step < 40; step++) terrain.dig(aim.eye, aim.aim, { peer });
}

const meId = params.get("id") || `p-${pubkeyHex(identity.pubkey).slice(0, 8)}`;
const opening = new Set();
let roomReady = null;

function witnessed() {
  return peer || links.some((link) => link.role === "archive");
}

function ensureRoom() {
  if (!roomReady) {
    const room = createRoom({
      url: params.get("signal") || "ws://127.0.0.1:8787",
      me: meId,
      role: "player",
    });
    roomReady = room.start().then(() => room);
  }
  return roomReady;
}

async function openLink(to, offer, role) {
  if (!to || to === meId || links.some((link) => link.to === to) || opening.has(to)) return;
  opening.add(to);
  const room = await ensureRoom();
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  const channels = {};
  for (const spec of [["ctrl", 0, true], ["ops", 1, true], ["snap", 2, false]]) {
    const options = { negotiated: true, id: spec[1], ordered: spec[2] };
    if (!spec[2]) options.maxRetransmits = 0;
    const channel = pc.createDataChannel(spec[0], options);
    channel.binaryType = "arraybuffer";
    channels[spec[0]] = channel;
  }
  const link = { to, role, ops: channels.ops, snap: channels.snap };
  links.push(link);
  if (!ops) ops = channels.ops;
  channels.ops.onmessage = (event) => onOps(new Uint8Array(event.data));
  channels.snap.onmessage = (event) => {
    const pose = acceptPosition(poses.get(to) || null, new Uint8Array(event.data));
    poses.set(to, pose);
    if (to === followId) followed = pose;
  };
  const linkLine = document.querySelector("#link");
  try {
    await connectPeer({
      pc,
      room,
      me: meId,
      to,
      offer,
      isOpen: () => channels.ops.readyState === "open",
      status: (line) => {
        if (linkLine && !followed) linkLine.textContent = role === "archive" ? `archive ${line}` : line;
      },
    });
  } catch (error) {
    opening.delete(to);
    const index = links.indexOf(link);
    if (index >= 0) links.splice(index, 1);
    if (linkLine) linkLine.textContent = String(error);
  }
}

async function link() {
  const targets = (params.get("to") || "").split(",").map((item) => item.trim()).filter(Boolean);
  const offerParam = params.get("offer") || "";
  await Promise.all(targets.map((to) => openLink(
    to,
    offerParam === "1" || offerParam.split(",").includes(to),
    "player",
  )));
}

async function seekArchives() {
  try {
    const room = await ensureRoom();
    const peers = await room.list();
    for (const found of peers) {
      if (found.role === "archive") openLink(found.pubkey, false, "archive");
    }
  } catch {
    // No lighthouse means no archive. Digs stay solo.
  }
}

const first = input();
if (painter) fitCanvas(canvas, viewScale);
paint(first);
publish();
canvas.dataset.ready = "1";
canvas.dataset.pace = "vsync";

const FOLLOW_M = 3.5;

function publishPose() {
  if (followId) return;
  const packet = encodePosition({
    tick,
    x: player.position[0],
    y: player.position[1],
    z: player.position[2],
    yaw,
    pitch,
  });
  for (const link of links) {
    if (link.snap.readyState === "open") link.snap.send(packet);
  }
}

function applyFollow() {
  if (!followed || followed.yaw === undefined) return;
  yaw = followed.yaw;
  pitch = followed.pitch;
  player.position[0] = followed.x - Math.sin(yaw) * FOLLOW_M;
  player.position[1] = followed.y - Math.cos(yaw) * FOLLOW_M;
  player.position[2] = followed.z;
  player.velocity[0] = 0;
  player.velocity[1] = 0;
  player.velocity[2] = 0;
  work = null;
  const linkLine = document.querySelector("#link");
  if (linkLine) linkLine.textContent = `following ${followId}`;
}

function waitFollow() {
  const linkLine = document.querySelector("#link");
  if (linkLine) linkLine.textContent = `waiting for ${followId}`;
}

if (params.get("still") !== "1") {
  if (peer) link().catch((error) => {
    const linkLine = document.querySelector("#link");
    if (linkLine) linkLine.textContent = String(error);
  });
  if (!followId) {
    seekArchives();
    setInterval(() => { seekArchives(); }, 3000);
  }
  const pacer = createPacer();
  let last = performance.now();
  let bank = 0;
  const frame = (now) => {
    try {
    const dt = Math.min(0.1, (now - last) / 1000);
    bank += dt;
    last = now;
    const sample = input();
    const selectOnce = selectEdge;
    const actOnce = actEdge;
    const cycleOnce = cycleEdge;
    selectEdge = false;
    actEdge = false;
    cycleEdge = 0;
    const aimed = refreshAim(sample);
    if (followId) {
      bank = 0;
      if (followed) applyFollow();
      else waitFollow();
    } else {
    let useOnce = useEdge;
    let buyOnce = buyEdge;
    useEdge = false;
    buyEdge = false;
    while (bank >= 1 / 30) {
      try {
      stepDummy(dummy);
      if (cooldown > 0) cooldown -= 1;
      entryState = stepEntry(entry, {
        position: player.position,
        use: useOnce,
        buy: buyOnce,
        yard,
        offer: buyOnce ? (entryState.joined ? SMOKE : null) : null,
      });
      if (entryState.notice) report = entryState.notice;
      useOnce = false;
      buyOnce = false;
      const striking = entryState.body === "strike";
      if (slot === "line" && (trigger || shotQueued) && cooldown === 0) {
        shotQueued = false;
        cooldown = 3;
        fire(sample);
      } else if (striking && (slot === "hammer" || slot === "bit") && trigger) {
        raising = null;
        work = null;
        report = "frozen";
      } else if (slot === "hammer" && trigger && aimed.inRange && aimed.kind !== "wall" && aimed.kind !== "dummy") {
        const cell = aimed.cell;
        if (!raising || raising.cell[0] !== cell[0] || raising.cell[1] !== cell[1]) {
          raising = { cell, ticks: 0 };
        }
        if (raising) {
          raising.ticks += 1;
          work = {
            x: raising.cell[0] * 0.5,
            y: raising.cell[1] * 0.5,
            height: 0.15 + (raising.ticks / (12 * 30)) * 2.05,
            mode: 1,
          };
          report = `work ${Math.floor(raising.ticks / 30)}s`;
          if (raising.ticks >= 12 * 30) {
            const placed = tryPlaceWall(yard, raising.cell);
            report = placed.ok ? "wall" : placed.reason;
            if (placed.ok) {
              grantUse(skills, "masonry", { tick });
              const nonce = Math.floor(tick);
              seenWalls.add(nonce);
              const frame = encodeWall(identity, { nonce, cell: raising.cell });
              sendOps(frame);
            }
            raising = null;
            work = null;
          }
        } else {
          work = null;
        }
      } else {
        raising = null;
        if (slot === "bit" && (trigger || params.get("autobit") === "1")) {
          const aim = bitAim(player.position, sample.yaw, sample.pitch, sample.crouch);
          terrain.dig(aim.eye, aim.aim, { peer: witnessed() });
          grantUse(skills, "mining", { tick, gap: 30 });
        } else if (!raising) {
          work = null;
        }
      }
      const moved = stepHands(world, player, stamina, sample, jump, skills.jump.value);
      if (moved.jump) grantUse(skills, "jump", { tick });
      const floor = columnFloor(terrain.log.crust, player.position[0], player.position[1]);
      if (floor < -0.01 && player.position[2] <= 0.02) {
        player.position[2] = floor;
        if (player.velocity[2] < 0) player.velocity[2] = 0;
      }
      tick += 1;
      } finally {
        bank -= 1 / 30;
      }
    }
    publishPose();
    }
    if (!raising && !followId) {
      if (aimed.inRange) {
        work = {
          x: aimed.x,
          y: aimed.y,
          height: aimed.kind === "wall" ? 2.2 : aimed.kind === "dummy" ? 1.6 : 0.2,
          mode: aimed.kind === "ground" ? 3 : 4,
        };
      } else {
        work = null;
      }
    }
    showSight(aimed);
    aimCamera(sample, dt);
    if (cycleOnce) cycle(cycleOnce);
    if (selectOnce) identify(sample);
    if (actOnce) actOn(sample);
    if (!work && selection?.point) {
      work = { x: selection.point[0], y: selection.point[1], height: 1.6, mode: 4 };
    }
    const active = !document.hidden && document.hasFocus();
    const decision = quiet && !document.hidden ? pacer.considerExtra(now, primaryHolding) : pacer.consider(now, active);
    if (!quiet && paceBus) paceBus.postMessage({ role: "primary", holding: decision.holding });
    viewScale = decision.scale;
    canvas.dataset.pace = decision.mode;
    if (params.get("nopaint") !== "1" && decision.paint) {
      if (painter) fitCanvas(canvas, viewScale);
      const started = performance.now();
      paint(sample);
      pacer.note(performance.now() - started, active);
      canvas.dataset.fps = String(fps.paint(now));
    }
    flush();
    } catch (error) {
      report = "frame";
      canvas.dataset.err = String(error && error.message || error);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
