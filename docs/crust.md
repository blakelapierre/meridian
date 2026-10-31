# MERIDIAN
## Integer crust

Normative encoding for `TerrainEdit`. The cubic-meter rates in [game.md](game.md) §7 are the intent. **This file wins** wherever an integer grant and a decimal rate could disagree. Packets still follow [implementation-webrtc.md](implementation-webrtc.md): ops are CBOR, no floats, `before_hash` must match.

The slice does not hash a float mesh.

---

## 1. Grid

| | Value |
|---|---|
| Voxel | 25 cm edge (`VOXEL_CM`; 50 cm before save format 2). Volume 15_625 cm³ |
| Chunk | 64 voxels on a side, 16 m, origin on a multiple of 1600 cm |
| Sample | int16 millimeters, clamped to **±2000** |
| Sign | Negative is solid. Positive is air. Zero is the surface |
| Frame | Tangent centimeters, z up, until P8. See [engineering.md](engineering.md) §5 |

Chunk coordinates and voxel indices are integers. Voxel `(i, j, k)` has its center at

```text
center_cm = index * 25 + 12.5
```

along each axis, in chunk-local centimeters, then shifted by the chunk origin.

## 2. Seed

World seed for the slice: `atoll-slice-1`. Cell id: `atoll-0`. Both are fields on [content/atoll.json](../content/atoll.json).

A voxel with no override takes its sample from this function. All arithmetic is integer. `isqrt(n)` is the greatest integer `s` such that `s * s <= n`.

```text
R = 25600
dx, dy, dz = center centimeters relative to the cell anchor
h2 = dx*dx + dy*dy
inside = h2 <= R*R
plane_mm = dz * 10

if not inside:
  coast_mm = (isqrt(h2) - R) * 10
  sample = min(2000, max(coast_mm, 1))
else if plane_mm > 0:
  sample = min(2000, plane_mm)
else:
  sample = max(-2000, plane_mm)
```

Outside the disc is never solid. The sea is that rule plus a movement clamp, not a second physics engine. The first solid voxel under a feet position of z = 0 has center z = −12.5 cm and sample −125.

## 3. What an edit may say

A `TerrainEdit` lists writes. It does not say "remove 0.2 m³" and hope.

```text
write: { i: int, j: int, k: int, sdf_mm: int }
```

Indices are chunk-local, 0..63. Writes that cross a chunk boundary are split into separate chunk groups. More than **64** chunks in one proposal is already illegal.

The client chooses writes with the brush in §5. The witness does **not** rebuild the brush from a float camera. It accepts the list only if every write passes §4, then applies those integers and no others.

## 4. Witness checks

Eye position is the certified feet plus eye height (165 cm standing, 110 cm crouched), in centimeters.

For every write:

- Voxel center is within **400 cm** of the eye: distance squared `<= 160000`.
- Voxel center is within **100 cm** of the proposal's aim point, also an int32 centimeter triple, and the aim point is within **400 cm** of the eye.
- The chunk's `before_hash` matches the witness.
- The voxel is not inside a live strike volume.
- Dig: previous sample `<= 0`, new sample is `+250` (`DIG_SAMPLE_MM`, one voxel edge), and the op produces one `spoil`.
- Fill: previous sample `> 0`, new sample is `-250`, and the op consumes one `spoil`.
- Smooth: new sample is previous plus an integer delta in **[-250, 250]**, spoil unchanged.

Spoil is an item, id `spoil`, **mass 2 kg**, stack 20. One write, one spoil. Dirt's real density is not simulated. If the inventory cannot hold the spoil, the dig write is refused, not silently deleted.

## 5. Brush the client uses

While the bit channel is held, each sim tick adds an integer budget:

```text
grant_cm3 = 6667 + floor(6667 * mining_skill / 140)
budget += grant_cm3
```

Skill 0 grants 200_010 cm³/s (0.20001 m³/s). Skill 140 grants 400_020 cm³/s (0.40002 m³/s). A voxel costs **125_000** cm³. Subtract that and emit one write each time the budget covers it. Do not emit a `TerrainEdit` more often than every **0.5 s**; batch the writes those ticks produced.

Aim point: 150 cm along the look direction from the eye, quantized to centimeters. Look comes from the input ring's integer yaw and pitch. The witness still checks distances rather than re-integrating the quaternion.

Candidate voxels are those whose centers lie inside the 100 cm brush and the 400 cm reach. The write for this spend is the candidate **closest to the aim point**. Ties break by lower `i`, then lower `j`, then lower `k`.

Smooth reads the candidates, sets `avg = floor(sum(sample) / count)`, and moves each sample toward `avg` by at most 250 mm (one voxel edge). No spoil.

## 6. Chunk hash

BLAKE3, 32 bytes, over canonical bytes:

```text
utf8(world_seed) || 0x00 || utf8(cell_id) || 0x00 || int32le chunk_x || int32le chunk_y || int32le chunk_z
|| int32le override_count
|| for each override, sorted by k, then j, then i:
     int16le i || int16le j || int16le k || int16le sdf_mm
```

An override is a voxel whose sample differs from §2. Order is the sort above, not insertion order. Two processes that apply the same writes **MUST** produce the same digest. That is the Atoll hash test.

Do not hash a 64³ dense dump on the hot path. The sparse form is the hash.

## 7. Slump

On the economy tick, after certified edits: if a solid voxel (sample `<= 0`) has a same-column neighbor run such that an adjacent column is lower by **2 or more** solid voxels, move one solid sample from the higher column to the lowest air sample in the lower column. This is the 55° rule on a 50 cm grid, and it is coarser than 55°. Integer columns win over a trigonometric slope.

Slump writes are their own certified edit with the same hash rules. The client does not slump locally and hope.

Water volumes are integer liters on the coarse grid and are **not** required for the Atoll acceptance tests. Do not implement them as floats "for now."

## Save format 2: 25 cm voxels

The voxel edge was halved from 50 cm to 25 cm. Every voxel-sized constant now derives from
`VOXEL_CM` in `src/sim/crust.js` (`VOXEL_M`, `VOXEL_CM3`, `DIG_SAMPLE_MM`, `AIR_SAMPLE_MM`, slump
steps, `columnFloor`, the edit validator in `src/sim/edit.js`, `nearestSolid` in `src/sim/aim.js`
and the dug-column pass in `src/render/gpu.js`). The dig rate is a volume budget, so a stroke
removes the same cm³ per tick as before, in 8x as many, smaller voxels.

World saves carry `version: 2`. `migrateWorld` (`src/sim/persist.js`) upgrades an unversioned
(v1) save on load: each 50 cm override becomes the 8 25 cm voxels it covered with its sample
halved (a sample is measured in voxel edges), and stored terrain frames (kinds 1-4) and
terrain chain blocks (kind 11) are dropped because they name old indices and cannot be
re-signed; the expanded crust snapshot already holds their result. Peers on different voxel
sizes cannot share terrain ops: the validator refuses the other size's samples.

The yard building grid (walls, pieces, fires, roads) stays on its own 0.5 m grid; it is not
the crust grid. Wear cells (`src/sim/wear.js`) share the crust voxel footprint.

`node --expose-gc tools/measure-cells.mjs [crust.js]` measures the cost on a fixed dig session.
