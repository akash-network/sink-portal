import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Modal } from "../../components/modal";

export function WalletPicker({
  network,
  onClose,
  children,
}: {
  network: "Akash" | "Solana";
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = `${network.toLowerCase()}-wallet-title`;
  const descriptionId = `${network.toLowerCase()}-wallet-description`;
  return (
    <Modal labelledBy={titleId} describedBy={descriptionId} onEscape={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id={titleId} className="display text-xl leading-7">
            Connect {network} wallet
          </h2>
          <p id={descriptionId} className="help">
            {network === "Akash"
              ? "Choose a wallet to send AKT from Akash."
              : "Choose a wallet to receive AKT on Solana."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon shrink-0"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="ico" aria-hidden="true" />
        </button>
      </div>
      <div className="my-5 flex flex-col gap-3">{children}</div>
      <p className="help border-t border-[var(--bd)] pt-4">
        {network === "Akash"
          ? "You’ll approve the transfer in your Akash wallet. Your recovery phrase stays in your wallet."
          : "Only your receiving address is shared. No Solana signature or payment is requested."}
      </p>
    </Modal>
  );
}
