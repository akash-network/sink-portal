import { useState, useEffect } from "react";
import { type BridgeState, bridge } from "./controller";
import { Modal } from "../../components/modal";
import { isPhone, show } from "../../lib/focus";
import { cardId } from "./view-helpers";
import { TransferCard } from "./transfer-form";
import { Review } from "./review";
import { Receipt } from "./receipt";
import { Transfers } from "./transfer-history";
import { Faq } from "./faq";
import { depositBlocker, GlobalQuotaWarning, useQuota } from "./quota";

export function TransferPage({ state }: { state: BridgeState }) {
  const quota = useQuota(state.config?.network.networkKey, state.sender);
  const depositBlock = depositBlocker(quota);
  const [review, setReview] = useState(false);
  const [ack, setAck] = useState(false);
  const [ackDest, setAckDest] = useState(false);
  const [highlight, setHighlight] = useState("");
  const result = state.result;
  const overlay = review || !!result;
  const showReview = review && !result;
  useEffect(() => {
    setAck(false);
    setAckDest(false);
  }, [state.destination.text, state.sender, depositBlock]);
  useEffect(() => {
    if (!result) return;
    if (isPhone()) show("rev-h-sm", "rev-h-sm");
    else show(null, "done");
  }, [result?.txHash]);
  const openReview = () => {
    if (!state.canReview || depositBlock) return;
    setReview(true);
    setAck(false);
    setAckDest(false);
    setHighlight("");
    if (isPhone()) show("rev-h-sm", "rev-h-sm");
    else show(null, "back");
  };
  const back = () => {
    if (state.busy) return;
    setReview(false);
    setAck(false);
    setAckDest(false);
    if (isPhone()) show("xfer-h", "review-transfer");
    else show(null, "review-transfer");
  };
  const done = () => {
    if (state.busy || !result) return;
    const hash = result.txHash;
    setReview(false);
    setAck(false);
    setAckDest(false);
    bridge.finishResult();
    setHighlight(hash);
    if (isPhone()) show(cardId(hash), cardId(hash), "center");
    else
      show(
        null,
        state.destination.source === "wallet" ? "amount" : "destination",
      );
  };
  const retry = (hash: string) => {
    bridge.retry(hash);
    setReview(false);
    setHighlight("");
    show("xfer-h", "xfer-h");
  };
  const confirm = () => {
    if (!state.canReview || depositBlock || !ack || !ackDest) return;
    void bridge.transfer();
  };
  const reviewProps = {
    state,
    depositBlock,
    ack,
    ackDest,
    setAck,
    setAckDest,
    onBack: back,
    onConfirm: confirm,
  };
  return (
    <>
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-start gap-2 text-center">
        <h1 className="display h1">Move AKT to Solana</h1>
        <p className="text-left text-base leading-6 text-[var(--mfg)]">
          Send AKT from your Akash wallet to any Solana address. You’ll review
          every detail before you approve anything in your wallet.
        </p>
        <button
          type="button"
          className="lnk show-sm min-h-11"
          onClick={() => show("list-h", "list-h")}
        >
          Track a transfer
        </button>
      </div>
      <GlobalQuotaWarning quota={quota} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="mx-auto flex w-full max-w-[640px] min-w-0 flex-col">
          <TransferCard
            state={state}
            quota={quota}
            overlay={overlay}
            onReview={openReview}
          />
          {overlay && (
            <section
              className="card pad show-sm flex flex-col"
              aria-labelledby="rev-h-sm"
            >
              {showReview && <Review {...reviewProps} suffix="-sm" />}
              {result && <Receipt state={state} suffix="-sm" onDone={done} />}
            </section>
          )}
        </div>
      </div>
      <Transfers
        state={state}
        highlight={highlight}
        setHighlight={setHighlight}
        onRetry={retry}
      />
      <Faq />
      {overlay && (
        <Modal
          className="hide-sm"
          labelledBy="rev-h"
          describedBy={showReview ? "warn" : "receipt-text"}
          onEscape={() => (result ? done() : back())}
        >
          {showReview && <Review {...reviewProps} suffix="" />}
          {result && <Receipt state={state} suffix="" onDone={done} />}
        </Modal>
      )}
    </>
  );
}
