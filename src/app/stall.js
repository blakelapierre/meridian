// Frame-stall driver (Batch 17). Browsers stop rAF for hidden or offscreen tabs and starve it on
// busy machines. The game steps its sim by real elapsed time: rAF frames catch up to
// FRAME_MAX_DT, and when no frame has run for STALL_MS a timer steps the sim (not the paint) by
// up to STALL_MAX_DT, so a bot keeps walking and peers keep getting poses. The timer only fires
// on a real stall so it never competes with a slow but live rAF loop.
export const FRAME_MAX_DT = 0.25;
export const STALL_MS = 1000;
export const STALL_POLL_MS = 500;
export const STALL_MAX_DT = 0.5;
export const stalledFor = (lastFrameMs, nowMs, limit = STALL_MS) => nowMs - lastFrameMs >= limit;
