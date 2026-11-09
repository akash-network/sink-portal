import { web3 } from "@coral-xyz/anchor";
import type { PortalConfig } from "./config";
import { bridgeConfig } from "./receipts";

export async function portalStatus(config: PortalConfig) {
  const verified = await bridgeConfig(config);
  const solana = new web3.Connection(config.solana.rpcUrl, {
    commitment: "finalized",
    disableRetryOnRateLimit: true,
    fetch: (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(12_000) }),
  });
  return {
    checkedAt: verified.checkedAt,
    ...verified.network,
    akashHeight: verified.akashHeight,
    solanaSlot: await solana.getSlot("finalized"),
    endpoints: {
      akash: `${config.origin}/rpc/akash`,
      akashRest: `${config.origin}/rest/akash`,
    },
    services: [
      { name: "Akash RPC", running: true },
      { name: "Solana RPC", running: true },
    ],
    reconciliation: null,
  };
}
