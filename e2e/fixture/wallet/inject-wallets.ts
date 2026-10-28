import type { Page } from "@playwright/test";
import type { OfflineDirectSigner } from "@cosmjs/proto-signing";

export type SolanaWalletName = "Phantom" | "Solflare" | "Backpack";

export interface WalletSession {
  akashAddress: string;
  solanaAddress: string;
  cosmosSignRequests: number;
  solanaSignRequests: number;
  suggestedChains: { chainId: string; rpc: string; rest: string }[];
  switchSolanaAccount(address: string): Promise<void>;
  disconnectSolana(): Promise<void>;
  changeKeplrAccount(): Promise<void>;
}

interface SerializedSignDoc {
  bodyBytes: number[];
  authInfoBytes: number[];
  chainId: string;
  accountNumber: string;
}

interface SuggestedChain {
  chainId: string;
  rpc: string;
  rest: string;
}

interface WalletBindings {
  __e2eAkashAccounts(): Promise<
    { address: string; algo: string; pubkey: number[] }[]
  >;
  __e2eAkashSignDirect(
    address: string,
    doc: SerializedSignDoc,
  ): Promise<{
    signed: SerializedSignDoc;
    signature: { pub_key: { type: string; value: string }; signature: string };
  }>;
  __e2eSuggestChain(chain: SuggestedChain): Promise<void>;
  __e2eSolanaSignRequest(): Promise<void>;
}

interface SolanaControl {
  switchAccount(address: string): void;
  disconnect(): void;
}

// Replaces the Keplr and Solana wallet extensions with page-level providers.
// Keys stay in the test process; the page receives only addresses and
// signatures. This exercises real chain signatures, not extension popups.
export async function injectWallets(
  page: Page,
  options: {
    akash: OfflineDirectSigner;
    keplr: "approve" | "reject";
    solanaWallets: SolanaWalletName[];
    solanaAddress: string;
    chainId: string;
    allowSigning: boolean;
  },
): Promise<WalletSession> {
  const [account] = await options.akash.getAccounts();
  const session: WalletSession = {
    akashAddress: account.address,
    solanaAddress: options.solanaAddress,
    cosmosSignRequests: 0,
    solanaSignRequests: 0,
    suggestedChains: [],
    switchSolanaAccount: (address) =>
      page.evaluate((next) => {
        (
          window as unknown as { __e2eSolana: SolanaControl }
        ).__e2eSolana.switchAccount(next);
      }, address),
    disconnectSolana: () =>
      page.evaluate(() => {
        (
          window as unknown as { __e2eSolana: SolanaControl }
        ).__e2eSolana.disconnect();
      }),
    changeKeplrAccount: () =>
      page.evaluate(() => {
        window.dispatchEvent(new Event("keplr_keystorechange"));
      }),
  };

  await page.exposeFunction("__e2eAkashAccounts", () => [
    {
      address: account.address,
      algo: account.algo,
      pubkey: [...account.pubkey],
    },
  ]);
  await page.exposeFunction(
    "__e2eAkashSignDirect",
    async (address: string, doc: SerializedSignDoc) => {
      session.cosmosSignRequests += 1;
      // Keplr's own message when the user rejects the approval popup.
      if (!options.allowSigning) throw new Error("Request rejected");
      if (doc.chainId !== options.chainId)
        throw new Error(`Refusing to sign for chain ${doc.chainId}`);
      const { signed, signature } = await options.akash.signDirect(address, {
        bodyBytes: Uint8Array.from(doc.bodyBytes),
        authInfoBytes: Uint8Array.from(doc.authInfoBytes),
        chainId: doc.chainId,
        accountNumber: BigInt(doc.accountNumber),
      });
      return {
        signed: {
          bodyBytes: [...signed.bodyBytes],
          authInfoBytes: [...signed.authInfoBytes],
          chainId: signed.chainId,
          accountNumber: signed.accountNumber.toString(),
        },
        signature,
      };
    },
  );
  await page.exposeFunction("__e2eSuggestChain", (chain: SuggestedChain) => {
    session.suggestedChains.push(chain);
  });
  await page.exposeFunction("__e2eSolanaSignRequest", () => {
    session.solanaSignRequests += 1;
  });
  await page.addInitScript(installProviders, {
    chainId: options.chainId,
    keplr: options.keplr,
    solanaWallets: options.solanaWallets,
    solanaAddress: options.solanaAddress,
  });
  return session;
}

