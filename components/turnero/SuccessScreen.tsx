"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CtaLink } from "@/components/ui/Link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { businessConfig } from "@/lib/config/business";
import { buildWhatsAppLink } from "@/lib/domain/whatsapp";

export interface SuccessScreenProps {
  code: string;
  slotLabel: string;
  dogName: string;
  email: string;
  whatsAppMessage: string;
  onBackHome: () => void;
}

export function SuccessScreen({
  code,
  slotLabel,
  dogName,
  email,
  whatsAppMessage,
  onBackHome,
}: SuccessScreenProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-8"
      aria-live="polite"
    >
      <div className="relative size-22">
        <span className="bg-lavender absolute inset-0 rounded-full" />
        <svg
          width="88"
          height="88"
          viewBox="0 0 88 88"
          className="absolute inset-0"
          aria-hidden="true"
        >
          <path
            d="M28 45l11 11 22-24"
            fill="none"
            stroke="#25282C"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex flex-col gap-2.5">
        <h1 className="font-heading text-charcoal m-0 text-[clamp(28px,4.4vw,36px)] leading-tight font-bold">
          Recibimos tu solicitud
        </h1>
        <div className="self-start">
          <StatusBadge status="pending_review" />
        </div>
        <p className="text-ink-soft m-0">
          Tu turno todavía no está confirmado. La dueña revisa cada solicitud y
          te avisa por email a <strong>{email}</strong>. Si la aprueba, te va a
          pedir una seña de ARS{" "}
          {businessConfig.deposit.amountArs.toLocaleString("es-AR")} (se
          descuenta del total) para confirmarlo.
        </p>
      </div>

      <div className="border-charcoal flex flex-col gap-3 rounded-xl border-[1.5px] bg-white p-4.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-ink-soft text-sm">Código de solicitud</span>
            <span className="font-heading text-2xl font-bold tracking-wider">
              {code}
            </span>
          </span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(code);
              setCopied(true);
            }}
            className="border-charcoal font-heading min-h-11 cursor-pointer rounded-full border-[1.5px] bg-white px-4 text-sm font-semibold"
          >
            {copied ? "Copiado ✓" : "Copiar"}
          </button>
        </div>
        <p className="border-lavender-100 m-0 border-t pt-3 text-base">
          <strong>{slotLabel}</strong> · {dogName}
        </p>
      </div>

      <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
        {[
          `Revisamos tu solicitud y te respondemos por email. ${businessConfig.responseTimeText} Mirá también la carpeta de correo no deseado.`,
          `Si la aprobamos, te mandamos los datos para transferir la seña de ARS ${businessConfig.deposit.amountArs.toLocaleString("es-AR")} y un enlace seguro para subir el comprobante.`,
          "Verificamos el comprobante a mano. El turno queda confirmado recién cuando lo verificamos, y te avisamos por email.",
          "El día del turno evaluamos a tu perro y confirmamos el precio final — la seña se descuenta del total.",
        ].map((text, i) => (
          <li key={i} className="grid grid-cols-[32px_1fr] gap-3">
            <span className="bg-lavender-100 font-heading flex size-8 items-center justify-center rounded-full font-bold">
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2.5">
        <CtaLink
          href={buildWhatsAppLink(
            businessConfig.whatsappNumberE164,
            whatsAppMessage,
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          Mandar una foto de mi perro por WhatsApp (opcional)
        </CtaLink>
        <Button variant="secondary" onClick={onBackHome}>
          Volver al inicio
        </Button>
      </div>

      <p className="text-ink-soft m-0 text-sm">
        Guardá el código para consultar el estado. Por tu privacidad, la página
        de estado no muestra datos personales.
      </p>
    </div>
  );
}
