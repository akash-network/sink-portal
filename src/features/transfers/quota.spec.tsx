import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quota } from "../../../shared/quota";
import { GlobalQuotaWarning, useQuota, WalletQuota } from "./quota";

function quota(owner: string | null = "wallet-a"): Quota {
  return {
    version: 1,
    networkKey: "network",
    checkedAt: new Date().toISOString(),
    akashHeight: "100",
    epoch: "234",
    epochStarted: true,
    resetAt: new Date(Date.now() + 3600_000).toISOString(),
    minTransferUakt: "1000000",
    maxTransferUakt: "100000000",
    deposits: { capUakt: "1000000000", usedUakt: "3000000" },
    mints: {
      capUakt: "1000000000",
      usedUakt: "3000000",
      maxTransferUakt: "100000000",
      resetAt: new Date(Date.now() + 7200_000).toISOString(),
    },
    account: owner
      ? { owner, capUakt: "100000000", usedUakt: "30000000" }
      : null,
  };
}

function view(data = quota()) {
  return { data, current: true, loading: false, now: Date.now() };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("wallet limits", () => {
  it("shows only the connected wallet’s allowance and removes it on disconnect", () => {
    const { rerender } = render(<WalletQuota owner={null} quota={view()} />);
    expect(screen.queryByText("Your limits")).not.toBeInTheDocument();
    rerender(<WalletQuota owner="wallet-a" quota={view()} />);
    expect(screen.getByText("70.00 AKT")).toBeVisible();
    expect(screen.getByText("1.00–100.00 AKT")).toBeVisible();
    rerender(<WalletQuota owner="wallet-b" quota={view()} />);
    expect(screen.queryByText("70.00 AKT")).not.toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/)).toBeVisible();
    rerender(<WalletQuota owner={null} quota={view()} />);
    expect(screen.queryByText(/limits/)).not.toBeInTheDocument();
  });

  it("does not turn missing, stale or expired usage into a full allowance", () => {
    const data = quota();
    const { rerender } = render(
      <WalletQuota
        owner="wallet-a"
        quota={{ ...view(data), current: false }}
      />,
    );
    expect(screen.getByText("Awaiting fresh quota")).toBeVisible();
    expect(screen.getByText("Live status unavailable")).toBeVisible();
    rerender(
      <WalletQuota
        owner="wallet-a"
        quota={{ ...view(data), now: Date.parse(data.resetAt) }}
      />,
    );
    expect(screen.getByText("Awaiting fresh quota")).toBeVisible();
    expect(screen.getByText("Awaiting chain reset")).toBeVisible();
  });

  it("handles zero account caps as unlimited and clamps exhausted allowance to zero", () => {
    const data = quota();
    data.account = { owner: "wallet-a", capUakt: "0", usedUakt: "30000000" };
    const { rerender } = render(
      <WalletQuota owner="wallet-a" quota={view(data)} />,
    );
    expect(screen.getByText("No account cap")).toBeVisible();
    expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
    data.account = { ...data.account, capUakt: "10000000" };
    rerender(<WalletQuota owner="wallet-a" quota={view(data)} />);
    expect(screen.getByText("0.00 AKT")).toBeVisible();
  });
});

describe("global cap notices", () => {
  it("appears at exhaustion without a connected wallet and uses each chain’s reset", () => {
    const data = quota(null);
    const { rerender } = render(<GlobalQuotaWarning quota={view(data)} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    data.deposits.usedUakt = data.deposits.capUakt;
    rerender(<GlobalQuotaWarning quota={view(data)} />);
    expect(screen.getByText("Akash deposit cap reached")).toBeVisible();
    expect(
      screen.queryByText("Solana mint cap reached"),
    ).not.toBeInTheDocument();
    expect(document.querySelector("time")?.dateTime).toBe(data.resetAt);
    data.mints.usedUakt = data.mints.capUakt;
    rerender(<GlobalQuotaWarning quota={view(data)} />);
    expect(screen.getByText("Solana mint cap reached")).toBeVisible();
    expect(
      [...document.querySelectorAll("time")].map((el) => el.dateTime),
    ).toEqual([data.resetAt, data.mints.resetAt]);
    rerender(<GlobalQuotaWarning quota={{ ...view(data), current: false }} />);
    expect(
      screen.getByText("Akash deposit cap reached · last observed"),
    ).toBeVisible();
    expect(screen.getAllByText("Live status unavailable")).toHaveLength(2);
  });
});

describe("quota refresh", () => {
  it("fetches public caps before connection and binds account responses to the active wallet", async () => {
    let finishA: (value: Response) => void = () => {};
    const pendingA = new Promise<Response>((resolve) => {
      finishA = resolve;
    });
    const fetcher = vi.fn(async (path: string) => {
      if (path.endsWith("sender=wallet-a")) return pendingA;
      return new Response(
        JSON.stringify(quota(path.includes("sender=") ? "wallet-b" : null)),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const initialProps: { owner: string | null } = { owner: null };
    const { result, rerender } = renderHook(
      ({ owner }: { owner: string | null }) => useQuota("network", owner),
      { initialProps },
    );
    await waitFor(() => expect(result.current.current).toBe(true));
    expect(result.current.data?.account).toBeNull();
    expect(fetcher.mock.calls[0][0]).toBe("/api/quota");
    rerender({ owner: "wallet-a" });
    expect(result.current.data).toBeNull();
    rerender({ owner: "wallet-b" });
    await waitFor(() =>
      expect(result.current.data?.account?.owner).toBe("wallet-b"),
    );
    await act(async () =>
      finishA(new Response(JSON.stringify(quota("wallet-a")))),
    );
    expect(result.current.data?.account?.owner).toBe("wallet-b");
    rerender({ owner: null });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.current).toBe(true));
    expect(result.current.data?.account).toBeNull();
  });

  it.each(["owner", "network", "timestamp", "amount"])(
    "rejects mismatched or invalid %s data",
    async (invalid) => {
      const data = quota();
      if (invalid === "owner")
        data.account = { owner: "someone-else", capUakt: "1", usedUakt: "0" };
      if (invalid === "network") data.networkKey = "other-network";
      if (invalid === "timestamp")
        data.checkedAt = new Date(Date.now() - 120_000).toISOString();
      if (invalid === "amount") data.deposits.capUakt = "-1";
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(data))),
      );
      const { result } = renderHook(() => useQuota("network", "wallet-a"));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.current).toBe(false);
      expect(result.current.data).toBeNull();
    },
  );

  it("retains an exhausted notice as stale when refresh fails, then clears it after confirmed reset", async () => {
    vi.useFakeTimers();
    const data = quota(null);
    data.deposits.usedUakt = data.deposits.capUakt;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(data)))
      .mockRejectedValueOnce(new Error("RPC unavailable"))
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ ...quota(null), epoch: "235" })),
      );
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useQuota("network", null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.current).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.current).toBe(false);
    expect(result.current.data?.deposits.usedUakt).toBe(data.deposits.capUakt);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.current).toBe(true);
    expect(result.current.data?.epoch).toBe("235");
    expect(result.current.data?.deposits.usedUakt).toBe("3000000");
  });
});
