import { abilityLine, formatFix, placeMark } from "../sim/map.js";

function cssColor(color, fallback) {
  if (!color) return fallback;
  const red = Math.round(color[0] * 255);
  const green = Math.round(color[1] * 255);
  const blue = Math.round(color[2] * 255);
  return `rgb(${red}, ${green}, ${blue})`;
}

export function paintChart(canvas, read, { self, yaw, skill, marks, radius }) {
  if (read) read.textContent = `${formatFix(self[0], self[1], yaw)}  ·  ${abilityLine(skill)}  ·  ${Math.round(radius)} m`;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const half = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(8, 14, 18, 0.9)";
  ctx.beginPath();
  ctx.arc(half, half, half - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3d6a7a";
  ctx.lineWidth = 2;
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
  for (const mark of marks) {
    const at = placeMark(self, mark.point, radius, size);
    if (mark.kind === "sand" || mark.kind === "pit") {
      if (!at.inside) continue;
      ctx.fillStyle = mark.kind === "pit" ? "#3d5c72" : "#c2a56a";
      ctx.fillRect(at.x - 4, at.y - 4, 8, 8);
    } else if (mark.kind === "place") {
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
    } else if (mark.kind === "trail") {
      if (!at.inside) continue;
      ctx.fillStyle = "rgba(160, 190, 200, 0.45)";
      ctx.fillRect(at.x - 1.5, at.y - 1.5, 3, 3);
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
      if (!at.inside) {
        ctx.fillStyle = "#9f9";
        ctx.fillRect(at.x - 1.5, at.y - 1.5, 3, 3);
      }
    }
  }
  ctx.save();
  ctx.translate(half, half);
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
