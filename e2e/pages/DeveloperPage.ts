import type { Page } from "@playwright/test";

export class DeveloperPage {
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto("/#developer");
  }

  get region() {
    return this.page.getByRole("region", { name: "Developer" });
  }

  copyButton(value: string) {
    return this.region.getByRole("button", { name: `Copy ${value}` });
  }
}
