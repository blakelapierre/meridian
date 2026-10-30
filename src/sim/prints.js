export const PRINT_CAP = 48;

export function addPrint(prints, print) {
  if (!print) return false;
  const who = print.who || "";
  for (let i = prints.length - 1; i >= 0 && i > prints.length - 8; i -= 1) {
    const older = prints[i];
    if (older.who !== who) continue;
    if ((older.x - print.x) ** 2 + (older.y - print.y) ** 2 < 0.36) return false;
  }
  prints.push({ x: print.x, y: print.y, yaw: print.yaw || 0, who });
  while (prints.length > PRINT_CAP) prints.shift();
  return true;
}
