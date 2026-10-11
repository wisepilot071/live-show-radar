/**
 * Curated live-performance videos for the "Live on Stage" section.
 *
 * This is a CURATED list, kept separate from anything retrieved dynamically.
 * Every entry was checked on 2026-10-11 against YouTube's official oEmbed
 * endpoint (https://www.youtube.com/oembed), which only answers for public,
 * embeddable videos and returns the real title and channel. Only uploads from
 * the artist's own channel, the festival/organiser's official channel, or an
 * established live-session channel are included — no fan uploads.
 *
 * The /api/media/videos route re-checks each ID at runtime (cached), so a
 * video that is later deleted or has embedding turned off drops out or falls
 * back to a "Watch on YouTube" link instead of a broken player.
 */
export type LiveVideoKind = "Live concert" | "Festival set" | "Live session" | "Acoustic session";

export interface CuratedLiveVideo {
  /** YouTube video ID (verified, never invented). */
  id: string;
  /** Performer shown on the card; matched against followed artists by name. */
  artist: string;
  /** Title as returned by YouTube oEmbed at verification time. */
  title: string;
  /** Uploading channel (as returned by oEmbed). */
  channel: string;
  kind: LiveVideoKind;
}

export const CURATED_LIVE_VIDEOS_VERIFIED_AT = "2026-10-11";

export const CURATED_LIVE_VIDEOS: readonly CuratedLiveVideo[] = [
  { id: "sUJJG4Dac88", artist: "Prateek Kuhad", title: "Prateek Kuhad - Live in Mumbai (December 2019)", channel: "Prateek Kuhad", kind: "Live concert" },
  { id: "IBMsg9AiAqU", artist: "When Chai Met Toast", title: "When Chai Met Toast | FOREVER (Live) @ Bacardi NH7 Weekender 2020", channel: "NH7", kind: "Festival set" },
  { id: "X8ezm1j73tE", artist: "The Local Train", title: "The Local Train | Aaoge Tum Kabhi (Live) | Repertwahr Festival Season 10 | 2019", channel: "Repertwahr Festival", kind: "Festival set" },
  { id: "Cx8AaSvH4EQ", artist: "Shakti", title: "Shakti: Tiny Desk Concert", channel: "NPR Music", kind: "Live session" },
  { id: "aJcmNhhw8o8", artist: "Prateek Kuhad", title: "Prateek Kuhad on Audiotree Live (Full Session)", channel: "Audiotree", kind: "Live session" },
  { id: "_IE7mnFQhOs", artist: "When Chai Met Toast", title: "Firefly (Live at Bacardi NH7 Weekender Pune)", channel: "When Chai Met Toast", kind: "Festival set" },
  { id: "UDyylvaAnO4", artist: "Raftaar", title: "Raftaar Live at NH7 Weekender ⚡ | Unmissable Energy & Iconic Beats | NH 7", channel: "NH7", kind: "Festival set" },
  { id: "vLuKDBmp-vg", artist: "Prateek Kuhad", title: "Co2 performance with THE EYE Sessions", channel: "Prateek Kuhad", kind: "Acoustic session" },
  { id: "lgmw41CY1Fo", artist: "Red Baraat", title: "Red Baraat: NPR Music Tiny Desk Concert", channel: "NPR Music", kind: "Live session" },
];
