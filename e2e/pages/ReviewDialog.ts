import type { Page } from "@playwright/test";

const TITLE = "Confirm one-way transfer";

export class ReviewDialog {
  // Desktop shows the review in a dialog; phones render it inline.
  constructor(
    readonly page: Page,
    readonly layout: "dialog" | "inline" = "dialog",
  ) {}

  get dialog() {
    return this.layout === "dialog"
      ? this.page.getByRole("dialog", { name: TITLE })
      : this.page.getByRole("region", { name: TITLE });
  }

  get destinationCheckbox() {
    return this.dialog.getByRole("checkbox", {
      name: "I checked this is my Solana address.",
    });
  }

  get oneWayCheckbox() {
    return this.dialog.getByRole("checkbox", {
      name: "I understand this transfer is one way.",
    });
  }

  get confirmButton() {
    return this.dialog.getByRole("button", { name: "Confirm in Keplr" });
  }

  get backButton() {
    return this.dialog.getByRole("button", { name: "Back" });
  }

  async acknowledgeAll() {
    await this.destinationCheckbox.check();
    await this.oneWayCheckbox.check();
  }
}
