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
  const follow = new URL("/tools/view/index.html", origin);
  follow.searchParams.set("id", "c");
  follow.searchParams.set("follow", id);
  const look = primary.searchParams.get("look");
  if (look) follow.searchParams.set("look", look);
  if (primary.pathname.includes("/tools/view/")) {
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

function features(box) {
  return `popup=yes,width=${box.width},height=${box.height},left=${box.left},top=${box.top}`;
}

function place(url, name, box) {
  let win = null;
  try {
    win = window.open(url, name, features(box));
  } catch {
    return null;
  }
  if (!win) return null;
  try {
    win.resizeTo(box.width, box.height);
    win.moveTo(box.left, box.top);
  } catch {
    // some browsers ignore placement; the features string still requested it
  }
  return win;
}

const names = ["meridian-primary", "meridian-second", "meridian-follow"];

export function openChecks(href, origin, screenBox, already = []) {
  const urls = trio(href, origin);
  const boxes = tiles(screenBox.width, screenBox.height, screenBox.left, screenBox.top);
  return urls.map((url, index) => {
    if (already[index] && !already[index].closed) return already[index];
    return place(url, names[index], boxes[index]);
  });
}

if (typeof document !== "undefined") {
  let watch = 0;
  let opened = [null, null, null];
  let armedHref = "";
  const screenBox = () => ({
    width: screen.availWidth,
    height: screen.availHeight,
    left: screen.availLeft || 0,
    top: screen.availTop || 0,
  });
  const toolLink = (event) => {
    if (!event.isTrusted || (event.button !== undefined && event.button !== 0)) return null;
    return event.target.closest?.("a[href^='/tools/']") || null;
  };
  const openNext = (link) => {
    const href = link.getAttribute("href");
    if (href !== armedHref) {
      opened = [null, null, null];
      armedHref = href;
    }
    const urls = trio(href, location.origin);
    const view = screenBox();
    const boxes = tiles(view.width, view.height, view.left, view.top);
    for (let index = 0; index < 3; index += 1) {
      if (opened[index] && !opened[index].closed) continue;
      opened[index] = place(urls[index], names[index], boxes[index]);
      return;
    }
  };
  const report = () => {
    const note = document.querySelector("#windows");
    if (!note) return;
    const count = opened.filter((win) => win && !win.closed).length;
    note.textContent = count === 3
      ? "Three windows are open. The wide one is the primary."
      : `The browser opened ${count} of 3 windows. Allow popups for this site, then click the check again.`;
  };
  const watchPrimary = () => {
    const primary = opened[0];
    if (!primary) return;
    clearInterval(watch);
    let misses = 0;
    watch = setInterval(() => {
      if (!primary.closed) {
        misses = 0;
        return;
      }
      misses += 1;
      if (misses < 2) return;
      clearInterval(watch);
      for (const extra of opened.slice(1)) {
        if (extra && !extra.closed) extra.close();
      }
    }, 400);
  };
  let armedLink = null;
  document.addEventListener("pointerdown", (event) => {
    const link = toolLink(event);
    if (!link) return;
    armedLink = link;
    openNext(link);
  }, true);
  document.addEventListener("pointerup", (event) => {
    if (!event.isTrusted || !armedLink) return;
    openNext(armedLink);
    report();
  }, true);
  document.addEventListener("click", (event) => {
    const link = toolLink(event) || armedLink;
    if (!link || !event.isTrusted) return;
    event.preventDefault();
    openNext(link);
    report();
    watchPrimary();
    armedLink = null;
  }, true);
}
