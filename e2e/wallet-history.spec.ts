import type { Page } from "@playwright/test";
import { expect, test } from "./fixture/base-test";
import { formatAkt, readWalletHistory } from "./fixture/network";
import { testEnvConfig } from "./fixture/test-env.config";
import { TransferDetailsDialog } from "./pages/TransferDetailsDialog";
import { TransferPage } from "./pages/TransferPage";
import { TransfersSection } from "./pages/TransfersSection";

test.describe("Wallet transfer history", () => {
  test.skip(
    !testEnvConfig.TEST_WALLET_MNEMONIC,
    "Set TEST_WALLET_MNEMONIC in e2e/.env.local",
  );
  test.use({ akashWallet: "funded", allowSigning: false });

  test("lists the wallet's transfers in a browser with no saved data", async ({
    page,
    request,
    wallets,
  }) => {
    const history = await readWalletHistory(request, wallets.akashAddress);
    test.skip(history.length === 0, "The wallet has no transfers yet");
    const { transfers } = await setup(page);

    for (const transfer of history)
      await expect(transfers.row(transfer.transferId)).toContainText(
        `${formatAkt(BigInt(transfer.amountUakt))} AKT`,
      );
  });

  test("opens a transfer's details from its View link", async ({
    page,
    request,
    wallets,
  }) => {
    const [latest] = await readWalletHistory(request, wallets.akashAddress);
    test.skip(!latest, "The wallet has no transfers yet");
    const { transfers } = await setup(page);
    const details = new TransferDetailsDialog(page);

    await transfers
      .viewLink(transfers.row(latest.transferId), latest.txHash)
      .click();

    await expect(details.dialog).toContainText(`Ledger ID${latest.transferId}`);
    await expect(details.dialog).toContainText(latest.recipient);
  });

  test("highlights a saved transfer found by its lowercase hash", async ({
    page,
    request,
    wallets,
  }) => {
    const [latest] = await readWalletHistory(request, wallets.akashAddress);
    test.skip(!latest, "The wallet has no transfers yet");
    const { transfers } = await setup(page);
    await expect(transfers.row(latest.transferId)).toBeVisible();

    await transfers.track(latest.txHash.toLowerCase());

    await expect(transfers.region).toContainText(`${latest.transferId} · `);
  });

  test("opens the details of a hash this browser has not seen", async ({
    page,
    request,
    wallets,
  }) => {
    const [latest] = await readWalletHistory(request, wallets.akashAddress);
    test.skip(!latest, "The wallet has no transfers yet");
    const transferPage = new TransferPage(page);
    const transfers = new TransfersSection(page);
    const details = new TransferDetailsDialog(page);
    await transferPage.goto();
    await expect(transferPage.connectKeplrButton).toBeEnabled();

    await transfers.track(latest.txHash.toLowerCase());

    await expect(details.dialog).toContainText(`Ledger ID${latest.transferId}`);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("lists transfers as cards", async ({ page, request, wallets }) => {
      const history = await readWalletHistory(request, wallets.akashAddress);
      test.skip(history.length === 0, "The wallet has no transfers yet");
      const { transfers } = await setup(page);

      await expect(transfers.cards).toHaveCount(history.length);
      await expect(transfers.table).toBeHidden();
    });
  });

  async function setup(page: Page) {
    const transferPage = new TransferPage(page);
    await transferPage.goto();
    await transferPage.connectKeplr();
    await expect(transferPage.maxButton).toBeEnabled();
    return { transferPage, transfers: new TransfersSection(page) };
  }
});
