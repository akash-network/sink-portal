import { type BridgeState } from "./controller";
import { displayAmount, transferEstimate } from "./transfers";

export function Summary({
  state,
  withSend,
}: {
  state: BridgeState;
  withSend: boolean;
}) {
  const fee = state.fee === null ? "…" : displayAmount(state.fee);
  const send = state.amount === null ? "0.00" : displayAmount(state.amount);
  const total =
    state.fee === null ? "…" : displayAmount((state.amount ?? 0n) + state.fee);
  return (
    <dl className="well flex flex-col gap-2.5 p-4">
      {withSend && (
        <div className="flex justify-between gap-3">
          <dt className="muted">You send</dt>
          <dd className="mono">{send} AKT</dd>
        </div>
      )}
      <div className="flex justify-between gap-3">
        <dt className="muted">Akash network fee</dt>
        <dd id={withSend ? "fee-amount" : undefined} className="mono">
          {fee} AKT
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="muted">Total from Akash wallet</dt>
        <dd className="mono">{total} AKT</dd>
      </div>
      <div className="flex justify-between gap-3 border-t border-[var(--bd)] pt-2.5">
        <dt className="font-medium">You receive on Solana</dt>
        <dd
          id={withSend ? "receive-amount" : undefined}
          className="mono font-medium"
        >
          {send} AKT
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="muted">Estimated transfer time</dt>
        <dd>{transferEstimate}</dd>
      </div>
    </dl>
  );
}
