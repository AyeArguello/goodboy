import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppointmentRow } from "@/lib/data/admin";
import { HistoryList } from "./HistoryList";

const row = (
  id: string,
  dogName: string,
  status: AppointmentRow["status"],
): AppointmentRow => ({
  id,
  code: `GB-${id}`,
  dogName,
  sizeBucket: "pequeno",
  breed: null,
  coatState: null,
  servicePackage: "crecimiento_continuo",
  notes: null,
  adminNotes: null,
  logisticsMode: "self",
  neighborhood: null,
  pickupAddress: null,
  ownerName: "Marta",
  phoneE164: "+5493511234567",
  email: null,
  status,
  startsAt: "2030-01-08T12:00:00Z",
  slotId: `slot-${id}`,
  depositDueAt: null,
  latestPayment: null,
  receipts: [],
  closedAt: null,
  retentionHold: false,
  retentionHoldReason: null,
  disputeResolvedAt: null,
});

const counts = { all: 3, cancelled: 1, expired: 1, completed: 1, no_show: 0 };

describe("HistoryList", () => {
  it("shows each closed request with its status and a link to its file", () => {
    render(
      <HistoryList
        appointments={[
          row("a", "Luna", "expired"),
          row("b", "Toby", "cancelled_by_client"),
        ]}
        counts={counts}
        filter="all"
        query=""
      />,
    );

    expect(screen.getByText("Vencido")).toBeInTheDocument();
    expect(screen.getByText("Cancelado por el cliente")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Ver ficha" })[0],
    ).toHaveAttribute("href", "/admin/solicitudes/a");
  });

  it("puts a count on every tab and keeps the search when changing tab", () => {
    render(
      <HistoryList
        appointments={[]}
        counts={counts}
        filter="all"
        query="luna"
      />,
    );

    const tabs = screen.getByRole("navigation", { name: "Filtrar historial" });
    expect(
      within(tabs).getByRole("link", { name: "Todas (3)" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(tabs).getByRole("link", { name: "Canceladas (1)" }),
    ).toHaveAttribute("href", "/admin/historial?filter=cancelled&q=luna");
    expect(
      within(tabs).getByRole("link", { name: "No vino (0)" }),
    ).toBeVisible();
  });

  it("says when nothing matches the search", () => {
    render(
      <HistoryList
        appointments={[]}
        counts={counts}
        filter="all"
        query="zzz"
      />,
    );

    expect(
      screen.getByText("No encontramos solicitudes con esa búsqueda."),
    ).toBeInTheDocument();
  });
});
