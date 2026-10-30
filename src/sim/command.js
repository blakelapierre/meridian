export function standWhere(table) {
  if (!table || table.integrity > 0) return null;
  return table.at.slice();
}

export function sitOrder(seated) {
  return seated ? "hold" : null;
}

export function readVoucher(table) {
  if (!table) return "";
  return table.voucher || "unsigned";
}

export function writeVoucher(table, name) {
  if (!table || !name) return table || null;
  table.voucher = name;
  return table;
}

export function maySit(atTable = false, joined = false) {
  return Boolean(atTable) && !joined;
}