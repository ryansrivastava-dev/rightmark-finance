import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the complete RightMark product surface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>RightMark Intelligence \| Understand rights\. Underwrite value\.<\/title>/i);
  assert.match(html, /AI understands the/);
  assert.match(html, /Open RightMark Intelligence/);
  assert.match(html, /AI interpretation and deterministic finance/);
  assert.match(html, /LIVE PUBLIC DATA/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("ships production metadata and durable-data declarations", async () => {
  const [layout, hosting, packageJson, og] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.match(hosting, /"d1": "DB"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.equal(og, undefined);
});
