import { createIdentity } from "../../src/net/identity.js";
import { connectPeer, createRoom } from "../../src/net/room.js";
import { decodeBlock, encodeBlock } from "../../src/net/blocks.js";
import { signReceipt } from "../../src/net/receipt.js";
import { createTerrain } from "../../src/net/terrain.js";
import { decode } from "../../src/sim/cbor.js";
import { encodeDeflatedPack, helloMessage, packState, readHello, unwrap } from "../../src/net/wire.js";
import {
  acceptBlock,
  blocksByMiner,
  chainEdits,
  createChain,
  LIVE_BITS,
  mine,
  prepareBlock,
  tipOf,
} from "../../src/sim/chain.js";
import {
  bountyCents,
  claimCrate,
  crateFor,
  createLedger,
  keepOf,
  noteOps,
  notePresence,
  noteVote,
  pubkeyHex,
} from "../../src/sim/keeper.js";
import {
  acceptSheet,
  browserStore,
  bytesHex,
  hexBytes,
  keepFrame,
  keepSheet,
  loadIdentity,
  loadWorld,
  saveIdentity,
  saveWorld,
} from "../../src/sim/persist.js";

const store = browserStore();
const world = loadWorld(store);
let identity = loadIdentity(store, "archive");
if (!identity) {
  identity = createIdentity();
  saveIdentity(store, identity, "archive");
}
const roomId = `archive-${pubkeyHex(identity.pubkey).slice(0, 8)}`;
const terrain = createTerrain({ identity, leader: false });
const chain = createChain();
const miner = pubkeyHex(identity.pubkey);
const ledger = createLedger(miner);
const links = [];
const opening = new Set();
const params = new URLSearchParams(location.search);
const room = createRoom({
  url: params.get("signal") || "ws://127.0.0.1:8787",
  me: roomId,
  role: "archive",
});

let signal = "connecting";

function showFail(error) {
  signal = "failed";
  const text = String(error && error.message || error);
  const status = document.querySelector("#status");
  const perf = document.querySelector("#perf");
  if (status) status.textContent = text;
  if (perf) perf.textContent = `${text}\n\nThe archive did not finish starting.`;
}

function $(id) {
  const selector = String(id).startsWith("#") ? id : `#${id}`;
  return document.querySelector(selector);
}

function persist() {
  saveWorld(store, world);
}

function rememberBytes(bytes) {
  const kind = bytes[0];
  if (kind === 15) {
    const accepted = acceptSheet(bytes);
    if (!accepted.ok) return;
    if (keepSheet(world, accepted, bytesHex(bytes))) persist();
    return;
  }
  if (kind !== 9 && kind !== 10 && kind !== 11 && kind !== 13) return;
  if (keepFrame(world, bytes)) persist();
}

function replayFrames() {
  return [...world.frames.map(hexBytes), ...Object.values(world.sheets).map((sheet) => hexBytes(sheet.frame))];
}

function replayKey() {
  return `${world.frames.length}:${world.frames.at(-1) || ""}:${Object.values(world.sheets).map((sheet) => sheet.frame.slice(-16)).join("")}`;
}

// Dual-format storage: the save keeps verbatim v1 frames, plus a cached v2 deflated replay pack.
async function replayPack() {
  const key = replayKey();
  if (world.replay && world.replayOf === key) return Uint8Array.from(atob(world.replay), (c) => c.charCodeAt(0));
  const pack = await encodeDeflatedPack(replayFrames());
  let text = "";
  for (let i = 0; i < pack.length; i += 8192) text += String.fromCharCode(...pack.subarray(i, i + 8192));
  world.replay = btoa(text);
  world.replayOf = key;
  persist();
  return pack;
}

// A v2 player says hello on ctrl and gets one deflated pack. A v1 player (no hello within 1 s)
// gets the frames one by one, as before.
function replaySoon(link, channel) {
  const started = Date.now();
  const tick = () => {
    if (channel.readyState !== "open") return;
    if (link.proto >= 2) {
      replayPack().then((pack) => {
        if (channel.readyState !== "open") return;
        channel.send(pack);
        traffic.out += 1;
      }).catch(() => replay(channel));
      return;
    }
    if (Date.now() - started >= 1000) {
      replay(channel);
      return;
    }
    setTimeout(tick, 100);
  };
  tick();
}

function replay(channel) {
  if (!channel || channel.readyState !== "open") return;
  for (const text of world.frames) {
    try {
      channel.send(hexBytes(text));
      traffic.out += 1;
    } catch {
      return;
    }
  }
  for (const sheet of Object.values(world.sheets)) {
    try {
      channel.send(hexBytes(sheet.frame));
      traffic.out += 1;
    } catch {
      return;
    }
  }
}

let candidate = null;
let hashes = 0;
let hashRate = 0;
let hashTotal = 0;
let lastMineMs = 0;
const booted = Date.now();
const traffic = { inn: 0, out: 0, blocks: 0, refused: 0, sheets: 0, listed: 0, peers: "none" };

