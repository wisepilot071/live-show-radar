import { buildDiscoveryReport } from "@/server/discovery-report";
import { rateLimit } from "@/server/guards";
import { fail, ok } from "@/server/http";
import { runDiscovery } from "@/server/ingest/pipeline";
import { log, errorMessage } from "@/server/log";
import { runNotificationPipeline } from "@/server/notifications/process";
import { meRoute } from "@/server/me";

export const maxDuration = 60;

/**
 * User-triggered "Check now" for the caller's own artists.
 * Guarded: 4 runs/hour per profile, one run at a time (job lock), and the
 * pipeline itself caps artists per source and total time per run.
 */
export const POST = meRoute("api/me/discovery", async (_req, userId) => {
  const limit = await rateLimit(`discovery:user:${userId}`, 4, 3600);
  if (!limit.allowed) {
    return fail(429, "rate_limited", `You've checked recently. Try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} min.`, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }
  const result = await runDiscovery({ trigger: "user", userId });
  if (result.status === "locked") return fail(409, "locked", "A check is already running for your radar.");
  // Turn any changes this check found into alerts right away (idempotent; skipped if another run holds the lock).
  try {
    await runNotificationPipeline();
  } catch (err) {
    log.error("api/me/discovery", "notification processing failed", { error: errorMessage(err) });
  }
  return ok({ run: result, report: await buildDiscoveryReport(userId) });
});
