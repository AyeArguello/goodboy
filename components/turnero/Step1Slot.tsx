import { SelectableCard } from "@/components/ui/SelectableCard";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { CtaLink } from "@/components/ui/Link";
import { businessConfig } from "@/lib/config/business";
import { formatDurationHM } from "@/lib/domain/datetime";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";
import { Button } from "@/components/ui/Button";
import type { DayGroup } from "./grouping";
import type { TakenNotice } from "./types";

export interface Step1SlotProps {
  days: DayGroup[];
  selectedDateKey: string | null;
  selectedSlotId: string | null;
  error?: string;
  /** The slot the person had chosen was taken by somebody else meanwhile. */
  taken: TakenNotice | null;
  onSelectDate: (dateKey: string) => void;
  onSelectSlot: (slotId: string) => void;
}

const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  timeZone: "UTC",
});

const monthKeyOf = (dateKey: string) => dateKey.slice(0, 7);

function monthLabel(monthKey: string, withYear: boolean): string {
  const date = new Date(`${monthKey}-15T12:00:00Z`);
  const name = monthFormatter.format(date);
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return withYear ? `${capitalized} ${monthKey.slice(0, 4)}` : capitalized;
}

/** Monday-first column (0..6) of a calendar day. */
function columnOf(dateKey: string): number {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return (weekday + 6) % 7;
}

const WEEKDAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"];
const WEEKDAY_NAMES = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

function lastDayOfMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/**
 * One month at a time: month tabs on top, then a Monday-first calendar grid
 * where only days with times are tappable. Replaces a long horizontal strip
 * of days.
 */
function DayPicker({
  days,
  selectedDateKey,
  onSelectDate,
}: {
  days: DayGroup[];
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string) => void;
}) {
  const months = [...new Set(days.map((d) => monthKeyOf(d.dateKey)))];
  const spansYears = new Set(months.map((m) => m.slice(0, 4))).size > 1;
  const activeMonth = monthKeyOf(selectedDateKey ?? days[0]!.dateKey);
  const byDate = new Map(days.map((d) => [d.dateKey, d]));
  const bookableCount = (d: DayGroup) =>
    d.slots.filter((slot) => slot.bookable).length;

  const goToMonth = (monthKey: string) => {
    const inMonth = days.filter((d) => monthKeyOf(d.dateKey) === monthKey);
    const target = inMonth.find((d) => bookableCount(d) > 0) ?? inMonth[0];
    if (target) onSelectDate(target.dateKey);
  };

  const cells: (string | null)[] = Array.from(
    { length: columnOf(`${activeMonth}-01`) },
    () => null,
  );
  for (let day = 1; day <= lastDayOfMonth(activeMonth); day++) {
    cells.push(`${activeMonth}-${String(day).padStart(2, "0")}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {months.length > 1 ? (
        <div
          role="radiogroup"
          aria-label="Mes"
          className="flex flex-wrap gap-2"
        >
          {months.map((monthKey) => (
            <SelectableCard
              key={monthKey}
              role="radio"
              tone="solid"
              selected={monthKey === activeMonth}
              onClick={() => goToMonth(monthKey)}
              className="font-heading min-h-11 rounded-full px-4 text-sm font-bold"
            >
              {monthLabel(monthKey, spansYears)}
            </SelectableCard>
          ))}
        </div>
      ) : (
        <p className="font-heading text-charcoal m-0 text-base font-bold">
          {monthLabel(activeMonth, spansYears)}
        </p>
      )}

      <div className="border-lavender rounded-lg border-[1.5px] bg-white p-2 sm:p-3">
        <div
          aria-hidden="true"
          className="grid grid-cols-7 gap-1 pb-1 sm:gap-1.5"
        >
          {WEEKDAY_HEADERS.map((header, index) => (
            <span
              key={index}
              className="text-ink-soft text-center text-xs font-semibold"
            >
              {header}
            </span>
          ))}
        </div>
        <div
          role="radiogroup"
          aria-label="Día"
          className="grid grid-cols-7 gap-1 sm:gap-1.5"
        >
          {cells.map((dateKey, index) => {
            if (!dateKey) return <span key={`blank-${index}`} />;
            const day = byDate.get(dateKey);
            const number = Number(dateKey.slice(8, 10));
            if (!day) {
              return (
                <span
                  key={dateKey}
                  aria-hidden="true"
                  className="text-ink-soft/50 flex min-h-12 items-center justify-center text-sm tabular-nums"
                >
                  {number}
                </span>
              );
            }
            const count = bookableCount(day);
            return (
              <SelectableCard
                key={dateKey}
                role="radio"
                tone="solid"
                selected={dateKey === selectedDateKey}
                onClick={() => onSelectDate(dateKey)}
                aria-label={`${day.dayLabel}, ${day.slots.length} horarios`}
                title={WEEKDAY_NAMES[columnOf(dateKey)]}
                className="font-heading flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-0 py-1.5"
              >
                <span className="text-base leading-none font-bold tabular-nums sm:text-lg">
                  {number}
                </span>
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${
                    dateKey === selectedDateKey
                      ? "bg-white"
                      : count > 0
                        ? "bg-purple"
                        : "bg-lavender"
                  }`}
                />
              </SelectableCard>
            );
          })}
        </div>
      </div>
      <p className="text-ink-soft m-0 flex items-center gap-1.5 text-xs">
        <span aria-hidden="true" className="bg-purple size-1.5 rounded-full" />
        Días con horarios libres
      </p>
    </div>
  );
}

