import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const mocks = vi.hoisted(() => ({
  loginAdmin: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/admin/login/actions", () => ({
  loginAdmin: mocks.loginAdmin,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("submits email and password and enters the protected panel", async () => {
    mocks.loginAdmin.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<LoginForm notAllowed={false} resetDone={false} />);

    await user.type(
      screen.getByRole("textbox", { name: "Correo" }),
      "admin@example.com",
    );
    await user.type(screen.getByLabelText("Contraseña"), "Secret1234!abcd");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mocks.loginAdmin).toHaveBeenCalledWith(
      "admin@example.com",
      "Secret1234!abcd",
    );
    expect(mocks.replace).toHaveBeenCalledWith("/admin/hoy");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows a generic failure and clears only the password", async () => {
    mocks.loginAdmin.mockResolvedValue({
      ok: false,
      error: "Correo o contraseña incorrectos.",
    });
    const user = userEvent.setup();
    render(<LoginForm notAllowed={false} resetDone={false} />);

    const email = screen.getByRole("textbox", { name: "Correo" });
    const password = screen.getByLabelText("Contraseña");
    await user.type(email, "admin@example.com");
    await user.type(password, "Wrong1234!abcd");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(
      await screen.findByText("Correo o contraseña incorrectos."),
    ).toBeInTheDocument();
    expect(email).toHaveValue("admin@example.com");
    expect(password).toHaveValue("");
  });
});
