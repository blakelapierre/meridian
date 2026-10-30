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