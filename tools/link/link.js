import { acceptPosition, encodePosition } from "../../src/net/position.js";
import { connectPeer, createRoom } from "../../src/net/room.js";

const params = new URLSearchParams(location.search);
const me = params.get("id") || `peer-${Math.random().toString(16).slice(2)}`;
const roomUrl = params.get("signal") || "ws://127.0.0.1:8787";
const log = document.querySelector("pre");
const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
const channel = pc.createDataChannel("snap", {
  negotiated: true,
  id: 2,
  ordered: false,
  maxRetransmits: 0,
});
let latest = null;

function write(line) {
  log.textContent += `${line}\n`;
}

channel.binaryType = "arraybuffer";
channel.onopen = () => write("snap open");
channel.onmessage = (event) => {
  latest = acceptPosition(latest, new Uint8Array(event.data));
  write(`remote ${latest.x.toFixed(2)},${latest.y.toFixed(2)},${latest.z.toFixed(2)} @${latest.tick}`);
};

const room = createRoom({ url: roomUrl, me });
let tick = 0;
setInterval(() => {
  if (channel.readyState !== "open") return;
  tick += 1;
  channel.send(encodePosition({ tick, x: tick / 10, y: 0, z: 0 }));
}, 100);

try {
  await room.start();
  write(`announced ${me}`);
  await connectPeer({
    pc,
    room,
    me,
    to: params.get("to"),
    offer: params.get("offer") === "1",
    isOpen: () => channel.readyState === "open",
    status: write,
  });
} catch (error) {
  write(String(error));
}