export function Step1Slot({
  days,
  selectedDateKey,
  selectedSlotId,
  error,
  taken,
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
          Ves los horarios libres de las próximas semanas. Se pide con al menos{" "}
          {businessConfig.rules.minLeadHours} h de anticipación. Cada turno dura
          entre{" "}
          {formatDurationHM(businessConfig.rules.serviceDurationMinMinutes)} y{" "}
          {formatDurationHM(businessConfig.rules.serviceDurationMaxMinutes)}.
        </p>
      </div>

      {taken ? (
        <div role="alert">
          <Alert
            variant="warning"
            title={
              taken.reason === "DAY_FULL"
                ? "Ese día ya no tiene lugar"
                : "Ese turno ya fue tomado"
            }
          >
            <div className="flex flex-col items-start gap-3">
              <p className="m-0">
                {taken.label !== "Sin elegir" ? `${taken.label}: ` : ""}
                otra persona lo reservó unos instantes antes que vos, así que ya
                no está disponible. Tus datos quedan guardados: elegí otro día u
                horario y seguí desde donde estabas.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const picker = document.getElementById("elegir-horario");
                  picker?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  picker
                    ?.querySelector<HTMLElement>('[role="radio"]')
                    ?.focus({ preventScroll: true });
                }}
              >
                Elegir otro horario
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {days.length === 0 ? (
        <EmptyState
          title="Por ahora no hay horarios disponibles"
          description="Escribinos por WhatsApp y te avisamos cuando haya lugar."
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
          <div id="elegir-horario" className="flex scroll-mt-4 flex-col gap-5">
            <DayPicker
              days={days}
              selectedDateKey={selectedDay?.dateKey ?? null}
              onSelectDate={onSelectDate}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <h2 className="font-heading m-0 text-lg font-bold">
              {selectedDay?.dayLabel}
            </h2>
            {selectedDay?.slots.map((s) => {
              const chosen = selectedSlotId === s.slotId;
              return (
                <SelectableCard
                  key={s.slotId}
                  role="radio"
                  tone="solid"
                  selected={chosen}
                  disabled={!s.bookable}
                  onClick={() => onSelectSlot(s.slotId)}
                  className="grid min-h-19 grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-4.5"
                >
                  <span className="flex flex-col">
                    <span className="font-heading text-xl font-bold tabular-nums">
                      {s.timeLabel}
                    </span>
                    <span
                      className={`text-sm ${chosen ? "text-white/90" : "text-ink-soft"}`}
                    >
                      {s.bookable
                        ? "Disponible"
                        : `Mínimo ${businessConfig.rules.minLeadHours} h de anticipación`}
                    </span>
                  </span>
                  {chosen ? (
                    <span className="font-heading text-purple text-purple! inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-bold">
                      <span aria-hidden="true" className="text-purple!">
                        ✓
                      </span>{" "}
                      Elegido
                    </span>
                  ) : s.bookable ? (
                    <span className="font-heading text-purple text-xs font-semibold">
                      Disponible
                    </span>
                  ) : null}
                </SelectableCard>
              );
            })}
            {selectedDay?.slots.length === 0 ? (
              <p className="border-lavender text-ink-soft m-0 rounded-lg border-[1.5px] border-dashed p-4.5">
                Este día no tiene horarios disponibles.
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
