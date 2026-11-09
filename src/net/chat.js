// Chat line (Batch 17, P0 exit test): a short text on the reliable, ordered ctrl channel. It
// never rides the unreliable snap lane, so lost movement packets cannot hold chat back and a
// chat line cannot hold movement back. Lines carry a per-sender sequence so a receiver can show
// them in order and drop duplicates.
export const CHAT_MAX = 200;

export function chatMessage(seq, text) {
  const clean = String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, CHAT_MAX);
  if (!clean) return null;
  return JSON.stringify({ t: "chat", seq: seq >>> 0, text: clean });
}

export function readChat(raw) {
  try {
    const m = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    if (m?.t !== "chat" || typeof m.text !== "string" || !Number.isInteger(m.seq)) return null;
    const text = m.text.slice(0, CHAT_MAX);
    return text ? { seq: m.seq, text } : null;
  } catch {
    return null;
  }
}

// Per-peer inbox: keeps the newest lines and ignores repeats or older sequence numbers.
export function createChatLog(limit = 50) {
  return { lines: [], last: new Map(), limit };
}

export function noteChat(log, from, line, at = Date.now()) {
  const prev = log.last.get(from);
  if (prev !== undefined && line.seq <= prev) return false;
  log.last.set(from, line.seq);
  log.lines.push({ from, seq: line.seq, text: line.text, at });
  if (log.lines.length > log.limit) log.lines.shift();
  return true;
}
