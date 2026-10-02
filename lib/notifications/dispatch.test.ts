import { describe, expect, it, vi } from "vitest";
import {
  createNotifier,
  type DispatchClient,
  type IssueUploadToken,
} from "./dispatch";
import type { EmailMessage, Mailer, SendResult } from "./mailer";
import { hashUploadToken } from "@/lib/receipts/token";

type Row = Record<string, unknown>;

/** Minimal in-memory PostgREST-ish builder + the two outbox RPCs. */
function makeWorld() {
  const tables: Record<string, Row[]> = {
    appointments: [],
    business_settings: [{ id: true, deposit_amount_ars: 20000 }],
    payment_receipts: [],
    payments: [],
    appointment_events: [],
    availability_slots: [],
    email_outbox: [],
  };
  let seq = 0;

  function builder(name: string) {
    let rows = [...tables[name]!];
    let countMode = false;
    const api = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        countMode = !!opts?.count;
        return api;
      },
      eq: (col: string, val: unknown) => (
        (rows = rows.filter((r) => r[col] === val)),
        api
      ),
      neq: (col: string, val: unknown) => (
        (rows = rows.filter((r) => r[col] !== val)),
        api
      ),
      in: (col: string, vals: unknown[]) => (
        (rows = rows.filter((r) => vals.includes(r[col]))),
        api
      ),
      not: (col: string, _op: string, val: unknown) => (
        (rows = rows.filter((r) => r[col] !== val)),
        api
      ),
      order: (col: string, o?: { ascending?: boolean }) => {
        const dir = o?.ascending === false ? -1 : 1;
        rows = [...rows].sort((a, b) =>
          String(a[col]) < String(b[col])
            ? -dir
            : String(a[col]) > String(b[col])
              ? dir
              : 0,
        );
        return api;
      },
      limit: (n: number) => ((rows = rows.slice(0, n)), api),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: countMode ? null : rows,
          count: rows.length,
          error: null,
        }).then(resolve),
    };
    return api;
  }

  const client = {
    from: (name: string) => builder(name),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const outbox = tables.email_outbox!;
      if (fn === "email_outbox_claim") {
        const existing = outbox.find((r) => r.idempotency_key === args.p_key);
        if (!existing) {
          const row = {
            id: `ob-${++seq}`,
            kind: args.p_kind,
            appointment_id: args.p_appointment_id,
            recipient: args.p_recipient,
            idempotency_key: args.p_key,
            status: "pending",
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
          };
          outbox.push(row);
          return { data: [{ outbox_id: row.id, claimed: true }], error: null };
        }
        const stale =
          existing.status === "pending" &&
          Date.now() - new Date(existing.last_attempt_at as string).getTime() >
            10 * 60_000;
        if (existing.status === "failed" || stale) {
          existing.status = "pending";
          existing.attempts = (existing.attempts as number) + 1;
          existing.last_attempt_at = new Date().toISOString();
          return {
            data: [{ outbox_id: existing.id, claimed: true }],
            error: null,
          };
        }
        return {
          data: [{ outbox_id: existing.id, claimed: false }],
          error: null,
        };
      }
      if (fn === "email_outbox_complete") {
        const row = outbox.find((r) => r.id === args.p_outbox_id)!;
        row.status = args.p_ok ? "sent" : "failed";
        row.provider = args.p_provider;
        row.last_error = args.p_error;
        return { data: null, error: null };
      }
      throw new Error("unexpected rpc " + fn);
    },
  } as unknown as DispatchClient;

  return { tables, client };
}

const START = new Date(Date.now() + 5 * 86_400_000).toISOString();
const DUE = new Date(Date.now() + 2 * 86_400_000).toISOString();

function appointment(over: Row = {}): Row {
  return {
    id: "a1",
    code: "GB-ABCD2345",
    dog_name: "Luna",
    owner_name: "Carolina",
    email: "carolina@example.com",
    status: "pending_review",
    deposit_due_at: null,
    closed_at: null,
    logistics_mode: "self",
    availability_slots: { starts_at: START },
    ...over,
  };
}

