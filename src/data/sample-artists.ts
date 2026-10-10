import type { Artist } from "@/domain/types";

/**
 * SAMPLE CATALOGUE — demo data only.
 *
 * Real artist names with minimal, non-event context (country, broad genre) so
 * the selection UI can be exercised before a real artist-search source is
 * connected. Contains no images, no ids from any external service and no event
 * information. Every record is tagged `origin: "sample_catalogue"` and the UI
 * labels results from this file as sample data.
 *
 * Replace by implementing `ArtistSearchAdapter` (src/services/artist-search.ts)
 * against a real catalogue; nothing in the UI imports this file directly.
 */
type Seed = Omit<Artist, "id" | "origin"> & { key: string };

const seeds: Seed[] = [
  { key: "prateek-kuhad", name: "Prateek Kuhad", country: "India", genres: ["Indie folk", "Singer-songwriter"] },
  { key: "when-chai-met-toast", name: "When Chai Met Toast", aliases: ["WCMT"], country: "India", genres: ["Indie folk-pop"] },
  { key: "the-local-train", name: "The Local Train", country: "India", genres: ["Hindi rock"] },
  { key: "peter-cat-recording-co", name: "Peter Cat Recording Co.", aliases: ["PCRC", "Peter Cat"], country: "India", genres: ["Indie", "Jazz pop"] },
  { key: "ritviz", name: "Ritviz", country: "India", genres: ["Electronic", "Pop"] },
  { key: "anuv-jain", name: "Anuv Jain", country: "India", genres: ["Singer-songwriter"] },
  { key: "lifafa", name: "Lifafa", country: "India", genres: ["Electronic"] },
  { key: "parvaaz", name: "Parvaaz", country: "India", genres: ["Psychedelic rock"] },
  { key: "thaikkudam-bridge", name: "Thaikkudam Bridge", country: "India", genres: ["Fusion rock"] },
  { key: "taba-chake", name: "Taba Chake", country: "India", genres: ["Folk", "Singer-songwriter"] },
  { key: "seedhe-maut", name: "Seedhe Maut", country: "India", genres: ["Hip-hop"] },
  { key: "divine", name: "DIVINE", aliases: ["Divine"], country: "India", genres: ["Hip-hop"] },
  { key: "the-yellow-diary", name: "The Yellow Diary", country: "India", genres: ["Rock", "Pop"] },
  { key: "swarathma", name: "Swarathma", country: "India", genres: ["Folk rock"] },
  { key: "bloodywood", name: "Bloodywood", country: "India", genres: ["Metal"] },
  { key: "easy-wanderlings", name: "Easy Wanderlings", country: "India", genres: ["Indie pop"] },
  { key: "raghu-dixit", name: "Raghu Dixit", aliases: ["The Raghu Dixit Project", "Raghu Dixit Project"], country: "India", genres: ["Folk", "Fusion"] },
  { key: "nucleya", name: "Nucleya", country: "India", genres: ["Electronic", "Bass"] },
  { key: "arijit-singh", name: "Arijit Singh", country: "India", genres: ["Playback", "Pop"] },
  { key: "coldplay", name: "Coldplay", country: "United Kingdom", genres: ["Pop rock"] },
  { key: "ed-sheeran", name: "Ed Sheeran", country: "United Kingdom", genres: ["Pop"] },
  { key: "arctic-monkeys", name: "Arctic Monkeys", country: "United Kingdom", genres: ["Indie rock"] },
  { key: "radiohead", name: "Radiohead", country: "United Kingdom", genres: ["Alternative rock"] },
  { key: "fred-again", name: "Fred again..", aliases: ["Fred again", "Fred Again"], country: "United Kingdom", genres: ["Electronic"] },
  { key: "glass-animals", name: "Glass Animals", country: "United Kingdom", genres: ["Indie pop"] },
  { key: "dua-lipa", name: "Dua Lipa", country: "United Kingdom", genres: ["Pop"] },
  { key: "tame-impala", name: "Tame Impala", country: "Australia", genres: ["Psychedelic pop"] },
  { key: "khruangbin", name: "Khruangbin", country: "United States", genres: ["Psychedelic", "Funk"] },
  { key: "hozier", name: "Hozier", country: "Ireland", genres: ["Soul", "Indie rock"] },
  { key: "bon-iver", name: "Bon Iver", country: "United States", genres: ["Indie folk"] },
  { key: "john-mayer", name: "John Mayer", country: "United States", genres: ["Pop rock", "Blues"] },
  { key: "cigarettes-after-sex", name: "Cigarettes After Sex", country: "United States", genres: ["Dream pop"] },
  { key: "phoebe-bridgers", name: "Phoebe Bridgers", country: "United States", genres: ["Indie rock"] },
  { key: "the-weeknd", name: "The Weeknd", country: "Canada", genres: ["R&B", "Pop"] },
  // Deliberately ambiguous pair — exercises disambiguation in the UI.
  { key: "nirvana-us", name: "Nirvana", disambiguation: "Seattle grunge band, 1987–1994", country: "United States", genres: ["Grunge"] },
  { key: "nirvana-uk", name: "Nirvana", disambiguation: "1960s British psychedelic pop duo", country: "United Kingdom", genres: ["Psychedelic pop"] },
];

export const SAMPLE_ARTISTS: readonly Artist[] = seeds.map(({ key, ...rest }) => ({
  id: `sample:${key}`,
  origin: "sample_catalogue",
  ...rest,
}));
