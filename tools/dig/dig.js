import { createIdentity, packFrame, packetValid, signBytes, unpackFrame } from "../../src/net/identity.js";
import { decode, encode } from "../../src/sim/cbor.js";
import { appendOp, createLog, sealOp, signProposal, signVote, terrainBody } from "../../src/sim/oplog.js";

const params = new URLSearchParams(location.search);
const me = params.get("id");
const room = params.get("signal") || "ws://127.0.0.1:8787";
const logEl = document.querySelector("pre");
const identity = createIdentity();
const cell = createLog();
const pc = new RTCPeerConnection({ iceServers: [] });
const channels = {};
for (const spec of [
  ["ctrl", 0, true],
  ["ops", 1, true],
  ["snap", 2, false],
]) {
  const options = { negotiated: true, id: spec[1], ordered: spec[2] };
  if (!spec[2]) options.maxRetransmits = 0;
  const channel = pc.createDataChannel(spec[0], options);
  channel.binaryType = "arraybuffer";
  channels[spec[0]] = channel;
}
let socket;
let remoteReady = false;
const pendingCandidates = [];

function write(line) {
  logEl.textContent += `${line}\n`;
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sendSignal(blob) {
  socket?.send(JSON.stringify({ type: "signal", to: params.get("to"), from: me, blob }));
}

pc.onicecandidate = (event) => {
  if (event.candidate) sendSignal(JSON.stringify({ candidate: event.candidate }));
};

async function onSignal(message) {
  if (message.type !== "signal" || message.from === me) return;
  const payload = JSON.parse(message.blob);
  if (payload.sdp) {
    await pc.setRemoteDescription(payload.sdp);
    remoteReady = true;
    while (pendingCandidates.length) await pc.addIceCandidate(pendingCandidates.shift());
    if (payload.sdp.type === "offer") {
      await pc.setLocalDescription(await pc.createAnswer());
      sendSignal(JSON.stringify({ sdp: pc.localDescription }));
    }
    return;
  }
  if (payload.candidate) {
    if (!remoteReady) pendingCandidates.push(payload.candidate);
    else await pc.addIceCandidate(payload.candidate);
  }
}

function present(id) {
  return new Promise((resolve) => {
    const wait = (event) => {
      const body = JSON.parse(event.data);
      if (body.type !== "present") return;
      socket.removeEventListener("message", wait);
      resolve(body.peers.some((peer) => peer.pubkey === id));
    };
    socket.addEventListener("message", wait);
    socket.send(JSON.stringify({ type: "list", cell: "atoll-0" }));
  });
}

const proposal = signProposal(identity, {
  cell: "atoll-0",
  nonce: 1,
  body: terrainBody({
    cell: "atoll-0",
    eye: [25, 25, 165],
    aim: [25, 25, -25],
    chunk: [0, 0, -1],
    before: cell.crust.hash(0, 0, -1),
    mode: "dig",
    writes: [{ i: 0, j: 0, k: -1, sdf_mm: 500 }],
  }),
});

function show() {
  write("applied");
  write(`hash ${hex(cell.crust.hash(0, 0, -1))}`);
  write(`voxel ${cell.crust.sampleIndex(0, 0, -1)}`);
}

const ops = channels.ops;
ops.onmessage = (event) => {
  const frame = unpackFrame(new Uint8Array(event.data));
  const packet = { bytes: frame.bytes, sig: frame.sig, pubkey: frame.pubkey };
  if (!packetValid(packet)) {
    write("bad signature");
    return;
  }
  if (frame.kind === 1 && params.get("offer") !== "1") {
    const body = decode(frame.bytes).body;
    if (body.t !== "TerrainEdit" || !same(body.before, cell.crust.hash(0, 0, -1))) {
      write("refused");
      return;
    }
    ops.send(packFrame(2, signVote(identity, 1, true)));
    write("voted");
    return;
  }
  if (frame.kind === 2 && params.get("offer") === "1") {
    const vote = { bytes: frame.bytes, sig: frame.sig, pubkey: frame.pubkey };
    const op = sealOp({ leader: identity, proposal, seq: 1, tick: 30, votes: [vote] });
    const applied = appendOp(cell, op, 2);
    if (!applied.ok) {
      write(applied.reason);
      return;
    }
    ops.send(packFrame(3, signBytes(identity, encode({
      seq: op.seq,
      proposal: op.proposal,
      proposalSig: op.proposalSig,
      proposer: op.proposer,
      commit: op.commit,
      commitSig: op.commitSig,
      leader: op.leader,
      voteBytes: vote.bytes,
      voteSig: vote.sig,
      votePub: vote.pubkey,
    }))));
    show();
    return;
  }
  if (frame.kind === 3 && params.get("offer") !== "1") {
    const record = decode(frame.bytes);
    const applied = appendOp(cell, {
      seq: record.seq,
      proposal: record.proposal,
      proposalSig: record.proposalSig,
      proposer: record.proposer,
      commit: record.commit,
      commitSig: record.commitSig,
      leader: record.leader,
      votes: [{ bytes: record.voteBytes, sig: record.voteSig, pubkey: record.votePub }],
    }, 2);
    if (!applied.ok) {
      write(applied.reason);
      return;
    }
    show();
  }
};

ops.onopen = () => {
  write("ops open");
  if (params.get("offer") !== "1") return;
  ops.send(packFrame(1, proposal));
  write("proposed");
};

write(`voxel before ${cell.crust.sampleIndex(0, 0, -1)}`);
socket = new WebSocket(room);
socket.onmessage = (event) => {
  onSignal(JSON.parse(event.data)).catch((error) => write(String(error)));
};
await new Promise((resolve) => {
  socket.onopen = resolve;
});
socket.send(JSON.stringify({ type: "announce", pubkey: me, cell: "atoll-0" }));
write(`announced ${me}`);
if (params.get("offer") === "1") {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await present(params.get("to"))) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await pc.setLocalDescription(await pc.createOffer());
  sendSignal(JSON.stringify({ sdp: pc.localDescription }));
  write("offered");
}
