import { SelectableCard } from "@/components/ui/SelectableCard";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { CtaLink } from "@/components/ui/Link";
import { businessConfig } from "@/lib/config/business";
import { formatDurationHM } from "@/lib/domain/datetime";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";
import type { DayGroup } from "./grouping";

export interface Step1SlotProps {
  days: DayGroup[];
  selectedDateKey: string | null;
  selectedSlotId: string | null;
  error?: string;
  takenBanner: boolean;
  onSelectDate: (dateKey: string) => void;
  onSelectSlot: (slotId: string) => void;
}

export function Step1Slot({
  days,
  selectedDateKey,
  selectedSlotId,
  error,
  takenBanner,
  onSelectDate,
  onSelectSlot,
}: Step1SlotProps) {
  const selectedDay =
    days.find((d) => d.dateKey === selectedDateKey) ?? days[0];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-charcoal m-0 text-[clamp(26px,4vw,34px)] leading-tight font-bold">
          Elegí día y horario
        </h1>
        <p className="text-ink-soft m-0">
          Solo ves horarios publicados. Se pide con al menos{" "}
          {businessConfig.rules.minLeadHours} h de anticipación. Cada turno dura
          entre{" "}
          {formatDurationHM(businessConfig.rules.serviceDurationMinMinutes)} y{" "}
          {formatDurationHM(businessConfig.rules.serviceDurationMaxMinutes)}.
        </p>
      </div>

      {takenBanner ? (
        <Alert variant="warning" title="Ese horario acaba de ser tomado">
          Elegí otro: los datos que cargaste quedan guardados.
        </Alert>
      ) : null}

      {days.length === 0 ? (
        <EmptyState
          title="Por ahora no hay horarios publicados"
          description="La dueña publica los horarios de a poco para que nadie espere. Escribinos por WhatsApp y te avisamos cuando haya lugar."
          action={
            <CtaLink
              href={businessWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Avisarme por WhatsApp
            </CtaLink>
          }
        />
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="Día"
            className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-2"
          >
            {days.map((d) => {
              const sel = d.dateKey === selectedDay?.dateKey;
              const hasBookable = d.slots.some((s) => s.bookable);
              return (
                <SelectableCard
                  key={d.dateKey}
                  role="radio"
                  selected={sel}
                  onClick={() => onSelectDate(d.dateKey)}
                  className="font-heading flex w-18 shrink-0 flex-col items-center justify-center gap-0 rounded-lg py-2"
                  aria-label={`${d.dayLabel}, ${d.slots.length} horarios`}
                >
                  <span className="text-xs font-semibold uppercase">
                    {d.dayLabel.split(",")[0]}
                  </span>
                  <span className="text-2xl font-bold">
                    {d.dayLabel.match(/\d+/)?.[0]}
                  </span>
                  <span className="font-sans text-[11px] font-semibold">
                    {hasBookable
                      ? `${d.slots.filter((s) => s.bookable).length} horarios`
                      : "Hoy no"}
                  </span>
                </SelectableCard>
              );
            })}
          </div>

          <div className="flex flex-col gap-2.5">
            <h2 className="font-heading m-0 text-lg font-bold">
              {selectedDay?.dayLabel}
            </h2>
            {selectedDay?.slots.map((s) => (
              <SelectableCard
                key={s.slotId}
                role="radio"
                selected={selectedSlotId === s.slotId}
                disabled={!s.bookable}
                onClick={() => onSelectSlot(s.slotId)}
                className="grid min-h-19 grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-4.5"
              >
                <span className="flex flex-col">
                  <span className="font-heading text-xl font-bold tabular-nums">
                    {s.timeLabel}
                  </span>
                  <span className="text-ink-soft text-sm">
                    {s.bookable
                      ? "Disponible"
                      : `Mínimo ${businessConfig.rules.minLeadHours} h de anticipación`}
                  </span>
                </span>
                <span className="font-heading text-purple text-xs font-semibold">
                  {selectedSlotId === s.slotId
                    ? "✓ Elegido"
                    : s.bookable
                      ? "Disponible"
                      : ""}
                </span>
              </SelectableCard>
            ))}
            {selectedDay?.slots.length === 0 ? (
              <p className="border-lavender text-ink-soft m-0 rounded-lg border-[1.5px] border-dashed p-4.5">
                Este día todavía no tiene horarios publicados.
              </p>
            ) : null}
          </div>
        </>
      )}

      {error ? (
        <p
          role="alert"
          className="text-error m-0 flex items-center gap-1.5 font-bold"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
