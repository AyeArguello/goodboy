"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EVENT_LABELS } from "@/lib/domain/appointment";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import type { EmailLogRow, EventRow } from "@/lib/data/admin";
import { retryFailedEmails } from "@/app/admin/(app)/actions";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${formatDayLabel(d)} · ${formatTimeLabel(d)}`;
};

const EMAIL_LABELS: Record<string, string> = {
  request_received: "Solicitud recibida (cliente)",
  owner_new_request: "Nueva solicitud (aviso interno)",
  request_approved: "Aprobación e instrucciones de pago",
  receipt_received: "Comprobante recibido (cliente)",
  owner_receipt_received: "Comprobante para verificar (aviso interno)",
  receipt_rejected: "Comprobante rechazado",
  appointment_confirmed: "Turno confirmado",
  appointment_cancelled: "Turno cancelado",
  appointment_rescheduled: "Turno reprogramado",
  refund_recorded: "Devolución registrada",
};

const EMAIL_STATUS: Record<EmailLogRow["status"], string> = {
  sent: "Enviado",
  pending: "En proceso",
  failed: "Falló: se reintenta sin duplicar",
};

export function HistoryPanel({
  events,
  emails,
}: {
  events: EventRow[];
  emails: EmailLogRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const failed = emails.filter((e) => e.status === "failed").length;

  function retry() {
    startTransition(async () => {
      const result = await retryFailedEmails();
      setMessage(
        result.ok
          ? `Reintento listo: ${result.summary.sent} enviado(s), ${result.summary.failed} con error, ${result.summary.dismissed} ya no corresponden.`
          : result.error,
      );
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="history-title"
      className="border-lavender-100 flex flex-col gap-3 rounded-xl border bg-white p-4.5"
    >
      <h3 id="history-title" className="font-heading m-0 text-base font-bold">
        Historial
      </h3>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {events.length === 0 ? (
          <li className="text-ink-soft text-[15px]">
            Sin movimientos todavía.
          </li>
        ) : null}
        {events.map((e) => (
          <li
            key={e.id}
            className="border-lavender-100 flex flex-col border-b pb-2 last:border-0"
          >
            <span className="text-[15px]">
              <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>{" "}
              <span className="text-ink-soft">
                · {e.actor === "admin" ? "administración" : "sistema"}
              </span>
            </span>
            {e.note ? (
              <span className="text-ink-soft text-sm break-words">
                {e.note}
              </span>
            ) : null}
            <span className="text-ink-soft text-xs">{fmt(e.createdAt)}</span>
          </li>
        ))}
      </ol>

      <h4 className="font-heading m-0 text-sm font-bold">Emails</h4>
      {emails.length === 0 ? (
        <p className="text-ink-soft m-0 text-[15px]">
          Todavía no se envió ningún email.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {emails.map((e) => (
            <li key={e.id} className="text-[15px]">
              <strong>{EMAIL_LABELS[e.kind] ?? e.kind}</strong>{" "}
              <span
                className={
                  e.status === "failed"
                    ? "text-error font-bold"
                    : "text-ink-soft"
                }
              >
                · {EMAIL_STATUS[e.status]}
              </span>
              {e.lastError && e.status === "failed" ? (
                <span className="text-ink-soft block text-sm break-words">
                  {e.lastError}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {failed > 0 ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={retry}
          loading={isPending}
        >
          Reintentar emails fallidos
        </Button>
      ) : null}
      {message ? <Alert variant="info">{message}</Alert> : null}
    </section>
  );
}
