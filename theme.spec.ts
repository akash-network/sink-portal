import { describe, expect, it, vi } from "vitest";
import { applyTheme, parseTheme, readTheme, themeKey } from "./theme";

describe("theme", () => {
  describe(parseTheme.name, () => {
    it("keeps explicit light and dark choices", () => {
      expect(parseTheme("light")).toBe("light");
      expect(parseTheme("dark")).toBe("dark");
    });

    it("falls back to the system theme for anything else", () => {
      expect(parseTheme("blue")).toBe("system");
      expect(parseTheme(null)).toBe("system");
    });
  });

  describe(readTheme.name, () => {
    it("returns the saved choice", () => {
      localStorage.setItem(themeKey, "dark");

      expect(readTheme()).toBe("dark");
    });

    it("returns system when storage cannot be read", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });

      expect(readTheme()).toBe("system");
    });
  });

  describe(applyTheme.name, () => {
    it("adds the dark class for the dark theme", () => {
      setup({ prefersDark: false });

      applyTheme("dark");

      expect(document.documentElement).toHaveClass("dark");
    });

    it("removes the dark class for the light theme", () => {
      setup({ prefersDark: true });
      document.documentElement.classList.add("dark");

      applyTheme("light");

      expect(document.documentElement).not.toHaveClass("dark");
    });

    it("follows the operating system in system mode", () => {
      setup({ prefersDark: true });

      applyTheme("system");

      expect(document.documentElement).toHaveClass("dark");
    });
  });

  function setup(input: { prefersDark: boolean }) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: input.prefersDark && query === "(prefers-color-scheme: dark)",
      })),
    );
  }
});
