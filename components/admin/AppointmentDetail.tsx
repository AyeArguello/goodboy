"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TextAreaField, TextField } from "@/components/ui/Field";
import {
  COAT_LABELS,
  PAYMENT_METHOD_LABELS,
  SERVICE_PACKAGE_LABELS,
  SIZE_LABELS,
  type PaymentMethod,
} from "@/lib/domain/appointment";
import { businessConfig } from "@/lib/config/business";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import {
  adminWhatsAppTemplates,
  buildWhatsAppLink,
  depositConfirmationMessage,
} from "@/lib/domain/whatsapp";
import type { AppointmentRow, EmailLogRow, EventRow } from "@/lib/data/admin";
import { HistoryPanel } from "./HistoryPanel";
import { ReceiptsPanel } from "./ReceiptsPanel";
import { RetentionPanel } from "./RetentionPanel";
import {
  approveRequest,
  cancelAppointment,
  completeAppointment,
  markNoShow,
  recordDepositPayment,
  rejectRequest,
  revertToConfirmed,
  reverseDepositPayment,
  setInternalNotes,
  type AdminActionResult,
} from "@/app/admin/(app)/actions";

/** Manual entry without a receipt (cash at the shop, etc.). Card/Mercado Pago payments do not exist in this flow. */
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "bank_transfer"];

