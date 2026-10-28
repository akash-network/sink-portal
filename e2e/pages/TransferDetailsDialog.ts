import type { Page } from "@playwright/test";

export class TransferDetailsDialog {
  constructor(readonly page: Page) {}

  get dialog() {
    return this.page.getByRole("dialog", { name: "Transfer details" });
  }

  get closeButton() {
    return this.dialog.getByRole("button", { name: "Close" });
  }

  get refreshButton() {
    return this.dialog.getByRole("button", { name: "Refresh status" });
  }

  copyLedgerIdButton(ledgerId: string) {
    return this.dialog.getByRole("button", {
      name: `Copy ledger ID ${ledgerId}`,
    });
  }

  async openRecord(ledgerId: string, networkKey: string) {
    await this.page.goto(
      `/#record/${ledgerId}?network=${encodeURIComponent(networkKey)}`,
    );
  }
}
