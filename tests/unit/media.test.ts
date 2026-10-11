import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/media/videos/route";
import { CURATED_LIVE_VIDEOS } from "@/data/live-videos";

/** /api/media/videos with YouTube oEmbed mocked (no network in unit tests). */

afterEach(() => vi.unstubAllGlobals());

function stubOembed(byId: (id: string) => Response | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const watch = decodeURIComponent(String(input).split("url=")[1] ?? "");
      const id = new URL(watch).searchParams.get("v") ?? "";
      const r = byId(id);
      if (r instanceof Error) throw r;
      return r;
    }),
  );
}

async function videos() {
  const res = await GET();
  const body = (await res.json()) as { data: { videos: Array<{ id: string; status: string; title: string; thumbnailUrl: string }> } };
  return body.data.videos;
}

describe("curated live videos", () => {
  it("IDs are real-looking YouTube IDs, unique, and from a known performer", () => {
    const ids = CURATED_LIVE_VIDEOS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of CURATED_LIVE_VIDEOS) {
      expect(v.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(v.artist.length).toBeGreaterThan(0);
      expect(v.channel.length).toBeGreaterThan(0);
    }
  });
});

describe("GET /api/media/videos: runtime availability", () => {
  const [a, b, c, d] = CURATED_LIVE_VIDEOS.map((v) => v.id) as [string, string, string, string];

  it("embeddable → real oEmbed title + YouTube thumbnail; embedding off → link-out; removed → dropped; network error → unchecked", async () => {
    stubOembed((id) => {
      if (id === a)
        return Response.json({ title: "Title from YouTube", author_name: "Channel", thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` });
      if (id === b) return new Response("Unauthorized", { status: 401 });
      if (id === c) return new Response("Not Found", { status: 404 });
      if (id === d) return new Error("network down");
      return Response.json({ title: "ok", author_name: "x", thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` });
    });
    const list = await videos();
    const byId = new Map(list.map((v) => [v.id, v]));
    expect(byId.get(a)).toMatchObject({ status: "embeddable", title: "Title from YouTube" });
    expect(byId.get(b)?.status).toBe("embedding_disabled");
    expect(byId.has(c)).toBe(false);
    expect(byId.get(d)?.status).toBe("unchecked");
    expect(list).toHaveLength(CURATED_LIVE_VIDEOS.length - 1);
  });

  it("never trusts a non-YouTube thumbnail URL from the response", async () => {
    stubOembed(() => Response.json({ title: "t", author_name: "c", thumbnail_url: "https://evil.example/x.jpg" }));
    for (const v of await videos()) expect(v.thumbnailUrl).toMatch(/^https:\/\/i\.ytimg\.com\/vi\//);
  });

  it("YouTube completely unreachable → curated list still returned (unchecked), never a crash", async () => {
    stubOembed(() => new Error("offline"));
    const list = await videos();
    expect(list).toHaveLength(CURATED_LIVE_VIDEOS.length);
    expect(list.every((v) => v.status === "unchecked")).toBe(true);
  });
});
