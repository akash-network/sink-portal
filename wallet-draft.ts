import type { BridgeState } from "./controller";
import { publicKey, uint } from "./model";

const key = "sink:unsigned-wallet-draft";
const lifetime = 30 * 60_000;
export interface WalletDraft {
  networkKey: string;
  recipient: string;
  amountUakt: string;
  expiresAt: number;
}
export function draftFromState(
  state: Pick<BridgeState, "config" | "destination" | "amount">,
  now = Date.now(),
): WalletDraft | null {
  if (!state.config) return null;
  return {
    networkKey: state.config.network.networkKey,
    recipient:
      state.destination.check.state === "valid"
        ? state.destination.check.address
        : "",
    amountUakt: state.amount?.toString() ?? "",
    expiresAt: now + lifetime,
  };
}
export function parseDraft(
  text: string,
  networkKey: string,
  now = Date.now(),
): WalletDraft | null {
  if (text.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (
      !value ||
      typeof value !== "object" ||
      !("networkKey" in value) ||
      value.networkKey !== networkKey ||
      !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + lifetime ||
      !("recipient" in value) ||
      typeof value.recipient !== "string" ||
      !("amountUakt" in value) ||
      typeof value.amountUakt !== "string"
    )
      return null;
    return {
      networkKey,
      recipient: value.recipient ? publicKey(value.recipient, true) : "",
      amountUakt: value.amountUakt ? uint(value.amountUakt) : "",
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}
export function saveDraft(draft: WalletDraft | null) {
  try {
    if (draft && (draft.recipient || draft.amountUakt))
      sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch {
    /* Draft persistence is optional; signed history remains mandatory. */
  }
}
export function takeDraft(networkKey: string): WalletDraft | null {
  let text: string | null = null;
  if (location.hash.startsWith("#wallet?")) {
    text = new URLSearchParams(location.hash.slice("#wallet?".length)).get(
      "draft",
    );
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#transfer`,
    );
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    try {
      text = sessionStorage.getItem(key);
    } catch {
      /* Storage may be unavailable. */
    }
  }
  saveDraft(null);
  return text ? parseDraft(text, networkKey) : null;
}
export function mobileWalletUrl(
  wallet: "Phantom" | "Solflare",
  state: Pick<BridgeState, "config" | "destination" | "amount">,
  origin = location.origin,
): string {
  const draft = draftFromState(state);
  const target = new URL(location.pathname, origin);
  target.hash = draft
    ? `wallet?${new URLSearchParams({ draft: JSON.stringify(draft) })}`
    : "transfer";
  const base =
    wallet === "Phantom"
      ? "https://phantom.com/ul/browse/"
      : "https://solflare.com/ul/v1/browse/";
  return `${base}${encodeURIComponent(target.href)}?ref=${encodeURIComponent(origin)}`;
}
