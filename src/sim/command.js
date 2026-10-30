export function standWhere(table) {
  if (!table || table.integrity > 0) return null;
  return table.at.slice();
}

export function maySit(atTable = false, joined = false) {
  return Boolean(atTable) && !joined;
}