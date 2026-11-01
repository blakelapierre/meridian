# Wire v3: interest-tiered, dead-reckoned poses

Negotiated with the existing ctrl hello (`proto: 3`). Peers that say 1 or 2 keep getting v1 or v2 poses.

* **Pose v3 (0xB3)** on `snap`: flags, varint tick, zigzag cm position, optional velocity (0.02 m/s),
  optional acceleration (0.25 m/s²), u16 yaw, optional yaw rate (0.04 rad/s), i8 pitch. 11 to 22 bytes, never 16 or 24.
* **Shared predictor** (`predict`): constant velocity plus acceleration for the first 0.5 s, capped at 1.5 s, grounded states never sink.
  The sender keeps the exact decoded copy of what it sent and runs the same function as the receiver.
* **Sender estimates** velocity, acceleration and yaw rate from its local history (least squares). Acceleration is clamped to ±8 m/s² (±12 vertical).
* **Send triggers** per receiver: first, movement mode change (idle/move/air), the receiver moving into a sharper tier,
  a yaw turn > 0.3 rad (that steers *their* frustum test), drift past the tier's error, a loss guard (the previous state has drifted badly too), keepalive.
  A page behind 30 Hz also sends when a receiver still coasting at 30 Hz would be more than 1.25 m off. The tick prediction can match while that coast cannot.
* **Tiers** come from the receiver's own pose as we draw it plus fov and perception range. No view messages are sent.

| tier | when | error | max rate | keepalive |
|---|---|---|---|---|
| near-visible | < 6 m, or on screen < 35 m | 5 cm | 30 Hz | 2 s |
| mid-visible | on screen ≥ 35 m, or off screen < 15 m | 25 cm | 6 Hz | 3 s |
| unseen | off screen ≥ 15 m | 1 m | 2 Hz | 5 s |
| beyond | > range + 20 m | 4 m | 0.5 Hz | 10 s |

* **Receiver** keeps the offset between the old and new prediction at each correction and fades it out over ~0.2 s (snaps only on a > 3 m teleport).

Simulator: `node tools/netsim/sim.mjs --n 25 --seconds 60 --scale` (results in `tools/netsim/results.md`).
