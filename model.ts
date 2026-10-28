import { fromBech32, toBech32 } from "@cosmjs/encoding";
import { base58 } from "@scure/base";
import { ed25519 } from "@noble/curves/ed25519";
import { parseSinkId } from "./lib/sink";
import type {
  BridgeConfig,
  BridgeReceipt,
  ReceiptLookup,
  SavedSubmission,
  SolanaReceipt,
} from "./contracts";

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid response object");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label = "value", max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max)
    throw new Error(`Invalid ${label}`);
  return value;
}
export function uint(value: unknown, label = "amount"): string {
  const result = text(value, label, 32);
  if (!/^(0|[1-9]\d*)$/.test(result)) throw new Error(`Invalid ${label}`);
  return result;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid count");
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid flag");
  return value;
}
function iso(value: unknown): string {
  const result = text(value, "timestamp", 40);
  if (
    !/^\d{4}-\d\d-\d\dT.*Z$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new Error("Invalid timestamp");
  return result;
}
export function akashAddress(value: unknown): string {
  const address = text(value, "Akash address", 90);
  const decoded = fromBech32(address, 90);
  if (
    decoded.prefix !== "akash" ||
    decoded.data.length !== 20 ||
    toBech32("akash", decoded.data) !== address
  )
    throw new Error("Invalid Akash wallet address");
  return address;
}
export function publicKey(value: unknown, wallet = false): string {
  const address = text(value, "Solana address", 44);
  const bytes = base58.decode(address);
  if (bytes.length !== 32 || base58.encode(bytes) !== address)
    throw new Error("Invalid Solana public key");
  if (wallet) {
    if (bytes.every((byte) => byte === 0))
      throw new Error("A nonzero Solana wallet is required");
    try {
      ed25519.ExtendedPoint.fromHex(bytes);
    } catch {
      throw new Error("An on-curve Solana wallet is required");
    }
  }
  return address;
}
export type DestinationCheck =
  | { state: "empty" | "incomplete" | "invalid" | "account" }
  | { state: "valid"; address: string };
// Format feedback for a pasted destination. Shorter text with valid characters
// is incomplete, not an error. A 32-byte key that is not an on-curve wallet
// (for example a token account) is rejected before review.
export function checkDestination(value: string): DestinationCheck {
  const address = value.trim();
  if (!address) return { state: "empty" };
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) return { state: "invalid" };
  if (address.length < 32) return { state: "incomplete" };
  try {
    publicKey(address);
  } catch {
    return { state: "invalid" };
  }
  try {
    return { state: "valid", address: publicKey(address, true) };
  } catch {
    return { state: "account" };
  }
}
export function txHash(value: unknown): string {
  const hash = text(value, "transaction hash", 64);
  if (!/^[a-fA-F0-9]{64}$/.test(hash))
    throw new Error("Enter a 64-character Akash transaction hash");
  return hash.toUpperCase();
}
export function parseLookup(value: string): ReceiptLookup {
  const trimmed = value.trim();
  if (/^[a-fA-F0-9]{64}$/.test(trimmed))
    return { kind: "transaction", hash: txHash(trimmed) };
  try {
    return { kind: "transfer", id: parseSinkId(trimmed) };
  } catch {
    throw new Error(
      "Enter a transfer ID or a 64-character Akash transaction hash",
    );
  }
}
export type AmountCheck =
  | { state: "empty" | "incomplete" }
  | { state: "invalid"; message: string }
  | { state: "valid"; amount: bigint };
