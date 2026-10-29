import { paintFrame } from "../engine/frame.js";
import { buildScene } from "../render/scene.js";
import { createPlayer, createPlayerWorld, createStamina, TANGENT_GRAVITY } from "../sim/player.js";
import { stepHands } from "../sim/hands.js";

const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d", { alpha: false });
context.imageSmoothingEnabled = false;
const width = canvas.width;
const height = canvas.height;
const params = new URLSearchParams(location.search);
const keys = new Set();

const atoll = await fetch("/content/atoll.json").then((response) => response.json());
const spawn = params.get("look") === "dummy" ? atoll.placements.accuracyPad : atoll.placements.spawnFeet;
const player = createPlayer([spawn.x / 100, spawn.y / 100, spawn.z / 100]);
const world = createPlayerWorld(player);
world.tangentGravity = TANGENT_GRAVITY;
const stamina = createStamina();
let yaw = params.get("look") === "dummy" ? Math.PI / 2 : 0;
let pitch = params.get("look") === "dummy" ? -0.075 : 0;
let tick = (72 * 60 * 30) / 4;

addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") event.preventDefault();
});
addEventListener("keyup", (event) => keys.delete(event.code));
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

function paint(sample) {
  const scene = buildScene({
    feet: player.position,
    yaw,
    pitch,
    crouch: sample.crouch,
    tick,
    atoll,
    width,
    height,
  });
  const pixels = paintFrame(scene, width, height);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  canvas.dataset.center = `${pixels[center]},${pixels[center + 1]},${pixels[center + 2]}`;
}

const first = input();
paint(first);
canvas.dataset.ready = "1";

if (params.get("still") === "1") {
  // One frame, for the browser check. No loop.
} else {
  let last = performance.now();
  let bank = 0;
  const frame = (now) => {
    bank += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (bank >= 1 / 30) {
      const sample = input();
      stepHands(world, player, stamina, sample);
      tick += 1;
      bank -= 1 / 30;
    }
    paint(input());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
