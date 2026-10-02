"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { receiptDisplay, type ReceiptTone } from "@/lib/domain/appointment";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import type { AppointmentRow, ReceiptRow } from "@/lib/data/admin";
import {
  confirmDepositFromReceipt,
  getReceiptViewUrl,
  rejectReceipts,
  resendUploadInstructions,
  type AdminActionResult,
} from "@/app/admin/(app)/actions";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${formatDayLabel(d)} · ${formatTimeLabel(d)}`;
};

const TONE_STYLES: Record<ReceiptTone, string> = {
  pending: "bg-warning-bg text-warning border-warning-line",
  overdue: "bg-error-bg text-error border-error",
  verified: "bg-success-bg text-success border-success-line",
  rejected: "bg-error-bg text-error border-error",
  deleted: "bg-lavender-100/60 text-ink-soft border-ink-soft",
};

function retentionText(r: ReceiptRow, hold: boolean): string {
  if (r.status === "deleted") {
    return r.deletedAt
      ? `Archivo eliminado el ${fmt(r.deletedAt)}.`
      : "Archivo eliminado.";
  }
  if (hold) return "Eliminación suspendida (reclamo o devolución pendiente).";
  if (r.retentionUntil) return `Se elimina el ${fmt(r.retentionUntil)}.`;
  return "Se elimina automáticamente 30 días después del cierre del turno (7 días si el plazo vence).";
}

function notice(
  result: AdminActionResult,
  okText: string,
): {
  kind: "ok" | "warning" | "error";
  text: string;
} {
  if (!result.ok) return { kind: "error", text: result.error };
  if (result.emailStatus === "failed") {
    return {
      kind: "warning",
      text: `${okText} El email al cliente falló y quedó en cola: reintentalo desde "Historial".`,
    };
  }
  return { kind: "ok", text: okText };
}

export function ReceiptsPanel({
  appointment,
  expectedAmountArs,
}: {
  appointment: AppointmentRow;
  expectedAmountArs: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const pending = appointment.receipts.filter(
    (r) => r.status === "pending_verification",
  );
  const [reference, setReference] = useState(
    pending.find((r) => r.reference)?.reference ?? "",
  );
  const [feedback, setFeedback] = useState<ReturnType<typeof notice> | null>(
    null,
  );
  const [now] = useState(() => new Date());

  const awaiting = appointment.status === "awaiting_deposit";
  const overdue =
    awaiting &&
    appointment.depositDueAt !== null &&
    new Date(appointment.depositDueAt) < now;
  const reasonOk = reason.trim().length >= 3;

  function view(id: string) {
    setPreviewError(null);
    startTransition(async () => {
      const result = await getReceiptViewUrl(id);
      if (result.ok) setPreview({ id, url: result.url });
      else setPreviewError(result.error);
    });
  }

  function confirm() {
    startTransition(async () => {
      const result = await confirmDepositFromReceipt(appointment.id, reference);
      setFeedback(
        notice(result, "Seña confirmada: el turno quedó confirmado."),
      );
      router.refresh();
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectReceipts(appointment.id, reason);
      setFeedback(
        notice(
          result,
          overdue
            ? "Comprobante rechazado. Como el plazo ya venció, el cliente no puede subir otro: reactivá la solicitud desde la ficha para emitir un enlace nuevo."
            : "Comprobante rechazado: le avisamos al cliente para que suba otro.",
        ),
      );
      if (result.ok) {
        setRejecting(false);
        setReason("");
      }
      router.refresh();
    });
  }

  function resend() {
    startTransition(async () => {
      const result = await resendUploadInstructions(appointment.id);
      setFeedback(
        notice(result, "Reenviamos el email con los datos y un enlace nuevo."),
      );
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="receipts-title"
      className="border-lavender-100 flex flex-col gap-3 rounded-xl border bg-white p-4.5"
    >
      <h3 id="receipts-title" className="font-heading m-0 text-base font-bold">
        Comprobantes{" "}
        <span className="text-ink-soft font-sans text-sm font-normal">
          ({appointment.receipts.length})
        </span>
      </h3>

      <div aria-live="polite" className="flex flex-col gap-2">
        {feedback ? (
          <Alert
            variant={
              feedback.kind === "error"
                ? "error"
                : feedback.kind === "warning"
                  ? "warning"
                  : "info"
            }
          >
            {feedback.text}
          </Alert>
        ) : null}
      </div>

      {appointment.receipts.length === 0 ? (
        <p className="text-ink-soft m-0 text-[15px]">
          {awaiting
            ? "El cliente todavía no subió el comprobante."
            : "Este turno no tiene comprobantes."}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {appointment.receipts.map((r) => (
            <li
              key={r.id}
              className="border-lavender flex flex-col gap-1.5 rounded-lg border-[1.5px] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`font-heading inline-flex rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-bold ${TONE_STYLES[receiptDisplay(r.status, appointment.depositDueAt, now).tone]}`}
                >
                  {
                    receiptDisplay(r.status, appointment.depositDueAt, now)
                      .label
                  }
                </span>
                {r.status !== "deleted" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => view(r.id)}
                    loading={isPending && preview?.id !== r.id}
                  >
                    Ver comprobante
                  </Button>
                ) : null}
              </div>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[15px]">
                <dt className="text-ink-soft">Subido</dt>
                <dd className="m-0">{fmt(r.uploadedAt)}</dd>
                {r.reference ? (
                  <>
                    <dt className="text-ink-soft">Referencia informada</dt>
                    <dd className="m-0 break-words">{r.reference}</dd>
                  </>
                ) : null}
                {r.sizeBytes ? (
                  <>
                    <dt className="text-ink-soft">Archivo</dt>
                    <dd className="m-0">
                      {r.mimeType?.replace("image/", "").toUpperCase()} ·{" "}
                      {(r.sizeBytes / 1024).toFixed(0)} KB
                    </dd>
                  </>
                ) : null}
                {r.verifiedAt ? (
                  <>
                    <dt className="text-ink-soft">Verificado</dt>
                    <dd className="m-0">{fmt(r.verifiedAt)}</dd>
                  </>
                ) : null}
                {r.rejectionReason ? (
                  <>
                    <dt className="text-ink-soft">Motivo del rechazo</dt>
                    <dd className="m-0 break-words">{r.rejectionReason}</dd>
                  </>
                ) : null}
              </dl>
              <p className="text-ink-soft m-0 text-sm">
                {retentionText(r, appointment.retentionHold)}
              </p>
              {r.deletionAttempts > 0 && r.status !== "deleted" ? (
                <p role="alert" className="text-error m-0 text-sm font-bold">
                  La eliminación falló {r.deletionAttempts}{" "}
                  {r.deletionAttempts === 1 ? "vez" : "veces"}
                  {r.lastDeletionError ? `: ${r.lastDeletionError}` : ""}.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {previewError ? <Alert variant="error">{previewError}</Alert> : null}
      {preview ? (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable */}
          <img
            src={preview.url}
            alt="Comprobante de transferencia subido por el cliente"
            className="border-lavender max-h-[28rem] w-full rounded-lg border-[1.5px] bg-white object-contain"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-soft text-sm">
              Enlace de un solo uso que vence en 60 segundos.
            </span>
            <Button size="sm" variant="text" onClick={() => setPreview(null)}>
              Cerrar vista previa
            </Button>
          </div>
        </div>
      ) : null}

      {awaiting && pending.length > 0 ? (
        <div className="border-warning-line bg-warning-bg flex flex-col gap-3 rounded-lg border-[1.5px] p-3.5">
          <strong className="font-heading text-sm">
            Verificá la transferencia
          </strong>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[15px]">
            <dt className="text-ink-soft">Importe esperado</dt>
            <dd className="m-0 font-bold">
              ARS {expectedAmountArs.toLocaleString("es-AR")}
            </dd>
            <dt className="text-ink-soft">Referencia informada</dt>
            <dd className="m-0">
              {pending.find((r) => r.reference)?.reference ?? "—"}
            </dd>
          </dl>
          {overdue ? (
            <p className="text-ink-soft m-0 text-sm">
              Verificación vencida: el comprobante se subió dentro del plazo y
              el horario sigue reservado hasta que lo resuelvas. Revisalo con
              prioridad; nunca se confirma solo.
            </p>
          ) : null}
          <TextField
            label="Referencia que se guarda con el pago"
            optional
            maxLength={60}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={confirm}
              loading={isPending}
              loadingText="Confirmando…"
            >
              Confirmar seña
            </Button>
            {!rejecting ? (
              <Button
                variant="secondary"
                onClick={() => setRejecting(true)}
                disabled={isPending}
              >
                Rechazar comprobante
              </Button>
            ) : null}
          </div>
          <p className="text-ink-soft m-0 text-sm">
            Confirmar registra un único pago verificado por tu usuario y envía
            el email de confirmación al cliente.
          </p>

          {rejecting ? (
            <div className="border-error bg-error-bg flex flex-col gap-2 rounded-lg border-[1.5px] p-3">
              <TextAreaField
                label="Motivo del rechazo (obligatorio)"
                rows={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                hint="El cliente lo recibe por email junto con un enlace para subir otro comprobante."
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-error! hover:bg-error!"
                  onClick={reject}
                  disabled={!reasonOk}
                  loading={isPending}
                >
                  Rechazar y avisar al cliente
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRejecting(false);
                    setReason("");
                  }}
                  disabled={isPending}
                >
                  No rechazar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {awaiting ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={resend}
          loading={isPending}
        >
          Reenviar email con instrucciones y enlace nuevo
        </Button>
      ) : null}
    </section>
  );
}
