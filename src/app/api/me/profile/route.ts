import { ok } from "@/server/http";
import { initialOnboardingState } from "@/features/onboarding/state";
import { meReadRoute } from "@/server/me";
import { getProfile } from "@/server/repos/profile";

/** The caller's whole radar profile, in the client's OnboardingState shape. */
export const GET = meReadRoute("api/me/profile", async (_req, userId) =>
  ok({ profile: userId ? await getProfile(userId) : initialOnboardingState }),
);
