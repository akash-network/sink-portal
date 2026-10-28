import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  LogOut,
  RotateCcw,
  TriangleAlert,
  Undo2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CopyButton } from "./identifier";
import {
  boundsAnswer,
  boundsHelp,
  displayAmount,
  portalRoute,
  shortAddress,
  shortHash,
  stageGuide,
  submittedLabel,
  transactionLink,
  transferEstimate,
  type StatusTone,
} from "./transfers";
import { TransferDialog } from "./transaction";
import { BridgeFlow } from "./bridge-flow";
import { SOLANA_WALLETS } from "./bridge";
import { bridge, type BridgeState, type TransferItem } from "./controller";
import { clientPause, fresh } from "./model";
import { Modal } from "./modal";
import { AkashLogo } from "./logo";
import { Dot, MiniTracker, StatusBadge, Tracker } from "./status";
import { applyTheme, parseTheme, readTheme, themeKey } from "./theme";

function isPhone() {
  try {
    return matchMedia("(max-width: 640px)").matches;
  } catch {
    return false;
  }
}
// Scroll and focus after React commits, skipping elements hidden at this width.
function show(
  scrollId: string | null,
  focusId: string | null,
  block = "start",
) {
  setTimeout(() => {
    const visible = (id: string | null) => {
      if (!id) return null;
      const node = document.getElementById(id);
      return node && node.getClientRects().length ? node : null;
    };
    visible(scrollId)?.scrollIntoView({
      behavior: "smooth",
      block: block as ScrollLogicalPosition,
    });
    visible(focusId)?.focus({ preventScroll: true });
  }, 60);
}
function useCopy() {
  const [copied, setCopied] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    copied,
    (value: string, key: string) => {
      navigator.clipboard?.writeText(value).catch(() => {});
      setCopied(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(""), 1600);
    },
  ] as const;
}
function rowId(hash: string) {
  return `tr-${hash}`;
}
function cardId(hash: string) {
  return `tc-${hash}`;
}
function idLabel(item: TransferItem) {
  return item.transferId ?? shortHash(item.txHash);
}

