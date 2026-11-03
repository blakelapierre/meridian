// Frame-stall driver (Batch 17). Browsers stop rAF for hidden, offscreen or starved tabs; the
// game then steps its sim from a timer by real elapsed time (up to STALL_MAX_DT per call), so a
// bot keeps walking and peers keep getting poses even when nothing is painted.
export const STALL_MS = 250;
export const STALL_MAX_DT = 0.5;
export const stalledFor = (lastFrameMs, nowMs, limit = STALL_MS) => nowMs - lastFrameMs >= limit;
