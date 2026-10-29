export function cellId(y, boundary = -40) {
  return y > boundary ? "atoll-1" : "atoll-0";
}

export function sameCell(local, remote) {
  if (!remote) return true;
  return local === remote;
}
