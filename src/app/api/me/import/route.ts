import { z } from "zod";
import { migrateOnboardingState } from "@/features/onboarding/state";
import { fail, ok, readBody } from "@/server/http";
import { meRoute } from "@/server/me";
import { getProfile, importDraft } from "@/server/repos/profile";

/** One-time move of a browser draft into an EMPTY server profile. */
export const POST = meRoute("api/me/import", async (req, userId) => {
  const body = await readBody(req, z.object({ draft: z.unknown() }), 512_000);
  if (!body.ok) return body.response;
  const draft = migrateOnboardingState(body.value.draft);
  if (!draft) return fail(400, "bad_request", "That browser draft isn't readable.");
  const result = await importDraft(userId, draft);
  return ok({ ...result, profile: await getProfile(userId) });
});
