import type { Page } from "@playwright/test";
import { expect, test } from "./fixture/base-test";
import { handleBroadcasts, type BroadcastMode } from "./fixture/broadcast";
import { testEnvConfig } from "./fixture/test-env.config";
import { solanaDestination } from "./fixture/wallet/test-wallets";
import { ReceiptDialog } from "./pages/ReceiptDialog";
import { ReviewDialog } from "./pages/ReviewDialog";
import { TransferPage } from "./pages/TransferPage";
import { TransfersSection } from "./pages/TransfersSection";

// Keplr signs for real, but every broadcast is answered inside the browser, so
// nothing reaches the chain and no AKT is spent.
test.describe("Broadcast outcomes", () => {
  test.skip(
    !testEnvConfig.TEST_WALLET_MNEMONIC,
    "Set TEST_WALLET_MNEMONIC in e2e/.env.local",
  );
  test.use({ akashWallet: "funded", allowSigning: true });

  test("saves the transaction before broadcasting and shows the receipt", async ({
    page,
    wallets,
  }) => {
    const { broadcasts, receipt, transfers } = await setup(page, "accept");

    await expect(receipt.dialog).toHaveAccessibleName("Deposit submitted");
    await expect(receipt.dialog).toMatchAriaSnapshot(`
      - term: Status
      - definition: Validation pending
    `);
    await expect(receipt.transactionLink(broadcasts.hashes[0])).toBeVisible();
    expect(broadcasts.hashes).toHaveLength(1);
    expect(wallets.cosmosSignRequests).toBe(1);
    expect(wallets.solanaSignRequests).toBe(0);
    await receipt.doneButton.click();
    await page.reload();
    await expect(transfers.rowByHash(broadcasts.hashes[0])).toContainText(
      "Validation pending",
    );
    expect(broadcasts.hashes).toHaveLength(1);
  });

  test("resets the form for the next transfer after Done", async ({ page }) => {
    const { receipt, transferPage } = await setup(page, "accept");

    await receipt.doneButton.click();

    await expect(receipt.dialog).toBeHidden();
    await expect(transferPage.amountInput).toHaveValue("");
    await expect(transferPage.destinationInput).toHaveValue("");
  });

  test("reports a node rejection without sending again", async ({ page }) => {
    const { broadcasts, receipt, transfers } = await setup(page, "reject");

    await expect(receipt.dialog).toHaveAccessibleName("Deposit not accepted");
    await expect(receipt.dialog).toContainText(
      "Node rejected this submission (code 5): insufficient funds.",
    );
    await receipt.doneButton.click();
    await page.reload();
    await expect(transfers.rowByHash(broadcasts.hashes[0])).toContainText(
      "Submission rejected",
    );
    expect(broadcasts.hashes).toHaveLength(1);
  });

  test("keeps the hash when the reply is lost and never sends it again", async ({
    page,
    wallets,
  }) => {
    const { broadcasts, receipt, transfers } = await setup(page, "drop");

    await expect(receipt.dialog).toHaveAccessibleName("Checking your deposit");
    await expect(receipt.dialog).toContainText(
      "Track the saved hash before sending again.",
    );
    await receipt.doneButton.click();
    await page.reload();
    await expect(transfers.rowByHash(broadcasts.hashes[0])).toBeVisible();
    expect(broadcasts.hashes).toHaveLength(1);
    expect(wallets.cosmosSignRequests).toBe(1);
  });

  test.describe("when the user rejects the signature in Keplr", () => {
    test.use({ allowSigning: false });

    test("shows the rejection and sends nothing", async ({ page, wallets }) => {
      const broadcasts = await handleBroadcasts(page, "accept");
      const transferPage = new TransferPage(page);
      const review = new ReviewDialog(page);
      const transfers = new TransfersSection(page);
      await openConfirmedReview(page, wallets.solanaAddress);

      await review.confirmButton.click();

      await expect(review.dialog.getByRole("alert")).toHaveText(
        "Request rejected",
      );
      await expect(review.confirmButton).toBeEnabled();
      expect(wallets.cosmosSignRequests).toBe(1);
      expect(broadcasts.hashes).toHaveLength(0);
      await review.backButton.click();
      await expect(transferPage.reviewButton).toBeEnabled();
      await expect(
        transfers.table.getByRole("row", { name: /Validation pending/ }),
      ).toHaveCount(0);
    });
  });

  async function openConfirmedReview(page: Page, destination: string) {
    const transferPage = new TransferPage(page);
    const review = new ReviewDialog(page);
    await transferPage.goto();
    await transferPage.connectKeplr();
    await expect(transferPage.maxButton).toBeEnabled();
    await transferPage.pasteDestination(destination);
    await transferPage.enterAmount("1");
    await transferPage.openReview();
    await review.acknowledgeAll();
    return { transferPage, review };
  }

  async function setup(page: Page, mode: BroadcastMode) {
    const broadcasts = await handleBroadcasts(page, mode);
    const { transferPage, review } = await openConfirmedReview(
      page,
      solanaDestination(),
    );
    const receipt = new ReceiptDialog(page);
    await review.confirmButton.click();
    await expect(receipt.dialog).toBeVisible();
    return {
      broadcasts,
      receipt,
      transferPage,
      transfers: new TransfersSection(page),
    };
  }
});
