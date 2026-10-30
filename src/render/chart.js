import { abilityLine, formatFix } from "../sim/map.js";
import { placeOnView, worldToPixel } from "../sim/plate.js";

function strokeGrouped(ctx, marks, kind, here, across, size, color) {
  const groups = new Map();
  for (const mark of marks) {
    if (mark.kind !== kind || !mark.point) continue;
    const key = mark.id || kind;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mark.point);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = kind === "path" ? 2 : 1;
  for (const line of groups.values()) {
    if (line.length < 2) continue;
    ctx.beginPath();
    line.forEach((point, index) => {
      const at = placeOnView(here, point, across, size);
      if (index === 0) ctx.moveTo(at.x, at.y);
      else ctx.lineTo(at.x, at.y);
    });
    ctx.stroke();
  }
}

function cssColor(color, fallback) {
  if (!color) return fallback;
  const red = Math.round(color[0] * 255);
  const green = Math.round(color[1] * 255);
  const blue = Math.round(color[2] * 255);
  return `rgb(${red}, ${green}, ${blue})`;
}

function plateImage(plate) {
  if (!plate.image) {
    plate.image = document.createElement("canvas");
    plate.image.width = plate.size;
    plate.image.height = plate.size;
  }
  if (plate.dirty) {
    const image = new ImageData(plate.data, plate.size, plate.size);
    plate.image.getContext("2d").putImageData(image, 0, 0);
    plate.dirty = false;
  }
  return plate.image;
}

export function paintChart(canvas, read, { self, yaw, skill, marks, radius, plate, center, span, rise = null, contours = [] }) {
  const here = center || self;
  const across = span || radius * 2;
  const height = typeof rise === "number" ? `  ·  ${rise.toFixed(1)} m` : "";
  if (read) read.textContent = `${formatFix(self[0], self[1], yaw)}${height}  ·  ${abilityLine(skill)}  ·  sense ${Math.round(radius)} m  ·  ${Math.round(across)} m`;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const half = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, half - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "rgba(8, 14, 18, 0.94)";
  ctx.fillRect(0, 0, size, size);
  if (plate) {
    const image = plateImage(plate);
    const [cx, cy] = worldToPixel(plate, here[0], here[1]);
    const mpp = plate.meters / plate.size;
    const sw = across / mpp;
    ctx.drawImage(image, cx - sw / 2, cy - sw / 2, sw, sw, 0, 0, size, size);
  }
  if (contours?.length) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.clip();
    for (const line of contours) {
      const pa = placeOnView(here, line.a, across, size);
      const pb = placeOnView(here, line.b, across, size);
      ctx.strokeStyle = line.major ? "rgba(42, 28, 16, 0.8)" : "rgba(42, 28, 16, 0.4)";
      ctx.lineWidth = line.major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = "#3d6a7a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(half, half, half - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(120, 170, 180, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(half, 14);
  ctx.lineTo(half, size - 14);
  ctx.moveTo(14, half);
  ctx.lineTo(size - 14, half);
  ctx.stroke();
  ctx.fillStyle = "#9cf";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", half, 16);
  strokeGrouped(ctx, marks, "path", here, across, size, "rgba(196, 154, 92, 0.9)");
  strokeGrouped(ctx, marks, "track", here, across, size, "rgba(190, 120, 90, 0.75)");
  for (const mark of marks) {
    if (mark.kind === "sand" || mark.kind === "pit" || mark.kind === "trail" || mark.kind === "path" || mark.kind === "track") continue;
    const at = placeOnView(here, mark.point, across, size);
    if (!mark.point) continue;
    if (mark.kind === "place") {
      ctx.fillStyle = "#fc8";
      ctx.beginPath();
      ctx.moveTo(at.x, at.y - 5);
      ctx.lineTo(at.x + 4, at.y);
      ctx.lineTo(at.x, at.y + 5);
      ctx.lineTo(at.x - 4, at.y);
      ctx.closePath();
      ctx.fill();
      if (mark.name && at.inside) {
        ctx.fillStyle = "#ffe";
        ctx.font = "10px sans-serif";
        ctx.fillText(mark.name, at.x, at.y - 8);
      }
    } else if (mark.kind === "object") {
      if (!at.inside) continue;
      ctx.fillStyle = "#c9a";
      ctx.fillRect(at.x - 3, at.y - 3, 6, 6);
    } else if (mark.kind === "player") {
      if (!at.inside) continue;
      ctx.fillStyle = cssColor(mark.color, "#c83");
      ctx.beginPath();
      ctx.arc(at.x, at.y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (mark.name) {
        ctx.fillStyle = "#eee";
        ctx.font = "10px sans-serif";
        ctx.fillText(mark.name, at.x, at.y - 7);
      }
    } else if (mark.kind === "target") {
      ctx.strokeStyle = "#9f9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(at.x, at.y, at.inside ? 6 : 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const you = placeOnView(here, self, across, size);
  if (radius > 0 && across > 0) {
    const ring = (radius / across) * size;
    const inner = ring * 0.5;
    ctx.strokeStyle = "rgba(180, 210, 190, 0.45)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(you.x, you.y, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(you.x, you.y, inner, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.beginPath();
    ctx.arc(you.x, you.y, ring, 0, Math.PI * 2);
    ctx.arc(you.x, you.y, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(64, 82, 42, 0.32)";
    ctx.fill("evenodd");
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.arc(you.x, you.y, ring, 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fill("evenodd");
    ctx.restore();
  }
  ctx.save();
  ctx.translate(you.x, you.y);
  ctx.rotate(yaw);
  ctx.fillStyle = "#9cf";
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(5, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
