import { parseSinkId } from "./lib/sink";
import type { BridgeConfig, BridgeReceipt, SavedSubmission } from "./contracts";
import {
  EN_AMOUNTS,
  formatAmount,
  fresh,
  receiptView,
  txHash,
  type AmountStyle,
} from "./model";

export function shortenIdentifier(value: string) {
  return value.length > 18 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
}
export function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
export function shortHash(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
// The page shows amounts in the same locale style that the amount field accepts.
let displayStyle = EN_AMOUNTS;
export function setAmountStyle(style: AmountStyle) {
  displayStyle = style;
}
// Exact base units with grouped thousands and at least two decimals.
export function displayAmount(
  value: string | bigint,
  { decimal, group }: AmountStyle = displayStyle,
) {
  const [whole, fraction = ""] = formatAmount(value).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, group)}${decimal}${fraction.padEnd(2, "0")}`;
}
// Per-transfer bounds from the Akash sink params. A zero minimum (also used
// when the node predates min_transfer) and a zero or uint64 maximum are none.
type Limits = Pick<
  BridgeConfig["limits"],
  "minTransferUakt" | "maxTransferUakt"
> &
  Partial<Pick<BridgeConfig["limits"], "maxDailyAmountPerAccountUakt">>;
const UINT64_MAX = 18_446_744_073_709_551_615n;
// Per-account UTC-day amount limit; zero, absent or uint64 means none.
function dailyLimit(limits: Limits | undefined) {
  const daily = BigInt(limits?.maxDailyAmountPerAccountUakt ?? "0");
  return daily > 0n && daily < UINT64_MAX ? daily : null;
}
export function transferBounds(limits: Limits) {
  const min = BigInt(limits.minTransferUakt),
    max = BigInt(limits.maxTransferUakt);
  return {
    min: min > 0n ? min : null,
    max: max === 0n || max === UINT64_MAX ? null : max,
  };
}
export function boundsHelp(limits: Limits | undefined) {
  const daily = dailyLimit(limits);
  const perDay =
    daily === null
      ? ""
      : ` Up to ${displayAmount(daily)} AKT per account each UTC day.`;
  return transferHelp(limits) + perDay;
}
function transferHelp(limits: Limits | undefined) {
  const { min, max } = limits
    ? transferBounds(limits)
    : { min: null, max: null };
  if (min !== null && max !== null)
    return `From ${displayAmount(min)} to ${displayAmount(max)} AKT per transfer.`;
  if (min !== null) return `At least ${displayAmount(min)} AKT per transfer.`;
  if (max !== null) return `Up to ${displayAmount(max)} AKT per transfer.`;
  return "No minimum or maximum.";
}
export function boundsAnswer(limits: Limits | undefined) {
  const { min, max } = limits
    ? transferBounds(limits)
    : { min: null, max: null };
  const rule =
    min !== null && max !== null
      ? `Each transfer must be at least ${displayAmount(min)} AKT and can be up to ${displayAmount(max)} AKT`
      : min !== null
        ? `Each transfer must be at least ${displayAmount(min)} AKT. There’s no maximum`
        : max !== null
          ? `There’s no minimum. Each transfer can be up to ${displayAmount(max)} AKT`
          : "";
  const daily = dailyLimit(limits);
  const perDay =
    daily === null
      ? ""
      : ` Each account can send up to ${displayAmount(daily)} AKT in total each UTC day.`;
  return rule
    ? `${rule}, and your Keplr balance must cover the amount plus the Akash network fee. Max fills in the most you can send after the fee.${perDay}`
    : daily === null
      ? "No. Send any amount, as long as your Keplr balance covers the amount plus the Akash network fee. Max fills in the most you can send after the fee."
      : `There’s no per-transfer minimum or maximum, and your Keplr balance must cover the amount plus the Akash network fee. Max fills in the most you can send after the fee.${perDay}`;
}
export function submittedLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  return `${date.toLocaleString("en-US", { month: "short" })} ${date.getDate()}, ${time}`;
}
export function transactionLink(hash: string, networkKey: string) {
  return `#tx/${txHash(hash)}?network=${encodeURIComponent(networkKey)}`;
}
export function recordLink(id: string, networkKey: string) {
  return `#record/${parseSinkId(id)}?network=${encodeURIComponent(networkKey)}`;
}
function routeNetwork(query: string) {
  const entries = [...new URLSearchParams(query).entries()];
  if (
    entries.length !== 1 ||
    entries[0][0] !== "network" ||
    !entries[0][1] ||
    entries[0][1].length > 2048
  )
    throw new Error("Invalid transaction network");
  return entries[0][1];
}
export function portalRoute(hash: string) {
  if (hash === "#developer") return { kind: "developer" } as const;
  const prefix = hash.startsWith("#tx/")
    ? "#tx/"
    : hash.startsWith("#record/")
      ? "#record/"
      : null;
  if (!prefix) return { kind: "transfer" } as const;
  try {
    const parts = hash.slice(prefix.length).split("?");
    if (parts.length !== 2) throw new Error("Invalid transaction link");
    const [path, query] = parts;
    const networkKey = routeNetwork(query);
    return prefix === "#tx/"
      ? ({ kind: "transaction", hash: txHash(path), networkKey } as const)
      : ({ kind: "record", id: parseSinkId(path), networkKey } as const);
  } catch {
    return { kind: "invalid" } as const;
  }
}

