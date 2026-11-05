import { expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { KeplrClient } from "@cosmos-kit/keplr-extension";
import type { Keplr } from "@keplr-wallet/provider-extension";
import { isOfflineDirectSigner } from "@cosmjs/proto-signing";
import type { WalletClient } from "@cosmos-kit/core";
import { akashSigner } from "./wallet-session";

it.each([false, true])(
  "keeps native Keplr signing compatible with Ledger=%s",
  async (isNanoLedger) => {
    const provider = mock<Keplr>({
      getKey: async () => ({
        name: "Test account",
        algo: "secp256k1",
        pubKey: new Uint8Array(33),
        address: new Uint8Array(20),
        bech32Address: "akash1qyqszqgpqyqszqgpqyqszqgpqyqszqgp7hm4m8",
        isNanoLedger,
        isKeystone: false,
        ethereumHexAddress: "0x0000000000000000000000000000000000000000",
      }),
    });
    const signer = await akashSigner({
      client: new KeplrClient(provider),
      chainId: "akashnet-2",
      isWalletConnected: true,
    });
    expect(isOfflineDirectSigner(signer)).toBe(!isNanoLedger);
    expect("signAmino" in signer).toBe(isNanoLedger);
  },
);

it("does not obtain a signer after disconnection", async () => {
  const getOfflineSigner = vi.fn();
  await expect(
    akashSigner({
      client: mock<WalletClient>({ getOfflineSigner }),
      chainId: "akashnet-2",
      isWalletConnected: false,
    }),
  ).rejects.toThrow("Wallet disconnected");
  expect(getOfflineSigner).not.toHaveBeenCalled();
});
