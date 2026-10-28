import type { Page } from "@playwright/test";
import { expect, test } from "./fixture/base-test";
import type { SolanaWalletName } from "./fixture/wallet/inject-wallets";
import { otherSolanaDestination } from "./fixture/wallet/test-wallets";
import { TransferPage } from "./pages/TransferPage";

test.describe("Wallet connections", () => {
  test.use({ akashWallet: "unfunded", allowSigning: false });

  test.describe("Keplr", () => {
    test("connects through the portal's own endpoints", async ({
      page,
      network,
      wallets,
      baseURL,
    }) => {
      const { transferPage } = await setup(page);

      await expect(transferPage.transferCard).toContainText(
        wallets.akashAddress,
      );
      await expect(transferPage.header).toContainText("0.00 AKT");
      expect(wallets.suggestedChains).toEqual([
        {
          chainId: network.chainId,
          rpc: new URL("/rpc/akash", baseURL).href,
          rest: new URL("/rest/akash", baseURL).href,
        },
      ]);
    });

    test.describe("when the user rejects the connection", () => {
      test.use({ keplr: "reject" });

      test("shows the rejection and stays disconnected", async ({ page }) => {
        const transferPage = new TransferPage(page);
        await transferPage.goto();

        await transferPage.connectKeplr();

        await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
          "Request rejected",
        );
        await expect(transferPage.connectKeplrButton).toBeEnabled();
      });
    });

    test("asks to reconnect when the Keplr account changes", async ({
      page,
      wallets,
    }) => {
      const { transferPage } = await setup(page);

      await wallets.changeKeplrAccount();

      await expect(transferPage.transferCard).toContainText(
        "Keplr account changed. Reconnect to confirm the sender.",
      );
      await expect(transferPage.connectKeplrButton).toBeEnabled();
    });

    test("disconnects and clears the account", async ({ page, wallets }) => {
      const { transferPage } = await setup(page);

      await transferPage.disconnectKeplrButton.click();

      await expect(transferPage.connectKeplrButton).toBeEnabled();
      await expect(transferPage.transferCard).not.toContainText(
        wallets.akashAddress,
      );
    });

    test.describe("with clipboard access", () => {
      test.use({ permissions: ["clipboard-read", "clipboard-write"] });

      test("copies the Akash address", async ({ page, wallets }) => {
        const { transferPage } = await setup(page);

        await transferPage.copyAkashAddressButton.click();

        await expect(transferPage.copyAkashAddressButton).toHaveAccessibleName(
          "Akash address copied",
        );
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
          wallets.akashAddress,
        );
      });

      test("pastes the destination from the clipboard", async ({
        page,
        wallets,
      }) => {
        const { transferPage } = await setup(page);
        await page.evaluate(
          (address) => navigator.clipboard.writeText(` ${address} `),
          wallets.solanaAddress,
        );

        await transferPage.pasteButton.click();

        await expect(transferPage.destinationInput).toHaveValue(
          wallets.solanaAddress,
        );
      });
    });
  });

  test.describe("Solana wallets", () => {
    for (const name of ["Phantom", "Solflare", "Backpack"] as const) {
      test.describe(name, () => {
        test.use({ solanaWallets: [name] });

        test("fills the destination without asking the wallet to sign", async ({
          page,
          wallets,
        }) => {
          const { transferPage } = await setup(page);

          await transferPage.connectSolanaWallet(name);

          await expect(transferPage.transferCard).toContainText(
            `${name} connected · read-only`,
          );
          await expect(transferPage.transferCard).toContainText(
            wallets.solanaAddress,
          );
          expect(wallets.solanaSignRequests).toBe(0);
        });
      });
    }

    test.describe("when no Solana wallet is installed", () => {
      test.use({ solanaWallets: [] });

      test("explains which extension is missing", async ({ page }) => {
        const { transferPage } = await setup(page);

        await transferPage.connectSolanaWallet("Phantom");

        await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
          "Install the Phantom browser extension and open this page over HTTPS.",
        );
      });
    });

    test("follows an account change in Phantom", async ({ page, wallets }) => {
      const { transferPage } = await setupWithPhantom(page);
      const nextAddress = otherSolanaDestination();

      await wallets.switchSolanaAccount(nextAddress);

      await expect(transferPage.transferCard).toContainText(nextAddress);
      await expect(transferPage.transferCard).toContainText(
        "Phantom account changed. Check the destination before you confirm.",
      );
    });

    test("clears the destination when Phantom disconnects itself", async ({
      page,
      wallets,
    }) => {
      const { transferPage } = await setupWithPhantom(page);

      await wallets.disconnectSolana();

      await expect(transferPage.transferCard).toContainText(
        "Phantom disconnected.",
      );
      await expect(transferPage.transferCard).not.toContainText(
        wallets.solanaAddress,
      );
      await expect(transferPage.connectSolanaButton).toBeEnabled();
    });

    test("disconnects Phantom from the portal", async ({ page, wallets }) => {
      const { transferPage } = await setupWithPhantom(page);

      await transferPage.disconnectSolanaButton("Phantom").click();

      await expect(transferPage.connectSolanaButton).toBeEnabled();
      await expect(transferPage.transferCard).not.toContainText(
        wallets.solanaAddress,
      );
    });
  });

  async function setup(page: Page) {
    const transferPage = new TransferPage(page);
    await transferPage.goto();
    await transferPage.connectKeplr();
    await expect(transferPage.transferCard).toContainText("Balance 0.00 AKT");
    return { transferPage };
  }

  async function setupWithPhantom(page: Page) {
    const { transferPage } = await setup(page);
    const wallet: SolanaWalletName = "Phantom";
    await transferPage.connectSolanaWallet(wallet);
    await expect(transferPage.transferCard).toContainText(
      `${wallet} connected · read-only`,
    );
    return { transferPage };
  }
});
