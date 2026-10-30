import { paintFrame } from "../engine/frame.js";
import { hearStep } from "../audio/cues.js";
import { createListener } from "../audio/play.js";
import { createNotes, offerNotes, takeTold, writeNote } from "../sim/notes.js";
import { cast, project, worldToScreen } from "../engine/cast.js";
import { buildScene } from "../render/scene.js?v=56";
import { createGpuPainter, fitCanvas } from "../render/gpu.js?v=68";
import { createFps } from "../render/fps.js";
import { cameraAccel, cameraSpeed, createPacer, createPicturePace, paceWord, pictureSize, traceInterval, viewStill } from "../render/pace.js?v=79";
import {
  authority,
  bandage,
  blastPush,
  charterReady,
  clockName,
  companyWallet,
  crackGain,
  finGain,
  resonanceWord,
  spoilCap,
  spendLogistics,
  frontGain,
  titheDue,
  windAt,
} from "../sim/rules.js";
import { createPlayer, createPlayerWorld, createStamina, TANGENT_GRAVITY } from "../sim/player.js";
import { dayWord, DAY_TICKS } from "../sim/sun.js";
import { columnFloor } from "../sim/crust.js";
import { bitAim } from "../sim/bit.js";
import { toolAim } from "../sim/aim.js";
import { adoptSalvage, adoptWall, braceBonus, breakFin, createYard, pieceIntegrity, placeTicks, rollCart, toggleDoor, toggleGate, tryPlaceCart, tryPlaceDoor, tryPlaceFloor, tryPlacePost, tryPlaceRoad, tryPlaceWall, trySalvage, turnFin, turnWall } from "../sim/build.js";
import {
  adoptPiece,
  bindHearth,
  bruise,
  clubHit,
  coolPain,
  craftNeed,
  createVitals,
  finNeed,
  finOutput,
  limpFactor,
  recallPoint,
  stepDown,
  tryFinishFin,
  tryFinishHearth,
  fallHurt,
  bleed,
} from "../sim/hearth.js";
import { lookDirection, moveIntent, stepHands } from "../sim/hands.js?v=57";
import { createJump } from "../sim/jump.js";
import { createSkills, claimSpecialty, grantUse, skillRows } from "../sim/skills.js";
import { chaseOrigin, createCameraSpring, frameCamera, liftCamera, stepCamera, stepLook, CHASE, BODY_COLORS } from "../sim/body.js?v=51";
import { cycleTarget, listObjects, listPlayers } from "../sim/target.js";
import { cellSize, contourDetail, contourLines, createSurvey, inSense, mapAbilities, mapMarks, noteNearby, notePath, notePlace, noteSurvey, pathStamp, rememberGround } from "../sim/map.js";
import { GEO_COLOR, createPlate, dragCenter, mapSpan, revealLook, samplePlate, stamp } from "../sim/plate.js";
import { learnLore, friendTier, nextFriend, offerLore, packLore, shareRange, unpackLore } from "../sim/lore.js";
import { acceptPiece, encodePiece } from "../net/pieces.js";
import { acceptPrint, encodePrint } from "../net/prints.js";
import { addPrint } from "../sim/prints.js";
import { paintChart } from "../render/chart.js?v=66";
import { blendDir, blendOrigin, CLOSE, easeFollow, OPTICS, rangeRead, relaxOrbit, stepFollow, zoomFov } from "../sim/sight.js?v=8";
import { AGENDAS, createAgent, stepAgenda } from "../sim/ai.js";
import { appraise, subjectFromHit } from "../sim/appraise.js";
import { acceptSalvage, acceptWall, encodeSalvage, encodeWall } from "../net/walls.js";
import { applyDummyHit, createDummy, resolveShot, stepDummy } from "../sim/fire.js";
import { acceptHello, bytesHash } from "../net/hello.js";
import { createIdentity, exportKey, importKey, keyPhrase, signBytes } from "../net/identity.js";
import {
  acceptSheet,
  applyCharacter,
  browserStore,
  bytesHex,
  characterBody,
  encodeSheet,
  hexBytes,
  keepFrame,
  loadIdentity,
  loadPlate,
  loadSheet,
  loadWorld,
  saveIdentity,
  savePlate,
  saveSheet,
  saveWorld,
  unpackPlate,
} from "../sim/persist.js";
import { firstCrate } from "../sim/culture.js";
import { createPools, drainPool, flowOnce, notePool } from "../sim/pool.js";
import { deedVolume, grantKey, mayEdit } from "../sim/deed.js";
import { bondOpen, dragPace, hearBond, offerBond } from "../sim/fellowship.js";
import { boltHit, penFactor, startBolt, stepBolt } from "../sim/bolt.js";
import { noteHarm } from "../sim/identityharm.js";
import { cellId, inInterest, quorum, sameCell } from "../sim/cell.js";
import { maySit } from "../sim/command.js";
import { groundLook, standHeight } from "../sim/life.js?v=66";
import { swarmPoint } from "../sim/litho.js";
import { createVein, tapVein } from "../sim/vein.js";
import { separate } from "../sim/separate.js";
import { radialDown, shellDrop, shellTilt } from "../sim/shell.js";
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
const picture = createPicturePace();
let detailRays = 0;
let rayBudget = 4000;
let paintKind = "full";
let lastPaintMs = 0;
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
const followId = params.get("follow");
const agendaName = params.get("ai");
const extra = quiet || Boolean(followId) || Boolean(agendaName);
const paceBus = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("meridian-pace");
let primaryHolding = false;
if (extra && paceBus) {
  paceBus.onmessage = (event) => {
    if (event.data?.role === "primary") primaryHolding = event.data.holding === true;
  };
}
const agent = agendaName && AGENDAS[agendaName] ? createAgent(agendaName) : null;
const keys = new Set();
const peer = Boolean(params.get("id"));

const atoll = await fetch("/content/atoll.json").then((response) => response.json());
const catalogHex = await Promise.all([
  fetch("/content/atoll.json").then((response) => response.arrayBuffer()),
  fetch("/content/catalog.json").then((response) => response.arrayBuffer()),
]).then(([atollBytes, catalogBytes]) => bytesHash([new Uint8Array(atollBytes), new Uint8Array(catalogBytes)]));
const home = agent ? AGENDAS[agendaName].home : null;
const spawn = home
  ? { x: home[0] * 100, y: home[1] * 100, z: 0 }
  : params.get("gate") === "1"
  ? { x: 0, y: -11200, z: 0 }
  : params.get("look") === "dummy" ? atoll.placements.accuracyPad : atoll.placements.spawnFeet;
const player = createPlayer([spawn.x / 100, spawn.y / 100, spawn.z / 100]);
const world = createPlayerWorld(player);
world.tangentGravity = TANGENT_GRAVITY;
const stamina = createStamina();
const keepSlot = followId || params.get("look") || params.get("gate") || params.get("key") ? "" : agendaName ? `ai-${agendaName}` : "self";
const keptStore = browserStore();
const identity = importKey(params.get("key") || "") || (keepSlot && loadIdentity(keptStore, keepSlot)) || createIdentity();
if (keepSlot && !params.get("key")) saveIdentity(keptStore, identity, keepSlot);
const culture = firstCrate(params.get("culture") || "holds");
const pools = createPools();
const bonds = new Map();
const bolts = [];
const deedKeys = new Set();
const vein = createVein([8, -148]);
const WIND = [0.6, 0.1, 0];
const terrain = createTerrain({
  identity,
  leader: params.get("offer") === "1" || !peer,
});
const dummy = createDummy();
const yard = createYard(atoll.placements.footing);
yard.metal = culture.metal;
yard.stone = culture.stone;
yard.fiber = 2;
yard.sticks = 1;
yard.smokes = 1;
const foot = yard.pieces[0].at;
yard.pieces.push({ id: "table", at: [foot[0] + 2, foot[1]], anchors: true });
yard.pieces.push({ id: "trainer", at: [foot[0] + 3, foot[1]], anchors: true });
let seated = false;
let smokeAt = null;
let cultureName = culture.culture;
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
let turnEdge = false;
let smokeTicks = 0;
let shotLock = 0;
let digs = 0;
let awayTicks = 0;
let blasted = false;
let dragging = false;
const harmLog = [];
let actEdge = false;
let cycleEdge = 0;
let objectEdge = 0;
let rightEdge = false;
let autoRun = false;
let mapMode = "small";
const trail = [];
const selfPath = [];
const tracks = new Map();
const prints = [];
const seenPrints = new Set();
const survey = createSurvey();
const plate = createPlate();
let mapZoom = 1;
let mapFollow = true;
let mapCenter = [0, -150];
let mapDrag = null;
let lookRelease = false;
const friends = new Map();
const seenPeople = new Map();
const vitals = createVitals();
let loreNote = "";
let brush = "dig";
const listener = createListener();
const notes = createNotes();
let stepAt = null;
const heardAt = new Map();

