import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { bridge } from "../features/transfers/controller";
import {
  hasAcceptedTerms,
  termsStorageKey,
  termsVersion,
} from "./terms-dialog";

beforeEach(() => {
  vi.spyOn(bridge, "start").mockReturnValue(() => {});
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("first-visit terms", () => {
  it("opens on arrival, keeps the portal inert and requires an explicit agreement", async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = screen.getByRole("dialog", { name: "Before you migrate" });
    expect(dialog).toBeVisible();
    expect(document.querySelector("main")?.closest("[inert]")).not.toBeNull();
    expect(hasAcceptedTerms()).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    const terms = screen.getByRole("link", { name: "Terms of Service" });
    expect(terms).toHaveAttribute("href", "/terms-of-service.html");
    expect(terms).toHaveAttribute("target", "_blank");
    await user.click(terms);
    expect(hasAcceptedTerms()).toBe(false);
    expect(dialog).toBeVisible();
    const risks = screen.getByRole("link", { name: "migration risks" });
    expect(risks).toHaveAttribute("href", "/terms.html");
    expect(risks).toHaveAttribute("target", "_blank");
    await user.click(risks);
    expect(hasAcceptedTerms()).toBe(false);
    expect(dialog).toBeVisible();
    expect(screen.getByRole("link", { name: "Leave portal" })).toHaveAttribute(
      "href",
      "https://akash.network/",
    );
    await user.click(
      screen.getByRole("button", { name: "I agree and continue" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("main")?.closest("[inert]")).toBeNull();
    expect(localStorage.getItem(termsStorageKey)).toBe(termsVersion);
    expect(screen.getByRole("link", { name: "Terms & risks" })).toHaveAttribute(
      "href",
      "/terms.html",
    );
  });

  it("remembers agreement across page loads but asks again for a changed version", async () => {
    const user = userEvent.setup();
    const firstVisit = render(<App />);
    await user.click(
      screen.getByRole("button", { name: "I agree and continue" }),
    );
    firstVisit.unmount();
    const nextVisit = render(<App />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    nextVisit.unmount();
    localStorage.setItem(termsStorageKey, "2026-11-12-2");
    render(<App />);
    expect(
      screen.getByRole("dialog", { name: "Before you migrate" }),
    ).toBeVisible();
  });

  it("allows this visit after agreement when storage is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const firstVisit = render(<App />);
    await user.click(
      screen.getByRole("button", { name: "I agree and continue" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    firstVisit.unmount();
    render(<App />);
    expect(
      screen.getByRole("dialog", { name: "Before you migrate" }),
    ).toBeVisible();
  });
});