export function AppointmentDetail({
  appointment,
  events,
  emails,
}: {
  appointment: AppointmentRow;
  events: EventRow[];
  emails: EmailLogRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [adminNotes, setAdminNotes] = useState(appointment.adminNotes ?? "");
  const [notesSaved, setNotesSaved] = useState(true);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "warning" | "error";
    text: string;
  } | null>(null);
  const [depositForm, setDepositForm] = useState({
    amount: String(businessConfig.deposit.amountArs),
    method: "bank_transfer" as PaymentMethod,
    reference: "",
  });

  // Lazy-initialized once per mount rather than read directly during render
  // (React's purity rule flags Date.now()/new Date() as impure to call
  // inline) — fine here since this only drives a display-only heuristic.
  const [now] = useState(() => new Date());

  const startsAt = new Date(appointment.startsAt);
  const when = `${formatDayLabel(startsAt)} · ${formatTimeLabel(startsAt)}`;
  const depositDueAt = appointment.depositDueAt
    ? new Date(appointment.depositDueAt)
    : null;
  const depositOverdue = depositDueAt ? depositDueAt < now : false;
  const hoursUntilSlot = (startsAt.getTime() - now.getTime()) / 3_600_000;
  // Only a *client*-initiated cancellation can ever forfeit the deposit —
  // admin_cancel_appointment never forfeits a business-initiated one, no
  // matter how close to the slot (see docs/auditoria-seguridad-y-cumplimiento-good-boy.md).
  const wouldForfeitIfClient =
    appointment.status === "confirmed" &&
    hoursUntilSlot < businessConfig.rules.cancellationCutoffHours;

  function run(action: () => Promise<AdminActionResult>, okText?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setFeedback({ kind: "error", text: result.error });
      } else if (result.emailStatus === "failed") {
        setFeedback({
          kind: "warning",
          text: `${okText ?? "Listo."} El email al cliente falló y quedó en cola para reintentar (ver Historial).`,
        });
      } else if (okText) {
        setFeedback({
          kind: "ok",
          text:
            okText +
            (result.emailStatus === "sent"
              ? " Le avisamos al cliente por email."
              : ""),
        });
      }
      router.refresh();
    });
  }

  function saveNotes() {
    startTransition(async () => {
      await setInternalNotes(appointment.id, adminNotes);
      setNotesSaved(true);
    });
  }

  function submitDeposit() {
    run(
      () =>
        recordDepositPayment(
          appointment.id,
          Number(depositForm.amount),
          depositForm.method,
          depositForm.reference || undefined,
        ),
      "Seña registrada: el turno quedó confirmado.",
    );
  }

  const hasPendingReceipt = appointment.receipts.some(
    (r) => r.status === "pending_verification",
  );
  const confirmationLink =
    appointment.status === "confirmed"
      ? buildWhatsAppLink(
          appointment.phoneE164,
          depositConfirmationMessage({
            ownerName: appointment.ownerName,
            dogName: appointment.dogName,
            when,
            pickup: appointment.logisticsMode === "pickup",
            neighborhood: appointment.neighborhood,
            depositAmountArs:
              appointment.latestPayment?.amountArs ??
              businessConfig.deposit.amountArs,
            priceRange: businessConfig.prices[appointment.sizeBucket].range,
            cancellationPolicy: businessConfig.cancellationPolicyText,
          }),
        )
      : null;

  const waMessages = [
    {
      label: "Aprobar e indicar seña",
      text: adminWhatsAppTemplates.approveWithDepositInstructions({
        ownerName: appointment.ownerName,
        dogName: appointment.dogName,
        when,
        amountArs: businessConfig.deposit.amountArs,
        dueHours: businessConfig.deposit.dueHours,
      }),
    },
    {
      label: "Pedir foto reciente",
      text: adminWhatsAppTemplates.askForPhoto({
        ownerName: appointment.ownerName,
        dogName: appointment.dogName,
      }),
    },
    {
      label: "Proponer otro horario",
      text: adminWhatsAppTemplates.proposeNewTime({
        ownerName: appointment.ownerName,
      }),
    },
    {
      label: "Confirmar costo de traslado",
      text: adminWhatsAppTemplates.confirmTransportCost({
        neighborhood: appointment.neighborhood ?? "",
      }),
    },
    {
      label: "Avisar seña perdida",
      text: adminWhatsAppTemplates.depositForfeited({
        ownerName: appointment.ownerName,
        dogName: appointment.dogName,
      }),
    },
  ];

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1.3fr_1fr] lg:items-start lg:gap-4">
      <div className="flex flex-col gap-4">
        <section className="border-charcoal flex flex-col gap-3 rounded-xl border-[1.5px] bg-white p-4.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading m-0 text-2xl font-bold">
              {appointment.dogName}
            </h1>
            <StatusBadge status={appointment.status} />
          </div>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
            <dt className="text-ink-soft">Turno</dt>
            <dd className="m-0 font-bold">{when}</dd>
            <dt className="text-ink-soft">Tamaño</dt>
            <dd className="m-0">
              {SIZE_LABELS[appointment.sizeBucket]} · ARS{" "}
              {businessConfig.prices[appointment.sizeBucket].range} orientativo
            </dd>
            <dt className="text-ink-soft">Raza</dt>
            <dd className="m-0">{appointment.breed || "—"}</dd>
            <dt className="text-ink-soft">Manto</dt>
            <dd className="m-0">
              {appointment.coatState ? COAT_LABELS[appointment.coatState] : "—"}
            </dd>
            <dt className="text-ink-soft">Servicio</dt>
            <dd className="m-0">
              {SERVICE_PACKAGE_LABELS[appointment.servicePackage]}
            </dd>
            <dt className="text-ink-soft">Llegada</dt>
            <dd className="m-0">
              {appointment.logisticsMode === "pickup"
                ? `Traslado desde ${appointment.neighborhood} · costo a confirmar`
                : "Lo trae"}
            </dd>
            <dt className="text-ink-soft">Código</dt>
            <dd className="m-0">{appointment.code}</dd>
            {appointment.status === "awaiting_deposit" && depositDueAt ? (
              <>
                <dt className="text-ink-soft">Seña vence</dt>
                <dd
                  className={`m-0 ${depositOverdue ? "text-error font-bold" : ""}`}
                >
                  {formatDayLabel(depositDueAt)} ·{" "}
                  {formatTimeLabel(depositDueAt)}
                  {depositOverdue ? " (vencida)" : ""}
                </dd>
              </>
            ) : null}
            {appointment.latestPayment ? (
              <>
                <dt className="text-ink-soft">Seña</dt>
                <dd className="m-0">
                  ARS{" "}
                  {appointment.latestPayment.amountArs.toLocaleString("es-AR")}{" "}
                  · {PAYMENT_METHOD_LABELS[appointment.latestPayment.method]} ·{" "}
                  {appointment.latestPayment.status === "verified"
                    ? "verificada"
                    : "revertida"}
                </dd>
              </>
            ) : null}
          </dl>
          <p className="bg-lavender-100 m-0 rounded-md px-3.5 py-3 text-[15px]">
            <strong>Notas del cliente:</strong> {appointment.notes || "—"}
          </p>
        </section>

        <section className="border-lavender-100 flex flex-col gap-1.5 rounded-xl border bg-white p-4.5">
          <h3 className="font-heading m-0 text-base font-bold">Responsable</h3>
          <span className="text-base">
            {appointment.ownerName} · +54{" "}
            {appointment.phoneE164.replace(/^\+549/, "")}
          </span>
        </section>

        <section className="border-lavender-100 flex flex-col gap-2 rounded-xl border bg-white p-4.5">
          <h3 className="font-heading m-0 text-base font-bold">
            Notas internas{" "}
            <span className="text-ink-soft font-sans text-sm font-normal">
              (no las ve el cliente)
            </span>
          </h3>
          <TextAreaField
            label=""
            value={adminNotes}
            onChange={(e) => {
              setAdminNotes(e.target.value);
              setNotesSaved(false);
            }}
            rows={3}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={saveNotes}
            disabled={notesSaved}
            loading={isPending}
          >
            Guardar notas internas
          </Button>
        </section>

        {appointment.receipts.length > 0 ||
        appointment.status === "awaiting_deposit" ? (
          <ReceiptsPanel
            appointment={appointment}
            expectedAmountArs={businessConfig.deposit.amountArs}
          />
        ) : null}
        <RetentionPanel appointment={appointment} />
        <HistoryPanel events={events} emails={emails} />
      </div>

      <div className="flex flex-col gap-4">
        <section className="border-lavender-100 flex flex-col gap-2.5 rounded-xl border bg-white p-4.5">
          <h3 className="font-heading m-0 text-base font-bold">Acciones</h3>

          <div aria-live="polite">
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

          {appointment.status === "pending_review" ? (
            <>
              <Button
                onClick={() =>
                  run(
                    () => approveRequest(appointment.id),
                    "Solicitud aprobada: le mandamos los datos para la seña.",
                  )
                }
                loading={isPending}
              >
                Aprobar y pedir seña
              </Button>
              {!confirmingReject ? (
                <Button
                  variant="secondary"
                  onClick={() => setConfirmingReject(true)}
                >
                  Rechazar solicitud
                </Button>
              ) : (
                <div className="border-error bg-error-bg flex flex-col gap-2 rounded-lg border-[1.5px] p-3">
                  <p className="text-error m-0 text-sm font-bold">
                    ¿Seguro que querés rechazar esta solicitud?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-error! hover:bg-error!"
                      onClick={() => {
                        setConfirmingReject(false);
                        run(
                          () => rejectRequest(appointment.id),
                          "Solicitud rechazada.",
                        );
                      }}
                      loading={isPending}
                    >
                      Sí, rechazar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmingReject(false)}
                    >
                      No
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}

          {appointment.status === "awaiting_deposit" ? (
            hasPendingReceipt ? (
              <p className="text-ink-soft m-0 text-sm">
                Hay un comprobante pendiente: confirmalo o rechazalo desde
                &quot;Comprobantes&quot;.
              </p>
            ) : (
              <details className="border-warning-line bg-warning-bg rounded-lg border-[1.5px] p-3.5">
                <summary className="font-heading min-h-11 cursor-pointer text-sm font-bold">
                  Registrar seña sin comprobante (efectivo u otro medio)
                </summary>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  <TextField
                    label="Monto (ARS)"
                    type="number"
                    value={depositForm.amount}
                    onChange={(e) =>
                      setDepositForm((f) => ({ ...f, amount: e.target.value }))
                    }
                  />
                  <label className="flex flex-col gap-1.5">
                    <span className="font-heading text-[15px] font-semibold">
                      Medio de pago
                    </span>
                    <select
                      value={depositForm.method}
                      onChange={(e) =>
                        setDepositForm((f) => ({
                          ...f,
                          method: e.target.value as PaymentMethod,
                        }))
                      }
                      className="border-ink-soft h-13 rounded-md border-[1.5px] bg-white px-3.5 text-[17px]"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextField
                    label="Referencia"
                    optional
                    value={depositForm.reference}
                    onChange={(e) =>
                      setDepositForm((f) => ({
                        ...f,
                        reference: e.target.value,
                      }))
                    }
                  />
                  <Button
                    onClick={submitDeposit}
                    loading={isPending}
                    disabled={depositOverdue}
                  >
                    Confirmar seña recibida
                  </Button>
                  {depositOverdue ? (
                    <p className="text-error m-0 text-sm font-bold">
                      El plazo venció. Aprobá la solicitud de nuevo para abrir
                      un plazo nuevo.
                    </p>
                  ) : null}
                </div>
              </details>
            )
          ) : null}

          {confirmationLink ? (
            <div className="flex flex-col gap-1">
              <a
                href={confirmationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-purple font-heading flex min-h-13 items-center justify-center rounded-full px-6 text-[15px] font-semibold text-white no-underline"
              >
                Abrir WhatsApp con confirmación
              </a>
              <span className="text-ink-soft text-xs">
                Se abre WhatsApp con el mensaje ya escrito; lo enviás vos. La
                app no puede saber si lo enviaste.
              </span>
            </div>
          ) : null}

          {appointment.status === "expired" ||
          appointment.status === "cancelled_by_business" ? (
            <Button
              onClick={() =>
                run(
                  () => approveRequest(appointment.id),
                  "Solicitud aprobada: le mandamos los datos para la seña.",
                )
              }
              loading={isPending}
            >
              Reactivar y pedir seña de nuevo
            </Button>
          ) : null}

          {appointment.status === "confirmed" ? (
            <>
              <Button
                onClick={() => run(() => completeAppointment(appointment.id))}
                loading={isPending}
              >
                Marcar completado
              </Button>
              <Button
                variant="secondary"
                onClick={() => run(() => markNoShow(appointment.id))}
                loading={isPending}
              >
                Marcar ausente
              </Button>
              <Button
                variant="secondary"
                onClick={() => run(() => reverseDepositPayment(appointment.id))}
                loading={isPending}
              >
                Revertir seña (por error)
              </Button>
            </>
          ) : null}

          {["completed", "no_show"].includes(appointment.status) ? (
            <Button
              variant="secondary"
              onClick={() => run(() => revertToConfirmed(appointment.id))}
              loading={isPending}
            >
              Deshacer
            </Button>
          ) : null}

          {["awaiting_deposit", "confirmed"].includes(appointment.status) ? (
            <Link
              href={`/admin/horarios?reschedule=${appointment.id}`}
              className="border-charcoal font-heading text-charcoal flex min-h-13 items-center justify-center rounded-full border-[1.5px] text-[15px] font-semibold no-underline"
            >
              Reprogramar
            </Link>
          ) : null}

          {["pending_review", "awaiting_deposit", "confirmed"].includes(
            appointment.status,
          ) ? (
            !confirmingCancel ? (
              <Button
                variant="secondary"
                className="border-error! text-error!"
                onClick={() => setConfirmingCancel(true)}
              >
                Cancelar solicitud
              </Button>
            ) : (
              <div className="border-error bg-error-bg flex flex-col gap-2 rounded-lg border-[1.5px] p-3">
                <p className="text-error m-0 text-sm font-bold">
                  ¿Seguro que querés cancelar este turno?
                </p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      className="bg-error! hover:bg-error!"
                      onClick={() => {
                        setConfirmingCancel(false);
                        run(
                          () => cancelAppointment(appointment.id, "client"),
                          "Turno cancelado.",
                        );
                      }}
                      loading={isPending}
                    >
                      Canceló el cliente
                    </Button>
                    {wouldForfeitIfClient ? (
                      <span className="text-error text-xs font-bold">
                        Al estar a menos de 48 h, la seña queda perdida.
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      className="bg-error! hover:bg-error!"
                      onClick={() => {
                        setConfirmingCancel(false);
                        run(
                          () => cancelAppointment(appointment.id, "business"),
                          "Turno cancelado.",
                        );
                      }}
                      loading={isPending}
                    >
                      Cancela Good Boy
                    </Button>
                    <span className="text-ink-soft text-xs">
                      La seña nunca se pierde si cancela Good Boy.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfirmingCancel(false)}
                  >
                    No
                  </Button>
                </div>
              </div>
            )
          ) : null}
        </section>

        <section className="border-lavender-100 flex flex-col gap-2 rounded-xl border bg-white p-4.5">
          <h3 className="font-heading m-0 text-base font-bold">
            Mensajes de WhatsApp listos
          </h3>
          <p className="text-ink-soft m-0 text-sm">
            Abren WhatsApp con el texto escrito. Lo revisás y enviás vos.
          </p>
          {waMessages.map((m) => (
            <a
              key={m.label}
              href={buildWhatsAppLink(appointment.phoneE164, m.text)}
              target="_blank"
              rel="noopener noreferrer"
              title={m.text}
              className="border-lavender text-charcoal flex min-h-12 items-center gap-2.5 rounded-lg border-[1.5px] px-3.5 no-underline"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#684E7A"
                strokeWidth="1.7"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
              </svg>
              <span className="flex-1">
                <strong className="font-heading text-sm">{m.label}</strong>
                <br />
                <span className="text-ink-soft text-sm">{m.text}</span>
              </span>
            </a>
          ))}
        </section>
      </div>
    </div>
  );
}
