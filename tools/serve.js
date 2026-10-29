import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

export function createStaticServer(root, port = 0) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    if (request.method === "POST" && pathname === "/__quit") {
      response.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
      response.end("bye");
      setTimeout(() => process.exit(0), 20);
      return;
    }
    const file = resolve(base, pathname.replace(/^\/+/, ""));
    if (file !== base && !file.startsWith(base + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      let target = file;
      const info = await stat(target);
      if (info.isDirectory()) target = resolve(target, "index.html");
      let body = await readFile(target);
      if (extname(target) === ".html") {
        const html = body.toString("utf8");
        const tag = '<script src="/tools/quit.js"></script>';
        const at = html.lastIndexOf("</body>");
        body = Buffer.from(at === -1 ? html + tag : html.slice(0, at) + tag + html.slice(at));
      }
      response.writeHead(200, {
        "content-type": types[extname(target)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolveReady) => {
    server.listen(port, "0.0.0.0", () => {
      const address = server.address();
      resolveReady({
        port: address.port,
        url: `http://127.0.0.1:${address.port}`,
        toString() {
          return this.url;
        },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || process.env.PORT || 8080);
  const root = resolve(process.argv[1], "../..");
  createStaticServer(root, port).then((site) => {
    console.log(`${site.url}/tools/view/index.html`);
  });
}
