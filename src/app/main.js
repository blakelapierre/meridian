import { paintFrame } from "../engine/frame.js";
import { cast, project } from "../engine/cast.js";
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
import { acceptSalvage, acceptWall, encodeSalvage, encodeWall } from "../net/walls.js";
import { applyDummyHit, createDummy, resolveShot, stepDummy } from "../sim/fire.js";
import { createIdentity } from "../net/identity.js";
import { createTerrain } from "../net/terrain.js";
import { connectPeer, createRoom } from "../net/room.js";
import { acceptShot, encodeShot } from "../net/shots.js";

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
const keys = new Set();
const peer = Boolean(params.get("id"));

const atoll = await fetch("/content/atoll.json").then((response) => response.json());
const spawn = params.get("look") === "dummy" ? atoll.placements.accuracyPad : atoll.placements.spawnFeet;
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
const seenShots = new Set();
const seenWalls = new Set();
let slot = params.get("look") === "dummy" ? "line" : "bit";
let raising = null;
let work = null;
const fps = createFps();
let yaw = params.get("autobit") === "1" ? 0 : (params.get("look") === "dummy" ? Math.PI / 2 : 0);
let pitch = params.get("autobit") === "1" ? -1.2 : (params.get("look") === "dummy" ? -0.075 : 0);
let tick = (0.87 / (Math.PI * 2)) * DAY_TICKS;
let trigger = false;
let shotQueued = false;
let cooldown = 0;
let report = "";
let ops = null;
const shotFrames = [];

addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Digit1") slot = "line";
  if (event.code === "Digit3") slot = slot === "bit" ? "hammer" : "bit";
  if (event.code === "Space") event.preventDefault();
});
addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 2) {
    if (slot !== "hammer") return;
    const mark = refreshAim(input());
    if (!mark.inRange) {
      report = "far";
      return;
    }
    const saved = trySalvage(yard, mark.cell);
    report = saved.ok ? "salvage" : saved.reason;
    if (!saved.ok) return;
    const nonce = tick;
    const frame = encodeSalvage(identity, { nonce, cell: mark.cell });
    if (ops && ops.readyState === "open") ops.send(frame);
    else if (peer) shotFrames.push(frame);
    return;
  }
  if (event.button !== 0) return;
  trigger = true;
  if (slot === "line") shotQueued = true;
});
addEventListener("mouseup", (event) => {
  if (event.button === 0) trigger = false;
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("click", () => canvas.requestPointerLock());
addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
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

function refreshAim(sample = {}) {
  if (slot !== "bit" && slot !== "hammer") return { inRange: false, kind: "" };
  const yawNow = sample.yaw ?? yaw;
  const pitchNow = sample.pitch ?? pitch;
  const objects = buildScene({
    feet: player.position,
    yaw: yawNow,
    pitch: pitchNow,
    crouch: !!sample.crouch,
    tick,
    atoll,
    crust: terrain.log.crust,
    pieces: yard.pieces,
    width: 16,
    height: 9,
  }).objects;
  return toolAim(slot, eyeOf(sample), lookDirection(yawNow, pitchNow), objects, yard.pieces);
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

function publish() {
  const voxel = terrain.voxel();
  const ground = voxel === null ? "sand is intact" : `voxel ${voxel} hash ${terrain.hash()}`;
  const body = dummy.health === 0 ? "dummy dead" : `dummy ${dummy.health}`;
  const bit = document.querySelector("#bit");
  const walls = yard.pieces.filter((piece) => piece.id === "wall").length;
  const pace = canvas.dataset.pace || "vsync";
  const rate = canvas.dataset.fps || "0";
  const aim = canvas.dataset.aim ? ` · ${canvas.dataset.aim}` : "";
  if (bit) bit.textContent = `${slot}${aim} · metal ${yard.metal} · walls ${walls}${report ? ` · ${report}` : ""} · ${body} · ${ground} · ${rate} fps · ${pace} ${canvas.width}×${canvas.height}`;
  const counter = document.querySelector("#fps");
  if (counter) counter.textContent = `${rate} fps`;
  canvas.dataset.walls = String(walls);
  canvas.dataset.metal = String(yard.metal);
  canvas.dataset.voxel = voxel === null ? "" : String(voxel);
  canvas.dataset.hash = terrain.hash();
  canvas.dataset.dummy = String(dummy.health);
  canvas.dataset.slot = slot;
}

function paint(sample) {
  const scene = buildScene({
    feet: player.position,
    yaw,
    pitch,
    crouch: sample.crouch,
    tick,
    atoll,
    crust: terrain.log.crust,
    pieces: yard.pieces,
    width: canvas.width,
    height: canvas.height,
  });
  scene.work = work;
  scene.time = tick / 30;
  const dir = project(0.5, 0.5, scene.camera);
  const hit = cast(scene.camera.origin, dir, scene.objects, scene.miss);
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
  const scene = buildScene({
    feet: player.position,
    yaw: sample.yaw,
    pitch: sample.pitch,
    crouch: sample.crouch,
    tick,
    atoll,
    crust: terrain.log.crust,
    pieces: yard.pieces,
    width,
    height,
  });
  const speed = Math.hypot(player.velocity[0], player.velocity[1]);
  const shot = resolveShot({
    eye: scene.camera.origin,
    forward: scene.camera.dir,
    speed,
    airborne: player.position[2] > 0.05,
    seed: tick,
    objects: scene.objects,
  });
  const nonce = tick;
  seenShots.add(nonce);
  if (!shot.hitbox) {
    report = "miss";
  } else {
    const applied = applyDummyHit(dummy, shot.hitbox);
    report = `${applied.hitbox} ${applied.damage}`;
  }
  const frame = encodeShot(identity, {
    nonce,
    origin: scene.camera.origin,
    dir: shot.dir,
    hitbox: shot.hitbox || "miss",
  });
  if (ops && ops.readyState === "open") ops.send(frame);
  else if (peer) shotFrames.push(frame);
}

function onOps(bytes) {
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
  if (ops && ops.readyState === "open") {
    for (const frame of terrain.take()) ops.send(frame);
    while (shotFrames.length) ops.send(shotFrames.shift());
  }
  publish();
}

if (params.get("autobit") === "1") {
  const aim = bitAim(player.position, yaw, pitch);
  for (let step = 0; step < 40; step++) terrain.dig(aim.eye, aim.aim, { peer });
}

async function link() {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  const channels = {};
  for (const spec of [["ctrl", 0, true], ["ops", 1, true], ["snap", 2, false]]) {
    const options = { negotiated: true, id: spec[1], ordered: spec[2] };
    if (!spec[2]) options.maxRetransmits = 0;
    const channel = pc.createDataChannel(spec[0], options);
    channel.binaryType = "arraybuffer";
    channels[spec[0]] = channel;
  }
  ops = channels.ops;
  ops.onmessage = (event) => onOps(new Uint8Array(event.data));
  const room = createRoom({
    url: params.get("signal") || "ws://127.0.0.1:8787",
    me: params.get("id"),
  });
  const linkLine = document.querySelector("#link");
  await room.start();
  await connectPeer({
    pc,
    room,
    me: params.get("id"),
    to: params.get("to"),
    offer: params.get("offer") === "1",
    isOpen: () => ops.readyState === "open",
    status: (line) => {
      if (linkLine) linkLine.textContent = line;
    },
  });
}

const first = input();
if (painter) fitCanvas(canvas, viewScale);
paint(first);
publish();
canvas.dataset.ready = "1";
canvas.dataset.pace = "vsync";

if (params.get("still") !== "1") {
  if (peer) link().catch((error) => {
    const linkLine = document.querySelector("#link");
    if (linkLine) linkLine.textContent = String(error);
  });
  const pacer = createPacer();
  let last = performance.now();
  let bank = 0;
  const frame = (now) => {
    try {
    bank += Math.min(0.1, (now - last) / 1000);
    last = now;
    const sample = input();
    const aimed = refreshAim(sample);
    while (bank >= 1 / 30) {
      stepDummy(dummy);
      if (cooldown > 0) cooldown -= 1;
      if (slot === "line" && (trigger || shotQueued) && cooldown === 0) {
        fire(sample);
        shotQueued = false;
        cooldown = 3;
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
              const nonce = tick;
              seenWalls.add(nonce);
              const frame = encodeWall(identity, { nonce, cell: raising.cell });
              if (ops && ops.readyState === "open") ops.send(frame);
              else if (peer) shotFrames.push(frame);
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
          terrain.dig(aim.eye, aim.aim, { peer });
        } else if (!raising) {
          work = null;
        }
      }
      stepHands(world, player, stamina, sample);
      const floor = columnFloor(terrain.log.crust, player.position[0], player.position[1]);
      if (floor < -0.01 && player.position[2] <= 0.02) {
        player.position[2] = floor;
        if (player.velocity[2] < 0) player.velocity[2] = 0;
      }
      tick += 1;
      bank -= 1 / 30;
    }
    if (!raising) {
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
    const active = !document.hidden && document.hasFocus();
    const decision = pacer.consider(now, active);
    viewScale = pacer.scale;
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
