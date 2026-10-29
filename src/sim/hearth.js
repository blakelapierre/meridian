import { finFluxPerMin, sunDirection } from "./sun.js";

function sameCell(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function workTicks(seconds, skill = 0) {
  const trained = Math.max(0, Math.min(140, skill));
  return Math.max(1, Math.round(seconds * 30 * (1 - 0.4 * trained / 140)));
}

export function craftNeed(skill = 0) {
  return workTicks(20, skill);
}

export function finNeed(skill = 0) {
  return workTicks(10, skill);
}

export function tryFinishHearth(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.pieces.some((piece) => piece.id === "hearth")) return { ok: false, reason: "have" };
  if ((yard.metal ?? 0) < 20 || (yard.stone ?? 0) < 8) return { ok: false, reason: "materials" };
  yard.metal -= 20;
  yard.stone -= 8;
  yard.pieces.push({ id: "hearth", at: cell.slice(), anchors: false });
  return { ok: true, metal: yard.metal, stone: yard.stone };
}

export function tryFinishFin(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.pieces.some((piece) => piece.id === "fin")) return { ok: false, reason: "have" };
  if ((yard.fins ?? 0) < 1) return { ok: false, reason: "fin" };
  if ((yard.metal ?? 0) < 8) return { ok: false, reason: "metal" };
  yard.metal -= 8;
  yard.fins -= 1;
  yard.pieces.push({ id: "fin", at: cell.slice(), anchors: false });
  return { ok: true, metal: yard.metal };
}

export function adoptPiece(yard, cell, id) {
  if (yard.pieces.some((piece) => piece.id === id && sameCell(piece.at, cell))) return { ok: true };
  yard.pieces.push({ id, at: cell.slice(), anchors: false });
  return { ok: true };
}

export function bindHearth(yard, cell) {
  const hearth = yard.pieces.find((piece) => piece.id === "hearth" && sameCell(piece.at, cell));
  if (!hearth) return { ok: false, reason: "none" };
  yard.bound = cell.slice();
  return { ok: true };
}

export function recallPoint(yard, fallback) {
  if (!yard.bound) return fallback.slice();
  return [yard.bound[0] * 0.5, yard.bound[1] * 0.5 + 1.2, 0];
}

export function createVitals() {
  return { integrity: 100, blood: 100, pain: 0, down: 0, left: 100, right: 100 };
}

export function bruise(vitals) {
  vitals.integrity = 40;
  vitals.blood = 50;
  vitals.pain = 40;
  vitals.left = 70;
  vitals.right = 70;
  vitals.down = 0;
  return vitals;
}

export function clubHit(vitals, seconds = 1 / 30, side = "left") {
  if (vitals.down > 0) return { downed: true, dead: false };
  vitals.integrity = Math.max(0, vitals.integrity - 20 * seconds);
  const leg = side === "right" ? "right" : "left";
  vitals[leg] = Math.max(0, (vitals[leg] ?? 100) - 8 * seconds);
  if (vitals.integrity > 0) return { downed: false, dead: false };
  vitals.down = 8;
  return { downed: true, dead: true };
}

export function coolPain(vitals, seconds = 1 / 30) {
  vitals.pain = Math.max(0, vitals.pain - 5 * seconds);
  return vitals.pain;
}

export function limpFactor(vitals) {
  const hurt = [vitals?.left ?? 100, vitals?.right ?? 100].filter((leg) => leg < 50).length;
  if (hurt >= 2) return 0.35;
  if (hurt === 1) return 0.6;
  return 1;
}

export function stepDown(vitals, seconds = 1 / 30) {
  if (vitals.down <= 0) return false;
  vitals.down = Math.max(0, vitals.down - seconds);
  return vitals.down === 0;
}

export function finOutput(tick) {
  return finFluxPerMin([0, 0, 1], sunDirection(tick));
}

export function fallHurt(integrity, speedDown) {
  if (speedDown > -9) return integrity;
  return Math.max(0, integrity - 8);
}
