import { useEffect, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";
import type { BridgeConfig, BridgeReceipt, ReceiptLookup } from "./contracts";
import {
  api,
  fresh,
  matchReceipt,
  message,
  parseReceipt,
  receiptView,
} from "./model";
import { Modal } from "./modal";
import { StatusBadge, Tracker } from "./status";
import { displayAmount, shortHash, transferStatus } from "./transfers";

function useCopied() {
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return [
    copied,
    (value: string, key: string) => {
      navigator.clipboard?.writeText(value).catch(() => {});
      setCopied(key);
    },
  ] as const;
}

// Private transfer links read the verified receipt API. Nothing is sent to a
// public explorer, and a link cannot silently select another ledger.
export function TransferDialog({
  lookup,
  networkKey,
  config,
}: {
  lookup: ReceiptLookup;
  networkKey: string;
  config: BridgeConfig | null;
}) {
  const [result, setResult] = useState<
    | { kind: "loading" }
    | { kind: "loaded"; receipt: BridgeReceipt }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [refresh, setRefresh] = useState(0);
  const [opener] = useState(() => document.activeElement);
  const [copied, copy] = useCopied();
  const currentNetwork = config?.network.networkKey;
  const query =
    lookup.kind === "transaction" ? `tx=${lookup.hash}` : `id=${lookup.id}`;
  useEffect(() => {
    let cancelled = false,
      busy = false;
    setResult({ kind: "loading" });
    if (!currentNetwork) return;
    if (currentNetwork !== networkKey) {
      setResult({
        kind: "error",
        message: "This transaction belongs to a different testnet.",
      });
      return;
    }
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const receipt = parseReceipt(await api(`/api/receipt?${query}`));
        matchReceipt(receipt, networkKey, lookup);
        if (!fresh(receipt.checkedAt))
          throw new Error("Transaction status is stale. Try again shortly.");
        if (!cancelled) setResult({ kind: "loaded", receipt });
      } catch (error) {
        if (!cancelled) setResult({ kind: "error", message: message(error) });
      } finally {
        busy = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // The query string is the lookup's identity; the object is rebuilt per render.
  }, [query, networkKey, currentNetwork, refresh]);
  const close = () => {
    location.hash = "transfer";
    const target =
      opener instanceof HTMLElement && opener !== document.body
        ? opener
        : lookup.kind === "transaction"
          ? document.querySelector(`[data-tx="${lookup.hash}"]`)
          : null;
    setTimeout(() => {
      if (target instanceof HTMLElement && target.isConnected)
        target.focus({ preventScroll: true });
    }, 0);
  };
  const receipt = result.kind === "loaded" ? result.receipt : null;
  const view = receipt ? receiptView(receipt) : null;
  const status = receipt ? transferStatus({}, { receipt, error: "" }) : null;
  const deposit = receipt?.kind === "deposit" ? receipt : null;
  const hash =
    lookup.kind === "transaction" ? lookup.hash : (receipt?.txHash ?? null);
  const resolution =
    deposit &&
    (deposit.solana.kind === "minted" || deposit.solana.kind === "voided")
      ? deposit.solana
      : null;
  return (
    <Modal
      id="transaction-view"
      labelledBy="transaction-title"
      describedBy="transaction-status"
      onEscape={close}
      initialFocus="transaction-close"
    >
      <div className="flex flex-col gap-5">
        <h2
          id="transaction-title"
          className="display text-[20px] leading-[28px]"
        >
          Transfer details
        </h2>
        <div
          className="well flex flex-col gap-3 p-4"
          aria-live="polite"
          role="status"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="over">Status</span>
            {status && <StatusBadge status={status} />}
          </div>
          {status && <Tracker status={status} />}
          <div className="flex flex-col gap-1">
            <p id="transaction-status" className="lbl">
              {result.kind === "loading"
                ? "Checking transaction…"
                : result.kind === "error"
                  ? "Status unavailable"
                  : view?.title}
            </p>
            <p className="help">
              {result.kind === "error"
                ? result.message
                : result.kind === "loading"
                  ? "Reading the private testnet."
                  : view?.tone === "success"
                    ? deposit?.solana.kind === "minted"
                      ? "Received in your Solana wallet."
                      : "Returned to your Keplr wallet."
                    : view?.message}
            </p>
          </div>
        </div>
        {deposit && (
          <div className="well flex flex-col gap-2.5 p-4">
            <span className="over">Ledger ID</span>
            <div className="stack-sm flex items-center justify-between gap-3">
              <span className="mono text-[22px] leading-[28px] font-medium tracking-[0.02em]">
                {deposit.deposit.id}
              </span>
              <button
                type="button"
                className="btn btn-out"
                onClick={() => copy(deposit.deposit.id, "id")}
                aria-label={
                  copied === "id"
                    ? "Ledger ID copied"
                    : `Copy ledger ID ${deposit.deposit.id}`
                }
              >
                <Copy className="ico" aria-hidden="true" />
                {copied === "id" ? "Copied" : "Copy ID"}
              </button>
            </div>
          </div>
        )}
        <dl className="flex flex-col gap-3">
          {deposit && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="muted">Amount</dt>
                <dd className="mono">
                  {displayAmount(deposit.deposit.amountUakt)} AKT
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="muted">From · Keplr</dt>
                <dd className="addr text-[13px] leading-[18px] text-[var(--fg2)]">
                  {deposit.deposit.sender}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="muted">To · Solana</dt>
                <dd className="addr text-[13px] leading-[18px]">
                  {deposit.deposit.recipient}
                </dd>
              </div>
            </>
          )}
          {hash && (
            <div className="flex items-center justify-between gap-3">
              <dt className="muted">Transaction</dt>
              <dd className="flex items-center gap-1.5">
                <span className="mono" title={hash}>
                  {shortHash(hash)}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => copy(hash, "hash")}
                  aria-label={
                    copied === "hash"
                      ? "Transaction hash copied"
                      : `Copy ${hash}`
                  }
                >
                  <Copy className="ico" aria-hidden="true" />
                </button>
              </dd>
            </div>
          )}
        </dl>
        <details className="rounded-lg border border-[var(--bd)] px-4 py-3">
          <summary className="help cursor-pointer">Chain details</summary>
          <dl className="mt-3 flex flex-col gap-2 text-[13px] leading-[18px]">
            {hash && (
              <div className="flex flex-col gap-1">
                <dt className="muted">Full transaction hash</dt>
                <dd className="addr">{hash}</dd>
              </div>
            )}
            {deposit && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="muted">Akash block</dt>
                  <dd className="mono">{deposit.deposit.height}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="muted">Akash settlement</dt>
                  <dd className="mono">{deposit.akash.status}</dd>
                </div>
                {resolution && (
                  <div className="flex justify-between gap-3">
                    <dt className="muted">Solana finalized slot</dt>
                    <dd className="mono">{resolution.resolvedSlot}</dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </details>
        <p className="sr" role="status">
          {copied ? "Copied to clipboard" : ""}
        </p>
        <div className="duo stack-sm flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-out btn-lg"
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RotateCcw className="ico" aria-hidden="true" />
            Refresh status
          </button>
          <button
            id="transaction-close"
            type="button"
            className="btn btn-pri btn-lg"
            onClick={close}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
