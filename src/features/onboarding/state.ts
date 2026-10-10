import { artistIdentityKey, mergeSelections } from "@/domain/artist-identity";
import { DEFAULT_PRIMARY_CITY_ID } from "@/domain/cities";
import type {
  AlertTrigger,
  Artist,
  ArtistAcquisitionMethod,
  ArtistSelection,
  IsoTimestamp,
  LocationPreference,
  LiveEvent,
  NotificationPreference,
  SavedEvent,
} from "@/domain/types";
import type { SpotifyConnectionStatus } from "@/integrations/spotify/contract";

/**
 * The user's radar profile — one object, one reducer, explicit actions.
 *
 * Created during onboarding and edited afterwards from Artists, Saved shows
 * and Settings (Part 2), so the whole app has a single source of truth.
 * The current onboarding step is NOT stored here: it is the URL.
 *
 * v2 (Part 2): adds savedEvents and two alert triggers. v1 drafts are migrated.
 */
export const ONBOARDING_STATE_VERSION = 2;

export type RequestableChannel = "email" | "telegram";

export interface OnboardingState {
  version: typeof ONBOARDING_STATE_VERSION;
  method: ArtistAcquisitionMethod | null;
  selections: ArtistSelection[];
  spotify: SpotifyConnectionStatus;
  location: LocationPreference;
  notifications: NotificationPreference;
  /**
   * Channels the user would like once available. A request is NOT an active
   * channel; activation requires a delivery adapter + user setup (Part 5).
   */
  channelRequests: Record<RequestableChannel, boolean>;
  /** Shows the user saved, newest last. Unique by eventId. */
  savedEvents: SavedEvent[];
  /** Set when the user finishes the setup-status step. */
  completedAt: IsoTimestamp | null;
  updatedAt: IsoTimestamp | null;
}

export const initialOnboardingState: OnboardingState = {
  version: ONBOARDING_STATE_VERSION,
  method: null,
  selections: [],
  spotify: "not_connected",
  location: {
    primaryCityId: DEFAULT_PRIMARY_CITY_ID,
    additionalCityIds: [],
    includeNationwide: true,
  },
  notifications: {
    triggers: {
      new_announcement: true,
      ticket_window_change: true,
      deadline_approaching: true,
      date_or_venue_change: true,
      outside_primary_city: true,
    },
  },
  channelRequests: { email: false, telegram: false },
  savedEvents: [],
  completedAt: null,
  updatedAt: null,
};

export type OnboardingAction =
  | { type: "hydrate"; state: OnboardingState }
  | { type: "choose_method"; method: ArtistAcquisitionMethod }
  | { type: "toggle_artist"; artist: Artist; addedVia: "manual" | "spotify"; at: IsoTimestamp }
  | { type: "remove_artist"; identityKey: string }
  | { type: "replace_artist"; identityKey: string; artist: Artist; at: IsoTimestamp }
  | { type: "clear_artists" }
  | { type: "save_event"; event: LiveEvent; at: IsoTimestamp }
  | { type: "unsave_event"; eventId: string }
  | { type: "restore_saved_event"; saved: SavedEvent }
  | { type: "import_artists"; selections: ArtistSelection[] }
  | { type: "set_spotify_status"; status: SpotifyConnectionStatus }
  | { type: "fallback_to_manual" }
  | { type: "set_primary_city"; cityId: string }
  | { type: "toggle_additional_city"; cityId: string }
  | { type: "set_nationwide"; value: boolean }
  | { type: "set_trigger"; trigger: AlertTrigger; value: boolean }
  | { type: "set_channel_request"; channel: RequestableChannel; value: boolean }
  | { type: "complete"; at: IsoTimestamp }
  | { type: "reset" };

