import { grantUse } from "./skills.js";

// A made hand. The player spends skill and materials. The helper keeps its own skills.
export const HELPER_COST = { metal: 8, stone: 4, fiber: 1 };
export const HELPER_SKILL = "building";
export const HELPER_NEED = 4;
export const HELPER_CAP = 3;
export const HELPER_TASKS = ["follow", "dig", "haul", "survey", "hold"];
export const HELPER_SKILL_NAMES = ["mining", "hauling", "mapping", "building"];

const STEP = 3.2 / 30;
const SKILL_CAP = 100;

export function helperSkills() {
  const skills = {};
  for (const name of HELPER_SKILL_NAMES) skills[name] = { xp: 0, value: 0 };
  return skills;
}

export function canCraftHelper(yard, skills, count = 0) {
  if (count >= HELPER_CAP) return { ok: false, reason: "many" };
  if ((skills?.[HELPER_SKILL]?.value || 0) < HELPER_NEED) return { ok: false, reason: "skill" };
  for (const [name, cost] of Object.entries(HELPER_COST)) {
    if ((yard?.[name] || 0) < cost) return { ok: false, reason: name };
  }
  return { ok: true };
}

export function craftHelper(yard, skills, { x = 0, y = 0, tick = 0 } = {}, crew = []) {
  const check = canCraftHelper(yard, skills, crew.length);
  if (!check.ok) return check;
  for (const [name, cost] of Object.entries(HELPER_COST)) yard[name] -= cost;
  const seeded = helperSkills();
  // A better builder binds a less clumsy helper. The seed is taken before this craft's own practice.
  const seed = Math.min(12, (skills.building?.value || 0) * 0.25);
  seeded.building.value = seed;
  seeded.building.xp = seed;
  const trained = grantUse(skills, HELPER_SKILL, { success: true, tick, gap: 45 });
  const helper = {
    id: `helper-${Math.floor(tick)}-${crew.length}`,
    x,
    y,
    yaw: 0,
    task: "follow",
    skills: seeded,
    work: 0,
    carry: 0,
    born: Math.floor(tick),
    spot: null,
    corners: null,
  };
  crew.push(helper);
  return { ok: true, helper, trained };
}

export function dismissHelper(yard, helper) {
  if (!yard || !helper) return { ok: false, reason: "none" };
  yard.metal = (yard.metal || 0) + Math.floor(HELPER_COST.metal / 2);
  yard.stone = (yard.stone || 0) + Math.floor(HELPER_COST.stone / 2);
  return { ok: true, metal: yard.metal, stone: yard.stone };
}

export function orderHelper(helper, task) {
  if (!helper) return "";
  if (!HELPER_TASKS.includes(task) || helper.task === task) return helper.task || "";
  helper.task = task;
  helper.work = 0;
  helper.spot = null;
  helper.corners = null;
  return helper.task;
}

export function cycleHelperTask(helper) {
  if (!helper) return "";
  const index = HELPER_TASKS.indexOf(helper.task);
  const next = HELPER_TASKS[(index < 0 ? 0 : index + 1) % HELPER_TASKS.length];
  return orderHelper(helper, next);
}

export function nearestHelper(crew, x, y) {
  let best = null;
  let dist = Infinity;
  for (const helper of crew || []) {
    const d = (helper.x - x) ** 2 + (helper.y - y) ** 2;
    if (d < dist) {
      dist = d;
      best = helper;
    }
  }
  return best;
}

function practice(skill, amount) {
  if (!skill || !(amount > 0) || skill.value >= SKILL_CAP) return 0;
  const step = Math.min(amount / (1 + skill.value / 18), SKILL_CAP - skill.value);
  skill.value += step;
  skill.xp += step;
  return step;
}

function pace(helper, name) {
  const value = helper.skills?.[name]?.value || 0;
  return STEP * (1 + Math.min(0.6, value / 80));
}

function clampIsland(helper) {
  const reach = Math.hypot(helper.x, helper.y);
  if (reach > 248) {
    helper.x *= 248 / reach;
    helper.y *= 248 / reach;
  }
}

function moveToward(helper, tx, ty, speed) {
  const dx = tx - helper.x;
  const dy = ty - helper.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return 0;
  helper.yaw = Math.atan2(dx, dy);
  const step = Math.min(speed, dist);
  helper.x += (dx / dist) * step;
  helper.y += (dy / dist) * step;
  clampIsland(helper);
  return dist - step;
}

