import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { z } from "zod";
import type { LiveEvent } from "@/domain/types";
import { DatabaseNotConfiguredError } from "@/server/db";
import { handle, readBody } from "@/server/http";
import { bearerMatches } from "@/server/monitoring";
import { decide } from "@/server/notifications/decide";

/** Journey H: failures are reported honestly and never become a false success. */

async function body(res: Response) {
  return (await res.json()) as { ok: boolean; error?: { code: string; message: string } };
}

describe("API error handling", () => {
  it("missing database configuration → 503 not_configured", async () => {
    const res = await handle("test", async () => {
      throw new DatabaseNotConfiguredError();
    })();
    expect(res.status).toBe(503);
    expect((await body(res)).error?.code).toBe("not_configured");
  });

  it("an unreachable database → 503 database_unavailable, and nothing claims success", async () => {
    // A real connection attempt to a closed local port.
    const sql = postgres("postgres://nobody:nothing@127.0.0.1:1/none", { connect_timeout: 3, max: 1, onnotice: () => {} });
    const res = await handle("test", async () => {
      await sql`select 1`;
      return new Response("should not happen");
    })();
    await sql.end({ timeout: 1 }).catch(() => {});
    expect(res.status).toBe(503);
    const b = await body(res);
    expect(b.ok).toBe(false);
    expect(b.error?.code).toBe("database_unavailable");
    expect(b.error?.message).toContain("Nothing was changed");
  }, 15_000);

  it("unexpected errors → generic 500 without leaking internals", async () => {
    const res = await handle("test", async () => {
      throw new Error("secret internal detail at /srv/app.ts:42");
    })();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await body(res))).not.toContain("secret internal detail");
  });

  it("malformed or oversized request bodies are rejected", async () => {
    const schema = z.object({ name: z.string() });
    const bad = await readBody(new Request("http://x", { method: "POST", body: "{not json" }), schema);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.response.status).toBe(400);
    const big = await readBody(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "x".repeat(200) }) }), schema, 50);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.response.status).toBe(413);
    const wrong = await readBody(new Request("http://x", { method: "POST", body: JSON.stringify({ name: 5 }) }), schema);
    expect(wrong.ok).toBe(false);
  });
});

describe("scheduled-job authorisation", () => {
  it("requires the exact bearer secret; an unset secret disables the job", () => {
    expect(bearerMatches("Bearer s3cret-value", "s3cret-value")).toBe(true);
    expect(bearerMatches("Bearer wrong", "s3cret-value")).toBe(false);
    expect(bearerMatches(null, "s3cret-value")).toBe(false);
    expect(bearerMatches("Bearer ", undefined)).toBe(false);
    expect(bearerMatches("Bearer anything", "")).toBe(false);
  });
});

describe("cancellation and rescheduling alerts", () => {
  const ev: LiveEvent = {
    id: "TEST-EVT",
    artistIds: ["test:a"],
    artistNames: ["TEST Fixture Band"],
    title: "TEST show",
    kind: "concert",
    venueName: "TEST Hall",
    cityName: "Bengaluru",
    cityId: "bengaluru",
    countryCode: "IN",
    when: { date: "2027-02-13", startsAt: "2027-02-13T14:00:00.000Z", timeZone: "Asia/Kolkata" },
    ticket: { kind: "unknown", verification: { state: "unavailable" } },
    source: { id: "test", name: "TEST source", origin: "event_source" },
    verification: { state: "confirmed" },
    origin: "event_source",
  };
  const base = {
    event: ev,
    sourceClass: "listing" as const,
    sourceName: "TEST source",
    now: new Date("2026-11-05T06:30:00Z"),
    user: {
      triggers: {},
      location: { primaryCityId: "bengaluru", additionalCityIds: [], includeNationwide: true },
      followsArtist: true,
      savedEvent: true,
      mutedEvent: false,
    },
  };

  it("a cancellation of a saved show is one high-priority alert with a stable dedupe key", () => {
    const d = decide({ ...base, kind: "cancelled" });
    expect(d.notify).toBe(true);
    if (!d.notify) return;
    expect(d.category).toBe("cancelled");
    expect(d.priority).toBe("high");
    expect(d.dedupeKey).toBe("cancel:TEST-EVT");
    const again = decide({ ...base, kind: "cancelled" });
    expect(again.notify && again.dedupeKey).toBe("cancel:TEST-EVT");
  });

  it("a rescheduled show produces an event-changed alert", () => {
    const d = decide({ ...base, kind: "rescheduled" });
    expect(d.notify).toBe(true);
    if (d.notify) expect(d.category).toBe("event_changed");
  });

  it("a cancellation reported only by a user's paste never alerts", () => {
    const d = decide({ ...base, kind: "cancelled", sourceClass: "user_submitted" });
    expect(d.notify).toBe(false);
  });
});
