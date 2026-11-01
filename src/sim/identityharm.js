import { socketOf } from "./rules.js";

export function keepSig(archive, sig) {
  archive.sigs = archive.sigs || [];
  archive.sigs.push(sig);
  return archive.sigs.length;
}

export function loreHarm(text, harm = 0) {
  return { channel: "lore", text, harm };
}

export function noteHarm(log, who, what, sig = 0) {
  log.push({ who, what, sig });
  if (log.length > 8) log.shift();
  return log;
}

export function harmMessage(who, what, sig = 0) {
  return JSON.stringify({ t: "harm", channel: socketOf("harm"), who, what, sig });
}

export function readHarmMessage(text) {
  try {
    const message = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
    if (message?.t !== "harm" || message.channel !== "harm") return null;
    return { who: String(message.who || "peer"), what: String(message.what || "harm"), sig: message.sig || 0 };
  } catch {
    return null;
  }
}