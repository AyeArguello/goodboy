/**
 * Receipt purge core. Imported by BOTH the `purge-payment-receipts` Edge
 * Function (Deno) and the Next.js app (the admin's manual run), so it has no
 * imports and no runtime-specific APIs: everything it needs is injected.
 *
 * Order of operations for each expired receipt (this is the whole contract):
 *   1. remove the object through the Storage API (never SQL on storage.objects)
 *   2. confirm the object is really gone
 *   3. only then mark the database row `deleted` (clearing path and metadata)
 * A failure at any step leaves the row untouched except for a counted,
 * traceable failed attempt; the next run retries, up to a limit. Every step
 * is idempotent, so running twice (cron + manual) is safe.
 */

export interface PurgeCandidate {
  id: string;
  path: string;
}

export interface PurgeRunRecord {
  source: PurgeSource;
  startedAt: string;
  candidates: number;
  deleted: number;
  failed: number;
  orphansRemoved: number;
  error: string | null;
}

export type PurgeSource = "cron" | "admin";

export interface PurgeDeps {
  listCandidates(limit: number, maxAttempts: number): Promise<PurgeCandidate[]>;
  removeObject(path: string): Promise<void>;
  objectExists(path: string): Promise<boolean>;
  markDeleted(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  sweepOrphans?(): Promise<number>;
  cleanupOperational?(): Promise<number>;
  recordRun?(run: PurgeRunRecord): Promise<void>;
}

export interface PurgeSummary extends PurgeRunRecord {
  operationalRemoved: number;
  failures: { id: string; error: string }[];
}

export const DEFAULT_PURGE_LIMIT = 50;
export const DEFAULT_MAX_ATTEMPTS = 5;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runPurge(
  deps: PurgeDeps,
  options: { source: PurgeSource; limit?: number; maxAttempts?: number },
): Promise<PurgeSummary> {
  const limit = options.limit ?? DEFAULT_PURGE_LIMIT;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const summary: PurgeSummary = {
    source: options.source,
    startedAt: new Date().toISOString(),
    candidates: 0,
    deleted: 0,
    failed: 0,
    orphansRemoved: 0,
    operationalRemoved: 0,
    error: null,
    failures: [],
  };
  const errors: string[] = [];

  try {
    const candidates = await deps.listCandidates(limit, maxAttempts);
    summary.candidates = candidates.length;

    for (const candidate of candidates) {
      try {
        await deps.removeObject(candidate.path);
        if (await deps.objectExists(candidate.path)) {
          throw new Error("el objeto sigue en Storage después de eliminarlo");
        }
        await deps.markDeleted(candidate.id);
        summary.deleted++;
      } catch (err) {
        const message = messageOf(err);
        summary.failed++;
        summary.failures.push({ id: candidate.id, error: message });
        try {
          await deps.markFailed(candidate.id, message);
        } catch (markErr) {
          errors.push(
            `no se pudo registrar el fallo de ${candidate.id}: ${messageOf(markErr)}`,
          );
        }
      }
    }
  } catch (err) {
    errors.push(`no se pudo listar vencidos: ${messageOf(err)}`);
  }

  if (deps.sweepOrphans) {
    try {
      summary.orphansRemoved = await deps.sweepOrphans();
    } catch (err) {
      errors.push(`barrido de huérfanos: ${messageOf(err)}`);
    }
  }
  if (deps.cleanupOperational) {
    try {
      summary.operationalRemoved = await deps.cleanupOperational();
    } catch (err) {
      errors.push(`limpieza operativa: ${messageOf(err)}`);
    }
  }

  summary.error = errors.length > 0 ? errors.join("; ").slice(0, 300) : null;

  if (deps.recordRun) {
    try {
      await deps.recordRun({
        source: summary.source,
        startedAt: summary.startedAt,
        candidates: summary.candidates,
        deleted: summary.deleted,
        failed: summary.failed,
        orphansRemoved: summary.orphansRemoved,
        error: summary.error,
      });
    } catch {
      // Recording the run must never hide the run's own result.
    }
  }
  return summary;
}

// ------------------------------------------------- Supabase-backed wiring

type RpcResult = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

export interface SupabaseLike {
  rpc(fn: string, args?: Record<string, unknown>): RpcResult;
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: string[],
      ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
  storage: {
    from(bucket: string): {
      remove(
        paths: string[],
      ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      exists(path: string): PromiseLike<{
        data: boolean | null;
        error: { message: string } | null;
      }>;
      list(
        path?: string,
        options?: { limit?: number; offset?: number },
      ): PromiseLike<{
        data: { name: string; created_at: string | null }[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export const RECEIPT_BUCKET_NAME = "payment-receipts";
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const LIST_PAGE = 1000;
const MAX_LIST_PAGES = 20;

async function rpc(
  client: SupabaseLike,
  fn: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

export function createSupabasePurgeDeps(
  client: SupabaseLike,
  options: { bucket?: string; now?: () => number } = {},
): PurgeDeps {
  const bucketName = options.bucket ?? RECEIPT_BUCKET_NAME;
  const now = options.now ?? (() => Date.now());
  const bucket = () => client.storage.from(bucketName);

  return {
    async listCandidates(limit, maxAttempts) {
      const data = await rpc(client, "purge_candidates", {
        p_limit: limit,
        p_max_attempts: maxAttempts,
      });
      return (
        (data as
          { cand_receipt_id: string; cand_storage_path: string }[] | null) ?? []
      ).map((row) => ({
        id: row.cand_receipt_id,
        path: row.cand_storage_path,
      }));
    },

    async removeObject(path) {
      const { error } = await bucket().remove([path]);
      if (error) throw new Error(`storage.remove: ${error.message}`);
    },

    async objectExists(path) {
      const { data, error } = await bucket().exists(path);
      if (error) throw new Error(`storage.exists: ${error.message}`);
      return data === true;
    },

    async markDeleted(id) {
      await rpc(client, "mark_receipt_deleted", { p_receipt_id: id });
    },

    async markFailed(id, error) {
      await rpc(client, "mark_receipt_deletion_failed", {
        p_receipt_id: id,
        p_error: error,
      });
    },

    /**
     * Removes objects that were uploaded but never registered (the client
     * abandoned the form, or finalize failed and its own cleanup also failed).
     * Only objects older than 24h, so an upload in progress is never touched.
     */
    async sweepOrphans() {
      let removed = 0;
      for (let page = 0; page < MAX_LIST_PAGES; page++) {
        const { data, error } = await bucket().list("r", {
          limit: LIST_PAGE,
          offset: page * LIST_PAGE,
        });
        if (error) throw new Error(`storage.list: ${error.message}`);
        const items = data ?? [];
        const old = items.filter(
          (item) =>
            item.created_at !== null &&
            now() - new Date(item.created_at).getTime() >= ORPHAN_MIN_AGE_MS,
        );
        if (old.length > 0) {
          const paths = old.map((item) => `r/${item.name}`);
          const { data: rows, error: selectError } = await client
            .from("payment_receipts")
            .select("storage_path")
            .in("storage_path", paths);
          if (selectError)
            throw new Error(`payment_receipts: ${selectError.message}`);
          const registered = new Set(
            ((rows as { storage_path: string }[] | null) ?? []).map(
              (r) => r.storage_path,
            ),
          );
          const orphans = paths.filter((p) => !registered.has(p));
          if (orphans.length > 0) {
            const { error: removeError } = await bucket().remove(orphans);
            if (removeError)
              throw new Error(`storage.remove: ${removeError.message}`);
            removed += orphans.length;
          }
        }
        if (items.length < LIST_PAGE) break;
      }
      return removed;
    },

    async cleanupOperational() {
      const data = await rpc(client, "purge_operational_records", {});
      return typeof data === "number" ? data : 0;
    },

    async recordRun(run) {
      await rpc(client, "record_purge_run", {
        p_source: run.source,
        p_started_at: run.startedAt,
        p_candidates: run.candidates,
        p_deleted: run.deleted,
        p_failed: run.failed,
        p_orphans: run.orphansRemoved,
        p_error: run.error,
      });
    },
  };
}
