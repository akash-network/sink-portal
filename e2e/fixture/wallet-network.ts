import { toBech32 } from "@cosmjs/encoding";
import type { BridgeConfig } from "../../shared/contracts";
import { solanaDestination } from "./wallet/test-wallets";

export function walletNetwork(): BridgeConfig {
  const recipient = solanaDestination();
  const sinkAddress = toBech32("akash", new Uint8Array(20).fill(2));
  const chainId = "wallet-preview-1";
  const akashGenesisTime = "2026-11-05T00:00:00Z";
  return {
    version: 2,
    checkedAt: new Date().toISOString(),
    akashHeight: "300",
    network: {
      chainId,
      akashGenesisTime,
      solanaGenesisHash: recipient,
      program: recipient,
      mint: recipient,
      sinkAddress,
      networkKey: JSON.stringify([
        chainId,
        akashGenesisTime,
        recipient,
        recipient,
        recipient,
        sinkAddress,
      ]),
    },
    rpcPath: "/rpc/akash",
    restPath: "/rest/akash",
    denom: "uakt",
    decimals: 6,
    fee: { amountUakt: "12500", gas: "500000" },
    limits: {
      enabled: true,
      minTransferUakt: "1000000",
      maxTransferUakt: "100000000",
      maxEpochAmountPerAccountUakt: "1000000000",
      maxEpochAmountTotalUakt: "10000000000",
    },
    client: {
      status: "active",
      latestHeight: "299",
      ageSeconds: 5,
      trustingPeriodSeconds: 86400,
    },
  };
}
