import type { Page } from "@playwright/test";

export class ReceiptDialog {
  constructor(readonly page: Page) {}

  // Titled by outcome: submitted, not accepted, or still being checked.
  get dialog() {
    return this.page.getByRole("dialog", {
      name: /^(Deposit submitted|Deposit not accepted|Checking your deposit)$/,
    });
  }

  get doneButton() {
    return this.dialog.getByRole("button", { name: "Done" });
  }

  get copyLedgerIdButton() {
    return this.dialog.getByRole("button", { name: /^(Copy ID|Copied)$/ });
  }

  transactionLink(hash: string) {
    return this.dialog.getByRole("link", { name: `View transaction ${hash}` });
  }
}
