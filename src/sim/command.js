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

// The company can refuse a hold. A missing order is not a refusal.
export function refuseOrder(orders, id) {
  if (!orders || !id || !orders.has(id)) return false;
  orders.set(id, "refused");
  return true;
}

export function orderMessage(id, word) {
  if (!id || !word) return "";
  return JSON.stringify({ t: "order", id, word });
}

export function readOrderMessage(text) {
  try {
    const message = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
    if (message?.t !== "order" || !message.id || !message.word) return null;
    return { id: String(message.id), word: String(message.word) };
  } catch {
    return null;
  }
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