function setup(
  opts: { owner?: string | null; mailerResults?: SendResult[] } = {},
) {
  const w = makeWorld();
  const sent: EmailMessage[] = [];
  const results = opts.mailerResults ?? [];
  const mailer: Mailer = {
    send: vi.fn(async (m: EmailMessage) => {
      const r =
        results.shift() ?? ({ ok: true, provider: "resend" } as SendResult);
      if (r.ok) sent.push(m);
      return r;
    }),
  };
  const notifier = createNotifier({
    client: w.client,
    mailer,
    ownerEmail: opts.owner === undefined ? "owner@example.com" : opts.owner,
    transfer: { alias: "good.boy.alias", holder: "Titular Prueba", cbu: null },
    siteUrl: "https://goodboy.test",
  });
  const issueOk: IssueUploadToken & { calls: string[] } = Object.assign(
    vi.fn(async (_id: string, hash: string) => {
      issueOk.calls.push(hash);
      return { ok: true as const };
    }),
    { calls: [] as string[] },
  );
  return { ...w, mailer, sent, notifier, issueOk };
}

describe("requestReceived", () => {
  it("emails the customer and the owner once, and is idempotent", async () => {
    const s = setup();
    s.tables.appointments!.push(appointment());
    expect(await s.notifier.requestReceived("a1")).toEqual({
      customer: "sent",
      owner: "sent",
    });
    expect(s.sent.map((m) => m.to)).toEqual([
      "carolina@example.com",
      "owner@example.com",
    ]);
    expect(await s.notifier.requestReceived("a1")).toEqual({
      customer: "skipped",
      owner: "skipped",
    });
    expect(s.sent).toHaveLength(2);
  });

  it("reports missing recipients instead of failing", async () => {
    const s = setup({ owner: null });
    s.tables.appointments!.push(appointment({ email: null }));
    expect(await s.notifier.requestReceived("a1")).toEqual({
      customer: "no_recipient",
      owner: "no_recipient",
    });
    expect(s.sent).toHaveLength(0);
  });

  it("an unknown appointment is obsolete, not an error", async () => {
    const s = setup();
    expect(await s.notifier.requestReceived("nope")).toEqual({
      customer: "obsolete",
    });
  });

  it("a Resend failure is recorded and never throws; a retry sends it exactly once", async () => {
    const s = setup({
      mailerResults: [
        { ok: false, error: "Resend caído" },
        { ok: false, error: "Resend caído" },
      ],
    });
    s.tables.appointments!.push(appointment());
    expect(await s.notifier.requestReceived("a1")).toEqual({
      customer: "failed",
      owner: "failed",
    });
    expect(s.tables.email_outbox!.every((r) => r.status === "failed")).toBe(
      true,
    );

    expect(await s.notifier.requestReceived("a1")).toEqual({
      customer: "sent",
      owner: "sent",
    });
    expect(await s.notifier.requestReceived("a1")).toEqual({
      customer: "skipped",
      owner: "skipped",
    });
    expect(s.sent).toHaveLength(2);
  });
});

