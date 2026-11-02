import { notePlace } from "./map.js";
import { toldTint } from "./plate.js";

const KIND = { sand: 1, pit: 2, wood: 3, stone: 4, grass: 5, rock: 6 };
const NAME = { 1: "sand", 2: "pit", 3: "wood", 4: "stone", 5: "grass", 6: "rock" };

function skillValue(skills, name) {
  const value = skills?.[name];
  return typeof value === "number" ? value : value?.value || 0;
}

export function shareRange(skills = {}) {
  return 5 + skillValue(skills, "mapping") / 140 * 10 + skillValue(skills, "appraisal") / 140 * 6;
}

export function nextFriend(score = 0, nearby = false) {
  if (!nearby) return score;
  return Math.min(100, score + 1);
}

// Friendliness is not only a number: each person keeps a short record of what passed between you.
// "told" is lore they shared with you; "refused" is a drag they refused, which also costs 5.
export const DEED_KINDS = ["told", "refused"];
export function noteDeed(deeds, id, kind) {
  if (!deeds || !id || !DEED_KINDS.includes(kind)) return null;
  const rec = deeds.get(id) || { told: 0, refused: 0 };
  rec[kind] += 1;
  deeds.set(id, rec);
  return rec;
}
export function deedCost(kind) {
  return kind === "refused" ? -5 : 0;
}
export function friendLine(score = 0, rec = null) {
  const parts = [`${friendTier(score)} ${score}`];
  if (rec?.told) parts.push(`told ${rec.told}`);
  if (rec?.refused) parts.push(`refused ${rec.refused}`);
  return parts.join(" · ");
}

export const DEEDS_KEY = "meridian-deeds";
export function packDeeds(deeds) {
  const out = {};
  for (const [id, rec] of deeds || []) out[id] = { told: rec.told | 0, refused: rec.refused | 0 };
  return out;
}
export function unpackDeeds(raw) {
  const deeds = new Map();
  if (!raw || typeof raw !== "object") return deeds;
  for (const [id, rec] of Object.entries(raw)) {
    if (!rec || typeof rec !== "object") continue;
    deeds.set(id, { told: Math.max(0, rec.told | 0), refused: Math.max(0, rec.refused | 0) });
  }
  return deeds;
}
// The record you keep of someone is sent to them, so they see what you hold against them.
export function deedMessage(about, rec) {
  if (!about || !rec) return "";
  return JSON.stringify({ t: "deed", about, told: rec.told | 0, refused: rec.refused | 0 });
}
export function readDeedMessage(text) {
  try {
    const m = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
    if (m?.t !== "deed" || !m.about) return null;
    return { about: String(m.about), told: Math.max(0, m.told | 0), refused: Math.max(0, m.refused | 0) };
  } catch {
    return null;
  }
}
export function theirLine(rec) {
  if (!rec || !(rec.told || rec.refused)) return "";
  const parts = [];
  if (rec.told) parts.push(`told ${rec.told}`);
  if (rec.refused) parts.push(`refused ${rec.refused}`);
  return `they hold ${parts.join(" ")}`;
}

export function friendTier(score = 0) {
  if (score < 0) return "hostile";
  if (score >= 40) return "friend";
  if (score >= 12) return "acquaintance";
  return "stranger";
}

export function offerLore({ skills = {}, friend = 0, ground = [], places = [] } = {}) {
  const tier = friendTier(friend);
  if (tier === "hostile") return { tier, ground: [], places: [] };
  const mapping = skillValue(skills, "mapping");
  const appraisal = skillValue(skills, "appraisal");
  const mining = skillValue(skills, "mining");
  const building = skillValue(skills, "building");
  const groundCap = tier === "hostile" ? 0 : tier === "stranger" ? 4 : tier === "acquaintance" ? 8 : 16;
  const placeCap = tier === "stranger" ? (appraisal >= 20 ? 1 : 0) : tier === "acquaintance" ? 2 : 6;
  const sharedGround = groundCap === 0 || mapping < 4
    ? []
    : ground.filter((cell) => cell.kind !== "pit" || mining >= 8).slice(-groundCap);
  const sharedPlaces = places.filter((place) => {
    if (place.kind === "pit" && mining < 8) return false;
    if ((place.kind === "wall" || place.kind === "footing") && building < 1 && mapping < 16) return false;
    return mapping >= 16 || appraisal >= 8;
  }).slice(0, placeCap).map((place) => ({
    id: place.id,
    kind: place.kind,
    point: place.point,
    name: tier === "stranger" || (mapping < 70 && appraisal < 20) ? "" : (place.name || place.kind || ""),
  }));
  return { tier, ground: sharedGround, places: sharedPlaces };
}

export function packLore(offer) {
  return {
    ground: offer.ground.map((cell) => [
      Math.round(cell.point[0] * 10),
      Math.round(cell.point[1] * 10),
      KIND[cell.kind] || 1,
    ]),
    places: offer.places.map((place) => [
      String(place.id),
      Math.round(place.point[0] * 10),
      Math.round(place.point[1] * 10),
      KIND[place.kind] || 1,
      place.name || "",
    ]),
  };
}

export function unpackLore(body) {
  return {
    ground: (body.ground || []).map((cell) => ({
      kind: NAME[cell[2]] || "sand",
      point: [cell[0] / 10, cell[1] / 10, 0],
    })),
    places: (body.places || []).map((place) => ({
      id: place[0],
      point: [place[1] / 10, place[2] / 10, 0],
      kind: NAME[place[3]] || "sand",
      name: place[4] || "",
    })),
  };
}

export function learnLore(survey, plate, offer, skills, stamp, colors) {
  const learned = { ground: 0, places: 0 };
  const mapping = skillValue(skills, "mapping");
  const cap = mapping < 4 ? 2 : mapping >= 40 ? offer.ground.length : Math.min(8, offer.ground.length);
  for (const cell of offer.ground.slice(0, cap)) {
    if (cell.kind === "pit" && (skills?.prospect != null ? skillValue(skills, "prospect") : skillValue(skills, "mining")) < 8) continue;
    if (plate && stamp) stamp(plate, cell.point[0], cell.point[1], toldTint(colors[cell.kind] || colors.sand), 2.4);
    survey.ground.set(`lore:${cell.point[0]}:${cell.point[1]}`, cell);
    learned.ground += 1;
  }
  for (const place of offer.places) {
    const size = survey.places.size;
    notePlace(survey, place, skills);
    if (survey.places.size > size) learned.places += 1;
  }
  return learned;
}

// A record that changes how you answer: someone who has refused you at least twice more than they
// have told you anything gets no lore from you until they make it up.
export const GUARD_MARGIN = 2;
export function guarded(rec) {
  return !!rec && (rec.refused | 0) - (rec.told | 0) >= GUARD_MARGIN;
}
