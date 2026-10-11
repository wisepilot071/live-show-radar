import { z } from "zod";
import { getServerEnv } from "@/config/server-env";
import { fail, handle, ok } from "@/server/http";
import { runDiscovery } from "@/server/ingest/pipeline";
import { bearerMatches, runMonitoringJob } from "@/server/monitoring";
import { runNotificationPipeline } from "@/server/notifications/process";

export const maxDuration = 300;

const body = z.object({
  artistList: z.enum(["bengaluru_discovery_test", "karan_watchlist_suggestions"]).optional(),
  artistIds: z.array(z.string().uuid()).min(1).max(20).optional(),
});

/**
 * Operator-triggered run. Bearer DISCOVERY_ADMIN_TOKEN.
 * - no body: the same monitoring job as the cron (followed artists + notifications)
 * - {"artistList":"bengaluru_discovery_test"}: real discovery for that curated
 *   list only (testing), then the normal notification pipeline — which alerts
 *   only people who actually follow a matched artist.
 * - {"artistIds":[…]}: re-check just these followed artists now (all sources), then notify.
 */
export const POST = handle("api/admin/discovery", async (req: Request) => {
  const token = getServerEnv().discoveryAdminToken;
  if (!token) return fail(503, "not_configured", "Admin discovery is disabled (DISCOVERY_ADMIN_TOKEN not set).");
  if (!bearerMatches(req.headers.get("authorization"), token)) return fail(401, "unauthorized", "Not authorised.");
  const raw = await req.text();
  let json: unknown = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return fail(400, "bad_request", "Body must be JSON.");
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return fail(400, "bad_request", "Unknown artistList or invalid artistIds.");
  if (parsed.data.artistIds) {
    const discovery = await runDiscovery({ trigger: "admin", artistIds: parsed.data.artistIds, timeBudgetMs: 240_000 });
    const notifications = await runNotificationPipeline();
    return ok({ artistIds: parsed.data.artistIds, discovery, notifications: notifications.acquired ? notifications.value : "locked" });
  }
  if (!parsed.data.artistList) return ok({ run: await runMonitoringJob("admin") });
  const discovery = await runDiscovery({ trigger: "admin", artistListKey: parsed.data.artistList, timeBudgetMs: 240_000 });
  const notifications = await runNotificationPipeline();
  return ok({ list: parsed.data.artistList, discovery, notifications: notifications.acquired ? notifications.value : "locked" });
});