function editsAfterTip() {
  const sealed = terrain.log.ops.map((op) => {
    const body = decode(op.proposal).body;
    return {
      eye: body.eye,
      aim: body.aim,
      chunk: body.chunk,
      before: body.before,
      mode: body.mode,
      writes: body.writes,
    };
  });
  return chainEdits(chain, [...sealed, ...terrain.openEdits()]);
}

function rememberTip() {
  ledger.blocks = blocksByMiner(chain, miner);
  ledger.height = tipOf(chain).block.height;
}

function consider(block) {
  const accepted = acceptBlock(chain, block);
  if (!accepted.ok) return accepted;
  rememberTip();
  if (accepted.tip) candidate = null;
  return accepted;
}

function hunt() {
  if (!candidate) {
    const ops = editsAfterTip();
    if (!ops.length) return;
    const parent = tipOf(chain);
    const prepared = prepareBlock({
      parent: parent.block,
      crust: chain.crusts.get(chain.tip),
      ops,
      miner,
      time: Date.now(),
      bits: LIVE_BITS,
    });
    if (!prepared.ok) return;
    candidate = prepared.block;
  }
  const before = candidate.nonce;
  const started = Date.now();
  const found = mine(candidate, { limit: 4000 });
  const tried = Math.max(0, candidate.nonce - before);
  hashes += tried;
  hashTotal += tried;
  if (found) {
    lastMineMs = Date.now() - started;
    consider(found.block);
    const frame = encodeBlock(identity, found.block);
    rememberBytes(frame);
    for (const link of links) {
      if (link.ops.readyState !== "open") continue;
      try {
        link.ops.send(frame);
        traffic.out += 1;
      } catch {
        // The next slice sends the same block again if it is still the tip.
      }
    }
    candidate = null;
  }
  paint();
}

function paint() {
  const open = links.filter((link) => link.ops.readyState === "open");
  const names = open.map((link) => link.to);
  const pending = links.filter((link) => link.ops.readyState !== "open");
  const connecting = pending.length;
  const ice = {};
  let buffered = 0;
  const notes = [];
  for (const link of links) {
    const state = link.pc?.iceConnectionState || "new";
    ice[state] = (ice[state] || 0) + 1;
    buffered += link.ops?.bufferedAmount || 0;
    notes.push(`${link.to} ${link.note || link.ops.readyState}`);
  }
  const iceLine = Object.entries(ice).map(([name, count]) => `${name} ${count}`).join(" ") || "none";
  const crate = crateFor(ledger);
  const cents = bountyCents(ledger);
  const minutes = Math.floor((Date.now() - booted) / 60000);
  const seconds = Math.floor((Date.now() - booted) / 1000) % 60;
  const tip = tipOf(chain).block;
  const behind = Math.max(0, terrain.log.seq - tip.seq);
  const status = $("status");
  if (status) {
    if (status.dataset) status.dataset.live = "1";
    status.textContent = names.length
      ? `linked ${names.join(" ")}`
      : pending.length
        ? `connecting ${pending.length}`
        : "waiting for a player";
  }
  const perf = $("perf");
  if (perf) {
    if (perf.dataset) perf.dataset.live = "1";
    perf.textContent = [
      `hash ${hashRate.toLocaleString("en-US")} / s`,
      `tried ${hashTotal.toLocaleString("en-US")}`,
      lastMineMs ? `last block ${lastMineMs} ms` : "no block yet",
      `uptime ${minutes}m ${seconds}s`,
      `clients ${names.length} open    ${connecting} connecting`,
      `ice ${iceLine}`,
      notes.length ? `links ${notes.join(" | ")}` : "links none",
      `seen ${traffic.peers}`,
      `block ${tip.height}    behind ${behind}    ops ${terrain.log.ops.length}`,
      `ops in ${traffic.inn} out ${traffic.out}    blocks ${traffic.blocks}    refused ${traffic.refused}`,
      `sheets ${Object.keys(world.sheets).length}    frames ${world.frames.length}    listed ${traffic.listed}`,
      `buffered ${buffered}    keep ${keepOf(ledger)}`,
      crate ? `crate ${crate.metal} metal ${crate.fiber} fiber` : "crate not ready",
      `bounty $${(cents / 100).toFixed(2)}`,
      `signal ${signal}`,
      roomId,
    ].join("\n");
  }
}

function outgoing() {
  const frames = terrain.take();
  for (const frame of frames) if (frame[0] === 2) noteVote(ledger);
  noteOps(ledger, terrain.log.ops.length);
  for (const link of links) {
    if (link.ops.readyState !== "open") continue;
    for (const frame of frames) {
      try {
        link.ops.send(frame);
        traffic.out += 1;
      } catch {
        // The player will ask again. A full channel must not drop the vote on every peer.
      }
    }
  }
  paint();
}

