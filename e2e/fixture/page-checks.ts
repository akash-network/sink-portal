import type { Page } from "@playwright/test";

// Helpers return what they observe; specs make the assertions.

export async function productCopy(page: Page, chainId: string) {
  // The chain ID is an on-chain identifier, exempt from copy rules.
  return (await page.locator("body").innerText()).replaceAll(chainId, "");
}

export function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

export function loadedFonts(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load("400 14px Inter"),
      document.fonts.load("600 32px Geist"),
      document.fonts.load("500 14px 'Geist Mono'"),
    ]);
    return [...document.fonts]
      .filter((font) => font.status === "loaded")
      .map((font) => `${font.family.replaceAll('"', "")} ${font.weight}`);
  });
}

// Wheels over the page and reports how far it scrolled.
export async function scrollAfterWheel(page: Page) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(4, 4);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  const scrolled = await page.evaluate(() => scrollY);
  await page.evaluate(() => scrollTo(0, 0));
  return scrolled;
}

export async function collectPageProblems(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) =>
    problems.push(`page error: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  await page.exposeFunction("__e2eCspViolation", (violation: string) =>
    problems.push(`CSP violation: ${violation}`),
  );
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      void (
        window as unknown as {
          __e2eCspViolation(violation: string): Promise<void>;
        }
      ).__e2eCspViolation(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return problems;
}
