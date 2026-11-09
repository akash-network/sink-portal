import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { PortalConfig } from "./config";
import { createFaucet } from "./faucet";
import {
  assertOrigin,
  extensionOrigins,
  logFailure,
  proxyRequest,
  readJson,
} from "./proxy";
import {
  ApiFailure,
  bridgeConfig,
  bridgeReceipt,
  receiptLookup,
  walletHistoryAddress,
  walletTransfers,
} from "./receipts";
import { portalStatus } from "./status";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript"],
  [".css", "text/css"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".woff2", "font/woff2"],
  [".ico", "image/x-icon"],
  [".json", "application/json"],
]);

export function createPortalServer(config: PortalConfig) {
  const webOrigins = new Set([config.origin, ...config.allowedOrigins]);
  const proxyOrigins = new Set([
    ...webOrigins,
    ...extensionOrigins(config.extensionOrigins),
  ]);
  const fund = createFaucet(config);
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "font-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self' https://explorer-api.walletconnect.com https://relay.walletconnect.com https://relay.walletconnect.org wss://relay.walletconnect.com wss://relay.walletconnect.org https://verify.walletconnect.com https://verify.walletconnect.org https://pulse.walletconnect.org https://echo.walletconnect.com ws://localhost:*",
        "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join("; "),
    );
    try {
      const url = new URL(request.url ?? "/", config.origin);
      if (
        url.pathname === "/rpc/akash" ||
        url.pathname === "/rpc/akash/status" ||
        url.pathname.startsWith("/rest/akash/")
      ) {
        await proxyRequest(request, response, url, {
          akashRpc: config.akash.rpcUrl,
          akashRest: config.akash.restUrl,
          allowedOrigins: proxyOrigins,
        });
        return;
      }
      if (
        request.method === "GET" &&
        !url.search &&
        !url.pathname.startsWith("/api/")
      ) {
        const relative =
          url.pathname === "/"
            ? "index.html"
            : decodeURIComponent(url.pathname).slice(1);
        const asset = resolve(config.dist, relative);
        const contentType = contentTypes.get(extname(asset));
        if (asset.startsWith(config.dist + sep) && contentType) {
          try {
            const body = await readFile(asset);
            if (url.pathname.startsWith("/token/"))
              response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Content-Type", contentType);
            response.end(body);
            return;
          } catch (error) {
            if (!(
              error instanceof Error &&
              "code" in error &&
              error.code === "ENOENT"
            ))
              throw error;
          }
        }
      }
      let value: unknown;
      if (request.method === "GET" && request.url === "/api/status")
        value = await portalStatus(config);
      else if (request.method === "GET" && request.url === "/api/config")
        value = await bridgeConfig(config);
      else if (request.method === "GET" && url.pathname === "/api/receipt")
        value = await bridgeReceipt(receiptLookup(url.searchParams), config);
      else if (request.method === "GET" && url.pathname === "/api/transfers")
        value = await walletTransfers(
          walletHistoryAddress(url.searchParams),
          config,
        );
      else if (request.method === "POST" && request.url === "/api/faucet") {
        assertOrigin(request.headers.origin, webOrigins);
        value = await fund(await readJson(request, 2048));
      }
      response.setHeader("Content-Type", "application/json");
      if (value === undefined) {
        response.statusCode = 404;
        response.end('{"error":"not found"}');
      } else {
        const encoded = JSON.stringify(value, (_, item: unknown) =>
          typeof item === "bigint" ? item.toString() : item,
        );
        assert.ok(
          Buffer.byteLength(encoded) <= 2 * 1024 * 1024,
          "API response exceeds size bound",
        );
        response.end(encoded);
      }
    } catch (error) {
      const faucet = request.url === "/api/faucet";
      response.statusCode =
        error instanceof ApiFailure ? error.status : faucet ? 400 : 503;
      if (!(error instanceof ApiFailure))
        logFailure("portal-request-failed", error, {
          method: request.method ?? "",
          path: (request.url ?? "").split("?", 1)[0].slice(0, 200),
          status: response.statusCode,
        });
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error:
            error instanceof ApiFailure
              ? error.message
              : faucet
                ? "Faucet request failed. Check the address and daily allowance, then check the wallet before retrying."
                : "Network verification is temporarily unavailable. Try again shortly.",
        }),
      );
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
