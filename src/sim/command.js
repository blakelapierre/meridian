export function standWhere(table) {
  if (!table || table.integrity > 0) return null;
  return table.at.slice();
}

export function sitOrder(seated) {
  return seated ? "hold" : null;
}

export function giveOrder(orders, id, word) {
  if (!orders || !id || !word) return orders || null;
  orders.set(id, word);
  return orders;
}

export function clearVoucher(table, standing) {
  if (!table || !standing) return table || null;
  table.voucher = "";
  return table;
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