// Run the lighthouse for the public demo behind a tunnel.
// Binds to 127.0.0.1 so only the tunnel reaches it. Set ORIGINS to a comma list to allow only those pages.
import { createLighthouse } from "./server.js";

const port = Number(process.env.SIGNAL_PORT || 8787);
const origins = process.env.ORIGINS ? process.env.ORIGINS.split(",").map((item) => item.trim()).filter(Boolean) : null;
const lighthouse = await createLighthouse(port, { host: process.env.SIGNAL_HOST || "127.0.0.1", origins });
console.log(`${new Date().toISOString()} lighthouse ${lighthouse.url}${origins ? ` origins ${origins.join(" ")}` : ""}`);
setInterval(() => {
  console.log(`${new Date().toISOString()} sockets ${lighthouse.clients()} peers ${lighthouse.peers()}`);
}, 10 * 60 * 1000).unref?.();
process.on("SIGTERM", () => lighthouse.close().then(() => process.exit(0)));
