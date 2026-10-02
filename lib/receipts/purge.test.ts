import { describe, expect, it } from "vitest";
import {
  createSupabasePurgeDeps,
  runPurge,
  type PurgeDeps,
  type SupabaseLike,
} from "@/supabase/functions/_shared/purge";

interface Receipt {
  id: string;
  path: string;
  attempts: number;
  deleted: boolean;
  error: string | null;
}

/** In-memory world: receipts due for purge + the storage objects behind them. */
function world(paths: string[]) {
  const receipts: Receipt[] = paths.map((path, i) => ({
    id: `r${i + 1}`,
    path,
    attempts: 0,
    deleted: false,
    error: null,
  }));
  const objects = new Set(paths);
  const calls: string[] = [];
  const state = {
    removeFails: new Set<string>(),
    removeIsNoop: new Set<string>(),
    recordFails: false,
  };

  const deps: PurgeDeps = {
    async listCandidates(limit, maxAttempts) {
      calls.push(`list(${limit},${maxAttempts})`);
      return receipts
        .filter((r) => !r.deleted && r.attempts < maxAttempts)
        .slice(0, limit)
        .map((r) => ({ id: r.id, path: r.path }));
    },
    async removeObject(path) {
      calls.push(`remove:${path}`);
      if (state.removeFails.has(path)) throw new Error("storage 503");
      if (!state.removeIsNoop.has(path)) objects.delete(path);
    },
    async objectExists(path) {
      calls.push(`exists:${path}`);
      return objects.has(path);
    },
    async markDeleted(id) {
      calls.push(`markDeleted:${id}`);
      const r = receipts.find((x) => x.id === id)!;
      r.deleted = true;
    },
    async markFailed(id, error) {
      calls.push(`markFailed:${id}`);
      const r = receipts.find((x) => x.id === id)!;
      r.attempts++;
      r.error = error;
    },
    async recordRun() {
      calls.push("recordRun");
      if (state.recordFails) throw new Error("db down");
    },
  };
  return { receipts, objects, calls, state, deps };
}

describe("runPurge", () => {
  it("removes the object, confirms it is gone, and only then marks the row deleted", async () => {
    const w = world(["r/a.jpg"]);
    const s = await runPurge(w.deps, { source: "cron" });
    expect(s).toMatchObject({
      candidates: 1,
      deleted: 1,
      failed: 0,
      error: null,
    });
    expect(w.objects.size).toBe(0);
    expect(w.receipts[0]!.deleted).toBe(true);
    expect(
      w.calls.filter((c) => c !== "list(50,5)" && c !== "recordRun"),
    ).toEqual(["remove:r/a.jpg", "exists:r/a.jpg", "markDeleted:r1"]);
  });

  it("never marks a row deleted when Storage fails; it counts the attempt and keeps going", async () => {
    const w = world(["r/a.jpg", "r/b.jpg"]);
    w.state.removeFails.add("r/a.jpg");
    const s = await runPurge(w.deps, { source: "cron" });
    expect(s).toMatchObject({ candidates: 2, deleted: 1, failed: 1 });
    expect(w.receipts[0]).toMatchObject({
      deleted: false,
      attempts: 1,
      error: "storage 503",
    });
    expect(w.receipts[1]!.deleted).toBe(true);
    expect(w.calls).not.toContain("markDeleted:r1");
    expect(s.failures).toEqual([{ id: "r1", error: "storage 503" }]);
  });

  it("treats a removal that did not really remove the object as a failure", async () => {
    const w = world(["r/a.jpg"]);
    w.state.removeIsNoop.add("r/a.jpg");
    const s = await runPurge(w.deps, { source: "cron" });
    expect(s.failed).toBe(1);
    expect(w.receipts[0]!.deleted).toBe(false);
    expect(w.receipts[0]!.error).toContain("sigue en Storage");
  });

  it("retries a failed deletion on the next run and stops after the attempt limit", async () => {
    const w = world(["r/a.jpg"]);
    w.state.removeFails.add("r/a.jpg");
    await runPurge(w.deps, { source: "cron", maxAttempts: 3 });
    await runPurge(w.deps, { source: "cron", maxAttempts: 3 });
    expect(w.receipts[0]!.attempts).toBe(2);

    w.state.removeFails.clear(); // Storage recovers
    const s = await runPurge(w.deps, { source: "cron", maxAttempts: 3 });
    expect(s.deleted).toBe(1);
    expect(w.receipts[0]!.deleted).toBe(true);

    const exhausted = world(["r/z.jpg"]);
    exhausted.state.removeFails.add("r/z.jpg");
    for (let i = 0; i < 5; i++)
      await runPurge(exhausted.deps, { source: "cron", maxAttempts: 3 });
    expect(exhausted.receipts[0]!.attempts).toBe(3); // no more attempts once the limit is hit
  });

  it("is idempotent: a second run has nothing to do", async () => {
    const w = world(["r/a.jpg", "r/b.jpg"]);
    await runPurge(w.deps, { source: "cron" });
    const again = await runPurge(w.deps, { source: "admin" });
    expect(again).toMatchObject({ candidates: 0, deleted: 0, failed: 0 });
  });

  it("an already-missing object (previous run died before marking) is still marked deleted", async () => {
    const w = world(["r/a.jpg"]);
    w.objects.delete("r/a.jpg");
    const s = await runPurge(w.deps, { source: "cron" });
    expect(s.deleted).toBe(1);
  });

  it("forwards the batch limit and attempt cap", async () => {
    const w = world([]);
    await runPurge(w.deps, { source: "cron", limit: 7, maxAttempts: 2 });
    expect(w.calls).toContain("list(7,2)");
  });

  it("reports listing and housekeeping errors without throwing, and still records the run", async () => {
    const w = world(["r/a.jpg"]);
    w.deps.listCandidates = async () => {
      throw new Error("rpc caído");
    };
    w.deps.sweepOrphans = async () => {
      throw new Error("list falló");
    };
    w.deps.cleanupOperational = async () => 4;
    const s = await runPurge(w.deps, { source: "cron" });
    expect(s.error).toContain("no se pudo listar vencidos: rpc caído");
    expect(s.error).toContain("barrido de huérfanos: list falló");
    expect(s.operationalRemoved).toBe(4);
    expect(w.calls).toContain("recordRun");
  });

  it("a failure while recording the run never hides the result", async () => {
    const w = world(["r/a.jpg"]);
    w.state.recordFails = true;
    await expect(runPurge(w.deps, { source: "cron" })).resolves.toMatchObject({
      deleted: 1,
    });
  });
});

