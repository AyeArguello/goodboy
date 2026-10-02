import { businessConfig } from "@/lib/config/business";
import type { StepFormProps } from "./Step2Dog";

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
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
            <button
              key={c.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => setField(c.key, !checked)}
              className={`grid grid-cols-[auto_1fr] items-start gap-3.5 rounded-lg border-[1.5px] bg-white px-4 py-4 text-left ${
                invalid
                  ? "border-error"
                  : checked
                    ? "border-purple"
                    : "border-lavender"
              }`}
            >
              <span
                className={`mt-0.5 flex size-6 items-center justify-center rounded-sm border-2 ${
                  checked ? "border-purple bg-purple" : "border-ink-soft"
                }`}
              >
                {checked ? <CheckIcon /> : null}
              </span>
              <span className="flex flex-col gap-1">
                <strong className="font-heading text-base font-bold">
                  {c.title}
                </strong>
                <span className="text-ink-soft text-[15px]">{c.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {errors.consent ? (
        <span role="alert" className="text-error text-sm font-bold">
          ⚠ {errors.consent}
        </span>
      ) : null}

      <a href="/privacidad" className="flex min-h-11 items-center text-sm">
        Leer política de privacidad completa
      </a>
      <a
        href="/terminos-de-reserva"
        className="flex min-h-11 items-center text-sm"
      >
        Leer términos de reserva completos
      </a>
    </section>
  );
}