function reduce(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "choose_method":
      return { ...state, method: action.method };

    case "toggle_artist": {
      const key = artistIdentityKey(action.artist);
      const exists = state.selections.some((s) => artistIdentityKey(s.artist) === key);
      return {
        ...state,
        selections: exists
          ? state.selections.filter((s) => artistIdentityKey(s.artist) !== key)
          : [...state.selections, { artist: action.artist, addedVia: action.addedVia, selectedAt: action.at }],
      };
    }

    case "remove_artist":
      return { ...state, selections: state.selections.filter((s) => artistIdentityKey(s.artist) !== action.identityKey) };

    case "replace_artist": {
      // Resolving a typed name to a catalogue record. If the target is already
      // selected, the typed entry is simply dropped (no duplicate).
      const targetKey = artistIdentityKey(action.artist);
      const targetExists = state.selections.some((s) => artistIdentityKey(s.artist) === targetKey);
      return {
        ...state,
        selections: targetExists
          ? state.selections.filter((s) => artistIdentityKey(s.artist) !== action.identityKey)
          : state.selections.map((s) =>
              artistIdentityKey(s.artist) === action.identityKey
                ? { artist: action.artist, addedVia: s.addedVia, selectedAt: s.selectedAt }
                : s,
            ),
      };
    }

    case "clear_artists":
      return state.selections.length ? { ...state, selections: [] } : state;

    case "save_event":
      if (state.savedEvents.some((s) => s.eventId === action.event.id)) return state;
      return {
        ...state,
        savedEvents: [...state.savedEvents, { eventId: action.event.id, savedAt: action.at, snapshot: action.event }],
      };

    case "unsave_event": {
      const next = state.savedEvents.filter((s) => s.eventId !== action.eventId);
      return next.length === state.savedEvents.length ? state : { ...state, savedEvents: next };
    }

    case "restore_saved_event":
      if (state.savedEvents.some((s) => s.eventId === action.saved.eventId)) return state;
      return { ...state, savedEvents: [...state.savedEvents, action.saved] };

    case "import_artists":
      return { ...state, selections: mergeSelections(state.selections, action.selections) };

    case "set_spotify_status":
      return { ...state, spotify: action.status };

    case "fallback_to_manual":
      // Spotify-only users switch to manual; mix users keep "mix" and skip the import.
      return {
        ...state,
        spotify: "manual_fallback",
        method: state.method === "spotify" ? "manual" : state.method ?? "manual",
      };

    case "set_primary_city": {
      return {
        ...state,
        location: {
          ...state.location,
          primaryCityId: action.cityId,
          // A city cannot be both primary and additional.
          additionalCityIds: state.location.additionalCityIds.filter((id) => id !== action.cityId),
        },
      };
    }

    case "toggle_additional_city": {
      if (action.cityId === state.location.primaryCityId) return state;
      const has = state.location.additionalCityIds.includes(action.cityId);
      return {
        ...state,
        location: {
          ...state.location,
          additionalCityIds: has
            ? state.location.additionalCityIds.filter((id) => id !== action.cityId)
            : [...state.location.additionalCityIds, action.cityId],
        },
      };
    }

    case "set_nationwide":
      return { ...state, location: { ...state.location, includeNationwide: action.value } };

    case "set_trigger":
      return {
        ...state,
        notifications: { triggers: { ...state.notifications.triggers, [action.trigger]: action.value } },
      };

    case "set_channel_request":
      return { ...state, channelRequests: { ...state.channelRequests, [action.channel]: action.value } };

    case "complete":
      return { ...state, completedAt: action.at };

    case "reset":
      return initialOnboardingState;
  }
}

/** Reducer wrapper that stamps updatedAt on every user change. */
export function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  const next = reduce(state, action);
  if (next === state || action.type === "hydrate") return next;
  return { ...next, updatedAt: new Date().toISOString() };
}

/** Runtime check for a current-version state object. */
export function isOnboardingState(value: unknown): value is OnboardingState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<OnboardingState>;
  return (
    v.version === ONBOARDING_STATE_VERSION &&
    Array.isArray(v.selections) &&
    v.selections.every((s) => s && typeof s === "object" && typeof s.artist?.id === "string" && typeof s.artist?.name === "string") &&
    Array.isArray(v.savedEvents) &&
    v.savedEvents.every((s) => s && typeof s.eventId === "string" && typeof s.snapshot?.id === "string") &&
    typeof v.location?.primaryCityId === "string" &&
    Array.isArray(v.location?.additionalCityIds) &&
    typeof v.location?.includeNationwide === "boolean" &&
    typeof v.notifications?.triggers === "object" &&
    typeof v.channelRequests === "object" &&
    typeof v.spotify === "string"
  );
}

/**
 * Accepts any stored draft and returns a current-version state, or null if it
 * cannot be trusted. v1 → v2: adds savedEvents and the two new triggers
 * (defaulting on, matching new users).
 */
export function migrateOnboardingState(value: unknown): OnboardingState | null {
  if (isOnboardingState(value)) return value;
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown> & { version?: unknown; notifications?: { triggers?: object } };
  if (v.version === 1) {
    const candidate = {
      ...v,
      version: ONBOARDING_STATE_VERSION,
      savedEvents: [],
      notifications: {
        triggers: { ...initialOnboardingState.notifications.triggers, ...(v.notifications?.triggers ?? {}) },
      },
    };
    return isOnboardingState(candidate) ? candidate : null;
  }
  return null;
}