async function openPlayer(to) {
  if (links.some((link) => link.to === to) || opening.has(to)) return;
  opening.add(to);
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  const channels = {};
  for (const spec of [["ctrl", 0, true], ["ops", 1, true], ["snap", 2, false], ["lore", 3, true]]) {
    const options = { negotiated: true, id: spec[1], ordered: spec[2] };
    if (!spec[2]) options.maxRetransmits = 0;
    const channel = pc.createDataChannel(spec[0], options);
    channel.binaryType = "arraybuffer";
    channels[spec[0]] = channel;
  }
  const link = { to, ops: channels.ops, lore: channels.lore, pc, note: "starting", proto: 1, packIn: packState() };
  links.push(link);
  channels.ctrl.onopen = () => {
    try {
      channels.ctrl.send(helloMessage(""));
    } catch {
      // The player treats this link as v1.
    }
  };
  channels.ctrl.onmessage = (event) => {
    const hello = readHello(event.data);
    if (hello) link.proto = hello.proto;
  };
  channels.ops.onopen = () => {
    opening.delete(to);
    replaySoon(link, channels.ops);
  };
  channels.ops.onmessage = (event) => {
    traffic.inn += 1;
    let frames;
    try {
      frames = unwrap(new Uint8Array(event.data), link.packIn);
    } catch {
      return;
    }
    if (frames instanceof Promise) frames.then((list) => list.forEach(receiveFrame)).catch(() => {});
    else frames.forEach(receiveFrame);
  };
  function receiveFrame(bytes) {
    if (bytes[0] === 11) {
      const decoded = decodeBlock(bytes);
      if (decoded.ok) {
        const accepted = consider(decoded.block);
        if (accepted?.ok) traffic.blocks += 1;
        else traffic.refused += 1;
      } else traffic.refused += 1;
    } else {
      terrain.receive(bytes);
    }
    rememberBytes(bytes);
    if (bytes[0] === 15) {
      const accepted = acceptSheet(bytes);
      if (accepted.ok) {
        traffic.sheets += 1;
        const stored = world.sheets[bytesHex(accepted.pubkey)];
        if (stored) {
          try {
            channels.ops.send(hexBytes(stored.frame));
            traffic.out += 1;
          } catch {
            // The player sends the sheet again.
          }
        }
      }
    }
    outgoing();
  }
  try {
    await connectPeer({
      pc,
      room,
      me: roomId,
      to,
      offer: true,
      isOpen: () => channels.ops.readyState === "open",
      status: (line) => {
        const link = links.find((item) => item.to === to);
        if (link) link.note = line;
        paint();
      },
    });
    opening.delete(to);
  } catch (error) {
    opening.delete(to);
    const index = links.findIndex((item) => item.to === to);
    if (index >= 0) links.splice(index, 1);
    showFail(error);
  }
}

async function seek() {
  const peers = await room.list();
  traffic.listed = peers.length;
  traffic.peers = peers.length
    ? peers.map((found) => `${found.role || "player"} ${found.pubkey}`).join(" | ")
    : "none";
  for (const link of links) {
    if (link.ops.readyState === "open") continue;
    if (link.pc?.iceConnectionState === "failed" || link.pc?.connectionState === "failed") {
      const index = links.indexOf(link);
      if (index >= 0) links.splice(index, 1);
      opening.delete(link.to);
    }
  }
  for (const found of peers) {
    if (found.role === "archive" || found.pubkey === roomId) continue;
    openPlayer(found.pubkey);
  }
  paint();
}

const claim = $("claim");
if (claim) claim.addEventListener("click", () => {
  const crate = claimCrate(ledger);
  $("note").textContent = crate
    ? `Claimed ${crate.metal} metal and ${crate.fiber} fiber on this receipt. A quorum still has to accept it. Nothing was minted here.`
    : "Not enough keep for a crate.";
  paint();
});

const receipt = $("receipt");
if (receipt) receipt.addEventListener("click", async () => {
  const signed = signReceipt(identity, ledger, Date.now());
  const text = JSON.stringify(signed);
  $("out").textContent = text;
  try {
    await navigator.clipboard.writeText(text);
    $("note").textContent = "Receipt copied.";
  } catch {
    $("note").textContent = "Receipt is below. Copy it by hand.";
  }
});

try {
  paint();
} catch (error) {
  showFail(error);
}
room.start().then(() => {
  signal = "open";
  try {
    for (const text of world.frames || []) {
      const bytes = hexBytes(text);
      if (bytes[0] !== 11) continue;
      const decoded = decodeBlock(bytes);
      if (decoded.ok) consider(decoded.block);
    }
  } catch (error) {
    showFail(error);
  }
  paint();
  seek().catch((error) => showFail(error));
  setInterval(seek, 3000);
  setInterval(hunt, 40);
  setInterval(() => {
    hashRate = hashes;
    hashes = 0;
    if (links.some((link) => link.ops.readyState === "open")) notePresence(ledger, 1000);
    outgoing();
  }, 1000);
}).catch((error) => {
  showFail(error);
});
