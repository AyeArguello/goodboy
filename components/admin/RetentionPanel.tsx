"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import type { AppointmentRow } from "@/lib/data/admin";
import {
  recordRefund,
  resolveDispute,
  setRetentionHold,
  type AdminActionResult,
} from "@/app/admin/(app)/actions";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${formatDayLabel(d)} · ${formatTimeLabel(d)}`;
};

export function RetentionPanel({
  appointment,
}: {
  appointment: AppointmentRow;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const payment = appointment.latestPayment;
  const canRefund =
    payment?.status === "verified" && payment.refundedAt === null;
  const [amount, setAmount] = useState(String(payment?.amountArs ?? ""));
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const hasFiles = appointment.receipts.some((r) => r.status !== "deleted");
  if (!hasFiles && !payment && !appointment.retentionHold) return null;

  function run(action: () => Promise<AdminActionResult>, okText: string) {
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? {
              kind: "ok",
              text:
                result.emailStatus === "failed"
                  ? `${okText} El email al cliente falló y quedó en cola para reintentar.`
                  : okText,
            }
          : { kind: "error", text: result.error },
      );
      if (result.ok) setReason("");
      router.refresh();
    });
  }

  const reasonOk = reason.trim().length >= 3;

  return (
    <section
      aria-labelledby="retention-title"
      className="border-lavender-100 flex flex-col gap-3 rounded-xl border bg-white p-4.5"
    >
      <h3 id="retention-title" className="font-heading m-0 text-base font-bold">
        Reclamos y devoluciones
      </h3>

      <div aria-live="polite">
        {message ? (
          <Alert variant={message.kind === "error" ? "error" : "info"}>
            {message.text}
          </Alert>
        ) : null}
      </div>

      {hasFiles ? (
        appointment.retentionHold ? (
          <div className="border-warning-line bg-warning-bg flex flex-col gap-2 rounded-lg border-[1.5px] p-3">
            <strong className="font-heading text-sm">
              Eliminación de comprobantes suspendida
            </strong>
            <span className="text-[15px]">
              Motivo: {appointment.retentionHoldReason ?? "—"}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  run(
                    () => resolveDispute(appointment.id),
                    "Reclamo resuelto: los comprobantes se conservan 180 días más.",
                  )
                }
                loading={isPending}
              >
                Reclamo resuelto (conservar 180 días)
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  run(
                    () => setRetentionHold(appointment.id, false),
                    "Eliminación reanudada.",
                  )
                }
                disabled={isPending}
              >
                Reanudar eliminación
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-ink-soft m-0 text-sm">
              Si hay un reclamo o una devolución pendiente, suspendé la
              eliminación automática de los comprobantes.
            </p>
            <TextAreaField
              label="Motivo de la suspensión"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!reasonOk}
              loading={isPending}
              onClick={() =>
                run(
                  () => setRetentionHold(appointment.id, true, reason),
                  "Eliminación suspendida.",
                )
              }
            >
              Suspender eliminación
            </Button>
            {appointment.disputeResolvedAt ? (
              <p className="text-ink-soft m-0 text-sm">
                Último reclamo resuelto el {fmt(appointment.disputeResolvedAt)}:
                los comprobantes se conservan 180 días desde esa fecha.
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {payment?.status === "verified" ? (
        <div className="border-lavender flex flex-col gap-2 rounded-lg border-[1.5px] p-3">
          <strong className="font-heading text-sm">
            Devolución de la seña
          </strong>
          {payment.refundedAt ? (
            <p className="m-0 text-[15px]">
              Devolución registrada: ARS{" "}
              {(payment.refundAmountArs ?? 0).toLocaleString("es-AR")} el{" "}
              {fmt(payment.refundedAt)}
              {payment.refundReference
                ? ` · Ref. ${payment.refundReference}`
                : ""}
              .
            </p>
          ) : canRefund ? (
            <>
              <p className="text-ink-soft m-0 text-sm">
                Registrá la devolución una vez que hayas hecho la transferencia.
                El cliente recibe un email.
              </p>
              <TextField
                label="Monto devuelto (ARS)"
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <TextField
                label="Referencia de la devolución"
                optional
                maxLength={60}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                loading={isPending}
                disabled={!(Number(amount) > 0)}
                onClick={() =>
                  run(
                    () =>
                      recordRefund(appointment.id, Number(amount), reference),
                    "Devolución registrada.",
                  )
                }
              >
                Registrar devolución
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
