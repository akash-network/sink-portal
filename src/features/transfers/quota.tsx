import { useEffect, useState } from "react";
import { Info, TriangleAlert, X } from "lucide-react";
import { quotaSchema, type Quota } from "../../../shared/quota";
import { Modal } from "../../components/modal";
import { api, fresh, serverNow } from "../../lib/model";
import { displayAmount } from "./transfers";

type Observation =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; data: Quota; refreshFailed: boolean };

export function useQuota(networkKey: string | undefined, owner: string | null) {
  const [observation, setObservation] = useState<Observation>({
    kind: "loading",
  });
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setObservation({ kind: "loading" });
    if (!networkKey) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const query = owner ? `?sender=${encodeURIComponent(owner)}` : "";
        const data = quotaSchema.parse(await api(`/api/quota${query}`));
        if (
          data.networkKey !== networkKey ||
          (data.account?.owner ?? null) !== owner ||
          !fresh(data.checkedAt)
        )
          throw new Error("Stale or mismatched quota");
        if (!disposed)
          setObservation({ kind: "ready", data, refreshFailed: false });
      } catch {
        if (!disposed)
          setObservation((previous) =>
            previous.kind === "ready"
              ? { ...previous, refreshFailed: true }
              : { kind: "unavailable" },
          );
      } finally {
        if (!disposed) timer = setTimeout(refresh, 30_000);
      }
    };
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [networkKey, owner]);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  const data =
    observation.kind === "ready" &&
    observation.data.networkKey === networkKey &&
    (observation.data.account?.owner ?? null) === owner
      ? observation.data
      : null;
  return {
    data,
    current:
      observation.kind === "ready" &&
      !observation.refreshFailed &&
      !!data &&
      fresh(data.checkedAt, now),
    loading: observation.kind === "loading",
    now,
  };
}

type QuotaView = ReturnType<typeof useQuota>;

export function depositBlocker({ data, current, loading, now }: QuotaView) {
  if (
    data?.epochStarted &&
    BigInt(data.deposits.usedUakt) >= BigInt(data.deposits.capUakt)
  )
    return "The global deposit cap has been reached.";
  if (
    data?.account &&
    BigInt(data.account.capUakt) > 0n &&
    BigInt(data.account.usedUakt) >= BigInt(data.account.capUakt)
  )
    return "Your wallet’s deposit cap has been reached.";
  if (!current || !data)
    return loading
      ? "Checking deposit limits…"
      : "Deposit limits are unavailable. Waiting for a fresh update.";
  if (!data.epochStarted || now >= Date.parse(data.resetAt))
    return "Waiting for updated deposit limits.";
  return null;
}

function ResetTime({
  at,
  now,
  current,
}: {
  at: string;
  now: number;
  current: boolean;
}) {
  const seconds = Math.max(0, Math.ceil((Date.parse(at) - now) / 1000));
  const countdown = !current
    ? "Live status unavailable"
    : seconds === 0
      ? "Awaiting chain reset"
      : `Resets in ${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
  const time = new Date(at).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return (
    <p className="help mt-1 tabular-nums">
      <span aria-live="off">{countdown}</span> ·{" "}
      <time dateTime={at}>{time} UTC</time>
    </p>
  );
}

export function GlobalQuotaWarning({ quota }: { quota: QuotaView }) {
  const { data, current, now } = quota;
  if (!data) return null;
  const warnings = [
    ...(data.epochStarted &&
    BigInt(data.deposits.usedUakt) >= BigInt(data.deposits.capUakt)
      ? [
          {
            title: "Akash deposit cap reached",
            detail:
              "The global deposit limit for this period has been reached.",
            resetAt: data.resetAt,
          },
        ]
      : []),
    ...(BigInt(data.mints.usedUakt) >= BigInt(data.mints.capUakt)
      ? [
          {
            title: "Solana mint cap reached",
            detail:
              "The daily mint limit has been reached. Delivery may wait for the next reset.",
            resetAt: data.mints.resetAt,
          },
        ]
      : []),
  ];
  if (!warnings.length) return null;
  return (
    <div
      className="mx-auto flex w-full max-w-[640px] flex-col gap-3"
      role="status"
    >
      {warnings.map((warning) => (
        <div
          key={warning.title}
          className="well flex items-start gap-3 border border-[var(--warn)] px-4 py-3"
        >
          <TriangleAlert
            className="ico mt-0.5 shrink-0 text-[var(--warn)]"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold">
              {warning.title}
              {current ? "" : " · last observed"}
            </p>
            <p className="mt-1 text-sm">{warning.detail}</p>
            <ResetTime at={warning.resetAt} now={now} current={current} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function WalletLimitsButton({
  owner,
  quota,
}: {
  owner: string;
  quota: QuotaView;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-icon shrink-0"
        aria-label="View wallet limits"
        title="View wallet limits"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "wallet-limits" : undefined}
        onClick={() => setOpen(true)}
      >
        <Info className="ico" aria-hidden="true" />
      </button>
      {open && (
        <Modal
          id="wallet-limits"
          labelledBy="wallet-limits-title"
          describedBy="wallet-limits-address"
          onEscape={() => setOpen(false)}
        >
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <h2
                  id="wallet-limits-title"
                  className="display text-xl leading-7"
                >
                  Wallet limits
                </h2>
                <p id="wallet-limits-address" className="addr help">
                  {owner}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon shrink-0"
                onClick={() => setOpen(false)}
                aria-label="Close wallet limits"
              >
                <X className="ico" aria-hidden="true" />
              </button>
            </div>
            <WalletQuota owner={owner} quota={quota} />
          </div>
        </Modal>
      )}
    </>
  );
}

export function WalletQuota({
  owner,
  quota,
}: {
  owner: string | null;
  quota: QuotaView;
}) {
  if (!owner) return null;
  const { data, current, loading, now } = quota;
  if (!data?.account || data.account.owner !== owner)
    return (
      <p className="help" role="status">
        {loading
          ? "Checking your wallet’s limits…"
          : "Your wallet’s limits are temporarily unavailable."}
      </p>
    );
  const cap = BigInt(data.account.capUakt);
  const used = BigInt(data.account.usedUakt);
  const remaining = cap > used ? cap - used : 0n;
  const perTransfer = [
    data.maxTransferUakt,
    data.mints.maxTransferUakt,
    data.deposits.capUakt,
    ...(cap > 0n ? [cap.toString()] : []),
  ]
    .map(BigInt)
    .reduce((a, b) => (a < b ? a : b));
  const active = current && data.epochStarted && now < Date.parse(data.resetAt);
  return (
    <section
      aria-label="Your wallet limits"
      className="well rounded-lg px-4 py-3 text-sm"
    >
      <dl className="flex flex-col gap-1.5">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
          <dt className="muted">Per transfer</dt>
          <dd className="mono">
            {displayAmount(data.minTransferUakt)}–{displayAmount(perTransfer)}{" "}
            AKT
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
          <dt className="muted">This period</dt>
          <dd className="mono">
            {cap === 0n ? "No account cap" : `${displayAmount(cap)} AKT`}
          </dd>
        </div>
        {cap > 0n && (
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt className="muted">Remaining</dt>
            <dd className="mono">
              {active
                ? `${displayAmount(remaining)} AKT`
                : "Awaiting fresh quota"}
            </dd>
          </div>
        )}
      </dl>
      <ResetTime at={data.resetAt} now={now} current={current} />
    </section>
  );
}
