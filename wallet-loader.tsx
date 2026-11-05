import { Component, Suspense, type ReactNode } from "react";

export class WalletLoader extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="well flex flex-col gap-2 p-3" role="alert">
          <p>Wallet tools couldn’t load. Reload the page to try again.</p>
          <button className="btn btn-out" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return (
      <Suspense fallback={<p role="status">Loading wallets…</p>}>
        {this.props.children}
      </Suspense>
    );
  }
}