function phaseOf(helper) {
  return [...String(helper.id || "h")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function digSpot(helper, home) {
  const angle = (phaseOf(helper) % 8) * (Math.PI / 4);
  return [home[0] + Math.cos(angle) * 2.6, home[1] + Math.sin(angle) * 2.6];
}

function surveySquare(helper, home) {
  const n = phaseOf(helper);
  const ox = (n % 5) - 2;
  const oy = ((n >> 2) % 5) - 2;
  return [
    [home[0] + 5 + ox, home[1] + oy],
    [home[0] + 5 + ox, home[1] + 5 + oy],
    [home[0] + ox, home[1] + 5 + oy],
    [home[0] + ox, home[1] + oy],
  ];
}

function digInterval(mining) {
  return Math.max(45, Math.round(150 - (mining || 0) * 1.2));
}

// One sim tick. home is the yard the haul walks back to. loose stones are {x, y, take()}.
export function stepHelper(helper, sense = {}) {
  const quiet = { gained: 0, task: helper?.task || "", deposited: 0, dug: 0 };
  if (!helper) return quiet;
  const task = HELPER_TASKS.includes(helper.task) ? helper.task : "hold";
  const player = sense.player || [helper.x, helper.y];
  const home = sense.home || player;
  const skills = helper.skills || (helper.skills = helperSkills());
  let gained = 0;
  let deposited = 0;
  let dug = 0;

  if (task === "hold") {
    const dx = player[0] - helper.x;
    const dy = player[1] - helper.y;
    if (dx || dy) helper.yaw = Math.atan2(dx, dy);
    return { gained, task, deposited, dug };
  }

  if (task === "follow") {
    const dx = player[0] - helper.x;
    const dy = player[1] - helper.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2.4) moveToward(helper, player[0] - (dx / dist) * 1.7, player[1] - (dy / dist) * 1.7, STEP);
    else if (dist > 1e-4) helper.yaw = Math.atan2(dx, dy);
    return { gained, task, deposited, dug };
  }

  if (task === "dig") {
    if (!helper.spot) helper.spot = digSpot(helper, home);
    const left = moveToward(helper, helper.spot[0], helper.spot[1], pace(helper, "mining"));
    if (left < 0.4 && (helper.carry || 0) < 3) {
      helper.work += 1;
      if (helper.work >= digInterval(skills.mining.value)) {
        helper.work = 0;
        helper.carry = (helper.carry || 0) + 1;
        dug = 1;
        gained += practice(skills.mining, 0.55);
      }
    }
    return { gained, task, deposited, dug };
  }

  if (task === "haul") {
    if ((helper.carry || 0) > 0) {
      const left = moveToward(helper, home[0], home[1], pace(helper, "hauling"));
      if (left < 1.15) {
        deposited = helper.carry;
        helper.carry = 0;
        gained += practice(skills.hauling, 0.35 * deposited);
      }
    } else {
      let best = null;
      let bestD = 18 * 18;
      for (const stone of sense.loose || []) {
        const d = (stone.x - helper.x) ** 2 + (stone.y - helper.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = stone;
        }
      }
      if (best) {
        const left = moveToward(helper, best.x, best.y, pace(helper, "hauling"));
        if (left < 0.55 && (!best.take || best.take())) {
          helper.carry = Math.min(3, (helper.carry || 0) + 1);
          gained += practice(skills.hauling, 0.4);
        }
      }
    }
    return { gained, task, deposited, dug };
  }

  if (!helper.corners) helper.corners = surveySquare(helper, home);
  const corner = helper.corners[helper.work % 4];
  const left = moveToward(helper, corner[0], corner[1], pace(helper, "mapping"));
  if (left < 0.8) helper.work += 1;
  const tick = sense.tick || 0;
  if (tick % 15 === 0) gained += practice(skills.mapping, 0.28);
  if (tick % 30 === 0) gained += practice(skills.building, 0.12);
  return { gained, task, deposited, dug };
}

export function packHelpers(crew) {
  return (crew || []).slice(0, HELPER_CAP).map((helper) => ({
    id: String(helper.id || "helper"),
    x: Math.round(helper.x * 100),
    y: Math.round(helper.y * 100),
    yaw: Math.round((helper.yaw || 0) * 1000),
    task: HELPER_TASKS.includes(helper.task) ? helper.task : "hold",
    carry: Math.max(0, Math.min(3, helper.carry | 0)),
    work: Math.max(0, helper.work | 0),
    skills: HELPER_SKILL_NAMES.map((name) => Math.round((helper.skills?.[name]?.value || 0) * 10)),
  }));
}

export function unpackHelpers(packed) {
  if (!Array.isArray(packed)) return [];
  const crew = [];
  for (const row of packed.slice(0, HELPER_CAP)) {
    if (!row || typeof row !== "object") continue;
    const skills = helperSkills();
    const values = Array.isArray(row.skills) ? row.skills : [];
    HELPER_SKILL_NAMES.forEach((name, index) => {
      const value = (values[index] || 0) / 10;
      skills[name].value = value;
      skills[name].xp = value;
    });
    crew.push({
      id: String(row.id || `helper-${crew.length}`),
      x: (row.x || 0) / 100,
      y: (row.y || 0) / 100,
      yaw: (row.yaw || 0) / 1000,
      task: HELPER_TASKS.includes(row.task) ? row.task : "hold",
      carry: row.carry | 0,
      work: row.work | 0,
      skills,
      born: 0,
      spot: null,
      corners: null,
    });
  }
  return crew;
}

export function helperLine(helper) {
  if (!helper) return "";
  const bits = HELPER_SKILL_NAMES
    .map((name) => [name, Math.floor(helper.skills?.[name]?.value || 0)])
    .filter(([, value]) => value > 0)
    .map(([name, value]) => `${name} ${value}`);
  const carry = helper.carry ? ` ${helper.carry}` : "";
  return `${helper.task}${carry}${bits.length ? ` · ${bits.join(" ")}` : ""}`;
}

// Two spheres. The picture thread draws these from the stage snapshot.
export function helperParts(helper, z = 0) {
  const yaw = helper.yaw || 0;
  const bob = helper.task && helper.task !== "hold" ? Math.sin((helper.work || 0) * 0.7) * 0.02 : 0;
  const fx = Math.sin(yaw) * 0.04;
  const fy = Math.cos(yaw) * 0.04;
  const detail = helperLine(helper);
  const id = helper.id || "helper";
  return [
    {
      type: "sphere",
      origin: [helper.x, helper.y, z + 0.36 + bob],
      radius: 0.2,
      color: [0.34, 0.48, 0.28, 1],
      reflectivity: 0.08,
      body: "helper",
      id,
      name: "helper",
      detail,
    },
    {
      type: "sphere",
      origin: [helper.x + fx, helper.y + fy, z + 0.62 + bob],
      radius: 0.11,
      color: [0.78, 0.62, 0.28, 1],
      reflectivity: 0.22,
      body: "helper",
      id,
      name: "helper",
      detail,
    },
  ];
}
