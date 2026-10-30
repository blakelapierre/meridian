# Public lighthouse

The github.io build reads `content/lighthouse.json` for its lighthouse.

- `url`: a `wss://` address, or `null` to play solo. A public page never tries `localhost`.
- `?lighthouse=wss://...` overrides it for one visit. `?lighthouse=off` forces solo.
- On `localhost`/`127.0.0.1` the dev lighthouse `ws://127.0.0.1:8787` is used as before, and `?signal=` still works.
- If the lighthouse does not answer within 3 s the page plays solo and tries again 30 s later.

On a shared lighthouse a page meets the other players in its cell by itself (the lower id offers, at most 8 player links). `?solo=1` turns that off. `?id=`/`?to=` tabs work as before.

## Running one

    SIGNAL_PORT=8781 ORIGINS=https://blakelapierre.github.io node tools/signal/serve-public.js

It binds to 127.0.0.1, so put a TLS reverse proxy in front (Caddy: `reverse_proxy 127.0.0.1:8781`).
Limits (tools/signal/server.js `LIMITS`): 512 sockets, 1024 announced peers, 40 messages a second per socket (a socket that sends 5x that is dropped), 64 KB signal blobs, 1 MB frames. `ORIGINS` refuses pages from other origins.

The lighthouse only relays presence and WebRTC offers/answers. Game traffic is peer to peer. For the world to persist, run an archive (tools/archive/) somewhere that stays up.

## Demo links

- `?debug=1` or F3: the debug panels (hidden by default on github.io; `?demo=1` hides them locally).
- `?tour=1` replays the first-minute tour, `?tour=0` hides it.
- `?look=dummy`, `?dig=1` (bit out, spoil empty, aimed at the sand), `?gate=1` (inside the gate, E joins).
