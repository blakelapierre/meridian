export function mapRadius(skill = 0) {
  const trained = Math.max(0, Math.min(140, skill));
  return 16 + (trained / 140) * 64;
}

export function mapAbilities(skill = 0) {
  const trained = Math.max(0, Math.min(140, skill));
  return {
    radius: mapRadius(trained),
    trail: trained >= 12 ? Math.round(6 + (trained / 140) * 36) : 0,
    people: trained >= 28,
    names: trained >= 70,
    objects: trained >= 48,
    memory: trained >= 28 ? Math.round(45 + (trained / 140) * 600) : 0,
    ground: trained >= 4,
    places: trained >= 16,
  };
}

export function cellSize(mapping = 0) {
  if (mapping < 20) return 4;
  if (mapping < 60) return 2;
  return 1;
}

export function groundBudget(mapping = 0) {
  if (mapping < 4) return 0;
  return Math.round(12 + mapping * 1.5);
}

export function lookReach(eyesight = 0) {
  return Math.min(12, Math.max(0, eyesight) / 140 * 12);
}

export function createSurvey() {
  return { ground: new Map(), places: new Map() };
}

function skillValue(skills, name) {
  const value = skills?.[name];
  return typeof value === "number" ? value : value?.value || 0;
}

function writeGround(survey, x, y, depth, skills) {
  const mapping = skillValue(skills, "mapping");
  const budget = groundBudget(mapping);
  if (!budget) return;
  const size = cellSize(mapping);
  const i = Math.round(x / size);
  const j = Math.round(y / size);
  const pit = skillValue(skills, "mining") >= 8 && depth < -0.05;
  survey.ground.set(`${size}:${i}:${j}`, {
    point: [i * size, j * size],
    depth: pit ? depth : 0,
    kind: pit ? "pit" : "sand",
  });
  while (survey.ground.size > budget) survey.ground.delete(survey.ground.keys().next().value);
  if (pit && skillValue(skills, "mining") >= 12) {
    notePlace(survey, {
      id: `pit:${i}:${j}`,
      kind: "pit",
      name: "pit",
      point: [i * size, j * size],
    }, skills);
  }
}

export function noteSurvey(survey, { x, y, yaw = 0, depthAt = () => 0, skills = {} }) {
  const mapping = skillValue(skills, "mapping");
  if (groundBudget(mapping) <= 0) return survey;
  const size = cellSize(mapping);
  const reach = lookReach(skillValue(skills, "eyesight"));
  const steps = reach > 0 ? Math.max(1, Math.round(reach / size)) : 0;
  writeGround(survey, x, y, depthAt(x, y), skills);
  for (let step = 1; step <= steps; step += 1) {
    const dist = (reach * step) / steps;
    const px = x + Math.sin(yaw) * dist;
    const py = y + Math.cos(yaw) * dist;
    const depth = skillValue(skills, "mining") >= 8 ? depthAt(px, py) : 0;
    writeGround(survey, px, py, depth, skills);
  }
  return survey;
}

export function notePlace(survey, place, skills = {}) {
  if (!place?.id || !place.point) return survey;
  const mapping = skillValue(skills, "mapping");
  const appraisal = skillValue(skills, "appraisal");
  const mining = skillValue(skills, "mining");
  const building = skillValue(skills, "building");
  const allowed = place.kind === "pit"
    ? mining >= 8
    : place.kind === "wall" || place.kind === "footing"
      ? building >= 1 || mapping >= 16
      : place.kind === "player"
        ? appraisal >= 12
        : mapping >= 16 || appraisal >= 8;
  if (!allowed) return survey;
  const named = mapping >= 70 || appraisal >= 20;
  const label = place.name || place.kind || "";
  const ranging = skillValue(skills, "ranging");
  const point = ranging >= 25 ? place.point.slice() : [
    Math.round(place.point[0]),
    Math.round(place.point[1]),
    place.point[2] || 0,
  ];
  survey.places.set(place.id, {
    id: place.id,
    kind: place.kind || "place",
    name: named ? (ranging >= 25 ? `${label} ${point[0]},${point[1]}` : label) : "",
    point,
  });
  return survey;
}

export function noteNearby(survey, self, landmarks, skills = {}) {
  if (skillValue(skills, "mapping") < 16) return survey;
  const reach = 6 + skillValue(skills, "mapping") / 20 + skillValue(skills, "eyesight") / 40;
  for (const place of landmarks) {
    if (!place?.point || !inSense(self, place.point, reach)) continue;
    notePlace(survey, place, skills);
  }
  return survey;
}

export function contourStep(topography = 0) {
  const trained = Math.max(0, topography);
  if (trained < 4) return 0;
  if (trained < 15) return 4;
  if (trained < 35) return 2;
  if (trained < 65) return 1;
  return 0.5;
}

export function contourDetail(topography = 0) {
  const trained = Math.max(0, topography);
  const step = contourStep(trained);
  const cells = trained < 4 ? 0 : trained < 20 ? 10 : trained < 50 ? 16 : trained < 80 ? 24 : 32;
  return { step, cells };
}

