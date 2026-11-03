# Cloudflare lighthouse + TURN (Batch 20, prepared, not deployed)

Nothing here is live. No accounts were created. This is what to do once Blake signs up.

## What Blake must sign up for

1. **A Cloudflare account** (free): https://dash.cloudflare.com/sign-up
   - **Workers** is included on the free plan. **Durable Objects** with the SQLite backend
     (`new_sqlite_classes` in the example config) are available on the free plan. The paid
     Workers plan ($5/mo) raises the request and duration limits if the lighthouse gets busy.
2. **Cloudflare Realtime TURN** (optional, only for players behind strict NATs): Dashboard →
   Realtime → TURN Server → *Create* gives a **TURN Key ID** and **API token**. TURN is billed per
   GB relayed beyond the free allowance; check the current price on the Realtime pricing page
   before turning it on.
3. **A Cloudflare API token or `wrangler login`** on the machine that deploys (Blake's laptop).
   Nothing else: no domain is needed (`*.workers.dev` works).

An alternative TURN provider (for example Metered or Twilio) also works through the static
`?turn=` option below; the Worker's `/turn` endpoint is written for Cloudflare's API only.

## Deploy (after signup)

```sh
cd tools/cf-worker
cp wrangler.toml.example wrangler.toml      # set ALLOWED_ORIGINS to the game's page origin
npx wrangler login
npx wrangler secret put TURN_KEY_ID          # optional, for TURN
npx wrangler secret put TURN_KEY_API_TOKEN   # optional, for TURN
npx wrangler deploy                          # prints https://meridian-lighthouse.<you>.workers.dev
curl https://meridian-lighthouse.<you>.workers.dev/   # -> "meridian lighthouse"
```

The Worker imports `../signal/hub.js`, so deploy from inside the repo.

## Using it from the game

| Query | Effect |
| --- | --- |
| `?signal=wss://meridian-lighthouse.<you>.workers.dev/ws` | use the Worker as the lighthouse (same protocol as `tools/signal/server.js`) |
| `?ice=https://meridian-lighthouse.<you>.workers.dev/turn` | fetch short-lived Cloudflare TURN creds (24 h) and add them to STUN |
| `?turn=turns:host:443?transport=tcp&turnuser=u&turncred=p` | a static TURN server from any provider |
| `?relay=1` | force relay-only ICE (to prove TURN works on its own) |
| `?trackers=wss://a,wss://b` / `?backups=wss://c` | override the public trackers / add failover trackers |

With no query the game behaves as before: public WebTorrent trackers plus Google STUN.

## Design notes

- `tools/signal/hub.js` is the lighthouse protocol without a transport. The Durable Object
  `Lighthouse` holds one hub, so every socket shares one roster (`?shard=` on `/ws` splits it).
- Limits match the node lighthouse: 512 sockets, 1024 peers, 40 msgs/s per socket, 64 KB blobs.
- The TURN key never reaches the browser; `/turn` mints per-visitor creds and strips port 53
  URLs (browsers block them). `ALLOWED_ORIGINS` stops other sites from spending TURN quota.
- Tracker health (`src/net/signal-torrent.js`): reconnect with 1 s → 60 s backoff, a tracker
  silent for 2 announce periods is dropped and retried, after 3 straight failures it is "dead"
  and the next `?backups=` tracker opens. `room.health()` reports each tracker's state.
