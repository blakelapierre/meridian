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

## This pass

Interest reaches 80 m plus a tenth of a meter per point of mapping. Farther poses are still dropped.

## Proves

`test/fill.test.js` for the edit. The frame is the existing terrain proposal.

## Later

A catalog hash on hello. Interest filters. Channels that are not all on one ops socket.