describe("requestApproved", () => {
  const awaiting = () =>
    appointment({ status: "awaiting_deposit", deposit_due_at: DUE });

  it("sends the payment instructions with a secure link whose hash — not the token — is what gets stored", async () => {
    const s = setup();
    s.tables.appointments!.push(awaiting());
    expect(await s.notifier.requestApproved("a1", s.issueOk)).toEqual({
      customer: "sent",
    });

    const mail = s.sent[0]!;
    const link =
      /https:\/\/goodboy\.test\/turnos\/comprobante#t=([A-Za-z0-9_-]{43})/.exec(
        mail.text,
      );
    expect(link).not.toBeNull();
    const token = link![1]!;
    expect(s.issueOk.calls).toEqual([hashUploadToken(token)]);
    expect(JSON.stringify(s.tables)).not.toContain(token); // raw token never persisted by the outbox
    expect(mail.text).toContain("good.boy.alias");
    expect(mail.text).toContain("Titular Prueba");
    expect(mail.text).toContain("ARS 20.000");
    expect(mail.text).toContain("Luna");
    expect(mail.text).toMatch(/Cancelación:/);
    expect(mail.subject).toContain("Luna");
  });

  it("does not issue another link when the same approval is notified again", async () => {
    const s = setup();
    s.tables.appointments!.push(awaiting());
    await s.notifier.requestApproved("a1", s.issueOk);
    expect(await s.notifier.requestApproved("a1", s.issueOk)).toEqual({
      customer: "skipped",
    });
    expect(s.issueOk.calls).toHaveLength(1);
    expect(s.sent).toHaveLength(1);
  });

  it("a deliberate resend gets its own key and a fresh link", async () => {
    const s = setup();
    s.tables.appointments!.push(awaiting());
    await s.notifier.requestApproved("a1", s.issueOk);
    expect(
      await s.notifier.requestApproved("a1", s.issueOk, { resend: true }),
    ).toEqual({ customer: "sent" });
    expect(s.sent).toHaveLength(2);
    expect(new Set(s.issueOk.calls).size).toBe(2);
  });

  it("a failed link creation fails the email (retryable) without sending anything", async () => {
    const s = setup();
    s.tables.appointments!.push(awaiting());
    const bad: IssueUploadToken = async () => ({
      ok: false,
      error: "rpc caído",
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await s.notifier.requestApproved("a1", bad)).toEqual({
      customer: "failed",
    });
    expect(s.sent).toHaveLength(0);
    expect(s.tables.email_outbox![0]).toMatchObject({ status: "failed" });
    // a later retry succeeds with a new link
    expect(await s.notifier.requestApproved("a1", s.issueOk)).toEqual({
      customer: "sent",
    });
    spy.mockRestore();
  });

  it("is obsolete once the appointment is no longer awaiting a deposit", async () => {
    const s = setup();
    s.tables.appointments!.push(
      appointment({ status: "confirmed", deposit_due_at: DUE }),
    );
    expect(await s.notifier.requestApproved("a1", s.issueOk)).toEqual({
      customer: "obsolete",
    });
    expect(s.issueOk.calls).toHaveLength(0);
  });
});

