/**
 * Curated artist catalogue — 50 requested list entries → 46 unique artists.
 *
 * Lists:
 *  - "karan_watchlist_suggestions" (positions 1–40): SUGGESTED artists for
 *    the Bengaluru fan persona. Suggestions only — nobody follows them until
 *    they choose to.
 *  - "bengaluru_discovery_test" (positions 41–50): names used to exercise
 *    event discovery. Being on this list says nothing about who follows them
 *    or where they perform.
 * Sonu Nigam, Papon, Shreya Ghoshal and Diljit Dosanjh appear on both lists
 * and map to ONE artist each.
 *
 * MusicBrainz ids were looked up on 2026-10-11 (exact-name search, checked by
 * hand against country/disambiguation). An id is set only when the match was
 * unambiguous; DIVINE (Mumbai rapper) has no identifiable MusicBrainz record,
 * so it carries no external id. No images, Spotify ids or URLs are invented.
 * db/migrations/0007_seed_curated_artists.sql seeds exactly this data
 * (a unit test keeps the two in sync).
 */
export type ArtistCategory = "international" | "indian";
export type CuratedListKey = "karan_watchlist_suggestions" | "bengaluru_discovery_test";

export interface CuratedArtist {
  /** Stable slug; catalogue key is mbid:<id> when musicbrainzId is set, else curated:<slug>. */
  slug: string;
  name: string;
  category: ArtistCategory;
  musicbrainzId: string | null;
  /** ISO country from MusicBrainz, only when it states one. */
  country: string | null;
}

