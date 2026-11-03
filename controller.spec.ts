import { afterEach, describe, expect, it, vi } from "vitest";
import { toBech32 } from "@cosmjs/encoding";
import type { OfflineDirectSigner } from "@cosmjs/proto-signing";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from "./bridge";
import type { DiscoveredSubmission, SavedSubmission } from "./contracts";
import { submissionId } from "./transfers";

const sender = toBech32("akash", new Uint8Array(20).fill(1));
const sink = toBech32("akash", new Uint8Array(20).fill(2));
const recipient = base58.encode(
  ed25519.getPublicKey(new Uint8Array(32).fill(7)),
);
const identity = [
  "akash-private-1",
  "2026-10-12T15:29:30.455284000Z",
  recipient,
  recipient,
  recipient,
  sink,
] as const;
const networkKey = JSON.stringify(identity);

function config() {
  return {
    version: 2,
    checkedAt: new Date().toISOString(),
    akashHeight: "300",
    network: {
      networkKey,
      chainId: identity[0],
      akashGenesisTime: identity[1],
      solanaGenesisHash: recipient,
      program: recipient,
      mint: recipient,
      sinkAddress: sink,
    },
    rpcPath: "/rpc/akash",
    restPath: "/rest/akash",
    denom: "uakt",
    decimals: 6,
    fee: { amountUakt: "12500", gas: "500000" },
    limits: {
      enabled: true,
      minTransferUakt: "1",
      maxTransferUakt: "100000000",
      maxDailyAmountPerAccountUakt: "100000000000",
      maxDailyAmountTotalUakt: "1000000000000",
    },
    client: {
      status: "active",
      latestHeight: "299",
      ageSeconds: 5,
      trustingPeriodSeconds: 86_400,
    },
  };
}
const saved = {
  version: 2,
  networkKey,
  sender,
  recipient,
  amountUakt: "1000000",
  createdAt: new Date().toISOString(),
} as const;
const pending: SavedSubmission = { ...saved, txHash: "A".repeat(64) };
const rejected: SavedSubmission = {
  ...saved,
  txHash: "B".repeat(64),
  broadcastRejection: { code: 13, message: "insufficient fee" },
};
const olderNetwork: SavedSubmission = {
  ...saved,
  networkKey: JSON.stringify(["akash-private-0", ...identity.slice(1)]),
  txHash: "C".repeat(64),
  transferId: `${sender}/40/1`,
};
const legacy = [
  {
    ...saved,
    version: 1,
    networkKey: "old-network",
    txHash: "D".repeat(64),
    transferId: "7",
  },
];
function discovered(height: number, createdAt: string | null) {
  return {
    ...saved,
    txHash: null,
    transferId: `${sender}/${height}/1`,
    createdAt,
  } satisfies DiscoveredSubmission;
}

async function connect(history: object) {
  vi.resetModules();
  const signer: OfflineDirectSigner = {
    getAccounts: async () => [
      { address: sender, algo: "secp256k1", pubkey: new Uint8Array(33) },
    ],
    signDirect: async () => {
      throw new Error("This test never signs");
    },
  };
  window.keplr = {
    experimentalSuggestChain: async () => {},
    enable: async () => {},
    getOfflineSignerAuto: async () => signer,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), location.href);
      const body: object =
        url.pathname === "/api/config"
          ? config()
          : url.pathname === "/api/transfers" &&
              url.searchParams.get("sender") === sender
            ? history
            : { error: "Unavailable in this test" };
      return new Response(JSON.stringify(body), {
        status: "error" in body ? 503 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  const { bridge } = await import("./controller");
  const stop = bridge.start();
  await vi.waitFor(() => expect(bridge.getSnapshot().config).not.toBeNull());
  await bridge.connectAkash();
  await vi.waitFor(() =>
    expect(bridge.getSnapshot().discoveryBusy).toBe(false),
  );
  return { bridge, stop };
}

describe("wallet history discovery", () => {
  let stop = () => {};
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it("keeps unsynced receipts and older networks when a full newest-first page arrives", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([pending, rejected, olderNetwork]),
    );
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    const before = [STORAGE_KEY, LEGACY_STORAGE_KEY].map((key) =>
      localStorage.getItem(key),
    );
    const page = Array.from({ length: 100 }, (_, i) =>
      discovered(
        200 - i,
        new Date(Date.UTC(2026, 9, 1) - i * 60_000).toISOString(),
      ),
    );
    const connected = await connect({
      version: 2,
      networkKey,
      sender,
      transfers: page,
      truncated: true,
    });
    stop = connected.stop;
    const state = connected.bridge.getSnapshot();

    expect(
      [STORAGE_KEY, LEGACY_STORAGE_KEY].map((key) => localStorage.getItem(key)),
    ).toEqual(before);
    expect(state.submissions.map(submissionId)).toEqual([
      pending.txHash,
      rejected.txHash,
      ...page.map((item) => item.transferId),
    ]);
    expect(state.legacyHistoryCount).toBe(1);
    expect(state.discoveryError).toBe("");
    expect(state.historyTruncated).toBe(true);
  });

  it("lists records without a known date after dated ones, newest ledger ID first", async () => {
    const connected = await connect({
      version: 2,
      networkKey,
      sender,
      transfers: [
        discovered(120, "2026-10-01T00:00:00.000Z"),
        discovered(9, null),
        discovered(110, "2026-09-30T00:00:00.000Z"),
        discovered(30, null),
      ],
      truncated: false,
    });
    stop = connected.stop;
    const state = connected.bridge.getSnapshot();

    expect(state.historyTruncated).toBe(false);
    expect(
      state.submissions.map((item) => [submissionId(item), item.createdAt]),
    ).toEqual([
      [`${sender}/120/1`, "2026-10-01T00:00:00.000Z"],
      [`${sender}/110/1`, "2026-09-30T00:00:00.000Z"],
      [`${sender}/30/1`, null],
      [`${sender}/9/1`, null],
    ]);
  });

  it("rejects a truncated page that is not full or repeats a transfer", async () => {
    for (const transfers of [
      [discovered(5, null)],
      [discovered(5, null), discovered(5, null)],
    ]) {
      const connected = await connect({
        version: 2,
        networkKey,
        sender,
        transfers,
        truncated: transfers.length === 1,
      });
      stop = connected.stop;
      const state = connected.bridge.getSnapshot();
      expect(state.discoveryError).not.toBe("");
      expect(state.submissions).toEqual([]);
      stop();
    }
  });
});
