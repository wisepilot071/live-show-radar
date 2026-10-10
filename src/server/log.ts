/**
 * Structured server logging. One JSON line per event so Vercel's log
 * search can filter by `scope`/`category`. Values that look like secrets
 * are redacted, and payloads are truncated — never log tokens, keys,
 * cookies, or full provider responses.
 */
export type ErrorCategory =
  | "not_configured"
  | "database_unavailable"
  | "source_unavailable"
  | "source_rate_limited"
  | "source_bad_response"
  | "validation_failed"
  | "ai_unavailable"
  | "ai_invalid_output"
  | "ai_rate_limited"
  | "timeout"
  | "locked"
  | "rate_limited"
  | "internal";

const SECRET_KEYS = /key|token|secret|password|authorization|cookie|database_url|app_id/i;
const SECRET_VALUES = /(postgres(ql)?:\/\/[^\s]+)|(AIza[0-9A-Za-z_-]{20,})|(Bearer\s+[^\s]+)/g;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[depth]";
  if (typeof value === "string") return value.replace(SECRET_VALUES, "[redacted]").slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : scrub(v, depth + 1);
    return out;
  }
  return value;
}

function emit(level: "info" | "warn" | "error", scope: string, message: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, scope, message, ...(data ? (scrub(data) as object) : {}), at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (scope: string, message: string, data?: Record<string, unknown>) => emit("info", scope, message, data),
  warn: (scope: string, message: string, data?: Record<string, unknown>) => emit("warn", scope, message, data),
  error: (scope: string, message: string, data?: Record<string, unknown>) => emit("error", scope, message, data),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
