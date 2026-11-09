import { LogOut, Wallet } from "lucide-react";
import { type BridgeState, bridge } from "../features/transfers/controller";
import { AkashLogo } from "../components/logo";
import { displayAmount } from "../features/transfers/transfers";

export function Header({ state }: { state: BridgeState }) {
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
              aria-label="Disconnect Akash wallet"
            >
              <LogOut className="ico" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            id="connect-keplr"
            type="button"
            className="btn btn-pri"
            onClick={() => bridge.chooseAkashWallet()}
            disabled={!state.canConnect}
          >
            <Wallet className="ico" aria-hidden="true" />
            {state.akashConnecting ? "Connecting…" : "Connect Akash wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
