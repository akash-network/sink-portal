import { test as baseTest } from "@playwright/test";
import { parseReceipt } from "../../src/lib/model";
import { serveLocalUi } from "./local-ui";
import { readPortalNetwork, type PortalNetwork } from "./network";
import { testEnvConfig } from "./test-env.config";
import {
  injectWallets,
  type SolanaWalletName,
  type WalletSession,
} from "./wallet/inject-wallets";
import {
  fundedAkashWallet,
  solanaDestination,
  unfundedAkashWallet,
} from "./wallet/test-wallets";

type Options = {
  // "none" leaves the page without wallet extensions. "unfunded" connects a
  // fixed empty account; "funded" uses TEST_WALLET_MNEMONIC.
  akashWallet: "none" | "unfunded" | "funded";
  keplr: "approve" | "reject";
  solanaWallets: SolanaWalletName[];
  allowSigning: boolean;
};

type Fixtures = {
  localUi: void;
  network: PortalNetwork;
  walletSession: WalletSession | null;
  wallets: WalletSession;
  mintedTransferId: string;
};

export const test = baseTest.extend<Options & Fixtures>({
  akashWallet: ["none", { option: true }],
  keplr: ["approve", { option: true }],
  solanaWallets: [["Phantom"], { option: true }],
  allowSigning: [false, { option: true }],
  localUi: [
    async ({ page }, use) => {
      if (testEnvConfig.E2E_LOCAL_UI) await serveLocalUi(page);
      await use();
    },
    { auto: true },
  ],
  network: async ({ request }, use) => {
    await use(await readPortalNetwork(request));
  },
  mintedTransferId: async ({ request, network }, use) => {
    const id = testEnvConfig.E2E_MINTED_TRANSFER_ID;
    if (!id)
      throw new Error(
        "Set E2E_MINTED_TRANSFER_ID to a completed transfer on this testnet",
      );
    const response = await request.get(
      `/api/receipt?id=${encodeURIComponent(id)}`,
    );
    if (!response.ok())
      throw new Error(`Transfer fixture lookup returned ${response.status()}`);
    const receipt = parseReceipt(await response.json());
    if (
      receipt.kind !== "deposit" ||
      receipt.networkKey !== network.networkKey ||
      receipt.deposit.id !== id ||
      receipt.akash.status !== "minted" ||
      receipt.solana.kind !== "minted"
    )
      throw new Error(
        "Transfer fixture must be minted on both chains of this testnet",
      );
    await use(id);
  },
  walletSession: [
    async (
      { page, network, akashWallet, keplr, solanaWallets, allowSigning },
      use,
    ) => {
      if (akashWallet === "none") return use(null);
      await use(
        await injectWallets(page, {
          akash: await akashSigner(akashWallet),
          keplr,
          solanaWallets,
          solanaAddress: solanaDestination(),
          chainId: network.chainId,
          allowSigning,
        }),
      );
    },
    { auto: true },
  ],
  wallets: async ({ walletSession }, use) => {
    if (!walletSession)
      throw new Error('Select a wallet with test.use({ akashWallet: "..." })');
    await use(walletSession);
  },
});

export function akashSigner(wallet: "unfunded" | "funded") {
  const mnemonic = testEnvConfig.TEST_WALLET_MNEMONIC;
  if (wallet === "unfunded") return unfundedAkashWallet();
  if (!mnemonic)
    throw new Error("Set TEST_WALLET_MNEMONIC to use the funded wallet");
  return fundedAkashWallet(mnemonic);
}

export { expect } from "@playwright/test";
