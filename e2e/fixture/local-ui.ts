import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { Page } from "@playwright/test";
import { testEnvConfig } from "./test-env.config";

const root = join(__dirname, "..", "..", "dist");
const origin = new URL(testEnvConfig.BASE_URL).origin;
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
// The body changes, so headers that describe the deployed body must go.
const bodyHeaders = [
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "etag",
  "last-modified",
];

function localFile(url: URL) {
  if (url.origin !== origin) return null;
  let path = "index.html";
  try {
    if (url.pathname !== "/") path = decodeURIComponent(url.pathname);
  } catch {
    // A malformed escape is never a local file; the deployed server answers.
    return null;
  }
  const file = normalize(join(root, path));
  if (!file.startsWith(root + sep) || !existsSync(file)) return null;
  return extname(file) in contentTypes ? file : null;
}

// Serves dist from this checkout, built by the global setup, while
// /api, /rpc and /rest still reach the live testnet. The page keeps the
// deployed document headers, including its CSP.
export async function serveLocalUi(page: Page) {
  await page.route(
    (url) => localFile(url) !== null,
    async (route) => {
      const file = localFile(new URL(route.request().url()));
      if (!file) return route.fallback();
      const headers: Record<string, string> = {};
      if (route.request().isNavigationRequest()) {
        const deployed = await route.fetch();
        for (const [name, value] of Object.entries(deployed.headers()))
          if (!bodyHeaders.includes(name)) headers[name] = value;
      }
      headers["content-type"] = contentTypes[extname(file)];
      await route.fulfill({ status: 200, headers, body: await readFile(file) });
    },
  );
}
