// ?ns=<name>: a private storage namespace for this page. Loaded as a classic script before
// main.js so every localStorage key and BroadcastChannel name (identity, saves, tour, tabs)
// is scoped. Same-origin iframes in tools/scale/ use it to be distinct players.
(function (root) {
  function namespaced(store, prefix) {
    const own = () => {
      const out = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.startsWith(prefix)) out.push(key.slice(prefix.length));
      }
      return out;
    };
    return {
      getItem: (key) => store.getItem(prefix + key),
      setItem: (key, value) => store.setItem(prefix + key, String(value)),
      removeItem: (key) => store.removeItem(prefix + key),
      key: (i) => own()[i] ?? null,
      clear: () => { for (const key of own()) store.removeItem(prefix + key); },
      get length() { return own().length; },
    };
  }
  function install(win) {
    let ns = "";
    try { ns = new URLSearchParams(win.location.search).get("ns") || ""; } catch { return ""; }
    ns = ns.replace(/[^\w.-]/g, "").slice(0, 40);
    if (!ns) return "";
    const prefix = `ns:${ns}:`;
    try {
      const real = win.localStorage;
      const scoped = namespaced(real, prefix);
      Object.defineProperty(win, "localStorage", { configurable: true, get: () => scoped });
    } catch {
      // No storage: the page falls back to memory on its own.
    }
    if (typeof win.BroadcastChannel === "function") {
      const Base = win.BroadcastChannel;
      win.BroadcastChannel = class extends Base { constructor(name) { super(`${prefix}${name}`); } };
    }
    win.meridianNs = ns;
    return ns;
  }
  root.meridianNamespace = { namespaced, install };
  if (typeof window !== "undefined") install(window);
})(typeof globalThis !== "undefined" ? globalThis : this);
