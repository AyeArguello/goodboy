import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleDay } from "@/lib/data/admin";
import { ManualBookingForm } from "./ManualBookingForm";

const mocks = vi.hoisted(() => ({
  createManualAppointment: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/admin/(app)/actions", () => ({
  createManualAppointment: mocks.createManualAppointment,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

const NOW = new Date("2030-01-07T10:00:00Z").getTime();

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

function daysFixture(): ScheduleDay[] {
  return [
    {
      // Today: 06:00 (Córdoba) has already passed at NOW, 11:30 and 13:30 are ahead.
      dateKey: "2030-01-07",
      weekday: 1,
      blocked: null,
      slots: [
        slot("mon-a", "2030-01-07T09:00:00Z"),
        slot("mon-b", "2030-01-07T14:30:00Z"),
        slot("mon-c", "2030-01-07T16:30:00Z"),
      ],
    },
    {
      dateKey: "2030-01-08",
      weekday: 2,
      blocked: null,
      slots: [
        slot("tue-a", "2030-01-08T12:00:00Z", {
          appointment: { id: "appt-1", dogName: "Toby", status: "confirmed" },
        }),
        slot("tue-b", "2030-01-08T14:30:00Z", { isPublished: false }),
        slot("tue-c", "2030-01-08T16:30:00Z"),
      ],
    },
    {
      dateKey: "2030-01-09",
      weekday: 3,
      blocked: { reason: "Feriado" },
      slots: [slot("wed-a", "2030-01-09T12:00:00Z")],
    },
    { dateKey: "2030-01-13", weekday: 0, blocked: null, slots: [] },
  ];
}

function renderForm(
  initialSlotId: string | null = null,
  day: string | null = null,
) {
  return render(
    <ManualBookingForm
      days={daysFixture()}
      initialSlotId={initialSlotId}
      initialDateKey={day}
      nowMs={NOW}
    />,
  );
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre del perro"), "Firulais");
  await user.type(screen.getByLabelText("Nombre y apellido"), "Marta Gómez");
  await user.type(screen.getByLabelText(/^Teléfono/), "3511234567");
}

describe("ManualBookingForm", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.createManualAppointment.mockResolvedValue({
      ok: true,
      appointmentId: "new-appt",
      code: "GB-ABCDEFGH",
      emailStatus: "none",
    });
  });

  it("starts on the first day with a free time and leaves out Sundays", () => {
    renderForm();

    const days = screen.getByRole("radiogroup", { name: "Día" });
    expect(days.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /11:30/ })).toBeEnabled();
    expect(
      screen.getByRole("radio", { name: /06:00.*Ya pasó/ }),
    ).toBeDisabled();
    expect(screen.queryByText("Los domingos")).not.toBeInTheDocument();
  });

  it("chooses the month first, then only that month's days", async () => {
    const user = userEvent.setup();
    const days: ScheduleDay[] = [
      {
        dateKey: "2030-01-31",
        weekday: 4,
        blocked: null,
        slots: [slot("jan-a", "2030-01-31T14:30:00Z")],
      },
      {
        dateKey: "2030-02-01",
        weekday: 5,
        blocked: null,
        slots: [slot("feb-a", "2030-02-01T14:30:00Z")],
      },
      {
        dateKey: "2030-02-04",
        weekday: 1,
        blocked: null,
        slots: [slot("feb-b", "2030-02-04T14:30:00Z")],
      },
    ];
    render(
      <ManualBookingForm
        days={days}
        initialSlotId={null}
        initialDateKey={null}
        nowMs={NOW}
      />,
    );

    const months = screen.getByRole("radiogroup", { name: "Mes" });
    expect(months.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "enero" })).toBeChecked();
    expect(
      screen
        .getByRole("radiogroup", { name: "Día" })
        .querySelectorAll('[role="radio"]'),
    ).toHaveLength(1);

    await user.click(screen.getByRole("radio", { name: "febrero" }));

    expect(screen.getByRole("radio", { name: "febrero" })).toBeChecked();
    expect(
      screen
        .getByRole("radiogroup", { name: "Día" })
        .querySelectorAll('[role="radio"]'),
    ).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /11:30/ })).toBeEnabled();
  });

  it("opens on the requested slot, already chosen", () => {
    renderForm("tue-c");

    expect(
      screen.getByRole("radio", { name: /13:30/, checked: true }),
    ).toBeInTheDocument();
  });

  it("does not offer what the agenda already holds or what has passed", async () => {
    const user = userEvent.setup();
    renderForm("mon-b");

    await user.click(screen.getByRole("radio", { name: /martes|mar/i }));
    const taken = screen.getByRole("radio", { name: /09:00.*Ocupado.*Toby/ });
    expect(taken).toBeDisabled();
    await user.click(taken);
    expect(taken).toHaveAttribute("aria-checked", "false");
  });

  it("books on a free slot and goes to the new turn", async () => {
    const user = userEvent.setup();
    renderForm("mon-b");
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: "Cargar turno" }));

    expect(mocks.createManualAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        slotId: "mon-b",
        dogName: "Firulais",
        ownerName: "Marta Gómez",
        phone: "3511234567",
        email: "",
        initialStatus: "confirmed",
        depositMethod: null,
        force: false,
        logisticsMode: "self",
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/admin/solicitudes/new-appt");
  });

  it("asks for confirmation before using a time that was removed", async () => {
    const user = userEvent.setup();
    renderForm("tue-b");
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: "Cargar turno" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cargar igual");
    expect(mocks.createManualAppointment).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText(/Cargar igual/));
    await user.click(screen.getByRole("button", { name: "Cargar turno" }));
    expect(mocks.createManualAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: "tue-b", force: true }),
    );
  });

  it("does the same for a day that was removed", async () => {
    renderForm("wed-a");

    expect(
      screen.getByText("Este horario está quitado de la web"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Cargar igual/)).not.toBeChecked();
  });

  it("requires a chosen time", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: "Cargar turno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Elegí un día y un horario",
    );
    expect(mocks.createManualAppointment).not.toHaveBeenCalled();
  });

  it("records the deposit when the turn is confirmed, and not when it waits for it", async () => {
    const user = userEvent.setup();
    renderForm("mon-b");
    await fillRequired(user);

    await user.selectOptions(screen.getByLabelText("Seña"), "cash");
    await user.click(screen.getByRole("button", { name: "Cargar turno" }));
    expect(mocks.createManualAppointment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialStatus: "confirmed",
        depositMethod: "cash",
      }),
    );

    await user.selectOptions(
      screen.getByLabelText("Cómo queda"),
      "awaiting_deposit",
    );
    expect(screen.queryByLabelText("Seña")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cargar turno" }));
    expect(mocks.createManualAppointment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialStatus: "awaiting_deposit",
        depositMethod: null,
      }),
    );
  });

  it("asks for the neighbourhood and address only when the dog is picked up", async () => {
    const user = userEvent.setup();
    renderForm("mon-b");

    expect(screen.queryByLabelText("Barrio")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Traslado"), "pickup");
    expect(screen.getByLabelText("Barrio")).toBeRequired();
    expect(screen.getByLabelText("Dirección")).toBeRequired();
  });

  it("shows why the server refused the booking", async () => {
    const user = userEvent.setup();
    mocks.createManualAppointment.mockResolvedValue({
      ok: false,
      error: "Ese horario ya tiene un turno. Elegí otro o cancelá el que está.",
    });
    renderForm("mon-b");
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: "Cargar turno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ese horario ya tiene un turno",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
