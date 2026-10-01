import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("shows the loading text and disables itself while loading", () => {
    render(
      <Button loading loadingText="Enviando…">
        Enviar solicitud
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Enviando…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        No disponible
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick when enabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Solicitar turno</Button>);
    await user.click(screen.getByRole("button", { name: "Solicitar turno" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