function hear(name, amount = 1, pan = 0) {
  if (quiet || !name) return;
  const now = performance.now();
  const wait = name === "step" ? 160 : name === "hurt" ? 700 : 40;
  if (now - (heardAt.get(name) || 0) < wait) return;
  heardAt.set(name, now);
  listener.play(name, amount, pan);
}
let stillPose = null;
let lastCameraSpeed = 0;
let stillFor = 0;
let easedPixels = null;
let orbitYaw = 0;
let orbitPitch = 0;
let cameraDistance = CHASE;
let follow = { distance: CHASE, height: 0 };
let followAim = { distance: CHASE, height: 0 };
let rightDown = false;
let rightMoved = false;
let optics = "none";
let zoom = { distance: CHASE, first: false, level: 0, forced: false, blend: 0 };
let rangeText = "";
let selection = null;
const skills = createSkills();
const kept = keepSlot ? loadSheet(keptStore, keepSlot) : null;
let sheetSeq = kept?.seq || 0;
if (kept && keepSlot) {
  const pose = applyCharacter(kept, { player, skills, yard, survey, notes });
  yaw = pose.yaw;
  pitch = pose.pitch;
  for (const cell of survey.ground.values()) {
    stamp(plate, cell.point[0], cell.point[1], GEO_COLOR[cell.kind] || GEO_COLOR.sand, 1.6);
  }
}
if (keepSlot) unpackPlate(plate, loadPlate(keptStore, keepSlot));
let linkNote = "";
const net = { opsIn: 0, opsOut: 0, snapIn: 0, snapOut: 0, loreIn: 0, loreOut: 0, heard: 0, blocks: 0, dupes: 0 };
const keptWorld = keepSlot ? loadWorld(keptStore, `meridian-world-${keepSlot}`) : null;
const jump = createJump();
let ops = null;
const links = [];
let followed = null;
const poses = new Map();
let cameraSpring = null;
let cameraPos = null;
let cameraLook = null;

function windowFocused() {
  if (document.hidden) return false;
  if (document.hasFocus()) return true;
  try {
    return window.parent !== window && window.parent.document.hasFocus() && !window.parent.document.hidden;
  } catch {
    return false;
  }
}

function wallSeen(nonce, cell) {
  return `${Math.floor(nonce)}:${Math.floor(cell[0])}:${Math.floor(cell[1])}`;
}

function shareWalls(link) {
  let nonce = Math.max(1, Math.floor(tick));
  for (const piece of yard.pieces) {
    if (piece.id !== "wall") continue;
    enqueue(link, [encodeWall(identity, {
      nonce,
      cell: piece.at,
      integrity: Math.round(piece.integrity || 80),
      yaw: piece.yaw || 0,
    })]);
    nonce += 1;
  }
  for (const piece of yard.pieces) {
    if (piece.id !== "hearth" && piece.id !== "fin") continue;
    enqueue(link, [encodePiece(identity, { nonce, cell: piece.at, id: piece.id })]);
    nonce += 1;
  }
  for (const print of prints) {
    if (print.frame) enqueue(link, [print.frame]);
  }
}

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

function sendLore(frame) {
  net.loreOut += 1;
  const open = openLinks().filter((link) => link.lore && link.lore.readyState === "open");
  if (!open.length) {
    sendOps(frame);
    return;
  }
  for (const link of open) {
    try {
      link.lore.send(frame);
    } catch {
      sendOps(frame);
    }
  }
}

function rememberKept(frame) {
  if (!keepSlot || !keptWorld || !frame) return;
  const kind = frame[0];
  if (kind !== 9 && kind !== 10 && kind !== 11 && kind !== 13) return;
  if (keepFrame(keptWorld, frame)) saveWorld(keptStore, keptWorld, `meridian-world-${keepSlot}`);
}

function pushSheet() {
  if (!keepSlot) return;
  sheetSeq += 1;
  const body = characterBody({
    at: player.position,
    yaw,
    pitch,
    skills,
    metal: yard.metal,
    stone: yard.stone ?? 0,
    fiber: yard.fiber ?? 0,
    sticks: yard.sticks ?? 0,
    smokes: yard.smokes ?? 0,
    notes,
    ground: [...survey.ground.values()],
    seq: sheetSeq,
  });
  saveSheet(keptStore, body, keepSlot);
  savePlate(keptStore, plate, keepSlot);
  const frame = encodeSheet(identity, body);
  for (const link of links) {
    if (link.role !== "archive" || link.ops.readyState !== "open") continue;
    try {
      link.ops.send(frame);
    } catch {
      // The archive asks again by keeping the last sheet it already has.
    }
  }
}

