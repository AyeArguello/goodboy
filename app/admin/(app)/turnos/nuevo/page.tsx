import { ManualBookingForm } from "@/components/admin/ManualBookingForm";
import { getScheduleOverview, serverNowMs } from "@/lib/data/admin";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string; day?: string }>;
}) {
  const { slot, day } = await searchParams;
  const days = await getScheduleOverview();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading m-0 text-xl font-bold">
          Cargar un turno a mano
        </h1>
        <span className="text-ink-soft text-sm">
          Para pedidos por teléfono, WhatsApp o en persona. Solo se ofrecen
          horarios libres de la agenda.
        </span>
      </div>
      <ManualBookingForm
        days={days}
        initialSlotId={slot ?? null}
        initialDateKey={day ?? null}
        nowMs={serverNowMs()}
      />
    </div>
  );
}
