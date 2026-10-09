import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("credits GEC with an accessible external link", () => {
    render(<Footer />);

    expect(
      screen.getByText("Sitio realizado por GEC Soluciones Digitales"),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: /visitar el sitio de gec soluciones digitales/i,
    });
    expect(link).toHaveAttribute("href", "https://gecdigital.dev/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByRole("img", { name: "GEC Soluciones Digitales" }),
    ).toBeInTheDocument();
  });
});