export interface TransferObservation {
  receipt: BridgeReceipt | null;
  error: string;
}
export function transferKey(saved: SavedSubmission) {
  return JSON.stringify([saved.networkKey, saved.txHash]);
}
export function visibleTransfers(
  submissions: SavedSubmission[],
  networkKey: string | undefined,
  sender: string | null,
) {
  return submissions
    .filter(
      (item) =>
        item.networkKey === networkKey && (!sender || item.sender === sender),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// Four user-facing steps: validation pending, validated (deposit recorded on
// Akash), transfer pending (Akash reports a mint awaiting finalized Solana
// verification) and completed (finalized Solana mint). Refunds clear the steps.
export type StatusTone =
  "progress" | "confirmed" | "success" | "error" | "attention";
export interface TransferStatus {
  label: string;
  note: string;
  step: 0 | 1 | 2 | 3 | 4;
  tone: StatusTone;
  refunded: boolean;
  retryable: boolean;
  settled: boolean;
}
// Tracker stages with their hover help. Times come from team testnet
// transfers 9 and 10, which took 1m 56s and 1m 40s from Akash deposit to
// Solana mint, plus about 15 s for Solana finality and the next refresh.
export const transferEstimate = "2–3 minutes";
export const stageGuide = [
  {
    label: "Validating",
    time: "A few seconds",
    detail: "Akash confirms your deposit and assigns a ledger ID.",
  },
  {
    label: "Validated",
    time: "About 1–2 minutes",
    detail: "Akash holds your AKT while Solana verifies your deposit.",
  },
  {
    label: "Sending",
    time: "Under 30 seconds",
    detail: "Solana mints your AKT and finalizes the transaction.",
  },
  {
    label: "Received",
    time: "",
    detail: "The AKT is in your Solana wallet.",
  },
] as const;
export const statusSteps = stageGuide.map((stage) => stage.label);
function receiptStep(receipt: BridgeReceipt | null): TransferStatus["step"] {
  if (!receipt || receipt.kind === "unknown") return 1;
  if (receipt.kind === "rejected") return 0;
  if (receipt.solana.kind === "minted") return 4;
  if (
    receipt.akash.status === "refunded" ||
    receipt.akash.status === "voided" ||
    receipt.solana.kind === "voided"
  )
    return 0;
  return receipt.akash.status === "minted" ? 3 : 2;
}
export function transferStatus(
  saved: Pick<SavedSubmission, "broadcastRejection">,
  observation: TransferObservation | undefined,
): TransferStatus {
  const receipt = observation?.receipt ?? null;
  const base = {
    step: receiptStep(receipt),
    refunded: false,
    retryable: false,
    settled: false,
  };
  if (observation?.error)
    return {
      ...base,
      label: "Update unavailable",
      tone: "attention",
      note: "We couldn’t refresh this transfer. We’ll keep trying.",
    };
  if (receipt && !fresh(receipt.checkedAt))
    return {
      ...base,
      label: "Status stale",
      tone: "attention",
      note: "This status is out of date. We’ll keep checking.",
    };
  if (receipt?.kind === "rejected")
    return {
      ...base,
      label: "Failed",
      tone: "error",
      note: "Akash rejected this deposit, so your AKT stayed in Keplr. The network fee isn’t returned.",
      retryable: true,
      settled: true,
    };
  if (!receipt || receipt.kind === "unknown")
    return saved.broadcastRejection
      ? {
          ...base,
          step: 0,
          label: "Submission rejected",
          tone: "attention",
          note: "The node rejected this submission. We’ll keep checking in case an earlier copy went through, so don’t send it again.",
        }
      : {
          ...base,
          label: "Validation pending",
          tone: "progress",
          note: "We’re checking your deposit on Akash.",
        };
  if (receiptView(receipt, saved).tone === "warning")
    return {
      ...base,
      label: "Needs review",
      tone: "attention",
      note: "This transfer needs operator review. Don’t send it again.",
    };
  if (receipt.solana.kind === "minted")
    return {
      ...base,
      label: "Completed",
      tone: "success",
      note: "AKT received on Solana.",
      settled: true,
    };
  if (receipt.akash.status === "refunded")
    return {
      ...base,
      label: "Refunded",
      tone: "error",
      note: "We couldn’t complete this transfer and returned the AKT to your Keplr wallet.",
      refunded: true,
      retryable: true,
      settled: true,
    };
  if (receipt.solana.kind === "voided" || receipt.akash.status === "voided")
    return {
      ...base,
      label: "Refund pending",
      tone: "attention",
      note: "We couldn’t complete this transfer. Your AKT returns to Keplr after the challenge window.",
    };
  if (receipt.akash.status === "minted")
    return {
      ...base,
      label: "Transfer pending",
      tone: "progress",
      note: "AKT is being minted to your Solana address.",
    };
  return {
    ...base,
    label: "Validated",
    tone: "confirmed",
    note: "Deposit confirmed. Your AKT is queued to mint on Solana.",
  };
}
