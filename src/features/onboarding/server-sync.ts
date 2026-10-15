import { artistIdentityKey } from "@/domain/artist-identity";
import type { OnboardingAction, OnboardingState } from "./state";
import { clientFetch } from "@/lib/client-fetch";

/**
 * Maps reducer actions to the server API (server mode only). Each action
 * becomes zero or more requests; the provider runs them in order and rolls
 * back to the server's truth if any fails.
 */
export type ApiFailure = { code: string; message: string };
export type SyncResult = { ok: true } | { ok: false; error: ApiFailure };

async function call(method: string, url: string, body?: unknown): Promise<SyncResult> {
  let res: Response;
  try {
    res = await clientFetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: { code: "network", message: "Couldn't reach the server. Check your connection." } };
  }
  if (res.ok) return { ok: true };
  try {
    const json = (await res.json()) as { error?: ApiFailure };
    return { ok: false, error: json.error ?? { code: String(res.status), message: "The server couldn't save this." } };
  } catch {
    return { ok: false, error: { code: String(res.status), message: "The server couldn't save this." } };
  }
}

function preferencesBody(s: OnboardingState) {
  return {
    location: s.location,
    notifications: { triggers: s.notifications.triggers },
    channelRequests: s.channelRequests,
    method: s.method,
    spotify: s.spotify,
    completedAt: s.completedAt,
  };
}

const PREFERENCE_ACTIONS = new Set<OnboardingAction["type"]>([
  "choose_method",
  "fallback_to_manual",
  "set_spotify_status",
  "set_primary_city",
  "toggle_additional_city",
  "set_nationwide",
  "set_trigger",
  "set_channel_request",
  "complete",
]);

export async function syncAction(action: OnboardingAction, before: OnboardingState, after: OnboardingState): Promise<SyncResult> {
  if (PREFERENCE_ACTIONS.has(action.type)) return call("PUT", "/api/me/preferences", preferencesBody(after));

  switch (action.type) {
    case "toggle_artist": {
      // Server catalogue keys are artistIdentityKey values, so they line up exactly.
      const key = artistIdentityKey(action.artist);
      const wasSelected = before.selections.some((s) => artistIdentityKey(s.artist) === key);
      if (wasSelected) return call("DELETE", `/api/me/artists?key=${encodeURIComponent(key)}`);
      const sel = after.selections.find((s) => artistIdentityKey(s.artist) === key);
      return sel ? call("POST", "/api/me/artists", sel) : { ok: true };
    }
    case "replace_artist": {
      const key = artistIdentityKey(action.artist);
      const sel = after.selections.find((s) => artistIdentityKey(s.artist) === key);
      return sel
        ? call("POST", "/api/me/artists/replace", { fromKey: action.identityKey, selection: sel })
        : call("DELETE", `/api/me/artists?key=${encodeURIComponent(action.identityKey)}`);
    }
    case "remove_artist":
      return call("DELETE", `/api/me/artists?key=${encodeURIComponent(action.identityKey)}`);
    case "clear_artists":
      return call("DELETE", "/api/me/artists?all=1");
    case "import_artists": {
      // Six at a time: follows are independent and idempotent, and sending 46 one by
      // one took ~12s — long enough for someone to navigate away mid-save.
      for (let i = 0; i < action.selections.length; i += 6) {
        const results = await Promise.all(action.selections.slice(i, i + 6).map((sel) => call("POST", "/api/me/artists", sel)));
        const failed = results.find((r) => !r.ok);
        if (failed) return failed;
      }
      return { ok: true };
    }
    case "save_event":
      return call("POST", "/api/me/saved", { eventId: action.event.id, savedAt: action.at });
    case "restore_saved_event":
      return call("POST", "/api/me/saved", { eventId: action.saved.eventId, savedAt: action.saved.savedAt });
    case "unsave_event":
      return call("DELETE", `/api/me/saved?eventId=${encodeURIComponent(action.eventId)}`);
    case "reset":
      return call("DELETE", "/api/me");
    default:
      return { ok: true };
  }
}

export type ProfileFetch =
  | { kind: "server"; profile: OnboardingState }
  | { kind: "not_configured" }
  | { kind: "error"; message: string };

export async function fetchServerProfile(): Promise<ProfileFetch> {
  try {
    const res = await clientFetch("/api/me/profile", { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; data?: { profile: OnboardingState }; error?: ApiFailure };
    if (res.ok && json.ok && json.data) return { kind: "server", profile: json.data.profile };
    if (res.status === 503 && json.error?.code === "not_configured") return { kind: "not_configured" };
    return { kind: "error", message: json.error?.message ?? "Couldn't load your profile." };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

export async function importDraftToServer(draft: OnboardingState): Promise<OnboardingState | null> {
  try {
    const res = await clientFetch("/api/me/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    });
    const json = (await res.json()) as { ok: boolean; data?: { profile: OnboardingState; imported: boolean } };
    return res.ok && json.ok && json.data ? json.data.profile : null;
  } catch {
    return null;
  }
}

/**
 * Artists followed in this browser while the server was unreachable, but not yet on
 * the server profile: follow them there (idempotent, 6 at a time). True only when
 * every one was saved, so the browser copy can be dropped safely.
 */
export async function pushMissingSelections(local: OnboardingState, server: OnboardingState): Promise<boolean> {
  const have = new Set(server.selections.map((s) => artistIdentityKey(s.artist)));
  const missing = local.selections.filter((s) => !have.has(artistIdentityKey(s.artist)));
  let allOk = true;
  for (let i = 0; i < missing.length; i += 6) {
    const results = await Promise.all(
      missing.slice(i, i + 6).map(async (s) => {
        try {
          const res = await clientFetch("/api/me/artists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ artist: s.artist, addedVia: s.addedVia, selectedAt: s.selectedAt }),
          });
          return res.ok;
        } catch {
          return false;
        }
      }),
    );
    if (results.includes(false)) allOk = false;
  }
  return allOk;
}
