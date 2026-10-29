const HZ = 30;

export function createMatch(contract) {
  return {
    contract,
    tick: 0,
    round: 1,
    phase: "buy",
    phaseTicks: contract.buySec * HZ,
    wins: { north: 0, south: 0 },
    done: false,
    core: null,
    roster: new Map(),
  };
}

export function joinMatch(match, id, side, beach) {
  if (match.phase !== "buy" && match.phase !== "gap") return false;
  const count = [...match.roster.values()].filter((player) => player.side === side).length;
  if (count >= match.contract.teamCap) return false;
  match.roster.set(id, {
    id,
    side,
    beach,
    scrip: 800,
    lossStreak: 0,
    alive: true,
    abandoned: false,
    inside: true,
    outside: 0,
    body: "strike",
    health: 100,
    loadout: [],
    channel: null,
    channelTicks: 0,
  });
  return true;
}

const banned = new Set(["bit", "hearth-stone"]);

export function buyOffer(match, id, offer) {
  if (match.phase !== "buy" && match.phase !== "gap") return false;
  if (banned.has(offer.id)) return false;
  const player = match.roster.get(id);
  if (!player || player.scrip < offer.scrip) return false;
  const metal = player.beach.metal;
  player.scrip -= offer.scrip;
  player.loadout.push(offer.id);
  player.beach.metal = metal;
  return true;
}

export function sellOffer(match, id, offerId, price) {
  if (match.phase !== "buy" && match.phase !== "gap") return false;
  const player = match.roster.get(id);
  const index = player.loadout.lastIndexOf(offerId);
  if (index < 0) return false;
  player.loadout.splice(index, 1);
  player.scrip = Math.min(9000, player.scrip + Math.floor(price / 2));
  return true;
}

export function setInside(match, id, inside) {
  match.roster.get(id).inside = inside;
}

export function setChannel(match, id, channel) {
  const player = match.roster.get(id);
  if (player.channel !== channel) player.channelTicks = 0;
  player.channel = channel;
}

export function strikeHit(match, attackerId, targetId, damage) {
  const attacker = match.roster.get(attackerId);
  const target = match.roster.get(targetId);
  if (!attacker || !target || !target.alive) return target ? target.health : 0;
  if (!match.contract.friendlyFire && attacker.side === target.side) return target.health;
  target.health -= damage;
  if (target.health <= 0) {
    target.health = 0;
    target.alive = false;
  } else attacker.tagged = attacker.tagged || new Set();
  if (attacker.side !== target.side) {
    attacker.tagged = attacker.tagged || new Set();
    attacker.tagged.add(targetId);
    if (!target.alive) attacker.scrip = Math.min(9000, attacker.scrip + 300);
  }
  return target.health;
}

export function stepMatch(match, ticks = 1) {
  for (let i = 0; i < ticks; i++) stepOnce(match);
  return match;
}

function stepOnce(match) {
  if (match.done) return;
  advanceChannels(match);
  advanceOutside(match);
  advanceCore(match);
  advanceElimination(match);
  const phase = match.phase;
  match.tick += 1;
  if (match.done || match.phase !== phase) return;
  match.phaseTicks -= 1;
  if (match.phaseTicks <= 0) advancePhase(match);
}

function advanceChannels(match) {
  for (const player of match.roster.values()) {
    if (!player.alive || player.abandoned || !player.channel) {
      player.channelTicks = 0;
      continue;
    }
    player.channelTicks += 1;
    if (player.channel === "plant" && !match.core && player.channelTicks >= 3.5 * HZ) {
      match.core = { side: player.side, fuse: 35 * HZ, born: true };
      player.scrip = Math.min(9000, player.scrip + 300);
      player.channel = null;
      player.channelTicks = 0;
    }
    const defuseNeed = player.loadout.includes("kit") ? 5 * HZ : 10 * HZ;
    if (player.channel === "defuse" && match.core && match.core.side !== player.side && player.channelTicks >= defuseNeed) {
      match.core = null;
      player.scrip = Math.min(9000, player.scrip + 300);
      player.channel = null;
      player.channelTicks = 0;
      winRound(match, player.side);
    }
  }
}

function advanceOutside(match) {
  for (const player of match.roster.values()) {
    if (player.abandoned) continue;
    if (player.inside) {
      player.outside = 0;
      continue;
    }
    player.outside += 1;
    if (player.outside >= 5 * HZ) abandon(player);
  }
}

function abandon(player) {
  player.abandoned = true;
  player.alive = false;
  player.body = "beach";
  player.health = null;
  player.channel = null;
}

function advanceCore(match) {
  if (!match.core) return;
  if (match.core.born) {
    match.core.born = false;
    return;
  }
  match.core.fuse -= 1;
  if (match.core.fuse <= 0) {
    const side = match.core.side;
    match.core = null;
    winRound(match, side);
  }
}

function advanceElimination(match) {
  if (match.core || match.done) return;
  const northHere = [...match.roster.values()].some((player) => player.side === "north");
  const southHere = [...match.roster.values()].some((player) => player.side === "south");
  if (!northHere || !southHere) return;
  const north = living(match, "north");
  const south = living(match, "south");
  if (north && !south) winRound(match, "north");
  else if (south && !north) winRound(match, "south");
}

function living(match, side) {
  return [...match.roster.values()].some((player) => player.side === side && player.alive && !player.abandoned);
}

function winRound(match, side) {
  if (match.done) return;
  for (const player of match.roster.values()) {
    if (player.abandoned) continue;
    if (player.side === side) {
      player.lossStreak = 0;
      player.scrip = Math.min(9000, player.scrip + 3250);
    } else {
      player.lossStreak += 1;
      const bonus = Math.min(3400, 1400 + 500 * (player.lossStreak - 1));
      player.scrip = Math.min(9000, player.scrip + bonus);
    }
  }
  match.wins[side] += 1;
  match.core = null;
  if (match.wins[side] >= match.contract.roundsToWin) {
    match.done = true;
    match.phase = "done";
    for (const player of match.roster.values()) player.scrip = 0;
    return;
  }
  match.phase = "gap";
  match.phaseTicks = match.contract.gapSec * HZ;
  for (const player of match.roster.values()) {
    player.channel = null;
    player.channelTicks = 0;
    if (!player.abandoned) {
      player.alive = true;
      player.health = 100;
      player.body = "strike";
    }
  }
}

function advancePhase(match) {
  if (match.phase === "buy") {
    match.phase = "live";
    match.phaseTicks = (match.contract.roundSec - match.contract.buySec) * HZ;
    return;
  }
  if (match.phase === "live") {
    match.phase = "gap";
    match.phaseTicks = match.contract.gapSec * HZ;
    match.core = null;
    return;
  }
  if (match.phase === "gap") {
    match.round += 1;
    match.phase = "buy";
    match.phaseTicks = match.contract.buySec * HZ;
    for (const player of match.roster.values()) {
      player.abandoned = false;
      player.alive = true;
      player.health = 100;
      player.body = "strike";
      player.inside = true;
      player.outside = 0;
    }
  }
}
