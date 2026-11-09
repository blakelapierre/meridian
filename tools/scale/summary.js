// Results table for the scaling bench (pure, so it is unit tested).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function summarize(report) {
  const rows = report.levels.map((l) => {
    const snap = l.snap || [];
    const hz = snap.map((s) => s.simHz).filter((v) => typeof v === "number");
    const minHz = hz.length ? Math.min(...hz) : "–";
    const peers = snap.length ? Math.min(...snap.map((s) => s.remotes ?? 0)) : "–";
    return `<tr class="${l.ok ? "ok" : "bad"}"><td>${l.clients}</td><td>${l.ok ? "pass" : "FAIL"}</td><td>${minHz}</td><td>${peers}</td><td>${l.worstPoseErrorM ?? "–"}</td><td>${l.errorCount ?? 0}${l.erroredClients ? ` (${l.erroredClients} clients)` : ""}</td><td>${(l.warnings || []).length}</td><td>${l.simOnly ?? 0}</td><td>${esc((l.failures || []).slice(0, 3).join("; "))}</td></tr>`;
  }).join("");
  const head = `<p><b>${report.result === "pass" ? "PASS" : "FAIL"}</b>: ${report.maxPassed} clients passed${report.firstFailure ? `, failed at ${report.firstFailure.clients}` : ""} · signaling ${esc(report.lighthouse)} · net ${report.expectNet ? "checked" : "not checked"} · ${navigator?.userAgent ? esc(navigator.hardwareConcurrency || "?") + " cores" : ""}</p>`;
  return `${head}<table><tr><th>clients</th><th>result</th><th>min sim Hz</th><th>min peers</th><th>worst pose m</th><th>errors</th><th>gpu warnings</th><th>sim-only</th><th>failures</th></tr>${rows}</table>`;
}
