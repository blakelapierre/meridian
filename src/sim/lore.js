import { notePlace } from "./map.js";
import { toldTint } from "./plate.js";

const KIND = { sand: 1, pit: 2, wood: 3, stone: 4 };
const NAME = { 1: "sand", 2: "pit", 3: "wood", 4: "stone" };

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
  const groundCap = tier === "stranger" ? 0 : tier === "acquaintance" ? 4 : 12;
  const placeCap = tier === "stranger" ? (appraisal >= 20 ? 1 : 0) : tier === "acquaintance" ? 2 : 6;
  const sharedGround = groundCap === 0 || mapping < 8
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
  if (skillValue(skills, "mapping") < 4) return learned;
  const cap = skillValue(skills, "mapping") >= 40 ? offer.ground.length : Math.min(4, offer.ground.length);
  for (const cell of offer.ground.slice(0, cap)) {
    if (cell.kind === "pit" && skillValue(skills, "mining") < 8) continue;
    if (plate && stamp) stamp(plate, cell.point[0], cell.point[1], toldTint(colors[cell.kind] || colors.sand), 1.6);
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
