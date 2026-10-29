function center(i, j, k) {
  return [i * 50 + 25, j * 50 + 25, k * 50 + 25];
}

function dist2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function acceptEdit(crust, proposal, { certified = false, localEdits = false, strike = false } = {}) {
  if (!certified && !localEdits) return { ok: false, reason: "flag" };
  if (strike) return { ok: false, reason: "strike" };
  if (dist2(proposal.eye, proposal.aim) > 160000) return { ok: false, reason: "aim" };
  if (proposal.before) {
    const hash = crust.hash(proposal.chunk[0], proposal.chunk[1], proposal.chunk[2]);
    if (!sameBytes(hash, proposal.before)) return { ok: false, reason: "hash" };
  }
  if (proposal.mode === "dig" && (proposal.spoilRoom ?? 0) < proposal.writes.length) {
    return { ok: false, reason: "spoil" };
  }
  for (const write of proposal.writes) {
    const at = center(write.i, write.j, write.k);
    if (dist2(at, proposal.eye) > 160000) return { ok: false, reason: "reach" };
    if (dist2(at, proposal.aim) > 10000) return { ok: false, reason: "brush" };
    const previous = crust.sampleIndex(write.i, write.j, write.k);
    if (proposal.mode === "dig" && (previous > 0 || write.sdf_mm !== 500)) return { ok: false, reason: "dig" };
  }
  for (const write of proposal.writes) crust.write(write.i, write.j, write.k, write.sdf_mm);
  return { ok: true };
}
