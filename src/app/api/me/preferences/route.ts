import { ok, readBody } from "@/server/http";
import { meRoute } from "@/server/me";
import { preferencesSchema, savePreferences } from "@/server/repos/profile";

export const PUT = meRoute("api/me/preferences", async (req, userId) => {
  const body = await readBody(req, preferencesSchema);
  if (!body.ok) return body.response;
  await savePreferences(userId, body.value);
  return ok({ saved: true });
});
