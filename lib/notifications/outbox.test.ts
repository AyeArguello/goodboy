import { describe, expect, it, vi } from "vitest";
import { sendOnce, type OutboxClient } from "./outbox";
import type { Mailer, SendResult } from "./mailer";

type Row = {
  status: "pending" | "sent" | "failed";
  attempts: number;
  error: string | null;
};

/** In-memory stand-in for the email_outbox_claim / email_outbox_complete functions. */
function fakeOutbox() {
  const rows = new Map<string, Row & { id: string }>();
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "email_outbox_claim") {
        const key = args.p_key as string;
        const existing = rows.get(key);
        if (!existing) {
          const row = {
            id: `id-${rows.size + 1}`,
            status: "pending" as const,
            attempts: 1,
            error: null,
          };
          rows.set(key, row);
          return { data: [{ outbox_id: row.id, claimed: true }], error: null };
        }
        if (existing.status === "failed") {
          existing.status = "pending";
          existing.attempts++;
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
        const row = [...rows.values()].find((r) => r.id === args.p_outbox_id)!;
        row.status = args.p_ok ? "sent" : "failed";
        row.error = (args.p_error as string | null) ?? null;
        return { data: null, error: null };
      }
      throw new Error("unexpected rpc " + fn);
    },
  };
  return { rows, client: client as unknown as OutboxClient };
}

function mailerWith(
  results: SendResult[],
): Mailer & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(
    async () =>
      results.shift() ?? { ok: true as const, provider: "noop" as const },
  );
  return { send };
}

const render = () => ({ subject: "Asunto", text: "Cuerpo" });
const base = {
  key: "request_received:a1",
  kind: "request_received" as const,
  appointmentId: "a1",
  to: "c@example.com",
  render,
};

describe("sendOnce", () => {
  it("sends once and records the outcome", async () => {
    const { client, rows } = fakeOutbox();
    const mailer = mailerWith([{ ok: true, provider: "resend" }]);
    expect(await sendOnce({ client, mailer }, base)).toBe("sent");
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith({
      to: "c@example.com",
      subject: "Asunto",
      text: "Cuerpo",
    });
    expect(rows.get(base.key)!.status).toBe("sent");
  });

  it("is idempotent: the same key never sends twice (double click / retried action)", async () => {
    const { client } = fakeOutbox();
    const mailer = mailerWith([]);
    expect(await sendOnce({ client, mailer }, base)).toBe("sent");
    expect(await sendOnce({ client, mailer }, base)).toBe("skipped");
    expect(await sendOnce({ client, mailer }, base)).toBe("skipped");
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("two concurrent calls send exactly one email", async () => {
    const { client } = fakeOutbox();
    const mailer = mailerWith([]);
    const results = await Promise.all([
      sendOnce({ client, mailer }, base),
      sendOnce({ client, mailer }, base),
    ]);
    expect(results.sort()).toEqual(["sent", "skipped"]);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("records a provider failure without throwing, then a retry sends it once", async () => {
    const { client, rows } = fakeOutbox();
    const mailer = mailerWith([{ ok: false, error: "Resend caído" }]);
    expect(await sendOnce({ client, mailer }, base)).toBe("failed");
    expect(rows.get(base.key)).toMatchObject({
      status: "failed",
      error: "Resend caído",
    });

    expect(await sendOnce({ client, mailer }, base)).toBe("sent");
    expect(rows.get(base.key)).toMatchObject({ status: "sent", attempts: 2 });
    expect(await sendOnce({ client, mailer }, base)).toBe("skipped");
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });

  it("survives a mailer that throws", async () => {
    const { client, rows } = fakeOutbox();
    const mailer = {
      send: vi.fn(async () => {
        throw new Error("boom");
      }),
    } as unknown as Mailer;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendOnce({ client, mailer }, base)).toBe("failed");
    expect(rows.get(base.key)).toMatchObject({
      status: "failed",
      error: "boom",
    });
    spy.mockRestore();
  });

  it("records a failure when rendering throws (e.g. the upload link could not be created)", async () => {
    const { client, rows } = fakeOutbox();
    const mailer = mailerWith([]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await sendOnce(
      { client, mailer },
      {
        ...base,
        render: () => {
          throw new Error("sin enlace");
        },
      },
    );
    expect(outcome).toBe("failed");
    expect(mailer.send).not.toHaveBeenCalled();
    expect(rows.get(base.key)).toMatchObject({
      status: "failed",
      error: "sin enlace",
    });
    spy.mockRestore();
  });

  it("returns failed (never throws) when the outbox itself is unavailable", async () => {
    const client = {
      rpc: async () => ({ data: null, error: { message: "db down" } }),
    } as unknown as OutboxClient;
    const mailer = mailerWith([]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendOnce({ client, mailer }, base)).resolves.toBe("failed");
    expect(mailer.send).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("different keys are independent", async () => {
    const { client } = fakeOutbox();
    const mailer = mailerWith([]);
    expect(await sendOnce({ client, mailer }, base)).toBe("sent");
    expect(
      await sendOnce(
        { client, mailer },
        { ...base, key: "request_received:a2" },
      ),
    ).toBe("sent");
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });
});
