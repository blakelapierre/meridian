// "Reset / new session": forget everything this page saved (identity, saves, tour, settings),
// then reload clean. With ?ns= only that namespace's keys go (localStorage is already scoped).
export async function resetEverything({ confirm = globalThis.confirm, win = globalThis, hold = () => {} } = {}) {
  if (!confirm("Reset everything? This forgets your player identity, saved world, tour and settings on this device, then starts a new session.")) return false;
  // Stop this page from writing its save back while it unloads.
  hold();
  try { win.localStorage?.clear(); } catch {}
  try { win.sessionStorage?.clear(); } catch {}
  const scoped = Boolean(win.meridianNs);
  if (!scoped) {
    try {
      const dbs = (await win.indexedDB?.databases?.()) || [];
      await Promise.all(dbs.map((db) => db.name && new Promise((done) => {
        const request = win.indexedDB.deleteDatabase(db.name);
        request.onsuccess = request.onerror = request.onblocked = () => done();
      })));
    } catch {}
    try {
      for (const key of (await win.caches?.keys()) || []) await win.caches.delete(key);
    } catch {}
    try {
      for (const reg of (await win.navigator?.serviceWorker?.getRegistrations?.()) || []) await reg.unregister();
    } catch {}
  }
  try { new win.BroadcastChannel("meridian-boot").postMessage({ role: "fresh" }); } catch {}
  const url = new URL(win.location.href);
  for (const key of ["fresh", "id"]) url.searchParams.delete(key);
  win.location.replace(url.toString());
  return true;
}
