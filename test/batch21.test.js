import test from "node:test";
import assert from "node:assert/strict";
import worker, { turnCap, takeCredential, monthKey } from "../tools/cf-worker/worker.js";
import { readFileSync } from "node:fs";

const cfg = turnCap({});
const fresh = () => ({ month: "", used: 0, ips: {} });

test("defaults keep TURN well inside the 1,000 GB free tier", () => {
  assert.equal(cfg.capGB, 250); assert.equal(cfg.ttl, 3600);
  const creds = Math.floor((cfg.capGB * cfg.refuseAt) / cfg.estGB);
  assert.ok(creds * cfg.ttl * 2e6 / 8 / 1e9 < 1000, "worst case 2 Mbit/s for every credential's full TTL");
  assert.equal(turnCap({ TURN_TTL: "999999" }).ttl, 172800);
});

test("per-IP rate limit, then window frees up", () => {
  const s = fresh(); const t = Date.UTC(2026, 10, 3);
  for (let i = 0; i < 4; i++) assert.ok(takeCredential(s, "a", cfg, t + i).ok);
  const no = takeCredential(s, "a", cfg, t + 10);
  assert.equal(no.ok, false); assert.equal(no.why, "turn rate limit");
  assert.ok(takeCredential(s, "b", cfg, t + 10).ok);
  assert.ok(takeCredential(s, "a", cfg, t + 3600e3 + 5).ok);
});

test("monthly cap refuses at 90% and resets next month", () => {
  const s = fresh(); const t = Date.UTC(2026, 10, 3);
  let n = 0;
  while (takeCredential(s, "ip" + n, cfg, t).ok) n++;
  assert.equal(n, 900);
  assert.equal(takeCredential(s, "new", cfg, t).why, "turn monthly cap reached");
  assert.ok(takeCredential(s, "new", cfg, Date.UTC(2026, 11, 1)).ok);
  assert.equal(monthKey(Date.UTC(2026, 11, 1)), "2026-12");
});

test("/turn returns 429 when the quota object refuses, and never mints", async () => {
  let minted = 0;
  const env = { TURN_KEY_ID: "k", TURN_KEY_API_TOKEN: "t", ALLOWED_ORIGINS: "https://blakelapierre.github.io",
    TURN_QUOTA: { idFromName: () => 1, get: () => ({ fetch: async () => Response.json({ ok: false, why: "turn monthly cap reached" }) }) } };
  const orig = globalThis.fetch; globalThis.fetch = async () => { minted++; return new Response("{}"); };
  try {
    const res = await worker.fetch(new Request("https://w/turn", { headers: { origin: "https://blakelapierre.github.io" } }), env);
    assert.equal(res.status, 429); assert.equal(minted, 0);
    const bad = await worker.fetch(new Request("https://w/turn", { headers: { origin: "https://evil.example" } }), env);
    assert.equal(bad.status, 403);
  } finally { globalThis.fetch = orig; }
});

test("/turn refuses (503) if the quota binding is missing while a cap is set", async () => {
  const res = await worker.fetch(new Request("https://w/turn", { headers: { origin: "https://x" } }), { TURN_KEY_ID: "k", TURN_KEY_API_TOKEN: "t" });
  assert.equal(res.status, 503);
});

test("wrangler example binds TurnQuota and the github.io origin", () => {
  const toml = readFileSync(new URL("../tools/cf-worker/wrangler.toml.example", import.meta.url), "utf8");
  assert.match(toml, /TurnQuota/); assert.match(toml, /https:\/\/blakelapierre\.github\.io/);
});
