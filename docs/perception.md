# Perception

`src/sim/perception.js` models what a character can sense. Each sense has a focus point and
a falloff in angle from it. Sight is the first sense wired in; hearing has defaults and is ready
for other systems to use.

## Model

- **Focus**: where attention points (`withFocus(p, {x, y, dir})`). Sight follows the gaze.
- **Per sense**: `acuity`, `fovea` (deg, full detail), `falloff` (deg to the edge),
  `period` (frames between peripheral refreshes), `block` (log2 cell size at the edge),
  `range` (m), `tickMs`.
- **Abilities**: `perceptionFrom({eyesight, focus, hearing}, overrides)` turns skill levels
  into a sense table. Better abilities widen the fovea and falloff, refresh the periphery
  sooner, use finer cells, reach farther and raise acuity. Progression only has to change
  the abilities object.

Helpers: `falloff`, `refreshPeriod`, `blockLevel`, `tracePriority`, `tracedFraction`,
`perceivedDetail`, `refreshDue`, `foveaUniforms`.

## Consumers today

- **Renderer** (`src/render/gpu.js`): foveated progressive tracing. The fovea is traced
  every frame. The periphery is traced in coarser cells on a slower phase and refines while
  the camera stays still, accumulating into a persistent target. The pacer
  (`createTraceBudget` in `src/render/pace.js`) budgets by traced pixels per frame and cuts
  at once on a stall.
- **Labels/LOD**: goal markers fade with `perceivedDetail` (`markGoal` in `src/app/main.js`).
- **Minimap reveal**: the reveal radius takes its eyesight term from sight acuity and is capped
  by sight range (`revealRange` in `src/sim/plate.js`, fed from `revealMap`).
- **Net priority**: peer poses in the periphery are applied only when `refreshDue`; followed
  peers and first poses always apply.

## Follow-ups

- Entity LOD: simplify bodies and animation by `perceivedDetail`.
- Spatial audio: remote shots, digs and steps use `hearAt` (range falloff + side pan). Angle-dependent acuity and ambient sources remain.
- Sender-side net priority: send peripheral updates less often, not just apply them less often.

## Batch 3

Foveation fades smoothly between levels (bilinear cell reconstruction, fractional level blend) and blends with the previous held frame while still (`HISTORY_KEEP` 0.6). Sight falloff widened to 45°. Hearing carries `localization`; sight carries `dark` (Dark adaptation lifts night brightness).

## Batch 4: continuous foveation

Rings came from quantization: the trace snapped the peripheral cell to powers of two
(`exp2(floor(block*t + 0.5) - refine)`) on a lattice, the refresh period and still-refine were
integers, and the resolve read at an unrounded level, so blur stepped at fixed angles.

- `fovRadius(t) = clamp(exp2(block*t - refine), 1, uCellMax)`: continuous per-pixel blur radius;
  `refine` is continuous (`stillFrames / period`). JS mirror: `blurRadius` / `sampleDensity`.
- Sample selection is dithered with interleaved gradient noise rotated per frame: a pixel is
  traced with probability `1 / (r*r*period)` instead of on a cell lattice.
- Reconstruction is an 8-tap Vogel-disk Gaussian (sigma = r/2) over the bilinear accumulation
  target, rotated per pixel and frame, blended in from r = 1 to 1.5.
- Temporal accumulation with per-pixel jitter fills the gaps between frames.
- Floor: `cellCap(width, block) = min(2^block, max(1.5, width / 160))` caps how coarse the
  outer ring gets when the trace buffer is small, while the curve below the cap still follows
  eyesight skill.
