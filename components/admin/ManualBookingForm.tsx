"use client";

import {
  useId,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { statusLabel } from "@/components/ui/StatusBadge";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import {
  COAT_LABELS,
  SERVICE_PACKAGE_LABELS,
  SIZE_LABELS,
  type CoatState,
  type ServicePackageKey,
  type SizeBucket,
  needsTransport,
  LOGISTICS_LABELS,
  type LogisticsMode,
} from "@/lib/domain/appointment";
import type { ScheduleDay, ScheduleSlot } from "@/lib/data/admin";
import { createManualAppointment } from "@/app/admin/(app)/actions";

export interface ManualBookingFormProps {
  days: ScheduleDay[];
  initialSlotId: string | null;
  initialDateKey: string | null;
  /** Server clock in ms: keeps "already passed" stable between server and client render. */
  nowMs: number;
}

function SelectField({
  label,
  children,
  ...rest
}: { label: string; children: ReactNode } & Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "id" | "className"
>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-heading text-charcoal text-[15px] font-semibold"
      >
        {label}
      </label>
      <select
        id={id}
        className="text-charcoal border-ink-soft focus:border-purple min-h-13 w-full rounded-md border-[1.5px] bg-white px-3 font-sans text-[17px] focus:shadow-[0_0_0_3px_var(--color-lavender)] focus:outline-none"
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

const monthNameFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  timeZone: "UTC",
});

const monthKeyOf = (dateKey: string) => dateKey.slice(0, 7);

/** "octubre" for a "YYYY-MM" key. */
function monthName(monthKey: string): string {
  return monthNameFormatter.format(new Date(`${monthKey}-15T12:00:00Z`));
}

function labelOf(dateKey: string): string {
  return formatDayLabel(new Date(`${dateKey}T15:00:00Z`));
}

type SlotChoice = {
  slot: ScheduleSlot;
  disabledReason: string | null;
  needsForce: boolean;
};

function choicesFor(day: ScheduleDay | undefined, nowMs: number): SlotChoice[] {
  if (!day) return [];
  return day.slots.map((slot) => {
    if (slot.appointment) {
      return {
        slot,
        disabledReason: `Ocupado · ${slot.appointment.dogName} (${statusLabel(slot.appointment.status)})`,
        needsForce: false,
      };
    }
    if (new Date(slot.startsAt).getTime() <= nowMs) {
      return { slot, disabledReason: "Ya pasó", needsForce: false };
    }
    return {
      slot,
      disabledReason: null,
      needsForce: !slot.isPublished || day.blocked !== null,
    };
  });
}

