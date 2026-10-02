import { Alert } from "@/components/ui/Alert";
import { businessConfig } from "@/lib/config/business";
import {
  COAT_LABELS,
  SERVICE_PACKAGE_LABELS,
  SIZE_LABELS,
} from "@/lib/domain/appointment";
import { formatDurationHM } from "@/lib/domain/datetime";
import type { WizardForm } from "./types";

export interface Step6ReviewProps {
  form: WizardForm;
  slotLabel: string;
  networkError: boolean;
  onEditStep: (step: number) => void;
}

export function Step6Review({
  form,
  slotLabel,
  networkError,
  onEditStep,
}: Step6ReviewProps) {
  const rows = [
    {
      label: "Turno",
      value: `${slotLabel} · duración ${formatDurationHM(businessConfig.rules.serviceDurationMinMinutes)} a ${formatDurationHM(businessConfig.rules.serviceDurationMaxMinutes)}`,
      step: 1,
    },
    {
      label: "Perro",
      value: [
        form.dogName,
        form.sizeBucket && SIZE_LABELS[form.sizeBucket],
        form.breed,
        form.coatState && `manto ${COAT_LABELS[form.coatState].toLowerCase()}`,
        form.servicePackage && SERVICE_PACKAGE_LABELS[form.servicePackage],
      ]
        .filter(Boolean)
        .join(" · "),
      step: 2,
    },
    {
      label: "Logística",
      value:
        form.logisticsMode === "pickup"
          ? `Necesito traslado · ${form.neighborhood} · costo a confirmar`
          : `Lo llevo yo a ${businessConfig.address.street}`,
      step: 3,
    },
    {
      label: "Responsable",
      value: `${form.ownerName} · +54 ${form.phone} · ${form.email}`,
      step: 4,
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-heading text-charcoal m-0 text-[clamp(26px,4vw,34px)] leading-tight font-bold">
        Revisá tu solicitud
      </h1>

      {networkError ? (
        <Alert variant="error" title="No pudimos enviar tu solicitud">
          Revisá tu conexión y probá de nuevo. Tus datos siguen acá; no hace
          falta cargarlos otra vez.
        </Alert>
      ) : null}

      <div className="border-charcoal rounded-xl border-[1.5px] bg-white px-4.5">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`grid grid-cols-[1fr_auto] gap-3 py-3.5 ${i === rows.length - 1 ? "" : "border-lavender-100 border-b"}`}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-heading text-purple text-xs font-semibold tracking-[0.06em] uppercase">
                {r.label}
              </span>
              <span className="text-[16px] break-words">{r.value}</span>
            </span>
            <button
              type="button"
              onClick={() => onEditStep(r.step)}
              className="font-heading text-purple h-fit min-h-11 cursor-pointer self-center rounded-full border-0 bg-none px-3 text-sm font-semibold underline"
            >
              Editar
            </button>
          </div>
        ))}
      </div>

      <div
        role="note"
        className="bg-lavender-100 flex items-start gap-3 rounded-lg p-4"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#25282C"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 7v5l3 2" />
        </svg>
        <p className="m-0 text-base">
          <strong>Todavía no es un turno confirmado.</strong> Al enviar, tu
          solicitud queda pendiente de revisión y no se paga nada ahora. Si la
          aprobamos, te escribimos por email con los datos para transferir una
          seña de ARS {businessConfig.deposit.amountArs.toLocaleString("es-AR")}{" "}
          (se descuenta del total) y un enlace seguro para subir el comprobante.
        </p>
      </div>
    </section>
  );
}