function ThemeControl() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    applyTheme(theme);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(theme);
    const sync = (event: StorageEvent) => {
      if (event.key === themeKey) setTheme(parseTheme(event.newValue));
    };
    media.addEventListener("change", update);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", sync);
    };
  }, [theme]);
  return (
    <>
      <label htmlFor="theme-mode" className="sr">
        Color theme
      </label>
      <select
        id="theme-mode"
        className="sel"
        value={theme}
        onChange={(event) => {
          const next = parseTheme(event.target.value);
          setTheme(next);
          try {
            localStorage.setItem(themeKey, next);
          } catch {
            /* Theme still works without persistence. */
          }
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </>
  );
}

function Header({ state }: { state: BridgeState }) {
  return (
    <header className="border-b border-[var(--bd)] bg-[var(--card)]">
      <div className="wrap flex min-h-16 items-center justify-between gap-3">
        <a href="#transfer" aria-label="Akash Sink" className="rounded-sm">
          <AkashLogo />
        </a>
        {state.sender ? (
          <div className="flex min-w-0 items-center gap-1">
            <span className="badge h-8 gap-2 px-2.5">
              <span className="dot tone-success" aria-hidden="true" />
              <span className="mono" title={state.sender}>
                {`${state.sender.slice(0, 8)}…${state.sender.slice(-4)}`}
              </span>
              <span className="hide-sm mono text-[var(--mfg)]">
                {state.balance === null
                  ? "Loading…"
                  : `${displayAmount(state.balance)} AKT`}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={bridge.disconnectAkash}
              disabled={state.busy}
              aria-label="Disconnect Keplr"
            >
              <LogOut className="ico" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            id="connect-keplr"
            type="button"
            className="btn btn-pri"
            onClick={() => void bridge.connectAkash()}
            disabled={!state.canConnect}
          >
            <Wallet className="ico" aria-hidden="true" />
            {state.akashConnecting ? "Connecting…" : "Connect Keplr"}
          </button>
        )}
      </div>
    </header>
  );
}

function Notice({
  state,
  scope,
  id = "wallet-message",
}: {
  state: BridgeState;
  scope: "akash" | "solana";
  id?: string;
}) {
  const notice = state.notice;
  if (!notice || notice.scope !== scope) return null;
  return (
    <p
      id={id}
      role={notice.tone === "error" ? "alert" : "status"}
      className={notice.tone === "error" ? "err" : "help"}
    >
      {notice.text}
    </p>
  );
}

function IconTile() {
  return (
    <span className="flex size-10 flex-none items-center justify-center rounded-lg border border-[var(--bd)] bg-[var(--card)]">
      <Wallet className="ico" aria-hidden="true" />
    </span>
  );
}

function Summary({
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
        <dt className="muted">Total from Keplr</dt>
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

function Destination({
  state,
  formOff,
}: {
  state: BridgeState;
  formOff: boolean;
}) {
  const [picker, setPicker] = useState(false);
  const pasteRef = useRef<HTMLInputElement>(null);
  const { destination } = state;
  const check = destination.check;
  const wallet = destination.source === "wallet" ? destination.wallet : null;
  const bad = check.state === "invalid" || check.state === "account";
  useEffect(() => {
    if (state.solanaConnecting) setPicker(false);
  }, [state.solanaConnecting]);
  return (
    <div className="flex flex-col gap-2">
      <span className="over">To · Solana</span>
      {wallet ? (
        <div className="well flex flex-col gap-1.5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="dot tone-success" aria-hidden="true" />
              <span className="over">{wallet} connected · read-only</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={bridge.disconnectSolana}
              disabled={formOff}
              aria-label={`Disconnect ${wallet}`}
            >
              Disconnect
            </button>
          </div>
          <span
            id="solana-account"
            title={destination.text}
            className="addr text-[13px] leading-[18px] text-[var(--fg2)]"
          >
            {destination.text}
          </span>
          <span className="help">
            We only read this address. You won’t sign anything in {wallet}.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="well stack-sm flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <IconTile />
              <div className="flex min-w-0 flex-col">
                <span className="lbl">Connect your Solana wallet</span>
                <span className="help">
                  Fills in your address, so there’s nothing to mistype.
                  Read-only. You won’t sign anything.
                </span>
              </div>
            </div>
            <button
              id="connect-solana"
              type="button"
              className="btn btn-out"
              onClick={() => setPicker((open) => !open)}
              disabled={
                formOff || !state.canConnect || !!state.solanaConnecting
              }
              aria-expanded={picker}
            >
              {state.solanaConnecting ? "Connecting…" : "Connect Wallet"}
            </button>
          </div>
          {picker && !state.solanaConnecting && (
            <div
              className="card flex flex-col gap-0.5 p-1.5"
              role="group"
              aria-label="Choose a Solana wallet"
            >
              {SOLANA_WALLETS.map((name) => (
                <button
                  key={name}
                  id={`connect-${name.toLowerCase()}`}
                  type="button"
                  className="btn btn-ghost opt"
                  onClick={() => {
                    setPicker(false);
                    void bridge.connectSolana(name);
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <Wallet className="ico" aria-hidden="true" />
                    {name}
                  </span>
                  <ChevronRight
                    className="ico text-[var(--mfg)]"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 pt-1" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--bd)]" />
            <span className="help">or</span>
            <span className="h-px flex-1 bg-[var(--bd)]" />
          </div>
          <label
            className="lbl text-[13px] leading-[18px]"
            htmlFor="destination"
          >
            Paste a Solana address
          </label>
          <div className="relative">
            <input
              ref={pasteRef}
              id="destination"
              className={`inp mono pr-[88px] ${bad ? "bad" : ""}`}
              value={destination.text}
              onChange={(event) => bridge.setDestination(event.target.value)}
              placeholder="Solana address"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={formOff}
              aria-invalid={bad}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm absolute top-1/2 right-0.5 -translate-y-1/2"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text.trim()) bridge.setDestination(text.trim());
                } catch {
                  pasteRef.current?.focus();
                }
              }}
              disabled={formOff}
            >
              Paste
            </button>
          </div>
          {check.state === "invalid" && (
            <p className="err" role="alert">
              That isn’t a valid Solana address. Solana addresses are 32–44
              characters and never use 0, O, I or l.
            </p>
          )}
          {check.state === "account" && (
            <p className="err" role="alert">
              That isn’t a wallet address. Paste the address of your Solana
              wallet, not a token account.
            </p>
          )}
          {check.state === "valid" && (
            <p className="help flex items-start gap-1.5 text-[var(--fg2)]">
              <Check
                className="ico mt-px text-[var(--ok)]"
                aria-hidden="true"
              />
              <span>
                Valid Solana address. You’ll check it once more before you
                confirm.
              </span>
            </p>
          )}
          {check.state === "empty" && (
            <p className="help">
              For a hardware wallet, or a wallet on another device.
            </p>
          )}
        </div>
      )}
      <Notice state={state} scope="solana" />
    </div>
  );
}

function Amount({ state, formOff }: { state: BridgeState; formOff: boolean }) {
  const fee = state.fee === null ? "…" : displayAmount(state.fee);
  const max = displayAmount(state.maxAmount);
  const bad = state.over || Boolean(state.amountError);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="over" htmlFor="amount">
          Amount
        </label>
        <span className="help">
          Balance{" "}
          <span id="balance" className="mono">
            {!state.sender
              ? "Not connected"
              : state.balance === null
                ? "Loading…"
                : `${displayAmount(state.balance)} AKT`}
          </span>
        </span>
      </div>
      <div className="relative">
        <input
          id="amount"
          className={`inp mono h-14 pr-[124px] text-2xl ${bad ? "bad" : ""}`}
          inputMode="decimal"
          autoComplete="off"
          value={state.amountText}
          onChange={(event) => bridge.setAmount(event.target.value)}
          placeholder={`0${state.decimalMark}00`}
          disabled={formOff}
          aria-invalid={bad}
          aria-describedby={state.amountError ? "amount-error" : undefined}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2">
          <span className="mono font-medium">AKT</span>
          <button
            id="max-amount"
            type="button"
            className="btn btn-out btn-sm"
            onClick={bridge.setMax}
            disabled={formOff || state.maxAmount === 0n}
          >
            Max
          </button>
        </div>
      </div>
      {state.amountError ? (
        <p id="amount-error" className="err" role="alert">
          {state.amountError}
        </p>
      ) : state.over && state.amount !== null && state.fee !== null ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="err">
            Not enough AKT. This transfer needs{" "}
            {displayAmount(state.amount + state.fee)} AKT with the network fee,
            and your balance is {displayAmount(state.balance ?? 0n)} AKT.
          </p>
          {state.maxAmount > 0n && (
            <button
              type="button"
              className="btn btn-out btn-wrap"
              onClick={bridge.setMax}
            >
              Send the max instead · {max} AKT
            </button>
          )}
        </div>
      ) : (
        <p className="help">
          {boundsHelp(state.config?.limits)} Max leaves room for the {fee} AKT
          network fee.
        </p>
      )}
    </div>
  );
}

function TransferCard({
  state,
  overlay,
  onReview,
}: {
  state: BridgeState;
  overlay: boolean;
  onReview: () => void;
}) {
  const [copied, copy] = useCopy();
  const formOff = !state.sender || overlay || state.busy;
  const general =
    state.notice &&
    (state.notice.scope === "general" ||
      (state.notice.scope === "transfer" && !overlay))
      ? state.notice
      : null;
  return (
    <section
      className={`card pad flex flex-col gap-5 ${overlay ? "hide-sm" : ""}`}
      aria-labelledby="xfer-h"
    >
      <form
        id="transfer-form"
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (state.canReview && !overlay) onReview();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="xfer-h"
            className="display text-[20px] leading-[28px]"
            tabIndex={-1}
          >
            Transfer AKT
          </h2>
          <span className="badge mono">1 AKT = 1 AKT</span>
        </div>
        {!state.secure && (
          <p
            id="secure-notice"
            role="alert"
            className="well px-4 py-3 text-[13px] leading-[18px]"
          >
            Wallet connections require HTTPS.
          </p>
        )}
        {state.config && clientPause(state.config.client) && (
          <p
            id="client-notice"
            role="status"
            className="well flex items-start gap-2.5 px-4 py-3"
          >
            <TriangleAlert
              className="ico mt-0.5 text-[var(--warn)]"
              aria-hidden="true"
            />
            <span className="text-[13px] leading-[18px]">
              {clientPause(state.config.client)}
            </span>
          </p>
        )}
        {general && (
          <p
            id="wallet-message"
            role={general.tone === "error" ? "alert" : "status"}
            className="well flex items-start gap-2.5 px-4 py-3"
          >
            <Info className="ico mt-0.5" aria-hidden="true" />
            <span className="text-[13px] leading-[18px]">{general.text}</span>
          </p>
        )}
        {state.retryOf && (
          <div
            className="well flex items-start gap-2.5 px-4 py-3"
            role="status"
          >
            <RotateCcw className="ico mt-0.5" aria-hidden="true" />
            <p className="text-[13px] leading-[18px]">
              Retrying {state.retryOf}. We filled in the amount and address.
              Check both, then review the transfer again.
            </p>
          </div>
        )}
        {state.sender ? (
          <div className="well flex flex-col gap-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="dot tone-success" aria-hidden="true" />
                <span className="over">Keplr connected</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => state.sender && copy(state.sender, "addr")}
                aria-label={
                  copied === "addr"
                    ? "Akash address copied"
                    : "Copy Akash address"
                }
              >
                <Copy className="ico" aria-hidden="true" />
                {copied === "addr" ? "Copied" : "Copy"}
              </button>
            </div>
            <span
              id="akash-account"
              title={state.sender}
              className="addr text-[13px] leading-[18px] text-[var(--fg2)]"
            >
              {state.sender}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="well stack-sm flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <IconTile />
                <div className="flex min-w-0 flex-col">
                  <span className="lbl">Connect Keplr to start</span>
                  <span className="help">
                    You send AKT from your Keplr wallet on Akash.
                  </span>
                </div>
              </div>
              <button
                id="connect-keplr-form"
                type="button"
                className="btn btn-pri"
                onClick={() => void bridge.connectAkash()}
                disabled={!state.canConnect}
              >
                {state.akashConnecting ? "Connecting…" : "Connect Keplr"}
              </button>
            </div>
            <Notice state={state} scope="akash" />
          </div>
        )}
        <Destination state={state} formOff={formOff} />
        <Amount state={state} formOff={formOff} />
        <Summary state={state} withSend />
        <div className="flex flex-col gap-2">
          <button
            id="review-transfer"
            type="submit"
            className="btn btn-pri btn-lg btn-block"
            disabled={!state.canReview || overlay}
          >
            Review Transfer
            <ArrowRight className="ico" aria-hidden="true" />
          </button>
          {!state.canReview && state.blocker && (
            <p id="review-blocker" className="help text-center">
              {state.blocker}
            </p>
          )}
        </div>
        <p className="help flex items-start gap-2 border-t border-[var(--bd)] pt-4">
          <Info className="ico mt-px" aria-hidden="true" />
          <span>
            Next, you’ll check the destination address and confirm the one-way
            transfer before anything is signed.
          </span>
        </p>
      </form>
      <p className="sr" role="status">
        {copied ? "Copied to clipboard" : ""}
      </p>
    </section>
  );
}

function Review({
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
        <dt className="over">From · Keplr</dt>
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
              in Keplr, the transfer can’t be cancelled.
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
            {signing ? "Approve in Keplr…" : "Confirm in Keplr"}
          </button>
        </div>
        {ackHint && !signing && <p className="help text-center">{ackHint}</p>}
        {signing && (
          <p className="help text-center" aria-hidden="true">
            Approve the transaction in Keplr.
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
          {signing ? "Approve the transaction in Keplr." : ""}
        </p>
      </div>
    </div>
  );
}

function Receipt({
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
        : `Your AKT has left Keplr. We’ll validate the deposit, then send ${amount} to your Solana address.`;
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
              className="mono text-[22px] leading-[28px] font-medium tracking-[0.02em]"
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

function ViewLink({ item }: { item: TransferItem }) {
  return (
    <a
      href={transactionLink(item.txHash, item.networkKey)}
      data-tx={item.txHash}
      title={item.txHash}
      aria-label={`View transaction ${item.txHash}`}
      className="inline-flex items-center gap-1 text-[13px]"
    >
      View
      <ExternalLink className="ico size-3.5" aria-hidden="true" />
    </a>
  );
}

function Transfers({
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
        .submissions.find((saved) => saved.txHash === found.txHash);
      setHighlight(found.txHash);
      setTrackMsg(item ? `${idLabel(item)} · ${item.status.label}` : "");
      show(
        isPhone() ? cardId(found.txHash) : rowId(found.txHash),
        null,
        "nearest",
      );
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
          <span className="help">Saved in this browser</span>
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
                  const key = `row-${item.txHash}`;
                  return (
                    <div
                      key={item.txHash}
                      id={rowId(item.txHash)}
                      className={`tbl-row tbl-tr ${highlight === item.txHash ? "hl" : ""}`}
                      role="row"
                      tabIndex={-1}
                      data-transfer={item.txHash}
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
                              {copied === key ? "Copied" : item.transferId}
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
                        <time
                          dateTime={item.createdAt}
                          title={new Date(item.createdAt).toLocaleString()}
                        >
                          {submittedLabel(item.createdAt)}
                        </time>
                      </div>
                      <div role="cell">
                        <div className="flex flex-col items-start gap-1.5">
                          <StatusBadge status={item.status} />
                          {item.status.refunded ? (
                            <span className="help">
                              AKT returned to your Keplr wallet
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
                              onClick={() => onRetry(item.txHash)}
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
              const key = `card-${item.txHash}`;
              return (
                <li
                  key={item.txHash}
                  id={cardId(item.txHash)}
                  className={`card flex flex-col gap-3.5 p-4 ${highlight === item.txHash ? "border-[var(--fg)]" : ""}`}
                  tabIndex={-1}
                  data-transfer-card={item.txHash}
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
                          <span>Returned to your Keplr wallet</span>
                        </p>
                      )}
                      <button
                        type="button"
                        className="btn btn-out"
                        onClick={() => onRetry(item.txHash)}
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
                          {item.transferId ?? "Assigning…"}
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
                        · {submittedLabel(item.createdAt)}
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

function Faq({ state }: { state: BridgeState }) {
  const [open, setOpen] = useState(0);
  const items = [
    {
      q: "Can I move AKT from Solana back to Akash?",
      a: "No. Akash Sink only moves AKT from Akash to Solana. Once AKT arrives on Solana, it can’t be transferred back through Akash Sink.",
    },
    {
      q: "How long does a transfer take?",
      a: (
        <>
          <p>
            Estimated transfer time: {transferEstimate}. You can close this page
            and the transfer keeps going. Each transfer moves through four
            stages:
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {stageGuide.map((stage) => (
              <li key={stage.label}>
                <span className="font-medium text-[var(--fg)]">
                  {stage.label}
                </span>
                {stage.time && ` · ${stage.time}`}: {stage.detail}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      q: "Which Solana wallets can I send to?",
      a: "Connect Phantom, Solflare or Backpack and we fill in your address for you. The connection is read-only: you never sign anything in your Solana wallet. For a hardware wallet or a wallet on another device, paste the address instead.",
    },
    {
      q: "Do I need SOL to receive AKT?",
      a: "No. You don’t need SOL in your Solana wallet to receive AKT.",
    },
    {
      q: "Is there a minimum or maximum amount?",
      a: boundsAnswer(state.config?.limits),
    },
    {
      q: "What does Refunded mean?",
      a: "If transfer cannot be completed (Solana voids the transfer), your AKT will be returned back to your wallet. The Akash network fee isn’t returned. You can retry it from Your transfers.",
    },
    {
      q: "I lost my ledger ID. How do I find my transfer?",
      a: "Transfers you start in this browser are listed under Your transfers. On another device, connect the same Keplr account, or track it with the transaction hash from your Keplr activity.",
    },
  ];
  return (
    <section aria-labelledby="faq-h" className="flex flex-col gap-2">
      <h2 id="faq-h" className="display text-2xl leading-8">
        Questions
      </h2>
      <div className="faq-grid">
        {items.map((item, index) => (
          <div key={item.q} className="border-b border-[var(--bd)]">
            <button
              type="button"
              className="faq-q"
              onClick={() => setOpen(open === index ? -1 : index)}
              aria-expanded={open === index}
            >
              <span>{item.q}</span>
              <ChevronDown
                className={`ico text-[var(--mfg)] transition-transform duration-150 ${open === index ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {open === index && (
              <div className="muted pb-4 leading-[22px]">{item.a}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function TransferPage({ state }: { state: BridgeState }) {
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
  }, [state.destination.text, state.sender]);
  useEffect(() => {
    if (!result) return;
    if (isPhone()) show("rev-h-sm", "rev-h-sm");
    else show(null, "done");
  }, [result?.txHash]);
  const openReview = () => {
    if (!state.canReview) return;
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
    if (!state.canReview || !ack || !ackDest) return;
    void bridge.transfer();
  };
  const reviewProps = {
    state,
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
          Send AKT from your Keplr wallet to any Solana address. You’ll review
          every detail before you approve anything in Keplr.
        </p>
        <button
          type="button"
          className="lnk show-sm min-h-11"
          onClick={() => show("list-h", "list-h")}
        >
          Track a transfer
        </button>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="mx-auto flex w-full max-w-[640px] min-w-0 flex-col">
          <TransferCard state={state} overlay={overlay} onReview={openReview} />
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
      <Faq state={state} />
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

function Definitions({ id, rows }: { id?: string; rows: [string, string][] }) {
  return (
    <dl id={id} className="divide-y text-sm">
      {rows.map(([name, value]) => (
        <div
          key={name}
          className="grid min-w-0 gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4"
        >
          <dt className="pt-1.5 text-muted-foreground">{name}</dt>
          <dd className="flex min-w-0 items-start gap-2">
            <code className="min-w-0 flex-1 pt-1.5 font-mono text-xs leading-5 wrap-anywhere">
              {value}
            </code>
            <CopyButton value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Panel({
  title,
  children,
  action,
  id,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <Card id={id} className="min-w-0 gap-4 rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Developer({ state }: { state: BridgeState }) {
  const status = state.status;
  const rows: [string, string][] = status
    ? [
        ["Chain ID", status.chainId],
        ["AKT mint address", status.mint],
        ["Solana program address", status.program],
        ["Akash sink", status.sinkAddress],
        ["Solana genesis", status.solanaGenesisHash],
        ...Object.entries(status.endpoints),
      ]
    : [];
  if (state.config && state.secure)
    rows.push(
      ["Wallet RPC", new URL(state.config.rpcPath, location.origin).href],
      ["Wallet REST", new URL(state.config.restPath, location.origin).href],
    );
  const command = status
    ? [
        "akash tx sink deposit <SOLANA_PUBLIC_KEY> 1000000uakt",
        "  --dest-type 1 --from <KEY>",
        `  --chain-id ${status.chainId}`,
        `  --node ${status.endpoints.akash}`,
        `  --fees ${state.config?.fee.amountUakt ?? "12500"}uakt --gas ${state.config?.fee.gas ?? "500000"}`,
      ].join(" \\\n")
    : "Loading…";
  const count =
    status?.services.filter((service) => service.running).length ?? 0;
  return (
    <div className="space-y-6">
      <BridgeFlow />
      <Panel
        title="Network"
        action={<Badge variant="outline">Private testnet</Badge>}
      >
        <p
          id="state"
          role="status"
          className="mb-4 text-sm text-muted-foreground"
        >
          {state.statusError ||
            (status
              ? `Akash block ${status.akashHeight} · Solana finalized slot ${status.solanaSlot} · ${count}/${status.services.length} services · Supply: ${status.reconciliation && fresh(status.reconciliation.checkedAt) ? status.reconciliation.status : "unavailable"}`
              : "Connecting…")}
        </p>
        <Definitions id="endpoints" rows={rows} />
        <details className="mt-4 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">
            Service status &amp; supply reconciliation
          </summary>
          <pre
            id="details"
            className="mt-4 max-h-96 overflow-auto font-mono text-xs"
          >
            {status ? JSON.stringify(status.raw, null, 2) : "Loading…"}
          </pre>
        </details>
      </Panel>
      <div>
        <Panel title="CLI deposit" action={<CopyButton value={command} />}>
          <pre
            id="deposit"
            className="rounded-lg bg-muted p-4 font-mono text-xs leading-6 whitespace-pre-wrap wrap-anywhere"
          >
            {command}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            1 AKT = 1,000,000 uakt
          </p>
          <Label className="mt-5 mb-2">Query a record</Label>
          <code className="font-mono text-xs wrap-anywhere">
            akash query sink record &lt;id&gt;
          </code>
        </Panel>
      </div>
      <a
        href="https://github.com/akash-network/sink-portal"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium underline"
      >
        Repository
        <ExternalLink className="ico size-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

function App() {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [hash, setHash] = useState(location.hash);
  const route = portalRoute(hash);
  const developer = route.kind === "developer";
  useEffect(() => bridge.start(), []);
  useEffect(() => {
    const sync = () => setHash(location.hash);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return (
    <div className="ab flex min-h-screen flex-col">
      <Header state={state} />
      <main className="wrap sec gap-lg flex grow flex-col">
        <div
          id="transfer-view"
          className="gap-lg flex flex-col"
          hidden={developer}
        >
          {route.kind === "invalid" && (
            <p role="alert" className="well px-4 py-3">
              Invalid transaction link.{" "}
              <a href="#transfer">Back to transfers</a>
            </p>
          )}
          <TransferPage state={state} />
        </div>
        <section
          id="developer-view"
          aria-labelledby="developer-h"
          className="flex flex-col gap-6"
          hidden={!developer}
        >
          <h1 id="developer-h" className="display h1">
            Developer
          </h1>
          <Developer state={state} />
        </section>
      </main>
      <footer className="border-t border-[var(--bd)]">
        <div className="wrap flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-5">
          <span className="help">Akash Sink · Akash → Solana, one way</span>
          <div className="flex items-center gap-2">
            <span className="over">Private testnet</span>
            <ThemeControl />
          </div>
        </div>
      </footer>
      {(route.kind === "transaction" || route.kind === "record") && (
        <TransferDialog
          key={hash}
          lookup={
            route.kind === "transaction"
              ? { kind: "transaction", hash: route.hash }
              : { kind: "transfer", id: route.id }
          }
          networkKey={route.networkKey}
          config={state.config}
        />
      )}
    </div>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing app root");
createRoot(root).render(<App />);
