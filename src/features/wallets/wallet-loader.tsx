import { Component, Suspense, type ComponentProps } from "react";
import { WalletPicker } from "./wallet-picker";

export class WalletLoader extends Component<
  ComponentProps<typeof WalletPicker> & { open: boolean },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    const fallback = this.props.open ? (
      <WalletPicker network={this.props.network} onClose={this.props.onClose}>
        {this.state.failed ? (
          <div className="well flex flex-col gap-2 p-3" role="alert">
            <p>Wallet tools couldn’t load. Reload the page to try again.</p>
            <button className="btn btn-out" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        ) : (
          <p role="status">Loading wallets…</p>
        )}
      </WalletPicker>
    ) : null;
    if (this.state.failed) return fallback;
    return <Suspense fallback={fallback}>{this.props.children}</Suspense>;
  }
}
