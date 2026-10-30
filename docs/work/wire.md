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

A harm note can be packed as a lore record with the harm byte beside the text.

## This pass

The lore frame the live socket sends includes the harm byte.

## Proves

`test/slice.test.js` covers the byte on the frame.

## Next

A peer does not read that byte into the harm log. Not in this build.

## Later

A catalog hash on hello. Interest filters. Channels that are not all on one ops socket.
