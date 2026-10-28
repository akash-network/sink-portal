import type { Page } from "@playwright/test";
import { expect, test } from "./fixture/base-test";
import { formatAkt } from "./fixture/network";
import {
  collectPageProblems,
  horizontalOverflow,
  loadedFonts,
  productCopy,
  scrollAfterWheel,
} from "./fixture/page-checks";
import { DeveloperPage } from "./pages/DeveloperPage";
import { TransferDetailsDialog } from "./pages/TransferDetailsDialog";
import { TransferPage } from "./pages/TransferPage";
import { TransfersSection } from "./pages/TransfersSection";

// The long library probes for WebAssembly at import time and falls back to
// plain JavaScript when the page CSP blocks it. Anything else is a regression.
const KNOWN_PAGE_PROBLEMS = ["CSP violation: script-src wasm-eval"];

const FAQ_QUESTIONS = [
  "Can I move AKT from Solana back to Akash?",
  "How long does a transfer take?",
  "Which Solana wallets can I send to?",
  "Do I need SOL to receive AKT?",
  "Is there a minimum or maximum amount?",
  "What does Refunded mean?",
  "I lost my ledger ID. How do I find my transfer?",
];

test.describe("Akash Sink portal", () => {
  test.describe("Transfer page", () => {
    test("loads the network fee and transfer limits", async ({
      page,
      network,
    }) => {
      const { transferPage } = await setup(page);

      await expect(transferPage.transferCard).toMatchAriaSnapshot(`
        - term: Akash network fee
        - definition: ${formatAkt(network.feeUakt)} AKT
      `);
      await expect(transferPage.transferCard).toContainText(
        `At least ${formatAkt(network.minTransferUakt)} AKT per transfer.`,
      );
    });

    test("asks for the Keplr extension when it is missing", async ({
      page,
    }) => {
      const { transferPage } = await setup(page);

      await transferPage.connectKeplr();

      await expect(transferPage.transferCard.getByRole("alert")).toHaveText(
        "Install the Keplr browser extension, then reload this page.",
      );
    });

    test("loads without page errors or CSP violations", async ({ page }) => {
      const problems = await collectPageProblems(page);

      await setup(page);
      await new DeveloperPage(page).goto();

      expect(
        problems.filter((problem) => !KNOWN_PAGE_PROBLEMS.includes(problem)),
      ).toEqual([]);
    });

    test("loads the self-hosted fonts", async ({ page }) => {
      await setup(page);

      const fonts = await loadedFonts(page);

      expect(fonts).toEqual(
        expect.arrayContaining(["Inter 400", "Geist 600", "Geist Mono 500"]),
      );
    });

    test("keeps product copy free of em dashes and the word bridge", async ({
      page,
      network,
    }) => {
      const { transferPage } = await setup(page);
      for (const question of FAQ_QUESTIONS.slice(1))
        await transferPage.faqQuestion(question).click();
      const transferCopy = await productCopy(page, network.chainId);
      await new DeveloperPage(page).goto();
      const developerCopy = await productCopy(page, network.chainId);

      for (const copy of [transferCopy, developerCopy]) {
        expect(copy).not.toMatch(/—/);
        expect(copy).not.toMatch(/\bbridge\b/i);
      }
    });
  });

  test.describe("Color theme", () => {
    test("follows the operating system by default", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      const { transferPage } = await setup(page);

      await expect(transferPage.themeSelect).toHaveValue("system");
      await expect(page.locator(":root")).toHaveClass(/\bdark\b/);
    });

    test("overrides the operating system with an explicit choice", async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      const { transferPage } = await setup(page);

      await transferPage.themeSelect.selectOption("Light");

      await expect(page.locator(":root")).not.toHaveClass(/\bdark\b/);
    });

    test("keeps the chosen theme after a reload", async ({ page }) => {
      const { transferPage } = await setup(page);

      await transferPage.themeSelect.selectOption("Dark");
      await page.reload();

      await expect(transferPage.themeSelect).toHaveValue("dark");
      await expect(page.locator(":root")).toHaveClass(/\bdark\b/);
    });
  });

  test.describe("Questions", () => {
    test("opens one answer at a time", async ({ page }) => {
      const { transferPage } = await setup(page);

      await transferPage.faqQuestion(FAQ_QUESTIONS[3]).click();

      await expect(transferPage.faqQuestion(FAQ_QUESTIONS[3])).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(transferPage.faqQuestion(FAQ_QUESTIONS[0])).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(transferPage.faq).toContainText(
        "You don’t need SOL in your Solana wallet to receive AKT.",
      );
    });

    test("states the network minimum", async ({ page, network }) => {
      const { transferPage } = await setup(page);

      await transferPage.faqQuestion(FAQ_QUESTIONS[4]).click();

      await expect(transferPage.faq).toContainText(
        `Each transfer must be at least ${formatAkt(network.minTransferUakt)} AKT.`,
      );
    });

    test("closes an open answer when clicked again", async ({ page }) => {
      const { transferPage } = await setup(page);

      await transferPage.faqQuestion(FAQ_QUESTIONS[0]).click();

      await expect(transferPage.faqQuestion(FAQ_QUESTIONS[0])).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
  });

  test.describe("Transfer tracking", () => {
    test.use({ permissions: ["clipboard-read", "clipboard-write"] });

    test("rejects input that is neither a ledger ID nor a hash", async ({
      page,
    }) => {
      const { transfers } = await setup(page);

      await transfers.track("not-a-ledger-id");

      await expect(transfers.region).toContainText(
        "Enter a ledger ID or a 64-character transaction hash.",
      );
    });

    test("reports a ledger ID that does not exist", async ({ page }) => {
      const { transfers } = await setup(page);

      await transfers.track("999999999");

      await expect(transfers.region).toContainText(
        "No transfer found with that ID. Check it and try again.",
      );
    });

    test("opens the details of an existing ledger ID", async ({ page }) => {
      const { transfers, details } = await setup(page);

      await transfers.track("1");

      await expect(details.dialog).toBeVisible();
      await expect(details.dialog).toContainText("Ledger ID1");
      await expect(details.dialog).toContainText("Completed");
    });

    test("closes the details with Escape", async ({ page }) => {
      const { transfers, details } = await setup(page);
      await transfers.track("1");
      await expect(details.dialog).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(details.dialog).toBeHidden();
      await expect(page).toHaveURL(/#transfer$/);
    });

    test("returns focus to Track after closing the details", async ({
      page,
    }) => {
      const { transfers, details } = await setup(page);
      await transfers.track("1");

      await details.closeButton.click();

      await expect(details.dialog).toBeHidden();
      await expect(transfers.trackButton).toBeFocused();
    });

    test("reopens a details link after a reload", async ({ page, network }) => {
      const { details } = await setup(page);
      await details.openRecord("1", network.networkKey);
      await expect(details.dialog).toContainText("Ledger ID1");

      await page.reload();

      await expect(details.dialog).toContainText("Ledger ID1");
    });

    test("copies the ledger ID from the details", async ({ page }) => {
      const { transfers, details } = await setup(page);
      await transfers.track("1");

      await details.copyLedgerIdButton("1").click();

      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        "1",
      );
    });

    test("locks page scrolling while the details are open", async ({
      page,
    }) => {
      const { transfers, details } = await setup(page);
      await transfers.track("1");
      await expect(details.dialog).toBeVisible();

      expect(await scrollAfterWheel(page)).toBe(0);
    });

    test("refuses a details link from another testnet", async ({ page }) => {
      const { details } = await setup(page);

      await details.openRecord("1", JSON.stringify(["another-testnet"]));

      await expect(details.dialog).toContainText(
        "This transaction belongs to a different testnet.",
      );
    });

    test("flags a malformed transaction link", async ({ page }) => {
      await setup(page);

      await page.goto("/#tx/not-a-hash?network=unknown");

      await expect(page.getByRole("alert")).toContainText(
        "Invalid transaction link.",
      );
    });
  });

  test.describe("Developer view", () => {
    test("shows the network identity the portal verified", async ({
      page,
      network,
    }) => {
      const developerPage = new DeveloperPage(page);

      await developerPage.goto();

      await expect(developerPage.region).toMatchAriaSnapshot(`
        - term: Chain ID
        - definition:
          - code: ${network.chainId}
        - term: AKT mint address
        - definition:
          - code: ${network.mint}
        - term: Solana program address
        - definition:
          - code: ${network.program}
      `);
    });

    test("shows a CLI deposit for this chain and fee", async ({
      page,
      network,
    }) => {
      const developerPage = new DeveloperPage(page);

      await developerPage.goto();

      await expect(developerPage.region).toContainText(
        `--chain-id ${network.chainId}`,
      );
      await expect(developerPage.region).toContainText(
        `--fees ${network.feeUakt}uakt`,
      );
    });

    test("returns to transfers from the logo", async ({ page }) => {
      const developerPage = new DeveloperPage(page);
      const transferPage = new TransferPage(page);
      await developerPage.goto();

      await transferPage.logoLink.click();

      await expect(transferPage.transferCard).toBeVisible();
      await expect(developerPage.region).toBeHidden();
    });
  });

  test.describe("Phone layout", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("fits the screen without horizontal scrolling", async ({ page }) => {
      await setup(page);
      const transferOverflow = await horizontalOverflow(page);
      await new DeveloperPage(page).goto();
      const developerOverflow = await horizontalOverflow(page);

      expect(transferOverflow).toBeLessThanOrEqual(1);
      expect(developerOverflow).toBeLessThanOrEqual(1);
    });

    test("jumps to Your transfers from Track a transfer", async ({ page }) => {
      const { transferPage, transfers } = await setup(page);

      await transferPage.trackTransferLink.click();

      await expect(
        transfers.region.getByRole("heading", { name: "Your transfers" }),
      ).toBeFocused();
    });
  });

  async function setup(page: Page) {
    const transferPage = new TransferPage(page);
    await transferPage.goto();
    await expect(transferPage.connectKeplrButton).toBeEnabled();
    return {
      transferPage,
      transfers: new TransfersSection(page),
      details: new TransferDetailsDialog(page),
    };
  }
});