// The decimal mark comes from the browser locale and is the only one accepted,
// so "0,125" can never be read two ways. Grouping is for display only.
export type AmountStyle = { decimal: "." | ","; group: string };
export const EN_AMOUNTS: AmountStyle = { decimal: ".", group: "," };
export function amountStyle(locale?: string): AmountStyle {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const decimal = parts.find((part) => part.type === "decimal")?.value;
    const group = parts.find((part) => part.type === "group")?.value ?? "";
    if ((decimal === "." || decimal === ",") && group !== decimal)
      return { decimal, group };
  } catch {
    /* Unknown locale. */
  }
  return EN_AMOUNTS;
}
// Check typed or pasted amount text without rewriting it. Only digits with at
// most one decimal mark and six decimals are accepted. The other mark, signs,
// exponents and other characters are errors, never guesses: a transfer cannot
// come back. A decimal mark alone and zero are incomplete input, not errors.
export function checkAmount(
  value: string,
  { decimal }: AmountStyle = EN_AMOUNTS,
): AmountCheck {
  const text = value.trim();
  if (!text) return { state: "empty" };
  const invalid = (message: string) => ({ state: "invalid", message }) as const;
  const comma = decimal === ",";
  const example = `1248${decimal}5`;
  if (text.includes(comma ? "." : ","))
    return invalid(
      comma
        ? `Use a comma for decimals and no periods or spaces, for example ${example}.`
        : `Use a period for decimals and no commas or spaces, for example ${example}.`,
    );
  if (/^[+-]/.test(text)) return invalid("Enter the amount without a sign.");
  if (!(comma ? /^\d*,?\d*$/ : /^\d*\.?\d*$/).test(text))
    return invalid(
      `Use only digits and one decimal ${comma ? "comma" : "point"}, for example ${example}.`,
    );
  const [whole, fraction = ""] = text.split(decimal);
  if (fraction.length > 6) return invalid("AKT has at most 6 decimal places.");
  if (!/\d/.test(text)) return { state: "incomplete" };
  if (whole.replace(/^0+/, "").length > 14)
    return invalid("That amount is too large.");
  const amount =
    BigInt(whole || "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (amount === 0n) return { state: "incomplete" };
  if (amount > 18_446_744_073_709_551_615n)
    return invalid("That amount is too large.");
  return { state: "valid", amount };
}
export function parseAmount(
  value: string,
  style: AmountStyle = EN_AMOUNTS,
): bigint {
  const checked = checkAmount(value, style);
  if (checked.state === "valid") return checked.amount;
  throw new Error(
    checked.state === "invalid"
      ? checked.message
      : "Enter an amount greater than 0.",
  );
}
export function formatAmount(
  amount: bigint | string,
  decimal: AmountStyle["decimal"] = ".",
): string {
  const units = BigInt(amount);
  const fraction = (units % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${units / 1_000_000n}${fraction ? `${decimal}${fraction}` : ""}`;
}
export function parseConfig(value: unknown): BridgeConfig {
  const v = record(value),
    n = record(v.network),
    f = record(v.fee),
    l = record(v.limits);
  if (
    v.version !== 1 ||
    v.denom !== "uakt" ||
    v.decimals !== 6 ||
    v.rpcPath !== "/rpc/akash" ||
    v.restPath !== "/rest/akash"
  )
    throw new Error("Unsupported network configuration");
  const network = {
    networkKey: text(n.networkKey, "network identity", 700),
    chainId: text(n.chainId, "chain ID", 128),
    akashGenesisTime: iso(n.akashGenesisTime),
    solanaGenesisHash: publicKey(n.solanaGenesisHash),
    program: publicKey(n.program),
    mint: publicKey(n.mint),
    sinkAddress: akashAddress(n.sinkAddress),
  };
  if (
    network.networkKey !==
    JSON.stringify([
      network.chainId,
      network.akashGenesisTime,
      network.solanaGenesisHash,
      network.program,
      network.mint,
      network.sinkAddress,
    ])
  )
    throw new Error("Inconsistent network identity");
  const fee = { amountUakt: uint(f.amountUakt), gas: uint(f.gas, "gas") };
  if (BigInt(fee.gas) === 0n) throw new Error("Invalid transaction gas");
  return {
    version: 1,
    checkedAt: iso(v.checkedAt),
    akashHeight: uint(v.akashHeight, "height"),
    network,
    rpcPath: "/rpc/akash",
    restPath: "/rest/akash",
    denom: "uakt",
    decimals: 6,
    fee,
    limits: {
      enabled: bool(l.enabled),
      minTransferUakt:
        l.minTransferUakt === undefined ? "0" : uint(l.minTransferUakt),
      maxTransferUakt: uint(l.maxTransferUakt),
      maxDailyPerAccount: integer(l.maxDailyPerAccount),
      maxPendingPerAccount: integer(l.maxPendingPerAccount),
      maxDailyAmountPerAccountUakt:
        l.maxDailyAmountPerAccountUakt === undefined
          ? "0"
          : uint(l.maxDailyAmountPerAccountUakt),
    },
    client: parseClient(v.client),
  };
}
function parseClient(value: unknown): BridgeConfig["client"] {
  const c = record(value);
  if (c.status !== "active" && c.status !== "expired" && c.status !== "frozen")
    throw new Error("Unknown light client status");
  if (typeof c.ageSeconds !== "number" || !Number.isSafeInteger(c.ageSeconds))
    throw new Error("Invalid light client age");
  const trustingPeriodSeconds = integer(c.trustingPeriodSeconds);
  if (trustingPeriodSeconds === 0)
    throw new Error("Invalid light client trusting period");
  return {
    status: c.status,
    latestHeight: uint(c.latestHeight, "light client height"),
    ageSeconds: c.ageSeconds,
    trustingPeriodSeconds,
  };
}
// Plain reason new transfers are blocked, or "" while Solana can verify Akash.
export function clientPause(client: BridgeConfig["client"]): string {
  return client.status === "active"
    ? ""
    : "New transfers are paused because Solana can’t verify Akash right now. An operator needs to restore it. AKT from transfers you already sent stays held on Akash until then.";
}
// Server timestamps are compared on the server's clock, not the browser's,
// which can be off by minutes. Each network configuration response sets the
// offset, so an age is the time since the server checked the chains.
let serverOffset = 0;
export function syncServerClock(checkedAt: string, receivedAt = Date.now()) {
  serverOffset = Date.parse(checkedAt) - receivedAt;
}
export function serverNow(now = Date.now()) {
  return now + serverOffset;
}
export function fresh(checkedAt: string, now = serverNow()): boolean {
  const age = now - Date.parse(checkedAt);
  return age >= -10_000 && age < 60_000;
}
function parseSolana(value: unknown): SolanaReceipt {
  const v = record(value);
  if (v.kind === "unavailable")
    return {
      kind: "unavailable",
      message: text(v.message, "Solana status", 1000),
    };
  const contextSlot = uint(v.contextSlot, "slot");
  if (v.kind === "absent") return { kind: "absent", contextSlot };
  if (v.kind !== "minted" && v.kind !== "voided")
    throw new Error("Unknown Solana receipt state");
  const resolvedSlot = uint(v.resolvedSlot, "resolved slot"),
    proofHeight = uint(v.proofHeight, "proof height");
  if (BigInt(resolvedSlot) === 0n || BigInt(resolvedSlot) > BigInt(contextSlot))
    throw new Error("Unfinalized Solana receipt");
  return { kind: v.kind, contextSlot, resolvedSlot, proofHeight };
}
export function parseReceipt(value: unknown): BridgeReceipt {
  const v = record(value);
  if (v.version !== 1) throw new Error("Unsupported receipt version");
  const base = {
    version: 1 as const,
    networkKey: text(v.networkKey, "network identity", 700),
    checkedAt: iso(v.checkedAt),
  };
  if (v.kind === "unknown")
    return { ...base, kind: "unknown", txHash: txHash(v.txHash) };
  if (v.kind === "rejected") {
    const code = integer(v.code);
    if (code === 0) throw new Error("Invalid rejected receipt");
    return {
      ...base,
      kind: "rejected",
      txHash: txHash(v.txHash),
      height: uint(v.height, "height"),
      code,
      message: text(v.message, "transaction error", 2000),
    };
  }
  if (v.kind !== "deposit") throw new Error("Unknown receipt kind");
  const d = record(v.deposit),
    a = record(v.akash);
  if (
    a.status !== "pending" &&
    a.status !== "minted" &&
    a.status !== "voided" &&
    a.status !== "refunded"
  )
    throw new Error("Unknown Akash settlement");
  if (a.hold !== "none" && a.hold !== "veto" && a.hold !== "conflict")
    throw new Error("Unknown transfer hold");
  const expectedSinkStatus =
    a.status === "pending"
      ? "transfer_pending"
      : a.status === "minted"
        ? "completed"
        : "void";
  if (a.sinkStatus !== expectedSinkStatus)
    throw new Error("Sink status disagrees with settlement");
  const deposit = {
    id: parseSinkId(d.id),
    sender: akashAddress(d.sender),
    recipient: publicKey(d.recipient),
    amountUakt: uint(d.amountUakt),
    height: uint(d.height, "deposit height"),
  };
  if (
    BigInt(deposit.id) === 0n ||
    BigInt(deposit.amountUakt) === 0n ||
    BigInt(deposit.height) === 0n
  )
    throw new Error("Invalid deposit record");
  const solana = parseSolana(v.solana);
  if (
    (solana.kind === "minted" || solana.kind === "voided") &&
    BigInt(solana.proofHeight) <= BigInt(deposit.height)
  )
    throw new Error("Solana proof predates deposit commitment");
  return {
    ...base,
    kind: "deposit",
    txHash: v.txHash === null ? null : txHash(v.txHash),
    deposit,
    solana,
    akash: {
      height: uint(a.height, "Akash height"),
      timeSeconds: uint(a.timeSeconds, "chain time"),
      status: a.status,
      sinkStatus: expectedSinkStatus,
      hold: a.hold,
      challengeEndSeconds:
        a.challengeEndSeconds === null
          ? null
          : uint(a.challengeEndSeconds, "challenge deadline"),
      refundsEnabled: bool(a.refundsEnabled),
    },
  };
}
export function parseSaved(value: unknown): SavedSubmission {
  const v = record(value);
  if (v.version !== 1) throw new Error("Unsupported saved submission");
  const amountUakt = uint(v.amountUakt);
  if (BigInt(amountUakt) === 0n) throw new Error("Invalid saved amount");
  let broadcastRejection: SavedSubmission["broadcastRejection"];
  if (v.broadcastRejection !== undefined) {
    const rejection = record(v.broadcastRejection);
    const code = integer(rejection.code);
    if (code === 0) throw new Error("Invalid broadcast rejection code");
    broadcastRejection = {
      code,
      message: text(rejection.message, "broadcast rejection", 2000),
    };
  }
  return {
    version: 1,
    networkKey: text(v.networkKey, "network identity", 700),
    txHash: txHash(v.txHash),
    sender: akashAddress(v.sender),
    // History shows any destination Akash accepted, including allowlisted
    // vaults and point encodings that the stricter form check rejects.
    recipient: publicKey(v.recipient),
    amountUakt,
    createdAt: iso(v.createdAt),
    ...(v.transferId !== undefined
      ? { transferId: parseSinkId(v.transferId) }
      : {}),
    ...(broadcastRejection ? { broadcastRejection } : {}),
  };
}
export function matchReceipt(
  receipt: BridgeReceipt,
  networkKey: string,
  lookup: ReceiptLookup,
  saved?: SavedSubmission,
): void {
  if (receipt.networkKey !== networkKey)
    throw new Error("Receipt belongs to a different network");
  if (
    lookup.kind === "transaction"
      ? receipt.txHash !== lookup.hash
      : receipt.kind !== "deposit" ||
        receipt.deposit.id !== lookup.id ||
        receipt.txHash !== null
  )
    throw new Error(
      "Receipt belongs to a different transaction or transfer ID",
    );
  if (
    saved &&
    (saved.networkKey !== networkKey ||
      (lookup.kind === "transaction"
        ? saved.txHash !== lookup.hash
        : saved.transferId !== lookup.id))
  )
    throw new Error("Saved transfer belongs to a different network");
  if (saved && receipt.kind === "deposit") {
    const d = receipt.deposit;
    if (
      d.sender !== saved.sender ||
      d.recipient !== saved.recipient ||
      d.amountUakt !== saved.amountUakt ||
      (saved.transferId !== undefined && d.id !== saved.transferId)
    )
      throw new Error(
        "Receipt does not match the signed transfer. Contact the testnet operator.",
      );
  }
}
export type ReceiptView = {
  title: string;
  message: string;
  tone: "pending" | "success" | "warning";
  steps: [string, string, string];
};
export function receiptView(
  receipt: BridgeReceipt | null,
  saved?: Pick<SavedSubmission, "broadcastRejection">,
): ReceiptView {
  if ((!receipt || receipt.kind === "unknown") && saved?.broadcastRejection) {
    const rejection = saved.broadcastRejection;
    return {
      title: "Node rejected this submission",
      message: `Code ${rejection.code}: ${rejection.message}. This describes the broadcast attempt, not a confirmed chain outcome. A prior submission of the same transaction may already be included. Its saved hash will continue to be checked.`,
      tone: "warning",
      steps: ["warning", "waiting", "waiting"],
    };
  }
  if (!receipt || receipt.kind === "unknown")
    return {
      title: "Checking your transaction",
      message:
        "This transaction is not in the current chain index yet. Inclusion is unresolved. Do not repeat the transfer while checking this hash.",
      tone: "pending",
      steps: ["active", "waiting", "waiting"],
    };
  if (receipt.kind === "rejected")
    return {
      title: "Akash rejected the transaction",
      message: `No deposit was created. ${receipt.message}`,
      tone: "warning",
      steps: ["warning", "waiting", "waiting"],
    };
  const a = receipt.akash,
    s = receipt.solana;
  const hold =
    a.hold === "none" ? "" : ` Akash has a ${a.hold} hold requiring review.`;
  if (
    (s.kind === "minted" &&
      (a.status === "voided" || a.status === "refunded")) ||
    (s.kind === "voided" && a.status === "minted")
  )
    return {
      title: "Conflicting chain outcomes",
      message:
        "Akash settlement and finalized Solana status disagree. Contact the testnet operator; do not repeat this transfer." +
        hold,
      tone: "warning",
      steps: ["complete", "warning", "warning"],
    };
  if (s.kind === "minted")
    return {
      title: "AKT received on Solana",
      message: `${formatAmount(receipt.deposit.amountUakt)} AKT minted to your destination at finalized slot ${s.resolvedSlot}.${a.status === "pending" ? " Akash reporter confirmation is still pending." : ""}${hold}`,
      tone: a.hold === "none" ? "success" : "warning",
      steps: ["complete", "complete", "complete"],
    };
  if (a.status === "refunded")
    return {
      title: "AKT refunded on Akash",
      message:
        "The original sender received the refund on Akash." +
        (s.kind === "unavailable"
          ? " Solana verification is currently unavailable."
          : "") +
        hold,
      tone: a.hold === "none" ? "success" : "warning",
      steps: [
        "complete",
        s.kind === "voided" ? "complete" : "waiting",
        "complete",
      ],
    };
  if (s.kind === "voided" || a.status === "voided") {
    const deadline =
      a.challengeEndSeconds === null
        ? " Reporter confirmation is pending."
        : ` Challenge deadline: ${new Date(Number(a.challengeEndSeconds) * 1000).toLocaleString()}. Passing this deadline does not prove a refund.`;
    return {
      title: "Transfer voided; refund pending",
      message:
        (s.kind === "voided"
          ? "Solana permanently voided this transfer."
          : "Akash reports a void; Solana verification is pending.") +
        deadline +
        (!a.refundsEnabled ? " Refund processing is paused." : "") +
        hold,
      tone: a.hold === "none" ? "pending" : "warning",
      steps: [
        "complete",
        s.kind === "voided" ? "complete" : "active",
        "waiting",
      ],
    };
  }
  return {
    title:
      a.status === "minted"
        ? "Awaiting Solana verification"
        : "Deposit confirmed on Akash",
    message:
      (a.status === "minted"
        ? "Akash reporters recorded a mint. Waiting to verify the finalized Solana account."
        : `The relayer is proving your deposit to Solana. Save transfer ID ${receipt.deposit.id} to check its progress later.`) +
      (s.kind === "unavailable"
        ? ` Solana read unavailable: ${s.message}`
        : "") +
      hold,
    tone: a.hold === "none" ? "pending" : "warning",
    steps: ["complete", "active", "waiting"],
  };
}
export interface DeveloperStatus {
  checkedAt: string;
  chainId: string;
  akashHeight: string;
  solanaSlot: string;
  solanaGenesisHash: string;
  mint: string;
  program: string;
  sinkAddress: string;
  endpoints: Record<string, string>;
  services: { name: string; running: boolean }[];
  reconciliation: { checkedAt: string; status: string } | null;
  raw: unknown;
}
export function parseStatus(value: unknown): DeveloperStatus {
  const v = record(value),
    endpoints: Record<string, string> = {};
  for (const [key, endpoint] of Object.entries(record(v.endpoints)))
    endpoints[text(key)] = text(endpoint);
  if (!Array.isArray(v.services)) throw new Error("Invalid services");
  const services = v.services.map((item) => {
    const s = record(item);
    return { name: text(s.name), running: bool(s.running) };
  });
  const report = v.reconciliation === null ? null : record(v.reconciliation);
  return {
    checkedAt: iso(v.checkedAt),
    chainId: text(v.chainId),
    akashHeight: uint(String(v.akashHeight), "height"),
    solanaSlot: uint(String(v.solanaSlot), "slot"),
    solanaGenesisHash: publicKey(v.solanaGenesisHash),
    mint: publicKey(v.mint),
    program: publicKey(v.program),
    sinkAddress: akashAddress(v.sinkAddress),
    endpoints,
    services,
    reconciliation: report
      ? { checkedAt: iso(report.checkedAt), status: text(report.status) }
      : null,
    raw: value,
  };
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}
export async function api(
  path: string,
  options?: RequestInit,
): Promise<unknown> {
  const response = await fetch(path, {
    ...options,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(text(record(body).error, "API error", 2000));
  return body;
}
