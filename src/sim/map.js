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
  };
}

export function abilityLine(skill = 0) {
  const ability = mapAbilities(skill);
  const parts = ["you"];
  if (ability.trail) parts.push("trail");
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

export function mapMarks({ self, skill = 0, others = [], target = null, objects = [], trail = [], known = [] }) {
  const ability = mapAbilities(skill);
  const marks = [];
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
        name: ability.names ? other.id : "",
      });
    }
  }
  if (target?.point) {
    marks.push({ kind: "target", point: target.point, name: target.name || target.kind || "" });
  }
  return { ability, marks };
}
