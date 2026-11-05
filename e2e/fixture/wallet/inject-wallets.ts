import { JSONUint8Array } from "@keplr-wallet/provider-extension/build/uint8-array";
import { base58 } from "@scure/base";
import { toBech32 } from "@cosmjs/encoding";
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

interface SuggestedChain {
  chainId: string;
  rpc: string;
  rest: string;
}

interface WalletBindings {
  __e2eKeplrRequest(method: string, args: unknown): Promise<unknown>;
  __e2eSolanaSignRequest(): Promise<void>;
}

interface SolanaControl {
  switchAccount(address: string, bytes: number[]): void;
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
  let accountChanged = false;
  const session: WalletSession = {
    akashAddress: account.address,
    solanaAddress: options.solanaAddress,
    cosmosSignRequests: 0,
    solanaSignRequests: 0,
    suggestedChains: [],
    switchSolanaAccount: (address) =>
      page.evaluate(
        (next) => {
          (
            window as unknown as { __e2eSolana: SolanaControl }
          ).__e2eSolana.switchAccount(next.address, next.bytes);
        },
        { address, bytes: [...base58.decode(address)] },
      ),
    disconnectSolana: () =>
      page.evaluate(() => {
        (
          window as unknown as { __e2eSolana: SolanaControl }
        ).__e2eSolana.disconnect();
      }),
    changeKeplrAccount: () => {
      accountChanged = true;
      return page.evaluate(() => {
        window.dispatchEvent(new Event("keplr_keystorechange"));
      });
    },
  };

  await page.exposeFunction("__e2eSolanaSignRequest", () => {
    session.solanaSignRequests += 1;
  });
  let enabled = false;
  let suggested = false;
  await page.exposeFunction(
    "__e2eKeplrRequest",
    async (method: string, encoded: unknown) => {
      try {
        if (method === "ethereum" || method === "bitcoin")
          return JSONUint8Array.wrap({ return: [] });
        const args: unknown = JSONUint8Array.unwrap(encoded);
        if (!Array.isArray(args)) throw new Error("Invalid wallet request");
        let value: unknown;
        if (method === "ping" || method === "disable") value = undefined;
        else if (method === "experimentalSuggestChain") {
          const chain = args[0] as SuggestedChain;
          if (chain.chainId !== options.chainId)
            throw new Error("Unexpected chain");
          session.suggestedChains.push({
            chainId: chain.chainId,
            rpc: chain.rpc,
            rest: chain.rest,
          });
          suggested = true;
        } else if (method === "getKey" || method === "enable") {
          if (args[0] !== options.chainId) throw new Error("Unexpected chain");
          if (!suggested) throw new Error("Unknown chain");
          if (options.keplr === "reject") throw new Error("Request rejected");
          enabled = true;
          value = {
            name: "E2E",
            algo: account.algo,
            pubKey: account.pubkey,
            bech32Address: accountChanged
              ? toBech32("akash", new Uint8Array(20).fill(9))
              : account.address,
            isNanoLedger: false,
          };
        } else if (method === "signDirect") {
          session.cosmosSignRequests += 1;
          if (!enabled || !options.allowSigning)
            throw new Error("Request rejected");
          const [chainId, address, doc] = args as [
            string,
            string,
            {
              bodyBytes: Uint8Array;
              authInfoBytes: Uint8Array;
              chainId: string;
              accountNumber: string;
            },
          ];
          if (chainId !== options.chainId || doc.chainId !== chainId)
            throw new Error("Unexpected signing chain");
          const result = await options.akash.signDirect(address, {
            ...doc,
            accountNumber: BigInt(doc.accountNumber),
          });
          value = {
            ...result,
            signed: {
              ...result.signed,
              accountNumber: result.signed.accountNumber.toString(),
            },
          };
        } else throw new Error(`Unexpected wallet method: ${method}`);
        return JSONUint8Array.wrap({ return: value });
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
  await page.addInitScript(installProviders, {
    solanaWallets: options.solanaWallets,
    solanaAddress: options.solanaAddress,
    solanaBytes: [...base58.decode(options.solanaAddress)],
  });
  return session;
}

// Runs inside the page, so it must not reference anything from this module.
function installProviders({
  solanaWallets,
  solanaAddress,
  solanaBytes,
}: {
  solanaBytes: number[];
  solanaWallets: SolanaWalletName[];
  solanaAddress: string;
}) {
  const page = window as unknown as WalletBindings & Record<string, unknown>;
  page.keplrRequestMetaIdSupport = true;
  window.addEventListener("message", async (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const request: unknown = event.data;
    if (
      !request ||
      typeof request !== "object" ||
      !("type" in request) ||
      typeof request.type !== "string" ||
      !/^proxy-request(?:-|$)/.test(request.type) ||
      request.type === "proxy-request-response" ||
      !("id" in request) ||
      !("method" in request) ||
      typeof request.method !== "string" ||
      !("args" in request)
    )
      return;
    const result = await page.__e2eKeplrRequest(request.method, request.args);
    window.postMessage(
      { type: "proxy-request-response", id: request.id, result },
      location.origin,
    );
  });
  type Account = {
    address: string;
    publicKey: Uint8Array;
    chains: readonly string[];
    features: readonly string[];
  };
  type Listener = (value: { accounts: Account[] }) => void;
  const providers = solanaWallets.map((name) => {
    const listeners = new Set<Listener>();
    const account = (address: string, bytes: number[]): Account => {
      return {
        address,
        publicKey: Uint8Array.from(bytes),
        chains: ["solana:mainnet"],
        features: ["solana:signTransaction", "solana:signMessage"],
      };
    };
    const refuseToSign = async () => {
      await page.__e2eSolanaSignRequest();
      throw new Error("The destination wallet must never be asked to sign");
    };
    let accounts: Account[] = [];
    const update = (next: Account[]) => {
      accounts = next;
      for (const run of listeners) run({ accounts });
    };
    const wallet = {
      version: "1.0.0",
      name,
      icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
      chains: ["solana:mainnet"],
      get accounts() {
        return accounts;
      },
      features: {
        "standard:connect": {
          version: "1.0.0",
          connect: async () => {
            update([account(solanaAddress, solanaBytes)]);
            return { accounts };
          },
        },
        "standard:disconnect": {
          version: "1.0.0",
          disconnect: async () => update([]),
        },
        "standard:events": {
          version: "1.0.0",
          on: (_event: string, listener: Listener) => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
        },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: refuseToSign,
        },
        "solana:signMessage": { version: "1.0.0", signMessage: refuseToSign },
      },
    };
    const register = (api: {
      register: (...items: (typeof wallet)[]) => void;
    }) => api.register(wallet);
    window.dispatchEvent(
      new CustomEvent("wallet-standard:register-wallet", { detail: register }),
    );
    window.addEventListener("wallet-standard:app-ready", (event) =>
      register(
        (
          event as CustomEvent<{
            register: (...items: (typeof wallet)[]) => void;
          }>
        ).detail,
      ),
    );
    return {
      connected: () => accounts.length > 0,
      switchAccount: (address: string, bytes: number[]) =>
        update([account(address, bytes)]),
      disconnect: () => update([]),
    };
  });
  page.__e2eSolana = {
    switchAccount: (address: string, bytes: number[]) =>
      providers
        .filter((item) => item.connected())
        .forEach((item) => item.switchAccount(address, bytes)),
    disconnect: () =>
      providers
        .filter((item) => item.connected())
        .forEach((item) => item.disconnect()),
  };
}
