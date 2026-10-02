import { describe, expect, it } from "vitest";
import type { ReceiptClient } from "./uploadFlow";
import { finalizeUpload, getUploadContext, prepareUpload } from "./uploadFlow";
import { generateUploadToken, hashUploadToken } from "./token";

const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0, 1,
]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const PDF = new TextEncoder().encode("%PDF-1.7 not an image");

type TokenState = "valid" | "used" | "revoked" | "expired" | "closed";

function makeWorld(initialState: TokenState = "valid") {
  const token = generateUploadToken();
  const hash = hashUploadToken(token);
  const world = {
    token,
    state: initialState as TokenState,
    activeReceipts: 0,
    objects: new Map<string, Uint8Array>(),
    registered: [] as { path: string; mime: string; size: number }[],
    registerCalls: 0,
    limitCounts: new Map<string, number>(),
    limitMax: Infinity,
    storageDown: false,
    signedPaths: [] as string[],
  };

  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "enforce_rate_limit") {
        const key = args.p_key as string;
        const n = (world.limitCounts.get(key) ?? 0) + 1;
        world.limitCounts.set(key, n);
        if (n > world.limitMax) {
          return { data: null, error: { message: "RATE_LIMITED" } };
        }
        return { data: null, error: null };
      }
      if (fn === "get_upload_context") {
        if (args.p_token_hash !== hash) return { data: [], error: null };
        return {
          data: [
            {
              ctx_appointment_id: "appt-1",
              ctx_dog_name: "Luna",
              ctx_starts_at: "2026-10-20T12:00:00Z",
              ctx_status:
                world.state === "closed" ? "confirmed" : "awaiting_deposit",
              ctx_deposit_amount_ars: "20000",
              ctx_deposit_due_at: "2026-10-18T12:00:00Z",
              ctx_token_state: world.state,
              ctx_pending_receipts: world.activeReceipts,
              ctx_active_receipts: world.activeReceipts,
            },
          ],
          error: null,
        };
      }
      if (fn === "register_payment_receipts") {
        world.registerCalls++;
        if (args.p_token_hash !== hash) {
          return { data: null, error: { message: "TOKEN_INVALID" } };
        }
        if (world.state === "used")
          return { data: null, error: { message: "TOKEN_USED" } };
        if (world.state === "expired")
          return { data: null, error: { message: "TOKEN_EXPIRED" } };
        const files = args.p_files as {
          path: string;
          mime: string;
          size: number;
        }[];
        world.registered.push(...files);
        world.state = "used";
        return {
          data: [
            {
              reg_appointment_id: "appt-1",
              reg_receipt_ids: files.map((_, i) => `rcpt-${i}`),
            },
          ],
          error: null,
        };
      }
      throw new Error("unexpected rpc " + fn);
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          if (world.storageDown)
            return { data: null, error: { message: "down" } };
          world.signedPaths.push(path);
          return {
            data: {
              signedUrl: `https://storage.test/${path}?token=t`,
              token: "t",
              path,
            },
            error: null,
          };
        },
        download: async (path: string) => {
          const bytes = world.objects.get(path);
          if (!bytes) return { data: null, error: { message: "not found" } };
          return { data: new Blob([bytes as BlobPart]), error: null };
        },
        remove: async (paths: string[]) => {
          for (const p of paths) world.objects.delete(p);
          return { data: [], error: null };
        },
      }),
    },
    from: () => ({
      select: () => ({
        in: async (_col: string, paths: string[]) => ({
          data: world.registered
            .filter((r) => paths.includes(r.path))
            .map((r) => ({ storage_path: r.path })),
          error: null,
        }),
      }),
    }),
  };
  return { world, client: client as unknown as ReceiptClient, token };
}

const file = (name = "pago.jpg", type = "image/jpeg", size = 2000) => ({
  name,
  type,
  size,
});
const key = "client-key";

describe("getUploadContext", () => {
  it("returns the context for a valid link without personal data", async () => {
    const { client, token } = makeWorld();
    const r = await getUploadContext(client, { token, clientKey: key });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.context).toMatchObject({
        dogName: "Luna",
        amountArs: 20000,
        tokenState: "valid",
      });
      expect(Object.keys(r.context)).not.toContain("ownerName");
      expect(Object.keys(r.context)).not.toContain("appointmentId");
    }
  });

  it("rejects malformed and unknown tokens identically", async () => {
    const { client } = makeWorld();
    expect(
      await getUploadContext(client, { token: "nope", clientKey: key }),
    ).toEqual({ ok: false, code: "INVALID_LINK" });
    expect(
      await getUploadContext(client, {
        token: generateUploadToken(),
        clientKey: key,
      }),
    ).toEqual({ ok: false, code: "INVALID_LINK" });
    expect(
      await getUploadContext(client, { token: undefined, clientKey: key }),
    ).toEqual({ ok: false, code: "INVALID_LINK" });
  });

  it("is rate limited", async () => {
    const { client, token, world } = makeWorld();
    world.limitMax = 0;
    expect(await getUploadContext(client, { token, clientKey: key })).toEqual({
      ok: false,
      code: "RATE_LIMITED",
    });
  });
});

