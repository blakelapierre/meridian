export function createErrands() {
  return { dig: false, bind: false, fin: false, strike: false };
}

export function noteErrand(state, name) {
  if (Object.prototype.hasOwnProperty.call(state, name)) state[name] = true;
  return state;
}

export function errandLine(state) {
  if (!state.dig) return "dig the beach";
  if (!state.bind) return "bind a hearth";
  if (!state.fin) return "set the fin";
  if (!state.strike) return "enter the compound";
  return "";
}
