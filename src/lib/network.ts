/** Akash mainnet chain ID. Any other chain is a private test network. */
export const MAINNET_CHAIN_ID = "akashnet-2";

export function isMainnet(chainId: string): boolean {
  return chainId === MAINNET_CHAIN_ID;
}

/** Network label shown in the UI, taken from the chain the portal verified. */
export function networkLabel(chainId: string): string {
  return isMainnet(chainId) ? "Mainnet" : "Private testnet";
}
