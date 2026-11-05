import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { walletNetwork } from "./wallet-network";

const root = resolve("dist");
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  if (url.pathname === "/api/config") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(walletNetwork()));
    return;
  }
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/rpc/") ||
    url.pathname.startsWith("/rest/")
  ) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Wallet-only preview: no chain attached" }),
    );
    return;
  }
  try {
    const file = resolve(
      root,
      `.${url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)}`,
    );
    if (!file.startsWith(root + sep) || !types[extname(file)])
      throw new Error("Not found");
    res.setHeader("Content-Type", types[extname(file)]);
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4178, "127.0.0.1");
