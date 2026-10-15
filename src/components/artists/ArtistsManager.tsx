"use client";

import { ChevronDown, Plus, Search, Trash2, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import {
  artistIdentityKey,
  normalizeArtistName,
} from "@/domain/artist-identity";
import type { Artist, ArtistSelection } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { pluralize } from "@/lib/format";
import { ArtistRow } from "./ArtistRow";
import { ArtistSearchPanel } from "./ArtistSearchPanel";
import { CuratedArtistPicker } from "./CuratedArtistPicker";
import { PageSkeleton } from "@/components/ui/Skeletons";
import { LiveOnStage } from "@/components/media/LiveOnStage";
import { cn } from "@/lib/cn";
import { ArtistPhotoCredits } from "./ArtistPhotoCredits";
import { ArtistTile } from "./ArtistTile";
import { SpotifyImportCard } from "@/components/onboarding/SpotifyImportCard";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function ArtistsManager() {
  const params = useSearchParams();
  const focusKey = params.get("focus");
  const { state, run, hydrated, flush, mode } = useOnboarding();
  const [savingAll, setSavingAll] = useState(false);
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(focusKey);
  const [resolving, setResolving] = useState<ArtistSelection | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // ?q= comes from the header search: prefill the real catalogue search with it.
  const headerQuery = params.get("q") ?? "";
  const [addQuery, setAddQuery] = useState({ value: headerQuery, nonce: 0 });
  const [lastHeaderQuery, setLastHeaderQuery] = useState(headerQuery);
  if (headerQuery !== lastHeaderQuery) {
    setLastHeaderQuery(headerQuery);
    setAddQuery((q) => ({ value: headerQuery, nonce: q.nonce + 1 }));
  }
  const addRef = useRef<HTMLElement>(null);
  // The suggested-artists catalogue is folded once you have artists; it opens when the list
  // is empty or on a #add-artists link. The worldwide search is always visible.
  const [addToggled, setAddOpen] = useState(false);
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
  const addOpen =
    addToggled ||
    hash === "#add-artists" ||
    (hydrated && state.selections.length === 0);

  const selectedKeys = useMemo(
    () => new Set(state.selections.map((s) => artistIdentityKey(s.artist))),
    [state.selections],
  );
  const sorted = useMemo(
    () =>
      [...state.selections].sort((a, b) =>
        a.artist.name.localeCompare(b.artist.name, "en", {
          sensitivity: "base",
        }),
      ),
    [state.selections],
  );
  const f = normalizeArtistName(filter);
  const visible = f
    ? sorted.filter((s) =>
        [s.artist.name, ...(s.artist.aliases ?? [])].some((n) =>
          normalizeArtistName(n).includes(f),
        ),
      )
    : sorted;
  const unlinkedCount = state.selections.filter(
    (s) => !s.artist.externalIds?.musicbrainz,
  ).length;

  // Arriving from the header search: bring the search into view.
  useEffect(() => {
    if (headerQuery) addRef.current?.scrollIntoView({ block: "start" });
  }, [headerQuery]);

  // Arriving from an event page (?focus=…): bring that artist into view once.
  useEffect(() => {
    if (!hydrated || !focusKey) return;
    document
      .getElementById(`artist-${focusKey}`)
      ?.scrollIntoView({ block: "center" });
  }, [hydrated, focusKey]);

  /** Confirms every queued change reached the server; success is shown only after that. */
  async function saveAll() {
    setSavingAll(true);
    const ok = await flush();
    setSavingAll(false);
    toast(
      ok
        ? {
            message: `Saved — ${pluralize(state.selections.length, "artist")} on your watchlist.`,
          }
        : {
            message:
              "Some changes didn't save. Your list now shows what's saved — please try again.",
            tone: "info",
          },
    );
  }

  // Success toasts wait for the server; failures surface in the sync-error banner.
  async function toggle(artist: Artist) {
    const key = artistIdentityKey(artist);
    const existing = state.selections.find(
      (s) => artistIdentityKey(s.artist) === key,
    );
    if (existing) return remove(existing);
    const r = await run({
      type: "toggle_artist",
      artist,
      addedVia: "manual",
      at: new Date().toISOString(),
    });
    if (r.ok) toast({ message: `Added ${artist.name}.` });
  }

  async function remove(selection: ArtistSelection) {
    const r = await run({
      type: "remove_artist",
      identityKey: artistIdentityKey(selection.artist),
    });
    if (r.ok) {
      toast({
        message: `Removed ${selection.artist.name}.`,
        tone: "info",
        action: {
          label: "Undo",
          onAction: () =>
            void run({ type: "import_artists", selections: [selection] }),
        },
      });
    }
  }

  async function resolve(target: Artist) {
    if (!resolving) return;
    const from = resolving;
    setResolving(null);
    const r = await run({
      type: "replace_artist",
      identityKey: artistIdentityKey(from.artist),
      artist: target,
      at: new Date().toISOString(),
    });
    if (r.ok) {
      toast({
        message: `“${from.artist.name}” is now linked to ${target.name}${target.disambiguation ? ` (${target.disambiguation})` : ""}.`,
      });
      setExpanded(artistIdentityKey(target));
    }
  }

  function openAdd() {
    requestAnimationFrame(() =>
      addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function searchCatalogueFor(q: string) {
    setAddQuery((s) => ({ value: q, nonce: s.nonce + 1 }));
    openAdd();
  }

  if (!hydrated) {
    return <PageSkeleton label="Loading your artists…" body="rows" />;
  }

  return (
    <Container width="wide" className="space-y-8 py-8 sm:py-12">
      <PageHeader
        atmosphere="gold-stage"
        eyebrow="Artists"
        title={
          state.selections.length
            ? `${pluralize(state.selections.length, "artist")} on your radar`
            : "Your artists"
        }
        description="Add, remove and check the artists your radar is built around."
        actions={
          <Button
            onClick={() => openAdd()}
            leadingIcon={<Plus aria-hidden className="size-4" />}
          >
            Add artists
          </Button>
        }
      />

      {/* Performances from the artists you follow — plays (muted) on arrival */}
      {state.selections.length > 0 && <LiveOnStage autoplay onlyFollowed />}

      {/* Search ANY artist (MusicBrainz worldwide, or add by name) — always visible */}
      <section
        id="add-artists"
        ref={addRef}
        aria-labelledby="add-title"
        className="scroll-mt-24 space-y-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2
            id="add-title"
            className="font-display text-2xl font-bold tracking-tight"
          >
            Add artists
          </h2>
          <p className="text-sm text-fg-secondary">
            Any artist in the world — searched on MusicBrainz, or added by name.
          </p>
        </div>
        <SpotifyImportCard from="artists" />
        <Card tone="raised" className="p-4 sm:p-5">
          <ArtistSearchPanel
            key={addQuery.nonce}
            initialQuery={addQuery.value}
            isSelected={(a) => selectedKeys.has(artistIdentityKey(a))}
            onToggle={(a) => void toggle(a)}
            label="Search any artist"
            resultsHeadingAs="h3"
          />
        </Card>
      </section>

      {/* Your list — one face per artist */}
      <section aria-labelledby="list-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="list-title"
            className="font-display text-2xl font-bold tracking-tight"
          >
            Your list
          </h2>
          {state.selections.length > 1 && (
            <Button
              variant="ghost"
              onClick={() => setConfirmClear(true)}
              leadingIcon={<Trash2 aria-hidden className="size-4" />}
            >
              Remove all
            </Button>
          )}
        </div>

        {state.selections.length === 0 ? (
          <EmptyState
            doodle="guitar"
            icon={Users}
            title="No artists yet"
            action={
              <Button
                onClick={() => openAdd()}
                leadingIcon={<Plus aria-hidden className="size-4" />}
              >
                Find artists
              </Button>
            }
          >
            Search for the artists you&rsquo;d hate to miss. Your radar uses
            this list to decide which shows matter.
          </EmptyState>
        ) : (
          <>
            {state.selections.length > 8 && (
              <TextField
                label="Filter your list"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by name"
                leadingIcon={<Search className="size-5" />}
                trailing={
                  filter ? (
                    <button
                      type="button"
                      onClick={() => setFilter("")}
                      aria-label="Clear filter"
                      className="grid size-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  ) : null
                }
                hint={
                  unlinkedCount > 0
                    ? `${pluralize(unlinkedCount, "artist")} not linked to MusicBrainz yet — open one and link it so discovery can look it up.`
                    : undefined
                }
              />
            )}
            {visible.length === 0 ? (
              <Card tone="outline" className="space-y-3 p-5 text-center">
                <p className="font-semibold">
                  No artists in your list match &ldquo;{filter.trim()}&rdquo;.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => searchCatalogueFor(filter.trim())}
                >
                  Search the catalogue for &ldquo;{filter.trim()}&rdquo;
                </Button>
              </Card>
            ) : (
              <ul
                aria-label="Followed artists"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              >
                {visible.map((s) => {
                  const key = artistIdentityKey(s.artist);
                  return (
                    <ArtistTile
                      key={key}
                      id={`artist-${key}`}
                      selection={s}
                      highlighted={focusKey === key}
                      onOpen={() => setExpanded(key)}
                      onRemove={() => void remove(s)}
                    />
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Suggested artists (the Live Show Radar catalogue), folded away once you have artists */}
      <section aria-label="Suggested artists" className="space-y-4">
        <button
          type="button"
          aria-expanded={addOpen}
          aria-controls="add-artists-panel"
          onClick={() => {
            if (addOpen && hash)
              history.replaceState(
                null,
                "",
                window.location.pathname + window.location.search,
              );
            setAddOpen(!addOpen);
          }}
          className="group flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-line-strong bg-surface/70 px-5 py-4 text-left transition-colors hover:border-signal-ink/50 hover:bg-surface"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-signal text-on-signal">
              <Plus
                aria-hidden
                className={cn(
                  "size-5 transition-transform",
                  addOpen && "rotate-45",
                )}
              />
            </span>
            <span>
              <span className="block font-display text-xl font-semibold">
                Browse suggested artists
              </span>
              <span className="block text-sm text-fg-secondary">
                A quick-pick list of popular artists. Not a limit — search above
                finds anyone.
              </span>
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-5 text-fg-muted transition-transform",
              addOpen && "rotate-180",
            )}
          />
        </button>
        <div id="add-artists-panel" hidden={!addOpen} className="space-y-8">
          {/* Curated catalogue: Choose Your Artists */}
          <section
            aria-labelledby="choose-title"
            className="space-y-4 rounded-2xl border border-line bg-surface/80 p-4 shadow-card sm:p-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <h2
                  id="choose-title"
                  className="font-display text-2xl font-semibold"
                >
                  Choose Your Artists
                </h2>
                <p className="max-w-2xl text-sm text-fg-secondary">
                  Select the artists you want Live Show Radar to track for
                  upcoming concerts and festivals across India. Suggestions only
                  — nothing is followed until you add it.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p
                  className="text-sm font-semibold tabular-nums"
                  aria-live="polite"
                >
                  {pluralize(state.selections.length, "artist")} selected
                </p>
                <Button
                  onClick={() => void saveAll()}
                  loading={savingAll}
                  disabled={mode !== "server"}
                >
                  Save My Artists
                </Button>
              </div>
            </div>
            <CuratedArtistPicker
              isSelected={(a) => selectedKeys.has(artistIdentityKey(a))}
              onToggle={(a) => void toggle(a)}
              onAddMany={async (artists) => {
                const at = new Date().toISOString();
                const r = await run({
                  type: "import_artists",
                  selections: artists.map((artist) => ({
                    artist,
                    addedVia: "manual",
                    selectedAt: at,
                  })),
                });
                if (r.ok)
                  toast({
                    message: `Added ${pluralize(artists.length, "artist")} to your watchlist.`,
                  });
              }}
            />
          </section>
        </div>
      </section>

      <ArtistPhotoCredits artists={state.selections.map((s) => s.artist)} />

      {/* Details for one artist (MusicBrainz link, coverage, remove) */}
      <Dialog
        open={Boolean(
          expanded &&
          state.selections.find(
            (s) => artistIdentityKey(s.artist) === expanded,
          ),
        )}
        onClose={() => setExpanded(null)}
        title={
          state.selections.find((s) => artistIdentityKey(s.artist) === expanded)
            ?.artist.name ?? "Artist"
        }
      >
        {(() => {
          const sel = state.selections.find(
            (s) => artistIdentityKey(s.artist) === expanded,
          );
          if (!sel) return null;
          return (
            <ul className="overflow-hidden rounded-xl border border-line">
              <ArtistRow
                selection={sel}
                expanded
                onToggleExpanded={() => setExpanded(null)}
                onRemove={() => {
                  setExpanded(null);
                  void remove(sel);
                }}
                onResolve={() => {
                  setExpanded(null);
                  setResolving(sel);
                }}
              />
            </ul>
          );
        })()}
      </Dialog>

      <Dialog
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title={
          resolving
            ? `Which “${resolving.artist.name}”?`
            : "Find the right artist"
        }
        description="Pick the catalogue artist you meant. If several share a name, check the details under each one."
      >
        {resolving && (
          <ArtistSearchPanel
            initialQuery={resolving.artist.name}
            isSelected={(a) => selectedKeys.has(artistIdentityKey(a))}
            onToggle={(a) => void resolve(a)}
            allowTyped={false}
            mode="pick"
            label="Search the catalogue"
            resultsHeadingAs="h3"
          />
        )}
      </Dialog>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={`Remove all ${pluralize(state.selections.length, "artist")}?`}
        description="Your radar will have no artists to look for. Saved shows and preferences are kept. This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Keep my artists
            </Button>
            <Button
              variant="secondary"
              className="border-urgent/60 text-urgent-ink hover:bg-urgent/10"
              onClick={async () => {
                setConfirmClear(false);
                const r = await run({ type: "clear_artists" });
                if (r.ok)
                  toast({ message: "All artists removed.", tone: "info" });
              }}
            >
              Remove all
            </Button>
          </>
        }
      />
    </Container>
  );
}
