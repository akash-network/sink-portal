import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { BridgeConfig, BridgeReceipt, SavedSubmission } from "./contracts";
import {
  connectKeplr,
  connectSolanaWallet,
  getSigner,
  keplrProvider,
  loadSubmissions,
  readBalance,
  saveSubmission,
  signDeposit,
  signerAddress,
  signingClient,
  submitIntent,
  type SolanaProvider,
  type SolanaWalletName,
} from "./bridge";
import {
  amountStyle,
  api,
  checkAmount,
  checkDestination,
  clientPause,
  formatAmount,
  fresh,
  matchReceipt,
  message,
  parseAmount,
  parseConfig,
  parseLookup,
  parseReceipt,
  parseSaved,
  parseStatus,
  publicKey,
  record,
  serverNow,
  syncServerClock,
  type DeveloperStatus,
} from "./model";
import {
  displayAmount,
  recordLink,
  shortenIdentifier,
  transactionLink,
  transferKey,
  transferStatus,
  setAmountStyle,
  visibleTransfers,
  type TransferObservation,
} from "./transfers";

// Amounts use the browser locale's decimal mark for input and display.
const style = amountStyle(
  typeof navigator === "undefined" ? undefined : navigator.language,
);
setAmountStyle(style);

const secure =
  window.isSecureContext &&
  (location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1");
let config: BridgeConfig | null = null;
let signer: OfflineSigner | null = null;
let sender: string | null = null;
let balance: bigint | null = null;
let generation = 0;
let phase: "idle" | "preparing" | "signing" | "submitting" = "idle";
let akashConnecting = false;
let solanaConnecting: SolanaWalletName | null = null;
let solana: { name: SolanaWalletName; provider: SolanaProvider } | null = null;
const listening = new WeakSet<SolanaProvider>();
export type DestinationSource = "wallet" | "paste" | "retry";
let destination: {
  text: string;
  source: DestinationSource | null;
  wallet: SolanaWalletName | null;
} = { text: "", source: null, wallet: null };
let retryOf = "";
let submissions: SavedSubmission[] = [];
let historyError = "";
export type NoticeScope = "akash" | "solana" | "transfer" | "general";
let notice: {
  scope: NoticeScope;
  text: string;
  tone: "info" | "error";
} | null = null;
export type SubmissionResult = {
  txHash: string;
  networkKey: string;
  kind: "submitting" | "accepted" | "ambiguous" | "rejected";
  message: string;
};
let result: SubmissionResult | null = null;
const observations = new Map<string, TransferObservation>();
const checking = new Set<string>();
let historyBusy = false;
let statusBusy = false;
let balanceBusy = false;

function invalidate() {
  generation += 1;
}
function say(scope: NoticeScope, text: string, tone: "info" | "error") {
  notice = text ? { scope, text, tone } : null;
  emit();
}
function clearNotice(scope?: NoticeScope) {
  if (!scope || notice?.scope === scope) notice = null;
}
function fee(): bigint | null {
  return config ? BigInt(config.fee.amountUakt) : null;
}
function amount(): bigint {
  return parseAmount(amountText, style);
}
function maxAmount(): bigint {
  if (!config || balance === null) return 0n;
  const available = balance - BigInt(config.fee.amountUakt);
  const max =
    available < BigInt(config.limits.maxTransferUakt)
      ? available
      : BigInt(config.limits.maxTransferUakt);
  return max > 0n && max >= BigInt(config.limits.minTransferUakt) ? max : 0n;
}
function renderStatus(value: DeveloperStatus) {
  status = value;
  statusError = "";
  emit();
}
function visible() {
  return visibleTransfers(submissions, config?.network.networkKey, sender);
}
function observation(saved: SavedSubmission | undefined) {
  return saved ? observations.get(transferKey(saved)) : undefined;
}
async function refreshReceipt(saved: SavedSubmission) {
  const key = transferKey(saved);
  if (checking.has(key)) return;
  checking.add(key);
  const previous = observations.get(key)?.receipt ?? null;
  try {
    if (config?.network.networkKey !== saved.networkKey) return;
    const query = saved.transferId
      ? `id=${saved.transferId}`
      : `tx=${saved.txHash}`;
    const receipt = parseReceipt(await api(`/api/receipt?${query}`));
    matchReceipt(
      receipt,
      saved.networkKey,
      saved.transferId
        ? { kind: "transfer", id: saved.transferId }
        : { kind: "transaction", hash: saved.txHash },
      saved,
    );
    if (!fresh(receipt.checkedAt))
      throw new Error("The server returned a stale receipt");
    if (previous?.kind === "deposit" && receipt.kind !== "deposit")
      throw new Error(
        "Previously verified deposit is missing from the current chain index",
      );
    observations.set(key, { receipt, error: "" });
    if (receipt.kind === "deposit" && !saved.transferId) {
      saveSubmission(localStorage, {
        ...saved,
        transferId: receipt.deposit.id,
      });
      submissions = loadSubmissions(localStorage);
    }
  } catch (error) {
    observations.set(key, {
      receipt: observations.get(key)?.receipt ?? previous,
      error: message(error),
    });
  } finally {
    checking.delete(key);
    emit();
  }
}
async function pollTransfers() {
  if (historyBusy) return;
  historyBusy = true;
  const items = visible().filter((saved) => {
    const entry = observation(saved);
    return (
      !transferStatus(saved, entry).settled ||
      !entry?.receipt ||
      serverNow() - Date.parse(entry.receipt.checkedAt) >= 30_000
    );
  });
  try {
    for (let i = 0; i < items.length; i += 3) {
      await Promise.all(items.slice(i, i + 3).map(refreshReceipt));
    }
  } finally {
    historyBusy = false;
    emit();
  }
}
let discoveryBusy = false;
let discoveryError = "";
let lastDiscovery = 0;
async function discoverTransfers() {
  if (!config || !sender || discoveryBusy) return;
  discoveryBusy = true;
  emit();
  const networkKey = config.network.networkKey,
    address = sender;
  try {
    const found = record(
      await api(`/api/transfers?sender=${encodeURIComponent(address)}`),
    );
    if (
      found.version !== 1 ||
      found.networkKey !== networkKey ||
      found.sender !== address ||
      !Array.isArray(found.transfers) ||
      found.transfers.length > 100
    )
      throw new Error("Unexpected wallet transfer history");
    const discovered = found.transfers.map(parseSaved);
    if (
      discovered.some(
        (item) => item.networkKey !== networkKey || item.sender !== address,
      )
    )
      throw new Error("History does not match this wallet and network");
    if (config?.network.networkKey !== networkKey || sender !== address) return;
    for (const item of discovered) {
      const existing = submissions.find(
        (saved) => transferKey(saved) === transferKey(item),
      );
      if (!existing || !existing.transferId) saveSubmission(localStorage, item);
    }
    submissions = loadSubmissions(localStorage);
    discoveryError = "";
    lastDiscovery = Date.now();
    void pollTransfers();
  } catch (error) {
    if (sender === address && config?.network.networkKey === networkKey)
      discoveryError = message(error);
  } finally {
    discoveryBusy = false;
    emit();
  }
}
async function updateBalance() {
  if (balanceBusy || !config || !sender) return;
  balanceBusy = true;
  const currentSender = sender,
    currentNetwork = config.network.networkKey;
  try {
    const next = await readBalance(config, currentSender);
    // Only the account and network decide a balance, so a read that finishes
    // after a form edit still counts.
    if (
      sender === currentSender &&
      config?.network.networkKey === currentNetwork
    )
      balance = next;
  } catch (error) {
    if (sender === currentSender) {
      balance = null;
      say("general", `Balance unavailable: ${message(error)}`, "error");
    }
  } finally {
    balanceBusy = false;
    emit();
  }
}
function adoptConfig(next: BridgeConfig) {
  syncServerClock(next.checkedAt);
  if (
    config &&
    JSON.stringify([
      config.network,
      config.fee,
      config.limits,
      config.client.status,
    ]) !==
      JSON.stringify([next.network, next.fee, next.limits, next.client.status])
  ) {
    invalidate();
    if (config.network.networkKey !== next.network.networkKey) {
      signer = null;
      sender = null;
      balance = null;
      say(
        "general",
        "The testnet identity changed. Reconnect Keplr before another transfer.",
        "error",
      );
    }
  }
  config = next;
  emit();
}
async function refreshNetwork() {
  if (statusBusy) return;
  statusBusy = true;
  const results = await Promise.allSettled([
    api("/api/config").then(parseConfig),
    api("/api/status").then(parseStatus),
  ]);
  const [configuration, network] = results;
  try {
    if (configuration.status === "fulfilled") {
      adoptConfig(configuration.value);
      if (notice?.text.startsWith("Transfers unavailable")) clearNotice();
    } else if (!config || !fresh(config.checkedAt))
      say(
        "general",
        `Transfers unavailable: ${message(configuration.reason)}`,
        "error",
      );
    if (network.status === "fulfilled") renderStatus(network.value);
    else {
      statusError = `Network check unavailable: ${message(network.reason)}`;
      emit();
    }
  } catch (error) {
    say("general", message(error), "error");
  } finally {
    statusBusy = false;
    void updateBalance();
    if (Date.now() - lastDiscovery >= 30_000) void discoverTransfers();
  }
}
function connecting() {
  return akashConnecting || solanaConnecting !== null;
}
async function connectAkash() {
  if (!config || phase !== "idle" || connecting()) return;
  akashConnecting = true;
  invalidate();
  const epoch = generation;
  say("akash", "Approve the private testnet and connection in Keplr.", "info");
  try {
    const connected = await connectKeplr(config);
    if (generation !== epoch)
      throw new Error("Wallet changed during connection. Connect again.");
    signer = connected.signer;
    sender = connected.address;
    balance = null;
    lastDiscovery = 0;
    clearNotice();
    void discoverTransfers();
    void pollTransfers();
  } catch (error) {
    say("akash", message(error), "error");
  } finally {
    akashConnecting = false;
    emit();
    void updateBalance();
  }
}
function disconnectAkash() {
  if (phase !== "idle") return;
  invalidate();
  signer = null;
  sender = null;
  balance = null;
  amountText = "";
  retryOf = "";
  clearNotice();
  emit();
}
function watchSolana(name: SolanaWalletName, provider: SolanaProvider) {
  if (listening.has(provider) || typeof provider.on !== "function") return;
  listening.add(provider);
  provider.on("accountChanged", () => {
    if (solana?.provider !== provider) return;
    invalidate();
    let next: string | null = null;
    try {
      next = provider.publicKey
        ? publicKey(provider.publicKey.toString(), true)
        : null;
    } catch {
      next = null;
    }
    if (next) {
      destination = { text: next, source: "wallet", wallet: name };
      say(
        "solana",
        `${name} account changed. Check the destination before you confirm.`,
        "info",
      );
    } else {
      solana = null;
      destination = { text: "", source: null, wallet: null };
      say("solana", `${name} disconnected.`, "info");
    }
  });
  provider.on("disconnect", () => {
    if (solana?.provider !== provider) return;
    invalidate();
    solana = null;
    destination = { text: "", source: null, wallet: null };
    say("solana", `${name} disconnected.`, "info");
  });
}
async function connectSolana(name: SolanaWalletName) {
  if (phase !== "idle" || connecting()) return;
  solanaConnecting = name;
  invalidate();
  say("solana", `Approve the connection in ${name}.`, "info");
  try {
    const connected = await connectSolanaWallet(name);
    solana = { name, provider: connected.provider };
    watchSolana(name, connected.provider);
    invalidate();
    destination = { text: connected.address, source: "wallet", wallet: name };
    retryOf = "";
    clearNotice();
  } catch (error) {
    say("solana", message(error), "error");
  } finally {
    solanaConnecting = null;
    emit();
  }
}
function disconnectSolana() {
  if (phase !== "idle") return;
  invalidate();
  const provider = solana?.provider;
  solana = null;
  destination = { text: "", source: null, wallet: null };
  clearNotice("solana");
  emit();
  void provider?.disconnect?.().catch(() => {});
}
function setDestination(value: string) {
  if (phase !== "idle") return;
  invalidate();
  destination = { text: value, source: "paste", wallet: null };
  clearNotice("solana");
  emit();
}
function onKeplrChange() {
  invalidate();
  signer = null;
  sender = null;
  balance = null;
  say(
    "general",
    "Keplr account changed. Reconnect to confirm the sender. Saved transfers continue to be tracked.",
    "info",
  );
}
function setAmount(value: string) {
  amountText = value;
  if (phase === "idle") clearNotice("transfer");
  invalidate();
  emit();
}
function setMax() {
  if (maxAmount() > 0n) setAmount(formatAmount(maxAmount(), style.decimal));
}
function retry(txHash: string) {
  const saved = visible().find((item) => item.txHash === txHash);
  if (!saved || phase !== "idle") return;
  if (!transferStatus(saved, observation(saved)).retryable) return;
  invalidate();
  solana = null;
  destination = { text: saved.recipient, source: "retry", wallet: null };
  amountText = formatAmount(saved.amountUakt, style.decimal);
  retryOf = saved.transferId ?? shortenIdentifier(saved.txHash);
  result = null;
  clearNotice();
  emit();
}
function finishResult() {
  if (phase !== "idle") return;
  result = null;
  if (destination.source !== "wallet")
    destination = { text: "", source: null, wallet: null };
  invalidate();
  emit();
}
async function transfer() {
  const checked = checkDestination(destination.text);
  if (
    phase !== "idle" ||
    connecting() ||
    !secure ||
    !config ||
    !sender ||
    !signer ||
    checked.state !== "valid"
  )
    return;
  phase = "preparing";
  notice = null;
  result = null;
  emit();
  const requestGeneration = generation;
  const walletSource = destination.source === "wallet" ? solana : null;
  let client: ReturnType<typeof signingClient> | null = null;
  try {
    if (
      destination.source === "wallet" &&
      walletSource?.provider.publicKey?.toString() !== checked.address
    )
      throw new Error(
        "Your Solana wallet changed. Check the destination and try again.",
      );
    const next = parseConfig(await api("/api/config"));
    adoptConfig(next);
    if (clientPause(next.client)) throw new Error(clientPause(next.client));
    if (generation !== requestGeneration)
      throw new Error("Transfer settings changed. Review and submit again.");
    if (!next.limits.enabled) throw new Error("New deposits are paused");
    const value = amount();
    if (value < BigInt(next.limits.minTransferUakt))
      throw new Error("Amount is below the per-transfer minimum");
    if (value > BigInt(next.limits.maxTransferUakt))
      throw new Error("Amount exceeds the per-transfer limit");
    const currentSender = sender;
    if (!currentSender) throw new Error("Reconnect Keplr");
    const liveBalance = await readBalance(next, currentSender);
    if (value + BigInt(next.fee.amountUakt) > liveBalance)
      throw new Error("Insufficient AKT for this transfer and its fee");
    const liveSigner = await getSigner(keplrProvider(), next.network.chainId);
    if (
      generation !== requestGeneration ||
      (await signerAddress(liveSigner)) !== currentSender
    )
      throw new Error("Wallet or amount changed. Review and submit again.");
    const intent = Object.freeze({
      config: next,
      sender: currentSender,
      recipient: checked.address,
      amountUakt: value.toString(),
      generation: requestGeneration,
      expiresAt: Date.now() + 300_000,
      nonce: crypto.randomUUID(),
      origin: location.origin,
    });
    const currentClient = signingClient(next, liveSigner);
    client = currentClient;
    const outcome = await submitIntent(intent, {
      generation: () => generation,
      now: () => Date.now(),
      sign: (captured) => {
        phase = "signing";
        emit();
        return signDeposit(currentClient, liveSigner, captured);
      },
      save: (saved) => {
        saveSubmission(localStorage, saved);
        submissions = loadSubmissions(localStorage);
      },
      broadcast: async (bytes) => {
        const latestSigner = await getSigner(
          keplrProvider(),
          next.network.chainId,
        );
        const latestAddress = await signerAddress(latestSigner);
        if (
          generation !== intent.generation ||
          latestAddress !== intent.sender ||
          (walletSource &&
            walletSource.provider.publicKey?.toString() !== intent.recipient) ||
          Date.now() > intent.expiresAt
        )
          throw new Error(
            "Wallet or approval changed before transmission; this saved hash may not have been sent",
          );
        return currentClient.broadcastTxSync(bytes);
      },
      stage: () => {},
      saved: (saved) => {
        phase = "submitting";
        // The signed intent is already saved. Clear the next form without
        // invalidating the captured intent before its one broadcast attempt.
        amountText = "";
        retryOf = "";
        result = {
          txHash: saved.txHash,
          networkKey: saved.networkKey,
          kind: "submitting",
          message: "",
        };
        emit();
      },
    });
    // Preserve an observed CheckTx rejection in memory even if the second
    // storage write failed. A later verified chain receipt still takes priority.
    const learned = submissions.find(
      (item) =>
        item.txHash === outcome.submission.txHash &&
        item.networkKey === outcome.submission.networkKey,
    );
    submissions = [
      {
        ...outcome.submission,
        ...(learned?.transferId ? { transferId: learned.transferId } : {}),
      },
      ...submissions.filter(
        (item) =>
          item.txHash !== outcome.submission.txHash ||
          item.networkKey !== outcome.submission.networkKey,
      ),
    ];
    result = {
      txHash: outcome.submission.txHash,
      networkKey: outcome.submission.networkKey,
      kind: outcome.kind,
      message: outcome.kind === "accepted" ? "" : outcome.message,
    };
    emit();
    void refreshReceipt(outcome.submission);
  } catch (error) {
    say("transfer", message(error), "error");
  } finally {
    client?.disconnect();
    phase = "idle";
    emit();
    void updateBalance();
  }
}
export type LookupResult =
  | { kind: "local"; txHash: string }
  | { kind: "remote"; link: string }
  | { kind: "none"; message: string };
// Accepts a ledger (sink record) ID or a transaction hash in any letter case.
async function lookup(query: string): Promise<LookupResult> {
  const value = query.trim();
  if (!value) return { kind: "none", message: "" };
  const local = visible().find(
    (item) => item.txHash === value.toUpperCase() || item.transferId === value,
  );
  if (local) return { kind: "local", txHash: local.txHash };
  const current = config;
  if (!current)
    return { kind: "none", message: "The page is still loading. Try again." };
  let parsed: ReturnType<typeof parseLookup>;
  try {
    parsed = parseLookup(value);
  } catch {
    return {
      kind: "none",
      message: "Enter a ledger ID or a 64-character transaction hash.",
    };
  }
  const missing = "No transfer found with that ID. Check it and try again.";
  let receipt: BridgeReceipt;
  try {
    receipt = parseReceipt(
      await api(
        `/api/receipt?${parsed.kind === "transaction" ? `tx=${parsed.hash}` : `id=${parsed.id}`}`,
      ),
    );
    matchReceipt(receipt, current.network.networkKey, parsed);
  } catch (error) {
    return {
      kind: "none",
      message: /no sink record|not found/i.test(message(error))
        ? missing
        : `Couldn’t check that transfer: ${message(error)}`,
    };
  }
  if (receipt.kind === "unknown") return { kind: "none", message: missing };
  return {
    kind: "remote",
    link:
      parsed.kind === "transaction"
        ? transactionLink(parsed.hash, current.network.networkKey)
        : recordLink(parsed.id, current.network.networkKey),
  };
}
function onStorage(event: StorageEvent) {
  if (event.key !== "akt-bridge-submissions-v1") return;
  try {
    submissions = loadSubmissions(localStorage);
    historyError = "";
    void pollTransfers();
  } catch (error) {
    historyError = message(error);
  }
  emit();
}
function start() {
  try {
    submissions = loadSubmissions(localStorage);
  } catch (error) {
    historyError = message(error);
  }
  emit();
  void refreshNetwork().then(() => void pollTransfers());
  window.addEventListener("keplr_keystorechange", onKeplrChange);
  window.addEventListener("storage", onStorage);
  const networkTimer = setInterval(() => {
    void refreshNetwork();
  }, 15_000);
  const receiptTimer = setInterval(() => {
    void pollTransfers();
  }, 5_000);
  return () => {
    clearInterval(networkTimer);
    clearInterval(receiptTimer);
    window.removeEventListener("keplr_keystorechange", onKeplrChange);
    window.removeEventListener("storage", onStorage);
  };
}

// One controller owns asynchronous wallet operations. React observes immutable
// snapshots, so an amount/account change still invalidates an in-flight intent.
let amountText = "";
let status: DeveloperStatus | null = null;
let statusError = "";
const listeners = new Set<() => void>();
function blocker(
  value: bigint | null,
  amountError: string,
  over: boolean,
  limit: boolean,
  minimum: bigint | null,
) {
  const checked = checkDestination(destination.text);
  if (!secure) return "Open the secure HTTPS page to connect wallets.";
  if (!config) return "Loading network settings…";
  if (!config.limits.enabled) return "New deposits are paused.";
  if (clientPause(config.client)) return "New transfers are paused.";
  if (historyError)
    return "Saved transfers can’t be read. Record your transaction hashes before clearing them.";
  if (!sender) return "Connect Keplr to continue.";
  if (checked.state === "empty")
    return "Connect your Solana wallet or paste an address.";
  if (checked.state !== "valid") return "Fix the Solana address to continue.";
  if (!amountText.trim()) return "Enter how much AKT to send.";
  if (amountError) return "Fix the amount to continue.";
  if (value === null) return "Enter an amount greater than 0.";
  if (minimum !== null)
    return `Raise the amount to at least ${displayAmount(minimum)} AKT.`;
  if (balance === null) return "Loading your Keplr balance…";
  if (over) return "Lower the amount so your balance covers the network fee.";
  if (limit) return "Lower the amount to the per-transfer limit.";
  return "";
}
function readSnapshot() {
  const checkedAmount = checkAmount(amountText, style);
  const value = checkedAmount.state === "valid" ? checkedAmount.amount : null;
  const amountError =
    checkedAmount.state === "invalid" ? checkedAmount.message : "";
  const networkFee = fee();
  const over =
    value !== null &&
    balance !== null &&
    networkFee !== null &&
    value + networkFee > balance;
  const limit =
    value !== null &&
    config !== null &&
    value > BigInt(config.limits.maxTransferUakt);
  const below =
    value !== null &&
    config !== null &&
    value < BigInt(config.limits.minTransferUakt);
  const reason = blocker(
    value,
    amountError,
    over,
    limit,
    below && config ? BigInt(config.limits.minTransferUakt) : null,
  );
  const items = visible().map((saved) => ({
    ...saved,
    status: transferStatus(saved, observation(saved)),
  }));
  return {
    config,
    secure,
    sender,
    balance,
    fee: networkFee,
    akashConnecting,
    solanaConnecting,
    solanaWallet: solana?.name ?? null,
    destination: { ...destination, check: checkDestination(destination.text) },
    retryOf,
    busy: phase !== "idle",
    signing: phase === "preparing" || phase === "signing",
    phase,
    amountText,
    decimalMark: style.decimal,
    amount: value,
    amountError,
    over,
    maxAmount: maxAmount(),
    notice,
    result,
    historyError,
    discoveryError,
    discoveryBusy,
    status,
    statusError,
    submissions: items,
    canConnect: secure && Boolean(config) && phase === "idle" && !connecting(),
    blocker: reason,
    canReview:
      !reason &&
      Boolean(config && fresh(config.checkedAt)) &&
      phase === "idle" &&
      !connecting(),
  };
}
let snapshot = readSnapshot();
function emit() {
  snapshot = readSnapshot();
  listeners.forEach((listener) => listener());
}
export const bridge = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  start,
  connectAkash,
  disconnectAkash,
  connectSolana,
  disconnectSolana,
  setDestination,
  setAmount,
  setMax,
  retry,
  transfer,
  finishResult,
  lookup,
};
export type BridgeState = ReturnType<typeof bridge.getSnapshot>;
export type TransferItem = BridgeState["submissions"][number];
