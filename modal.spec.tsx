import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { Modal } from "./modal";

describe(Modal.name, () => {
  it("labels the dialog with its heading", () => {
    setup();

    expect(
      screen.getByRole("dialog", { name: "Confirm transfer" }),
    ).toBeInTheDocument();
  });

  it("focuses the first control when it opens", () => {
    setup();

    expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();
  });

  it("focuses the requested element when one is given", () => {
    setup({ initialFocus: "confirm" });

    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });

  it("calls onEscape when Escape is pressed", async () => {
    const { user, onEscape } = setup();

    await user.keyboard("{Escape}");

    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("wraps focus from the last control to the first", async () => {
    const { user } = setup({ initialFocus: "confirm" });

    await user.tab();

    expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();
  });

  it("wraps focus from the first control to the last", async () => {
    const { user } = setup();

    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });

  it("skips disabled controls when wrapping focus", async () => {
    const { user } = setup({ confirmDisabled: true });

    await user.tab();

    expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();
  });

  it("skips controls that are not displayed when wrapping focus", async () => {
    const { user } = setup({ initialFocus: "confirm", hiddenControl: true });

    await user.tab();

    expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();
  });

  function setup(
    input: {
      initialFocus?: string;
      confirmDisabled?: boolean;
      hiddenControl?: boolean;
    } = {},
  ) {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
      function (this: HTMLElement) {
        return mock<DOMRectList>({ length: this.closest("[hidden]") ? 0 : 1 });
      },
    );
    const onEscape = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal
        labelledBy="modal-title"
        onEscape={onEscape}
        initialFocus={input.initialFocus}
      >
        <h2 id="modal-title">Confirm transfer</h2>
        <button type="button">Back</button>
        <button type="button" id="confirm" disabled={input.confirmDisabled}>
          Confirm
        </button>
        {input.hiddenControl && (
          <div hidden>
            <button type="button">Phone only</button>
          </div>
        )}
      </Modal>,
    );
    return { user, onEscape };
  }
});