describe("prepareUpload", () => {
  it("issues unique random paths with the right extension", async () => {
    const { client, token } = makeWorld();
    const r = await prepareUpload(client, {
      token,
      clientKey: key,
      files: [file("a.jpg"), file("b.png", "image/png")],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.uploads).toHaveLength(2);
      expect(r.uploads[0]!.path).toMatch(/^r\/[0-9a-f-]{36}\.jpg$/);
      expect(r.uploads[1]!.path).toMatch(/^r\/[0-9a-f-]{36}\.png$/);
      expect(r.uploads[0]!.path).not.toBe(r.uploads[1]!.path);
      expect(JSON.stringify(r.uploads)).not.toContain("a.jpg");
    }
  });

  it.each([
    ["used", "TOKEN_USED"],
    ["expired", "TOKEN_EXPIRED"],
    ["closed", "NOT_AWAITING_DEPOSIT"],
    ["revoked", "INVALID_LINK"],
  ] as const)("refuses a %s link", async (state, code) => {
    const { client, token } = makeWorld(state);
    expect(
      await prepareUpload(client, { token, clientKey: key, files: [file()] }),
    ).toEqual({ ok: false, code });
  });

  it("rejects invalid type, oversized, empty and too many files", async () => {
    const { client, token, world } = makeWorld();
    for (const f of [
      [file("doc.pdf", "application/pdf")],
      [file("a.jpg", "image/jpeg", 5 * 1024 * 1024 + 1)],
      [file("a.jpg", "image/jpeg", 0)],
      [file(), file(), file()],
      [],
    ]) {
      const r = await prepareUpload(client, {
        token,
        clientKey: key,
        files: f,
      });
      expect(r).toMatchObject({ ok: false, code: "INVALID_FILE" });
    }
    expect(world.signedPaths).toHaveLength(0);
  });

  it("does not allow more than two active receipts in total", async () => {
    const { client, token, world } = makeWorld();
    world.activeReceipts = 2;
    expect(
      await prepareUpload(client, { token, clientKey: key, files: [file()] }),
    ).toEqual({ ok: false, code: "TOO_MANY_RECEIPTS" });
  });

  it("reports a storage failure", async () => {
    const { client, token, world } = makeWorld();
    world.storageDown = true;
    expect(
      await prepareUpload(client, { token, clientKey: key, files: [file()] }),
    ).toEqual({ ok: false, code: "STORAGE_ERROR" });
  });
});

