import type { Page } from "@playwright/test";
import { expect, test } from "./fixture/base-test";
import { formatAkt } from "./fixture/network";
import { OFF_CURVE_SOLANA_ADDRESS } from "./fixture/wallet/test-wallets";
import { TransferPage } from "./pages/TransferPage";

test.describe("Transfer form with an unfunded wallet", () => {
  test.use({ akashWallet: "unfunded", allowSigning: false });

  test("explains what is missing before the review", async ({
    page,
    wallets,
  }) => {
    const { transferPage } = await setup(page);
    await expect(transferPage.transferCard).toContainText(
      "Connect your Solana wallet or paste an address.",
    );

    await transferPage.pasteDestination(wallets.solanaAddress);

    await expect(transferPage.transferCard).toContainText(
      "Enter how much AKT to send.",
    );
    await expect(transferPage.reviewButton).toBeDisabled();
  });

  test("confirms a valid pasted address", async ({ page, wallets }) => {
    const { transferPage } = await setup(page);

    await transferPage.pasteDestination(wallets.solanaAddress);

    await expect(transferPage.transferCard).toContainText(
      "Valid Solana address. You’ll check it once more before you confirm.",
    );
  });

  test("rejects text that cannot be a Solana address", async ({ page }) => {
    const { transferPage } = await setup(page);

    await transferPage.pasteDestination("0xNotASolanaAddress");

    await expect(transferPage.transferCard.getByRole("alert")).toContainText(
      "That isn’t a valid Solana address.",
    );
    await expect(transferPage.destinationInput).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("rejects an address that is not a wallet", async ({ page }) => {
    const { transferPage } = await setup(page);

    await transferPage.pasteDestination(OFF_CURVE_SOLANA_ADDRESS);

    await expect(transferPage.transferCard.getByRole("alert")).toContainText(
      "That isn’t a wallet address.",
    );
  });

  test("blocks the review when the balance cannot cover amount and fee", async ({
    page,
    network,
    wallets,
  }) => {
    const { transferPage } = await setup(page);
    await transferPage.pasteDestination(wallets.solanaAddress);

    await transferPage.enterAmount("5");

    const needed = formatAkt(5_000_000n + network.feeUakt);
    await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
      `Not enough AKT. This transfer needs ${needed} AKT with the network fee, and your balance is 0.00 AKT.`,
    );
    await expect(transferPage.reviewButton).toBeDisabled();
    await expect(transferPage.maxButton).toBeDisabled();
    expect(wallets.cosmosSignRequests).toBe(0);
  });

  test("rejects amounts written with thousands separators", async ({
    page,
  }) => {
    const { transferPage } = await setup(page);

    await transferPage.enterAmount("1,248.5");

    await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
      "Use a period for decimals and no commas or spaces, for example 1248.5.",
    );
    await expect(transferPage.amountInput).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("rejects more than six decimal places", async ({ page, wallets }) => {
    const { transferPage } = await setup(page);
    await transferPage.pasteDestination(wallets.solanaAddress);

    await transferPage.enterAmount("1.1234567");

    await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
      "AKT has at most 6 decimal places.",
    );
    await expect(transferPage.transferCard).toContainText(
      "Fix the amount to continue.",
    );
  });

  test.describe("in a French Canadian browser", () => {
    test.use({ locale: "fr-CA" });

    test("shows amounts and limits with a decimal comma", async ({
      page,
      network,
    }) => {
      const { transferPage } = await setup(page, ",");

      await expect(transferPage.amountInput).toHaveAttribute(
        "placeholder",
        "0,00",
      );
      await expect(transferPage.transferCard).toContainText(
        `At least ${formatAkt(network.minTransferUakt, ",")} AKT per transfer.`,
      );
    });

    test("reads a decimal comma in the amount", async ({
      page,
      network,
      wallets,
    }) => {
      const { transferPage } = await setup(page, ",");
      await transferPage.pasteDestination(wallets.solanaAddress);

      await transferPage.enterAmount("1,5");

      const needed = formatAkt(1_500_000n + network.feeUakt, ",");
      await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
        `Not enough AKT. This transfer needs ${needed} AKT with the network fee, and your balance is 0,00 AKT.`,
      );
    });

    test("rejects a period as the decimal mark", async ({ page }) => {
      const { transferPage } = await setup(page, ",");

      await transferPage.enterAmount("1.5");

      await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
        "Use a comma for decimals and no periods or spaces, for example 1248,5.",
      );
    });
  });

  async function setup(page: Page, decimal: "." | "," = ".") {
    const transferPage = new TransferPage(page);
    await transferPage.goto();
    await transferPage.connectKeplr();
    await expect(transferPage.transferCard).toContainText(
      `Balance ${formatAkt(0n, decimal)} AKT`,
    );
    return { transferPage };
  }
});
