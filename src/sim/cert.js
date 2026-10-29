export function certifyShot(ballots) {
  const hits = ballots.filter((ballot) => ballot === "hit").length;
  const misses = ballots.filter((ballot) => ballot === "miss").length;
  if (hits >= 2) return "hit";
  if (misses >= 2) return "miss";
  return null;
}

export function healthOnCert(health, cert, damage) {
  if (cert !== "hit") return health;
  return health - damage;
}
