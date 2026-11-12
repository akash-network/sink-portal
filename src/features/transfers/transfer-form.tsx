import { lazy, useState, useRef, useEffect } from "react";
import {
  Wallet,
  Check,
  TriangleAlert,
  Info,
  RotateCcw,
  Copy,
  ArrowRight,
} from "lucide-react";
import { type BridgeState, bridge } from "./controller";
import { WalletLoader } from "../wallets/wallet-loader";
import { displayAmount } from "./transfers";
import { clientPause } from "../../lib/model";
import { Notice } from "../wallets/notice";
import { useCopy } from "../../hooks/use-copy";
import { Summary } from "./summary";
import { WalletQuota, type useQuota } from "./quota";

const SolanaWallets = lazy(() => import("../wallets/solana-wallets"));

function IconTile() {
  return (
    <span className="flex size-10 flex-none items-center justify-center rounded-lg border border-[var(--bd)] bg-[var(--card)]">
      <Wallet className="ico" aria-hidden="true" />
    </span>
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
  const [walletsOpened, setWalletsOpened] = useState(false);
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
                <span className="lbl">Solana wallet</span>
                <span className="help">
                  Use your wallet’s receiving address. No Solana signature
                  required.
                </span>
              </div>
            </div>
            <button
              id="connect-solana"
              type="button"
              className="btn btn-out shrink-0"
              onClick={() => {
                setWalletsOpened(true);
                setPicker((open) => !open);
              }}
              disabled={
                formOff || !state.canConnect || !!state.solanaConnecting
              }
              aria-expanded={picker}
              aria-haspopup="dialog"
            >
              {state.solanaConnecting ? "Connecting…" : "Connect Solana wallet"}
            </button>
          </div>
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
      {walletsOpened && (
        <WalletLoader>
          <SolanaWallets
            state={state}
            open={!wallet && picker && !state.solanaConnecting}
            onClose={() => setPicker(false)}
          />
        </WalletLoader>
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
        <p className="help">Max leaves room for the {fee} AKT network fee.</p>
      )}
    </div>
  );
}

export function TransferCard({
  state,
  quota,
  overlay,
  onReview,
}: {
  state: BridgeState;
  quota: ReturnType<typeof useQuota>;
  overlay: boolean;
  onReview: () => void;
}) {
  const [copied, copy] = useCopy();
  const formOff = overlay || state.busy;
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
                <span className="over">Akash wallet connected</span>
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
            <span className="over">From · Akash</span>
            <div className="well stack-sm flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <IconTile />
                <div className="flex min-w-0 flex-col">
                  <span className="lbl">Akash wallet</span>
                  <span className="help">
                    Send AKT and approve the transfer in your wallet.
                  </span>
                </div>
              </div>
              <button
                id="connect-keplr-form"
                type="button"
                className="btn btn-out shrink-0"
                onClick={() => bridge.chooseAkashWallet()}
                disabled={formOff || !state.canConnect}
                aria-haspopup="dialog"
                aria-expanded={state.akashPicker}
              >
                {state.akashConnecting ? "Connecting…" : "Connect Akash wallet"}
              </button>
            </div>
            <Notice state={state} scope="akash" />
          </div>
        )}
        <Destination state={state} formOff={formOff} />
        <Amount state={state} formOff={formOff} />
        <WalletQuota owner={state.sender} quota={quota} />
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
