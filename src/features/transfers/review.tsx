import { TriangleAlert } from "lucide-react";
import { type BridgeState } from "./controller";
import { type StatusTone, displayAmount } from "./transfers";
import { Dot } from "./status";
import { Summary } from "./summary";

export function Review({
  state,
  suffix,
  ack,
  ackDest,
  setAck,
  setAckDest,
  onBack,
  onConfirm,
}: {
  state: BridgeState;
  suffix: string;
  ack: boolean;
  ackDest: boolean;
  setAck: (value: boolean) => void;
  setAckDest: (value: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const dest = state.destination.text.trim();
  const chunks = dest.match(/.{1,4}/g) ?? [];
  const source = state.destination.source;
  const sourceTone: StatusTone = source === "wallet" ? "success" : "progress";
  const sourceLabel =
    source === "wallet"
      ? `From your connected ${state.destination.wallet}`
      : source === "retry"
        ? "From an earlier transfer"
        : "Pasted address";
  const signing = state.busy;
  const canConfirm = state.canReview && ack && ackDest && !signing;
  const ackHint =
    !ackDest && !ack
      ? "Tick both boxes to continue."
      : !ackDest
        ? "Confirm you checked the destination address."
        : !ack
          ? "Confirm you understand the transfer is one way."
          : "";
  const error =
    state.notice?.scope === "transfer" && !signing ? state.notice.text : "";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2
          id={`rev-h${suffix}`}
          className="display text-[20px] leading-[28px]"
          tabIndex={-1}
        >
          Confirm one-way transfer
        </h2>
        <p className="display big">
          <span className="mono font-medium">
            {state.amount === null ? "0.00" : displayAmount(state.amount)}
          </span>{" "}
          AKT → Solana
        </p>
      </div>
      <div className="well flex flex-col gap-3 border border-[var(--bd)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="over">Sending to · Solana</p>
          <span className="badge">
            <Dot tone={sourceTone} />
            {sourceLabel}
          </span>
        </div>
        <p className="sr">{dest}</p>
        <p className="chunks" aria-hidden="true">
          {chunks.map((chunk, index) => (
            <span
              key={index}
              className={
                index === 0 || index === chunks.length - 1
                  ? "font-semibold text-[var(--fg)]"
                  : "font-normal text-[var(--fg2)]"
              }
            >
              {chunk}
            </span>
          ))}
        </p>
        <p className="help">
          Compare it with the address in your Solana wallet, at least the first
          and last four characters. AKT sent to the wrong address can’t be
          recovered.
        </p>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 border-t border-[var(--bd)] pt-3">
          <input
            id={`ack-dest${suffix}`}
            type="checkbox"
            className="chk"
            checked={ackDest}
            onChange={(event) => setAckDest(event.target.checked)}
            disabled={signing}
          />
          <span className="lbl">I checked this is my Solana address.</span>
        </label>
      </div>
      <dl className="flex flex-col gap-1.5">
        <dt className="over">From · Akash wallet</dt>
        <dd className="addr text-[13px] leading-[18px] text-[var(--fg2)]">
          {state.sender}
        </dd>
      </dl>
      <Summary state={state} withSend={false} />
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--bd)] p-4">
        <div className="flex items-start gap-3">
          <TriangleAlert
            className="ico mt-0.5 text-[var(--warn)]"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1">
            <p className="lbl">This transfer is one way</p>
            <p
              id={`warn${suffix}`}
              className="muted text-[13px] leading-[18px]"
            >
              AKT on Solana can’t be transferred back to Akash. Once you approve
              in Akash wallet, the transfer can’t be cancelled.
            </p>
          </div>
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 border-t border-[var(--bd)] pt-3">
          <input
            id={`ack-oneway${suffix}`}
            type="checkbox"
            className="chk"
            checked={ack}
            onChange={(event) => setAck(event.target.checked)}
            disabled={signing}
          />
          <span className="lbl">I understand this transfer is one way.</span>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <div className="duo stack-sm flex justify-end gap-2">
          <button
            id={`back${suffix}`}
            type="button"
            className="btn btn-out btn-lg"
            onClick={onBack}
            disabled={signing}
          >
            Back
          </button>
          <button
            id={`confirm-transfer${suffix}`}
            type="button"
            className="btn btn-pri btn-lg"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {signing ? "Approve in Akash wallet…" : "Confirm in Akash wallet"}
          </button>
        </div>
        {ackHint && !signing && <p className="help text-center">{ackHint}</p>}
        {signing && (
          <p className="help text-center" aria-hidden="true">
            Approve the transaction in Akash wallet.
          </p>
        )}
        {error && (
          <p
            id={`review-message${suffix}`}
            role="alert"
            className="err text-center"
          >
            {error}
          </p>
        )}
        <p className="sr" role="status">
          {signing ? "Approve the transaction in Akash wallet." : ""}
        </p>
      </div>
    </div>
  );
}