function sendOps(frame) {
  rememberKept(frame);
  net.opsOut += 1;
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
  if (event.code === "KeyW" || event.code === "KeyA" || event.code === "KeyS" || event.code === "KeyD" || event.code === "KeyZ" || event.code === "KeyC") seated = false;
  if (event.code === "Tab" || event.code === "Backquote") event.preventDefault();
  if (event.repeat) return;
  playerPress(event.code);
  if (event.code === "KeyB") buyEdge = true;
  if (event.code === "KeyU") actEdge = true;
  if (event.code === "Tab") cycleEdge = event.shiftKey ? -1 : 1;
  if (event.code === "Backquote") objectEdge = event.shiftKey ? -1 : 1;
  if (event.code === "KeyQ" && !followId) autoRun = !autoRun;
  if (event.code === "KeyM") {
    mapMode = mapMode === "small" ? "full" : mapMode === "full" ? "none" : "small";
    showChart();
  }
  if (event.code === "Escape" && mapMode !== "none") {
    mapMode = "none";
    showChart();
  }
  if (event.code === "KeyV" && !followId) {
    if (view === "third") {
      view = "first";
      zoom = { ...zoom, first: true, forced: true, blend: 1 };
    } else {
      view = "third";
      zoom = { distance: CHASE, first: false, level: 0, forced: false, blend: 0 };
      cameraDistance = CHASE;
    }
  }
  if (event.code === "KeyR") {
    optics = OPTICS[(OPTICS.indexOf(optics) + 1) % OPTICS.length];
  }
  if (event.code === "BracketLeft" && !event.repeat) {
    brush = brush === "dig" ? "fill" : brush === "fill" ? "smooth" : "dig";
  }
  if (event.code === "BracketRight" && !event.repeat) turnEdge = true;
  if (event.code === "KeyY" && !event.repeat && selection?.kind === "player") {
    offerBond(bonds, selection.id);
    report = bonds.get(selection.id) === "both" ? "fellowship" : "offered";
  }
  if (event.code === "KeyO" && !event.repeat) report = keyPhrase(identity);
  if (event.code === "KeyG" && !event.repeat) {
    if (yard.stone > 0) {
      yard.stone -= 1;
      const eye = [player.position[0], player.position[1], player.position[2] + 1.4];
      bolts.push(startBolt(eye, lookDirection(yaw, pitch), 18));
      hear("shot", 0.4);
      report = "thrown";
    } else if (yard.smokes > 0) {
      yard.smokes -= 1;
      const dir = lookDirection(yaw, pitch);
      smokeAt = [player.position[0] + dir[0] * 6, player.position[1] + dir[1] * 6, player.position[2]];
      smokeTicks = 8 * 30;
      hear("shot", 0.3);
      report = "smoke";
    }
  }
  if (event.code === "KeyF" && !event.repeat && slot === "hammer") {
    const mark = refreshAim(input());
    const placed = tryPlaceFloor(yard, mark.cell);
    report = placed.ok ? "floor" : placed.reason;
  }
  if (event.code === "KeyJ" && !event.repeat && slot === "hammer") {
    const mark = refreshAim(input());
    const placed = tryPlaceCart(yard, mark.cell);
    report = placed.ok ? "cart" : placed.reason;
  }
  if (event.code === "KeyT" && !event.repeat) {
    const mark = refreshAim(input());
    if (mark.cell) {
      yard.pieces.push({ id: "mission", at: mark.cell.slice(), anchors: true });
      report = "mission";
    }
  }
  if (event.code === "KeyP" && !event.repeat && slot === "hammer") {
    const mark = refreshAim(input());
    const placed = tryPlacePost(yard, mark.cell);
    report = placed.ok ? "post" : placed.reason;
  }
  if (event.code === "KeyL" && !event.repeat && slot === "hammer") {
    const mark = refreshAim(input());
    const placed = tryPlaceRoad(yard, mark.cell);
    report = placed.ok ? "road" : placed.reason;
  }
  if (event.code === "KeyM" && !event.repeat && slot === "hammer") {
    const mark = refreshAim(input());
    const placed = tryPlaceDoor(yard, mark.cell);
    report = placed.ok ? "door" : placed.reason;
  }
  if (event.code === "KeyB" && !event.repeat && !entryState.joined) {
    const leg = vitals.left <= vitals.right ? "left" : "right";
    if (vitals[leg] < 100 && yard.sticks > 0) {
      vitals[leg] = Math.min(100, vitals[leg] + 20);
      yard.sticks -= 1;
      report = "splint";
    } else if (bandage(vitals, yard.fiber)) {
      yard.fiber -= 1;
      report = "bandage";
    } else report = yard.fiber < 1 ? "fiber" : "whole";
  }
  if (event.code === "KeyX" && !event.repeat && selection?.kind === "player") {
    dragging = !dragging;
    report = dragging ? "drag" : "let go";
  }
  if (event.code === "KeyN" && !event.repeat && notes.length) {
    const at = [Math.round(player.position[0] / 0.5), Math.round(player.position[1] / 0.5)];
    yard.pieces.push({ id: "slip", at, anchors: true, text: notes[notes.length - 1].line, by: "self" });
    report = "slip";
  }
  if (event.code === "KeyH" && !event.repeat && selection?.kind === "player" && yard.bound) {
    grantKey(deedKeys, selection.id);
    report = "key";
  }
  if (event.code === "KeyK" && !event.repeat) listener.toggle();
  if (event.code === "Space") event.preventDefault();
});
addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0 && document.pointerLockElement === canvas) {
    lookRelease = true;
    document.exitPointerLock();
    return;
  }
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
  if (orbiting) return;
  useRightClick();
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("click", () => {
  if (lookRelease) {
    lookRelease = false;
    return;
  }
  canvas.requestPointerLock();
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  turnWheel(Math.sign(event.deltaY) || 1);
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
  const intent = moveIntent({
    forward: keys.has("KeyW") ? 1 : 0,
    back: keys.has("KeyS") ? 1 : 0,
    sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
    auto: autoRun,
  });
  return {
    yaw,
    pitch,
    forward: intent.forward,
    strafe: (keys.has("KeyC") ? 1 : 0) - (keys.has("KeyZ") ? 1 : 0),
    sprint: intent.sprint,
    crouch: keys.has("ControlLeft") || keys.has("ControlRight"),
    jump: keys.has("Space"),
    run: skills.run.value,
    wind: skills.wind.value,
  };
}

function playerPress(code) {
  if (code === "Digit1") slot = "line";
  if (code === "Digit3") slot = slot === "bit" ? "hammer" : "bit";
  if (code === "KeyE") {
    if (entryState.prompt) useEdge = true;
    else selectEdge = true;
  }
}

function turnWheel(direction) {
  followAim = stepFollow(followAim, direction);
}

function useRightClick() {
  if (followId || slot !== "hammer") return;
  const mark = refreshAim(input());
  if (!mark.inRange || (mark.kind !== "wall" && mark.kind !== "crate" && mark.kind !== "wreck")) {
    if (agent) agent.salvage = false;
    report = "far";
    return;
  }
  const saved = trySalvage(yard, mark.cell);
  if (saved.ok) {
    hear("salvage");
    const signed = signBytes(identity, new TextEncoder().encode(`${Math.floor(tick)}:salvage`));
    noteHarm(harmLog, "self", "salvage", signed.sig[0] || 0);
  }
  report = saved.ok ? "salvage" : saved.reason;
  if (!saved.ok) return;
  const nonce = Math.floor(tick);
  const frame = encodeSalvage(identity, { nonce, cell: mark.cell });
  sendOps(frame);
}

function applyAgenda(command) {
  for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyC"]) keys.delete(code);
  if (command.forward > 0) keys.add("KeyW");
  if (command.forward < 0) keys.add("KeyS");
  yaw = command.yaw;
  if (command.pitch != null) pitch = command.pitch;
  if (command.slot === "line") playerPress("Digit1");
  else if ((command.slot === "bit" || command.slot === "hammer") && slot !== command.slot) playerPress("Digit3");
  if (command.identify) playerPress("KeyE");
  trigger = !!command.hold;
  if (command.shot) shotQueued = true;
  if (command.zoom) turnWheel(command.zoom);
  if (command.salvage && slot === "hammer" && !agent.salvage) rightEdge = true;
  agent.salvage = !!(command.salvage && slot === "hammer");
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
  for (const [id, pose] of poses) {
    if (pose.yaw === undefined) continue;
    list.push({
      id,
      feet: [pose.x, pose.y, pose.z],
      yaw: pose.yaw,
      color: BODY_COLORS[id] || [0.55, 0.42, 0.22, 1],
    });
  }
  return list;
}

function drawnOthers() {
  const list = otherActors();
  if (!dragging || selection?.kind !== "player") return list;
  const dir = lookDirection(yaw, 0);
  return list.map((actor) => actor.id === selection.id
    ? { ...actor, feet: [actor.feet[0] + dir[0] * 0.9, actor.feet[1] + dir[1] * 0.9, actor.feet[2]] }
    : actor);
}

function cameraAim(sample = {}) {
  const bodyYaw = sample.yaw ?? yaw;
  const bodyPitch = sample.pitch ?? pitch;
  const locked = zoom.blend >= 1 || (view === "first" && zoom.blend === 0);
  if (locked) {
    return {
      yaw: bodyYaw,
      pitch: bodyPitch,
      distance: null,
      third: false,
      fov: zoomFov(zoom.level, skills.eyesight.value + skills.focus.value * 0.5, optics),
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
  follow = easeFollow(follow, followAim, dt);
  cameraDistance = follow.distance;
  const eased = relaxOrbit(orbitYaw, orbitPitch, dt, rightDown);
  orbitYaw = eased.yaw;
  orbitPitch = eased.pitch;
  const aim = cameraAim(sample);
  const feet = followId && followed && followed.yaw !== undefined
    ? [followed.x, followed.y, followed.z]
    : player.position;
  const eye = followId ? 1.65 : (sample.crouch ? 1.1 : 1.65);
  const eyes = [feet[0], feet[1], feet[2] + eye];
  const behind = chaseOrigin(
    feet,
    aim.yaw,
    aim.pitch,
    followId ? false : !!sample.crouch,
    aim.third ? aim.distance : CLOSE,
  );
  behind[2] += follow.height;
  const blend = aim.third ? zoom.blend : 1;
  let ideal = blendOrigin(behind, eyes, blend);
  let idealLook = blendDir(lookDirection(aim.yaw, aim.pitch), lookDirection(sample.yaw ?? yaw, sample.pitch ?? pitch), blend);
  const framing = selection?.point && aim.third && zoom.blend < 0.45 && !rightDown
    ? frameCamera(feet, selection.point, aim.distance || CHASE)
    : null;
  if (framing) {
    framing.origin[2] += follow.height;
    ideal = blendOrigin(framing.origin, eyes, blend);
    idealLook = blendDir(framing.dir, lookDirection(sample.yaw ?? yaw, sample.pitch ?? pitch), blend);
  }
  const tilt = shellTilt(shellDrop(feet[0], feet[1]));
  if (tilt) {
    idealLook = [idealLook[0], idealLook[1], idealLook[2] - tilt];
    const len = Math.hypot(idealLook[0], idealLook[1], idealLook[2]) || 1;
    idealLook = [idealLook[0] / len, idealLook[1] / len, idealLook[2] / len];
  }
  liftCamera(ideal, standHeight(ideal[0], ideal[1], columnFloor(terrain.log.crust, ideal[0], ideal[1])));
  if (!cameraSpring) cameraSpring = createCameraSpring(ideal);
  cameraPos = stepCamera(cameraSpring, ideal, dt);
  const landed = standHeight(cameraPos[0], cameraPos[1], columnFloor(terrain.log.crust, cameraPos[0], cameraPos[1]));
  if (cameraPos[2] < landed + 0.45) {
    cameraPos[2] = landed + 0.45;
    cameraSpring.vel[2] = Math.max(0, cameraSpring.vel[2]);
  }
  cameraLook = stepLook(cameraSpring, idealLook, dt);
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
    self: !followId && zoom.blend < 0.65 && view !== "first",
    others: drawnOthers(),
    cameraOrigin: cameraPos,
    cameraDir: cameraLook,
    fov: aim.fov,
    smoke: smokeTicks > 0 ? (smokeAt || player.position) : null,
    swarm: swarmPoint(player.position[0], player.position[1], digs),
    pools,
    bolts,
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
  if (result.known) {
    grantUse(skills, "appraisal", { tick });
    writeNote(notes, skills, subject.kind === "paper" ? "paper" : "seen", { line: result.line });
    if (subject.kind === "slip" && subject.detail) takeTold(notes, skills, subject.detail);
  }
  selection = { ...subject, id, line: result.line, canAct: result.canAct };
  notePlace(survey, {
    id,
    kind: subject.kind,
    name: subject.name,
    point: subject.point,
  }, skillBag());
  report = result.line;
}

function skillBag() {
  return {
    mapping: skills.mapping.value,
    mining: skills.mining.value,
    building: skills.building.value,
    appraisal: skills.appraisal.value,
    eyesight: skills.eyesight.value,
    ranging: skills.ranging.value,
  };
}

function landmarks() {
  const { dummy, footing, accuracyPad, crate } = atoll.placements;
  return [
    { id: "dummy", kind: "dummy", name: "dummy", point: [dummy.x / 100, dummy.y / 100, 0] },
    { id: "footing", kind: "footing", name: "footing", point: [footing.x / 100, footing.y / 100, 0] },
    { id: "pad", kind: "pad", name: "pad", point: [accuracyPad.x / 100, accuracyPad.y / 100, 0] },
    { id: "crate", kind: "crate", name: "crate", point: [crate.x / 100, crate.y / 100, 0] },
  ];
}

function geographyAt(x, y) {
  const depth = columnFloor(terrain.log.crust, x, y);
  const cmx = x * 100;
  const cmy = y * 100;
  for (const prop of atoll.props) {
    const box = prop.box;
    if (cmx < box.min.x || cmx > box.max.x || cmy < box.min.y || cmy > box.max.y) continue;
    return { kind: prop.material === "stone" ? "stone" : "wood", depth, color: prop.material === "stone" ? GEO_COLOR.stone : GEO_COLOR.wood };
  }
  for (const piece of yard.pieces) {
    const px = piece.at[0] * 0.5;
    const py = piece.at[1] * 0.5;
    if (Math.abs(px - x) > 0.35 || Math.abs(py - y) > 0.35) continue;
    return { kind: piece.id === "footing" ? "stone" : "wood", depth, color: piece.id === "footing" ? GEO_COLOR.stone : GEO_COLOR.wood };
  }
  if (depth < -0.05) return { kind: "pit", depth, color: GEO_COLOR.pit };
  const look = groundLook(x, y);
  return { kind: look.kind, depth, color: look.color };
}

function revealMap() {
  const points = revealLook({
    x: player.position[0],
    y: player.position[1],
    yaw,
    pitch,
    skills: skillBag(),
  });
  const brush = Math.max(1.6, cellSize(skills.mapping.value));
  for (const point of points) {
    const geo = geographyAt(point.x, point.y);
    stamp(plate, point.x, point.y, geo.color || GEO_COLOR[geo.kind] || GEO_COLOR.sand, brush);
    rememberGround(survey, point.x, point.y, geo.kind, skillBag());
  }
  if (mapMode !== "none") grantUse(skills, "topography", { tick, gap: 40 });
}

function bindChart() {
  const chart = document.querySelector("#chart");
  const surface = document.querySelector("#map");
  if (!chart || !surface || chart.dataset.bound) return;
  chart.dataset.bound = "1";
  chart.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const direction = Math.sign(event.deltaY) || 1;
    mapZoom = Math.max(0.25, Math.min(8, mapZoom * (direction > 0 ? 1 / 1.18 : 1.18)));
  }, { passive: false });
  surface.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const center = mapFollow ? [player.position[0], player.position[1]] : mapCenter.slice();
    mapFollow = false;
    mapCenter = center;
    mapDrag = { x: event.clientX, y: event.clientY, center };
    surface.setPointerCapture?.(event.pointerId);
  });
  surface.addEventListener("pointermove", (event) => {
    if (!mapDrag) return;
    const rect = surface.getBoundingClientRect();
    const span = mapSpan(skills.mapping.value, mapZoom);
    mapCenter = dragCenter(mapDrag.center, event.clientX - mapDrag.x, event.clientY - mapDrag.y, span, rect.width || surface.width);
  });
  const endDrag = () => {
    mapDrag = null;
  };
  surface.addEventListener("pointerup", endDrag);
  surface.addEventListener("pointercancel", endDrag);
}

