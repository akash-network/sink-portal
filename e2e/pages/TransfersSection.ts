import type { Locator, Page } from "@playwright/test";

export class TransfersSection {
  constructor(readonly page: Page) {}

  get region() {
    return this.page.getByRole("region", { name: "Your transfers" });
  }

  get trackInput() {
    return this.region.getByLabel("Track by ledger ID or transaction hash");
  }

  get trackButton() {
    return this.region.getByRole("button", { name: "Track" });
  }

  get table() {
    return this.region.getByRole("table", { name: "Your transfers" });
  }

  // Phones list transfers as cards instead of table rows.
  get cards() {
    return this.region.getByRole("listitem");
  }

  row(ledgerId: string) {
    return this.table.getByRole("row", {
      name: new RegExp(`^Copy ledger ID ${ledgerId} `),
    });
  }

  rowByHash(hash: string) {
    return this.table.getByRole("row", {
      name: new RegExp(`View transaction ${hash}$`),
    });
  }

  viewLink(scope: Locator, hash: string) {
    return scope.getByRole("link", { name: `View transaction ${hash}` });
  }

  retryButton(scope: Locator) {
    return scope.getByRole("button", { name: "Retry Transfer" });
  }

  async track(query: string) {
    await this.trackInput.fill(query);
    await this.trackButton.click();
  }
}
