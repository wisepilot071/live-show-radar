import { ok } from "@/server/http";
import { meRoute } from "@/server/me";
import { deleteProfile } from "@/server/repos/profile";
import { clearSession } from "@/server/session";

/** "Reset everything": deletes the profile (cascades to artists, saved shows, prefs) and forgets the cookie. */
export const DELETE = meRoute("api/me", async (_req, userId) => {
  await deleteProfile(userId);
  await clearSession();
  return ok({ deleted: true });
});
