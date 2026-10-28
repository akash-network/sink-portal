import {
  DirectSecp256k1HdWallet,
  DirectSecp256k1Wallet,
  type OfflineDirectSigner,
} from "@cosmjs/proto-signing";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";

// Fixed key with no funds; it can connect but never has a balance to send.
const UNFUNDED_PRIVATE_KEY = new Uint8Array(32).fill(1);
// Fixed destinations; their secrets are public, so treat minted test AKT as burned.
const SOLANA_DESTINATION_SEED = new Uint8Array(32).fill(7);
const OTHER_SOLANA_DESTINATION_SEED = new Uint8Array(32).fill(8);
// A program-derived address: valid base58, 32 bytes, never an on-curve wallet.
export const OFF_CURVE_SOLANA_ADDRESS =
  "DXCpim2BJadeBDnTf16ifrPV6cJMN7svFAAFfU7ioXRg";
// An SPL token account created from a keypair on the team testnet. It is on
// the curve, so the portal accepts it, but the mint program refuses accounts
// owned by the token program and voids the transfer, which leads to a refund.
export const VOIDED_SOLANA_ADDRESS =
  "6dE8uyHqeEagnGNuZGGBHKHDAMMTaJWCaPvW4nBHKd2g";

export function unfundedAkashWallet(): Promise<OfflineDirectSigner> {
  return DirectSecp256k1Wallet.fromKey(UNFUNDED_PRIVATE_KEY, "akash");
}

export function fundedAkashWallet(
  mnemonic: string,
): Promise<OfflineDirectSigner> {
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "akash" });
}

export function solanaDestination(): string {
  return base58.encode(ed25519.getPublicKey(SOLANA_DESTINATION_SEED));
}

export function otherSolanaDestination(): string {
  return base58.encode(ed25519.getPublicKey(OTHER_SOLANA_DESTINATION_SEED));
}
