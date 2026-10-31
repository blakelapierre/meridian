// Ability unlocks: detect tier crossings, queue on-screen notices, and keep a capped log.
import { tierOf, unlockText } from "./skill-text.js";

export const LOG_KEY = "meridian.abilities";
export const LOG_CAP = 50;
export const NOTICE_HOLD_MS = 5000;

// Snapshot tiers so later crossings can be found. Tiny XP ticks never change a tier, so never fire.
export function tierSnapshot(skills) {
  const out = {};
  for (const [name, skill] of Object.entries(skills)) out[name] = tierOf(skill.value);
  return out;
}

// Compare against the snapshot; returns [{ skill, tier, text }] for upward crossings and updates it.
export function detectCrossings(snapshot, skills) {
  const found = [];
  for (const [name, skill] of Object.entries(skills)) {
    const tier = tierOf(skill.value);
    const was = snapshot[name] ?? tier;
    if (tier > was) {
      const text = unlockText(name, tier);
      if (text) found.push({ skill: name, tier, text });
    }
    snapshot[name] = tier;
  }
  return found;
}

export function createLog(storage = globalThis.localStorage) {
  let entries = [];
  try {
    const raw = storage?.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) entries = parsed.filter((e) => e && typeof e.text === "string").slice(0, LOG_CAP);
  } catch {
    entries = [];
  }
  const save = () => {
    try {
      storage?.setItem(LOG_KEY, JSON.stringify(entries));
    } catch {
      // storage full or blocked: the log still works for this session
    }
  };
  return {
    get entries() {
      return entries;
    },
    add(entry, now = Date.now()) {
      entries.unshift({ ...entry, at: now });
      if (entries.length > LOG_CAP) entries.length = LOG_CAP;
      save();
      return entries[0];
    },
    clear() {
      entries = [];
      save();
    },
  };
}

export function relativeTime(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

// Notice queue: at most `max` visible, each held then faded; the rest wait their turn.
export function createNoticeQueue({ max = 3, hold = NOTICE_HOLD_MS } = {}) {
  const waiting = [];
  const shown = [];
  return {
    push(text) {
      waiting.push(text);
    },
    // Returns { add: [items to show], drop: [items expired] }.
    step(now) {
      const drop = [];
      while (shown.length && now - shown[0].since >= hold) drop.push(shown.shift());
      const add = [];
      while (waiting.length && shown.length < max) {
        const item = { text: waiting.shift(), since: now };
        shown.push(item);
        add.push(item);
      }
      return { add, drop };
    },
    get shown() {
      return shown;
    },
    get waiting() {
      return waiting;
    },
  };
}
