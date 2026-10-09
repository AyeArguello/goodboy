import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const { sendAdminLoginLink } = vi.hoisted(() => ({
  sendAdminLoginLink: vi.fn(),
}));

vi.mock("@/app/admin/login/actions", () => ({ sendAdminLoginLink }));

describe("LoginForm", () => {
  beforeEach(() => sendAdminLoginLink.mockReset());

  it("shows a cooldown after a successful send instead of a fake resend button", async () => {
    sendAdminLoginLink.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<LoginForm notAllowed={false} />);

    await user.type(
      screen.getByRole("textbox", { name: "Correo" }),
      "admin@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Enviarme el enlace" }),
    );

    expect(await screen.findByText("Revisá tu correo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Podés reenviar en 60 s" }),
    ).toBeDisabled();
    expect(sendAdminLoginLink).toHaveBeenCalledOnce();
  });

  it("shows the real delivery error and keeps the form available", async () => {
    sendAdminLoginLink.mockResolvedValue({
      ok: false,
      error: "No pudimos enviar el enlace.",
    });
    const user = userEvent.setup();
    render(<LoginForm notAllowed={false} />);

    await user.type(
      screen.getByRole("textbox", { name: "Correo" }),
      "admin@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Enviarme el enlace" }),
    );

    expect(
      await screen.findByText("No pudimos enviar el enlace."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviarme el enlace" }),
    ).toBeEnabled();
  });
});