export function ManualBookingForm({
  days,
  initialSlotId,
  initialDateKey,
  nowMs,
}: ManualBookingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const bookableDays = useMemo(
    () => days.filter((d) => d.slots.length > 0),
    [days],
  );
  const startDay =
    days.find((d) => d.slots.some((s) => s.slotId === initialSlotId))
      ?.dateKey ??
    (initialDateKey && bookableDays.some((d) => d.dateKey === initialDateKey)
      ? initialDateKey
      : (bookableDays.find((d) =>
          choicesFor(d, nowMs).some((c) => !c.disabledReason),
        )?.dateKey ??
        bookableDays[0]?.dateKey ??
        ""));

  const [dateKey, setDateKey] = useState(startDay);
  const [slotId, setSlotId] = useState<string | null>(initialSlotId);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dogName, setDogName] = useState("");
  const [sizeBucket, setSizeBucket] = useState<SizeBucket>("mediano");
  const [breed, setBreed] = useState("");
  const [coatState, setCoatState] = useState<CoatState>("no_se");
  const [servicePackage, setServicePackage] = useState<ServicePackageKey>(
    "crecimiento_continuo",
  );
  const [notes, setNotes] = useState("");
  const [logisticsMode, setLogisticsMode] = useState<LogisticsMode>("self");
  const [neighborhood, setNeighborhood] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [initialStatus, setInitialStatus] = useState<
    "confirmed" | "awaiting_deposit"
  >("confirmed");
  const [depositMethod, setDepositMethod] = useState<
    "" | "cash" | "bank_transfer"
  >("");

  const day = days.find((d) => d.dateKey === dateKey);
  const choices = choicesFor(day, nowMs);
  const chosen = choices.find((c) => c.slot.slotId === slotId);
  const needsForce = chosen?.needsForce ?? false;

  const months = [...new Set(bookableDays.map((d) => monthKeyOf(d.dateKey)))];
  const spansYears = new Set(months.map((m) => m.slice(0, 4))).size > 1;
  const monthKey = monthKeyOf(dateKey);

  function pickMonth(next: string) {
    const inMonth = bookableDays.filter((d) => monthKeyOf(d.dateKey) === next);
    const target =
      inMonth.find((d) =>
        choicesFor(d, nowMs).some((c) => !c.disabledReason),
      ) ?? inMonth[0];
    if (target) pickDay(target.dateKey);
  }

  function pickDay(next: string) {
    setDateKey(next);
    setSlotId(null);
    setForce(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!slotId || !chosen || chosen.disabledReason) {
      setError("Elegí un día y un horario libre.");
      return;
    }
    if (needsForce && !force) {
      setError('Marcá "Cargar igual" para usar un horario quitado.');
      return;
    }
    startTransition(async () => {
      const result = await createManualAppointment({
        slotId,
        dogName,
        sizeBucket,
        breed,
        coatState,
        servicePackage,
        notes,
        logisticsMode,
        neighborhood,
        pickupAddress,
        ownerName,
        phone,
        email,
        initialStatus,
        depositMethod:
          initialStatus === "confirmed" && depositMethod ? depositMethod : null,
        force: needsForce && force,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/solicitudes/${result.appointmentId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-heading m-0 text-lg font-bold">1. Día y horario</h2>
        <div
          role="radiogroup"
          aria-label="Mes"
          className="flex flex-wrap gap-2"
        >
          {months.map((month) => {
            const current = month === monthKey;
            return (
              <button
                key={month}
                type="button"
                role="radio"
                aria-checked={current}
                onClick={() => pickMonth(month)}
                className={`font-heading min-h-11 cursor-pointer rounded-full border-[1.5px] px-4 text-sm font-semibold first-letter:uppercase ${
                  current
                    ? "border-purple bg-purple text-white"
                    : "border-lavender text-charcoal bg-white"
                }`}
              >
                {monthName(month)}
                {spansYears ? ` ${month.slice(0, 4)}` : ""}
              </button>
            );
          })}
        </div>
        <div
          role="radiogroup"
          aria-label="Día"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {bookableDays
            .filter((d) => monthKeyOf(d.dateKey) === monthKey)
            .map((d) => {
              const sel = d.dateKey === dateKey;
              const free = choicesFor(d, nowMs).filter(
                (c) => !c.disabledReason && !c.needsForce,
              ).length;
              const [weekday] = labelOf(d.dateKey).split(",");
              return (
                <button
                  key={d.dateKey}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => pickDay(d.dateKey)}
                  className={`font-heading flex min-h-18 min-w-18 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-[1.5px] ${
                    sel
                      ? "border-charcoal bg-charcoal text-white"
                      : "border-lavender text-charcoal bg-white"
                  }`}
                >
                  <span className="text-xs font-semibold uppercase">
                    {weekday!.slice(0, 3)}
                  </span>
                  <span className="text-xl font-bold">
                    {Number(d.dateKey.slice(8, 10))}
                  </span>
                  <span className="font-sans text-xs font-bold">
                    {d.blocked
                      ? "Quitado"
                      : free > 0
                        ? `${free} libres`
                        : "Completo"}
                  </span>
                </button>
              );
            })}
        </div>

        <div
          role="radiogroup"
          aria-label="Horario"
          className="flex flex-col gap-2"
        >
          <p className="font-heading m-0 text-[15px] font-semibold first-letter:uppercase">
            {day ? labelOf(day.dateKey) : ""}
          </p>
          {choices.map(({ slot, disabledReason, needsForce: forced }) => {
            const sel = slot.slotId === slotId;
            return (
              <button
                key={slot.slotId}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={!!disabledReason}
                onClick={() => {
                  setSlotId(slot.slotId);
                  setForce(false);
                }}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border-[1.5px] px-4 text-left ${
                  disabledReason
                    ? "border-lavender-100 text-ink-soft cursor-not-allowed bg-white"
                    : sel
                      ? "border-purple bg-lavender-100 cursor-pointer"
                      : "border-lavender hover:bg-lavender-100 cursor-pointer bg-white"
                }`}
              >
                <strong className="font-heading text-xl tabular-nums">
                  {formatTimeLabel(new Date(slot.startsAt))}
                </strong>
                <span className="text-ink-soft text-sm">
                  {disabledReason ??
                    (forced ? "Quitado: se puede cargar igual" : "Libre")}
                </span>
              </button>
            );
          })}
        </div>

        {needsForce ? (
          <Alert variant="warning" title="Este horario está quitado de la web">
            <label className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                checked={force}
                onChange={(event) => setForce(event.target.checked)}
                className="mt-1 size-5"
              />
              <span>Cargar igual: lo voy a atender</span>
            </label>
          </Alert>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading m-0 text-lg font-bold">2. El perro</h2>
        <TextField
          label="Nombre del perro"
          value={dogName}
          onChange={(event) => setDogName(event.target.value)}
          maxLength={80}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Tamaño"
            value={sizeBucket}
            onChange={(event) =>
              setSizeBucket(event.target.value as SizeBucket)
            }
          >
            {Object.entries(SIZE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Pelo"
            value={coatState}
            onChange={(event) => setCoatState(event.target.value as CoatState)}
          >
            {Object.entries(COAT_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </SelectField>
        </div>
        <SelectField
          label="Servicio"
          value={servicePackage}
          onChange={(event) =>
            setServicePackage(event.target.value as ServicePackageKey)
          }
        >
          {Object.entries(SERVICE_PACKAGE_LABELS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Raza"
          optional
          value={breed}
          onChange={(event) => setBreed(event.target.value)}
          maxLength={100}
        />
        <TextAreaField
          label="Notas"
          optional
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading m-0 text-lg font-bold">
          3. Quién trae al perro
        </h2>
        <TextField
          label="Nombre y apellido"
          value={ownerName}
          onChange={(event) => setOwnerName(event.target.value)}
          maxLength={80}
          required
        />
        <TextField
          label="Teléfono (código de área y número)"
          prefix="+54"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="3511234567"
          required
        />
        <TextField
          label="Email"
          optional
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          hint="Si lo cargás, le llega el aviso del turno por email."
        />
        <SelectField
          label="Traslado"
          value={logisticsMode}
          onChange={(event) =>
            setLogisticsMode(event.target.value as LogisticsMode)
          }
        >
          {(Object.keys(LOGISTICS_LABELS) as LogisticsMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {LOGISTICS_LABELS[mode]}
            </option>
          ))}
        </SelectField>
        {needsTransport(logisticsMode) ? (
          <>
            <TextField
              label="Barrio"
              value={neighborhood}
              onChange={(event) => setNeighborhood(event.target.value)}
              maxLength={100}
              required
            />
            <TextField
              label="Dirección"
              value={pickupAddress}
              onChange={(event) => setPickupAddress(event.target.value)}
              maxLength={200}
              required
            />
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading m-0 text-lg font-bold">
          4. Estado del turno
        </h2>
        <SelectField
          label="Cómo queda"
          value={initialStatus}
          onChange={(event) => {
            const next = event.target.value as "confirmed" | "awaiting_deposit";
            setInitialStatus(next);
            if (next !== "confirmed") setDepositMethod("");
          }}
        >
          <option value="confirmed">Confirmado (ya está acordado)</option>
          <option value="awaiting_deposit">Esperando la seña</option>
        </SelectField>
        {initialStatus === "confirmed" ? (
          <SelectField
            label="Seña"
            value={depositMethod}
            onChange={(event) =>
              setDepositMethod(
                event.target.value as "" | "cash" | "bank_transfer",
              )
            }
          >
            <option value="">Sin seña registrada todavía</option>
            <option value="cash">Seña recibida en efectivo</option>
            <option value="bank_transfer">
              Seña recibida por transferencia
            </option>
          </SelectField>
        ) : (
          <p className="text-ink-soft m-0 text-sm">
            Queda con el plazo habitual para pagar la seña. Con email, le llegan
            las instrucciones y el enlace para subir el comprobante.
          </p>
        )}
      </section>

      {error ? (
        <p role="alert" className="text-error m-0 font-bold">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={isPending} loadingText="Cargando…">
          Cargar turno
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/admin/horarios")}
        >
          Volver a horarios
        </Button>
      </div>
    </form>
  );
}
