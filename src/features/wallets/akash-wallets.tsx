import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { ChainProvider, useManager } from "@cosmos-kit/react-lite";
import type { ChainWalletBase } from "@cosmos-kit/core";
import {
  KeplrExtensionWallet,
  keplrExtensionInfo,
} from "@cosmos-kit/keplr-extension";
import { KeplrMobileWallet, keplrMobileInfo } from "@cosmos-kit/keplr-mobile";
import QRCode from "qrcode";
import { bridge, type BridgeState } from "../transfers/controller";
import { WalletPicker } from "./wallet-picker";
import type { BridgeConfig } from "../../../shared/contracts";
import { message } from "../../lib/model";
import { akashSigner } from "./wallet-session";
import { isMainnet } from "../../lib/network";

declare const WALLETCONNECT_PROJECT_ID: string;
const projectId =
  typeof WALLETCONNECT_PROJECT_ID === "undefined"
    ? ""
    : WALLETCONNECT_PROJECT_ID;
type ProviderProps = ComponentProps<typeof ChainProvider>;

function akashChain(
  config: BridgeConfig,
  origin: string,
): ProviderProps["chains"][number] {
  return {
    chain_name: "akash",
    chain_type: "cosmos",
    chain_id: config.network.chainId,
    pretty_name: isMainnet(config.network.chainId)
      ? "Akash"
      : "Akash Sink Testnet",
    network_type: isMainnet(config.network.chainId) ? "mainnet" : "testnet",
    bech32_prefix: "akash",
    slip44: 118,
    key_algos: ["secp256k1"],
    fees: {
      fee_tokens: [
        {
          denom: "uakt",
          low_gas_price: 0.025,
          average_gas_price: 0.025,
          high_gas_price: 0.025,
        },
      ],
    },
    staking: { staking_tokens: [{ denom: "uakt" }] },
    apis: {
      rpc: [{ address: new URL(config.rpcPath, origin).href }],
      rest: [{ address: new URL(config.restPath, origin).href }],
    },
  };
}
const assets: ProviderProps["assetLists"] = [
  {
    chain_name: "akash",
    assets: [
      {
        type_asset: "sdk.coin",
        base: "uakt",
        name: "Akash",
        display: "akt",
        symbol: "AKT",
        denom_units: [
          { denom: "uakt", exponent: 0 },
          { denom: "akt", exponent: 6 },
        ],
      },
    ],
  },
];

