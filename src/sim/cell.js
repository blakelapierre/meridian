export function cellId(y, boundary = -40) {
  return y > boundary ? "atoll-1" : "atoll-0";
}

export function sameCell(local, remote) {
  if (!remote) return true;
  return local === remote;
}

export function quorum(yes, present) {
  if (present < 1) return false;
  return yes * 2 > present;
}

export function inInterest(distance, reach = 80) {
  return distance <= reach;
}
