export function cellId(y, boundary = -40) {
  return y > boundary ? "atoll-1" : "atoll-0";
}

export function sameCell(local, remote) {
  if (!remote) return true;
  return local === remote;
}

export function castVote(ballots, cell, accept) {
  ballots.set(cell, Boolean(accept));
  return ballots.get(cell);
}

export function quorum(yes, present) {
  if (present < 1) return false;
  return yes * 2 > present;
}

export function tally(yes, nos) {
  const present = yes + Math.max(0, nos);
  return { yes, present, pass: quorum(yes, present) };
}

// A stored yes from another cell is not a vote here. A stored no still counts.
export function tallyStored(localYes, stored) {
  let nos = 0;
  if (stored) for (const accept of stored.values()) if (!accept) nos += 1;
  return tally(localYes, nos);
}

export function voteLine(result) {
  if (!result) return "";
  return `vote ${result.yes}/${result.present}${result.pass ? " pass" : ""}`;
}

export function inInterest(distance, reach = 80) {
  return distance <= reach;
}
