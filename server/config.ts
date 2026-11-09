import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { web3 } from "@coral-xyz/anchor";
import { z } from "zod";

const endpoint = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
}, "Use an HTTP(S) endpoint without embedded credentials or query parameters");
const origin = endpoint
  .refine((value) => {
    const url = new URL(value);
    return (
      url.pathname === "/" &&
      (url.protocol === "https:" ||
        ["127.0.0.1", "localhost"].includes(url.hostname))
    );
  }, "Use an HTTPS origin or loopback HTTP")
  .transform((value) => new URL(value).origin);
const publicKey = z.string().transform((value, context) => {
  try {
    const key = new web3.PublicKey(value);
    if (key.toBase58() !== value || key.equals(web3.PublicKey.default))
      throw new Error();
    return key;
  } catch {
    context.addIssue({ code: "custom", message: "Invalid public key" });
    return z.NEVER;
  }
});
const positive = z.string().regex(/^[1-9][0-9]*$/);

const schema = z.object({
  origin,
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(8080),
  allowedOrigins: z.array(origin).default([]),
  extensionOrigins: z.string().default(""),
  dist: z
    .string()
    .default("dist")
    .transform((value) => resolve(value)),
  akash: z.object({
    rpcUrl: endpoint,
    restUrl: endpoint,
    chainId: z.string().min(1),
    genesisTime: z.iso.datetime({ offset: true }),
    maxAgeSeconds: z.number().int().positive().default(60),
  }),
  solana: z.object({
    rpcUrl: endpoint,
    genesisHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    programId: publicKey,
    mint: publicKey,
    lightClientProgram: publicKey.optional(),
    maxAgeSeconds: z.number().int().positive().default(60),
  }),
  fee: z
    .object({ amountUakt: positive, gas: positive })
    .default({ amountUakt: "12500", gas: "500000" }),
  faucet: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("disabled") }),
      z.object({
        kind: z.literal("testnet"),
        akashKeyFile: z.string().min(1),
        stateFile: z.string().default(".cache/faucet.json"),
      }),
    ])
    .default({ kind: "disabled" }),
});

export type PortalConfig = z.infer<typeof schema>;
export function parseConfig(value: unknown): PortalConfig {
  return schema.parse(value);
}
export async function loadConfig() {
  const path = process.env.PORTAL_CONFIG ?? "portal.config.json";
  return parseConfig(JSON.parse(await readFile(path, "utf8")));
}
