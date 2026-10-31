# Trampled paths (wear)

`src/sim/wear.js`, `src/net/wear.js`, rendered in `groundAlbedo` (`src/render/gpu.js`).

- Per-cell wear 0..255 on the crust voxel footprint (25 cm). Every footstep (the player's
  stride cue; other players and AI actors every 0.7 m of travel) adds `WEAR_STEP` to its cell and
  a third of that to the four neighbours.
- Stages blend continuously: grass (0) -> worn dirt (`WORN_AT` 60) -> packed path (`PATH_AT` 170).
- Decay: 1 level every `DECAY_TICKS` (240 ticks), about 34 min from full to grass.
- Sync: dirty cells go out as signed kind-16 frames of `[i, j, level]` triples, at most
  `WEAR_BATCH` (64) cells per frame, every 60 ticks. Merge is max-wins, so repeats and
  reordering are harmless; each peer decays locally.
- Persisted as `wear` triples in the world save (format 2).
- Rendering: a 128x128 R8 texture window (32 m) around the camera, uploaded only when it changes.
