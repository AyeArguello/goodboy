import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Accordion } from "./Accordion";

const items = [
  {
    question: "¿Puedo pedir turno para hoy?",
    answer: "No, con 24 h de anticipación.",
  },
  { question: "¿Cuánto dura el turno?", answer: "Entre 2 h 30 y 3 h 30." },
];

describe("Accordion", () => {
  it("keeps only one panel open at a time", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    const [first, second] = screen.getAllByRole("button");
    await user.click(first!);
    expect(screen.getByText(items[0]!.answer)).toBeInTheDocument();
    expect(first).toHaveAttribute("aria-expanded", "true");

    await user.click(second!);
    expect(screen.queryByText(items[0]!.answer)).not.toBeInTheDocument();
    expect(screen.getByText(items[1]!.answer)).toBeInTheDocument();
    expect(first).toHaveAttribute("aria-expanded", "false");
  });
});
