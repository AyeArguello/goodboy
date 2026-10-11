import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("credits GEC with one accessible external link that holds logo and text together", () => {
    render(<Footer />);

    const link = screen.getByRole("link", {
      name: /sitio realizado por gec soluciones digitales/i,
    });
    expect(link).toHaveAttribute("href", "https://gecdigital.dev/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    // The logo and both lines of the credit live inside the same link, so the
    // whole lockup is one click target and one tab stop.
    expect(link.querySelector("img")).not.toBeNull();
    expect(within(link).getByText("Sitio realizado por")).toBeInTheDocument();
    expect(
      within(link).getByText("GEC Soluciones Digitales"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /gec soluciones digitales/i }),
    ).toHaveLength(1);
  });
});
