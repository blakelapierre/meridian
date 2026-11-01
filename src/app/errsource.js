// Classify page errors by where they came from so tests only count meridian's own files.
// An error counts when its filename or any stack frame is a same-origin URL under the site
// base path. Extension URLs, other origins and source-less errors ("Script error.") are ignored.
const URL_RE = /\b((?:https?|file|chrome-extension|moz-extension|safari-web-extension|safari-extension|webkit-masked-url|edge-extension):\/\/[^\s)'"]+)/g;

export function siteBase(href) {
  const u = new URL(href);
  return { origin: u.origin, path: u.pathname.replace(/[^/]*$/, "") };
}

export function sourcesOf(info = {}) {
  const out = [];
  if (info.filename) out.push(String(info.filename));
  if (info.stack) for (const m of String(info.stack).matchAll(URL_RE)) out.push(m[1]);
  return out;
}

function isOurs(src, base) {
  try {
    const u = new URL(src.replace(/:\d+(?::\d+)?$/, ""));
    return u.origin === base.origin && u.pathname.startsWith(base.path);
  } catch { return false; }
}

// info: { message, filename, stack }; base: { origin, path } from siteBase().
// Returns { count: boolean, reason: "ours" | "foreign" | "no-source" }.
export function classifyError(info, base) {
  const sources = sourcesOf(info);
  if (!sources.length) return { count: false, reason: "no-source" };
  // Count if any frame is ours: an error thrown in our code via a foreign caller is still ours.
  return sources.some((s) => isOurs(s, base)) ? { count: true, reason: "ours" } : { count: false, reason: "foreign" };
}

// Small collector: keeps counted messages plus an ignored tally with a few samples.
export function createErrorLog(base, { samples = 5 } = {}) {
  const errors = [];
  const ignored = { count: 0, samples: [] };
  return {
    errors,
    ignored,
    add(info) {
      const msg = String(info.message || "error").slice(0, 200);
      const c = classifyError(info, base);
      if (c.count) errors.push(msg);
      else {
        ignored.count += 1;
        if (ignored.samples.length < samples) ignored.samples.push(`${c.reason}: ${msg}`);
      }
      return c;
    },
  };
}

export function errorInfoFromEvent(event) {
  if (event?.type === "unhandledrejection") {
    const r = event.reason;
    return { message: String(r?.message || r || "rejection"), filename: "", stack: r?.stack || "" };
  }
  return { message: String(event?.message || event?.error || "error"), filename: event?.filename || "", stack: event?.error?.stack || "" };
}
