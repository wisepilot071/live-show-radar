/**
 * Source adapters and the Gemini client with MOCKED providers (no network).
 * All payloads are TEST fixtures shaped like the documented APIs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mbGet = vi.fn();
vi.mock("@/integrations/musicbrainz/client", async (orig) => ({
  ...(await orig<typeof import("@/integrations/musicbrainz/client")>()),
  mbGet: (...args: unknown[]) => mbGet(...args),
}));

const safeFetchJson = vi.fn();
vi.mock("@/server/safe-fetch", async (orig) => ({
  ...(await orig<typeof import("@/server/safe-fetch")>()),
  safeFetchJson: (...args: unknown[]) => safeFetchJson(...args),
}));

const generateContent = vi.fn();
vi.mock("@google/genai", async (orig) => {
  const real = await orig<typeof import("@google/genai")>();
  return {
    ...real,
    GoogleGenAI: class {
      private key: string;
      constructor(o: { apiKey: string }) {
        this.key = o.apiKey;
      }
      // The second argument records which API key served the call.
      models = { generateContent: (req: unknown) => generateContent(req, this.key) };
    },
  };
});

const { musicBrainzEvents } = await import("@/integrations/events/musicbrainz");
const { ticketmasterEvents } = await import("@/integrations/events/ticketmaster");
const { MusicBrainzError } = await import("@/integrations/musicbrainz/client");
const { FetchError } = await import("@/server/safe-fetch");
const { generateJson, GeminiError } = await import("@/integrations/gemini/client");
const { ApiError } = await import("@google/genai");

const ARTIST = { artistId: "TEST-A", name: "TEST Band", aliases: [], musicbrainzId: "00000000-0000-4000-8000-000000000001" };
const deadline = () => Date.now() + 10_000;

const mbEvent = (id: string, place: object, extra: object = {}) => ({
  id,
  name: `TEST event ${id}`,
  type: "Concert",
  cancelled: false,
  time: "19:30:00",
  "life-span": { begin: "2027-02-13" },
  relations: [
    { type: "main performer", artist: { id: ARTIST.musicbrainzId, name: "TEST Band" } },
    { type: "held at", place },
  ],
  ...extra,
});

beforeEach(() => {
  mbGet.mockReset();
  safeFetchJson.mockReset();
  generateContent.mockReset();
  process.env.GEMINI_API_KEY = "TEST-KEY";
  process.env.GEMINI_MODEL = "TEST-primary";
  process.env.GEMINI_FALLBACK_MODEL = "TEST-fallback";
  process.env.TICKETMASTER_API_KEY = "TEST-TM";
});

describe("MusicBrainz adapter", () => {
  it("keeps Indian events, drops foreign ones, and never claims ticket availability", async () => {
    mbGet
      .mockResolvedValueOnce({ events: [{ id: "IN" }, { id: "UK" }] })
      .mockResolvedValueOnce(mbEvent("IN", { name: "TEST Hall", area: { id: "a", name: "Bangalore" }, coordinates: { latitude: 12.97, longitude: 77.59 } }))
      .mockResolvedValueOnce(mbEvent("UK", { name: "TEST Arena", area: { id: "b", name: "London" }, coordinates: { latitude: 51.5, longitude: -0.12 } }));
    const out = await musicBrainzEvents.fetchForArtists([ARTIST], { deadline: deadline() });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.records.map((r) => r.sourceEventId)).toEqual(["IN"]);
    expect(out.records[0]).toMatchObject({ cityName: "Bengaluru", timeZone: "Asia/Kolkata", localTime: "19:30", ticket: { status: "unknown", sourceExposesAvailability: false } });
  });

  it("partial dates are not stored as dates; cancelled flag is preserved", async () => {
    mbGet
      .mockResolvedValueOnce({ events: [{ id: "P" }] })
      .mockResolvedValueOnce(mbEvent("P", { name: "TEST Hall", area: { id: "a", name: "Mumbai" } }, { "life-span": { begin: "2027-02" }, cancelled: true }));
    const out = await musicBrainzEvents.fetchForArtists([ARTIST], { deadline: deadline() });
    expect(out.ok && out.records[0]?.localDate).toBeUndefined();
    expect(out.ok && out.records[0]?.eventStatus).toBe("cancelled");
  });

  it("an outage is reported as a failure, not as an empty success", async () => {
    mbGet.mockRejectedValue(new MusicBrainzError("busy", "source_rate_limited"));
    const out = await musicBrainzEvents.fetchForArtists([ARTIST], { deadline: deadline() });
    expect(out).toMatchObject({ ok: false, category: "source_rate_limited" });
  });

  it("artists without an MBID are not looked up", () => {
    expect(musicBrainzEvents.canLookUp({ ...ARTIST, musicbrainzId: undefined })).toBe(false);
  });
});

describe("Ticketmaster adapter (mocked HTTP)", () => {
  const tmEvent = (status: string, attraction = "TEST Band") => ({
    id: `TM-${status}`,
    name: "TEST tour",
    url: "https://tickets.example.test/e",
    dates: { start: { localDate: "2027-02-13", localTime: "19:30:00" }, timezone: "Asia/Kolkata", status: { code: status } },
    _embedded: { venues: [{ name: "TEST Arena", city: { name: "Bengaluru" }, country: { countryCode: "IN" } }], attractions: [{ name: attraction }] },
  });

  it("maps statuses honestly: offsale is NOT treated as sold out", async () => {
    safeFetchJson.mockResolvedValue({ _embedded: { events: [tmEvent("onsale"), tmEvent("offsale"), tmEvent("cancelled")] } });
    const out = await ticketmasterEvents.fetchForArtists([ARTIST], { deadline: deadline() });
    if (!out.ok) throw new Error("expected ok");
    const byId = Object.fromEntries(out.records.map((r) => [r.sourceEventId, r]));
    expect(byId["TM-onsale"]?.ticket.status).toBe("on_sale");
    expect(byId["TM-offsale"]?.ticket.status).toBe("unknown");
    expect(byId["TM-cancelled"]?.eventStatus).toBe("cancelled");
  });

  it("discards keyword hits for other acts", async () => {
    safeFetchJson.mockResolvedValue({ _embedded: { events: [tmEvent("onsale", "TEST Band Tribute Night")] } });
    const out = await ticketmasterEvents.fetchForArtists([ARTIST], { deadline: deadline() });
    expect(out.ok && out.records).toEqual([]);
  });

  it("rate limiting and missing config are explicit", async () => {
    safeFetchJson.mockRejectedValue(new FetchError("HTTP 429", "http", 429));
    expect(await ticketmasterEvents.fetchForArtists([ARTIST], { deadline: deadline() })).toMatchObject({ ok: false, category: "source_rate_limited" });
    delete process.env.TICKETMASTER_API_KEY;
    expect(ticketmasterEvents.configStatus().configured).toBe(false);
  });
});

describe("Gemini client (mocked SDK)", () => {
  const opts = { systemInstruction: "TEST", userText: "TEST", jsonSchema: {} };

  it("retries transient errors, then falls back to the configured Gemini fallback model", async () => {
    generateContent.mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 }))
      .mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 }))
      .mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 }))
      .mockResolvedValueOnce({ text: '{"ok":true}' });
    const res = await generateJson(opts);
    expect(res).toEqual({ json: { ok: true }, model: "TEST-fallback" });
    const models = generateContent.mock.calls.map((c) => (c[0] as { model: string }).model);
    expect(models).toEqual(["TEST-primary", "TEST-primary", "TEST-primary", "TEST-fallback"]);
  }, 20_000);

  it("malformed output is an explicit invalid-output error (no retry into another provider)", async () => {
    generateContent.mockResolvedValue({ text: "not json" });
    await expect(generateJson(opts)).rejects.toMatchObject({ category: "ai_invalid_output" });
  });

  it("missing key → not_configured; non-transient 400 is not retried", async () => {
    delete process.env.GEMINI_API_KEY;
    // A cached client may exist from earlier tests; the config check happens per call in getClient.
    process.env.GEMINI_API_KEY = "";
    await expect(generateJson(opts)).rejects.toBeInstanceOf(GeminiError);
    process.env.GEMINI_API_KEY = "TEST-KEY";
    process.env.GEMINI_FALLBACK_MODEL = "";
    generateContent.mockRejectedValue(new ApiError({ message: "bad", status: 400 }));
    await expect(generateJson(opts)).rejects.toMatchObject({ category: "ai_unavailable" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("key failover: a rejected key (401) moves to the next key; a later call skips the rejected one", async () => {
    process.env.GEMINI_API_KEY = "TEST-KEY-A";
    process.env.GEMINI_API_KEYS = "TEST-KEY-B,TEST-KEY-C";
    process.env.GEMINI_FALLBACK_MODEL = "";
    generateContent
      .mockRejectedValueOnce(new ApiError({ message: "API key expired", status: 401 }))
      .mockResolvedValueOnce({ text: '{"ok":1}' })
      .mockResolvedValueOnce({ text: '{"ok":2}' });
    expect((await generateJson(opts)).json).toEqual({ ok: 1 });
    expect((await generateJson(opts)).json).toEqual({ ok: 2 });
    expect(generateContent.mock.calls.map((c) => c[1])).toEqual(["TEST-KEY-A", "TEST-KEY-B", "TEST-KEY-B"]);
  });

  it("rate limits (429) do NOT rotate keys; all keys rejected → explicit error", async () => {
    process.env.GEMINI_API_KEY = "TEST-KEY-D";
    process.env.GEMINI_API_KEYS = "TEST-KEY-E";
    process.env.GEMINI_FALLBACK_MODEL = "";
    generateContent.mockRejectedValue(new ApiError({ message: "quota", status: 429 }));
    await expect(generateJson(opts)).rejects.toMatchObject({ category: "ai_rate_limited" });
    expect(new Set(generateContent.mock.calls.map((c) => c[1]))).toEqual(new Set(["TEST-KEY-D"]));
    generateContent.mockReset();
    generateContent.mockRejectedValue(new ApiError({ message: "API_KEY_INVALID", status: 400 }));
    await expect(generateJson(opts)).rejects.toMatchObject({ category: "ai_unavailable", message: expect.stringContaining("Every configured") });
    expect(generateContent.mock.calls.map((c) => c[1])).toEqual(["TEST-KEY-D", "TEST-KEY-E"]);
    delete process.env.GEMINI_API_KEYS;
  }, 20_000);
});
