"use client";

import { Plus, Search, Trash2, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { artistIdentityKey, normalizeArtistName } from "@/domain/artist-identity";
import type { Artist, ArtistSelection } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { pluralize } from "@/lib/format";
import { ArtistRow } from "./ArtistRow";
import { ArtistSearchPanel } from "./ArtistSearchPanel";

export function ArtistsManager() {
  const params = useSearchParams();
  const focusKey = params.get("focus");
  const { state, run, hydrated } = useOnboarding();
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

  const selectedKeys = useMemo(() => new Set(state.selections.map((s) => artistIdentityKey(s.artist))), [state.selections]);
  const sorted = useMemo(
    () => [...state.selections].sort((a, b) => a.artist.name.localeCompare(b.artist.name, "en", { sensitivity: "base" })),
    [state.selections],
  );
  const f = normalizeArtistName(filter);
  const visible = f
    ? sorted.filter((s) => [s.artist.name, ...(s.artist.aliases ?? [])].some((n) => normalizeArtistName(n).includes(f)))
    : sorted;
  const unlinkedCount = state.selections.filter((s) => !s.artist.externalIds?.musicbrainz).length;

  // Arriving from the header search: bring the search into view.
  useEffect(() => {
    if (headerQuery) addRef.current?.scrollIntoView({ block: "start" });
  }, [headerQuery]);

  // Arriving from an event page (?focus=…): bring that artist into view once.
  useEffect(() => {
    if (!hydrated || !focusKey) return;
    document.getElementById(`artist-${focusKey}`)?.scrollIntoView({ block: "center" });
  }, [hydrated, focusKey]);

  // Success toasts wait for the server; failures surface in the sync-error banner.
  async function toggle(artist: Artist) {
    const key = artistIdentityKey(artist);
    const existing = state.selections.find((s) => artistIdentityKey(s.artist) === key);
    if (existing) return remove(existing);
    const r = await run({ type: "toggle_artist", artist, addedVia: "manual", at: new Date().toISOString() });
    if (r.ok) toast({ message: `Added ${artist.name}.` });
  }

  async function remove(selection: ArtistSelection) {
    const r = await run({ type: "remove_artist", identityKey: artistIdentityKey(selection.artist) });
    if (r.ok) {
      toast({
        message: `Removed ${selection.artist.name}.`,
        tone: "info",
        action: { label: "Undo", onAction: () => void run({ type: "import_artists", selections: [selection] }) },
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
      toast({ message: `“${from.artist.name}” is now linked to ${target.name}${target.disambiguation ? ` (${target.disambiguation})` : ""}.` });
      setExpanded(artistIdentityKey(target));
    }
  }

  function searchCatalogueFor(q: string) {
    setAddQuery((s) => ({ value: q, nonce: s.nonce + 1 }));
    addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!hydrated) {
    return (
      <Container className="py-12">
        <LoadingIndicator label="Loading your artists…" />
      </Container>
    );
  }

  return (
    <Container width="wide" className="space-y-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="Artists"
        title={state.selections.length ? `${pluralize(state.selections.length, "artist")} on your radar` : "Your artists"}
        description="Add, remove and check the artists your radar is built around."
        actions={
          <ButtonLink href="#add-artists" leadingIcon={<Plus aria-hidden className="size-4" />}>
            Add artists
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Your list */}
        <section aria-labelledby="list-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="list-title" className="font-display text-2xl font-bold tracking-tight">
              Your list
            </h2>
            {state.selections.length > 1 && (
              <Button variant="ghost" onClick={() => setConfirmClear(true)} leadingIcon={<Trash2 aria-hidden className="size-4" />}>
                Remove all
              </Button>
            )}
          </div>

          {state.selections.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No artists yet"
              action={
                <ButtonLink href="#add-artists" leadingIcon={<Plus aria-hidden className="size-4" />}>
                  Find artists
                </ButtonLink>
              }
            >
              Search for the artists you&rsquo;d hate to miss. Your radar uses this list to decide which shows matter.
            </EmptyState>
          ) : (
            <>
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
              {visible.length === 0 ? (
                <Card tone="outline" className="space-y-3 p-5 text-center">
                  <p className="font-semibold">No artists in your list match &ldquo;{filter.trim()}&rdquo;.</p>
                  <Button variant="secondary" onClick={() => searchCatalogueFor(filter.trim())}>
                    Search the catalogue for &ldquo;{filter.trim()}&rdquo;
                  </Button>
                </Card>
              ) : (
                <ul
                  aria-label="Followed artists"
                  className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-surface"
                >
                  {visible.map((s) => {
                    const key = artistIdentityKey(s.artist);
                    return (
                        <ArtistRow
                          key={key}
                          id={`artist-${key}`}
                          selection={s}
                          expanded={expanded === key}
                          highlighted={focusKey === key}
                          onToggleExpanded={() => setExpanded((k) => (k === key ? null : key))}
                          onRemove={() => void remove(s)}
                          onResolve={() => setResolving(s)}
                        />
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        {/* Add artists (shared Part 1 search) */}
        <section
          id="add-artists"
          ref={addRef}
          aria-labelledby="add-title"
          className="scroll-mt-24 space-y-4 xl:sticky xl:top-6 xl:self-start"
        >
          <h2 id="add-title" className="font-display text-2xl font-bold tracking-tight">
            Add artists
          </h2>
          <Card tone="raised" className="p-4 sm:p-5">
            <ArtistSearchPanel
              key={addQuery.nonce}
              initialQuery={addQuery.value}
              isSelected={(a) => selectedKeys.has(artistIdentityKey(a))}
              onToggle={(a) => void toggle(a)}
              label="Search the catalogue"
              resultsHeadingAs="h3"
            />
          </Card>
        </section>
      </div>

      <Dialog
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title={resolving ? `Which “${resolving.artist.name}”?` : "Find the right artist"}
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
                if (r.ok) toast({ message: "All artists removed.", tone: "info" });
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