// Runs inside the page, so it must not reference anything from this module.
function installProviders({
  chainId,
  keplr,
  solanaWallets,
  solanaAddress,
}: {
  chainId: string;
  keplr: "approve" | "reject";
  solanaWallets: SolanaWalletName[];
  solanaAddress: string;
}) {
  const page = window as unknown as WalletBindings & Record<string, unknown>;
  const checkChain = (value: string) => {
    if (value !== chainId) throw new Error(`Unexpected chain ${value}`);
  };
  const signer = {
    getAccounts: async () =>
      (await page.__e2eAkashAccounts()).map((account) => ({
        ...account,
        pubkey: Uint8Array.from(account.pubkey),
      })),
    signDirect: async (
      address: string,
      doc: {
        bodyBytes: Uint8Array;
        authInfoBytes: Uint8Array;
        chainId: string;
        accountNumber: bigint;
      },
    ) => {
      const { signed, signature } = await page.__e2eAkashSignDirect(address, {
        bodyBytes: [...doc.bodyBytes],
        authInfoBytes: [...doc.authInfoBytes],
        chainId: doc.chainId,
        accountNumber: doc.accountNumber.toString(),
      });
      return {
        signed: {
          bodyBytes: Uint8Array.from(signed.bodyBytes),
          authInfoBytes: Uint8Array.from(signed.authInfoBytes),
          chainId: signed.chainId,
          accountNumber: BigInt(signed.accountNumber),
        },
        signature,
      };
    },
  };
  page.keplr = {
    experimentalSuggestChain: async (chain: SuggestedChain) => {
      checkChain(chain.chainId);
      await page.__e2eSuggestChain({
        chainId: chain.chainId,
        rpc: chain.rpc,
        rest: chain.rest,
      });
    },
    enable: async (value: string) => {
      checkChain(value);
      if (keplr === "reject") throw new Error("Request rejected");
    },
    getOfflineSignerAuto: async (value: string) => {
      checkChain(value);
      return signer;
    },
  };

  type Listener = () => void;
  const providers = solanaWallets.map((name) => {
    const listeners: Record<string, Listener[]> = {};
    const refuseToSign = async () => {
      await page.__e2eSolanaSignRequest();
      throw new Error("The destination wallet must never be asked to sign");
    };
    const provider = {
      isPhantom: name === "Phantom",
      isSolflare: name === "Solflare",
      isBackpack: name === "Backpack",
      publicKey: null as { toString(): string } | null,
      connect: async () => {
        const publicKey = { toString: () => solanaAddress };
        provider.publicKey = publicKey;
        return { publicKey };
      },
      disconnect: async () => {
        provider.publicKey = null;
      },
      on: (event: string, listener: Listener) => {
        (listeners[event] ??= []).push(listener);
      },
      emit: (event: string) => listeners[event]?.forEach((run) => run()),
      signMessage: refuseToSign,
      signTransaction: refuseToSign,
      signAllTransactions: refuseToSign,
    };
    if (name === "Phantom") page.phantom = { solana: provider };
    if (name === "Solflare") page.solflare = provider;
    if (name === "Backpack") page.backpack = provider;
    return provider;
  });
  const connected = () => providers.filter((provider) => provider.publicKey);
  const control: SolanaControl = {
    switchAccount: (address) =>
      connected().forEach((provider) => {
        provider.publicKey = { toString: () => address };
        provider.emit("accountChanged");
      }),
    disconnect: () =>
      connected().forEach((provider) => {
        provider.publicKey = null;
        provider.emit("disconnect");
      }),
  };
  page.__e2eSolana = control;
}
