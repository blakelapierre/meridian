export function standWhere(table) {
  if (!table || table.integrity > 0) return null;
  return table.at.slice();
}