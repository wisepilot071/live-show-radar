/**
 * Browser-side fetch with a hard timeout, so no page can sit on a loading state
 * forever if the server or network stalls. Keeps any caller AbortSignal (used to
 * cancel on unmount / stale requests): whichever fires first aborts the request.
 * A timeout surfaces as a normal rejected fetch, which every caller already maps
 * to its error / retry state.
 */
export const DEFAULT_CLIENT_TIMEOUT_MS = 15_000;

export function clientFetch(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DEFAULT_CLIENT_TIMEOUT_MS): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? typeof AbortSignal.any === "function"
      ? AbortSignal.any([init.signal, timeout])
      : init.signal // very old browsers: keep the caller's cancellation, no timeout
    : timeout;
  return fetch(input, { ...init, signal });
}
