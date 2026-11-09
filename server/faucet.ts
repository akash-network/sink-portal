import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { web3 } from "@coral-xyz/anchor";
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { z } from "zod";
import { ownerBytes } from "./chain/id";
import type { PortalConfig } from "./config";
import { ApiFailure, bridgeConfig } from "./receipts";

const requestSchema = z
  .object({ chain: z.enum(["akash", "solana"]), address: z.string() })
  .strict();
const allowanceSchema = z.object({
  day: z.string(),
  total: z.number().int().nonnegative(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
});

export function createFaucet(config: PortalConfig) {
  let funding = false;
  return async (input: unknown) => {
    const settings = config.faucet;
    if (settings.kind === "disabled")
      throw new ApiFailure(404, "Faucet is disabled");
    assert.notEqual(
      config.akash.chainId,
      "akashnet-2",
      "Testnet faucet cannot use Akash mainnet",
    );
    const { chain, address } = requestSchema.parse(input);
    const verified = await bridgeConfig(config);
    if (chain === "akash") {
      ownerBytes(address);
      assert.notEqual(
        address,
        verified.network.sinkAddress,
        "Fund a wallet, then deposit with MsgSink",
      );
    } else {
      const key = new web3.PublicKey(address);
      assert.equal(key.toBase58(), address);
      assert.ok(
        web3.PublicKey.isOnCurve(key.toBytes()) &&
          !key.equals(web3.PublicKey.default),
        "Wallet public key required",
      );
    }
    assert.ok(!funding, "Another funding request is in progress");
    funding = true;
    const temporary = `${settings.stateFile}.${randomUUID()}.tmp`;
    try {
      const day = new Date().toISOString().slice(0, 10);
      let previous: z.infer<typeof allowanceSchema> = {
        day,
        total: 0,
        counts: {},
      };
      try {
        previous = allowanceSchema.parse(
          JSON.parse(await readFile(settings.stateFile, "utf8")),
        );
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw error;
      }
      const counts = previous.day === day ? previous.counts : {};
      const key = `${chain}:${address}`;
      const count = counts[key] ?? 0;
      const total = previous.day === day ? previous.total : 0;
      assert.ok(count < 5 && total < 100, "Daily faucet allowance reached");
      await mkdir(dirname(settings.stateFile), { recursive: true });
      await writeFile(
        temporary,
        JSON.stringify({
          day,
          total: total + 1,
          counts: { ...counts, [key]: count + 1 },
        }),
        { mode: 0o600, flag: "wx" },
      );
      await rename(temporary, settings.stateFile);
      if (chain === "akash") {
        const raw = (await readFile(settings.akashKeyFile, "utf8")).trim();
        assert.match(raw, /^[0-9a-fA-F]{64}$/, "Invalid faucet signing key");
        const wallet = await DirectSecp256k1Wallet.fromKey(
          Buffer.from(raw, "hex"),
          "akash",
        );
        const client = await SigningStargateClient.connectWithSigner(
          config.akash.rpcUrl,
          wallet,
          { broadcastTimeoutMs: 30_000, broadcastPollIntervalMs: 500 },
        );
        try {
          assert.equal(
            await client.getChainId(),
            config.akash.chainId,
            "Wrong faucet chain",
          );
          const sender = (await wallet.getAccounts())[0].address;
          const result = await client.sendTokens(
            sender,
            address,
            [{ denom: "uakt", amount: "100000000" }],
            {
              amount: [{ denom: "uakt", amount: config.fee.amountUakt }],
              gas: config.fee.gas,
            },
            "AKT bridge testnet faucet",
          );
          assert.equal(result.code, 0, "Faucet transaction failed");
          return {
            chain,
            address,
            amount: "100 AKT",
            transaction: result.transactionHash,
          };
        } finally {
          client.disconnect();
        }
      }
      const solana = new web3.Connection(config.solana.rpcUrl, "confirmed");
      const transaction = await solana.requestAirdrop(
        new web3.PublicKey(address),
        2 * web3.LAMPORTS_PER_SOL,
      );
      await solana.confirmTransaction(transaction, "confirmed");
      return { chain, address, amount: "2 SOL", transaction };
    } finally {
      funding = false;
      await rm(temporary, { force: true });
    }
  };
}
