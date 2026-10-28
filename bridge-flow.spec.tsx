import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BridgeFlow } from "./bridge-flow";

describe(BridgeFlow.name, () => {
  it("selects the Solana mint step by default", () => {
    setup();

    expect(
      screen.getByRole("button", { name: /^5\. akt-solana/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("heading", { name: "5. akt-solana → SPL Token" }),
    ).toBeInTheDocument();
  });

  it("shows the details of a clicked step", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /^3\. Relayer/ }));

    expect(
      screen.getByRole("heading", { name: "3. Relayer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^3\. Relayer/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^5\. akt-solana/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it.each(["{Enter}", " "])("selects a focused step with %s", async (key) => {
    const { user } = setup();
    screen.getByRole("button", { name: /^2\. x\/sink/ }).focus();

    await user.keyboard(key);

    expect(
      screen.getByRole("heading", { name: "2. x/sink" }),
    ).toBeInTheDocument();
  });

  it("ignores other keys", async () => {
    const { user } = setup();
    screen.getByRole("button", { name: /^2\. x\/sink/ }).focus();

    await user.keyboard("a");

    expect(
      screen.getByRole("heading", { name: "5. akt-solana → SPL Token" }),
    ).toBeInTheDocument();
  });

  function setup() {
    const user = userEvent.setup();
    render(<BridgeFlow />);
    return { user };
  }
});
