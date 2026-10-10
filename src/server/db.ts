import postgres from "postgres";
import { getServerEnv } from "@/config/server-env";

/**
 * Postgres client for Supabase's pooler (Supavisor).
 *
 * Pool settings depend on the pooler mode in DATABASE_URL:
 * - port 6543 (transaction mode) — for serverless (Vercel). Prepared
 *   statements are unsupported, and in testing (2026-10-11) more than one
 *   pipelined connection per process hung under concurrency, so it uses
 *   `prepare: false, max: 1`. Each serverless instance serves ~one request.
 * - port 5432 (session mode) — for local dev / long-running servers:
 *   prepared statements and a small pool (max 5) work and are faster.
 * One client per process, reused across requests and HMR.
 * All queries use tagged templates → parameterised, never string-built.
 */
export type Sql = postgres.Sql;

declare global {
  var __lsrSql: Sql | undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getServerEnv().databaseUrl);
}

export function getSql(): Sql {
  const url = getServerEnv().databaseUrl;
  if (!url) throw new DatabaseNotConfiguredError();
  if (!globalThis.__lsrSql) {
    const transactionMode = /:6543\//.test(url);
    globalThis.__lsrSql = postgres(url, {
      prepare: !transactionMode,
      max: transactionMode ? 1 : 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // Keep jsonb/timestamps as JS values; dates come back as Date.
      types: { bigint: postgres.BigInt },
      onnotice: () => {},
    });
  }
  return globalThis.__lsrSql;
}

/** Cheap liveness check used by the status endpoint. */
export async function pingDatabase(): Promise<{ ok: true } | { ok: false; reason: "not_configured" | "unreachable" }> {
  if (!isDatabaseConfigured()) return { ok: false, reason: "not_configured" };
  try {
    await getSql()`select 1`;
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
