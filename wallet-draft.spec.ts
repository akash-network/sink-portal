import { afterEach, describe, expect, it } from "vitest";
import {
  parseDraft,
  saveDraft,
  takeDraft,
  mobileWalletUrl,
} from "./wallet-draft";
import { walletNetwork } from "./e2e/fixture/wallet-network";
import { solanaDestination } from "./e2e/fixture/wallet/test-wallets";
import { checkDestination } from "./model";

const config = walletNetwork();
const now = Date.now();
const draft = {
  networkKey: config.network.networkKey,
  recipient: solanaDestination(),
  amountUakt: "2000000",
  expiresAt: now + 60_000,
};
afterEach(() => {
  sessionStorage.clear();
  history.replaceState(null, "", "/");
});
describe("unsigned wallet handoff", () => {
  it("accepts a bounded draft for this exact network", () => {
    expect(parseDraft(JSON.stringify(draft), draft.networkKey, now)).toEqual(
      draft,
    );
  });
  it.each([
    { ...draft, networkKey: "another-network" },
    { ...draft, expiresAt: now },
    { ...draft, expiresAt: now + 31 * 60_000 },
    { ...draft, recipient: "not-an-address" },
    { ...draft, amountUakt: "-1" },
  ])("rejects expired, malformed or different-network input", (value) => {
    expect(parseDraft(JSON.stringify(value), draft.networkKey, now)).toBeNull();
  });
  it("consumes storage once and never restores a signer or signed transaction", () => {
    saveDraft(draft);
    expect(takeDraft(draft.networkKey)).toEqual(draft);
    expect(takeDraft(draft.networkKey)).toBeNull();
    expect(
      parseDraft(
        JSON.stringify({ ...draft, signer: "attacker", signedTx: "bytes" }),
        draft.networkKey,
        now,
      ),
    ).toEqual(draft);
  });
  it.each(["Phantom", "Solflare"] as const)(
    "opens the same portal inside %s with only an unsigned draft",
    (wallet) => {
      const url = new URL(
        mobileWalletUrl(
          wallet,
          {
            config,
            amount: 2000000n,
            destination: {
              text: draft.recipient,
              source: "paste",
              wallet: null,
              check: checkDestination(draft.recipient),
            },
          },
          location.origin,
        ),
      );
      const target = new URL(
        decodeURIComponent(
          url.pathname.slice(url.pathname.indexOf("browse/") + 7),
        ),
      );
      expect(target.origin).toBe(location.origin);
      history.replaceState(null, "", target.href);
      expect(takeDraft(draft.networkKey)).toMatchObject({
        recipient: draft.recipient,
        amountUakt: "2000000",
      });
      expect(location.hash).toBe("#transfer");
    },
  );
});
