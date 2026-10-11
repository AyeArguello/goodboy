import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleDay } from "@/lib/data/admin";
import { ScheduleManager } from "./ScheduleManager";

const mocks = vi.hoisted(() => ({
  setSlotVisibility: vi.fn(),
  blockDate: vi.fn(),
  unblockDate: vi.fn(),
  rescheduleAppointment: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/app/admin/(app)/actions", () => ({
  setSlotVisibility: mocks.setSlotVisibility,
  blockDate: mocks.blockDate,
  unblockDate: mocks.unblockDate,
  rescheduleAppointment: mocks.rescheduleAppointment,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

const slot = (
  id: string,
  startsAt: string,
  overrides: Partial<ScheduleDay["slots"][number]> = {},
) => ({
  slotId: id,
  startsAt,
  isPublished: true,
  appointment: null,
  ...overrides,
});

/** Mon 2030-01-07 .. Sun 2030-01-13, then Mon 14: three weekday times, 11:00 on Saturday. */
function weekFixture(): ScheduleDay[] {
  const weekday = (dateKey: string, weekdayNumber: number): ScheduleDay => ({
    dateKey,
    weekday: weekdayNumber,
    blocked: null,
    slots: [
      slot(`${dateKey}-a`, `${dateKey}T12:00:00Z`),
      slot(`${dateKey}-b`, `${dateKey}T14:30:00Z`),
      slot(`${dateKey}-c`, `${dateKey}T16:30:00Z`),
    ],
  });
  return [
    weekday("2030-01-07", 1),
    weekday("2030-01-08", 2),
    weekday("2030-01-09", 3),
    weekday("2030-01-10", 4),
    weekday("2030-01-11", 5),
    {
      dateKey: "2030-01-12",
      weekday: 6,
      blocked: null,
      slots: [slot("2030-01-12-a", "2030-01-12T14:00:00Z")],
    },
    { dateKey: "2030-01-13", weekday: 0, blocked: null, slots: [] },
    weekday("2030-01-14", 1),
  ];
}

function renderManager(
  days: ScheduleDay[],
  selectedDateKey = "2030-01-08",
  reschedule: { id: string; dog: string } | null = null,
) {
  return render(
    <ScheduleManager
      days={days}
      selectedDateKey={selectedDateKey}
      rescheduleAppointmentId={reschedule?.id ?? null}
      rescheduleDogName={reschedule?.dog ?? null}
    />,
  );
}

describe("ScheduleManager", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.setSlotVisibility.mockResolvedValue({ ok: true });
    mocks.blockDate.mockResolvedValue({ ok: true });
    mocks.unblockDate.mockResolvedValue({ ok: true });
  });

  it("says the schedule is already loaded and shows every day of the calendar", () => {
    renderManager(weekFixture());

    expect(
      screen.getByText("Los horarios ya están cargados"),
    ).toBeInTheDocument();
    const calendar = screen.getByRole("region", { name: "Calendario" });
    expect(within(calendar).getAllByRole("link")).toHaveLength(8);
    expect(
      within(calendar).getByRole("link", { name: /martes.*3 libres/ }),
    ).toHaveAttribute("aria-current", "date");
    expect(
      within(calendar).getByRole("link", { name: /domingo.*cerrado/ }),
    ).toBeInTheDocument();
  });

  it("shows one month at a time and lets the owner move between months", () => {
    const day = (dateKey: string, weekday: number): ScheduleDay => ({
      dateKey,
      weekday,
      blocked: null,
      slots: [slot(`${dateKey}-a`, `${dateKey}T12:00:00Z`)],
    });
    const days = [
      day("2030-01-30", 3),
      day("2030-01-31", 4),
      day("2030-02-01", 5),
      day("2030-02-02", 6),
      day("2030-02-03", 0),
      day("2030-02-04", 1),
    ];

    const { unmount } = renderManager(days, "2030-01-31");
    const months = screen.getByRole("navigation", { name: "Mes" });
    expect(within(months).getAllByRole("link")).toHaveLength(2);
    expect(within(months).getByRole("link", { name: "enero" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      within(months).getByRole("link", { name: "febrero" }),
    ).toHaveAttribute("href", "/admin/horarios?day=2030-02-01");
    expect(
      screen.getByRole("heading", { name: "enero de 2030" }),
    ).toBeInTheDocument();
    const january = screen.getByRole("region", { name: "Calendario" });
    expect(within(january).getAllByRole("link")).toHaveLength(2);
    unmount();

    renderManager(days, "2030-02-02");
    expect(
      screen.getByRole("heading", { name: "febrero de 2030" }),
    ).toBeInTheDocument();
    const february = screen.getByRole("region", { name: "Calendario" });
    expect(within(february).getAllByRole("link")).toHaveLength(4);
    expect(
      screen
        .getByRole("navigation", { name: "Mes" })
        .querySelector('[aria-current="true"]'),
    ).toHaveTextContent(/febrero/i);
  });

  it("marks today in the calendar", () => {
    renderManager(weekFixture(), "2030-01-08");

    expect(
      screen.getByRole("link", { name: /lunes.*hoy/ }),
    ).toBeInTheDocument();
  });

  it("lists the day's three times, all offered, with a way to book each by hand", () => {
    renderManager(weekFixture());

    for (const time of ["09:00", "11:30", "13:30"]) {
      expect(
        screen.getByRole("switch", { name: new RegExp(`^${time}: atender`) }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getAllByRole("link", { name: "Cargar turno" })[0],
    ).toHaveAttribute("href", "/admin/turnos/nuevo?slot=2030-01-08-a");
  });

  it("removes a single time and brings it back", async () => {
    const user = userEvent.setup();
    renderManager(weekFixture());

    await user.click(screen.getByRole("switch", { name: /^11:30: atender/ }));
    expect(mocks.setSlotVisibility).toHaveBeenCalledWith("2030-01-08-b", false);
    expect(mocks.refresh).toHaveBeenCalled();

    const days = weekFixture();
    days[1]!.slots[1] = slot("2030-01-08-b", "2030-01-08T14:30:00Z", {
      isPublished: false,
    });
    renderManager(days);
    await user.click(screen.getByRole("switch", { name: /^11:30: quitado/ }));
    expect(mocks.setSlotVisibility).toHaveBeenLastCalledWith(
      "2030-01-08-b",
      true,
    );
  });

  it("does not offer to remove a time that already holds a turn", () => {
    const days = weekFixture();
    days[1]!.slots[0] = slot("2030-01-08-a", "2030-01-08T12:00:00Z", {
      appointment: { id: "appt-1", dogName: "Toby", status: "confirmed" },
    });
    renderManager(days);

    expect(
      screen.queryByRole("switch", { name: /^09:00/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Toby/ })).toHaveAttribute(
      "href",
      "/admin/solicitudes/appt-1",
    );
  });

  it("removes a whole day with a reason", async () => {
    const user = userEvent.setup();
    renderManager(weekFixture());

    await user.click(
      screen.getByRole("button", { name: "No atiendo este día" }),
    );
    await user.type(screen.getByLabelText("Motivo (opcional)"), "Feriado");
    await user.click(screen.getByRole("button", { name: "Quitar el día" }));

    expect(mocks.blockDate).toHaveBeenCalledWith("2030-01-08", "Feriado");
  });

  it("warns that removing a day does not cancel the turns it already has", async () => {
    const user = userEvent.setup();
    const days = weekFixture();
    days[1]!.slots[0] = slot("2030-01-08-a", "2030-01-08T12:00:00Z", {
      appointment: { id: "appt-1", dogName: "Toby", status: "confirmed" },
    });
    renderManager(days);

    await user.click(
      screen.getByRole("button", { name: "No atiendo este día" }),
    );

    expect(screen.getByText("Este día ya tiene 1 turno")).toBeInTheDocument();
    expect(screen.getByText(/no los cancela/i)).toBeInTheDocument();
  });

  it("reopens a removed day", async () => {
    const user = userEvent.setup();
    const days = weekFixture();
    days[1]!.blocked = { reason: "Vacaciones" };
    renderManager(days);

    expect(screen.getByText("Este día está quitado")).toBeInTheDocument();
    expect(screen.getByText(/Vacaciones/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Volver a abrir el día" }),
    );

    expect(mocks.unblockDate).toHaveBeenCalledWith("2030-01-08");
  });

  it("says Sundays are closed", () => {
    renderManager(weekFixture(), "2030-01-13");

    expect(screen.getByText("Los domingos no se atiende.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "No atiendo este día" }),
    ).not.toBeInTheDocument();
  });

  it("shows the error when an action fails", async () => {
    const user = userEvent.setup();
    mocks.setSlotVisibility.mockResolvedValue({
      ok: false,
      error: "Ese horario tiene un turno",
    });
    renderManager(weekFixture());

    await user.click(screen.getByRole("switch", { name: /^09:00: atender/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ese horario tiene un turno",
    );
  });

  it("reassigns a turn to a free time while rescheduling", async () => {
    const user = userEvent.setup();
    mocks.rescheduleAppointment.mockResolvedValue({ ok: true });
    renderManager(weekFixture(), "2030-01-09", { id: "appt-9", dog: "Luna" });

    expect(
      screen.getByText("Reprogramando el turno de Luna"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "No atiendo este día" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: "Reasignar acá" })[1]!,
    );

    expect(mocks.rescheduleAppointment).toHaveBeenCalledWith(
      "appt-9",
      "2030-01-09-b",
    );
    expect(mocks.push).toHaveBeenCalledWith("/admin/solicitudes/appt-9");
  });
});
