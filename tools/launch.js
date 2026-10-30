// Site root: "/" under npm start, "/meridian/" on GitHub Pages.
export const ROOT = typeof document !== "undefined" ? new URL("../", import.meta.url).pathname : "/";

export const AI_ORDER = ["surveyor", "miner", "builder", "marksman"];

export function aiHrefs(primaryId, origin = "http://127.0.0.1") {
  return AI_ORDER.map((agenda) => {
    const url = new URL(ROOT + "tools/view/index.html", origin);
    url.searchParams.set("id", agenda);
    url.searchParams.set("to", `${primaryId},c`);
    url.searchParams.set("offer", "c");
    url.searchParams.set("ai", agenda);
    url.searchParams.set("quiet", "1");
    return url.pathname + url.search;
  });
}

export function trio(href, origin = "http://127.0.0.1") {
  const primary = new URL(href, origin);
  if (!primary.searchParams.get("id")) {
    primary.searchParams.set("id", "a");
    primary.searchParams.set("to", "b");
    primary.searchParams.set("offer", "1");
  }
  const id = primary.searchParams.get("id");
  const to = primary.searchParams.get("to") || (id === "a" ? "b" : "a");
  const second = new URL(primary.href);
  second.searchParams.set("id", to);
  second.searchParams.set("to", id);
  if (primary.searchParams.get("offer") === "1") second.searchParams.delete("offer");
  else second.searchParams.set("offer", "1");
  const follow = new URL(ROOT + "tools/view/index.html", origin);
  follow.searchParams.set("id", "c");
  follow.searchParams.set("follow", id);
  const look = primary.searchParams.get("look");
  if (look) follow.searchParams.set("look", look);
  if (primary.pathname.includes("/tools/view/")) {
    const agents = AI_ORDER.join(",");
    primary.searchParams.set("to", `${agents},c`);
    primary.searchParams.set("offer", "1");
    follow.searchParams.set("to", `${id},${agents}`);
  } else if (primary.pathname.includes("/tools/")) {
    const add = (url, extra) => {
      const current = (url.searchParams.get("to") || "").split(",").filter(Boolean);
      if (!current.includes(extra)) current.push(extra);
      url.searchParams.set("to", current.join(","));
    };
    add(primary, "c");
    add(second, "c");
    if (primary.searchParams.get("offer") === "1") second.searchParams.set("offer", "c");
    else primary.searchParams.set("offer", "c");
    follow.searchParams.set("to", `${id},${to}`);
  } else {
    follow.searchParams.set("to", id);
  }
  return [
    primary.pathname + primary.search,
    second.pathname + second.search,
    follow.pathname + follow.search,
  ];
}

export function tiles(availWidth, availHeight, availLeft = 0, availTop = 0) {
  const column = Math.max(320, Math.round(availWidth * 0.28));
  const widthBudget = Math.max(640, availWidth - column);
  let height = Math.round(widthBudget * 9 / 16);
  let width = widthBudget;
  if (height > availHeight) {
    height = availHeight;
    width = Math.round(height * 16 / 9);
  }
  const rest = Math.max(1, availWidth - width);
  const half = Math.floor(availHeight / 2);
  return [
    { left: availLeft, top: availTop, width, height },
    { left: availLeft + width, top: availTop, width: rest, height: half },
    { left: availLeft + width, top: availTop + half, width: rest, height: availHeight - half },
  ];
}

export function benchHref(href, origin = "http://127.0.0.1") {
  const [primary, second, follow] = trio(href, origin);
  const bench = new URL(ROOT + "tools/bench/index.html", origin);
  bench.searchParams.set("primary", primary);
  bench.searchParams.set("follow", follow);
  const primaryUrl = new URL(primary, origin);
  if (primaryUrl.pathname.includes("/tools/view/")) {
    for (const client of aiHrefs(primaryUrl.searchParams.get("id"), origin)) bench.searchParams.append("ai", client);
  } else {
    bench.searchParams.set("second", second);
  }
  return bench.pathname + bench.search;
}

export function bootOrder({ primary = "", follow = "", second = "", ais = [] } = {}) {
  const order = [];
  if (primary) order.push({ slot: "primary", src: primary });
  if (follow) order.push({ slot: "follow", src: follow });
  if (second) order.push({ slot: "second", src: second });
  for (const src of ais) order.push({ slot: "ai", src });
  return order;
}

function features(box) {
  return `popup=yes,width=${box.width},height=${box.height},left=${box.left},top=${box.top}`;
}

if (typeof document !== "undefined") {
  let bench = null;
  document.addEventListener("click", (event) => {
    if (!event.isTrusted || (event.button !== undefined && event.button !== 0)) return;
    const link = event.target.closest?.("a[href*='tools/']");
    if (!link) return;
    const target = new URL(link.href);
    if (target.origin !== location.origin || !target.pathname.startsWith(ROOT + "tools/")) return;
    const hrefAttr = target.pathname + target.search;
    if (hrefAttr.startsWith(ROOT + "tools/archive")) return;
    event.preventDefault();
    const href = benchHref(hrefAttr, location.origin);
    const width = screen.availWidth;
    const height = screen.availHeight;
    const left = screen.availLeft || 0;
    const top = screen.availTop || 0;
    const note = document.querySelector("#windows");
    if (!bench || bench.closed) {
      bench = window.open(href, "meridian-bench", features({ width, height, left, top }));
    } else {
      bench.location.replace(href);
      bench.focus();
    }
    if (note) {
      note.textContent = bench
        ? "One window is open. The wide frame is the primary. The other client is above the follow view."
        : "The browser blocked the window. Allow popups for this site, then click the check again.";
    }
  }, true);
}

