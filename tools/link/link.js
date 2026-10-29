import { acceptPosition, encodePosition } from "../../src/net/position.js";

const params = new URLSearchParams(location.search);
const me = params.get("id") || `peer-${Math.random().toString(16).slice(2)}`;
const cell = "atoll-0";
const room = params.get("signal") || "ws://127.0.0.1:8787";
const log = document.querySelector("pre");
const pc = new RTCPeerConnection({ iceServers: [] });
const channel = pc.createDataChannel("snap", {
  negotiated: true,
  id: 2,
  ordered: false,
  maxRetransmits: 0,
});
let latest = null;
let socket;
let remoteReady = false;
const pendingCandidates = [];

function write(line) {
  log.textContent += `${line}\n`;
}

channel.binaryType = "arraybuffer";
channel.onopen = () => write("snap open");
channel.onmessage = (event) => {
  latest = acceptPosition(latest, new Uint8Array(event.data));
  write(`remote ${latest.x.toFixed(2)},${latest.y.toFixed(2)},${latest.z.toFixed(2)} @${latest.tick}`);
};

pc.onicecandidate = (event) => {
  if (!event.candidate) return;
  sendSignal(JSON.stringify({ candidate: event.candidate }));
};

function sendSignal(blob) {
  socket?.send(JSON.stringify({ type: "signal", to: params.get("to"), from: me, blob }));
}

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
      write("answered");
    }
    return;
  }
  if (payload.candidate) {
    if (!remoteReady) pendingCandidates.push(payload.candidate);
    else await pc.addIceCandidate(payload.candidate);
  }
}

function present(message) {
  return new Promise((resolve) => {
    const wait = (event) => {
      const body = JSON.parse(event.data);
      if (body.type !== "present") return;
      socket.removeEventListener("message", wait);
      resolve(body.peers.some((peer) => peer.pubkey === message));
    };
    socket.addEventListener("message", wait);
    socket.send(JSON.stringify({ type: "list", cell }));
  });
}

export async function start() {
  socket = new WebSocket(room);
  socket.onmessage = (event) => {
    onSignal(JSON.parse(event.data)).catch((error) => write(String(error)));
  };
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  socket.send(JSON.stringify({ type: "announce", pubkey: me, cell }));
  write(`announced ${me}`);
  if (params.get("offer") === "1" && params.get("to")) {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await present(params.get("to"))) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await pc.setLocalDescription(await pc.createOffer());
    sendSignal(JSON.stringify({ sdp: pc.localDescription }));
    write("offered");
  }
  let tick = 0;
  setInterval(() => {
    if (channel.readyState !== "open") return;
    tick += 1;
    channel.send(encodePosition({ tick, x: tick / 10, y: 0, z: 0 }));
  }, 100);
}

start().catch((error) => write(String(error)));
