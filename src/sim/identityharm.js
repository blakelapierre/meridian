export function noteHarm(log, who, what, sig = 0) {
  log.push({ who, what, sig });
  if (log.length > 8) log.shift();
  return log;
}