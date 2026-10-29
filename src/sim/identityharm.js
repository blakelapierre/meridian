export function noteHarm(log, who, what) {
  log.push({ who, what });
  if (log.length > 8) log.shift();
  return log;
}