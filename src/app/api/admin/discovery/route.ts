import { getServerEnv } from "@/config/server-env";
import { fail, handle, ok } from "@/server/http";
import { bearerMatches, runMonitoringJob } from "@/server/monitoring";

export const maxDuration = 300;

/** Operator-triggered monitoring run (same job as the cron). Bearer DISCOVERY_ADMIN_TOKEN. */
export const POST = handle("api/admin/discovery", async (req: Request) => {
  const token = getServerEnv().discoveryAdminToken;
  if (!token) return fail(503, "not_configured", "Admin discovery is disabled (DISCOVERY_ADMIN_TOKEN not set).");
  if (!bearerMatches(req.headers.get("authorization"), token)) return fail(401, "unauthorized", "Not authorised.");
  return ok({ run: await runMonitoringJob("admin") });
});
