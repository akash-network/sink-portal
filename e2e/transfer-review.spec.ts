import type { Page } from "@playwright/test";
import { holdFirstBalanceRead } from "./fixture/balance";
import { expect, test } from "./fixture/base-test";
import { formatAkt } from "./fixture/network";
import { scrollAfterWheel } from "./fixture/page-checks";
import { testEnvConfig } from "./fixture/test-env.config";
import { ReviewDialog } from "./pages/ReviewDialog";
import { TransferPage } from "./pages/TransferPage";

test.describe("Transfer review with a funded wallet", () => {
  test.skip(
    !testEnvConfig.TEST_WALLET_MNEMONIC,
    "Set TEST_WALLET_MNEMONIC in e2e/.env.local",
  );
  test.use({ akashWallet: "funded", allowSigning: false });

  test("keeps a balance that loads while the amount is typed", async ({
    page,
    wallets,
  }) => {
    test.fail(
      !testEnvConfig.E2E_LOCAL_UI,
      "The deployed portal discards this read until its next refresh",
    );
    const balanceRead = await holdFirstBalanceRead(page);
    const transferPage = new TransferPage(page);
    await transferPage.goto();
    await transferPage.connectKeplr();
    await balanceRead.started;
    await transferPage.pasteDestination(wallets.solanaAddress);
    await transferPage.enterAmount("1");

    balanceRead.release();

    // Well inside the portal's 15-second refresh, which would also fill it.
    await expect(transferPage.maxButton).toBeEnabled({ timeout: 5_000 });
    await expect(transferPage.reviewButton).toBeEnabled();
  });

  test("fills the maximum amount that still covers the network fee", async ({
    page,
    wallets,
  }) => {
    const { transferPage, balance } = await setup(page);

    await transferPage.maxButton.click();

    await expect(transferPage.transferCard).toMatchAriaSnapshot(`
      - term: Total from Keplr
      - definition: ${balance}
    `);
    expect(wallets.cosmosSignRequests).toBe(0);
  });

  test("blocks amounts below the network minimum", async ({
    page,
    network,
    wallets,
  }) => {
    test.skip(network.minTransferUakt === 0n, "The network has no minimum");
    const { transferPage } = await setup(page);
    await transferPage.pasteDestination(wallets.solanaAddress);

    await transferPage.enterAmount(formatAkt(network.minTransferUakt / 2n));

    await expect(transferPage.transferCard).toContainText(
      `Raise the amount to at least ${formatAkt(network.minTransferUakt)} AKT.`,
    );
    await expect(transferPage.reviewButton).toBeDisabled();
  });

  test("offers the maximum when the amount exceeds the balance", async ({
    page,
    wallets,
  }) => {
    const { transferPage, balance } = await setup(page);
    await transferPage.pasteDestination(wallets.solanaAddress);
    await transferPage.enterAmount("999999999");
    await expect(transferPage.reviewButton).toBeDisabled();

    await transferPage.sendMaxInsteadButton.click();

    await expect(transferPage.transferCard).toMatchAriaSnapshot(`
      - term: Total from Keplr
      - definition: ${balance}
    `);
    await expect(transferPage.reviewButton).toBeEnabled();
  });

  test("requires both acknowledgments before asking Keplr to sign", async ({
    page,
    wallets,
  }) => {
    const { review } = await setupReview(page, wallets.solanaAddress);

    await expect(review.dialog).toContainText(wallets.solanaAddress);
    await expect(review.dialog).toContainText(wallets.akashAddress);
    await expect(review.dialog).toContainText("Pasted address");
    await expect(review.confirmButton).toBeDisabled();
    await review.destinationCheckbox.check();
    await expect(review.confirmButton).toBeDisabled();
    await review.oneWayCheckbox.check();
    await expect(review.confirmButton).toBeEnabled();
    expect(wallets.cosmosSignRequests).toBe(0);
  });

  test("shows the amount, fee and total in the review", async ({
    page,
    network,
    wallets,
  }) => {
    const { review, amountUakt } = await setupReview(
      page,
      wallets.solanaAddress,
    );

    await expect(review.dialog).toContainText(
      `${formatAkt(amountUakt)} AKT → Solana`,
    );
    await expect(review.dialog).toMatchAriaSnapshot(`
      - term: Akash network fee
      - definition: ${formatAkt(network.feeUakt)} AKT
      - term: Total from Keplr
      - definition: ${formatAkt(amountUakt + network.feeUakt)} AKT
      - term: You receive on Solana
      - definition: ${formatAkt(amountUakt)} AKT
    `);
  });

  test("labels a destination that came from Phantom", async ({ page }) => {
    const { transferPage } = await setup(page);
    const review = new ReviewDialog(page);
    await transferPage.connectSolanaWallet("Phantom");
    await transferPage.enterAmount("1");

    await transferPage.openReview();

    await expect(review.dialog).toContainText("From your connected Phantom");
  });

  test("returns to the form with Back", async ({ page, wallets }) => {
    const { transferPage, review } = await setupReview(
      page,
      wallets.solanaAddress,
    );

    await review.backButton.click();

    await expect(review.dialog).toBeHidden();
    await expect(transferPage.reviewButton).toBeFocused();
    await expect(transferPage.amountInput).not.toHaveValue("");
  });

  test("closes the review with Escape", async ({ page, wallets }) => {
    const { transferPage, review } = await setupReview(
      page,
      wallets.solanaAddress,
    );

    await page.keyboard.press("Escape");

    await expect(review.dialog).toBeHidden();
    await expect(transferPage.reviewButton).toBeFocused();
  });

  test("clears the acknowledgments when the review is reopened", async ({
    page,
    wallets,
  }) => {
    const { transferPage, review } = await setupReview(
      page,
      wallets.solanaAddress,
    );
    await review.acknowledgeAll();
    await review.backButton.click();

    await transferPage.openReview();

    await expect(review.destinationCheckbox).not.toBeChecked();
    await expect(review.oneWayCheckbox).not.toBeChecked();
  });

  test("locks page scrolling behind the review", async ({ page, wallets }) => {
    const { review } = await setupReview(page, wallets.solanaAddress);
    await expect(review.dialog).toBeVisible();

    expect(await scrollAfterWheel(page)).toBe(0);
  });

  test.describe("in a French Canadian browser", () => {
    test.use({ locale: "fr-CA" });

    test("fills Max with a decimal comma", async ({ page }) => {
      const { transferPage, balance } = await setup(page);

      await transferPage.maxButton.click();

      await expect(transferPage.amountInput).toHaveValue(/^\d+(,\d{1,6})?$/);
      await expect(transferPage.transferCard).toMatchAriaSnapshot(`
        - term: Total from Keplr
        - definition: ${balance}
      `);
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("shows the review inline instead of in a dialog", async ({
      page,
      wallets,
    }) => {
      const { transferPage } = await setup(page);
      const review = new ReviewDialog(page, "inline");
      await transferPage.pasteDestination(wallets.solanaAddress);
      await transferPage.enterAmount("1");

      await transferPage.openReview();

      await expect(review.dialog).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await review.acknowledgeAll();
      await expect(review.confirmButton).toBeEnabled();
    });
  });

  // Waits for the balance before typing. Until the fix in the first test is
  // deployed, an edit during the first read discards it for 15 seconds.
  async function setup(page: Page) {
    const transferPage = new TransferPage(page);
    await transferPage.goto();
    await transferPage.connectKeplr();
    await expect(transferPage.maxButton).toBeEnabled();
    const balance = (await transferPage.balanceLabel.textContent())?.replace(
      /^Balance\s+/,
      "",
    );
    return { transferPage, balance };
  }

  async function setupReview(page: Page, destination: string) {
    const { transferPage } = await setup(page);
    const review = new ReviewDialog(page);
    const amountUakt = 1_000_000n;
    await transferPage.pasteDestination(destination);
    await transferPage.enterAmount(formatAkt(amountUakt));
    await transferPage.openReview();
    await expect(review.dialog).toBeVisible();
    return { transferPage, review, amountUakt };
  }
});
