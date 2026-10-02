"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import type { MaintenanceOverview } from "@/lib/data/admin";
import { retryFailedEmails, runReceiptPurge } from "@/app/admin/(app)/actions";

export function MaintenancePanel({
  overview,
}: {
  overview: MaintenanceOverview;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    kind: "info" | "error";
    text: string;
  } | null>(null);
  const [now] = useState(() => Date.now());

  const last = overview.lastRun;
  const stale =
    !last || now - new Date(last.startedAt).getTime() > 36 * 60 * 60 * 1000;
  const lastDate = last ? new Date(last.startedAt) : null;

  function purge(rearm: boolean) {
    startTransition(async () => {
      const result = await runReceiptPurge(rearm);
      setMessage(
        result.ok
          ? {
              kind: result.summary.error ? "error" : "info",
              text: `Limpieza lista: ${result.summary.deleted} eliminado(s), ${result.summary.failed} con error, ${result.summary.orphansRemoved} archivo(s) huérfano(s) quitados.${result.summary.error ? ` Aviso: ${result.summary.error}` : ""}`,
            }
          : { kind: "error", text: result.error },
      );
      router.refresh();
    });
  }

  function retryEmails() {
    startTransition(async () => {
      const result = await retryFailedEmails();
      setMessage(
        result.ok
          ? {
              kind: "info",
              text: `Emails: ${result.summary.sent} enviado(s), ${result.summary.failed} con error, ${result.summary.dismissed} ya no corresponden.`,
            }
          : { kind: "error", text: result.error },
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">
        {message ? <Alert variant={message.kind}>{message.text}</Alert> : null}
      </div>

      <section
        aria-labelledby="purge-title"
        className="border-lavender-100 flex flex-col gap-3 rounded-xl border bg-white p-4.5"
      >
        <h2 id="purge-title" className="font-heading m-0 text-base font-bold">
          Eliminación de comprobantes
        </h2>
        <p className="text-ink-soft m-0 text-[15px]">
          Se ejecuta sola una vez por día. Elimina el archivo de cada
          comprobante vencido (rechazado: 7 días; solicitud vencida: 7 días;
          turno cerrado: 30 días) y conserva solo los datos del pago. Los casos
          con reclamo suspendido no se tocan.
        </p>

        {stale ? (
          <Alert variant="warning" title="No hay una limpieza reciente">
            {last
              ? `La última corrida fue hace más de un día y medio (${formatDayLabel(lastDate!)} · ${formatTimeLabel(lastDate!)}).`
              : "Todavía no se registró ninguna corrida."}{" "}
            Revisá que la tarea diaria esté programada (ver
            supabase/schedule-purge-payment-receipts.sql).
          </Alert>
        ) : null}

        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
          <dt className="text-ink-soft">Última corrida</dt>
          <dd className="m-0">
            {last && lastDate
              ? `${formatDayLabel(lastDate)} · ${formatTimeLabel(lastDate)} (${last.source === "cron" ? "automática" : "manual"}) — ${last.deleted} eliminado(s), ${last.failed} con error`
              : "—"}
          </dd>
          {last?.error ? (
            <>
              <dt className="text-ink-soft">Aviso</dt>
              <dd className="text-error m-0">{last.error}</dd>
            </>
          ) : null}
          <dt className="text-ink-soft">Vencidos ahora</dt>
          <dd className="m-0">{overview.dueNow}</dd>
          <dt className="text-ink-soft">Sin reintentos</dt>
          <dd className="m-0">{overview.stuckAfterRetries}</dd>
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => purge(false)}
            loading={isPending}
            loadingText="Limpiando…"
          >
            Ejecutar limpieza ahora
          </Button>
          {overview.stuckAfterRetries > 0 ? (
            <Button
              variant="secondary"
              onClick={() => purge(true)}
              disabled={isPending}
            >
              Reintentar los que agotaron intentos
            </Button>
          ) : null}
        </div>
        <p className="text-ink-soft m-0 text-xs">
          Solo usuarios administradores pueden ejecutarla. Corre la misma lógica
          que la tarea diaria y puede repetirse sin riesgo.
        </p>
      </section>

      <section
        aria-labelledby="emails-title"
        className="border-lavender-100 flex flex-col gap-3 rounded-xl border bg-white p-4.5"
      >
        <h2 id="emails-title" className="font-heading m-0 text-base font-bold">
          Emails pendientes
        </h2>
        <p className="text-ink-soft m-0 text-[15px]">
          {overview.failedEmails === 0
            ? "No hay emails con error."
            : `${overview.failedEmails} email(s) no se pudieron enviar. Reintentarlos no duplica los que ya salieron.`}
        </p>
        {overview.failedEmails > 0 ? (
          <Button variant="secondary" onClick={retryEmails} loading={isPending}>
            Reintentar emails fallidos
          </Button>
        ) : null}
      </section>
    </div>
  );
}