export const CURATED_ARTISTS: readonly CuratedArtist[] = [
  { slug: "coldplay", name: "Coldplay", category: "international", musicbrainzId: "cc197bad-dc9c-440d-a5b5-d52ba2e14234", country: "GB" },
  { slug: "ed-sheeran", name: "Ed Sheeran", category: "international", musicbrainzId: "b8a7c51f-362c-4dcb-a259-bc6e0095f0a6", country: "GB" },
  { slug: "the-weeknd", name: "The Weeknd", category: "international", musicbrainzId: "c8b03190-306c-4120-bb0b-6f2ebfc06ea9", country: "CA" },
  { slug: "dua-lipa", name: "Dua Lipa", category: "international", musicbrainzId: "6f1a58bf-9b1b-49cf-a44a-6cefad7ae04f", country: "GB" },
  { slug: "billie-eilish", name: "Billie Eilish", category: "international", musicbrainzId: "f4abc0b5-3f7a-4eff-8f78-ac078dbce533", country: "US" },
  { slug: "arctic-monkeys", name: "Arctic Monkeys", category: "international", musicbrainzId: "ada7a83c-e3e1-40f1-93f9-3e73dbc9298a", country: "GB" },
  { slug: "imagine-dragons", name: "Imagine Dragons", category: "international", musicbrainzId: "012151a8-0f9a-44c9-997f-ebd68b5389f9", country: "US" },
  { slug: "onerepublic", name: "OneRepublic", category: "international", musicbrainzId: "c33c2065-b1c3-4406-b066-d33a9e2ea71a", country: "US" },
  { slug: "post-malone", name: "Post Malone", category: "international", musicbrainzId: "b1e26560-60e5-4236-bbdb-9aa5a8d5ee19", country: "US" },
  { slug: "travis-scott", name: "Travis Scott", category: "international", musicbrainzId: "e4a51f17-a57b-47b1-b37b-f552d0f8e9e6", country: "US" },
  { slug: "kendrick-lamar", name: "Kendrick Lamar", category: "international", musicbrainzId: "381086ea-f511-4aba-bdf9-71c753dc5077", country: "US" },
  { slug: "drake", name: "Drake", category: "international", musicbrainzId: "9fff2f8a-21e6-47de-a2b8-7f449929d43f", country: "CA" },
  { slug: "linkin-park", name: "Linkin Park", category: "international", musicbrainzId: "f59c5520-5f46-4d2c-b2c4-822eabf53419", country: "US" },
  { slug: "green-day", name: "Green Day", category: "international", musicbrainzId: "084308bd-1654-436f-ba03-df6697104e19", country: "US" },
  { slug: "the-chainsmokers", name: "The Chainsmokers", category: "international", musicbrainzId: "91a81925-92f9-4fc9-b897-93cf01226282", country: "US" },
  { slug: "martin-garrix", name: "Martin Garrix", category: "international", musicbrainzId: "3e1f2ee4-16be-4406-bf18-6173840cf2b1", country: "NL" },
  { slug: "calvin-harris", name: "Calvin Harris", category: "international", musicbrainzId: "8dd98bdc-80ec-4e93-8509-2f46bafc09a7", country: "GB" },
  { slug: "david-guetta", name: "David Guetta", category: "international", musicbrainzId: "302bd7b9-d012-4360-897a-93b00c855680", country: "FR" },
  { slug: "nina-kraviz", name: "Nina Kraviz", category: "international", musicbrainzId: "5dd3cf5b-474d-465a-a539-456d7e125ebc", country: "RU" },
  { slug: "tame-impala", name: "Tame Impala", category: "international", musicbrainzId: "63aa26c3-d59b-4da4-84ac-716b54f1ef4d", country: "AU" },
  { slug: "anuv-jain", name: "Anuv Jain", category: "indian", musicbrainzId: "addca31a-40ae-4152-afb8-a477da5191f0", country: "IN" },
  { slug: "prateek-kuhad", name: "Prateek Kuhad", category: "indian", musicbrainzId: "810b210f-b461-4f02-aff2-dff91196147e", country: "IN" },
  { slug: "the-local-train", name: "The Local Train", category: "indian", musicbrainzId: "93e6118e-7fa8-49f6-9e02-699a1ebce105", country: "IN" },
  { slug: "when-chai-met-toast", name: "When Chai Met Toast", category: "indian", musicbrainzId: "d20355c7-a393-4ca3-8484-f8eb14204d76", country: "IN" },
  { slug: "ritviz", name: "Ritviz", category: "indian", musicbrainzId: "005b1c3f-6606-4aa6-aca9-fee2dbaf62eb", country: "IN" },
  { slug: "nucleya", name: "Nucleya", category: "indian", musicbrainzId: "80b5200c-0322-47b2-8237-b157c5f5d095", country: "IN" },
  { slug: "divine", name: "DIVINE", category: "indian", musicbrainzId: null, country: null },
  { slug: "seedhe-maut", name: "Seedhe Maut", category: "indian", musicbrainzId: "485f576c-6ade-4c0f-9406-34720f15fb02", country: "IN" },
  { slug: "king", name: "King", category: "indian", musicbrainzId: "bda9891c-f6a4-442b-8f1c-65429c3347d8", country: "IN" },
  { slug: "diljit-dosanjh", name: "Diljit Dosanjh", category: "indian", musicbrainzId: "f931c961-b647-4861-be8c-f47d84a4de51", country: "IN" },
  { slug: "arijit-singh", name: "Arijit Singh", category: "indian", musicbrainzId: "ed3f4831-e3e0-4dc0-9381-f5649e9df221", country: "IN" },
  { slug: "a-r-rahman", name: "A.R. Rahman", category: "indian", musicbrainzId: "e0bba708-bdd3-478d-84ea-c706413bedab", country: "IN" },
  { slug: "shreya-ghoshal", name: "Shreya Ghoshal", category: "indian", musicbrainzId: "a8740949-50a8-4e71-8133-17d31b7cf69c", country: "IN" },
  { slug: "sonu-nigam", name: "Sonu Nigam", category: "indian", musicbrainzId: "93622908-0806-4173-94c1-9e42597af011", country: "IN" },
  { slug: "papon", name: "Papon", category: "indian", musicbrainzId: "7f77bfe2-ce93-40ca-a72e-21de63ca5d26", country: "IN" },
  { slug: "raghu-dixit", name: "Raghu Dixit", category: "indian", musicbrainzId: "3a380250-66c9-4548-b27d-fe6edfe0e2ae", country: null },
  { slug: "lucky-ali", name: "Lucky Ali", category: "indian", musicbrainzId: "06de7d6b-72fc-43a6-88b4-dc4c495e5607", country: "IN" },
  { slug: "swarathma", name: "Swarathma", category: "indian", musicbrainzId: "938ccdae-9174-4790-a9c3-3e52020e3f32", country: "IN" },
  { slug: "taba-chake", name: "Taba Chake", category: "indian", musicbrainzId: "dba1cebc-93cc-4660-bcfe-ea8425b2d32a", country: "IN" },
  { slug: "ankur-tewari", name: "Ankur Tewari", category: "indian", musicbrainzId: "ab18b45f-6fca-47d0-99c9-a28d8f09c0d5", country: "IN" },
  { slug: "krishna-das", name: "Krishna Das", category: "international", musicbrainzId: "9c0d337f-934c-45e9-a24e-c985b8059816", country: "US" },
  { slug: "dhvani-bhanushali", name: "Dhvani Bhanushali", category: "indian", musicbrainzId: "c68b5992-5a74-4fbc-b839-b01d653d2444", country: "IN" },
  { slug: "guns-n-roses", name: "Guns N’ Roses", category: "international", musicbrainzId: "eeb1195b-f213-4ce1-b28c-8565211f8e43", country: "US" },
  { slug: "satinder-sartaaj", name: "Satinder Sartaaj", category: "indian", musicbrainzId: "571caa1f-0191-4dc6-bfd8-23636c2900a1", country: null },
  { slug: "darshan-raval", name: "Darshan Raval", category: "indian", musicbrainzId: "985a6779-0e8a-4e52-9aca-597e2e65ab13", country: "IN" },
  { slug: "indian-ocean", name: "Indian Ocean", category: "indian", musicbrainzId: "cf8b9160-72b3-4b0d-b2c9-88bb1b7aa80f", country: "IN" },
];

