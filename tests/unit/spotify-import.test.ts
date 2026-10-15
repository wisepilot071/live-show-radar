import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mbGet = vi.fn();
const followArtist = vi.fn();
vi.mock("@/integrations/musicbrainz/client", async (orig) => ({
  ...(await orig<typeof import("@/integrations/musicbrainz/client")>()),
  mbGet: (...args: unknown[]) => mbGet(...args),
}));
vi.mock("@/server/repos/profile", () => ({ followArtist: (...args: unknown[]) => followArtist(...args) }));

import { MusicBrainzError } from "@/integrations/musicbrainz/client";
import { authorizationUrl, fetchSpotifyArtists } from "@/integrations/spotify/client";
import { getSpotifyAvailability } from "@/integrations/spotify/server";
import { importSpotifyArtists } from "@/server/spotify-import";

// Spotify ids are 22 base-62 characters.
const id = (n: number) => `TESTartist${String(n).padStart(12, "0")}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Spotify OAuth", () => {
  it("asks only for the two read scopes, with state and the exact redirect URI", () => {
    const u = new URL(authorizationUrl({ clientId: "TEST-client", clientSecret: "x", redirectUri: "https://example.test/api/integrations/spotify/callback" }, "TEST-state"));
    expect(u.origin + u.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(u.searchParams.get("scope")).toBe("user-follow-read user-top-read");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toBe("TEST-state");
    expect(u.searchParams.get("redirect_uri")).toBe("https://example.test/api/integrations/spotify/callback");
  });

  it("is unavailable without credentials (no fake connect button)", () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    expect(getSpotifyAvailability()).toEqual({ available: false, reason: "credentials_missing" });
    vi.unstubAllEnvs();
  });
});

describe("fetchSpotifyArtists", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows the cursor across pages, puts followed artists first, de-duplicates and skips malformed items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ artists: { items: [{ id: id(1), name: "TEST One" }, { id: "bad", name: "TEST Bad" }], cursors: { after: id(1) }, next: "more" } }))
      .mockResolvedValueOnce(json({ artists: { items: [{ id: id(2), name: "TEST Two" }], cursors: { after: null }, next: null } }))
      .mockResolvedValueOnce(json({ items: [{ id: id(2), name: "TEST Two" }, { id: id(3), name: "TEST Three" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchSpotifyArtists("TEST-token");
    expect(r.artists.map((a) => a.name)).toEqual(["TEST One", "TEST Two", "TEST Three"]);
    expect(r.followedCount).toBe(2);
    expect(r.topCount).toBe(1);
    expect(String(fetchMock.mock.calls[1]![0])).toContain(`after=${id(1)}`);
  });

  it("keeps the followed list when the top-artists call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(json({ artists: { items: [{ id: id(1), name: "TEST One" }], next: null } })).mockResolvedValueOnce(json({}, 403)),
    );
    const r = await fetchSpotifyArtists("TEST-token");
    expect(r.artists.map((a) => a.name)).toEqual(["TEST One"]);
  });
});

describe("importSpotifyArtists", () => {
  beforeEach(() => {
    mbGet.mockReset();
    followArtist.mockReset().mockImplementation(async (_u: string, sel: unknown) => sel);
  });

  it("follows by MusicBrainz id when MusicBrainz links the Spotify artist, otherwise by name", async () => {
    mbGet
      .mockResolvedValueOnce({ relations: [{ type: "free streaming", "target-type": "artist", artist: { id: "11111111-1111-4111-8111-111111111111", name: "TEST One" } }] })
      .mockRejectedValueOnce(new MusicBrainzError("not found", "source_bad_response"));
    const s = await importSpotifyArtists("TEST-user", [{ spotifyId: id(1), name: "TEST One" }, { spotifyId: id(2), name: "TEST Two" }], Date.now() + 60_000);
    expect(s).toMatchObject({ followed: 2, matchedOnMusicBrainz: 1, byName: 1, failed: 0, remaining: [] });
    expect(mbGet.mock.calls[0]![1]).toEqual({ resource: `https://open.spotify.com/artist/${id(1)}`, inc: "artist-rels" });
    const [first, second] = followArtist.mock.calls.map((c) => c[1]);
    expect(first).toMatchObject({ addedVia: "spotify", artist: { id: "mbid:11111111-1111-4111-8111-111111111111", origin: "musicbrainz" } });
    expect(second).toMatchObject({ addedVia: "spotify", artist: { name: "TEST Two", origin: "user_entered" } });
  });

  it("stops before the time budget and hands back what's left", async () => {
    const s = await importSpotifyArtists("TEST-user", [{ spotifyId: id(1), name: "TEST One" }], Date.now());
    expect(s.followed).toBe(0);
    expect(s.remaining).toHaveLength(1);
    expect(followArtist).not.toHaveBeenCalled();
  });

  it("counts a follow that fails without stopping the rest", async () => {
    mbGet.mockRejectedValue(new MusicBrainzError("not found", "source_bad_response"));
    followArtist.mockRejectedValueOnce(new Error("TEST db down"));
    const s = await importSpotifyArtists("TEST-user", [{ spotifyId: id(1), name: "TEST One" }, { spotifyId: id(2), name: "TEST Two" }], Date.now() + 60_000);
    expect(s).toMatchObject({ followed: 1, failed: 1 });
  });
});
