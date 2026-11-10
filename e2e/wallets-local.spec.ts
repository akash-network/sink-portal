import { expect, test, type Page } from "@playwright/test";
import {
  injectWallets,
  type SolanaWalletName,
} from "./fixture/wallet/inject-wallets";
import {
  otherSolanaDestination,
  solanaDestination,
  unfundedAkashWallet,
} from "./fixture/wallet/test-wallets";
import { walletNetwork } from "./fixture/wallet-network";
import { TransferPage } from "./pages/TransferPage";

async function setup(
  page: Page,
  names: SolanaWalletName[] = ["Phantom"],
  keplr: "approve" | "reject" = "approve",
) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const wallets = await injectWallets(page, {
    akash: await unfundedAkashWallet(),
    keplr,
    solanaWallets: names,
    solanaAddress: solanaDestination(),
    chainId: walletNetwork().network.chainId,
    allowSigning: false,
  });
  const view = new TransferPage(page);
  await view.goto();
  return { wallets, view, errors };
}

test("[desktop] Akash picker uses Cosmos Kit and the configured private chain", async ({
  page,
}) => {
  const { wallets, view, errors } = await setup(page);
  await view.connectKeplr();
  await expect(view.transferCard).toContainText(wallets.akashAddress);
  expect(wallets.suggestedChains).toEqual([
    {
      chainId: walletNetwork().network.chainId,
      rpc: "http://127.0.0.1:4178/rpc/akash",
      rest: "http://127.0.0.1:4178/rest/akash",
    },
  ]);
  expect(wallets.cosmosSignRequests).toBe(0);
  await wallets.changeKeplrAccount();
  await expect(view.transferCard).toContainText(
    "Wallet account changed. Reconnect and review the transfer.",
  );
  await expect(view.connectKeplrButton).toBeEnabled();
  expect(errors).toEqual([]);
});

test("[desktop] rejection remains disconnected and the picker can close", async ({
  page,
}) => {
  const { view, errors } = await setup(page, [], "reject");
  await view.connectKeplr();
  const dialog = page.getByRole("dialog", { name: "Connect Akash wallet" });
  await expect(dialog.getByRole("alert")).toContainText(/reject/i);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(view.connectKeplrButton).toBeEnabled();
  expect(errors).toEqual([]);
});

for (const name of ["Phantom", "Solflare", "Backpack"] as const) {
  test(`${name} is discovered through Wallet Standard, never signs, and follows account changes`, async ({
    page,
  }) => {
    const { wallets, view, errors } = await setup(page, [name]);
    await view.connectSolanaButton.click();
    const icon = view.solanaWalletOption(name).locator("img");
    await expect(icon).toBeVisible();
    await expect
      .poll(() =>
        icon.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await view.solanaWalletOption(name).click();
    await expect(view.transferCard).toContainText(
      `${name} connected · read-only`,
    );
    await wallets.switchSolanaAccount(otherSolanaDestination());
    await expect(view.transferCard).toContainText(otherSolanaDestination());
    await wallets.disconnectSolana();
    await expect(view.transferCard).toContainText(`${name} disconnected.`);
    expect(wallets.solanaSignRequests).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("missing wallets offer paste and mobile browser links, not false installed choices", async ({
  page,
  isMobile,
}) => {
  const { view, errors } = await setup(page, []);
  await view.connectSolanaButton.click();
  await expect(view.transferCard).toContainText(
    "No wallet found in this browser",
  );
  if (isMobile) {
    for (const name of ["Phantom", "Solflare"]) {
      const icon = view.transferCard
        .getByRole("link", { name: `Open in ${name}` })
        .locator("img");
      await expect(icon).toBeVisible();
      await expect
        .poll(() =>
          icon.evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    const href = await view.transferCard
      .getByRole("link", { name: "Open in Phantom" })
      .getAttribute("href");
    expect(href).toMatch(/^https:\/\/phantom.com\/ul\/browse\//);
    expect(decodeURIComponent(href!)).toContain("127.0.0.1:4178/");
  }
  await page
    .getByRole("dialog", { name: "Connect Solana wallet" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(view.connectSolanaButton).toBeFocused();
  await expect(view.destinationInput).toBeEnabled();
  expect(errors).toEqual([]);
});

test("an unsigned draft survives reload without reconnecting or sending", async ({
  page,
}) => {
  const { view, wallets, errors } = await setup(page);
  await view.pasteDestination(solanaDestination());
  await view.enterAmount("2");
  await page.reload();
  await expect(view.destinationInput).toHaveValue(solanaDestination());
  await expect(view.amountInput).toHaveValue("2");
  await expect(view.connectKeplrButton).toBeEnabled();
  await expect(page.getByText(/Unsigned draft restored/)).toBeVisible();
  expect(wallets.cosmosSignRequests).toBe(0);
  expect(wallets.solanaSignRequests).toBe(0);
  expect(errors).toEqual([]);
});

test("Akash picker offers only Keplr with icons and mobile enabled", async ({
  page,
  isMobile,
}) => {
  const { view, errors } = await setup(page);
  await view.connectKeplrButton.click();
  const dialog = page.getByRole("dialog", { name: "Connect Akash wallet" });
  const mobileWallet = dialog.getByRole("button", {
    name: "Keplr Mobile",
    exact: true,
  });
  await expect(mobileWallet).toBeEnabled();
  await expect(dialog.getByRole("button")).toHaveCount(isMobile ? 2 : 3);
  await expect(
    dialog.getByRole("button", { name: "Keplr", exact: true }),
  ).toHaveCount(isMobile ? 0 : 1);
  await expect(dialog).not.toContainText("isn’t configured");
  const icons = dialog.locator("img");
  await expect(icons).toHaveCount(isMobile ? 1 : 2);
  for (const icon of await icons.all()) {
    await expect
      .poll(() =>
        icon.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test("wallet dialogs keep keyboard focus inside and return it to each opener", async ({
  page,
}) => {
  const { view, errors } = await setup(page);
  for (const [opener, name] of [
    [view.connectKeplrButton, "Connect Akash wallet"],
    [
      view.header.getByRole("button", { name: "Connect Akash wallet" }),
      "Connect Akash wallet",
    ],
    [view.connectSolanaButton, "Connect Solana wallet"],
  ] as const) {
    await opener.click();
    const dialog = page.getByRole("dialog", { name });
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button").or(dialog.getByRole("link")).last(),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test("wallet-browser handoff restores only an unsigned draft", async ({
  page,
}) => {
  const { view, wallets, errors } = await setup(page);
  const draft = {
    networkKey: walletNetwork().network.networkKey,
    recipient: solanaDestination(),
    amountUakt: "3000000",
    expiresAt: Date.now() + 60_000,
  };
  await page.goto(
    `/#wallet?${new URLSearchParams({ draft: JSON.stringify(draft) })}`,
  );
  await page.reload();
  await expect(view.destinationInput).toHaveValue(solanaDestination());
  await expect(view.amountInput).toHaveValue("3");
  await expect(
    page.getByText("Invalid transaction link.", { exact: false }),
  ).toHaveCount(0);
  await expect(view.connectKeplrButton).toBeEnabled();
  expect(wallets.cosmosSignRequests).toBe(0);
  expect(wallets.solanaSignRequests).toBe(0);
  expect(errors).toEqual([]);
});