describe("finalizeUpload", () => {
  async function prepared(files = [file()]) {
    const w = makeWorld();
    const p = await prepareUpload(w.client, {
      token: w.token,
      clientKey: key,
      files,
    });
    if (!p.ok) throw new Error("prepare failed");
    return { ...w, uploads: p.uploads };
  }

  it("registers verified files with their real size and consumes the link", async () => {
    const { client, token, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, JPEG);
    const r = await finalizeUpload(client, {
      token,
      clientKey: key,
      uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
      reference: "  OP-1234  ",
    });
    expect(r).toEqual({
      ok: true,
      appointmentId: "appt-1",
      receiptIds: ["rcpt-0"],
    });
    expect(world.registered).toEqual([
      { path: uploads[0]!.path, mime: "image/jpeg", size: JPEG.length },
    ]);
    expect(world.state).toBe("used");
  });

  it("a link cannot be reused after a successful upload", async () => {
    const { client, token, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, JPEG);
    const input = {
      token,
      clientKey: key,
      uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
    };
    expect((await finalizeUpload(client, input)).ok).toBe(true);
    expect(await finalizeUpload(client, input)).toEqual({
      ok: false,
      code: "TOKEN_USED",
    });
    expect(
      await prepareUpload(client, { token, clientKey: key, files: [file()] }),
    ).toEqual({ ok: false, code: "TOKEN_USED" });
  });

  it("rejects a disguised file (PDF named .jpg) and deletes the object", async () => {
    const { client, token, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, PDF);
    const r = await finalizeUpload(client, {
      token,
      clientKey: key,
      uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
    });
    expect(r).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
    expect(world.objects.has(uploads[0]!.path)).toBe(false);
    expect(world.registerCalls).toBe(0);
    expect(world.state).toBe("valid"); // not consumed: the client can try again
  });

  it("rejects when the object was never uploaded", async () => {
    const { client, token, world, uploads } = await prepared();
    const r = await finalizeUpload(client, {
      token,
      clientKey: key,
      uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
    });
    expect(r).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
    expect(world.registerCalls).toBe(0);
  });

  it("is all-or-nothing: one bad file discards every uploaded file", async () => {
    const { client, token, world, uploads } = await prepared([
      file("a.jpg"),
      file("b.png", "image/png"),
    ]);
    world.objects.set(uploads[0]!.path, JPEG);
    world.objects.set(uploads[1]!.path, PDF);
    const r = await finalizeUpload(client, {
      token,
      clientKey: key,
      uploads: [
        { path: uploads[0]!.path, mime: "image/jpeg" },
        { path: uploads[1]!.path, mime: "image/png" },
      ],
    });
    expect(r).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
    expect(world.objects.size).toBe(0);
    expect(world.registered).toHaveLength(0);
  });

  it("rejects a real image declared with another type", async () => {
    const { client, token, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, PNG);
    expect(
      await finalizeUpload(client, {
        token,
        clientKey: key,
        uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
      }),
    ).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
  });

  it.each([
    [{ path: "../etc/passwd", mime: "image/jpeg" }],
    [{ path: "r/not-a-uuid.jpg", mime: "image/jpeg" }],
    [{ path: "r/00000000-0000-4000-8000-000000000000.jpg", mime: "image/gif" }],
    [
      {
        path: "r/00000000-0000-4000-8000-000000000000.png",
        mime: "image/jpeg",
      },
    ],
  ])(
    "rejects a malformed upload entry %j without touching storage",
    async (entry) => {
      const { client, token, world } = makeWorld();
      world.objects.set("r/00000000-0000-4000-8000-000000000000.jpg", JPEG);
      const r = await finalizeUpload(client, {
        token,
        clientKey: key,
        uploads: [entry],
      });
      expect(r).toEqual({ ok: false, code: "INVALID_FILE" });
      expect(world.objects.size).toBe(1);
    },
  );

  it("rejects duplicate paths and too many files", async () => {
    const { client, token } = makeWorld();
    const p = "r/00000000-0000-4000-8000-000000000000.jpg";
    expect(
      await finalizeUpload(client, {
        token,
        clientKey: key,
        uploads: [
          { path: p, mime: "image/jpeg" },
          { path: p, mime: "image/jpeg" },
        ],
      }),
    ).toEqual({ ok: false, code: "INVALID_FILE" });
    const three = ["1", "2", "3"].map((n) => ({
      path: `r/0000000${n}-0000-4000-8000-000000000000.jpg`,
      mime: "image/jpeg",
    }));
    expect(
      await finalizeUpload(client, { token, clientKey: key, uploads: three }),
    ).toEqual({ ok: false, code: "INVALID_FILE" });
  });

  it("rejects an over-long reference", async () => {
    const { client, token, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, JPEG);
    const r = await finalizeUpload(client, {
      token,
      clientKey: key,
      uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
      reference: "x".repeat(61),
    });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(world.registerCalls).toBe(0);
  });

  it("refuses an unknown token and never registers", async () => {
    const { client, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, JPEG);
    const r = await finalizeUpload(client, {
      token: generateUploadToken(),
      clientKey: key,
      uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
    });
    expect(r).toEqual({ ok: false, code: "INVALID_LINK" });
    expect(world.registerCalls).toBe(0);
    expect(world.objects.has(uploads[0]!.path)).toBe(false); // orphan discarded
  });

  it("an expired link discards what was uploaded", async () => {
    const { client, token, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, JPEG);
    world.state = "expired";
    const r = await finalizeUpload(client, {
      token,
      clientKey: key,
      uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
    });
    expect(r).toEqual({ ok: false, code: "TOKEN_EXPIRED" });
    expect(world.objects.size).toBe(0);
  });

  it("never deletes an object that is already registered", async () => {
    const { client, token, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, JPEG);
    world.registered.push({
      path: uploads[0]!.path,
      mime: "image/jpeg",
      size: 10,
    });
    world.state = "expired";
    await finalizeUpload(client, {
      token,
      clientKey: key,
      uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
    });
    expect(world.objects.has(uploads[0]!.path)).toBe(true);
  });

  it("is rate limited", async () => {
    const { client, token, world, uploads } = await prepared();
    world.objects.set(uploads[0]!.path, JPEG);
    world.limitMax = 0;
    expect(
      await finalizeUpload(client, {
        token,
        clientKey: key,
        uploads: [{ path: uploads[0]!.path, mime: "image/jpeg" }],
      }),
    ).toEqual({ ok: false, code: "RATE_LIMITED" });
  });
});
