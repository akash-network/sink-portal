import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { ChainWalletBase } from "@cosmos-kit/core";

export async function akashSigner(
  wallet: Pick<ChainWalletBase, "client" | "chainId" | "isWalletConnected">,
): Promise<OfflineSigner> {
  if (!wallet.isWalletConnected || !wallet.client.getOfflineSigner)
    throw new Error("Wallet disconnected. Connect again.");
  const account = await wallet.client.getAccount?.(wallet.chainId);
  return wallet.client.getOfflineSigner(
    wallet.chainId,
    account?.isNanoLedger ? "amino" : "direct",
  );
}

export interface AkashWalletSession {
  id: string;
  name: string;
  connect(): Promise<void>;
  getSigner(): Promise<OfflineSigner>;
  disconnect(): Promise<void>;
}