function Pairing({ wallet }: { wallet: ChainWalletBase }) {
  const [uri, setUri] = useState("");
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    // Cosmos Kit exposes pairing data as mutable client state.
    const timer = setInterval(() => setUri(wallet.qrUrl?.data ?? ""), 250);
    return () => clearInterval(timer);
  }, [wallet]);
  useEffect(() => {
    let active = true;
    setImage("");
    if (uri)
      void QRCode.toDataURL(uri, { width: 240, margin: 2 }).then(
        (value) => {
          if (active) setImage(value);
        },
        (reason: unknown) => {
          if (active) setError(message(reason));
        },
      );
    return () => {
      active = false;
    };
  }, [uri]);
  const os = /Android/i.test(navigator.userAgent) ? "android" : "ios";
  const info = wallet.walletInfo.walletconnect;
  const native = info?.mobile?.native;
  const app = typeof native === "string" ? native : native?.[os];
  const href =
    uri && app && info?.formatNativeUrl?.(app, uri, os, wallet.walletName);
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="help">
        Scan with {wallet.walletPrettyName}, or open it on this phone.
      </p>
      {image && (
        <img
          src={image}
          width={240}
          height={240}
          alt="WalletConnect pairing QR code"
        />
      )}
      {href && (
        <a className="btn btn-pri" href={href}>
          Open {wallet.walletPrettyName}
        </a>
      )}
      {!uri && <p role="status">Waiting for the wallet connection…</p>}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
    </div>
  );
}
function WalletList({ state }: { state: BridgeState }) {
  const { getWalletRepo } = useManager();
  const repo = getWalletRepo("akash");
  repo.activate();
  const [selected, setSelected] = useState<ChainWalletBase | null>(null);
  useEffect(() => {
    for (const wallet of repo.wallets) {
      bridge.akashAccountChanged(
        wallet.walletName,
        wallet.isWalletConnected ? wallet.address : undefined,
      );
    }
  });
  if (!state.akashPicker) return null;
  return (
    <WalletPicker network="Akash" onClose={bridge.closeAkashPicker}>
      <div className="flex flex-col gap-2">
        {repo.wallets
          .filter(
            (wallet) =>
              !wallet.isMobile ||
              !(typeof wallet.walletInfo.mobileDisabled === "function"
                ? wallet.walletInfo.mobileDisabled()
                : wallet.walletInfo.mobileDisabled),
          )
          .map((wallet) => (
            <button
              key={wallet.walletName}
              type="button"
              className="btn btn-out wallet-option"
              disabled={state.akashConnecting || wallet.isWalletConnecting}
              onClick={() => {
                setSelected(wallet);
                wallet.activate();
                void bridge.connectAkash({
                  id: wallet.walletName,
                  name: wallet.walletPrettyName,
                  connect: async () => {
                    await repo.connect(wallet.walletName);
                    if (!wallet.isWalletConnected)
                      throw new Error(
                        wallet.message ||
                          `Could not connect ${wallet.walletPrettyName}`,
                      );
                    wallet.client.setDefaultSignOptions?.({
                      preferNoSetMemo: true,
                      preferNoSetFee: true,
                    });
                  },
                  getSigner: () => akashSigner(wallet),
                  disconnect: () => repo.disconnect(wallet.walletName),
                });
              }}
            >
              <img
                src={
                  typeof wallet.walletInfo.logo === "string"
                    ? wallet.walletInfo.logo
                    : wallet.walletInfo.logo?.major
                }
                alt=""
                width={28}
                height={28}
                className="shrink-0 rounded-md"
              />
              {wallet.walletPrettyName}
            </button>
          ))}
      </div>
      {selected?.isModeWalletConnect && state.akashConnecting && (
        <Pairing wallet={selected} />
      )}
      {state.notice?.scope === "akash" && (
        <p
          role={state.notice.tone === "error" ? "alert" : "status"}
          className={state.notice.tone === "error" ? "err" : "help"}
        >
          {state.notice.text}
        </p>
      )}
    </WalletPicker>
  );
}
export default function AkashWallets({
  state,
  config,
}: {
  state: BridgeState;
  config: BridgeConfig;
}) {
  const wallets = useMemo(
    () => [
      new KeplrExtensionWallet(keplrExtensionInfo),
      ...(projectId ? [new KeplrMobileWallet(keplrMobileInfo)] : []),
    ],
    [],
  );
  const options = useMemo(
    () => ({
      chains: [akashChain(config, location.origin)],
      endpoints: {
        akash: {
          rpc: [new URL(config.rpcPath, location.origin).href],
          rest: [new URL(config.restPath, location.origin).href],
        },
      },
      walletConnect: projectId
        ? {
            signClient: {
              projectId,
              metadata: {
                name: "Akash Sink",
                description: "Bridge AKT to Solana",
                url: location.origin,
                icons: [],
              },
            },
          }
        : undefined,
    }),
    [config.network.networkKey],
  );
  return (
    <ChainProvider
      chains={options.chains}
      assetLists={assets}
      wallets={wallets}
      walletConnectOptions={options.walletConnect}
      endpointOptions={{ endpoints: options.endpoints, isLazy: true }}
      signerOptions={{ preferredSignType: () => "direct" }}
      allowedIframeParentOrigins={[]}
      throwErrors="connect_only"
      logLevel="ERROR"
    >
      <WalletList state={state} />
    </ChainProvider>
  );
}
