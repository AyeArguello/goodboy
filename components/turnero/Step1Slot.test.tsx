import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Step1Slot } from "./Step1Slot";
import type { DayGroup } from "./grouping";

const day = (dateKey: string, label: string, bookable = true): DayGroup => ({
  dateKey,
  dayLabel: label,
  slots: [
    {
      slotId: `${dateKey}-a`,
      startsAt: new Date(`${dateKey}T12:00:00Z`),
      timeLabel: "09:00",
      bookable,
    },
  ],
});

const days: DayGroup[] = [
  day("2030-12-30", "lunes, 30 de diciembre"),
  day("2030-12-31", "martes, 31 de diciembre"),
  day("2031-01-02", "jueves, 2 de enero"),
  day("2031-02-03", "lunes, 3 de febrero"),
];

function setup(selected: string | null = "2030-12-30") {
  const onSelectDate = vi.fn();
  render(
    <Step1Slot
      days={days}
      selectedDateKey={selected}
      selectedSlotId={null}
      taken={null}
      onSelectDate={onSelectDate}
      onSelectSlot={vi.fn()}
    />,
  );
  return onSelectDate;
}

describe("Step1Slot day picker", () => {
  it("shows month tabs (with the year when it crosses years) and only the active month's days", () => {
    setup();

    const months = screen.getByRole("radiogroup", { name: "Mes" });
    expect(within(months).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(months).getByRole("radio", { name: "Diciembre 2030" }),
    ).toBeChecked();
    expect(
      within(screen.getByRole("radiogroup", { name: "Día" })).getAllByRole(
        "radio",
      ),
    ).toHaveLength(2);
  });

  it("jumps to the first day with times when a month is chosen", async () => {
    const user = userEvent.setup();
    const onSelectDate = setup();

    await user.click(screen.getByRole("radio", { name: "Enero 2031" }));

    expect(onSelectDate).toHaveBeenCalledWith("2031-01-02");
  });

  it("selects a day of the month", async () => {
    const user = userEvent.setup();
    const onSelectDate = setup();

    await user.click(screen.getByRole("radio", { name: /martes, 31/ }));

    expect(onSelectDate).toHaveBeenCalledWith("2030-12-31");
  });
});

describe("Step1Slot when the chosen turn was taken meanwhile", () => {
  it("says so, keeps the data and offers to pick another time", async () => {
    const user = userEvent.setup();
    render(
      <Step1Slot
        days={days}
        selectedDateKey="2030-12-30"
        selectedSlotId={null}
        taken={{
          label: "lunes, 30 de diciembre · 09:00",
          reason: "SLOT_TAKEN",
        }}
        onSelectDate={vi.fn()}
        onSelectSlot={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Ese turno ya fue tomado");
    expect(alert).toHaveTextContent("lunes, 30 de diciembre · 09:00");
    expect(alert).toHaveTextContent("Tus datos quedan guardados");

    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await user.click(
      screen.getByRole("button", { name: "Elegir otro horario" }),
    );
    expect(screen.getByRole("radiogroup", { name: "Día" })).toBeInTheDocument();
  });

  it("explains a full day differently", () => {
    render(
      <Step1Slot
        days={days}
        selectedDateKey="2030-12-30"
        selectedSlotId={null}
        taken={{ label: "Sin elegir", reason: "DAY_FULL" }}
        onSelectDate={vi.fn()}
        onSelectSlot={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ese día ya no tiene lugar",
    );
  });
});
