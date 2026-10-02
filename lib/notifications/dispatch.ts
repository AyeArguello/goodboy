import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businessConfig, siteUrl as getSiteUrl } from "@/lib/config/business";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";
import { getServerEnv } from "@/lib/env/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { generateUploadToken, hashUploadToken } from "@/lib/receipts/token";
import {
  renderAppointmentCancelled,
  renderAppointmentConfirmed,
  renderAppointmentRescheduled,
  renderOwnerNewRequest,
  renderOwnerReceiptReceived,
  renderReceiptReceived,
  renderReceiptRejected,
  renderRefundRecorded,
  renderRequestApproved,
  renderRequestReceived,
  type BaseEmailData,
  type BusinessFooter,
  type CancellationKind,
  type RenderedEmail,
  type TransferDetails,
} from "./emailTemplates";
import { getMailer, getOwnerEmail, type Mailer } from "./mailer";
import { sendOnce, type OutboxKind, type SendOutcome } from "./outbox";

/**
 * Turns a committed state change into emails. Every function here is
 * best-effort by construction: it returns an outcome and never throws, so an
 * email problem can never roll back or block a transition (the transition
 * has already happened). Each logical email has a deterministic idempotency
 * key, so retrying never duplicates one that already went out.
 */

export type DispatchClient = Pick<SupabaseClient, "rpc" | "from">;

export interface DispatchDeps {
  /** Service-role client: reads whatever the email needs, writes the outbox. */
  client: DispatchClient;
  mailer: Mailer;
  ownerEmail: string | null;
  transfer: TransferDetails;
  siteUrl: string;
}

export type Outcome = SendOutcome | "obsolete" | "no_recipient";

export interface NotifyResult {
  customer: Outcome;
  owner?: Outcome;
}

/** Issues a fresh upload link for an appointment (runs with the ADMIN's session). */
export type IssueUploadToken = (
  appointmentId: string,
  tokenHash: string,
) => Promise<{ ok: true } | { ok: false; error: string }>;

export interface NotifyOpts {
  /** Retry mode: only act if the email's current key equals this one. */
  onlyKey?: string;
  /** Deliberate "send again" from the admin: gets its own key. */
  resend?: boolean;
}

interface AppointmentCtx {
  id: string;
  code: string;
  dogName: string;
  ownerName: string;
  email: string | null;
  status: string;
  depositDueAt: Date | null;
  closedAt: Date | null;
  pickup: boolean;
  startsAt: Date;
}

const whenLabel = (d: Date) => `${formatDayLabel(d)} · ${formatTimeLabel(d)}`;
const epoch = (d: Date) => Math.floor(d.getTime() / 1000);

type Row = Record<string, unknown>;

async function one(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row | null> {
  const { data } = await query;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Row | null | undefined) ?? null;
}

async function loadAppointment(
  client: DispatchClient,
  id: string,
): Promise<AppointmentCtx | null> {
  const row = await one(
    client
      .from("appointments")
      .select(
        "id, code, dog_name, owner_name, email, status, deposit_due_at, closed_at, logistics_mode, availability_slots(starts_at)",
      )
      .eq("id", id)
      .maybeSingle(),
  );
  if (!row) return null;
  const slot = row.availability_slots as { starts_at: string } | null;
  if (!slot) return null;
  return {
    id: row.id as string,
    code: row.code as string,
    dogName: row.dog_name as string,
    ownerName: row.owner_name as string,
    email: (row.email as string | null) || null,
    status: row.status as string,
    depositDueAt: row.deposit_due_at
      ? new Date(row.deposit_due_at as string)
      : null,
    closedAt: row.closed_at ? new Date(row.closed_at as string) : null,
    pickup: row.logistics_mode === "pickup",
    startsAt: new Date(slot.starts_at),
  };
}

async function loadDepositAmount(client: DispatchClient): Promise<number> {
  const row = await one(
    client
      .from("business_settings")
      .select("deposit_amount_ars")
      .eq("id", true)
      .maybeSingle(),
  );
  return Number(row?.deposit_amount_ars ?? businessConfig.deposit.amountArs);
}

