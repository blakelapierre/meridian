# Netcode notes (Batch 16)

Meridian's `snap` channel follows ideas from the Tribes/Torque networking model. The code is
new JavaScript written for Meridian; no Torque source was copied or translated.

Credits:
- Mark Frohnmayer and Tim Gift, "The TRIBES Engine Networking Model", GDC 2000.
- Torque3D (https://github.com/TorqueGameEngines/Torque3D), MIT License, Copyright (c) 2012-2016
  GarageGames, LLC. Reference files: `Engine/source/core/dnet.cpp`, `sim/netGhost.cpp`,
  `sim/netObject.h`, `sim/netConnection.cpp`.

| Module | Idea | Notes |
| --- | --- | --- |
| `src/net/notify.js` | Packet notify (seq, ack, 32-bit ack window) | Replaces the JSON pose `ack` on links whose hello says `notify: 1`. Gives loss % (EWMA) and RTT. A seq is lost once 3 newer ones are acked without it. |
| `src/net/budget.js` | Per-link byte budget + priority accumulation | Token bucket, 1200 B/tick start (160–4000), shrinks 15 % on >5 % loss or a backed-up channel, regrows 2 %/tick. Weight = tier × in-view × speed; skipped items keep accumulating. |
| `src/net/dirty.js` | Per-field dirty masks | Fields `stance`, `wear` (leg condition), `held` (tool slot), `hp` (body integrity, 5-point steps). Lost packets re-mark only fields still at the version they carried. |
| `src/app/netgraph.js` | Net graph | Shown in the `#net` panel (I key / `?dev=1`): per link in/out bytes/s, loss, RTT, ghosts, budget. |
| `src/net/loopback.js` | Local connection | Solo play sends its own pose and state through an in-process link, so the same code runs with no peers. `?loopback=0` turns it off; `?loopback=1` forces it. |

`?notify=0` falls back to Batch 6 behaviour (JSON acks, stance on ctrl). Older peers that do not
advertise `notify` get the old behaviour automatically. Terrain ops and lore stay on the reliable
ordered channels.
