import { ExternalLink, RotateCcw, Undo2, Copy } from "lucide-react";
import { useState } from "react";
import { type TransferItem, type BridgeState, bridge } from "./controller";
import {
  submissionId,
  transactionLink,
  recordLink,
  shortenIdentifier,
  displayAmount,
  shortAddress,
  submittedLabel,
  unknownDateHelp,
  unknownDateLabel,
} from "./transfers";
import { StatusBadge, MiniTracker, Tracker } from "./status";
import { useCopy } from "../../hooks/use-copy";
import { idLabel, cardId, rowId } from "./view-helpers";
import { show, isPhone } from "../../lib/focus";

function ViewLink({ item }: { item: TransferItem }) {
  const id = submissionId(item);
  const link =
    item.txHash !== null
      ? transactionLink(item.txHash, item.networkKey)
      : recordLink(item.transferId, item.networkKey);
  return (
    <a
      href={link}
      data-tx={item.txHash ?? undefined}
      title={id}
      aria-label={`View transfer ${id}`}
      className="inline-flex items-center gap-1 text-[13px]"
    >
      View <ExternalLink className="ico size-3.5" aria-hidden="true" />
    </a>
  );
}

export function Transfers({
  state,
  highlight,
  setHighlight,
  onRetry,
}: {
  state: BridgeState;
  highlight: string;
  setHighlight: (hash: string) => void;
  onRetry: (hash: string) => void;
}) {
  const [copied, copy] = useCopy();
  const [track, setTrack] = useState("");
  const [trackMsg, setTrackMsg] = useState("");
  const items = state.submissions;
  const doTrack = async () => {
    const query = track.trim();
    if (!query) return;
    setTrackMsg("Checking…");
    const found = await bridge.lookup(query);
    if (found.kind === "local") {
      const item = bridge
        .getSnapshot()
        .submissions.find((saved) => submissionId(saved) === found.id);
      setHighlight(found.id);
      setTrackMsg(item ? `${idLabel(item)} · ${item.status.label}` : "");
      show(isPhone() ? cardId(found.id) : rowId(found.id), null, "nearest");
    } else if (found.kind === "remote") {
      setHighlight("");
      setTrackMsg("");
      location.hash = found.link.slice(1);
    } else {
      setHighlight("");
      setTrackMsg(found.message);
    }
  };
  return (
    <section aria-labelledby="list-h" className="flex flex-col gap-4">
      <div className="stack-sm flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="list-h" className="display text-2xl leading-8" tabIndex={-1}>
            Your transfers
          </h2>
          <span className="help">
            {state.sender
              ? "From this browser and your Akash wallet account"
              : "Saved in this browser"}
          </span>
        </div>
        <form
          className="flex w-full max-w-[440px] flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void doTrack();
          }}
        >
          <label htmlFor="track" className="help">
            Track by ledger ID or transaction hash
          </label>
          <div className="flex gap-2">
            <input
              id="track"
              className="inp mono min-w-0"
              value={track}
              onChange={(event) => {
                setTrack(event.target.value);
                setTrackMsg("");
              }}
              enterKeyHint="search"
              placeholder="Ledger ID or tx hash"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-out h-11 flex-none">
              Track
            </button>
          </div>
        </form>
      </div>
      <p className="sr" role="status">
        {trackMsg === "Checking…" ? "" : trackMsg}
      </p>
      {trackMsg && (
        <p id="track-message" className="help" aria-hidden="true">
          {trackMsg}
        </p>
      )}
      {state.legacyHistoryCount > 0 && (
        <p role="status" className="help">
          {state.legacyHistoryCount}{" "}
          {state.legacyHistoryCount === 1
            ? "transfer from the previous bridge is"
            : "transfers from the previous bridge are"}{" "}
          preserved in this browser. Their numeric IDs belong to the original
          network.
        </p>
      )}
      {state.historyError && (
        <p role="alert" className="err">
          {state.historyError}
        </p>
      )}
      {state.discoveryError && (
        <p role="status" className="help">
          Wallet history unavailable: {state.discoveryError}
        </p>
      )}
      {state.historyTruncated && (
        <p role="status" className="help">
          Your 100 most recent transfers are listed. Track an older transfer by
          its ledger ID or transaction hash.
        </p>
      )}
      {items.length === 0 ? (
        <div id="history" className="card pad">
          <p className="muted">
            {state.discoveryBusy
              ? "Loading transfers…"
              : "No transfers yet. After you submit one, it shows here with its status."}
          </p>
        </div>
      ) : (
        <div id="history">
          <div className="card hide-sm overflow-x-auto">
            <div className="tbl" role="table" aria-label="Your transfers">
              <div role="rowgroup">
                <div className="tbl-row tbl-head" role="row">
                  <span role="columnheader">Ledger ID</span>
                  <span role="columnheader" className="num">
                    Amount
                  </span>
                  <span role="columnheader">To</span>
                  <span role="columnheader">Submitted</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">
                    <span className="sr">Actions</span>
                  </span>
                </div>
              </div>
              <div role="rowgroup">
                {items.map((item) => {
                  const key = `row-${submissionId(item)}`;
                  return (
                    <div
                      key={submissionId(item)}
                      id={rowId(submissionId(item))}
                      className={`tbl-row tbl-tr ${highlight === submissionId(item) ? "hl" : ""}`}
                      role="row"
                      tabIndex={-1}
                      data-transfer={submissionId(item)}
                    >
                      <div role="cell">
                        {item.transferId ? (
                          <button
                            type="button"
                            className="lnk"
                            onClick={() => copy(item.transferId ?? "", key)}
                            aria-label={
                              copied === key
                                ? "Ledger ID copied"
                                : `Copy ledger ID ${item.transferId}`
                            }
                          >
                            <span className="mono">
                              {copied === key
                                ? "Copied"
                                : shortenIdentifier(item.transferId)}
                            </span>
                          </button>
                        ) : (
                          <span className="muted">Assigning…</span>
                        )}
                      </div>
                      <div role="cell" className="num mono font-medium">
                        {displayAmount(item.amountUakt)} AKT
                      </div>
                      <div
                        role="cell"
                        className="mono text-[var(--fg2)]"
                        title={item.recipient}
                      >
                        {shortAddress(item.recipient)}
                      </div>
                      <div role="cell" className="muted">
                        {item.createdAt ? (
                          <time
                            dateTime={item.createdAt}
                            title={new Date(item.createdAt).toLocaleString()}
                          >
                            {submittedLabel(item.createdAt)}
                          </time>
                        ) : (
                          <span title={unknownDateHelp}>
                            {unknownDateLabel}
                          </span>
                        )}
                      </div>
                      <div role="cell">
                        <div className="flex flex-col items-start gap-1.5">
                          <StatusBadge status={item.status} />
                          {item.status.refunded ? (
                            <span className="help">
                              AKT returned to your Akash wallet
                            </span>
                          ) : item.status.tone === "error" ? (
                            <span className="help">Rejected on Akash</span>
                          ) : (
                            <MiniTracker status={item.status} />
                          )}
                        </div>
                      </div>
                      <div role="cell" className="num">
                        <div className="flex items-center justify-end gap-3">
                          {item.status.retryable && (
                            <button
                              type="button"
                              className="btn btn-out btn-sm"
                              onClick={() => onRetry(submissionId(item))}
                              disabled={state.busy}
                            >
                              <RotateCcw className="ico" aria-hidden="true" />
                              Retry Transfer
                            </button>
                          )}
                          <ViewLink item={item} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <ul className="plain show-sm flex flex-col gap-3">
            {items.map((item) => {
              const key = `card-${submissionId(item)}`;
              return (
                <li
                  key={submissionId(item)}
                  id={cardId(submissionId(item))}
                  className={`card flex flex-col gap-3.5 p-4 ${highlight === submissionId(item) ? "border-[var(--fg)]" : ""}`}
                  tabIndex={-1}
                  data-transfer-card={submissionId(item)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="mono text-base leading-6 font-medium">
                      {displayAmount(item.amountUakt)} AKT
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                  <Tracker status={item.status} />
                  {!item.status.refunded && (
                    <p className="help">{item.status.note}</p>
                  )}
                  {item.status.retryable && (
                    <div className="flex flex-col items-start gap-2.5">
                      {item.status.refunded && (
                        <p className="help flex items-start gap-1.5 text-[var(--fg2)]">
                          <Undo2 className="ico mt-px" aria-hidden="true" />
                          <span>Returned to your Akash wallet</span>
                        </p>
                      )}
                      <button
                        type="button"
                        className="btn btn-out"
                        onClick={() => onRetry(submissionId(item))}
                        disabled={state.busy}
                      >
                        <RotateCcw className="ico" aria-hidden="true" />
                        Retry Transfer
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1 border-t border-[var(--bd)] pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="over">Ledger ID</span>
                        <span className="mono text-[13px] leading-[18px] font-medium">
                          {item.transferId
                            ? shortenIdentifier(item.transferId)
                            : "Assigning…"}
                        </span>
                      </div>
                      {item.transferId && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => copy(item.transferId ?? "", key)}
                          aria-label={
                            copied === key
                              ? "Ledger ID copied"
                              : `Copy ledger ID ${item.transferId}`
                          }
                        >
                          <Copy className="ico" aria-hidden="true" />
                          {copied === key ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="help">
                        To{" "}
                        <span className="mono">
                          {shortAddress(item.recipient)}
                        </span>{" "}
                        ·{" "}
                        {item.createdAt
                          ? submittedLabel(item.createdAt)
                          : unknownDateLabel}
                      </span>
                      <ViewLink item={item} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="sr" role="status">
        {copied ? "Copied to clipboard" : ""}
      </p>
    </section>
  );
}