// ------------------------------------------------------------------------
describe("createSupabasePurgeDeps", () => {
  const OLD = new Date("2026-01-01T00:00:00Z").toISOString();
  const NOW = new Date("2026-01-03T00:00:00Z").getTime();
  const FRESH = new Date(NOW - 3_600_000).toISOString();

  function fakeSupabase(
    over: {
      listed?: { name: string; created_at: string | null }[];
      registered?: string[];
    } = {},
  ) {
    const removed: string[] = [];
    const rpcCalls: [string, Record<string, unknown> | undefined][] = [];
    const objects = new Set<string>(["r/x.jpg"]);
    const client: SupabaseLike = {
      rpc: async (fn, args) => {
        rpcCalls.push([fn, args]);
        if (fn === "purge_candidates")
          return {
            data: [{ cand_receipt_id: "id1", cand_storage_path: "r/x.jpg" }],
            error: null,
          };
        if (fn === "purge_operational_records") return { data: 3, error: null };
        return { data: null, error: null };
      },
      from: () => ({
        select: () => ({
          in: async (_c: string, values: string[]) => ({
            data: values
              .filter((v) => (over.registered ?? []).includes(v))
              .map((v) => ({ storage_path: v })),
            error: null,
          }),
        }),
      }),
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            removed.push(...paths);
            paths.forEach((p) => objects.delete(p));
            return { data: [], error: null };
          },
          list: async (dir?: string, opts?: { search?: string }) => ({
            data: opts?.search
              ? [...objects]
                  .filter((p) => p === `${dir}/${opts.search}`)
                  .map(() => ({ name: opts.search!, created_at: null }))
              : (over.listed ?? []),
            error: null,
          }),
        }),
      },
    };
    return { client, removed, rpcCalls, objects };
  }

  it("maps candidates and uses only the Storage API plus the database functions", async () => {
    const f = fakeSupabase();
    const deps = createSupabasePurgeDeps(f.client);
    expect(await deps.listCandidates(10, 5)).toEqual([
      { id: "id1", path: "r/x.jpg" },
    ]);
    await deps.removeObject("r/x.jpg");
    expect(f.removed).toEqual(["r/x.jpg"]);
    expect(await deps.objectExists("r/x.jpg")).toBe(false);
    await deps.markDeleted("id1");
    await deps.markFailed("id1", "boom");
    expect(f.rpcCalls.map(([fn]) => fn)).toEqual([
      "purge_candidates",
      "mark_receipt_deleted",
      "mark_receipt_deletion_failed",
    ]);
    expect(f.rpcCalls.some(([fn]) => /storage\.objects/i.test(fn))).toBe(false);
  });

  it("orphan sweep removes only old, unregistered objects", async () => {
    const f = fakeSupabase({
      listed: [
        { name: "old-orphan.jpg", created_at: OLD },
        { name: "old-registered.jpg", created_at: OLD },
        { name: "fresh-upload.jpg", created_at: FRESH },
        { name: "no-date.jpg", created_at: null },
      ],
      registered: ["r/old-registered.jpg"],
    });
    const deps = createSupabasePurgeDeps(f.client, { now: () => NOW });
    expect(await deps.sweepOrphans!()).toBe(1);
    expect(f.removed).toEqual(["r/old-orphan.jpg"]);
  });

  it("cleanup and run recording go through service-only functions", async () => {
    const f = fakeSupabase();
    const deps = createSupabasePurgeDeps(f.client);
    expect(await deps.cleanupOperational!()).toBe(3);
    await deps.recordRun!({
      source: "admin",
      startedAt: "t",
      candidates: 2,
      deleted: 1,
      failed: 1,
      orphansRemoved: 0,
      error: null,
    });
    expect(f.rpcCalls.map(([fn]) => fn)).toEqual([
      "purge_operational_records",
      "record_purge_run",
    ]);
  });
});
