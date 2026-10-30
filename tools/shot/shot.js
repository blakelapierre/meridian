import { cast } from "../../src/engine/cast.js";
import {
  createIdentity,
  decodeShot,
  packFrame,
  packetValid,
  signShot,
  signVote,
  unpackFrame,
} from "../../src/net/identity.js";
import { connectPeer, createRoom } from "../../src/net/room.js";

const params = new URLSearchParams(location.search);
const me = params.get("id");
const roomUrl = params.get("signal") || "ws://127.0.0.1:8787";
const log = document.querySelector("pre");
const identity = createIdentity();
const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
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

function write(line) {
  log.textContent += `${line}\n`;
}

const atoll = await fetch(new URL("../../content/atoll.json", import.meta.url)).then((response) => response.json());
const dummy = atoll.placements.dummy;
const pad = atoll.placements.accuracyPad;
const origin = [pad.x, pad.y, 165];
const toward = [dummy.x - pad.x, dummy.y - pad.y, 90 - 165];
const scale = Math.hypot(toward[0], toward[1], toward[2]);
const shot = {
  weapon: "line",
  originCm: origin,
  dir: toward.map((value) => Math.round((value / scale) * 32767)),
  tick: 1,
  nonce: 1,
};

function trace(proposal) {
  const direction = proposal.dir;
  const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  const hit = cast(
    proposal.originCm.map((value) => value / 100),
    direction.map((value) => value / length),
    [{
      type: "sphere",
      origin: [dummy.x / 100, dummy.y / 100, 0.9],
      radius: 0.35,
      color: [1, 0, 0, 1],
      body: "dummy",
    }],
  );
  return Boolean(hit.object && hit.object.body === "dummy");
}

const ops = channels.ops;
ops.onmessage = (event) => {
  const frame = unpackFrame(new Uint8Array(event.data));
  const packet = { bytes: frame.bytes, sig: frame.sig, pubkey: frame.pubkey };
  if (!packetValid(packet)) {
    write("bad signature");
    return;
  }
  if (frame.kind === 1) {
    const proposal = decodeShot(frame.bytes);
    const hit = trace(proposal);
    ops.send(packFrame(2, signVote(identity, { tick: proposal.tick, nonce: proposal.nonce, hit })));
    write(`traced ${hit ? "hit" : "miss"}`);
    return;
  }
  if (frame.kind === 2) {
    const hit = frame.bytes[40] === 1;
    const local = trace(shot);
    write(hit === local ? `verified ${hit ? "hit" : "miss"}` : "split");
  }
};

ops.onopen = async () => {
  write("ops open");
  if (params.get("offer") !== "1") return;
  ops.send(packFrame(1, signShot(identity, shot)));
  write("proposed");
};

const room = createRoom({ url: roomUrl, me });
try {
  await room.start();
  write(`announced ${me}`);
  await connectPeer({
    pc,
    room,
    me,
    to: params.get("to"),
    offer: params.get("offer") === "1",
    isOpen: () => ops.readyState === "open",
    status: write,
  });
} catch (error) {
  write(String(error));
}
