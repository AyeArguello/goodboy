import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mailer } from "./mailer";
import type { RenderedEmail } from "./emailTemplates";

export type OutboxKind =
  | "request_received"
  | "owner_new_request"
  | "request_approved"
  | "receipt_received"
  | "owner_receipt_received"
  | "receipt_rejected"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "refund_recorded";

export type SendOutcome = "sent" | "skipped" | "failed";

export type OutboxClient = Pick<SupabaseClient, "rpc">;

/**
 * Sends one logical email at most once.
 *
 * `email_outbox_claim` atomically decides whether this caller may send: a
 * second call with the same idempotency key (double click, a retry after a
 * crash, two tabs) gets `claimed = false` and sends nothing. A failed attempt
 * stays `failed` in the table, so it can be retried later without ever
 * producing a duplicate of one that already went out.
 *
 * Never throws and never touches appointment state: whatever happens here,
 * the transition that triggered the email has already been committed.
 */
export async function sendOnce(
  deps: { client: OutboxClient; mailer: Mailer },
  params: {
    key: string;
    kind: OutboxKind;
    appointmentId: string | null;
    to: string;
    render: () => RenderedEmail | Promise<RenderedEmail>;
  },
): Promise<SendOutcome> {
  let outboxId: string | null = null;
  try {
    const { data, error } = await deps.client.rpc("email_outbox_claim", {
      p_key: params.key,
      p_kind: params.kind,
      p_appointment_id: params.appointmentId,
      p_recipient: params.to,
    });
    if (error) throw new Error(error.message);
    const row = (data as { outbox_id: string; claimed: boolean }[] | null)?.[0];
    if (!row) throw new Error("outbox claim sin respuesta");
    if (!row.claimed) return "skipped";
    outboxId = row.outbox_id;

    const rendered = await params.render();
    const result = await deps.mailer.send({ to: params.to, ...rendered });
    await complete(
      deps.client,
      outboxId,
      result.ok,
      result.ok ? result.provider : null,
      result.ok ? null : result.error,
    );
    return result.ok ? "sent" : "failed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    console.error(`email ${params.kind} (${params.key}) failed:`, message);
    if (outboxId) {
      await complete(deps.client, outboxId, false, null, message).catch(
        () => {},
      );
    }
    return "failed";
  }
}

async function complete(
  client: OutboxClient,
  outboxId: string,
  ok: boolean,
  provider: string | null,
  error: string | null,
): Promise<void> {
  await client.rpc("email_outbox_complete", {
    p_outbox_id: outboxId,
    p_ok: ok,
    p_provider: provider,
    p_error: error,
  });
}
