import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Step2Dog } from "./Step2Dog";
import { initialForm } from "./types";

describe("Step2Dog", () => {
  it("warns in red that Chow Chow dogs are not accepted", () => {
    render(<Step2Dog form={initialForm} errors={{}} setField={() => {}} />);
    expect(
      screen.getByText(/no trabaja con perros de la raza Chow Chow/),
    ).toBeInTheDocument();
  });
});
