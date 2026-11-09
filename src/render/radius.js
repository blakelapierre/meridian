// Canvas arc/ellipse throw on a negative radius (a tiny canvas, e.g. a 10 px tall bench thumbnail,
// made `h / 2 - 6` negative). Clamp everything through here.
export const rad = (r) => (Number.isFinite(r) && r > 0 ? r : 0);

// The off-screen sound cue: an arc on an ellipse hugging the screen edge, shrinking with age.
// Returns null when the canvas is too small to draw it.
export function edgeCueRadii(w, h, age) {
  const inset = 6 + Math.max(0, age) * 4;
  const rx = w / 2 - inset;
  const ry = h / 2 - inset;
  return rx > 0 && ry > 0 ? { rx, ry } : null;
}
