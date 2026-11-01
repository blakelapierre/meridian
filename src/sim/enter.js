import { buyOffer, createMatch, joinMatch, rejoin, setChannel, setInside, stepMatch } from "./strike.js";
import { defusePay, payPurse, roundMaterials } from "./clocks.js";

export const SMOKE = { id: "smoke", scrip: 300 };

export function insideBox(box, x, y, z) {
  return x >= box.min.x && x < box.max.x
    && y >= box.min.y && y < box.max.y
    && z >= box.min.z && z < box.max.z;
}

export function createEntry(atoll) {
  return { atoll, match: null, id: "local", joined: false };
}

function status(entry, inside, notice = "") {
  if (!entry.joined) {
    return {
      joined: false,
      inside,
      prompt: inside ? entry.atoll.contract.id : "",
      notice,
      phase: "",
      phaseTicks: 0,
      scrip: null,
      body: "beach",
      side: "",
      loadout: [],
    };
  }
  const player = entry.match.roster.get(entry.id);
  return {
    joined: true,
    inside,
    prompt: "",
    notice,
    phase: entry.match.phase,
    phaseTicks: entry.match.phaseTicks,
    scrip: player.scrip,
    body: player.body,
    side: player.side,
    loadout: player.loadout.slice(),
    channel: player.channel || "",
  };
}

export function entryLine(state) {
  if (!state.joined) return state.prompt;
  const kit = state.loadout.length ? ` ${state.loadout.join(" ")}` : "";
  const secs = Math.max(0, Math.ceil(state.phaseTicks / 30));
  const channel = state.channel ? ` ${state.channel}` : "";
  return `strike ${state.side} ${state.body} scrip ${state.scrip}${kit}${channel} ${state.phase} ${secs}s`;
}

export function stepEntry(entry, { position, use = false, buy = false, yard, offer = null, still = false, fired = false }) {
  const [x, y, z] = position.map((value) => value * 100);
  const inside = insideBox(entry.atoll.site.volume, x, y, z);
  if (!entry.joined) {
    if (!(use && inside)) return status(entry, inside);
    entry.match = createMatch(entry.atoll.contract);
    const side = y >= 0 ? "north" : "south";
    const beach = { metal: yard.metal, items: ["bit"] };
    joinMatch(entry.match, entry.id, side, beach);
    entry.joined = true;
    setInside(entry.match, entry.id, true);
    return status(entry, true);
  }
  setInside(entry.match, entry.id, inside);
  const player = entry.match.roster.get(entry.id);
  let notice = "";
  if (use && inside && player.abandoned) {
    rejoin(player);
    notice = "reinsert";
  }
  if (buy && offer) {
    if (player.loadout.includes(offer.id)) notice = offer.id;
    else if (buyOffer(entry.match, entry.id, offer)) notice = offer.id;
    else notice = entry.match.phase === "buy" || entry.match.phase === "gap" ? "short" : "closed";
    yard.metal = player.beach.metal;
  }
  const wasDefuse = player.channel === "defuse";
  const hadCore = Boolean(entry.match.core);
  const previous = entry.match.phase;
  stepMatch(entry.match, 1);
  const defused = wasDefuse && hadCore && !entry.match.core;
  const paid = defused
    ? defusePay({ defused: true, abandoned: player.abandoned })
    : roundMaterials({ abandoned: player.abandoned, phase: entry.match.phase, previous });
  if (paid) {
    const purse = payPurse(defused ? "defuse" : "round");
    player.beach.metal += purse.metal;
    player.purseName = purse.purse;
    if (!notice) notice = defused ? "defused" : "paid";
  }
  yard.metal = player.beach.metal;
  if (entry.joined && inside && player.channel === "defuse" && (fired || !still)) {
    player.channel = null;
    player.channelTicks = 0;
    if (!notice) notice = fired ? "shot" : "puzzle";
  } else if (entry.joined && inside && use && still && entry.match.core && entry.match.core.side !== player.side) {
    setChannel(entry.match, entry.id, "defuse");
    if (!notice) notice = "defuse";
  }
  if (player.abandoned && !notice) notice = "beach";
  return status(entry, inside, notice);
}
