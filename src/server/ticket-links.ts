import { GeminiError } from "@/integrations/gemini/client";
import { findTicketPage } from "@/integrations/gemini/ticket-search";
import { getSql } from "./db";
import { errorMessage, log } from "./log";

/**
 * Fills in ticket links the sources didn't give: for upcoming Indian shows
 * with no link, one web search each (see ticket-search.ts for the strict
 * rules on which result is accepted). Results — including "nothing found" —
 * are kept in radar.event_ticket_links, so a show is searched again at most
 * every RECHECK_DAYS and a found link survives later re-ingests.
 * Shows known only from someone's private pasted announcement are skipped.
 */
const RECHECK_DAYS = 3;
const LOOKAHEAD_DAYS = 180;
/** Per run: each search takes ~10 s, and the free Gemini quota is shared with extraction. */
export const TICKET_LINK_SEARCHES_PER_RUN = 6;

export interface TicketLinkSummary {
  searched: number;
  found: number;
  failed: number;
}

export async function findMissingTicketLinks({ deadline, max = TICKET_LINK_SEARCHES_PER_RUN }: { deadline: number; max?: number }): Promise<TicketLinkSummary> {
  const sql = getSql();
  const due = await sql<{ id: string; artist_name: string; city_id: string; city_name: string; local_date: Date }[]>`
    select e.id, a.name as artist_name, e.city_id, e.city_name, e.local_date
    from radar.events e
    join lateral (
      select ar.name from radar.event_artists ea join radar.artists ar on ar.id = ea.artist_id
      where ea.event_id = e.id order by ea.billing_order limit 1
    ) a on true
    left join radar.event_ticket_links tl on tl.event_id = e.id
    where e.country_code = 'IN' and e.city_id is not null and e.event_status = 'scheduled'
      and e.ticket_url is null
      and e.local_date between current_date and current_date + ${LOOKAHEAD_DAYS}::int
      and exists (select 1 from radar.event_sources es where es.event_id = e.id and es.source_id <> 'announcement')
      and (tl.event_id is null or (tl.url is null and tl.checked_at < now() - make_interval(days => ${RECHECK_DAYS})))
    order by e.local_date
    limit ${max}`;

  const summary: TicketLinkSummary = { searched: 0, found: 0, failed: 0 };
  for (const e of due) {
    if (Date.now() > deadline - 15_000) break; // one search can take ~10 s
    const date = e.local_date.toISOString().slice(0, 10);
    try {
      const { url } = await findTicketPage({ artistName: e.artist_name, cityId: e.city_id, cityName: e.city_name, date });
      summary.searched++;
      if (url) summary.found++;
      await sql`
        insert into radar.event_ticket_links (event_id, url, found_at, checked_at)
        values (${e.id}, ${url}, ${url ? sql`now()` : null}, now())
        on conflict (event_id) do update set
          url = coalesce(excluded.url, radar.event_ticket_links.url),
          found_at = coalesce(radar.event_ticket_links.found_at, excluded.found_at),
          checked_at = now()`;
    } catch (err) {
      summary.failed++;
      log.warn("ticket-links", "search failed", { category: err instanceof GeminiError ? err.category : "internal", error: errorMessage(err) });
      // Quota or outage: stop here; the remaining shows stay due for the next run.
      if (err instanceof GeminiError) break;
    }
  }
  return summary;
}
