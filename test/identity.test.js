import assert from "node:assert/strict";
import test from "node:test";
import { healthOnCert } from "../src/sim/cert.js";
import { certifySigned, createIdentity, packetValid, signShot, signVote } from "../src/net/identity.js";

const shot = {
  weapon: "line",
  originCm: [0, -12500, 165],
  dir: [32767, 0, -800],
  tick: 40,
  nonce: 7,
};

test("a flipped shot signature does not verify", () => {
  const identity = createIdentity();
  const packet = signShot(identity, shot);
  assert.equal(packetValid(packet), true);
  packet.sig[0] ^= 0xff;
  assert.equal(packetValid(packet), false);
  packet.sig[0] ^= 0xff;
  packet.bytes[packet.bytes.length - 1] ^= 0xff;
  assert.equal(packetValid(packet), false);
});

test("two signed misses beat one signed liar", () => {
  const honestA = createIdentity();
  const honestB = createIdentity();
  const liar = createIdentity();
  const cert = certifySigned([
    signVote(liar, { tick: 40, nonce: 7, hit: true }),
    signVote(honestA, { tick: 40, nonce: 7, hit: false }),
    signVote(honestB, { tick: 40, nonce: 7, hit: false }),
  ]);
  assert.equal(cert, "miss");
  assert.equal(healthOnCert(100, cert, 28), 100);
  const broken = signVote(honestB, { tick: 40, nonce: 7, hit: false });
  broken.sig[3] ^= 0xff;
  assert.equal(certifySigned([
    signVote(liar, { tick: 40, nonce: 7, hit: true }),
    signVote(honestA, { tick: 40, nonce: 7, hit: false }),
    broken,
  ]), null);
});
