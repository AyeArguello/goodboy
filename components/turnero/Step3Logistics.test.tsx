import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Step3Logistics } from "./Step3Logistics";
import { initialForm, type WizardForm } from "./types";

function Harness() {
  const [form, setForm] = useState<WizardForm>({
    ...initialForm,
    logisticsMode: "pickup",
  });
  return (
    <>
      <Step3Logistics
        form={form}
        errors={{}}
        setField={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
      />
      <output data-testid="barrio">{form.neighborhood}</output>
    </>
  );
}

describe("Step3Logistics barrio picker", () => {
  it("suggests barrios as you type and quotes the one you pick", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(
      screen.getByRole("combobox", { name: "Barrio" }),
      "las pal",
    );
    await user.click(screen.getByRole("option", { name: "Las Palmas" }));

    expect(screen.getByTestId("barrio")).toHaveTextContent("Las Palmas");
    expect(
      screen.getByText(/Costo del traslado desde Las Palmas: Sin cargo/),
    ).toBeInTheDocument();
  });

  it("quotes a nearby and a far barrio differently", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Barrio" });

    await user.type(input, "Jardín{ArrowDown}{Enter}");
    expect(
      screen.getByText(/Costo del traslado desde Jard.*ARS 5\.000–8\.000/),
    ).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "docta");
    await user.click(screen.getByRole("option", { name: "Docta" }));
    expect(
      screen.getByText(/desde Docta: ARS 10\.000–13\.000/),
    ).toBeInTheDocument();
  });

  it("does not accept a place outside Córdoba capital and points to WhatsApp", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(
      screen.getByRole("combobox", { name: "Barrio" }),
      "Villa Carlos Paz",
    );

    expect(screen.getByTestId("barrio")).toBeEmptyDOMElement();
    expect(screen.getByText(/No encontramos ese barrio/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "escribinos por WhatsApp" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Costo del traslado desde/),
    ).not.toBeInTheDocument();
  });
});

describe("Step3Logistics one-way option", () => {
  function OneWay() {
    const [form, setForm] = useState<WizardForm>({ ...initialForm });
    return (
      <>
        <Step3Logistics
          form={form}
          errors={{}}
          setField={(field, value) =>
            setForm((f) => ({ ...f, [field]: value }))
          }
        />
        <output data-testid="mode">{form.logisticsMode}</output>
      </>
    );
  }

  it("asks which leg we do, then quotes half the round trip", async () => {
    const user = userEvent.setup();
    render(<OneWay />);

    await user.click(
      screen.getByRole("radio", { name: /Solo ida o solo vuelta/ }),
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("oneway");
    expect(screen.queryByRole("combobox", { name: "Barrio" })).toBeNull();

    await user.click(
      screen.getByRole("radio", { name: /Lo buscamos y lo retiro yo/ }),
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("pickup_only");

    await user.type(
      screen.getByRole("combobox", { name: "Barrio" }),
      "Jardín{ArrowDown}{Enter}",
    );
    expect(screen.getByText(/desde Jard.*ARS 2.500–4.000/)).toBeInTheDocument();
    expect(screen.getByText(/mitad del traslado completo/)).toBeInTheDocument();
  });
});