function showChart() {
  const chart = document.querySelector("#chart");
  const surface = document.querySelector("#map");
  const open = mapMode !== "none";
  if (chart) {
    chart.classList.toggle("open", open);
    chart.classList.toggle("full", mapMode === "full");
  }
  document.documentElement.classList.toggle("mapped", mapMode === "small");
  if (!surface) return;
  const quiet = document.documentElement.classList.contains("quiet");
  const side = mapMode === "full"
    ? Math.max(256, Math.min(window.innerWidth, window.innerHeight) - 36)
    : quiet ? 112 : 220;
  if (surface.width !== side) {
    surface.width = side;
    surface.height = side;
  }
}

function sensedPeople() {
  const ability = mapAbilities(skills.mapping.value);
  if (!ability.people) {
    seenPeople.clear();
    return [];
  }
  for (const other of otherActors()) {
    if (inSense(player.position, other.feet, ability.radius)) {
      seenPeople.set(other.id, { ...other, tick });
    }
  }
  for (const [id, contact] of seenPeople) {
    if (tick - contact.tick > ability.memory) seenPeople.delete(id);
  }
  return [...seenPeople.values()];
}

function drawChart() {
  showChart();
  if (mapMode === "none") return;
  bindChart();
  if (mapFollow) mapCenter = [player.position[0], player.position[1]];
  const ability = mapAbilities(skills.mapping.value);
  const objects = listObjects({
    dummy: atoll.placements.dummy,
    pieces: yard.pieces,
    props: atoll.props,
    feet: player.position,
  });
  const plotted = mapMarks({
    self: player.position,
    skill: skills.mapping.value,
    target: selection,
    objects,
    trail,
    known: sensedPeople().map((person) => ({
      ...person,
      label: friends.has(person.id) ? `${person.id} ${friendTier(friends.get(person.id))}` : person.id,
    })),
    ground: [...survey.ground.values()],
    places: [...survey.places.values()],
  });
  for (const point of selfPath) plotted.marks.push({ kind: "path", id: "self", point });
  if (skills.trailing.value >= 4) {
    for (const [id, line] of tracks) {
      for (const point of line) plotted.marks.push({ kind: "track", id, point });
    }
  }
  const span = mapSpan(skills.mapping.value, mapZoom);
  const rise = standHeight(player.position[0], player.position[1], columnFloor(terrain.log.crust, player.position[0], player.position[1]));
  const detail = contourDetail(skills.topography.value);
  const contours = detail.step > 0 ? contourLines({
    x: mapCenter[0],
    y: mapCenter[1],
    span,
    step: detail.step,
    cells: mapMode === "full" ? detail.cells + 8 : detail.cells,
    heightAt: (x, y) => standHeight(x, y, columnFloor(terrain.log.crust, x, y)),
    knownAt: (x, y) => samplePlate(plate, x, y)[3] > 0,
  }) : [];
  paintChart(document.querySelector("#map"), document.querySelector("#fix"), {
    self: player.position,
    yaw,
    skill: skills.mapping.value,
    marks: plotted.marks,
    radius: ability.radius,
    plate,
    center: mapCenter,
    span,
    rise,
    contours,
  });
}

