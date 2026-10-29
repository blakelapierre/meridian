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
  follow.searchParams.set("follow", id);
  const look = primary.searchParams.get("look");
  if (look) follow.searchParams.set("look", look);
  return [
    primary.pathname + primary.search,
    second.pathname + second.search,
    follow.pathname + follow.search,
  ];
}

export function tiles(availWidth, availHeight, availLeft = 0, availTop = 0) {
  const width = Math.max(1, Math.floor(availWidth / 3));
  const height = Math.max(1, availHeight);
  return [0, 1, 2].map((index) => ({
    left: availLeft + index * width,
    top: availTop,
    width,
    height,
  }));
}

function place(url, name, box) {
  return window.open(url, name, `width=${box.width},height=${box.height},left=${box.left},top=${box.top}`);
}

if (typeof document !== "undefined") {
  let watch = 0;
  addEventListener("DOMContentLoaded", () => {
    for (const link of document.querySelectorAll('a[href^="/tools/"]')) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const urls = trio(link.getAttribute("href"), location.origin);
        const boxes = tiles(screen.availWidth, screen.availHeight, screen.availLeft || 0, screen.availTop || 0);
        const names = ["meridian-primary", "meridian-second", "meridian-follow"];
        const opened = urls.map((url, index) => place(url, names[index], boxes[index]));
        const primary = opened[0];
        if (!primary) return;
        clearInterval(watch);
        watch = setInterval(() => {
          if (!primary.closed) return;
          clearInterval(watch);
          for (const extra of opened.slice(1)) {
            if (extra && !extra.closed) extra.close();
          }
        }, 300);
      });
    }
  });
}