/** The 50 requested entries, in order, exactly as given (duplicates included). */
export const CURATED_LIST_ENTRIES: ReadonlyArray<{ list: CuratedListKey; position: number; entryName: string; slug: string }> = [
  ...[
    "Coldplay", "Ed Sheeran", "The Weeknd", "Dua Lipa", "Billie Eilish", "Arctic Monkeys", "Imagine Dragons", "OneRepublic", "Post Malone", "Travis Scott",
    "Kendrick Lamar", "Drake", "Linkin Park", "Green Day", "The Chainsmokers", "Martin Garrix", "Calvin Harris", "David Guetta", "Nina Kraviz", "Tame Impala",
    "Anuv Jain", "Prateek Kuhad", "The Local Train", "When Chai Met Toast", "Ritviz", "Nucleya", "DIVINE", "Seedhe Maut", "King", "Diljit Dosanjh",
    "Arijit Singh", "A.R. Rahman", "Shreya Ghoshal", "Sonu Nigam", "Papon", "Raghu Dixit", "Lucky Ali", "Swarathma", "Taba Chake", "Ankur Tewari",
  ].map((entryName, i) => ({ list: "karan_watchlist_suggestions" as const, position: i + 1, entryName, slug: slugOf(entryName) })),
  ...[
    "Sonu Nigam", "Krishna Das", "Dhvani Bhanushali", "Papon", "Guns N’ Roses", "Satinder Sartaaj", "Shreya Ghoshal", "Darshan Raval", "Diljit Dosanjh", "Indian Ocean",
  ].map((entryName, i) => ({ list: "bengaluru_discovery_test" as const, position: i + 41, entryName, slug: slugOf(entryName) })),
];

function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function catalogueKeyOf(a: CuratedArtist): string {
  return a.musicbrainzId ? `mbid:${a.musicbrainzId}` : `curated:${a.slug}`;
}
