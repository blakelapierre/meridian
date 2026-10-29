export function watchQuit(input = process.stdin, exit = () => process.exit(0)) {
  const onData = (key) => {
    const text = typeof key === "string" ? key : key.toString("utf8");
    if (text === "q" || text === "Q" || text === "\u0003" || text === "q\n" || text === "q\r\n" || text === "Q\n") exit();
  };
  if (input.isTTY && typeof input.setRawMode === "function") {
    input.setRawMode(true);
    input.setEncoding("utf8");
  }
  if (typeof input.resume === "function") input.resume();
  input.on("data", onData);
  return () => input.off?.("data", onData);
}
