import { FetchError, safeFetchJson } from "@/server/safe-fetch";
import { SPOTIFY_PLANNED_SCOPES } from "./contract";

/**
 * Spotify Web API client (Authorization Code flow, server-side only).
 *
 * Used for ONE thing: a one-time read of the artists a person follows on
 * Spotify (plus their top artists), so they can be followed here. Tokens are
 * never stored — the access token lives only for the length of the import.
 *
 * Endpoints (re-verified 2026-10-15 against developer.spotify.com):
 *   GET /v1/me/following?type=artist  scope user-follow-read, cursor pages of ≤50
 *   GET /v1/me/top/artists            scope user-top-read, ≤50
 * Development Mode: the app owner needs Spotify Premium and at most 5 users
 * can authorise the app (added under User Management in the dashboard).
 */
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_HOST = "api.spotify.com";
const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

export const SPOTIFY_SCOPES = SPOTIFY_PLANNED_SCOPES.map((s) => s.scope);

export interface SpotifyOAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SpotifyArtistRef {
  spotifyId: string;
  name: string;
}

export function authorizationUrl(client: SpotifyOAuthClient, state: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", client.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", client.redirectUri);
  u.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  u.searchParams.set("state", state);
  u.searchParams.set("show_dialog", "true"); // let people pick the right Spotify account
  return u.toString();
}

export type SpotifyResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export async function exchangeCode(client: SpotifyOAuthClient, code: string): Promise<SpotifyResult<{ accessToken: string; scope: string }>> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: client.redirectUri }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, status: 0, error: "network error or timeout" };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 200 && typeof body.access_token === "string") {
    return { ok: true, value: { accessToken: body.access_token, scope: typeof body.scope === "string" ? body.scope : "" } };
  }
  return { ok: false, status: res.status, error: String(body.error ?? "token exchange failed") };
}

interface ArtistItem {
  id?: unknown;
  name?: unknown;
}

function toRef(a: ArtistItem): SpotifyArtistRef | null {
  if (typeof a.id !== "string" || !SPOTIFY_ID.test(a.id)) return null;
  if (typeof a.name !== "string" || !a.name.trim() || a.name.length > 200) return null;
  return { spotifyId: a.id, name: a.name.trim() };
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  return (await safeFetchJson(`https://${API_HOST}/v1/${path}`, {
    allowHosts: [API_HOST],
    headers: { authorization: `Bearer ${accessToken}` },
    timeoutMs: 10_000,
  })) as T;
}

/**
 * The artists this person follows (up to `maxFollowed`), then their top
 * artists, de-duplicated, followed first. A failure of the top-artists call
 * doesn't lose the followed list.
 */
export async function fetchSpotifyArtists(
  accessToken: string,
  { maxFollowed = 200 }: { maxFollowed?: number } = {},
): Promise<{ artists: SpotifyArtistRef[]; followedCount: number; topCount: number }> {
  const seen = new Set<string>();
  const artists: SpotifyArtistRef[] = [];
  const add = (a: ArtistItem) => {
    const ref = toRef(a);
    if (!ref || seen.has(ref.spotifyId)) return false;
    seen.add(ref.spotifyId);
    artists.push(ref);
    return true;
  };

  let followedCount = 0;
  let after: string | undefined;
  while (followedCount < maxFollowed) {
    const page = await apiGet<{ artists?: { items?: ArtistItem[]; cursors?: { after?: string | null }; next?: string | null } }>(
      `me/following?type=artist&limit=50${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      accessToken,
    );
    for (const item of page.artists?.items ?? []) if (followedCount < maxFollowed && add(item)) followedCount++;
    after = page.artists?.cursors?.after ?? undefined;
    if (!page.artists?.next || !after) break;
  }

  let topCount = 0;
  try {
    const top = await apiGet<{ items?: ArtistItem[] }>("me/top/artists?limit=50&time_range=medium_term", accessToken);
    for (const item of top.items ?? []) if (add(item)) topCount++;
  } catch (err) {
    if (!(err instanceof FetchError)) throw err; // optional extra; the followed list still counts
  }
  return { artists, followedCount, topCount };
}
