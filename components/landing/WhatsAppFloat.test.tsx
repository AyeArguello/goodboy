import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { businessConfig } from "@/lib/config/business";
import { WhatsAppFloat } from "./WhatsAppFloat";

const mocks = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

describe("WhatsAppFloat", () => {
  beforeEach(() => {
    mocks.pathname = "/galeria";
  });

  it("is a link to the business WhatsApp with a prefilled message, in a new tab", () => {
    render(<WhatsAppFloat />);

    const link = screen.getByRole("link", { name: /Escribinos por WhatsApp/ });
    const href = new URL(link.getAttribute("href")!);
    expect(href.origin + href.pathname).toBe(
      `https://wa.me/${businessConfig.whatsappNumberE164.replace(/\D/g, "")}`,
    );
    expect(href.searchParams.get("text")).toMatch(/turno/);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("is not shown in the admin panel", () => {
    mocks.pathname = "/admin/solicitudes";
    render(<WhatsAppFloat />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sits above the sticky bar on the booking pages", () => {
    mocks.pathname = "/turnos";
    render(<WhatsAppFloat />);

    expect(screen.getByRole("link")).toHaveClass("bottom-24");
  });

  describe("on the home page", () => {
    it("waits until the reader reaches the contact block", () => {
      mocks.pathname = "/";
      const block = document.createElement("section");
      block.id = "acciones";
      let top = 2000;
      block.getBoundingClientRect = () => ({ top }) as DOMRect;
      document.body.appendChild(block);
      Object.defineProperty(window, "innerHeight", {
        value: 800,
        configurable: true,
      });

      render(<WhatsAppFloat />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();

      top = 300; // scrolled down to the block
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(screen.getByRole("link")).toBeInTheDocument();

      block.remove();
    });
  });
});
