import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { web3 } from "@coral-xyz/anchor";
import { parseConfig } from "./config";
import { createPortalServer } from "./http";
import idl from "./chain/idls/akt.json";

test("portal serves its build, bounds the proxy, and fails unavailable chains without leaking configuration", async (t) => {
  await mkdir(".cache", { recursive: true });
  const dist = await mkdtemp(".cache/portal-http-");
  t.after(() => rm(dist, { recursive: true, force: true }));
  await writeFile(
    join(dist, "index.html"),
    "<!doctype html><title>Portal build</title>",
  );
  const requests: {
    method: string | undefined;
    url: string | undefined;
    body: string;
  }[] = [];
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      method: request.method,
      url: request.url,
      body: Buffer.concat(chunks).toString(),
    });
    response.setHeader("Content-Type", "application/json");
    response.end('{"jsonrpc":"2.0","id":1,"result":{"fixture":true}}');
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });
  const address = upstream.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const program = new web3.PublicKey(idl.address);
  const settings = {
    origin: "http://127.0.0.1:8080",
    allowedOrigins: ["http://127.0.0.1:5173"],
    dist,
    akash: {
      rpcUrl: endpoint,
      restUrl: endpoint,
      chainId: "test-chain-1",
      genesisTime: "2026-10-12T15:29:30.455284000Z",
    },
    solana: {
      rpcUrl: endpoint,
      genesisHash: program.toBase58(),
      programId: program.toBase58(),
      mint: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("mint")],
        program,
      )[0].toBase58(),
    },
  };
  const server = createPortalServer(parseConfig(settings));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const listening = server.address();
  assert.ok(listening && typeof listening !== "string");
  const origin = `http://127.0.0.1:${listening.port}`;
  const home = await fetch(origin);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Portal build/);
  assert.match(
    home.headers.get("content-security-policy") ?? "",
    /script-src 'self'/,
  );
  assert.match(
    home.headers.get("content-security-policy") ?? "",
    /wss:\/\/relay.walletconnect.com/,
  );
  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(
    (await fetch(`${origin}/healthz`, { method: "HEAD" })).status,
    200,
  );
  assert.equal(
    (await fetch(`${origin}/healthz`, { method: "POST" })).status,
    404,
  );
  for (const query of ["id=7", "id=bad", "tx=bad", "id=bad&tx=bad"]) {
    const response = await fetch(`${origin}/api/receipt?${query}`);
    assert.equal(response.status, 400);
  }
  assert.equal((await fetch(`${origin}/api/transfers?sender=bad`)).status, 400);
  for (const query of ["sender=bad", "other=wallet", "sender=a&sender=b"]) {
    assert.equal((await fetch(`${origin}/api/quota?${query}`)).status, 400);
  }
  assert.equal(
    (await fetch(`${origin}/api/quota`, { method: "POST" })).status,
    404,
  );
  assert.equal(requests.length, 0, "Malformed lookups must not reach a chain");
  const request = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:5173",
    },
    body: '{"jsonrpc":"2.0","id":1,"method":"status"}',
  };
  const allowed = await fetch(`${origin}/rpc/akash`, request);
  assert.equal(allowed.status, 200);
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    request.headers.origin,
  );
  assert.deepEqual(await allowed.json(), {
    jsonrpc: "2.0",
    id: 1,
    result: { fixture: true },
  });
  assert.equal(requests.length, 1);
  const forbidden = await fetch(`${origin}/rpc/akash`, {
    ...request,
    headers: { ...request.headers, origin: "https://attacker.invalid" },
  });
  assert.equal(forbidden.status, 400);
  const oversized = await fetch(`${origin}/rpc/akash`, {
    ...request,
    body: " ".repeat(65537),
  });
  assert.equal(oversized.status, 400);
  assert.equal(
    requests.length,
    1,
    "Rejected proxy requests must not reach upstream",
  );
  const disabled = await fetch(`${origin}/api/faucet`, {
    ...request,
    body: JSON.stringify({ chain: "akash", address: "unused" }),
  });
  assert.equal(disabled.status, 404);
  assert.equal(requests.length, 1, "Disabled faucet must never query or sign");
  const unavailable = await fetch(`${origin}/api/config`);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error:
      "Network verification is temporarily unavailable. Try again shortly.",
  });
  const quota = await fetch(`${origin}/api/quota`);
  assert.equal(quota.status, 503);
  assert.equal(quota.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    await quota.json(),
    await (await fetch(`${origin}/api/config`)).json(),
  );
  assert.equal((await fetch(`${origin}/server/config.ts`)).status, 404);
  assert.equal((await fetch(`${origin}/portal.config.json`)).status, 404);
  assert.throws(() =>
    parseConfig({ ...settings, origin: "http://public.invalid" }),
  );
  assert.throws(() =>
    parseConfig({
      ...settings,
      akash: {
        ...settings.akash,
        rpcUrl: "http://user:secret@localhost:26657",
      },
    }),
  );
});
