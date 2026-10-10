import { getServerEnv } from "@/config/server-env";
import { FetchError, safeFetchJson } from "@/server/safe-fetch";

/**
 * MusicBrainz Web Service v2 client.
 * Policy (musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting):
 *   - at most 1 request/second per client → serialised queue below
 *   - a meaningful User-Agent with contact info (MUSICBRAINZ_CONTACT)
 *   - 503 means "slow down" → bounded retries with backoff
 * Data is CC0 / CC BY-NC-SA; we store only the fields we use, with a link back.
 */
const HOST = "musicbrainz.org";
const MIN_GAP_MS = 1100;
const MAX_RETRIES = 2;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function userAgent(): string {
  const contact = getServerEnv().musicbrainz.contact ?? "contact-not-configured";
  return `LiveShowRadar/0.3 ( ${contact} )`;
}

export class MusicBrainzError extends Error {
  constructor(
    message: string,
    readonly category: "source_unavailable" | "source_rate_limited" | "source_bad_response" | "timeout",
  ) {
    super(message);
    this.name = "MusicBrainzError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET /ws/2/<path>?<params>&fmt=json, throttled and retried. */
export function mbGet<T>(path: string, params: Record<string, string>, opts: { deadline?: number } = {}): Promise<T> {
  const run = async (): Promise<T> => {
    const url = new URL(`https://${HOST}/ws/2/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("fmt", "json");

    for (let attempt = 0; ; attempt++) {
      const wait = lastRequestAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      if (opts.deadline && Date.now() > opts.deadline) {
        throw new MusicBrainzError("Time budget exhausted before request", "timeout");
      }
      lastRequestAt = Date.now();
      try {
        return (await safeFetchJson(url.toString(), {
          allowHosts: [HOST],
          headers: { "User-Agent": userAgent() },
          timeoutMs: 8000,
        })) as T;
      } catch (err) {
        if (err instanceof FetchError && err.kind === "http" && err.status === 503 && attempt < MAX_RETRIES) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        if (err instanceof FetchError) {
          if (err.kind === "timeout") throw new MusicBrainzError("MusicBrainz timed out", "timeout");
          if (err.status === 503) throw new MusicBrainzError("MusicBrainz is busy (rate limited)", "source_rate_limited");
          if (err.kind === "http" && err.status && err.status < 500) {
            throw new MusicBrainzError(`MusicBrainz rejected the request (HTTP ${err.status})`, "source_bad_response");
          }
        }
        throw new MusicBrainzError("MusicBrainz is unavailable", "source_unavailable");
      }
    }
  };
  // Serialise through one queue so concurrent callers share the 1 rps budget.
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** Escapes Lucene query syntax so user input can't change the query. */
export function luceneEscape(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

/* ---- Response shapes (only fields we read) ---- */

export interface MbArtist {
  id: string;
  name: string;
  "sort-name"?: string;
  disambiguation?: string;
  country?: string;
  type?: string;
  score?: number;
  aliases?: Array<{ name: string }>;
  area?: { name?: string };
  tags?: Array<{ name: string; count: number }>;
}

export interface MbPlace {
  id: string;
  name: string;
  address?: string;
  coordinates?: { latitude: number | string; longitude: number | string };
  area?: { id: string; name: string; type?: string };
}

export interface MbRelation {
  type: string;
  "target-type"?: string;
  artist?: { id: string; name: string };
  place?: MbPlace;
  url?: { resource: string };
}

export interface MbEvent {
  id: string;
  name: string;
  type?: string;
  cancelled?: boolean;
  time?: string;
  disambiguation?: string;
  "life-span"?: { begin?: string; end?: string };
  relations?: MbRelation[];
}
