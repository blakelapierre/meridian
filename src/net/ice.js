// ICE servers (Batch 20). Default: public STUN only, as before. TURN is opt-in:
//   ?turn=turns:host:443?transport=tcp&turnuser=u&turncred=p   a static TURN server
//   ?ice=https://worker/turn                                   fetch short-lived creds (Cloudflare)
//   ?relay=1                                                   force relay (test TURN alone)
export const DEFAULT_ICE = [{ urls: "stun:stun.l.google.com:19302" }];

export function iceFrom(params) {
  const servers = DEFAULT_ICE.map((s) => ({ ...s }));
  const turn = params?.get?.("turn");
  if (turn) {
    const urls = turn.split(",").map((u) => u.trim()).filter((u) => /^turns?:/.test(u));
    if (urls.length) servers.push({ urls, username: params.get("turnuser") || "", credential: params.get("turncred") || "" });
  }
  return servers;
}

export function rtcConfig(servers, params) {
  const config = { iceServers: servers };
  if (params?.get?.("relay") === "1") config.iceTransportPolicy = "relay";
  return config;
}

// Fetch Worker-minted servers once per page (they last a day); fall back to STUN-only.
let cached = null;
export function iceServers(params, fetcher = globalThis.fetch) {
  const base = iceFrom(params);
  const endpoint = params?.get?.("ice");
  if (!endpoint || !/^https?:\/\//.test(endpoint) || !fetcher) return Promise.resolve(base);
  if (!cached) {
    cached = fetcher(endpoint).then((r) => (r.ok ? r.json() : null)).then((body) => {
      const got = Array.isArray(body?.iceServers) ? body.iceServers : [];
      return got.length ? [...base, ...got] : base;
    }).catch(() => base);
  }
  return cached;
}
export function resetIceCache() { cached = null; }
