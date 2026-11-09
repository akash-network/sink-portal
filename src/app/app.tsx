import { lazy, useSyncExternalStore, useState, useEffect } from "react";
import { bridge } from "../features/transfers/controller";
import { portalRoute } from "../features/transfers/transfers";
import { WalletLoader } from "../features/wallets/wallet-loader";
import { TransferDialog } from "../features/transfers/transaction";
import { Header } from "./header";
import { TransferPage } from "../features/transfers/transfer-page";
import { Developer } from "../features/developer/developer-page";
import { ThemeControl } from "./theme-control";

const AkashWallets = lazy(() => import("../features/wallets/akash-wallets"));

export function App() {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [hash, setHash] = useState(location.hash);
  const [akashOpened, setAkashOpened] = useState(false);
  useEffect(() => {
    if (state.akashPicker) setAkashOpened(true);
  }, [state.akashPicker]);
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
      {state.config && akashOpened && (
        <WalletLoader>
          <AkashWallets
            key={state.config.network.networkKey}
            state={state}
            config={state.config}
          />
        </WalletLoader>
      )}
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
