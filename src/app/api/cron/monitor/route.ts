import { getServerEnv } from "@/config/server-env";
import { isDatabaseConfigured } from "@/server/db";
import { fail, handle, ok } from "@/server/http";
import { bearerMatches, runMonitoringJob } from "@/server/monitoring";

// Vercel Hobby allows up to 300s; the job budgets ~180s for discovery.
export const maxDuration = 300;

/**
 * Vercel Cron entry point (see vercel.json). Vercel sends
 * "Authorization: Bearer $CRON_SECRET"; anything else gets 401, and the
 * route is disabled entirely when CRON_SECRET isn't configured.
 */
export const GET = handle("api/cron/monitor", async (req: Request) => {
  const secret = getServerEnv().cronSecret;
  if (!secret) return fail(503, "not_configured", "Scheduled monitoring is disabled (CRON_SECRET not set).");
  if (!bearerMatches(req.headers.get("authorization"), secret)) return fail(401, "unauthorized", "Not authorised.");
  if (!isDatabaseConfigured()) return fail(503, "not_configured", "Database not configured.");
  const result = await runMonitoringJob("schedule");
  return ok(result, { status: result.status === "failed" ? 500 : 200 });
});
