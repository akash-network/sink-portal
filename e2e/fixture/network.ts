import type { APIRequestContext } from "@playwright/test";
import { testEnvConfig } from "./test-env.config";

export interface PortalNetwork {
  chainId: string;
  networkKey: string;
  mint: string;
  program: string;
  feeUakt: bigint;
  minTransferUakt: bigint;
  depositsEnabled: boolean;
}

// Every spec starts here, so a rebuilt or different network fails before any
// wallet is connected instead of producing confusing UI failures.
export async function readPortalNetwork(
  request: APIRequestContext,
): Promise<PortalNetwork> {
  const response = await request.get("/api/config");
  if (!response.ok())
    throw new Error(`GET /api/config returned ${response.status()}`);
  const config = await response.json();
  const { chainId, networkKey, mint, program } = config.network;
  if (chainId !== testEnvConfig.E2E_CHAIN_ID)
    throw new Error(
      `Portal reports chain ${chainId}, expected ${testEnvConfig.E2E_CHAIN_ID}`,
    );
  const identity: unknown = JSON.parse(networkKey);
  if (
    !Array.isArray(identity) ||
    identity[0] !== chainId ||
    !identity.includes(mint) ||
    !identity.includes(program)
  )
    throw new Error("Portal network key does not match its chain identity");
  return {
    chainId,
    networkKey,
    mint,
    program,
    feeUakt: BigInt(config.fee.amountUakt),
    minTransferUakt: BigInt(config.limits.minTransferUakt ?? "0"),
    depositsEnabled: config.limits.enabled === true,
  };
}

export interface DiscoveredTransfer {
  transferId: string;
  txHash: string;
  amountUakt: string;
  recipient: string;
}

// The same discovery endpoint the page uses, read directly as the expectation.
export async function readWalletHistory(
  request: APIRequestContext,
  sender: string,
): Promise<DiscoveredTransfer[]> {
  const response = await request.get(
    `/api/transfers?sender=${encodeURIComponent(sender)}`,
  );
  if (!response.ok())
    throw new Error(`GET /api/transfers returned ${response.status()}`);
  return (await response.json()).transfers;
}

export async function readReceipt(request: APIRequestContext, txHash: string) {
  const response = await request.get(`/api/receipt?tx=${txHash}`);
  return response.ok() ? response.json() : null;
}

// Mirrors the portal's display: grouped thousands, at least two decimals. The
// decimal mark follows the browser locale. Comma locales group with a space
// that varies by locale and ICU version, so they only format whole AKT < 1,000.
export function formatAkt(uakt: bigint, decimal: "." | "," = "."): string {
  const whole = uakt / 1_000_000n;
  if (decimal === "," && whole >= 1_000n)
    throw new Error("Comma-locale amounts must stay below 1,000 AKT");
  const fraction = (uakt % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${decimal === "." ? whole.toLocaleString("en-US") : whole}${decimal}${fraction}`;
}
