import { afterEach, describe, expect, it, vi } from "vitest";
import { clientFetch } from "@/lib/client-fetch";

/** A fetch that never answers until its signal aborts (simulates a stalled server). */
function hangingFetch() {
  return vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("clientFetch", () => {
  it("rejects when the server stalls past the timeout (no endless loading)", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    await expect(clientFetch("/api/x", {}, 50)).rejects.toMatchObject({ name: "TimeoutError" });
  });
  it("still cancels on the caller's own signal (navigate away)", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const c = new AbortController();
    const p = clientFetch("/api/x", { signal: c.signal }, 10_000);
    c.abort();
    await expect(p).rejects.toBeDefined();
    expect(c.signal.aborted).toBe(true);
  });
  it("passes through a normal response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
    expect(await (await clientFetch("/api/x")).text()).toBe("ok");
  });
});
