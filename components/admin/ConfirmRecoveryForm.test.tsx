import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmRecoveryForm } from "./ConfirmRecoveryForm";

const mocks = vi.hoisted(() => ({
  confirmAdminRecovery: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/admin/auth/confirm/actions", () => ({
  confirmAdminRecovery: mocks.confirmAdminRecovery,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

describe("ConfirmRecoveryForm", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("does not spend the token until the owner presses the button", () => {
    render(<ConfirmRecoveryForm tokenHash="pkce_abcdef0123" type="recovery" />);

    expect(mocks.confirmAdminRecovery).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Continuar" }),
    ).toBeInTheDocument();
  });

  it("verifies the link and moves on to the password form", async () => {
    mocks.confirmAdminRecovery.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ConfirmRecoveryForm tokenHash="pkce_abcdef0123" type="recovery" />);

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(mocks.confirmAdminRecovery).toHaveBeenCalledWith(
      "pkce_abcdef0123",
      "recovery",
    );
    expect(mocks.replace).toHaveBeenCalledWith("/admin/restablecer");
  });

  it("shows the reason and a way to ask again when the link no longer works", async () => {
    mocks.confirmAdminRecovery.mockResolvedValue({
      ok: false,
      problem: "expired",
      error: "El enlace de recuperación venció o ya se usó. Pedí uno nuevo.",
    });
    const user = userEvent.setup();
    render(<ConfirmRecoveryForm tokenHash="pkce_abcdef0123" type="recovery" />);

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("venció");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Pedir un enlace nuevo" }),
    ).toHaveAttribute("href", "/admin/recuperar");
  });

  it("explains an incomplete link and offers no button", () => {
    render(<ConfirmRecoveryForm tokenHash="" type="" />);

    expect(screen.getByRole("alert")).toHaveTextContent("incompleto");
    expect(
      screen.queryByRole("button", { name: "Continuar" }),
    ).not.toBeInTheDocument();
  });
});
