import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  getServiceSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/config/business", async (orig) => ({
  ...(await orig<typeof import("@/lib/config/business")>()),
  siteUrl: () => "https://goodboy.test",
}));

const { nextWeekRange, sendWeeklyAgenda } = await import("./weeklyAgenda");

describe("nextWeekRange", () => {
  it("on a Sunday is the week that starts the next day", () => {
    // Sunday 2026-10-11 10:00 in Córdoba
    const r = nextWeekRange(new Date("2026-10-11T13:00:00Z"));
    expect(r.mondayKey).toBe("2026-10-12");
    expect(r.start.toISOString()).toBe("2026-10-12T03:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-19T03:00:00.000Z");
  });

  it("midweek is the following Monday", () => {
    const r = nextWeekRange(new Date("2026-10-14T15:00:00Z")); // Wednesday
    expect(r.mondayKey).toBe("2026-10-19");
  });

  it("on a Monday is the Monday after", () => {
    expect(nextWeekRange(new Date("2026-10-12T15:00:00Z")).mondayKey).toBe(
      "2026-10-19",
    );
  });
});

function world(rows: unknown[], claimed = true) {
  const query: Record<string, unknown> = {};
  for (const m of ["select", "in", "gte", "lt"]) query[m] = () => query;
  (query as { then: unknown }).then = (res: (v: unknown) => void) =>
    res({ data: rows, error: null });
  return {
    from: vi.fn(() => query),
    rpc: vi.fn(async (fn: string) =>
      fn === "email_outbox_claim"
        ? { data: [{ outbox_id: "o1", claimed }], error: null }
        : { data: null, error: null },
    ),
  };
}

describe("sendWeeklyAgenda", () => {
  const row = (dog: string, startsAt: string) => ({
    dog_name: dog,
    owner_name: "Carolina",
    phone_e164: "+5493511234567",
    status: "confirmed",
    availability_slots: { starts_at: startsAt },
  });

  it("emails the owner the week's turns in order, with a reminder link each", async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const client = world([
      row("Luna", "2026-10-14T14:30:00Z"),
      row("Pool", "2026-10-13T12:00:00Z"),
    ]);
    const result = await sendWeeklyAgenda({
      client: client as never,
      mailer: {
        send: async (m) => (sent.push(m), { ok: true, provider: "resend" }),
      },
      ownerEmail: "owner@example.com",
      now: new Date("2026-10-11T13:00:00Z"),
    });
    expect(result).toMatchObject({ ok: true, outcome: "sent", count: 2 });
    expect(sent[0]!.to).toBe("owner@example.com");
    expect(sent[0]!.subject).toContain("2");
    expect(sent[0]!.text.indexOf("Pool")).toBeLessThan(
      sent[0]!.text.indexOf("Luna"),
    );
    expect(sent[0]!.text).toContain("https://wa.me/5493511234567?text=");
  });

  it("is idempotent per week", async () => {
    const send = vi.fn();
    const result = await sendWeeklyAgenda({
      client: world([], false) as never,
      mailer: { send },
      ownerEmail: "owner@example.com",
      now: new Date("2026-10-11T13:00:00Z"),
    });
    expect(result).toMatchObject({ ok: true, outcome: "skipped" });
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing without an owner email", async () => {
    const result = await sendWeeklyAgenda({
      client: world([]) as never,
      mailer: { send: vi.fn() },
      ownerEmail: null,
    });
    expect(result).toMatchObject({ ok: true, outcome: "no_recipient" });
  });
});
