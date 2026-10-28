import { toHex } from "@cosmjs/encoding";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import {
  BroadcastTxError,
  SigningStargateClient,
  StargateClient,
} from "@cosmjs/stargate";
import { Comet38Client, HttpClient } from "@cosmjs/tendermint-rpc";
import { AuthInfo, TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { MsgSink } from "@akashnetwork/chain-sdk/private-types/akash.v1";
import {
  SINK_MSG_TYPE,
  sinkAminoTypes,
  sinkMessage,
  sinkRegistry,
} from "./lib/sink";
import type { BridgeConfig, SavedSubmission } from "./contracts";
import {
  akashAddress,
  message,
  parseSaved,
  publicKey,
  txHash,
  uint,
} from "./model";

export interface KeplrProvider {
  experimentalSuggestChain(config: unknown): Promise<void>;
  enable(chainId: string): Promise<void>;
  getOfflineSignerAuto?(
    chainId: string,
    options?: { preferNoSetMemo: boolean; preferNoSetFee: boolean },
  ): Promise<OfflineSigner>;
  getOfflineSigner?(
    chainId: string,
    options?: { preferNoSetMemo: boolean; preferNoSetFee: boolean },
  ): OfflineSigner;
}
export const SOLANA_WALLETS = ["Phantom", "Solflare", "Backpack"] as const;
export type SolanaWalletName = (typeof SOLANA_WALLETS)[number];
// Read-only destination source. The portal only reads the public key; it never
// asks the Solana wallet to sign, so any injected provider with connect() works.
export interface SolanaProvider {
  publicKey: { toString(): string } | null;
  connect(): Promise<unknown>;
  disconnect?(): Promise<unknown>;
  on?(event: "accountChanged" | "disconnect", callback: () => void): void;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
}
declare global {
  interface Window {
    keplr?: KeplrProvider;
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    backpack?: SolanaProvider & { solana?: SolanaProvider };
  }
}
export interface Intent {
  readonly config: BridgeConfig;
  readonly sender: string;
  readonly recipient: string;
  readonly amountUakt: string;
  readonly generation: number;
  readonly expiresAt: number;
  readonly nonce: string;
  readonly origin: string;
}
export function validateSigned(raw: TxRaw, intent: Intent): Uint8Array {
  const body = TxBody.decode(raw.bodyBytes),
    auth = AuthInfo.decode(raw.authInfoBytes);
  if (
    raw.signatures.length !== 1 ||
    raw.signatures[0].length !== 64 ||
    auth.signerInfos.length !== 1 ||
    auth.tip
  )
    throw new Error("Wallet returned an unexpected signing structure");
  if (
    body.messages.length !== 1 ||
    body.messages[0].typeUrl !== SINK_MSG_TYPE ||
    body.memo !== "" ||
    body.extensionOptions.length ||
    body.nonCriticalExtensionOptions.length ||
    body.unordered ||
    body.timeoutTimestamp ||
    body.timeoutHeight !== 0n
  )
    throw new Error("Wallet changed the transfer message or memo");
  const sink = MsgSink.decode(body.messages[0].value);
  if (
    sink.sender !== intent.sender ||
    sink.destType !== 1 ||
    sink.dest !== intent.recipient ||
    sink.amount?.denom !== "uakt" ||
    sink.amount.amount !== intent.amountUakt
  )
    throw new Error(
      "Wallet changed the transfer sender, destination or amount",
    );
  const canonical = MsgSink.encode(sink).finish();
  if (
    canonical.length !== body.messages[0].value.length ||
    canonical.some((byte, index) => byte !== body.messages[0].value[index])
  )
    throw new Error("Wallet returned an unexpected transfer encoding");
  const fee = auth.fee;
  if (
    !fee ||
    fee.amount.length !== 1 ||
    fee.amount[0].denom !== "uakt" ||
    fee.amount[0].amount !== intent.config.fee.amountUakt ||
    fee.gasLimit.toString() !== intent.config.fee.gas ||
    fee.payer ||
    fee.granter
  )
    throw new Error(
      "Wallet changed the displayed fee. Keep the requested fee unchanged and try again.",
    );
  return TxRaw.encode(raw).finish();
}
export interface SubmissionAdapters {
  generation(): number;
  now(): number;
  sign(intent: Intent): Promise<TxRaw>;
  save(submission: SavedSubmission): void;
  broadcast(bytes: Uint8Array): Promise<string>;
  stage(message: string): void;
  saved(submission: SavedSubmission): void;
}
export type SubmissionResult = {
  kind: "accepted" | "ambiguous" | "rejected";
  submission: SavedSubmission;
  message: string;
};
export async function submitIntent(
  intent: Intent,
  adapter: SubmissionAdapters,
): Promise<SubmissionResult> {
  const check = () => {
    if (adapter.generation() !== intent.generation)
      throw new Error(
        "Wallet, amount or network changed. Review the transfer and sign again.",
      );
    if (adapter.now() > intent.expiresAt)
      throw new Error(
        "Transfer approval expired. Review the transfer and sign again.",
      );
  };
  check();
  adapter.stage("Approve the AKT deposit in Keplr.");
  check();
  const signed = await adapter.sign(intent);
  check();
  const bytes = validateSigned(signed, intent);
  const hash = toHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)),
    ),
  ).toUpperCase();
  check();
  const submission: SavedSubmission = {
    version: 1,
    networkKey: intent.config.network.networkKey,
    txHash: hash,
    sender: intent.sender,
    recipient: intent.recipient,
    amountUakt: intent.amountUakt,
    createdAt: new Date(adapter.now()).toISOString(),
  };
  // Storage failure must stop the operation before any bytes reach the network.
  adapter.save(submission);
  check();
  adapter.saved(submission);
  adapter.stage(
    "Submitting your deposit. The transaction hash is saved in this browser.",
  );
  try {
    const returnedHash = txHash(await adapter.broadcast(bytes));
    if (returnedHash !== hash)
      throw new Error("RPC returned a different transaction hash");
    return {
      kind: "accepted",
      submission,
      message:
        "Deposit submitted. Waiting for Akash inclusion and the Solana mint.",
    };
  } catch (error) {
    if (
      error instanceof BroadcastTxError &&
      Number.isSafeInteger(error.code) &&
      error.code > 0
    ) {
      const reason = (error.log?.trim() || message(error)).slice(0, 2000);
      const rejected: SavedSubmission = {
        ...submission,
        broadcastRejection: { code: error.code, message: reason },
      };
      let storageNotice = "";
      try {
        adapter.save(rejected);
      } catch {
        storageNotice =
          " The rejection details could not be saved; the original transaction hash remains saved.";
      }
      return {
        kind: "rejected",
        submission: rejected,
        message: `Node rejected this submission (code ${error.code}): ${reason}. A prior submission of this hash may still have been included. Check its chain receipt before another transfer.${storageNotice}`,
      };
    }
    return {
      kind: "ambiguous",
      submission,
      message: `Submission could not be confirmed: ${message(error)}. Track the saved hash before sending again.`,
    };
  }
}
export const STORAGE_KEY = "akt-bridge-submissions-v1";
export function loadSubmissions(
  storage: Pick<Storage, "getItem">,
): SavedSubmission[] {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored === null) return [];
  const decoded: unknown = JSON.parse(stored);
  if (!Array.isArray(decoded) || decoded.length > 100)
    throw new Error(
      "Saved transfer history is invalid. Do not clear it before recording your transaction hashes.",
    );
  return decoded.map(parseSaved);
}
export function saveSubmission(
  storage: Pick<Storage, "getItem" | "setItem">,
  submission: SavedSubmission,
): void {
  const existing = loadSubmissions(storage);
  const previous = existing.find(
    (item) =>
      item.txHash === submission.txHash &&
      item.networkKey === submission.networkKey,
  );
  if (
    previous &&
    (previous.sender !== submission.sender ||
      previous.recipient !== submission.recipient ||
      previous.amountUakt !== submission.amountUakt)
  )
    throw new Error("Saved transfer details changed");
  if (previous?.transferId) {
    if (submission.transferId && submission.transferId !== previous.transferId)
      throw new Error("Saved transfer ID changed");
    submission = { ...submission, transferId: previous.transferId };
  }
  const next = [
    submission,
    ...existing.filter(
      (item) =>
        item.txHash !== submission.txHash ||
        item.networkKey !== submission.networkKey,
    ),
  ].slice(0, 100);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (
    !loadSubmissions(storage).some(
      (item) =>
        item.txHash === submission.txHash &&
        item.networkKey === submission.networkKey,
    )
  )
    throw new Error("Could not verify saved transaction history");
}
export function keplrProvider(): KeplrProvider {
  const provider = window.keplr;
  if (
    !provider ||
    typeof provider.experimentalSuggestChain !== "function" ||
    typeof provider.enable !== "function" ||
    (typeof provider.getOfflineSignerAuto !== "function" &&
      typeof provider.getOfflineSigner !== "function")
  )
    throw new Error(
      "Install the Keplr browser extension, then reload this page.",
    );
  return provider;
}
export function solanaProvider(name: SolanaWalletName): SolanaProvider {
  const provider =
    name === "Phantom"
      ? window.phantom?.solana?.isPhantom
        ? window.phantom.solana
        : undefined
      : name === "Solflare"
        ? window.solflare?.isSolflare
          ? window.solflare
          : undefined
        : (window.backpack?.solana ??
          (window.backpack?.isBackpack ? window.backpack : undefined));
  if (!provider || typeof provider.connect !== "function")
    throw new Error(
      `Install the ${name} browser extension and open this page over HTTPS.`,
    );
  return provider;
}
export async function connectSolanaWallet(
  name: SolanaWalletName,
): Promise<{ provider: SolanaProvider; address: string }> {
  const provider = solanaProvider(name);
  const connected = await provider.connect();
  const reported =
    connected &&
    typeof connected === "object" &&
    "publicKey" in connected &&
    connected.publicKey
      ? connected.publicKey
      : provider.publicKey;
  let address: string;
  try {
    address = publicKey(reported?.toString(), true);
  } catch {
    throw new Error(`${name} did not share a Solana wallet address`);
  }
  if (provider.publicKey && provider.publicKey.toString() !== address)
    throw new Error(`${name} account changed during connection`);
  return { provider, address };
}
export async function getSigner(
  provider: KeplrProvider,
  chainId: string,
): Promise<OfflineSigner> {
  const options = { preferNoSetMemo: true, preferNoSetFee: true };
  if (provider.getOfflineSignerAuto)
    return provider.getOfflineSignerAuto(chainId, options);
  if (provider.getOfflineSigner)
    return provider.getOfflineSigner(chainId, options);
  throw new Error("Keplr does not expose a supported signer");
}
export async function signerAddress(signer: OfflineSigner): Promise<string> {
  const accounts = await signer.getAccounts();
  if (accounts.length !== 1 || accounts[0].algo !== "secp256k1")
    throw new Error("Select one standard Akash account in Keplr");
  return akashAddress(accounts[0].address);
}
export function comet(config: BridgeConfig): Comet38Client {
  return Comet38Client.create(
    new HttpClient(new URL(config.rpcPath, location.origin).href, 15_000),
  );
}
export async function connectKeplr(
  config: BridgeConfig,
): Promise<{ address: string; signer: OfflineSigner }> {
  const provider = keplrProvider();
  const currency = {
    coinDenom: "AKT",
    coinMinimalDenom: "uakt",
    coinDecimals: 6,
  };
  await provider.experimentalSuggestChain({
    chainId: config.network.chainId,
    chainName: "Akash Sink Private Testnet",
    rpc: new URL(config.rpcPath, location.origin).href,
    rest: new URL(config.restPath, location.origin).href,
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: "akash",
      bech32PrefixAccPub: "akashpub",
      bech32PrefixValAddr: "akashvaloper",
      bech32PrefixValPub: "akashvaloperpub",
      bech32PrefixConsAddr: "akashvalcons",
      bech32PrefixConsPub: "akashvalconspub",
    },
    currencies: [currency],
    stakeCurrency: currency,
    feeCurrencies: [
      {
        ...currency,
        gasPriceStep: { low: 0.025, average: 0.025, high: 0.025 },
      },
    ],
    features: [],
  });
  await provider.enable(config.network.chainId);
  const signer = await getSigner(provider, config.network.chainId);
  return { address: await signerAddress(signer), signer };
}
export async function readBalance(
  config: BridgeConfig,
  address: string,
): Promise<bigint> {
  const client = StargateClient.create(comet(config));
  try {
    if ((await client.getChainId()) !== config.network.chainId)
      throw new Error("Akash RPC reports a different chain");
    const balance = await client.getBalance(address, "uakt");
    if (balance.denom !== "uakt") throw new Error("Wrong balance denomination");
    return BigInt(uint(balance.amount));
  } finally {
    client.disconnect();
  }
}
export function signingClient(
  config: BridgeConfig,
  signer: OfflineSigner,
): SigningStargateClient {
  return SigningStargateClient.createWithSigner(comet(config), signer, {
    registry: sinkRegistry(),
    aminoTypes: sinkAminoTypes(),
  });
}
export async function signDeposit(
  client: SigningStargateClient,
  signer: OfflineSigner,
  intent: Intent,
): Promise<TxRaw> {
  if (
    (await signerAddress(signer)) !== intent.sender ||
    (await client.getChainId()) !== intent.config.network.chainId
  )
    throw new Error("Keplr account or Akash chain changed");
  const raw = await client.sign(
    intent.sender,
    [
      sinkMessage({
        sender: intent.sender,
        dest: intent.recipient,
        amountUakt: intent.amountUakt,
      }),
    ],
    {
      amount: [{ denom: "uakt", amount: intent.config.fee.amountUakt }],
      gas: intent.config.fee.gas,
    },
    "",
  );
  if ((await signerAddress(signer)) !== intent.sender)
    throw new Error("Keplr account changed while signing");
  return raw;
}
