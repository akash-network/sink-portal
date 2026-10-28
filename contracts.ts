export interface NetworkIdentity {
  networkKey: string;
  chainId: string;
  akashGenesisTime: string; // RFC 3339 with nanoseconds
  solanaGenesisHash: string;
  program: string;
  mint: string;
  sinkAddress: string;
}

// GET /api/config, HTTP 200. Read fresh committed Akash state and verify
// the configured Solana deployment before returning signing configuration.
export interface BridgeConfig {
  version: 1;
  checkedAt: string;
  akashHeight: string;
  network: NetworkIdentity;
  rpcPath: "/rpc/akash";
  restPath: "/rest/akash";
  denom: "uakt";
  decimals: 6;
  fee: { amountUakt: string; gas: string };
  limits: {
    enabled: boolean;
    minTransferUakt: string; // "0" when the node has no minimum
    maxTransferUakt: string;
    maxDailyPerAccount: number;
    maxPendingPerAccount: number;
    maxDailyAmountPerAccountUakt: string; // "0" when there is no daily limit
  };
  // Solana's light client of Akash. Deposits made while it is expired or
  // frozen stay in escrow and cannot mint until an operator recovers it.
  // Age is the Solana clock minus the latest trusted Akash header time.
  client: {
    status: "active" | "expired" | "frozen";
    latestHeight: string;
    ageSeconds: number;
    trustingPeriodSeconds: number;
  };
}

export interface Deposit {
  id: string;
  sender: string;
  recipient: string;
  amountUakt: string;
  height: string;
}
export interface AkashSettlement {
  height: string;
  timeSeconds: string;
  status: "pending" | "minted" | "voided" | "refunded";
  sinkStatus: "transfer_pending" | "completed" | "void";
  hold: "none" | "veto" | "conflict";
  challengeEndSeconds: string | null; // null when the on-chain value is zero
  refundsEnabled: boolean;
}
export type SolanaReceipt =
  | { kind: "unavailable"; message: string }
  | { kind: "absent"; contextSlot: string }
  | {
      kind: "minted" | "voided";
      contextSlot: string;
      resolvedSlot: string;
      proofHeight: string;
    };

export type ReceiptLookup =
  { kind: "transaction"; hash: string } | { kind: "transfer"; id: string };

// GET /api/receipt?tx=<64 hex characters> or ?id=<canonical record ID>.
// ID lookup returns a deposit with txHash:null; it does not require a tx index.
export type BridgeReceipt = {
  version: 1;
  networkKey: string;
  checkedAt: string;
} & (
  | { kind: "unknown"; txHash: string }
  | {
      kind: "rejected";
      txHash: string;
      height: string;
      code: number;
      message: string;
    }
  | {
      kind: "deposit";
      txHash: string | null;
      deposit: Deposit;
      akash: AkashSettlement;
      solana: SolanaReceipt;
    }
);

// New API failures: 400 malformed input, 422 successful tx is not a valid
// sink deposit, 503 unavailable/stale/inconsistent chain observation.
// Keep diagnostics concise; omit paths, stack traces and credentials.
export interface ApiError {
  error: string;
}

// Browser localStorage only. Save successfully BEFORE submitting signed bytes.
export interface SavedSubmission {
  version: 1;
  networkKey: string;
  txHash: string;
  transferId?: string;
  sender: string;
  recipient: string;
  amountUakt: string;
  createdAt: string;
  // A CheckTx rejection of this broadcast attempt does not prove that the
  // same transaction was never included by an earlier submission.
  broadcastRejection?: { code: number; message: string };
}
