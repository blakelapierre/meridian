# Wire

## In the build

Peers meet through the lighthouse and a WebRTC data channel. Positions are unreliable. Ops are reliable. The kinds in use:

| Kind | Payload |
|---|---|
| 1–4 | Terrain proposal, vote, commit |
| 7 | Shot |
| 9 | Wall |
| 10 | Salvage |
| 11 | Block |
| 12 | Lore |
| 13 | Hearth or fin |

A harm note can be packed as a lore record with the harm byte beside the text. A peer that accepts the record writes that byte into the harm log. Hello already carries the catalog hash. The harm note still rides the lore channel.

## This pass

A peer reads the harm byte into the harm log.

## Proves

`test/slice.test.js` covers the byte on the frame. The client calls `noteHarm` when the record carries one.

## Next

The harm note is not its own channel. Not in this build.

## Later

A reply that carries the harm log back.
