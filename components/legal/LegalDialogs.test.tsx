import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { LegalDialogs } from "./LegalDialogs";

describe("LegalDialogs", () => {
  // jsdom has no <dialog> modal support.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });

  it("opens the terms in a dialog without navigating, and closes it", async () => {
    const user = userEvent.setup();
    render(<LegalDialogs />);

    await user.click(
      screen.getByRole("button", { name: /Términos de reserva/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Términos de reserva",
    });
    expect(
      within(dialog).getByRole("heading", { name: "Términos de reserva" }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("goes from the terms to the privacy policy inside the same dialog", async () => {
    const user = userEvent.setup();
    render(<LegalDialogs />);

    await user.click(
      screen.getByRole("button", { name: /Términos de reserva/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: "política de privacidad" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Política de privacidad" }),
    ).toBeInTheDocument();
  });
});
