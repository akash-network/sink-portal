import type { Page } from "@playwright/test";
import type { BridgeConfig } from "../../contracts";

export type ConfigEdit = (config: BridgeConfig) => void;

export interface PortalConfigOverride {
  // Applies to every later /api/config response, including the one the page
  // fetches again right before it asks Keplr to sign.
  edit(next: ConfigEdit | null): void;
  fail(status: number, error: string): void;
}

// Rewrites the portal's network settings inside this page only. The live
// response is fetched first, so everything not edited stays real, and the
// Node-side request fixture still reads the unmodified settings.
export async function overridePortalConfig(
  page: Page,
  initial: ConfigEdit | null = null,
): Promise<PortalConfigOverride> {
  let edit = initial;
  let failure: { status: number; error: string } | null = null;
  await page.route("**/api/config", async (route) => {
    if (failure)
      return route.fulfill({
        status: failure.status,
        json: { error: failure.error },
      });
    const response = await route.fetch();
    const config = (await response.json()) as BridgeConfig;
    edit?.(config);
    await route.fulfill({ response, json: config });
  });
  return {
    edit(next) {
      failure = null;
      edit = next;
    },
    fail(status, error) {
      failure = { status, error };
    },
  };
}

// Changes identity fields and rebuilds the key the portal checks them against.
export function changeNetworkIdentity(
  config: BridgeConfig,
  change: Partial<Omit<BridgeConfig["network"], "networkKey">>,
) {
  const network = Object.assign(config.network, change);
  network.networkKey = JSON.stringify([
    network.chainId,
    network.akashGenesisTime,
    network.solanaGenesisHash,
    network.program,
    network.mint,
    network.sinkAddress,
  ]);
}
