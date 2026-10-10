import { NextResponse } from "next/server";
import type { z } from "zod";
import { DatabaseNotConfiguredError } from "./db";
import { log, errorMessage, type ErrorCategory } from "./log";

/**
 * One response shape for every API route:
 *   success → { ok: true, data }
 *   failure → { ok: false, error: { code, message } }
 * Messages are safe to show users; internals stay in server logs.
 */
export type ApiError = { code: ErrorCategory | "bad_request" | "not_found" | "unauthorized" | "conflict"; message: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResult<T>>(
    { ok: true, data },
    { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } },
  );
}

export function fail(status: number, code: ApiError["code"], message: string, headers?: HeadersInit) {
  return NextResponse.json<ApiResult<never>>(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", ...(headers ?? {}) } },
  );
}

/** Parses JSON with a size cap and validates with zod. Returns a response on failure. */
export async function readBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 64_000,
): Promise<{ ok: true; value: z.infer<S> } | { ok: false; response: NextResponse }> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) return { ok: false, response: fail(413, "bad_request", "Request is too large.") };
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: fail(400, "bad_request", "Couldn't read the request body.") };
  }
  if (raw.length > maxBytes) return { ok: false, response: fail(413, "bad_request", "Request is too large.") };
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, response: fail(400, "bad_request", "Request body must be JSON.") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      response: fail(400, "bad_request", `Invalid request${first ? `: ${first.path.join(".") || "body"} — ${first.message}` : "."}`),
    };
  }
  return { ok: true, value: parsed.data };
}

/** Wraps a handler so unexpected errors become a safe 500/503, never a stack trace. */
export function handle<A extends unknown[]>(scope: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof DatabaseNotConfiguredError) {
        return fail(503, "not_configured", "The database isn't configured, so this can't be saved on the server.");
      }
      const message = errorMessage(err);
      const dbDown = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connect|terminat|Connection/i.test(message);
      log.error(scope, "unhandled error", { error: message, category: dbDown ? "database_unavailable" : "internal" });
      return dbDown
        ? fail(503, "database_unavailable", "The database is unavailable right now. Nothing was changed — try again shortly.")
        : fail(500, "internal", "Something went wrong on our side. Nothing was changed.");
    }
  };
}
