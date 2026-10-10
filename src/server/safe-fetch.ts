/**
 * Outbound HTTP for source adapters.
 * - Only https, only to hosts on an explicit allowlist (SSRF guard: no
 *   user- or source-supplied URL is ever fetched through this).
 * - Redirects are not followed automatically; a redirect to another host
 *   is refused.
 * - Hard timeout and response-size cap.
 */
export class FetchError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "http" | "too_large" | "blocked" | "network",
    readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export async function safeFetchJson(
  url: string,
  opts: { allowHosts: string[]; headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number },
): Promise<unknown> {
  const { allowHosts, headers, timeoutMs = 10_000, maxBytes = 2_000_000 } = opts;
  let target = new URL(url);
  for (let hop = 0; hop < 3; hop++) {
    if (target.protocol !== "https:" || !allowHosts.includes(target.hostname)) {
      throw new FetchError(`Blocked request to ${target.hostname}`, "blocked");
    }
    let res: Response;
    try {
      res = await fetch(target, {
        headers: { Accept: "application/json", ...headers },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new FetchError(timedOut ? "Request timed out" : "Network error", timedOut ? "timeout" : "network");
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new FetchError("Redirect without location", "http", res.status);
      target = new URL(loc, target);
      continue;
    }
    if (!res.ok) throw new FetchError(`HTTP ${res.status}`, "http", res.status);
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) throw new FetchError("Response too large", "too_large");
    const text = await res.text();
    if (text.length > maxBytes) throw new FetchError("Response too large", "too_large");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new FetchError("Response was not JSON", "http", res.status);
    }
  }
  throw new FetchError("Too many redirects", "blocked");
}

/** Accepts only absolute http(s) URLs for storing/rendering as links. Never fetched. */
export function sanitizeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return undefined;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
