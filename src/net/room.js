const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRoom({ url, me, cell = "atoll-0", refreshMs = 5000, role = "player", catalog = "" }) {
  const socket = new WebSocket(url);
  const listeners = new Set();
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("lighthouse failed")));
  });
  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    for (const listener of [...listeners]) listener(message);
  });
  function announce() {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "announce", pubkey: me, cell, role, catalog }));
    }
  }
  async function start() {
    await ready;
    announce();
    const timer = setInterval(announce, refreshMs);
    socket.addEventListener("close", () => clearInterval(timer));
  }
  function onMessage(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function send(to, blob) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "signal", to, from: me, blob }));
  }
  function list() {
    return new Promise((resolve) => {
      const stop = onMessage((message) => {
        if (message.type !== "present") return;
        stop();
        resolve(message.peers);
      });
      socket.send(JSON.stringify({ type: "list", cell }));
    });
  }
  return { start, send, onMessage, list, close: () => socket.close() };
}

export async function connectPeer({ pc, room, me, to, offer, isOpen, status }) {
  const candidates = [];
  const pending = [];
  let description = null;
  let remoteReady = false;
  let shown = "";
  const note = (line) => {
    if (line === shown) return;
    shown = line;
    status(line);
  };
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    candidates.push(event.candidate);
    room.send(to, JSON.stringify({ candidate: event.candidate }));
  };
  pc.oniceconnectionstatechange = () => note(`ice ${pc.iceConnectionState}`);
  room.onMessage(async (message) => {
    if (message.type !== "signal" || message.from !== to) return;
    let payload;
    try {
      payload = JSON.parse(message.blob);
    } catch {
      return;
    }
    try {
      if (payload.sdp) {
        if (pc.remoteDescription?.sdp === payload.sdp.sdp) return;
        await pc.setRemoteDescription(payload.sdp);
        remoteReady = true;
        while (pending.length) await pc.addIceCandidate(pending.shift()).catch(() => {});
        if (payload.sdp.type === "offer" && !description) {
          description = await pc.createAnswer();
          await pc.setLocalDescription(description);
          room.send(to, JSON.stringify({ sdp: pc.localDescription }));
          note("answered");
        }
        return;
      }
      if (payload.candidate) {
        if (!remoteReady) pending.push(payload.candidate);
        else await pc.addIceCandidate(payload.candidate).catch(() => {});
      }
    } catch (error) {
      note(String(error));
    }
  });
  while (!isOpen()) {
    if (offer && !description) {
      const peers = await room.list();
      if (!peers.some((peer) => peer.pubkey === to)) {
        note("waiting for the other tab");
        await pause(500);
        continue;
      }
      description = await pc.createOffer();
      await pc.setLocalDescription(description);
    }
    if (description) {
      room.send(to, JSON.stringify({ sdp: pc.localDescription }));
      for (const candidate of candidates) room.send(to, JSON.stringify({ candidate }));
      note(offer ? "offered" : "answered");
    } else {
      note("waiting for the offer");
    }
    await pause(1000);
  }
}
