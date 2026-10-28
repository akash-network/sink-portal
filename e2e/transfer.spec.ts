import type { APIRequestContext, Page } from "@playwright/test";
import { akashSigner, expect, test } from "./fixture/base-test";
import { handleBroadcasts, type BroadcastMode } from "./fixture/broadcast";
import { formatAkt, readReceipt, type PortalNetwork } from "./fixture/network";
import { testEnvConfig } from "./fixture/test-env.config";
import { injectWallets } from "./fixture/wallet/inject-wallets";
import {
  solanaDestination,
  VOIDED_SOLANA_ADDRESS,
} from "./fixture/wallet/test-wallets";
import { ReceiptDialog } from "./pages/ReceiptDialog";
import { ReviewDialog } from "./pages/ReviewDialog";
import { TransferPage } from "./pages/TransferPage";
import { TransfersSection } from "./pages/TransfersSection";

// Every test here sends a real deposit from the shared wallet.
test.describe("Transfers on the testnet", () => {
  test.skip(
    !testEnvConfig.TEST_WALLET_MNEMONIC || !testEnvConfig.E2E_SEND_TRANSFER,
    "Set TEST_WALLET_MNEMONIC and E2E_SEND_TRANSFER=true to spend testnet AKT",
  );
  // A retry would send a second deposit.
  test.describe.configure({ retries: 0 });
  test.use({ akashWallet: "funded", allowSigning: true });

  test("moves the minimum amount and reports the finalized mint", async ({
    page,
    request,
    network,
    wallets,
    browser,
    baseURL,
  }) => {
    test.setTimeout(12 * 60_000);
    const { broadcasts, receipt, transfers, amountUakt } = await submit(page, {
      mode: "observe",
      network,
      destination: "Phantom",
    });

    await test.step("sign once and broadcast once", async () => {
      await expect(receipt.dialog).toHaveAccessibleName("Deposit submitted");
      await expect(receipt.copyLedgerIdButton).toBeEnabled({
        timeout: 60_000,
      });
      expect(broadcasts.hashes).toHaveLength(1);
      expect(wallets.cosmosSignRequests).toBe(1);
      expect(wallets.solanaSignRequests).toBe(0);
    });

    const settled = await waitForOutcome(
      request,
      broadcasts.hashes[0],
      (found) => found?.solana?.kind === "minted",
    );

    await test.step("record exactly what was signed", async () => {
      expect(settled.deposit).toMatchObject({
        sender: wallets.akashAddress,
        recipient: wallets.solanaAddress,
        amountUakt: amountUakt.toString(),
      });
    });

    await test.step("show the transfer as completed", async () => {
      await receipt.doneButton.click();
      await expect(transfers.row(settled.deposit.id)).toContainText(
        "Completed",
        { timeout: 60_000 },
      );
    });

    await test.step("find the transfer in a fresh browser", async () => {
      const context = await browser.newContext({ baseURL });
      const freshPage = await context.newPage();
      await injectWallets(freshPage, {
        akash: await akashSigner("funded"),
        keplr: "approve",
        solanaWallets: ["Phantom"],
        solanaAddress: solanaDestination(),
        chainId: network.chainId,
        allowSigning: false,
      });
      const freshTransferPage = new TransferPage(freshPage);
      await freshTransferPage.goto();
      await freshTransferPage.connectKeplr();
      await expect(
        new TransfersSection(freshPage).row(settled.deposit.id),
      ).toContainText("Completed");
      await context.close();
    });
  });

  test("recovers a transfer whose broadcast reply was lost", async ({
    page,
    request,
    network,
    wallets,
  }) => {
    test.setTimeout(12 * 60_000);
    const { broadcasts, receipt, transfers } = await submit(page, {
      mode: "forward-and-drop",
      network,
      destination: solanaDestination(),
    });
    await expect(receipt.dialog).toHaveAccessibleName("Checking your deposit");
    await receipt.doneButton.click();

    await page.reload();

    await expect(transfers.rowByHash(broadcasts.hashes[0])).toBeVisible();
    await waitForOutcome(
      request,
      broadcasts.hashes[0],
      (found) => found?.solana?.kind === "minted",
    );
    await expect(transfers.rowByHash(broadcasts.hashes[0])).toContainText(
      "Completed",
      { timeout: 60_000 },
    );
    expect(broadcasts.hashes).toHaveLength(1);
    expect(wallets.cosmosSignRequests).toBe(1);
  });

  test("refunds a transfer the mint program cannot deliver", async ({
    page,
    request,
    network,
  }) => {
    test.setTimeout(30 * 60_000);
    const transferPage = new TransferPage(page);
    const { broadcasts, receipt, transfers, amountUakt } = await submit(page, {
      mode: "observe",
      network,
      destination: VOIDED_SOLANA_ADDRESS,
    });
    await expect(receipt.dialog).toHaveAccessibleName("Deposit submitted");
    await receipt.doneButton.click();

    const voided = await waitForOutcome(
      request,
      broadcasts.hashes[0],
      (found) => found?.solana?.kind === "voided",
    );
    const row = transfers.row(voided.deposit.id);
    await expect(row).toContainText(/Refund pending|Refunded/, {
      timeout: 60_000,
    });

    await waitForOutcome(
      request,
      broadcasts.hashes[0],
      (found) => found?.akash?.status === "refunded",
      25 * 60_000,
    );
    await expect(row).toContainText("Refunded", { timeout: 60_000 });
    await expect(row).toContainText("AKT returned to your Keplr wallet");

    await transfers.retryButton(row).click();

    await expect(transferPage.destinationInput).toHaveValue(
      VOIDED_SOLANA_ADDRESS,
    );
    await expect(transferPage.amountInput).toHaveValue(
      formatAkt(amountUakt).replace(/\.00$/, ""),
    );
    await expect(transferPage.transferCard).toContainText(
      `Retrying ${voided.deposit.id}. We filled in the amount and address.`,
    );
  });

  async function submit(
    page: Page,
    input: {
      mode: BroadcastMode;
      network: PortalNetwork;
      destination: "Phantom" | string;
    },
  ) {
    const broadcasts = await handleBroadcasts(page, input.mode);
    const transferPage = new TransferPage(page);
    const review = new ReviewDialog(page);
    const amountUakt = input.network.minTransferUakt || 1_000_000n;
    expect(input.network.depositsEnabled).toBe(true);
    await transferPage.goto();
    await transferPage.connectKeplr();
    await expect(transferPage.maxButton).toBeEnabled();
    if (input.destination === "Phantom")
      await transferPage.connectSolanaWallet("Phantom");
    else await transferPage.pasteDestination(input.destination);
    await transferPage.enterAmount(formatAkt(amountUakt));
    await transferPage.openReview();
    await review.acknowledgeAll();
    await review.confirmButton.click();
    const receipt = new ReceiptDialog(page);
    await expect(receipt.dialog).toBeVisible({ timeout: 60_000 });
    return {
      broadcasts,
      receipt,
      transfers: new TransfersSection(page),
      amountUakt,
    };
  }

  // Polls the receipt API, which reads finalized Solana state.
  async function waitForOutcome(
    request: APIRequestContext,
    txHash: string,
    reached: (receipt: Awaited<ReturnType<typeof readReceipt>>) => boolean,
    timeout = 8 * 60_000,
  ) {
    await expect
      .poll(async () => reached(await readReceipt(request, txHash)), {
        timeout,
        intervals: [5_000],
      })
      .toBe(true);
    return readReceipt(request, txHash);
  }
});
