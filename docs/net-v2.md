# Wire protocol v2 (Batch 5)

Every v2 encoding is link-layer only: signed frames are rebuilt byte for byte, so signatures, saves, the
archive and v1 peers are unaffected. A link upgrades only after the other side's `ctrl` hello says
`proto >= 2`. See `src/net/wire.js` for the formats.

| Item | v2 behaviour | v1 fallback |
|---|---|---|
| 1 hello | JSON hello on `ctrl` (id 0); `proto` in announce | no hello means v1 |
| 2 poses | not sent to the archive; change-only + 1 Hz keepalive; 13–15 B varint pose, yaw wrapped to [-pi, pi) | 24 B pose every frame |
| 3 footprints | no print frames to v2 peers/archive; receiver adds a print per heard stride | print frames |
| 4 ops | per-pump pack: one message, 32 B key → index, payload references (commit embeds proposal → reference) | one frame per message |
| 5 lighthouse | `subscribe` → `present{sub:true}` + `roster` diffs; announce every 12 s, 30 s lease | `list` poll, 5 s announce, 15 s TTL |
| 6 deflate | `0xF3` deflate-raw pack for the archive replay only | frame by frame |
| 7 saves | `WORLD_VERSION 3`, `frameWire: "v1-hex"`, archive caches `replay` (v2 deflated pack) beside verbatim frames | v2 saves migrate in place |

Not done on purpose: positional CBOR and per-tick batch *signing*. Both change the signed bytes, which would
break verbatim v1 relay, saved frames and the archive. A single signature per batch needs a v3 frame kind
and an archive that verifies it. That is follow-up work.

## Lighthouse redeploy
`tools/signal/server.js` stays backward-compatible both ways:
- v2 clients against the **currently deployed** lighthouse: it ignores `subscribe` and `proto`, so clients
  keep polling `list` and announcing every 5 s. Everything still works; you only miss the WS savings.
- v1 clients against the **new** lighthouse: `list`/`present`/`signal` are unchanged (entries gain `proto`).
To get item 5's savings, Blake redeploys `tools/signal/server.js` (no new deps; `ws` as before) on the
lighthouse host and restarts the process. No config or port change.
