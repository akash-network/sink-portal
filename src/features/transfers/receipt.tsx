import { TriangleAlert, Check, Copy, ExternalLink } from "lucide-react";
import { type BridgeState } from "./controller";
import {
  displayAmount,
  transferEstimate,
  shortHash,
  transactionLink,
} from "./transfers";
import { StatusBadge } from "./status";
import { useCopy } from "../../hooks/use-copy";

export function Receipt({
  state,
  suffix,
  onDone,
}: {
  state: BridgeState;
  suffix: string;
  onDone: () => void;
}) {
  const [copied, copy] = useCopy();
  const result = state.result;
  if (!result) return null;
  const item = state.submissions.find(
    (saved) => saved.txHash === result.txHash,
  );
  const amount = item ? `${displayAmount(item.amountUakt)} AKT` : "your AKT";
  const warning = result.kind === "ambiguous" || result.kind === "rejected";
  const title =
    result.kind === "ambiguous"
      ? "Checking your deposit"
      : result.kind === "rejected"
        ? "Deposit not accepted"
        : "Deposit submitted";
  const text =
    result.kind === "submitting"
      ? "Sending your deposit to Akash. Its transaction hash is already saved in this browser."
      : warning
        ? result.message
        : `Your AKT has left Akash wallet. We’ll validate the deposit, then send ${amount} to your Solana address.`;
  return (
    <div role="status" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--muted)]">
          {warning ? (
            <TriangleAlert
              className="ico text-[var(--warn)]"
              aria-hidden="true"
            />
          ) : (
            <Check className="ico text-[var(--ok)]" aria-hidden="true" />
          )}
        </span>
        <h2
          id={`rev-h${suffix}`}
          className="display text-[20px] leading-[28px]"
          tabIndex={-1}
        >
          {title}
        </h2>
        <p id={`receipt-text${suffix}`} className="muted">
          {text}
        </p>
      </div>
      <div className="well flex flex-col gap-2.5 p-4">
        <span className="over">Ledger ID</span>
        <div className="stack-sm flex items-center justify-between gap-3">
          {item?.transferId ? (
            <span
              id={`receipt-id${suffix}`}
              className="mono min-w-0 break-all text-[14px] leading-[22px] font-medium"
            >
              {item.transferId}
            </span>
          ) : (
            <span className="mono muted text-[22px] leading-[28px] font-medium tracking-[0.02em]">
              Assigning…
            </span>
          )}
          <button
            type="button"
            className="btn btn-out"
            disabled={!item?.transferId}
            onClick={() => item?.transferId && copy(item.transferId, "ledger")}
          >
            <Copy className="ico" aria-hidden="true" />
            {copied === "ledger" ? "Copied" : "Copy ID"}
          </button>
        </div>
        <p className="help">
          Save this ID. Use it to check this transfer from any browser or
          device.
        </p>
      </div>
      <dl className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="muted">Status</dt>
          <dd>{item && <StatusBadge status={item.status} />}</dd>
        </div>
        {!warning && !item?.status.settled && (
          <div className="flex justify-between gap-3">
            <dt className="muted">Estimated transfer time</dt>
            <dd>{transferEstimate}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="muted">Amount</dt>
          <dd className="mono">{item ? amount : "…"}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="muted">To</dt>
          <dd className="addr text-[13px] leading-[18px]">
            {item?.recipient ?? "…"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="muted">Transaction</dt>
          <dd className="flex items-center gap-1.5">
            <span className="mono" title={result.txHash}>
              {shortHash(result.txHash)}
            </span>
            <a
              href={transactionLink(result.txHash, result.networkKey)}
              className="inline-flex items-center gap-1 text-[13px]"
              aria-label={`View transaction ${result.txHash}`}
            >
              View
              <ExternalLink className="ico size-3.5" aria-hidden="true" />
            </a>
          </dd>
        </div>
      </dl>
      <button
        id={`done${suffix}`}
        type="button"
        className="btn btn-pri btn-lg btn-block"
        onClick={onDone}
        disabled={state.busy}
      >
        Done
      </button>
      <p className="sr" role="status">
        {copied ? "Copied to clipboard" : ""}
      </p>
    </div>
  );
}
