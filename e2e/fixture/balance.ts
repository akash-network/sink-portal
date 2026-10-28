import type { Page } from "@playwright/test";

const BALANCE_QUERY = "/cosmos.bank.v1beta1.Query/Balance";

export interface HeldBalanceRead {
  started: Promise<void>;
  release(): void;
}

// Holds the page's first bank balance query until release(), like a slow node
// that answers after the user has started typing.
export async function holdFirstBalanceRead(
  page: Page,
): Promise<HeldBalanceRead> {
  let markStarted = () => {};
  let release = () => {};
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  let held = false;
  await page.route("**/rpc/akash", async (route) => {
    const payload = route.request().postDataJSON();
    if (
      !held &&
      payload?.method === "abci_query" &&
      payload.params?.path === BALANCE_QUERY
    ) {
      held = true;
      markStarted();
      await released;
    }
    await route.fallback();
  });
  return { started, release };
}
