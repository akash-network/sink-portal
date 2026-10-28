import type { Page } from "@playwright/test";
import type { SolanaWalletName } from "../fixture/wallet/inject-wallets";

export class TransferPage {
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto("/#transfer");
  }

  get header() {
    return this.page.getByRole("banner");
  }

  get logoLink() {
    return this.header.getByRole("link", { name: "Akash Sink" });
  }

  get transferCard() {
    return this.page.getByRole("region", { name: "Transfer AKT" });
  }

  get faq() {
    return this.page.getByRole("region", { name: "Questions" });
  }

  faqQuestion(question: string) {
    return this.faq.getByRole("button", { name: question });
  }

  get clientNotice() {
    return this.transferCard
      .getByRole("status")
      .filter({ hasText: "Solana can’t verify Akash" });
  }

  get connectKeplrButton() {
    return this.transferCard.getByRole("button", { name: "Connect Keplr" });
  }

  get disconnectKeplrButton() {
    return this.header.getByRole("button", { name: "Disconnect Keplr" });
  }

  get copyAkashAddressButton() {
    return this.transferCard.getByRole("button", {
      name: /^(Copy Akash address|Akash address copied)$/,
    });
  }

  get connectSolanaButton() {
    return this.transferCard.getByRole("button", { name: "Connect Wallet" });
  }

  solanaWalletOption(name: SolanaWalletName) {
    return this.transferCard
      .getByRole("group", { name: "Choose a Solana wallet" })
      .getByRole("button", { name });
  }

  disconnectSolanaButton(name: SolanaWalletName) {
    return this.transferCard.getByRole("button", {
      name: `Disconnect ${name}`,
    });
  }

  get destinationInput() {
    return this.transferCard.getByLabel("Paste a Solana address");
  }

  get pasteButton() {
    return this.transferCard.getByRole("button", {
      name: "Paste",
      exact: true,
    });
  }

  get balanceLabel() {
    return this.transferCard.getByText(/^Balance\b/);
  }

  get amountInput() {
    return this.transferCard.getByLabel("Amount", { exact: true });
  }

  get maxButton() {
    return this.transferCard.getByRole("button", { name: "Max", exact: true });
  }

  get sendMaxInsteadButton() {
    return this.transferCard.getByRole("button", {
      name: /^Send the max instead/,
    });
  }

  get reviewButton() {
    return this.transferCard.getByRole("button", { name: "Review Transfer" });
  }

  get trackTransferLink() {
    return this.page.getByRole("button", { name: "Track a transfer" });
  }

  get themeSelect() {
    return this.page.getByRole("combobox", { name: "Color theme" });
  }

  async connectKeplr() {
    await this.connectKeplrButton.click();
  }

  async connectSolanaWallet(name: SolanaWalletName) {
    await this.connectSolanaButton.click();
    await this.solanaWalletOption(name).click();
  }

  async pasteDestination(address: string) {
    await this.destinationInput.fill(address);
  }

  async enterAmount(amount: string) {
    await this.amountInput.fill(amount);
  }

  async openReview() {
    await this.reviewButton.click();
  }
}