function cycle(step, kind) {
  const options = {
    dummy: atoll.placements.dummy,
    others: otherActors(),
    pieces: yard.pieces,
    props: atoll.props,
    feet: player.position,
  };
  const list = kind === "player" ? listPlayers(options) : listObjects(options);
  const next = cycleTarget(list, selection?.id, step);
  if (!next) {
    report = kind === "player" ? "no one to target" : "nothing to target";
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
  if (selection.kind === "table") {
    const near = Math.hypot(player.position[0] - selection.point[0], player.position[1] - selection.point[1]) < 2.4;
    if (maySit(near, entryState.joined)) {
      seated = !seated;
      report = seated ? "seated" : "stood";
    } else report = "closed";
    return;
  }
  if (selection.kind === "trainer") {
    report = claimSpecialty(skills) || "refused";
    return;
  }
  if (selection.kind === "fin" && selection.cell) {
    const broken = breakFin(yard, selection.cell);
    report = broken.ok ? "broken" : broken.reason;
    return;
  }
  if (selection.kind === "wall" && selection.cell) {
    const told = [...notes].reverse().find((note) => note.kind === "told");
    const piece = told && yard.pieces.find((item) => item.id === "wall" && item.at[0] === selection.cell[0] && item.at[1] === selection.cell[1]);
    if (piece) {
      piece.line = told.line;
      piece.by = told.by || "";
      report = "pinned";
      return;
    }
  }
  if (selection.kind === "slip" && selection.cell) {
    const slip = yard.pieces.find((piece) => piece.id === "slip" && piece.at[0] === selection.cell[0] && piece.at[1] === selection.cell[1]);
    if (slip) {
      takeTold(notes, skills, slip.text || "", slip.by || "");
      yard.pieces = yard.pieces.filter((piece) => piece !== slip);
      report = "picked up";
      return;
    }
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
    grantUse(skills, "prospect", { tick, gap: 45 });
    report = "dig";
    return;
  }
  if (selection.kind === "wall" && selection.cell) {
    if (dist > 4) {
      report = "too far";
      return;
    }
    const saved = trySalvage(yard, selection.cell);
    if (saved.ok) hear("salvage");
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
  list.replaceChildren(...skillRows().map((row) => {
    const skill = skills[row.name];
    const label = document.createElement("span");
    label.textContent = skill.specialized ? `${row.name}*` : row.name;
    const track = document.createElement("span");
    track.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.min(100, skill.value)}%`;
    track.append(fill);
    const value = document.createElement("b");
    value.textContent = String(Math.floor(skill.value));
    const item = document.createElement("li");
    if (row.child) item.className = "child";
    item.append(label, track, value);
    return item;
  }));
}

function paintNotes() {
  const list = document.querySelector("#notes");
  if (!list) return;
  const lines = notes.map((note) => note.line).join("\n");
  if (list.dataset.lines === lines) return;
  list.dataset.lines = lines;
  list.replaceChildren(...notes.slice(-6).map((note) => {
    const item = document.createElement("li");
    item.textContent = note.line;
    if (note.kind === "told") item.style.color = "#9cf";
    return item;
  }));
}

function paintNet() {
  const node = document.querySelector("#net");
  if (!node) return;
  const open = links.filter((link) => link.ops?.readyState === "open");
  const players = open.filter((link) => link.role !== "archive").length;
  const archives = open.filter((link) => link.role === "archive").length;
  const connecting = opening.size + links.filter((link) => link.ops && link.ops.readyState !== "open").length;
  const ice = {};
  let buffered = 0;
  for (const link of links) {
    const state = link.pc?.iceConnectionState || "new";
    ice[state] = (ice[state] || 0) + 1;
    buffered += link.ops?.bufferedAmount || 0;
    buffered += link.lore?.bufferedAmount || 0;
  }
  const tip = tipOf(worldChain).block;
  const behind = Math.max(0, terrain.log.seq - tip.seq);
  const iceLine = Object.entries(ice).map(([name, count]) => `${name} ${count}`).join(" ") || "none";
  const chainWord = terrain.log.seq > tip.seq ? "provisional" : tip.height ? "official" : "empty";
  node.textContent = [
    players || archives ? `players ${players}    archives ${archives}` : "alone",
    `links ${open.length} open    ${connecting} connecting`,
    `ice ${iceLine}`,
    `ops in ${net.opsIn} out ${net.opsOut}    snap in ${net.snapIn} out ${net.snapOut}`,
    `lore in ${net.loreIn} out ${net.loreOut}    heard ${net.heard}`,
    `block ${tip.height} ${chainWord}    behind ${behind}    dupes ${net.dupes}`,
    `sheet ${sheetSeq}    poses ${poses.size}    buffered ${buffered}`,
    linkNote,
  ].filter(Boolean).join("\n");
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
  const fluxPiece = yard.pieces.find((piece) => piece.id === "fin");
  const flux = fluxPiece && !fluxPiece.broken ? ` · flux ${Math.round(finOutput(tick) * finGain(fluxPiece.yaw || 0))}` : "";
  const boundNote = yard.bound ? " · bound" : "";
  const legNote = (vitals.left < 100 || vitals.right < 100) ? ` · L${Math.ceil(vitals.left)} R${Math.ceil(vitals.right)}` : "";
  const hurt = vitals.down > 0 ? "" : ` · body ${Math.ceil(vitals.integrity)}${vitals.blood < 100 ? ` blood ${Math.ceil(vitals.blood)}` : ""}${legNote}`;
  const spoilNote = yard.spoil ? ` · spoil ${yard.spoil}/${spoilCap(skills.mining.value)}` : "";
  const brushNote = slot === "bit" && brush !== "dig" ? ` · ${brush}` : "";
  const light = dayWord(tick);
  const lightNote = ` · ${light}`;
  listener.setLevel(light === "night" ? 0.45 : light === "dawn" || light === "dusk" ? 0.7 : 1);
  const muteNote = listener.muted ? " · muted" : "";
  const friendNote = selection?.kind === "player" && friends.has(selection.id)
    ? ` · ${friendTier(friends.get(selection.id))} ${friends.get(selection.id)}`
    : "";
  const withYou = [...bonds.entries()].filter(([, state]) => state === "both").map(([id]) => id);
  const bondNote = withYou.length ? ` · with ${withYou.join(" ")}` : "";
  const drop = shellDrop(player.position[0], player.position[1]);
  const dropNote = drop > 0.02 ? ` · drop ${drop.toFixed(2)}` : "";
  const reloadNote = shotLock > 0 ? ` · reload ${shotLock}` : "";
  const harmNote = harmLog.length ? ` · harm ${harmLog.length}` : "";
  const clockNote = ` · ${clockName(entryState.joined, seated)}`;
  const cultureNote = ` · ${cultureName}`;
  const felt = resonanceWord(digs);
  const resonanceNote = felt ? ` · ${felt}` : "";
  const charterNote = charterReady(withYou.length, yard.bound)
    ? ` · charter${withYou[0] ? ` by ${withYou[0]}` : ""}${spendLogistics(companyWallet(), 1) ? "" : " · no spend"}`
    : "";
  const dragNote = dragging ? " · drag" : "";
  const fiberNote = yard.fiber ? ` · fiber ${yard.fiber}` : "";
  const turnId = authority([...links.map((link) => link.to), meId].filter(Boolean), tick);
  const turnNote = links.length ? ` · turn ${turnId}` : "";
  const awayNote = awayTicks > 0 ? ` · away ${Math.ceil(awayTicks / 30)}` : "";
  const pace = canvas.dataset.pace || "vsync";
  const rate = canvas.dataset.fps || "0";
  const aim = canvas.dataset.aim ? ` · ${canvas.dataset.aim}` : "";
  const contract = entryState.joined ? "" : entryState.prompt;
  const strike = entryState.joined ? entryLine(entryState) : contract;
  const archives = links.filter((link) => link.role === "archive" && link.ops.readyState === "open").length;
  const players = links.filter((link) => link.role !== "archive" && link.ops.readyState === "open").length;
  const companyNote = archives + players
    ? ` · with ${players} ${players === 1 ? "player" : "players"} · ${archives} ${archives === 1 ? "archive" : "archives"}`
    : " · alone";
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
  const autoNote = autoRun ? " · auto" : "";
  if (bit) bit.textContent = `${players || archives ? `with ${players} ${players === 1 ? "player" : "players"} · ${archives} ${archives === 1 ? "archive" : "archives"}` : "alone"} · ${chainNote} · ${eyeView ? "eyes" : view}${autoNote} · ${skillNote || "skills 0"}${charge}${opticNote}${rangeNote}${known}${friendNote}${bondNote}${dropNote}${cultureNote}${clockNote}${reloadNote}${fiberNote}${harmNote}${resonanceNote}${charterNote}${dragNote}${turnNote}${awayNote} · ${slot}${brushNote}${aim} · metal ${yard.metal} · stone ${yard.stone ?? 0}${spoilNote} · walls ${walls}${boundNote}${flux}${hurt}${lightNote}${muteNote}${strike ? ` · ${strike}` : ""}${report ? ` · ${report}` : ""}${loreNote ? ` · ${loreNote}` : ""}${seen ? ` · seen ${seen}` : ""} · ${body} · ${ground} · ${rate} fps · ${pace} ${canvas.width}×${canvas.height}`;
  paintNet();
  const range = document.querySelector("#range");
  if (range) range.textContent = rangeText;
  const counter = document.querySelector("#fps");
  const cadence = Number(canvas.dataset.cadence) > 0 ? ` · ${Math.round(1000 / Number(canvas.dataset.cadence))}Hz` : "";
  const info = Number(canvas.dataset.info) > 0 ? ` · info ${Number(canvas.dataset.info) >= 1e6 ? `${(Number(canvas.dataset.info) / 1e6).toFixed(1)}M` : Number(canvas.dataset.info) >= 1e3 ? `${Math.round(Number(canvas.dataset.info) / 1e3)}k` : Math.round(Number(canvas.dataset.info))}` : "";
  const glide = canvas.dataset.speed ? ` · ${canvas.dataset.speed}m/s${canvas.dataset.accel ? ` · a ${canvas.dataset.accel}` : ""}` : "";
  const buf = canvas.dataset.traceW ? ` · buf ${canvas.dataset.traceW}×${canvas.dataset.traceH}` : "";
  if (counter) counter.textContent = `${rate} fps${cadence} · ${canvas.width}×${canvas.height}${buf}${info}${glide}`;
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
  paintNotes();
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

function paint(sample, width = canvas.width, height = canvas.height) {
  const scene = sceneFor(sample, width, height);
  scene.prints = prints;
  scene.work = work;
  scene.time = tick / 30;
  markTarget(scene);
  const dir = project(0.5, 0.5, scene.camera);
  const hit = cast(scene.camera.origin, dir, scene.objects, scene.miss);
  const inEyes = zoom.blend >= 1 || (view === "first" && zoom.blend === 0);
  const ranged = inEyes
    ? cast(scene.camera.origin, dir, scene.objects.filter((object) => !object.self), scene.miss)
    : null;
  const reading = inEyes ? rangeRead(ranged?.object ? ranged.t : null, skills.ranging.value + skills.measure.value * 0.5, optics) : null;
  rangeText = reading?.text || "";
  if (reading?.meters != null) grantUse(skills, "ranging", { tick, gap: 45 });
  const color = hit.color || scene.miss;
  canvas.dataset.center = `${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)}`;
  showSight(slot === "bit" || slot === "hammer" ? refreshAim(sample) : null);
  if (painter) {
    const drew = painter.paint(scene, width, height);
    if (!drew) canvas.dataset.gpuError = canvas.dataset.gpuError || "draw";
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
  if (shotLock > 0) {
    report = "reload";
    return;
  }
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
    const voters = 1 + links.filter((link) => {
      const pose = poses.get(link.to);
      return pose && sameCell(cellId(player.position[1]), cellId(pose.y));
    }).length;
    if (quorum(voters, voters)) {
      const applied = applyDummyHit(dummy, shot.hitbox);
      const scaled = Math.round(applied.damage * penFactor(0, 1));
      grantUse(skills, "marksmanship", { tick });
      if (dayWord(tick) === "night") grantUse(skills, "marksmanship", { tick });
      report = `${applied.hitbox} ${scaled} quorum`;
    } else report = "provisional";
  }
  const frame = encodeShot(identity, {
    nonce,
    origin: eye,
    dir: shot.dir,
    hitbox: shot.hitbox || "miss",
  });
  sendOps(frame);
  shotLock = 12;
  if (selection?.kind === "player") {
    friends.set(selection.id, -1);
    bonds.delete(selection.id);
  }
  if (!shot.hitbox) bolts.push(startBolt(eye, shot.dir));
  const look = lookDirection(sample.yaw, sample.pitch);
  const facing = look[0] * shot.dir[0] + look[1] * shot.dir[1] + look[2] * shot.dir[2];
  hear("shot", (shot.hitbox ? 1 : 0.35) * crackGain(Math.hypot(player.position[0] - atoll.placements.dummy.x / 100, player.position[1] - atoll.placements.dummy.y / 100)) * frontGain(facing), Math.max(-1, Math.min(1, shot.dir[0])));
}

function ownKeys() {
  const keys = new Set();
  for (const op of terrain.log.ops) {
    const body = decode(op.proposal).body;
    for (const write of body.writes) keys.add(`${write[0]},${write[1]},${write[2]}`);
  }
  return keys;
}

function exchangeLore() {
  const bag = skillBag();
  const range = shareRange(bag);
  for (const other of otherActors()) {
    const dist = Math.hypot(other.feet[0] - player.position[0], other.feet[1] - player.position[1]);
    const score = nextFriend(friends.get(other.id) || 0, dist <= range);
    friends.set(other.id, score);
    if (bonds.get(other.id) === "ours" && (score >= 12 || other.id.startsWith("ai-"))) hearBond(bonds, other.id);
    if (dist > range) continue;
    const offer = offerLore({
      skills: bag,
      friend: bondOpen(bonds, other.id, true) ? Math.max(score, 40) : score,
      ground: [...survey.ground.values()],
      places: [...survey.places.values()],
    });
    const spoken = offerNotes(notes, bag, offer.tier);
    if (!offer.ground.length && !offer.places.length && !spoken.length) continue;
    const packed = packLore(offer);
    sendLore(encodeLore(identity, { nonce: tick, friend: score, notes: spoken, ...packed }));
    loreNote = `${offer.tier} ${other.id}`;
  }
}

function onOps(bytes, from) {
  if (bytes[0] === 15) {
    const accepted = acceptSheet(bytes);
    if (!accepted.ok || !keepSlot) return;
    if (bytesHex(accepted.pubkey) !== bytesHex(identity.pubkey)) return;
    if ((accepted.seq || 0) <= sheetSeq) return;
    const pose = applyCharacter(accepted.body, { player, skills, yard, survey, notes });
    yaw = pose.yaw;
    pitch = pose.pitch;
    sheetSeq = accepted.seq;
    saveSheet(keptStore, accepted.body, keepSlot);
    for (const cell of survey.ground.values()) {
      stamp(plate, cell.point[0], cell.point[1], GEO_COLOR[cell.kind] || GEO_COLOR.sand, 1.6);
    }
    report = "kept";
    return;
  }
  rememberKept(bytes);
  if (bytes[0] === 11) {
    const decoded = decodeBlock(bytes);
    if (!decoded.ok) return;
    const accepted = acceptBlock(worldChain, decoded.block);
    if (!accepted.ok || accepted.duplicate) {
      if (accepted.duplicate) net.dupes += 1;
      return;
    }
    net.blocks += 1;
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
  if (bytes[0] === 14) {
    const accepted = acceptPrint(bytes);
    if (!accepted.ok) return;
    const seen = `${accepted.who}:${accepted.nonce}`;
    if (seenPrints.has(seen)) return;
    seenPrints.add(seen);
    const placed = addPrint(prints, accepted);
    if (placed) prints[prints.length - 1].frame = bytes;
    return;
  }
  if (bytes[0] === 13) {
    const accepted = acceptPiece(bytes);
    if (!accepted.ok) return;
    adoptPiece(yard, accepted.cell, accepted.id);
    report = accepted.id;
    return;
  }
  if (bytes[0] === 12) {
    const accepted = acceptLore(bytes);
    if (!accepted.ok) return;
    const heard = unpackLore(accepted);
    const learned = learnLore(survey, plate, heard, skillBag(), stamp, GEO_COLOR);
    if (from) friends.set(from, nextFriend(Math.max(friends.get(from) || 0, accepted.friend || 0), true));
    let told = 0;
    for (const line of accepted.notes || []) {
      if (takeTold(notes, skillBag(), line)) told += 1;
    }
    if (learned.ground || learned.places) {
      net.heard += learned.ground + learned.places;
      loreNote = `heard ${learned.ground + learned.places}`;
    } else if (told) loreNote = "heard a note";
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
    if (!accepted.ok || seenWalls.has(wallSeen(accepted.nonce, accepted.cell))) return;
    const placed = adoptWall(yard, accepted.cell, accepted.integrity, accepted.yaw);
    if (!placed.ok) return;
    seenWalls.add(wallSeen(accepted.nonce, accepted.cell));
    notePlace(survey, {
      id: `wall:${accepted.cell[0]}:${accepted.cell[1]}`,
      kind: "wall",
      name: "wall",
      point: [accepted.cell[0] * 0.5, accepted.cell[1] * 0.5],
    }, skillBag());
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
      catalog: catalogHex,
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
  for (const spec of [["ctrl", 0, true], ["ops", 1, true], ["snap", 2, false], ["lore", 3, true]]) {
    const options = { negotiated: true, id: spec[1], ordered: spec[2] };
    if (!spec[2]) options.maxRetransmits = 0;
    const channel = pc.createDataChannel(spec[0], options);
    channel.binaryType = "arraybuffer";
    channels[spec[0]] = channel;
  }
  const link = { to, role, ops: channels.ops, snap: channels.snap, lore: channels.lore, pc };
  links.push(link);
  if (!ops) ops = channels.ops;
  channels.ops.onopen = () => {
    opening.delete(to);
    shareWalls(link);
    if (role === "archive") pushSheet();
  };
  channels.lore.onmessage = (event) => {
    net.loreIn += 1;
    onOps(new Uint8Array(event.data), to);
  };
  channels.ops.onmessage = (event) => {
    net.opsIn += 1;
    onOps(new Uint8Array(event.data), to);
  };
  channels.snap.onmessage = (event) => {
    net.snapIn += 1;
    const pose = acceptPosition(poses.get(to) || null, new Uint8Array(event.data));
    if (!inInterest(Math.hypot(pose.x - player.position[0], pose.y - player.position[1]), 80 + skills.mapping.value / 10)) return;
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
        linkNote = role === "archive" ? `archive ${line}` : line;
        if (linkLine && !followed) linkLine.textContent = linkNote;
      },
    });
    if (channels.ops.readyState === "open") shareWalls(link);
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
  let peers = [];
  try {
    peers = await (await ensureRoom()).list();
  } catch {
    peers = [];
  }
  await Promise.all(targets.map((to) => {
    const found = peers.find((peer) => peer.pubkey === to);
    if (found && !acceptHello(catalogHex, found.catalog)) {
      report = "catalog";
      return null;
    }
    return openLink(
      to,
      offerParam === "1" || offerParam.split(",").includes(to),
      "player",
    );
  }));
}

async function seekArchives() {
  try {
    const room = await ensureRoom();
    const peers = await room.list();
    for (const found of peers) {
      if (found.role === "archive" && acceptHello(catalogHex, found.catalog)) openLink(found.pubkey, false, "archive");
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
if (agent) {
  const note = document.querySelector("#agenda");
  if (note) note.textContent = `${AGENDAS[agendaName].title}: ${AGENDAS[agendaName].agenda}`;
  canvas.dataset.ai = agendaName;
}
canvas.dataset.pace = "vsync";
showChart();

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
    const known = poses.get(link.to);
    const reach = 80 + skills.mapping.value / 10;
    if (known && !inInterest(Math.hypot(known.x - player.position[0], known.y - player.position[1]), reach)) continue;
    if (link.snap.readyState === "open") {
      net.snapOut += 1;
      link.snap.send(packet);
    }
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
  let issued = false;
  let blend = 1;
  let lastTrace = 0;
  let lastTraceKey = "";
  let last = performance.now();
  let bank = 0;
  const frame = (now) => {
    try {
    const dt = Math.min(0.1, (now - last) / 1000);
    bank += dt;
    last = now;
    if (agent) {
      applyAgenda(stepAgenda(agendaName, agent, {
        x: player.position[0],
        y: player.position[1],
        yaw,
        tick,
        wall: yard.pieces.some((piece) => piece.id === "wall"),
      }));
    }
    if (!followId && !agent) {
      const turn = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
      if (turn) yaw += turn * 2.1 * dt;
    }
    const sample = input();
    if (seated) {
      sample.forward = 0;
      sample.strafe = 0;
      sample.sprint = false;
    }
    const selectOnce = selectEdge;
    const actOnce = actEdge;
    const cycleOnce = cycleEdge;
    const objectOnce = objectEdge;
    selectEdge = false;
    actEdge = false;
    cycleEdge = 0;
    objectEdge = 0;
    const aimed = refreshAim(sample);
    if (rightEdge) {
      rightEdge = false;
      useRightClick();
    }
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
      const wreckAt = [atoll.placements.dummy.x / 100, atoll.placements.dummy.y / 100, 0.9];
      const wreckCell = [Math.round(wreckAt[0] / 0.5), Math.round(wreckAt[1] / 0.5)];
      if (dummy.health === 0) {
        if (!blasted) {
          const shove = blastPush(
            [atoll.placements.dummy.x / 100, atoll.placements.dummy.y / 100],
            [player.position[0], player.position[1]],
          );
          player.velocity[0] += shove[0];
          player.velocity[1] += shove[1];
          player.velocity[2] += shove[2];
          blasted = true;
        }
        if (!yard.pieces.some((piece) => piece.id === "wreck")) {
          yard.pieces.push({ id: "wreck", at: wreckCell, anchors: true });
        }
      } else {
        blasted = false;
        const wreck = yard.pieces.findIndex((piece) => piece.id === "wreck");
        if (wreck >= 0) yard.pieces.splice(wreck, 1);
      }
      for (let bolt = bolts.length - 1; bolt >= 0; bolt -= 1) {
        const wind = windAt(player.position[0], player.position[1]);
        const blown = dayWord(tick) === "night" ? wind.map((part) => part * 1.5) : wind;
        stepBolt(bolts[bolt], 1 / 30, 9.81, blown);
        const mission = yard.pieces.find((piece) => piece.id === "mission");
        if (mission) {
          bolts[bolt].velocity[0] += (mission.at[0] * 0.5 - bolts[bolt].position[0]) * 0.04;
          bolts[bolt].velocity[1] += (mission.at[1] * 0.5 - bolts[bolt].position[1]) * 0.04;
        }
        const hit = boltHit(bolts[bolt], wreckAt);
        if (hit && dummy.health > 0) applyDummyHit(dummy, "chest");
        const flying = bolts[bolt];
        if (!hit && (flying.bounces || 0) < 1 && flying.position[2] < 0 && flying.velocity[2] < 0 && Math.abs(flying.velocity[0]) > Math.abs(flying.velocity[2])) {
          flying.position[2] = 0;
          flying.velocity[2] *= -0.35;
          flying.bounces = 1;
        } else if (hit || flying.age > 2 || flying.position[2] < -1) bolts.splice(bolt, 1);
      }
      terrain.setCell(cellId(player.position[1]));
      cultureName = cellId(player.position[1]) === "atoll-1" ? "walked" : culture.culture;
      if (yard.bound) {
        const far = Math.hypot(player.position[0] - yard.bound[0] * 0.5, player.position[1] - yard.bound[1] * 0.5) > 40;
        awayTicks = far ? awayTicks + 1 : 0;
        if (awayTicks >= 1800) {
          yard.bound = null;
          awayTicks = 0;
          report = "lapse";
        }
      } else awayTicks = 0;
      if (tick > 0 && tick % 1800 === 0 && yard.bound) {
        if (yard.metal >= 1) {
          yard.metal -= 1;
          report = "upkeep";
        } else {
          yard.bound = null;
          report = "lapse";
        }
      }
      if (tick % 30 === 0) rollCart(yard);
      const holder = pubkeyHex(identity.pubkey);
      terrain.setDeed(yard.bound ? {
        allow(x, y, proposer) {
          const who = proposer instanceof Uint8Array ? pubkeyHex(proposer) : "";
          return mayEdit(deedVolume(yard.bound, holder), x, y, who, deedKeys);
        },
      } : null);
      if (cooldown > 0) cooldown -= 1;
      entryState = stepEntry(entry, {
        position: player.position,
        use: useOnce,
        buy: buyOnce,
        yard,
        still: Math.hypot(player.velocity[0], player.velocity[1]) < 0.08,
        offer: buyOnce ? (entryState.joined ? SMOKE : null) : null,
      });
      if (entryState.notice) report = entryState.notice;
      if (entryState.notice === "smoke") smokeTicks = 8 * 30;
      if (smokeTicks > 0) smokeTicks -= 1;
      if (shotLock > 0) shotLock -= 1;
      bleed(vitals, 1 / 30);
      if (player.position[1] < -190) hear("sea");
      if (tick % 30 === 0) {
        for (let step = 0; step < 2; step += 1) {
          for (const pool of pools) {
            const here = columnFloor(terrain.log.crust, pool.x, pool.y);
            const there = columnFloor(terrain.log.crust, pool.x, pool.y + 0.5);
            const dest = [Math.round(pool.x / 0.5), Math.round((pool.y + 0.5) / 0.5)];
            const dam = yard.pieces.some((piece) => piece.id === "road" && !piece.gate && piece.at[0] === dest[0] && piece.at[1] === dest[1]);
            if (dam) continue;
            const next = flowOnce(pool, here, there);
            if (next !== pool) {
              pool.y = next.y;
              pool.floor = next.floor;
              pool.key = next.key;
            }
            if (pool.y < -190) pools.splice(pools.indexOf(pool), 1);
          }
        }
      }
      if (tick % 600 === 0) {
        for (const piece of yard.pieces) {
          if (piece.anchors || piece.integrity == null) continue;
          const dist = Math.hypot(piece.at[0] * 0.5 - player.position[0], piece.at[1] * 0.5 - player.position[1]);
          if (dist > 40) piece.integrity = Math.max(0, piece.integrity - 1);
        }
      }
      if (entryState.joined) writeNote(notes, skills, "strike");
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
        const has = (id) => yard.pieces.some((piece) => piece.id === id);
        const job = aimed.kind === "footing" && !has("hearth")
          ? "hearth"
          : aimed.kind === "hearth" && yard.fins > 0 && !has("fin")
            ? "fin"
            : "wall";
        if (job === "wall" && (aimed.kind === "footing" || aimed.kind === "hearth" || aimed.kind === "fin")) {
          raising = null;
          work = null;
          report = aimed.kind;
        } else if (!raising || raising.job !== job || raising.cell[0] !== cell[0] || raising.cell[1] !== cell[1]) {
          raising = { cell, ticks: 0, job };
        }
        if (raising) {
          const need = job === "hearth" ? craftNeed(skills.building.value) : job === "fin" ? finNeed(skills.building.value) : placeTicks(skills.building.value);
          raising.ticks += 1;
          work = {
            x: raising.cell[0] * 0.5,
            y: raising.cell[1] * 0.5,
            height: 0.15 + (raising.ticks / need) * 2.05,
            mode: 1,
          };
          report = `work ${Math.floor(raising.ticks / 30)}s`;
          if (raising.ticks >= need) {
            const placed = job === "hearth"
              ? tryFinishHearth(yard, raising.cell)
              : job === "fin"
                ? tryFinishFin(yard, raising.cell)
                : tryPlaceWall(yard, raising.cell, skills.building.value);
            report = placed.ok ? job : placed.reason;
            if (placed.ok) {
              hear("place");
              grantUse(skills, "building", { tick });
              grantUse(skills, "bracing", { tick, gap: 20 });
              writeNote(notes, skills, job === "wall" ? "wall" : job);
              const nonce = Math.floor(tick);
              if (job === "wall") {
                seenWalls.add(wallSeen(nonce, raising.cell));
                sendOps(encodeWall(identity, {
                  nonce,
                  cell: raising.cell,
                  integrity: pieceIntegrity(skills.building.value) + braceBonus(skills.bracing.value),
                }));
                notePlace(survey, {
                  id: `wall:${raising.cell[0]}:${raising.cell[1]}`,
                  kind: "wall",
                  name: "wall",
                  point: [raising.cell[0] * 0.5, raising.cell[1] * 0.5],
                }, skillBag());
              } else {
                sendOps(encodePiece(identity, { nonce, cell: raising.cell, id: job }));
                notePlace(survey, {
                  id: `${job}:${raising.cell[0]}:${raising.cell[1]}`,
                  kind: job,
                  name: job,
                  point: [raising.cell[0] * 0.5, raising.cell[1] * 0.5],
                }, skillBag());
              }
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
          const capped = brush === "dig" && (yard.spoil || 0) >= spoilCap(skills.mining.value);
          if (capped) {
            report = "full";
          } else if (brush === "fill" && (yard.spoil || 0) < 1) {
            report = "spoil";
          } else {
            terrain.dig(aim.eye, aim.aim, { peer: witnessed(), mode: brush, cell: cellId(player.position[1]) });
            const floor = columnFloor(terrain.log.crust, player.position[0], player.position[1]);
            if (brush === "fill") {
              yard.spoil = Math.max(0, (yard.spoil || 0) - 1);
              drainPool(pools, { x: player.position[0], y: player.position[1], floor });
            } else if (brush === "dig") {
              yard.spoil = (yard.spoil || 0) + 1;
              digs += 1;
              notePool(pools, { x: player.position[0], y: player.position[1], floor });
              const found = tapVein(vein, player.position[0], player.position[1]);
              if (found) {
                yard.metal += found;
                const patron = [...bonds.entries()].find(([, state]) => state === "both")?.[0];
                const due = titheDue(patron);
                if (due && yard.metal >= due) {
                  yard.metal -= due;
                  yard.tithed = (yard.tithed || 0) + due;
                }
              }
            }
            hear(brush === "fill" ? "fill" : "dig");
            grantUse(skills, "mining", { tick, gap: 30 });
            grantUse(skills, "prospect", { tick, gap: 45 });
            writeNote(notes, skills, brush === "fill" ? "fill" : "dig");
          }
        } else if (!raising) {
          work = null;
        }
      }
      if (vitals.down > 0) sample.forward = 0;
      sample.limp = limpFactor(vitals);
      if (dragging) {
        const held = selection?.kind === "player" && otherActors().some((actor) => actor.id === selection.id && Math.hypot(actor.feet[0] - player.position[0], actor.feet[1] - player.position[1]) < 2.2);
        if (!held) dragging = false;
        else sample.forward = Math.min(sample.forward, dragPace(true));
      }
      const roadHere = yard.pieces.some((piece) => piece.id === "road" && piece.at[0] === Math.round(player.position[0] / 0.5) && piece.at[1] === Math.round(player.position[1] / 0.5));
      if (roadHere && !dragging) sample.forward *= 1.15;
      const down = radialDown(player.position[0], player.position[1], player.position[2]);
      world.gravity = [down[0] * 9.81, down[1] * 9.81, down[2] * 9.81];
      const ground = standHeight(player.position[0], player.position[1], columnFloor(terrain.log.crust, player.position[0], player.position[1]));
      world.ground = ground;
      world.drop = shellDrop(player.position[0], player.position[1]) - ground;
      if (pools.some((pool) => Math.hypot(pool.x - player.position[0], pool.y - player.position[1]) < 0.7)) {
        world.gravity[2] += 14;
      }
      const falling = player.velocity[2];
      const moved = vitals.down > 0
        ? { jump: false, running: false }
        : stepHands(world, player, stamina, sample, jump, skills.jump.value);
      if (vitals.down <= 0) {
        const pushed = separate(player.position, otherActors().map((actor) => actor.feet));
        player.position[0] = pushed[0];
        player.position[1] = pushed[1];
      }
      if (vitals.down > 0) {
        if (stepDown(vitals, 1 / 30)) {
          const back = recallPoint(yard, [atoll.placements.spawnFeet.x / 100, atoll.placements.spawnFeet.y / 100, 0]);
          player.position[0] = back[0];
          player.position[1] = back[1];
          player.position[2] = back[2];
          player.velocity[0] = 0;
          player.velocity[1] = 0;
          player.velocity[2] = 0;
          bruise(vitals);
          hear("recall");
          report = yard.bound ? "bruised" : "no hearth";
        } else {
          report = `down ${Math.ceil(vitals.down)}`;
        }
      } else if (!striking) {
        const dummyAt = [atoll.placements.dummy.x / 100, atoll.placements.dummy.y / 100];
        const nearDummy = Math.hypot(player.position[0] - dummyAt[0], player.position[1] - dummyAt[1]) < 1.6;
        if (nearDummy && dummy.health > 0) {
          const side = player.position[0] < dummyAt[0] ? "left" : "right";
          const hit = clubHit(vitals, 1 / 30, side);
          if (hit.dead) {
            report = "down";
            hear("hurt");
          }
        }
      }
      coolPain(vitals, 1 / 30);
      if (moved.jump) {
        grantUse(skills, "jump", { tick });
        grantUse(skills, "landing", { tick, gap: 20 });
      }
      if (moved.running) {
        grantUse(skills, "run", { tick, gap: 30 });
        grantUse(skills, "wind", { tick, gap: 45 });
      }
      const stride = hearStep(stepAt, player.position, !!sample.sprint);
      stepAt = stride.at;
      hear(stride.cue);
      if (stride.cue) {
        grantUse(skills, "tracking", { tick, gap: 40 });
        const nearOther = otherActors().some((other) => Math.hypot(other.feet[0] - player.position[0], other.feet[1] - player.position[1]) < 8);
        if (nearOther) grantUse(skills, "trailing", { tick, gap: 50 });
        notePath(selfPath, [player.position[0], player.position[1]], skills.tracking.value);
        if (pathStamp(skills.tracking.value)) {
          stamp(plate, player.position[0], player.position[1], [110, 86, 52, 230], 0.55);
        }
        const frame = encodePrint(identity, {
          nonce: tick,
          x: player.position[0],
          y: player.position[1],
          yaw,
        });
        if (addPrint(prints, { x: player.position[0], y: player.position[1], yaw, who: "self" })) {
          prints[prints.length - 1].frame = frame;
          sendOps(frame);
        }
      }
      if (skills.trailing.value >= 4) {
        for (const other of otherActors()) {
          const line = tracks.get(other.id) || [];
          tracks.set(other.id, line);
          notePath(line, [other.feet[0], other.feet[1]], skills.trailing.value);
        }
      }
      if (tick % 150 === 0) {
        pushSheet();
        if (keptWorld) {
          keptWorld.crust = [...terrain.log.crust.overrides.entries()];
          saveWorld(keptStore, keptWorld, `meridian-world-${keepSlot}`);
        }
      }
      if (mapMode !== "none") grantUse(skills, "mapping", { tick, gap: 15 });
      const step = player.position;
      const lastFix = trail[trail.length - 1];
      if (!lastFix || (step[0] - lastFix[0]) ** 2 + (step[1] - lastFix[1]) ** 2 > 2.25) {
        trail.push([step[0], step[1]]);
        if (trail.length > 80) trail.shift();
      }
      const floor = columnFloor(terrain.log.crust, player.position[0], player.position[1]);
      if (floor < -0.01 && player.position[2] <= 0.02) {
        player.position[2] = floor;
        if (player.velocity[2] < 0) player.velocity[2] = 0;
      }
      if (falling < -9 && player.position[2] <= (world.ground || 0) + 0.2) vitals.integrity = fallHurt(vitals.integrity, falling, skills.landing.value);
      claimSpecialty(skills);
      const bag = skillBag();
      noteSurvey(survey, {
        x: player.position[0],
        y: player.position[1],
        yaw,
        depthAt: (px, py) => columnFloor(terrain.log.crust, px, py),
        skills: bag,
      });
      noteNearby(survey, player.position, landmarks(), bag);
      if (tick % 30 === 0) exchangeLore();
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
    if (selection?.kind === "player") {
      const live = otherActors().find((actor) => actor.id === selection.id);
      if (live) selection.point = [live.feet[0], live.feet[1], live.feet[2] + 1];
    }
    aimCamera(sample, dt);
    revealMap();
    drawChart();
    if (cycleOnce) cycle(cycleOnce, "player");
    if (objectOnce) cycle(objectOnce, "object");
    if (turnEdge && slot === "hammer") {
      const mark = refreshAim(sample);
      if (mark.inRange && mark.kind === "road") {
        const gate = toggleGate(yard, mark.cell);
        report = gate.ok ? (gate.gate ? "gate" : "shut") : gate.reason;
      } else if (mark.inRange && mark.kind === "door") {
        const door = toggleDoor(yard, mark.cell);
        report = door.ok ? (door.open ? "open" : "shut") : door.reason;
      } else if (mark.inRange && (mark.kind === "wall" || mark.kind === "fin")) {
        const turned = mark.kind === "fin" ? turnFin(yard, mark.cell) : turnWall(yard, mark.cell);
        if (turned.ok && mark.kind === "wall") {
          sendOps(encodeWall(identity, {
            nonce: Math.floor(tick),
            cell: mark.cell,
            integrity: pieceIntegrity(skills.building.value) + braceBonus(skills.bracing.value),
            yaw: turned.yaw,
          }));
          report = turned.yaw ? "turned" : "wall";
        }
      }
      turnEdge = false;
    }
    if (selectOnce && selection?.kind === "hearth") {
      const bound = bindHearth(yard, selection.cell);
      if (bound.ok) {
        hear("bind");
        writeNote(notes, skills, "bind");
      }
      report = bound.ok ? "bound" : bound.reason;
    } else if (selectOnce) identify(sample);
    if (actOnce) actOn(sample);
    if (!work && selection?.point) {
      work = { x: selection.point[0], y: selection.point[1], height: 1.6, mode: 4 };
    }
    const active = windowFocused();
    const stillSample = {
      x: player.position[0],
      y: player.position[1],
      yaw,
      pitch,
      distance: follow.distance,
      height: follow.height,
      orbit: orbitYaw,
      zoom: (zoom.level || 0) + (zoom.blend || 0),
      busy: rightDown || keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD") || keys.has("KeyZ") || keys.has("KeyC"),
    };
    const speed = cameraSpeed(stillPose, stillSample, dt);
    const accel = cameraAccel(lastCameraSpeed, speed, dt);
    lastCameraSpeed = speed;
    if (viewStill(stillPose, stillSample)) stillFor += dt;
    else stillFor = 0;
    stillPose = stillSample;
    const still = stillFor >= 0.45;
    const boxW = canvas.clientWidth || window.innerWidth || 960;
    const boxH = canvas.clientHeight || window.innerHeight || 540;
    const decision = extra && !document.hidden
      ? pacer.considerExtra(now, primaryHolding)
      : pacer.consider(now, extra ? false : active);
    viewScale = decision.scale;
    const displayW = Math.max(2, Math.floor(boxW));
    const displayH = Math.max(2, Math.floor(boxH));
    const parked = still || (speed < 0.3 && accel < 2);
    const paced = extra
      ? { scale: 0.4, refresh: decision.refresh, info: 0, ...pictureSize(0.4, displayW, displayH) }
      : picture.step({
        gap: parked || issued ? Math.max(decision.gap, parked ? 1 : 0) : 0,
        displayW,
        displayH,
        still: parked,
        speed,
        accel,
      });
    issued = false;
    const trace = { width: paced.width, height: paced.height };
    canvas.dataset.traceW = String(trace.width);
    canvas.dataset.traceH = String(trace.height);
    canvas.dataset.level = Number(paced.scale || 0).toFixed(2);
    canvas.dataset.detail = "0";
    canvas.style.imageRendering = trace.width >= displayW - 4 ? "auto" : "pixelated";
    if (painter) {
      if (canvas.width !== displayW) canvas.width = displayW;
      if (canvas.height !== displayH) canvas.height = displayH;
    } else {
      fitCanvas(canvas, viewScale, easedPixels);
    }
    paintKind = "full";
    const arrived = still && paced.scale > 0.98;
    canvas.dataset.cadence = String(Math.round(paced.refresh || decision.refresh));
    canvas.dataset.info = String(Math.round(paced.info || 0));
    canvas.dataset.speed = speed.toFixed(1);
    canvas.dataset.accel = accel.toFixed(1);
    const late = !extra && active && decision.gap > (paced.refresh || decision.refresh) * 1.35;
    const paceLabel = late ? "behind" : paceWord(decision.mode, { still, arrived, holding: decision.holding });
    canvas.dataset.pace = paceLabel;
    const interval = extra ? Math.max(decision.interval || 1000, 250) : traceInterval(parked, accel, paced.refresh || decision.refresh);
    canvas.dataset.traceMs = String(Math.round(interval));
    const due = extra ? decision.paint : active ? now - lastTrace >= interval * 0.85 : decision.paint;
    if (params.get("nopaint") !== "1" && due) {
      const started = performance.now();
      paint(sample, trace.width, trace.height);
      const paintMs = performance.now() - started;
      if (!extra) lastPaintMs = paintMs;
      pacer.note(paintMs, active, still);
      lastTrace = now;
      issued = true;
      const key = `${trace.width}x${trace.height}`;
      if (key !== lastTraceKey) blend = 0;
      else blend = 1;
      lastTraceKey = key;
    }
    const fade = Math.min(0.12, Math.max(0.03, interval / 1000));
    blend = Math.min(1, blend + dt / fade);
    if (painter && painter.present) painter.present(blend);
    canvas.dataset.fps = String(fps.paint(now));
    const fpsNode = document.querySelector("#fps");
    if (fpsNode) fpsNode.style.color = String(canvas.dataset.pace || "").includes("recover") ? "#fc8" : "#9f9";
    if (!extra && paceBus) {
      const spare = decision.holding && paced.scale > 0.98 && lastPaintMs > 0 && lastPaintMs < decision.refresh * 0.55;
      paceBus.postMessage({ role: "primary", holding: spare });
    }
    flush();
    } catch (error) {
      report = "frame";
      canvas.dataset.err = String(error && error.message || error);
    }
    requestAnimationFrame(frame);
  };
  if (keepSlot && keptWorld) {
    for (const [key, sample] of keptWorld.crust || []) terrain.log.crust.overrides.set(key, sample);
    for (const text of keptWorld.frames) {
      try {
        onOps(hexBytes(text));
      } catch {
        // A stored frame that no longer decodes is skipped.
      }
    }
  }
  addEventListener("pagehide", () => {
    if (keepSlot) pushSheet();
  });
  requestAnimationFrame(frame);
}
