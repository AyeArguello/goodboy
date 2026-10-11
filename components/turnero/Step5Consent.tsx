"use client";

import { LegalDialogs } from "@/components/legal/LegalDialogs";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { businessConfig } from "@/lib/config/business";
import type { StepFormProps } from "./Step2Dog";

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#684e7a"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Step5Consent({ form, errors, setField }: StepFormProps) {
  const consents = [
    {
      key: "consentPrice" as const,
      title: "Precio orientativo",
      text: "Entiendo que el precio es orientativo y se confirma al recibir y evaluar a mi perro. El traslado, si lo pedí, se confirma según barrio.",
    },
    {
      key: "consentDeposit" as const,
      title: "Seña y cancelación",
      text: `Entiendo que para confirmar el turno se pide una seña de ARS ${businessConfig.deposit.amountArs.toLocaleString(
        "es-AR",
      )} por transferencia (se descuenta del total), que debo subir el comprobante y que el turno queda confirmado recién cuando Good Boy lo verifica. ${businessConfig.cancellationPolicyText}`,
    },
    {
      key: "consentPrivacy" as const,
      title: "Privacidad",
      text: "Acepto que mis datos, y el comprobante de pago que suba, se usen solo para gestionar este turno. Entiendo que el comprobante se elimina automáticamente después del cierre del turno.",
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-heading text-charcoal m-0 text-[clamp(26px,4vw,34px)] leading-tight font-bold">
        Antes de enviar
      </h1>

      <div className="flex flex-col gap-2.5">
        {consents.map((c) => {
          const checked = form[c.key];
          const invalid = !!errors.consent && !checked;
          return (
            <SelectableCard
              key={c.key}
              role="checkbox"
              selected={checked}
              invalid={invalid}
              onClick={() => setField(c.key, !checked)}
              className="grid grid-cols-[auto_1fr] items-start gap-3.5 rounded-lg px-4 py-4"
            >
              <span
                className={`mt-0.5 flex size-6 items-center justify-center rounded-sm border-2 ${
                  checked ? "border-white bg-white" : "border-ink-soft"
                }`}
              >
                {checked ? <CheckIcon /> : null}
              </span>
              <span className="flex flex-col gap-1">
                <strong className="font-heading text-base font-bold">
                  {c.title}
                </strong>
                <span
                  className={`text-[15px] ${checked ? "text-white/90" : "text-ink-soft"}`}
                >
                  {c.text}
                </span>
              </span>
            </SelectableCard>
          );
        })}
      </div>

      {errors.consent ? (
        <span role="alert" className="text-error text-sm font-bold">
          ⚠ {errors.consent}
        </span>
      ) : null}

      <LegalDialogs />
    </section>
  );
}
