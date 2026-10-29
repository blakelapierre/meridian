addEventListener("keydown", (event) => {
  if (event.key !== "q" && event.key !== "Q") return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = event.target && event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  event.preventDefault();
  fetch("/__quit", { method: "POST" }).catch(() => {});
});
