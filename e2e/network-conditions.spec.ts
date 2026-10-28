import type { Page } from "@playwright/test";
import { expect, test } from "./fixture/base-test";
import { handleBroadcasts } from "./fixture/broadcast";
import { formatAkt } from "./fixture/network";
import {
  changeNetworkIdentity,
  overridePortalConfig,
  type ConfigEdit,
} from "./fixture/portal-config";
import { testEnvConfig } from "./fixture/test-env.config";
import { ReviewDialog } from "./pages/ReviewDialog";
import { TransferDetailsDialog } from "./pages/TransferDetailsDialog";
import { TransferPage } from "./pages/TransferPage";
import { TransfersSection } from "./pages/TransfersSection";

const UINT64_MAX = "18446744073709551615";
const LIMITS_QUESTION = "Is there a minimum or maximum amount?";
const CLIENT_PAUSE =
  "New transfers are paused because Solana can’t verify Akash right now. An operator needs to restore it. AKT from transfers you already sent stays held on Akash until then.";

// Each test rewrites the portal's network settings inside the browser, so it
// can show states the shared testnet is rarely in without touching the network.
test.describe("Network conditions", () => {
  test.describe("Light client", () => {
    for (const status of ["expired", "frozen"] as const) {
      test(`pauses new transfers while the client is ${status}`, async ({
        page,
      }) => {
        const { transferPage } = await setup(page, (config) => {
          config.client.status = status;
        });

        await expect(transferPage.clientNotice).toHaveText(CLIENT_PAUSE);
        await expect(transferPage.transferCard).toContainText(
          "New transfers are paused.",
        );
        await expect(transferPage.reviewButton).toBeDisabled();
      });
    }

    test("resumes transfers once the client is active again", async ({
      page,
    }) => {
      await page.clock.install();
      const { transferPage, settings } = await setup(page, (config) => {
        config.client.status = "expired";
      });
      await expect(transferPage.clientNotice).toBeVisible();

      settings.edit(null);
      await page.clock.fastForward(15_000);

      await expect(transferPage.clientNotice).toBeHidden();
      await expect(transferPage.transferCard).toContainText(
        "Connect Keplr to continue.",
      );
    });
  });

  test("explains that new deposits are paused", async ({ page }) => {
    const { transferPage } = await setup(page, (config) => {
      config.limits.enabled = false;
    });

    await expect(transferPage.transferCard).toContainText(
      "New deposits are paused.",
    );
    await expect(transferPage.reviewButton).toBeDisabled();
  });

  test.describe("Transfer limits", () => {
    test("shows the range when the network sets a maximum", async ({
      page,
    }) => {
      const { transferPage } = await setup(page, (config) => {
        config.limits.minTransferUakt = "1000000";
        config.limits.maxTransferUakt = "50000000";
      });

      await transferPage.faqQuestion(LIMITS_QUESTION).click();

      await expect(transferPage.transferCard).toContainText(
        "From 1.00 to 50.00 AKT per transfer.",
      );
      await expect(transferPage.faq).toContainText(
        "Each transfer must be at least 1.00 AKT and can be up to 50.00 AKT,",
      );
    });

    test("shows the daily amount each account can send", async ({ page }) => {
      const { transferPage } = await setup(page, (config) => {
        config.limits.maxDailyAmountPerAccountUakt = "100000000";
      });

      await transferPage.faqQuestion(LIMITS_QUESTION).click();

      await expect(transferPage.transferCard).toContainText(
        "Up to 100.00 AKT per account each UTC day.",
      );
      await expect(transferPage.faq).toContainText(
        "Each account can send up to 100.00 AKT in total each UTC day.",
      );
    });

    test("says there are no limits when the network sets none", async ({
      page,
    }) => {
      const { transferPage } = await setup(page, (config) => {
        config.limits.minTransferUakt = "0";
        config.limits.maxTransferUakt = UINT64_MAX;
        config.limits.maxDailyAmountPerAccountUakt = "0";
      });

      await transferPage.faqQuestion(LIMITS_QUESTION).click();

      await expect(transferPage.transferCard).toContainText(
        "No minimum or maximum.",
      );
      await expect(transferPage.faq).toContainText("No. Send any amount,");
    });
  });

  test.describe("Untrusted settings", () => {
    test("refuses settings whose identity does not match their key", async ({
      page,
      network,
    }) => {
      await overridePortalConfig(page, (config) => {
        config.network.mint = network.program;
      });
      const transferPage = new TransferPage(page);

      await transferPage.goto();

      await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
        "Transfers unavailable: Inconsistent network identity",
      );
      await expect(transferPage.connectKeplrButton).toBeDisabled();
    });

    test("reports settings that cannot be loaded", async ({ page }) => {
      const settings = await overridePortalConfig(page);
      settings.fail(503, "Akash node unavailable");
      const transferPage = new TransferPage(page);

      await transferPage.goto();

      await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
        "Transfers unavailable: Akash node unavailable",
      );
      await expect(transferPage.connectKeplrButton).toBeDisabled();
    });
  });

  for (const [label, skewMs] of [
    ["fast", 15 * 60_000],
    ["slow", -15 * 60_000],
  ] as const) {
    test(`works when the computer clock is 15 minutes ${label}`, async ({
      page,
    }) => {
      await page.clock.install({ time: Date.now() + skewMs });
      const { transferPage } = await setup(page);
      const transfers = new TransfersSection(page);
      const details = new TransferDetailsDialog(page);

      await transfers.track("1");

      await expect(details.dialog).toContainText("Completed");
      await expect(transferPage.transferCard.getByRole("alert")).toHaveCount(0);
    });
  }

  test.describe("with a connected wallet", () => {
    test.use({ akashWallet: "unfunded", allowSigning: false });

    test("asks to reconnect Keplr when the testnet is rebuilt", async ({
      page,
    }) => {
      await page.clock.install();
      const { transferPage, settings } = await setup(page);
      await transferPage.connectKeplr();
      await expect(transferPage.disconnectKeplrButton).toBeVisible();

      settings.edit((config) =>
        changeNetworkIdentity(config, {
          akashGenesisTime: "2026-11-01T00:00:00.000000000Z",
        }),
      );
      await page.clock.fastForward(15_000);

      await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
        "The testnet identity changed. Reconnect Keplr before another transfer.",
      );
      await expect(transferPage.connectKeplrButton).toBeVisible();
    });
  });

  test.describe("with a funded wallet", () => {
    test.skip(
      !testEnvConfig.TEST_WALLET_MNEMONIC,
      "Set TEST_WALLET_MNEMONIC in e2e/.env.local",
    );
    test.use({ akashWallet: "funded", allowSigning: false });

    test("fills Max up to the per-transfer maximum", async ({ page }) => {
      const { transferPage } = await setupFunded(page, (config) => {
        config.limits.maxTransferUakt = "2000000";
      });

      await transferPage.maxButton.click();

      await expect(transferPage.amountInput).toHaveValue("2");
    });

    test("blocks amounts above the per-transfer maximum", async ({
      page,
      wallets,
    }) => {
      const { transferPage } = await setupFunded(page, (config) => {
        config.limits.maxTransferUakt = "2000000";
      });
      await transferPage.pasteDestination(wallets.solanaAddress);

      await transferPage.enterAmount("5");

      await expect(transferPage.transferCard).toContainText(
        "Lower the amount to the per-transfer limit.",
      );
      await expect(transferPage.reviewButton).toBeDisabled();
    });

    test("disables Max when the balance cannot reach the minimum", async ({
      page,
      wallets,
    }) => {
      const minimum = 1_000_000_000_000_000n;
      const transferPage = new TransferPage(page);
      await overridePortalConfig(page, (config) => {
        config.limits.minTransferUakt = minimum.toString();
      });
      await transferPage.goto();
      await transferPage.connectKeplr();
      await expect(transferPage.balanceLabel).toHaveText(
        /^Balance\s+[\d,]+\.\d{2,6} AKT$/,
      );
      await transferPage.pasteDestination(wallets.solanaAddress);

      await transferPage.enterAmount("1");

      await expect(transferPage.maxButton).toBeDisabled();
      await expect(transferPage.transferCard).toContainText(
        `Raise the amount to at least ${formatAkt(minimum)} AKT.`,
      );
    });

    test.describe("when the settings change during the review", () => {
      test("stops before signing if Solana stops verifying Akash", async ({
        page,
        wallets,
      }) => {
        const { review, settings, broadcasts } = await setupReview(
          page,
          wallets.solanaAddress,
        );
        settings.edit((config) => {
          config.client.status = "expired";
        });

        await review.confirmButton.click();

        await expect(review.dialog.getByRole("alert")).toHaveText(CLIENT_PAUSE);
        expect(wallets.cosmosSignRequests).toBe(0);
        expect(broadcasts.hashes).toHaveLength(0);
      });

      test("asks for a new review if the network fee changes", async ({
        page,
        network,
        wallets,
      }) => {
        const { review, settings, broadcasts } = await setupReview(
          page,
          wallets.solanaAddress,
        );
        settings.edit((config) => {
          config.fee.amountUakt = (network.feeUakt + 1n).toString();
        });

        await review.confirmButton.click();

        await expect(review.dialog.getByRole("alert")).toHaveText(
          "Transfer settings changed. Review and submit again.",
        );
        expect(wallets.cosmosSignRequests).toBe(0);
        expect(broadcasts.hashes).toHaveLength(0);
      });
    });

    // Waits for the balance before typing; see transfer-review.spec.ts.
    async function setupFunded(page: Page, edit: ConfigEdit | null = null) {
      const { transferPage, settings } = await setup(page, edit);
      await transferPage.connectKeplr();
      await expect(transferPage.maxButton).toBeEnabled();
      return { transferPage, settings };
    }

    // Keplr refuses to sign here and broadcasts are dropped in the browser,
    // so even a regression in these checks cannot send a deposit.
    async function setupReview(page: Page, destination: string) {
      const broadcasts = await handleBroadcasts(page, "drop");
      const { transferPage, settings } = await setupFunded(page);
      const review = new ReviewDialog(page);
      await transferPage.pasteDestination(destination);
      await transferPage.enterAmount("1");
      await transferPage.openReview();
      await review.acknowledgeAll();
      return { review, settings, broadcasts };
    }
  });

  async function setup(page: Page, edit: ConfigEdit | null = null) {
    const settings = await overridePortalConfig(page, edit);
    const transferPage = new TransferPage(page);
    await transferPage.goto();
    await expect(transferPage.connectKeplrButton).toBeEnabled();
    return { transferPage, settings };
  }
});