export function contourLines({ x = 0, y = 0, span = 32, step = 2, heightAt, knownAt, cells = 20 } = {}) {
  if (!(step > 0) || typeof heightAt !== "function" || !(span > 0)) return [];
  const n = cells;
  const x0 = x - span / 2;
  const y0 = y - span / 2;
  const count = (n + 1) * (n + 1);
  const hs = new Array(count);
  const seen = new Array(count);
  const at = (i, j) => j * (n + 1) + i;
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const px = x0 + span * (i / n);
      const py = y0 + span * (j / n);
      seen[at(i, j)] = knownAt ? knownAt(px, py) === true : true;
      hs[at(i, j)] = heightAt(px, py);
    }
  }
  const point = (i, j) => [x0 + span * (i / n), y0 + span * (j / n)];
  const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const lines = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const ids = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      if (ids.some(([a, b]) => !seen[at(a, b)])) continue;
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
      const byLevel = new Map();
      for (const [c, d] of edges) {
        const h0 = hs[at(ids[c][0], ids[c][1])];
        const h1 = hs[at(ids[d][0], ids[d][1])];
        if (h0 === h1) continue;
        const lo = Math.floor(Math.min(h0, h1) / step);
        const hi = Math.floor(Math.max(h0, h1) / step);
        for (let band = lo + 1; band <= hi; band += 1) {
          const level = band * step;
          const t = (level - h0) / (h1 - h0);
          const hit = mix(point(ids[c][0], ids[c][1]), point(ids[d][0], ids[d][1]), t);
          if (!byLevel.has(level)) byLevel.set(level, []);
          byLevel.get(level).push(hit);
        }
      }
      for (const [level, pts] of byLevel) {
        if (pts.length < 2) continue;
        lines.push({
          a: pts[0],
          b: pts[1],
          major: Math.abs((level / step) % 2) < 1e-3,
        });
      }
    }
  }
  return lines;
}

export function pathKeep(tracking = 0) {
  const trained = Math.max(0, Math.min(140, tracking));
  if (trained < 1) return 0;
  return Math.min(80, Math.round(2 + trained * 0.45));
}

export function pathStamp(tracking = 0) {
  return tracking >= 8;
}

export function notePath(path, point, tracking = 0) {
  const keep = pathKeep(tracking);
  if (keep <= 0 || !point) return path;
  const last = path[path.length - 1];
  if (last && (point[0] - last[0]) ** 2 + (point[1] - last[1]) ** 2 < 1) return path;
  path.push([point[0], point[1]]);
  while (path.length > keep) path.shift();
  return path;
}

export function abilityLine(skill = 0) {
  const ability = mapAbilities(skill);
  const parts = ["you"];
  if (ability.trail) parts.push("trail");
  if (ability.ground) parts.push("ground");
  if (ability.places) parts.push("places");
  if (ability.people) parts.push("people");
  if (ability.objects) parts.push("objects");
  if (ability.names) parts.push("names");
  return parts.join(" · ");
}

export function headingDegrees(yaw = 0) {
  const turns = (yaw * 180) / Math.PI;
  return ((turns % 360) + 360) % 360;
}

export function formatFix(x, y, yaw = 0) {
  const heading = Math.round(headingDegrees(yaw)) % 360;
  return `${x.toFixed(1)}, ${y.toFixed(1)} m  ${String(heading).padStart(3, "0")}°`;
}

export function inSense(self, point, radius) {
  const dx = point[0] - self[0];
  const dy = point[1] - self[1];
  return dx * dx + dy * dy <= radius * radius;
}

export function placeMark(self, point, radius, size) {
  const half = size / 2;
  const span = half - 12;
  let dx = (point[0] - self[0]) / radius;
  let dy = (point[1] - self[1]) / radius;
  const dist = Math.hypot(dx, dy) || 1;
  const inside = dist <= 1;
  if (!inside) {
    dx /= dist;
    dy /= dist;
  }
  return {
    x: half + dx * span,
    y: half - dy * span,
    inside,
  };
}

export function mapMarks({ self, skill = 0, others = [], target = null, objects = [], trail = [], known = [], ground = [], places = [] }) {
  const ability = mapAbilities(skill);
  const marks = [];
  for (const cell of ground) {
    if (!cell?.point || !inSense(self, cell.point, ability.radius)) continue;
    marks.push({ kind: cell.kind === "pit" ? "pit" : "sand", point: cell.point });
  }
  for (const place of places) {
    if (!place?.point) continue;
    if (!inSense(self, place.point, ability.radius) && skill < 90) continue;
    marks.push({ kind: "place", point: place.point, name: place.name || "" });
  }
  if (ability.trail) {
    for (const point of trail.slice(-ability.trail)) marks.push({ kind: "trail", point });
  }
  if (ability.objects) {
    for (const object of objects) {
      if (!object.point || !inSense(self, object.point, ability.radius)) continue;
      if (target && object.id === target.id) continue;
      marks.push({ kind: "object", point: object.point, name: ability.names ? object.kind : "" });
    }
  }
  if (ability.people) {
    const people = known.length ? known : others.filter((other) => inSense(self, other.feet, ability.radius));
    for (const other of people) {
      const point = other.feet || other.point;
      if (!point) continue;
      marks.push({
        kind: "player",
        id: other.id,
        point,
        color: other.color,
        name: ability.names ? (other.label || other.id) : "",
      });
    }
  }
  if (target?.point) {
    marks.push({ kind: "target", point: target.point, name: target.name || target.kind || "" });
  }
  return { ability, marks };
}
