import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createStaticServer } from "../tools/serve.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the node server serves the view module", async () => {
  const site = await createStaticServer(root);
  try {
    const page = await fetch(`${site}/tools/view/index.html`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("content-type"), "text/html");
    assert.match(await page.text(), /canvas/);
    const script = await fetch(`${site}/src/app/main.js`);
    assert.equal(script.headers.get("content-type"), "text/javascript");
    assert.equal((await fetch(`${site}/missing-page`)).status, 404);
  } finally {
    await site.close();
  }
});

test("a decoded parent path cannot leave the root", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meridian-serve-"));
  const web = join(parent, "www");
  await mkdir(web);
  await writeFile(join(parent, "secret.txt"), "nope");
  await writeFile(join(web, "ok.txt"), "yes");
  const site = await createStaticServer(web);
  try {
    const escaped = await fetch(`${site}/%2e%2e/secret.txt`);
    assert.notEqual(escaped.status, 200);
    assert.equal(await escaped.text(), "");
    assert.equal(await (await fetch(`${site}/ok.txt`)).text(), "yes");
  } finally {
    await site.close();
    await rm(parent, { recursive: true, force: true });
  }
});
