import { toHex } from "@cosmjs/encoding";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import {
  BroadcastTxError,
  SigningStargateClient,
  StargateClient,
} from "@cosmjs/stargate";
import { Comet38Client, HttpClient } from "@cosmjs/tendermint-rpc";
import { AuthInfo, TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import {
  DestType,
  MsgSink,
} from "@akashnetwork/chain-sdk/private-types/akash.v1";
import { akashAddress } from "./lib/id";
import {
  SINK_MSG_TYPE,
  sinkAminoTypes,
  sinkMessage,
  sinkRegistry,
} from "./lib/sink";
import type {
  BridgeConfig,
  DiscoveredSubmission,
  SavedSubmission,
  SignedSubmission,
} from "./contracts";
import {
  message,
  parseSaved,
  parseSigned,
  publicKey,
  txHash,
  uint,
} from "./model";

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
    sink.destType !== DestType.DEST_TYPE_SOLANA ||
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
  save(submission: SignedSubmission): void;
  broadcast(bytes: Uint8Array): Promise<string>;
  stage(message: string): void;
  saved(submission: SignedSubmission): void;
}
export type SubmissionResult = {
  kind: "accepted" | "ambiguous" | "rejected";
  submission: SignedSubmission;
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
  const submission: SignedSubmission = {
    version: 2,
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
      const rejected: SignedSubmission = {
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
export const STORAGE_KEY = "akt-bridge-submissions-v2";
export const LEGACY_STORAGE_KEY = "akt-bridge-submissions-v1";
function readSubmissions(
  storage: Pick<Storage, "getItem">,
  key: string,
): SavedSubmission[] {
  const stored = storage.getItem(key);
  if (stored === null) return [];
  const decoded: unknown = JSON.parse(stored);
  if (!Array.isArray(decoded) || decoded.length > 100)
    throw new Error(
      "Saved transfer history is invalid. Do not clear it before recording your transaction hashes.",
    );
  return decoded.map(parseSaved);
}
export function loadSubmissions(
  storage: Pick<Storage, "getItem">,
): SavedSubmission[] {
  return [
    ...readSubmissions(storage, STORAGE_KEY),
    ...readSubmissions(storage, LEGACY_STORAGE_KEY),
  ];
}
function sameSubmission(a: SavedSubmission, b: SavedSubmission) {
  return (
    a.networkKey === b.networkKey &&
    a.version === b.version &&
    ((a.txHash !== null && a.txHash === b.txHash) ||
      (a.transferId !== undefined && a.transferId === b.transferId))
  );
}
export function saveSubmission(
  storage: Pick<Storage, "getItem" | "setItem">,
  signed: SignedSubmission,
): void {
  let submission = parseSigned(signed);
  const existing = readSubmissions(storage, STORAGE_KEY);
  const matches = existing.filter((item) => sameSubmission(item, submission));
  for (const previous of matches) {
    if (
      previous.sender !== submission.sender ||
      previous.recipient !== submission.recipient ||
      previous.amountUakt !== submission.amountUakt
    )
      throw new Error("Saved transfer details changed");
    if (
      previous.transferId &&
      submission.transferId &&
      previous.transferId !== submission.transferId
    )
      throw new Error("Saved transfer ID changed");
    if (
      previous.txHash &&
      submission.txHash &&
      previous.txHash !== submission.txHash
    )
      throw new Error("Saved transaction hash changed");
    submission = parseSigned({
      ...previous,
      ...submission,
      transferId: submission.transferId ?? previous.transferId,
    });
  }
  const next = [
    submission,
    ...existing.filter((item) => !sameSubmission(item, submission)),
  ].slice(0, 100);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (
    !readSubmissions(storage, STORAGE_KEY).some((item) =>
      sameSubmission(item, submission),
    )
  )
    throw new Error("Could not verify saved transaction history");
}
// Discovered records stay in memory: the chain can list them again, and
// storage keeps only what this browser signed. A saved copy takes precedence.
export function mergeDiscovered(
  saved: SavedSubmission[],
  discovered: DiscoveredSubmission[],
): SavedSubmission[] {
  return [
    ...saved,
    ...discovered.filter(
      (found) => !saved.some((item) => sameSubmission(item, found)),
    ),
  ];
}
export function checkDiscovered(
  saved: SavedSubmission[],
  discovered: DiscoveredSubmission[],
): void {
  for (const found of discovered)
    for (const item of saved)
      if (
        sameSubmission(item, found) &&
        (item.sender !== found.sender ||
          item.recipient !== found.recipient ||
          item.amountUakt !== found.amountUakt)
      )
        throw new Error("History does not match a transfer saved here");
}
export async function signerAddress(signer: OfflineSigner): Promise<string> {
  const accounts = await signer.getAccounts();
  if (accounts.length !== 1 || accounts[0].algo !== "secp256k1")
    throw new Error("Select one standard Akash account in your wallet");
  return akashAddress(accounts[0].address);
}
export function comet(config: BridgeConfig): Comet38Client {
  return Comet38Client.create(
    new HttpClient(new URL(config.rpcPath, location.origin).href, 15_000),
  );
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
    throw new Error("Wallet account or Akash chain changed");
  const raw = await client.sign(
    intent.sender,
    [
      sinkMessage({
        sender: intent.sender,
        recipient: intent.recipient,
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
    throw new Error("Wallet account changed while signing");
  return raw;
}
