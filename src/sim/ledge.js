// Batch 18: a tuck-height ledge near spawn. Nine 0.6 m stone steps climb west from beside the crate
// to a 5.4 m top. Stepping off the west end lands at about 10 m/s, past the 9 m/s line in
// fallHurt (src/sim/hearth.js), so the fall hurts unless you tuck (Ctrl): the tuck is reachable in
// the first minute instead of only from a dune crest. The steps are walk-up floor (standHeight),
// not halt boxes, and they draw as stone props.
export const LEDGE = { x0: -3.6, step: 1.2, rise: 0.6, steps: 9, y0: -153.6, y1: -152 };
export const LEDGE_TOP_M = LEDGE.rise * LEDGE.steps;

export function ledgeHeight(x, y) {
  if (y < LEDGE.y0 || y > LEDGE.y1) return 0;
  const along = LEDGE.x0 - x;
  if (along < 0 || along >= LEDGE.step * LEDGE.steps) return 0;
  return (Math.floor(along / LEDGE.step) + 1) * LEDGE.rise;
}

export function ledgeProps() {
  const props = [];
  for (let i = 0; i < LEDGE.steps; i += 1) {
    const xMax = LEDGE.x0 - i * LEDGE.step;
    props.push({
      id: `spawn.ledge.${i}`,
      kind: "ledge",
      material: "stone",
      name: i === LEDGE.steps - 1 ? "Ledge top" : "Ledge step",
      detail: i === LEDGE.steps - 1 ? "a long drop west: tuck (Ctrl) as you land" : "stone steps up to the ledge",
      difficulty: 0,
      blocksMove: false,
      blocksVision: true,
      box: {
        min: { x: Math.round((xMax - LEDGE.step) * 100), y: Math.round(LEDGE.y0 * 100), z: 0 },
        max: { x: Math.round(xMax * 100), y: Math.round(LEDGE.y1 * 100), z: Math.round((i + 1) * LEDGE.rise * 100) },
      },
    });
  }
  return props;
}
