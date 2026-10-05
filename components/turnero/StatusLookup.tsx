"use client";

import { useState, useTransition, type FormEvent } from "react";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CtaLink } from "@/components/ui/Link";
import {
  StatusBadge,
  type AppointmentStatus,
} from "@/components/ui/StatusBadge";
import { businessConfig } from "@/lib/config/business";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import {
  checkStatusAction,
  type CheckStatusResult,
} from "@/app/turnos/estado/actions";

function whenLabel(iso: string): string {
  const d = new Date(iso);
  return `${formatDayLabel(d)} · ${formatTimeLabel(d)}`;
}

const STATUS_COPY: Record<
  AppointmentStatus,
  {
    text: (r: Extract<CheckStatusResult, { ok: true }>) => string;
    ctaLabel: string;
    ctaHref: (r: Extract<CheckStatusResult, { ok: true }>) => string;
  }
> = {
  pending_review: {
    text: () =>
      "Estamos revisando tu solicitud. Cuando la resolvamos te avisamos por email.",
    ctaLabel: "Escribir por WhatsApp",
    ctaHref: () => businessWhatsAppLink(),
  },
  awaiting_deposit: {
    text: (r) => {
      if (r.receiptState === "pending_verification") {
        return "Comprobante recibido, pendiente de verificación. Lo revisamos a mano y te avisamos por email cuando el turno quede confirmado.";
      }
      if (r.receiptState === "rejected") {
        return "No pudimos verificar tu comprobante. Revisá tu email: ahí te contamos el motivo y te dejamos un enlace para subir uno nuevo.";
      }
      return (
        `Tu solicitud fue aprobada. Para confirmar el turno transferí la seña de ARS ${r.depositAmountArs.toLocaleString("es-AR")}` +
        (r.depositDueAt ? ` antes del ${whenLabel(r.depositDueAt)}` : "") +
        " y subí el comprobante con el enlace que te mandamos por email."
      );
    },
    ctaLabel: "¿No encontrás el email? Escribinos por WhatsApp",
    ctaHref: () => businessWhatsAppLink(),
  },
  confirmed: {
    text: () =>
      "Turno confirmado: verificamos tu seña. Si necesitás cambiar algo, avisanos con anticipación.",
    ctaLabel: "Cómo llegar",
    ctaHref: () =>
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${businessConfig.address.street}, ${businessConfig.address.city}, ${businessConfig.address.province}`,
      )}`,
  },
  reschedule_requested: {
    text: (r) =>
      r.previousStartsAt
        ? `Nuevo horario: ${whenLabel(r.startsAt)} (antes: ${whenLabel(r.previousStartsAt)}). Si no te sirve, respondé por WhatsApp.`
        : `Nuevo horario: ${whenLabel(r.startsAt)}. Si no te sirve, respondé por WhatsApp.`,
    ctaLabel: "Responder por WhatsApp",
    ctaHref: () => businessWhatsAppLink(),
  },
  cancelled_by_client: {
    text: () =>
      "Cancelaste esta solicitud. Podés pedir un turno nuevo cuando quieras.",
    ctaLabel: "Pedir un turno nuevo",
    ctaHref: () => "/turnos",
  },
  cancelled_by_business: {
    text: () =>
      "Tuvimos que cancelar este turno. Podés elegir entre reprogramar sin costo o recibir la devolución total de la seña dentro de las 24 h por transferencia.",
    ctaLabel: "Escribir por WhatsApp",
    ctaHref: () => businessWhatsAppLink(),
  },
  deposit_forfeited: {
    text: () =>
      "Este turno se canceló sin una reprogramación válida dentro del mismo mes, por lo que la seña no se reintegra. Podés pedir un turno nuevo cuando quieras.",
    ctaLabel: "Pedir un turno nuevo",
    ctaHref: () => "/turnos",
  },
  completed: {
    text: () => "Este turno ya se completó. ¡Gracias por confiar en nosotros!",
    ctaLabel: "Pedir un turno nuevo",
    ctaHref: () => "/turnos",
  },
  no_show: {
    text: () =>
      "El servicio no pudo concretarse. No se cobra el saldo del servicio y la seña no se reintegra.",
    ctaLabel: "Escribir por WhatsApp",
    ctaHref: () => businessWhatsAppLink(),
  },
  expired: {
    text: () =>
      "El plazo para pagar la seña venció y el horario se liberó. Podés pedir un turno nuevo cuando quieras.",
    ctaLabel: "Pedir un turno nuevo",
    ctaHref: () => "/turnos",
  },
};

export function StatusLookup() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CheckStatusResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setResult(await checkStatusAction(code));
    });
  }

  const okResult = result?.ok ? result : null;
  const status = okResult ? (okResult.status as AppointmentStatus) : null;
  const copy = status ? STATUS_COPY[status] : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1.5">
        <span className="text-ink-soft text-sm">Solicitud</span>
        <h1 className="font-heading m-0 text-3xl font-bold">
          Consultar estado
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <TextField
          label="Código de solicitud"
          placeholder="GB-XXXXXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={!result?.ok ? result?.error : undefined}
        />
        <Button type="submit" loading={isPending} loadingText="Buscando…">
          Consultar
        </Button>
      </form>

      {okResult && status && copy ? (
        <div className="border-charcoal flex flex-col gap-3.5 rounded-xl border-[1.5px] bg-white p-5">
          <StatusBadge status={status} />
          <p className="m-0 text-[17px]">{copy.text(okResult)}</p>
          <dl className="border-lavender-100 m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t pt-3.5 text-base">
            <dt className="text-ink-soft">Turno</dt>
            <dd
              className={`m-0 font-bold ${
                status === "cancelled_by_client" ||
                status === "cancelled_by_business" ||
                status === "deposit_forfeited" ||
                status === "expired"
                  ? "line-through"
                  : ""
              }`}
            >
              {whenLabel(okResult.startsAt)}
            </dd>
            <dt className="text-ink-soft">Lugar</dt>
            <dd className="m-0">{businessConfig.address.street}</dd>
          </dl>
          <CtaLink
            href={copy.ctaHref(okResult)}
            target={
              copy.ctaHref(okResult).startsWith("http") ? "_blank" : undefined
            }
            rel="noopener noreferrer"
          >
            {copy.ctaLabel}
          </CtaLink>
        </div>
      ) : null}

      <p className="text-ink-soft m-0 flex gap-2 text-sm">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#55515B"
          strokeWidth="1.8"
          aria-hidden="true"
          className="mt-0.5 shrink-0"
        >
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
        Por tu privacidad, esta pantalla no muestra nombres, teléfonos ni
        direcciones. El código no viaja en la URL.
      </p>
    </div>
  );
}