describe("receiptReceived / receiptRejected", () => {
  it("notifies customer and owner for the latest receipt only once", async () => {
    const s = setup();
    s.tables.appointments!.push(
      appointment({ status: "awaiting_deposit", deposit_due_at: DUE }),
    );
    s.tables.payment_receipts!.push({
      id: "r1",
      appointment_id: "a1",
      status: "pending_verification",
      uploaded_at: "2026-10-01T10:00:00Z",
    });
    expect(await s.notifier.receiptReceived("a1")).toEqual({
      customer: "sent",
      owner: "sent",
    });
    expect(await s.notifier.receiptReceived("a1")).toEqual({
      customer: "skipped",
      owner: "skipped",
    });
    expect(s.sent[0]!.text).toContain("pendiente de verificación");
    expect(s.sent[1]!.to).toBe("owner@example.com");
    // a replacement upload is a new email
    s.tables.payment_receipts!.push({
      id: "r2",
      appointment_id: "a1",
      status: "pending_verification",
      uploaded_at: "2026-10-01T11:00:00Z",
    });
    expect(await s.notifier.receiptReceived("a1")).toEqual({
      customer: "sent",
      owner: "sent",
    });
  });

  it("rejection email carries the reason and a fresh link while the window is open", async () => {
    const s = setup();
    s.tables.appointments!.push(
      appointment({ status: "awaiting_deposit", deposit_due_at: DUE }),
    );
    s.tables.payment_receipts!.push({
      id: "r1",
      appointment_id: "a1",
      status: "rejected",
      rejection_reason: "La imagen está cortada",
      rejected_at: "2026-10-01T10:00:00Z",
    });
    expect(await s.notifier.receiptRejected("a1", s.issueOk)).toEqual({
      customer: "sent",
    });
    expect(s.sent[0]!.text).toContain("La imagen está cortada");
    expect(s.sent[0]!.text).toMatch(/#t=[A-Za-z0-9_-]{43}/);
    expect(s.issueOk.calls).toHaveLength(1);
  });

  it("when the window already closed, it says so and issues no link", async () => {
    const s = setup();
    s.tables.appointments!.push(
      appointment({
        status: "awaiting_deposit",
        deposit_due_at: new Date(Date.now() - 3_600_000).toISOString(),
      }),
    );
    s.tables.payment_receipts!.push({
      id: "r1",
      appointment_id: "a1",
      status: "rejected",
      rejection_reason: "No coincide el importe",
      rejected_at: "2026-10-01T10:00:00Z",
    });
    await s.notifier.receiptRejected("a1", s.issueOk);
    expect(s.issueOk.calls).toHaveLength(0);
    expect(s.sent[0]!.text).toContain("ya venció");
    expect(s.sent[0]!.text).not.toContain("#t=");
  });
});

describe("confirmation, cancellation, reschedule, refund", () => {
  it("confirmed email needs a verified deposit and is sent once per payment", async () => {
    const s = setup();
    s.tables.appointments!.push(appointment({ status: "confirmed" }));
    expect(await s.notifier.appointmentConfirmed("a1")).toEqual({
      customer: "obsolete",
    });
    s.tables.payments!.push({
      id: "p1",
      appointment_id: "a1",
      status: "verified",
      type: "deposit",
      amount_ars: 20000,
      verified_at: "2026-10-01T10:00:00Z",
    });
    expect(await s.notifier.appointmentConfirmed("a1")).toEqual({
      customer: "sent",
    });
    expect(await s.notifier.appointmentConfirmed("a1")).toEqual({
      customer: "skipped",
    });
    expect(s.sent[0]!.text).toContain(
      "Turno confirmado".slice(0, 0) + "confirmado",
    );
    expect(s.sent[0]!.text).toContain("ARS 20.000");
  });

  it("cancellation wording depends on who cancelled and whether the deposit is forfeited", async () => {
    const closedAt = "2026-10-02T10:00:00Z";
    const cases: [Row, RegExp, RegExp?][] = [
      [{ status: "cancelled_by_client" }, /Registramos la cancelación/],
      [{ status: "deposit_forfeited" }, /la seña no se reintegra/],
      [
        { status: "cancelled_by_business" },
        /Tuvimos que cancelar/,
        /no se reintegra/,
      ],
    ];
    for (const [over, expected, forbidden] of cases) {
      const s = setup();
      s.tables.appointments!.push(
        appointment({ ...over, closed_at: closedAt }),
      );
      s.tables.appointment_events!.push({
        id: "e1",
        appointment_id: "a1",
        event_type: "approved",
      });
      expect(await s.notifier.appointmentCancelled("a1")).toEqual({
        customer: "sent",
      });
      expect(s.sent[0]!.text).toMatch(expected);
      if (forbidden) expect(s.sent[0]!.text).not.toMatch(forbidden);
    }
  });

  it("a request declined before approval gets the 'declined' wording", async () => {
    const s = setup();
    s.tables.appointments!.push(
      appointment({
        status: "cancelled_by_business",
        closed_at: "2026-10-02T10:00:00Z",
      }),
    );
    await s.notifier.appointmentCancelled("a1");
    expect(s.sent[0]!.subject).toContain("Sobre tu solicitud");
    expect(s.sent[0]!.text).toContain("No pudimos tomar tu solicitud");
  });

  it("reschedule mentions the previous time and is idempotent per reschedule event", async () => {
    const s = setup();
    s.tables.appointments!.push(appointment({ status: "confirmed" }));
    s.tables.availability_slots!.push({
      id: "s0",
      starts_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
    });
    s.tables.appointment_events!.push({
      id: "e9",
      appointment_id: "a1",
      event_type: "rescheduled",
      from_slot_id: "s0",
      created_at: "2026-10-02T10:00:00Z",
    });
    expect(await s.notifier.appointmentRescheduled("a1")).toEqual({
      customer: "sent",
    });
    expect(await s.notifier.appointmentRescheduled("a1")).toEqual({
      customer: "skipped",
    });
    expect(s.sent[0]!.text).toContain("Antes:");
  });

  it("refund email is sent once per refunded payment", async () => {
    const s = setup();
    s.tables.appointments!.push(
      appointment({ status: "cancelled_by_business" }),
    );
    s.tables.payments!.push({
      id: "p1",
      appointment_id: "a1",
      refunded_at: "2026-10-03T10:00:00Z",
      refund_amount_ars: 20000,
      refund_reference: "DEV-77",
    });
    expect(await s.notifier.refundRecorded("a1")).toEqual({ customer: "sent" });
    expect(await s.notifier.refundRecorded("a1")).toEqual({
      customer: "skipped",
    });
    expect(s.sent[0]!.text).toContain("DEV-77");
  });
});

describe("retryFailed", () => {
  it("re-sends failed emails once, skips in-flight ones and dismisses obsolete ones", async () => {
    const s = setup({
      mailerResults: [
        { ok: false, error: "caído" },
        { ok: false, error: "caído" },
      ],
    });
    s.tables.appointments!.push(appointment());
    s.tables.appointments!.push(
      appointment({
        id: "a2",
        code: "GB-ZZZZ2345",
        status: "awaiting_deposit",
        deposit_due_at: DUE,
      }),
    );
    await s.notifier.requestReceived("a1"); // customer + owner fail
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await s.notifier.requestApproved("a2", async () => ({
      ok: false,
      error: "x",
    })); // fails
    spy.mockRestore();
    // a2 is confirmed before the retry: its approval email is no longer relevant
    s.tables.appointments![1]!.status = "confirmed";
    // an unrelated in-flight email must be left alone
    s.tables.email_outbox!.push({
      id: "ob-x",
      kind: "request_received",
      appointment_id: "a1",
      idempotency_key: "inflight",
      status: "pending",
      last_attempt_at: new Date().toISOString(),
    });

    const summary = await s.notifier.retryFailed(s.issueOk);
    expect(summary).toMatchObject({
      retried: 3,
      sent: 2,
      dismissed: 1,
      failed: 0,
    });
    expect(s.sent.map((m) => m.to).sort()).toEqual([
      "carolina@example.com",
      "owner@example.com",
    ]);
    expect(s.tables.email_outbox!.find((r) => r.id === "ob-x")!.status).toBe(
      "pending",
    );

    // running it again changes nothing
    const again = await s.notifier.retryFailed(s.issueOk);
    expect(again).toMatchObject({ retried: 0 });
    expect(s.sent).toHaveLength(2);
  });
});

describe("content policy", () => {
  it("no email promises card payments, Mercado Pago, automatic payment detection or an automatic WhatsApp", async () => {
    const s = setup();
    s.tables.appointments!.push(
      appointment({ status: "awaiting_deposit", deposit_due_at: DUE }),
    );
    s.tables.payment_receipts!.push({
      id: "r1",
      appointment_id: "a1",
      status: "rejected",
      rejection_reason: "ilegible",
      rejected_at: "2026-10-01T10:00:00Z",
      uploaded_at: "2026-10-01T09:00:00Z",
    });
    await s.notifier.requestReceived("a1");
    await s.notifier.requestApproved("a1", s.issueOk);
    await s.notifier.receiptReceived("a1");
    await s.notifier.receiptRejected("a1", s.issueOk);
    expect(s.sent.length).toBeGreaterThanOrEqual(6);
    for (const m of s.sent) {
      expect(`${m.subject}\n${m.text}`).not.toMatch(
        /mercado ?pago|tarjeta|cuotas|recargo|autom[aá]tic|enviamos (un )?whatsapp/i,
      );
    }
  });
});
