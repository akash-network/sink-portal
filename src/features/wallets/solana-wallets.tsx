import {
  ConnectorProvider,
  useConnectorClient,
  useWalletConnectors,
} from "@solana/connector/react";
import { bridge, type BridgeState } from "../transfers/controller";
import { mobileWalletUrl } from "./wallet-draft";

function WalletList({
  state,
  onSelect,
  open,
}: {
  state: BridgeState;
  onSelect: () => void;
  open: boolean;
}) {
  const client = useConnectorClient();
  const wallets = useWalletConnectors();
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!open) return null;
  return (
    <div
      className="card flex flex-col gap-2 p-3"
      role="group"
      aria-label="Choose a Solana wallet"
    >
      {wallets.map((wallet) => (
        <button
          key={wallet.id}
          className="btn btn-out wallet-option"
          disabled={!client || !wallet.ready}
          onClick={() => {
            if (client) {
              onSelect();
              void bridge.connectSolana(client, wallet.id);
            }
          }}
        >
          <img
            src={wallet.icon}
            alt=""
            width={28}
            height={28}
            className="rounded-md"
          />
          {wallet.name}
        </button>
      ))}
      {!wallets.length && (
        <p className="help">
          No wallet found in this browser. You can always paste your receiving
          address.
        </p>
      )}
      {mobile && state.config && (
        <>
          <p className="help">
            On iPhone, open this page inside your wallet. You’ll reconnect Akash
            and review the transfer there.
          </p>
          {(["Phantom", "Solflare"] as const).map((name) => (
            <a
              key={name}
              className="btn btn-out wallet-option"
              href={mobileWalletUrl(name, state)}
              rel="noreferrer"
            >
              <img
                src={`/assets/wallets/${name.toLowerCase()}.svg`}
                alt=""
                width={28}
                height={28}
                className="rounded-md"
              />
              Open in {name}
            </a>
          ))}
        </>
      )}
      {!mobile && !wallets.length && (
        <a
          href="https://phantom.com/download"
          target="_blank"
          rel="noreferrer"
          className="btn btn-out"
        >
          Get a Solana wallet
        </a>
      )}
      <p className="help">
        Address only. No Solana signature or payment is requested.
      </p>
    </div>
  );
}

const config = { autoConnect: false };
const mobile = { appIdentity: { name: "Akash Sink", uri: location.origin } };
export default function SolanaWallets(props: {
  state: BridgeState;
  onSelect: () => void;
  open: boolean;
}) {
  return (
    <ConnectorProvider config={config} mobile={mobile}>
      <WalletList {...props} />
    </ConnectorProvider>
  );
}
