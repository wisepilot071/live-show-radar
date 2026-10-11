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
  // Added 2026-10-11: one official live video per followed catalogue artist, uploaded by the
  // artist's own channel and verified via oEmbed (scripts/find-artist-videos.ts).
  { id: "k0Ka-deab1s", artist: "Ed Sheeran", title: "Ed Sheeran & Diljit Dosanjh - Shape of You x Naina (Live in Birmingham 2024)", channel: "Ed Sheeran", kind: "Live concert" },
  { id: "WyhCZ6dSFew", artist: "The Weeknd", title: "The Weeknd - Sao Paulo Live from iHeart Music Festival 2024", channel: "The Weeknd", kind: "Festival set" },
  { id: "3DcoC8p9az8", artist: "Dua Lipa", title: "Dua Lipa - Training Season (Live from the Royal Albert Hall) [Official Performance Video]", channel: "Dua Lipa", kind: "Live session" },
  { id: "xAWDqdpOlu8", artist: "Billie Eilish", title: "Billie Eilish – WILDFLOWER (Live Performance from Amazon Music’s Songline)", channel: "Billie Eilish", kind: "Live session" },
  { id: "4xqo7D2k8HM", artist: "Imagine Dragons", title: "Imagine Dragons - Believer (Live in Vegas)", channel: "ImagineDragons", kind: "Live concert" },
  { id: "Dmn7tTaNM-I", artist: "OneRepublic", title: "OneRepublic - Somebody To Love (Live from Red Rocks)", channel: "OneRepublic", kind: "Live concert" },
  { id: "n85KukOXc0A", artist: "Post Malone", title: "Post Malone - \"Circles\" (Live on the Runaway Tour)", channel: "Post Malone", kind: "Live concert" },
  { id: "vZo3KgqU6oY", artist: "Drake", title: "Drake and 21 Savage performing “On BS” live on SNL", channel: "Drake", kind: "Live session" },
  { id: "7Mxg4VkkRRI", artist: "Linkin Park", title: "Live In Texas (Full) [HD UPGRADE] - Linkin Park", channel: "Linkin Park", kind: "Live concert" },
  { id: "sLzd5VbiPN0", artist: "Green Day", title: "Green Day - American Idiot (Live at Coachella 2025)", channel: "Green Day", kind: "Festival set" },
  { id: "RwkGbu69nYc", artist: "The Chainsmokers", title: "The Chainsmokers - Live at Lollapalooza Chicago 2026", channel: "The Chainsmokers", kind: "Festival set" },
  { id: "sqxFW3RXGdo", artist: "Martin Garrix", title: "MARTIN GARRIX LIVE @ TOMORROWLAND 2026 (W2)", channel: "Martin Garrix", kind: "Festival set" },
  { id: "PxXAdY8G3G0", artist: "Calvin Harris", title: "Calvin Harris - Live at Ultra Music Festival Miami 2024", channel: "Calvin Harris", kind: "Festival set" },
  { id: "GSnPwle4FOE", artist: "David Guetta", title: "David Guetta live @ Tomorrowland 2026 | MainStage WE1", channel: "David Guetta", kind: "Festival set" },
  { id: "4-YvWXPOczg", artist: "Nina Kraviz", title: "Nina Kraviz DJ set | Seismic Dance Event 4.0 | 2021 | @beatport Live", channel: "Nina Kraviz", kind: "Live concert" },
  { id: "d33C8IE7WnQ", artist: "Tame Impala", title: "Tame Impala - InnerSpeaker (Live From Wave House)", channel: "Tame Impala", kind: "Live session" },
  { id: "UCLGoVb6AL4", artist: "When Chai Met Toast", title: "When Chai Met Toast - When We Feel Young (Live)", channel: "When Chai Met Toast", kind: "Live concert" },
  { id: "eTQR3xypyyo", artist: "Ritviz", title: "Ritviz Live - Ahmedabad / Surat", channel: "RITVIZ", kind: "Live concert" },
  { id: "NL-EELtvHF0", artist: "Nucleya", title: "Live @ Electric Daisy Carnival, Mexico", channel: "NUCLEYA", kind: "Festival set" },
  { id: "VXdjyAHFDFI", artist: "DIVINE", title: "DIVINE Live in 59! Mumbai", channel: "DIVINE", kind: "Live concert" },
  { id: "u-V2D7pZtYA", artist: "Diljit Dosanjh", title: "Diljit Dosanjh Khuda Gawah Live I Diluminati Tour", channel: "Diljit Dosanjh", kind: "Live concert" },
  { id: "1_JNnNVgXCM", artist: "Sonu Nigam", title: "And this time, I didn't cry | Mere Dholna 3.0 Live | Sonu Nigam", channel: "Sonu Nigam", kind: "Live concert" },
  { id: "6G0wPN01h2M", artist: "Papon", title: "Kaun Kehta Hai || Shaam E Mehfil with Papon || Live in Mumbai || Jagjit Singh || Sahir Hoshiyarpuri", channel: "Papon", kind: "Live concert" },
  { id: "A8dEAeHpe7w", artist: "Lucky Ali", title: "Lucky Ali Live In Mumbai | Official After-movie | 2026", channel: "Lucky Ali", kind: "Live concert" },
  { id: "qfK5Prt7OhI", artist: "Swarathma", title: "Aasman Ki Dukaan | Live Video | Swarathma | Indian Folk Rock | Indie band", channel: "Swarathma", kind: "Live concert" },
  { id: "sNJRShpbKws", artist: "Taba Chake", title: "Taba Chake - Gum Ho Kahan (live in studio)", channel: "Taba Chake", kind: "Live session" },
  { id: "1rWZgH6JSic", artist: "Ankur Tewari", title: "Sabse Peeche Hum Khade - Ankur Tewari | Live at Home, Delhi", channel: "Ankur Tewari", kind: "Live session" },
  { id: "60U_JwcndHk", artist: "Dhvani Bhanushali", title: "Dhvani Bhanushali Live | IIFA Rocks Performance 2019", channel: "Dhvani Bhanushali", kind: "Festival set" },
  { id: "bxwqdbIHgiQ", artist: "Satinder Sartaaj", title: "Kehde Pasey Jaiye Sajana (LIVE) |  Dr. Satinder Sartaaj | Ahmedabad | Heritage Tour India 2026", channel: "Satinder Sartaaj", kind: "Live concert" },
];
