import { createIdentity } from "../../src/net/identity.js";
import { connectPeer, createRoom } from "../../src/net/room.js";
import { signReceipt } from "../../src/net/receipt.js";
import { createTerrain } from "../../src/net/terrain.js";
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

const identity = createIdentity();
const roomId = `archive-${pubkeyHex(identity.pubkey).slice(0, 8)}`;
const terrain = createTerrain({ identity, leader: false });
const ledger = createLedger(pubkeyHex(identity.pubkey));
const links = [];
const opening = new Set();
const params = new URLSearchParams(location.search);
const room = createRoom({
  url: params.get("signal") || "ws://127.0.0.1:8787",
  me: roomId,
  role: "archive",
});

function $(id) {
  return document.querySelector(id);
}

function paint() {
  const open = links.filter((link) => link.ops.readyState === "open").map((link) => link.to);
  const crate = crateFor(ledger);
  const cents = bountyCents(ledger);
  $("status").textContent = [
    roomId,
    open.length ? `linked ${open.join(" ")}` : "waiting for a player",
    `ops ${terrain.log.ops.length}`,
    `keep ${keepOf(ledger)}`,
    crate ? `crate ready ${crate.metal} metal ${crate.fiber} fiber` : "crate not ready",
    `bounty $${(cents / 100).toFixed(2)}`,
  ].join(" · ");
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
  for (const spec of [["ctrl", 0, true], ["ops", 1, true], ["snap", 2, false]]) {
    const options = { negotiated: true, id: spec[1], ordered: spec[2] };
    if (!spec[2]) options.maxRetransmits = 0;
    const channel = pc.createDataChannel(spec[0], options);
    channel.binaryType = "arraybuffer";
    channels[spec[0]] = channel;
  }
  links.push({ to, ops: channels.ops });
  channels.ops.onmessage = (event) => {
    terrain.receive(new Uint8Array(event.data));
    outgoing();
  };
  try {
    await connectPeer({
      pc,
      room,
      me: roomId,
      to,
      offer: true,
      isOpen: () => channels.ops.readyState === "open",
      status: () => paint(),
    });
  } catch (error) {
    opening.delete(to);
    $("status").textContent = String(error);
  }
}

async function seek() {
  const peers = await room.list();
  for (const found of peers) {
    if (found.role === "archive" || found.pubkey === roomId) continue;
    openPlayer(found.pubkey);
  }
  paint();
}

$("claim").addEventListener("click", () => {
  const crate = claimCrate(ledger);
  $("note").textContent = crate
    ? `Claimed ${crate.metal} metal and ${crate.fiber} fiber on this receipt. A quorum still has to accept it. Nothing was minted here.`
    : "Not enough keep for a crate.";
  paint();
});

$("receipt").addEventListener("click", async () => {
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

room.start().then(() => {
  paint();
  seek();
  setInterval(seek, 3000);
  setInterval(() => {
    if (links.some((link) => link.ops.readyState === "open")) notePresence(ledger, 1000);
    outgoing();
  }, 1000);
}).catch((error) => {
  $("status").textContent = String(error);
});
