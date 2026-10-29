import { paintFrame } from "../engine/frame.js";
import { buildScene } from "../render/scene.js";
import { createPlayer, createPlayerWorld, createStamina, TANGENT_GRAVITY } from "../sim/player.js";
import { stepHands } from "../sim/hands.js";
import { bitAim } from "../sim/bit.js";
import { createIdentity } from "../net/identity.js";
import { createTerrain } from "../net/terrain.js";
import { connectPeer, createRoom } from "../net/room.js";

const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d", { alpha: false });
context.imageSmoothingEnabled = false;
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
const terrain = createTerrain({
  identity: createIdentity(),
  leader: params.get("offer") === "1" || !peer,
});
let yaw = params.get("autobit") === "1" ? 0 : (params.get("look") === "dummy" ? Math.PI / 2 : 0);
let pitch = params.get("autobit") === "1" ? -1.2 : (params.get("look") === "dummy" ? -0.075 : 0);
let tick = (72 * 60 * 30) / 4;
let digging = false;
let ops = null;

addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") event.preventDefault();
});
addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0 && document.pointerLockElement === canvas) digging = true;
});
addEventListener("mouseup", (event) => {
  if (event.button === 0) digging = false;
});
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

function publish() {
  const voxel = terrain.voxel();
  const line = voxel === null ? "sand is intact" : `voxel ${voxel} hash ${terrain.hash()}`;
  const bit = document.querySelector("#bit");
  if (bit) bit.textContent = line;
  canvas.dataset.voxel = voxel === null ? "" : String(voxel);
  canvas.dataset.hash = terrain.hash();
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
    width,
    height,
  });
  const pixels = paintFrame(scene, width, height);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  canvas.dataset.center = `${pixels[center]},${pixels[center + 1]},${pixels[center + 2]}`;
}

function flush() {
  if (ops && ops.readyState === "open") {
    for (const frame of terrain.take()) ops.send(frame);
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
  ops.onmessage = (event) => terrain.receive(new Uint8Array(event.data));
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
paint(first);
publish();
canvas.dataset.ready = "1";

if (params.get("still") !== "1") {
  if (peer) link().catch((error) => {
    const linkLine = document.querySelector("#link");
    if (linkLine) linkLine.textContent = String(error);
  });
  let last = performance.now();
  let bank = 0;
  const frame = (now) => {
    bank += Math.min(0.1, (now - last) / 1000);
    last = now;
    const sample = input();
    while (bank >= 1 / 30) {
      if (digging || params.get("autobit") === "1") {
        const aim = bitAim(player.position, sample.yaw, sample.pitch, sample.crouch);
        terrain.dig(aim.eye, aim.aim, { peer });
      }
      stepHands(world, player, stamina, sample);
      tick += 1;
      bank -= 1 / 30;
    }
    if (params.get("nopaint") !== "1") paint(sample);
    flush();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