export function createNotifier(deps: DispatchDeps) {
  const { client, mailer } = deps;
  const footer: BusinessFooter = {
    businessName: businessConfig.name,
    address: `${businessConfig.address.street}, ${businessConfig.address.city}`,
    whatsappUrl: businessWhatsAppLink(),
  };
  const base = (a: AppointmentCtx): BaseEmailData => ({
    ownerName: a.ownerName,
    dogName: a.dogName,
    code: a.code,
    whenLabel: whenLabel(a.startsAt),
  });
  const panelUrl = (a: AppointmentCtx) =>
    `${deps.siteUrl}/admin/solicitudes/${a.id}`;
  const uploadUrl = (token: string) =>
    `${deps.siteUrl}/turnos/comprobante#t=${token}`;

  async function toCustomer(
    a: AppointmentCtx,
    kind: OutboxKind,
    key: string,
    opts: NotifyOpts | undefined,
    render: () => RenderedEmail | Promise<RenderedEmail>,
  ): Promise<Outcome> {
    if (!a.email) return "no_recipient";
    if (opts?.onlyKey && opts.onlyKey !== key) return "obsolete";
    return sendOnce(
      { client, mailer },
      { key, kind, appointmentId: a.id, to: a.email, render },
    );
  }

  async function toOwner(
    a: AppointmentCtx,
    kind: OutboxKind,
    key: string,
    opts: NotifyOpts | undefined,
    render: () => RenderedEmail,
  ): Promise<Outcome> {
    if (!deps.ownerEmail) return "no_recipient";
    if (opts?.onlyKey && opts.onlyKey !== key) return "obsolete";
    return sendOnce(
      { client, mailer },
      { key, kind, appointmentId: a.id, to: deps.ownerEmail, render },
    );
  }

  const OBSOLETE: NotifyResult = { customer: "obsolete" };

  async function safe(fn: () => Promise<NotifyResult>): Promise<NotifyResult> {
    try {
      return await fn();
    } catch (err) {
      console.error("notification dispatch failed:", err);
      return { customer: "failed" };
    }
  }

  const methods = {
    /** Customer "solicitud recibida" + owner "nueva solicitud". */
    requestReceived: (appointmentId: string, opts?: NotifyOpts) =>
      safe(async () => {
        const a = await loadAppointment(client, appointmentId);
        if (!a) return OBSOLETE;
        const customer = await toCustomer(
          a,
          "request_received",
          `request_received:${a.id}`,
          opts,
          () =>
            renderRequestReceived(
              { ...base(a), statusUrl: `${deps.siteUrl}/turnos/estado` },
              footer,
            ),
        );
        const owner = await toOwner(
          a,
          "owner_new_request",
          `owner_new_request:${a.id}`,
          opts,
          () => renderOwnerNewRequest({ ...base(a), panelUrl: panelUrl(a) }),
        );
        return { customer, owner };
      }),

    /** Payment instructions + secure upload link (the link is issued only after the send is claimed). */
    requestApproved: (
      appointmentId: string,
      issueToken: IssueUploadToken,
      opts?: NotifyOpts,
    ) =>
      safe(async () => {
        const a = await loadAppointment(client, appointmentId);
        if (!a || a.status !== "awaiting_deposit" || !a.depositDueAt)
          return OBSOLETE;
        const due = a.depositDueAt;
        const key = `request_approved:${a.id}:${epoch(due)}${opts?.resend ? `:resend:${Date.now()}` : ""}`;
        const amount = await loadDepositAmount(client);
        const customer = await toCustomer(
          a,
          "request_approved",
          key,
          opts,
          async () => {
            const token = generateUploadToken();
            const issued = await issueToken(a.id, hashUploadToken(token));
            if (!issued.ok)
              throw new Error(
                `No se pudo crear el enlace de carga: ${issued.error}`,
              );
            return renderRequestApproved(
              {
                ...base(a),
                amountArs: amount,
                dueLabel: whenLabel(due),
                transfer: deps.transfer,
                cancellationPolicy: businessConfig.cancellationPolicyText,
                uploadUrl: uploadUrl(token),
              },
              footer,
            );
          },
        );
        return { customer };
      }),

    /** Customer "comprobante recibido" + owner "comprobante para verificar". */
    receiptReceived: (appointmentId: string, opts?: NotifyOpts) =>
      safe(async () => {
        const a = await loadAppointment(client, appointmentId);
        if (!a) return OBSOLETE;
        const latest = await one(
          client
            .from("payment_receipts")
            .select("id")
            .eq("appointment_id", a.id)
            .neq("status", "deleted")
            .order("uploaded_at", { ascending: false })
            .limit(1),
        );
        if (!latest) return OBSOLETE;
        const rid = latest.id as string;
        const customer = await toCustomer(
          a,
          "receipt_received",
          `receipt_received:${rid}`,
          opts,
          () => renderReceiptReceived(base(a), footer),
        );
        const owner = await toOwner(
          a,
          "owner_receipt_received",
          `owner_receipt_received:${rid}`,
          opts,
          () =>
            renderOwnerReceiptReceived({ ...base(a), panelUrl: panelUrl(a) }),
        );
        return { customer, owner };
      }),

    /** Customer "comprobante rechazado" with a fresh link while the window is open. */
    receiptRejected: (
      appointmentId: string,
      issueToken: IssueUploadToken,
      opts?: NotifyOpts,
    ) =>
      safe(async () => {
        const a = await loadAppointment(client, appointmentId);
        if (!a) return OBSOLETE;
        const rejected = await one(
          client
            .from("payment_receipts")
            .select("id, rejection_reason")
            .eq("appointment_id", a.id)
            .eq("status", "rejected")
            .order("rejected_at", { ascending: false })
            .limit(1),
        );
        if (!rejected) return OBSOLETE;
        const customer = await toCustomer(
          a,
          "receipt_rejected",
          `receipt_rejected:${rejected.id as string}`,
          opts,
          async () => {
            const open =
              a.status === "awaiting_deposit" &&
              a.depositDueAt !== null &&
              a.depositDueAt.getTime() > Date.now();
            let link: string | null = null;
            if (open) {
              const token = generateUploadToken();
              const issued = await issueToken(a.id, hashUploadToken(token));
              if (!issued.ok)
                throw new Error(
                  `No se pudo crear el enlace de carga: ${issued.error}`,
                );
              link = uploadUrl(token);
            }
            return renderReceiptRejected(
              {
                ...base(a),
                reason: (rejected.rejection_reason as string) ?? "",
                dueLabel: a.depositDueAt ? whenLabel(a.depositDueAt) : null,
                uploadUrl: link,
              },
              footer,
            );
          },
        );
        return { customer };
      }),

    appointmentConfirmed: (appointmentId: string, opts?: NotifyOpts) =>
      safe(async () => {
        const a = await loadAppointment(client, appointmentId);
        if (
          !a ||
          !["confirmed", "completed", "reschedule_requested"].includes(a.status)
        )
          return OBSOLETE;
        const payment = await one(
          client
            .from("payments")
            .select("id, amount_ars")
            .eq("appointment_id", a.id)
            .eq("status", "verified")
            .eq("type", "deposit")
            .order("verified_at", { ascending: false })
            .limit(1),
        );
        if (!payment) return OBSOLETE;
        const customer = await toCustomer(
          a,
          "appointment_confirmed",
          `appointment_confirmed:${payment.id as string}`,
          opts,
          () =>
            renderAppointmentConfirmed(
              {
                ...base(a),
                amountArs: Number(payment.amount_ars),
                cancellationPolicy: businessConfig.cancellationPolicyText,
                address: `${businessConfig.address.street}, ${businessConfig.address.city}`,
                pickup: a.pickup,
              },
              footer,
            ),
        );
        return { customer };
      }),

    appointmentCancelled: (appointmentId: string, opts?: NotifyOpts) =>
      safe(async () => {
        const a = await loadAppointment(client, appointmentId);
        if (
          !a ||
          !a.closedAt ||
          ![
            "cancelled_by_client",
            "cancelled_by_business",
            "deposit_forfeited",
          ].includes(a.status)
        ) {
          return OBSOLETE;
        }
        let kind: CancellationKind =
          a.status === "cancelled_by_business" ? "business" : "client";
        if (a.status === "cancelled_by_business") {
          const approved = await client
            .from("appointment_events")
            .select("id", { count: "exact", head: true })
            .eq("appointment_id", a.id)
            .eq("event_type", "approved");
          if ((approved.count ?? 0) === 0) kind = "declined";
        }
        const closedAt = a.closedAt;
        const customer = await toCustomer(
          a,
          "appointment_cancelled",
          `appointment_cancelled:${a.id}:${epoch(closedAt)}`,
          opts,
          () =>
            renderAppointmentCancelled(
              {
                ...base(a),
                kind,
                depositForfeited: a.status === "deposit_forfeited",
                cancellationPolicy: businessConfig.cancellationPolicyText,
              },
              footer,
            ),
        );
        return { customer };
      }),

    appointmentRescheduled: (appointmentId: string, opts?: NotifyOpts) =>
      safe(async () => {
        const a = await loadAppointment(client, appointmentId);
        if (!a) return OBSOLETE;
        const event = await one(
          client
            .from("appointment_events")
            .select("id, from_slot_id")
            .eq("appointment_id", a.id)
            .eq("event_type", "rescheduled")
            .order("created_at", { ascending: false })
            .limit(1),
        );
        if (!event) return OBSOLETE;
        let previous: string | null = null;
        if (event.from_slot_id) {
          const slot = await one(
            client
              .from("availability_slots")
              .select("starts_at")
              .eq("id", event.from_slot_id as string)
              .maybeSingle(),
          );
          if (slot) previous = whenLabel(new Date(slot.starts_at as string));
        }
        const customer = await toCustomer(
          a,
          "appointment_rescheduled",
          `appointment_rescheduled:${event.id as string}`,
          opts,
          () =>
            renderAppointmentRescheduled(
              { ...base(a), previousWhenLabel: previous },
              footer,
            ),
        );
        return { customer };
      }),

    refundRecorded: (appointmentId: string, opts?: NotifyOpts) =>
      safe(async () => {
        const a = await loadAppointment(client, appointmentId);
        if (!a) return OBSOLETE;
        const payment = await one(
          client
            .from("payments")
            .select("id, refund_amount_ars, refund_reference")
            .eq("appointment_id", a.id)
            .not("refunded_at", "is", null)
            .order("refunded_at", { ascending: false })
            .limit(1),
        );
        if (!payment) return OBSOLETE;
        const customer = await toCustomer(
          a,
          "refund_recorded",
          `refund_recorded:${payment.id as string}`,
          opts,
          () =>
            renderRefundRecorded(
              {
                ...base(a),
                amountArs: Number(payment.refund_amount_ars),
                reference: (payment.refund_reference as string | null) ?? null,
              },
              footer,
            ),
        );
        return { customer };
      }),
  };

  /**
   * Retries emails that failed (or were left half-sent). Each one is re-run
   * through its own notifier with its ORIGINAL key, so one that already went
   * out is skipped and one whose situation changed is dismissed as obsolete.
   */
  const retryFailed = async (issueToken: IssueUploadToken) => {
    const summary = { retried: 0, sent: 0, failed: 0, dismissed: 0 };
    const { data } = await client
      .from("email_outbox")
      .select(
        "id, kind, appointment_id, idempotency_key, status, last_attempt_at",
      )
      .in("status", ["failed", "pending"])
      .order("created_at", { ascending: true })
      .limit(50);
    const rows =
      (data as
        | {
            id: string;
            kind: OutboxKind;
            appointment_id: string | null;
            idempotency_key: string;
            status: string;
            last_attempt_at: string;
          }[]
        | null) ?? [];

    for (const row of rows) {
      const inFlight =
        row.status === "pending" &&
        Date.now() - new Date(row.last_attempt_at).getTime() < 10 * 60_000;
      if (inFlight) continue;
      summary.retried++;

      let result: NotifyResult = OBSOLETE;
      if (row.appointment_id) {
        const opts: NotifyOpts = { onlyKey: row.idempotency_key };
        const id = row.appointment_id;
        switch (row.kind) {
          case "request_received":
          case "owner_new_request":
            result = await methods.requestReceived(id, opts);
            break;
          case "request_approved":
            result = await methods.requestApproved(id, issueToken, opts);
            break;
          case "receipt_received":
          case "owner_receipt_received":
            result = await methods.receiptReceived(id, opts);
            break;
          case "receipt_rejected":
            result = await methods.receiptRejected(id, issueToken, opts);
            break;
          case "appointment_confirmed":
            result = await methods.appointmentConfirmed(id, opts);
            break;
          case "appointment_cancelled":
            result = await methods.appointmentCancelled(id, opts);
            break;
          case "appointment_rescheduled":
            result = await methods.appointmentRescheduled(id, opts);
            break;
          case "refund_recorded":
            result = await methods.refundRecorded(id, opts);
            break;
        }
      }
      const outcomes = [result.customer, result.owner].filter(
        (o): o is Outcome => o !== undefined,
      );
      if (outcomes.includes("sent")) summary.sent++;
      else if (outcomes.includes("failed")) summary.failed++;
      else if (
        outcomes.every((o) => o === "obsolete" || o === "no_recipient")
      ) {
        // The situation changed (or the recipient no longer exists): close
        // the row so it stops showing up as a pending problem.
        await client.rpc("email_outbox_complete", {
          p_outbox_id: row.id,
          p_ok: true,
          p_provider: "obsolete",
          p_error: null,
        });
        summary.dismissed++;
      }
    }
    return summary;
  };

  return { ...methods, retryFailed };
}

export type Notifier = ReturnType<typeof createNotifier>;

/** Production wiring: service-role client, Resend (or the no-op mailer in dev), env config. */
export function getNotifier(): Notifier {
  const env = getServerEnv();
  return createNotifier({
    client: getServiceSupabaseClient(),
    mailer: getMailer(),
    ownerEmail: getOwnerEmail(),
    transfer: {
      alias: env.DEPOSIT_TRANSFER_ALIAS ?? null,
      holder: env.DEPOSIT_TRANSFER_HOLDER ?? null,
      cbu: env.DEPOSIT_TRANSFER_CBU ?? null,
    },
    siteUrl: getSiteUrl(),
  });
}
