# Public lighthouse

The github.io build reads `content/lighthouse.json` for its lighthouse.

- `url`: a `wss://` address, or `null` to play solo. A public page never tries `localhost`.
- `?lighthouse=wss://...` overrides it for one visit. `?lighthouse=off` forces solo.
- On `localhost`/`127.0.0.1` the dev lighthouse `ws://127.0.0.1:8787` is used as before, and `?signal=` still works.
- If the lighthouse does not answer within 3 s the page plays solo and tries again 30 s later.

On a shared lighthouse a page meets the other players in its cell by itself (the lower id offers, at most 8 player links). With nine or fewer players that is everyone. Past that, the eight are the nearest pubkeys on a sorted ring, not the first eight who arrived, so a later player still gets a full set. `?solo=1` turns that off. `?id=`/`?to=` tabs work as before.

## Status and redeploy

The earlier public lighthouse (a quick tunnel to a home machine) is retired, so `url` is `null` and the github.io build plays solo with a "multiplayer server offline · playing solo" note. No error is raised and nothing retries.

To bring multiplayer back:

1. Run `tools/signal/serve-public.js` (below) on an always-on host you control, behind TLS on a stable name (a named tunnel or a VPS with Caddy). Quick tunnels change name on every restart; don't ship one as the default.
2. Set `url` in `content/lighthouse.json` to the `wss://` address and bump `lighthouse.json?v=` in `src/app/main.js` (the `?v=` drift test checks importers agree).
3. Check with `?debug=1`: the net panel should read `lighthouse up`. Until then, testers can pass `?lighthouse=wss://...` per visit.
4. Optional: `node tools/scale/run.mjs --lighthouse wss://... --max 50` from a machine where WebRTC is allowed.

## Running one

    SIGNAL_PORT=8781 ORIGINS=https://blakelapierre.github.io node tools/signal/serve-public.js

It binds to 127.0.0.1, so put a TLS reverse proxy in front (Caddy: `reverse_proxy 127.0.0.1:8781`).
Limits (tools/signal/server.js `LIMITS`): 512 sockets, 1024 announced peers, 40 messages a second per socket (a socket that sends 5x that is dropped), 64 KB signal blobs, 1 MB frames. `ORIGINS` refuses pages from other origins.

The lighthouse only relays presence and WebRTC offers/answers. Game traffic is peer to peer. For the world to persist, run an archive (tools/archive/) somewhere that stays up.

## Demo links

- `?debug=1` or F3: the debug panels (hidden by default on github.io; `?demo=1` hides them locally).
- `?tour=1` replays the first-minute tour, `?tour=0` hides it.
- `?look=dummy`, `?dig=1` (bit out, spoil empty, aimed at the sand), `?gate=1` (inside the gate, E joins).

## The lighthouse parameter

"Offline" in the corner means the page found no lighthouse to meet other players through, so you are playing solo. Everything still works alone: the island, digging, building, the AI.

- A lighthouse is only a meeting point (a small WebSocket signaling server). Once players find each other, play goes peer to peer.
- `?lighthouse=wss://host/path` points this visit at a lighthouse of your choice (for example `tools/signal`, which `npm start` runs locally on port 8787).
- `?lighthouse=off` stays solo on purpose and stops the retries.
- With no parameter the page uses `content/lighthouse.json`; if that is missing or does not answer in 3 s, it plays solo and tries again 30 s later.

## Without a lighthouse: public WebTorrent trackers

When no lighthouse is set (the public demo today), the page signals through public WebTorrent trackers instead (`src/net/signal-torrent.js`). Each announce carries a few "offers" holding the player's presence; the tracker hands them to other peers in the room (info_hash = SHA-1 of `meridian/torrent/1/<cell>`), and they answer back. Signals for `connectPeer()` ride as answers addressed to one peer. Several trackers run at once and duplicate messages are dropped.

- `tracker.openwebtorrent.com` relays every addressed answer, so it carries the full handshake.
- `tracker.webtorrent.dev` routes only one answer per offer it handed out, so it is good for finding peers but cannot carry a whole handshake by itself.
- Not provided: a world directory, an authoritative roster, TURN. Players behind strict NATs may not connect.
- `tracker.novage.com.ua` (added Batch 20) relayed offers in a live two-client check.
- Health and failover (Batch 20): trackers that error, close, or go silent reconnect with backoff; after 3 straight failures one is marked dead and a `?backups=wss://...` tracker opens instead. A Cloudflare Worker lighthouse is prepared in `tools/cf-worker/` (see `docs/cloudflare.md`).
- `?signal=torrent` forces it even with a lighthouse configured; `?trackers=wss://a,wss://b` replaces the list.
