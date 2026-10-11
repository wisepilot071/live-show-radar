import type { Artist } from "@/domain/types";
import { photoForArtist } from "@/lib/artist-photo";

/** Attribution for every Wikimedia Commons photo shown for these artists (required by CC BY / BY-SA). */
export function ArtistPhotoCredits({ artists }: { artists: Artist[] }) {
  const credits = artists
    .filter((a) => !a.imageUrl)
    .map((a) => ({ artist: a.name, photo: photoForArtist(a) }))
    .filter((c): c is { artist: string; photo: NonNullable<typeof c.photo> } => Boolean(c.photo));
  if (credits.length === 0) return null;
  return (
    <details className="rounded-xl border border-line bg-surface/70 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-fg-secondary">Artist photo credits ({credits.length})</summary>
      <ul className="mt-3 grid gap-1.5 text-xs text-fg-secondary sm:grid-cols-2">
        {credits.map(({ artist, photo }) => (
          <li key={artist}>
            <span className="font-semibold text-fg">{artist}</span> —{" "}
            <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg">
              {photo.author}
            </a>
            ,{" "}
            {photo.licenceUrl ? (
              <a href={photo.licenceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg">
                {photo.licence}
              </a>
            ) : (
              photo.licence
            )}
            , via Wikimedia Commons
          </li>
        ))}
      </ul>
    </details>
  );
}
