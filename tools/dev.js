import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createStaticServer } from "./serve.js";
import { createLighthouse } from "./signal/server.js";
import { watchQuit } from "./console.js";

export async function startDev(root, { httpPort = 0, signalPort = 0 } = {}) {
  const site = await createStaticServer(root, httpPort);
  const lighthouse = await createLighthouse(signalPort);
  return {
    site,
    lighthouse,
    close() {
      return Promise.all([site.close(), lighthouse.close()]);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv[1], "../..");
  const httpPort = Number(process.env.HTTP_PORT || 8080);
  const signalPort = Number(process.env.SIGNAL_PORT || 8787);
  startDev(root, { httpPort, signalPort }).then(({ site, lighthouse }) => {
    console.log(`${site.url}/`);
    console.log(lighthouse.url);
    console.log("press q to stop");
    watchQuit();
  });
}
