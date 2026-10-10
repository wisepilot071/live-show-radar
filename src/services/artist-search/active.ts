import { getServerEnv } from "@/config/server-env";
import type { ArtistSearchAdapter } from "./contract";
import { musicBrainzArtistSearch } from "./musicbrainz-adapter";
import { sampleCatalogueSearch } from "./sample-adapter";

/**
 * The artist search the app uses: MusicBrainz (live) unless it is disabled
 * with MUSICBRAINZ_ENABLED=false, in which case the clearly labelled sample
 * catalogue is used instead. The UI shows which one is active.
 */
export function getActiveArtistSearch(): ArtistSearchAdapter {
  return getServerEnv().musicbrainz.enabled ? musicBrainzArtistSearch : sampleCatalogueSearch;
}
