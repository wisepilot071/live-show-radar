"use client";

import { Check, MapPin, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { Switch } from "@/components/ui/Switch";
import { cityLabel, findCity, INITIAL_CITIES } from "@/domain/cities";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";

/**
 * Home city, extra priority cities, and the India-wide switch, with a live
 * ranking summary. Shared by onboarding and Settings.
 */
export function LocationPreferenceSelector() {
  const { state, dispatch } = useOnboarding();
  const { primaryCityId, additionalCityIds, includeNationwide } = state.location;
  const primary = findCity(primaryCityId);
  const others = INITIAL_CITIES.filter((c) => c.id !== primaryCityId);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card tone="raised" className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-signal-ink">
            <MapPin aria-hidden className="size-4" />
            <p className="text-xs font-semibold">Priority 1 · Home city</p>
          </div>
          <SelectField
            label="Primary city"
            value={primaryCityId}
            onChange={(e) => dispatch({ type: "set_primary_city", cityId: e.target.value })}
            hint="No location access needed. You can change this any time."
          >
            {INITIAL_CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.region}
              </option>
            ))}
          </SelectField>
        </Card>

        <fieldset className="space-y-3">
          <legend className="mb-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-semibold text-fg">Also prioritise</span>
            <span className="text-sm text-fg-muted">Optional — cities you&rsquo;d happily travel to</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {others.map((c) => {
              const on = additionalCityIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => dispatch({ type: "toggle_additional_city", cityId: c.id })}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                    on
                      ? "border-signal-ink bg-signal/30 text-fg"
                      : "border-line bg-surface text-fg-secondary hover:border-line-strong hover:text-fg",
                  )}
                >
                  {on ? (
                    <Check aria-hidden className="size-4 text-signal-ink" strokeWidth={3} />
                  ) : (
                    <Plus aria-hidden className="size-4" />
                  )}
                  {c.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-fg-muted">Initial city list. More cities will come from a city catalogue later.</p>
        </fieldset>

        <Switch
          checked={includeNationwide}
          onChange={(value) => dispatch({ type: "set_nationwide", value })}
          label="Include relevant shows anywhere in India"
          description="Keeps big tours and festivals in other cities on your radar. Turning this off limits you to the cities above."
        />
      </div>

      <aside aria-labelledby="loc-summary">
        <Card className="space-y-4 p-5 sm:p-6 lg:sticky lg:top-40">
          <h2 id="loc-summary" className="font-display text-lg font-bold">
            How we&rsquo;ll rank shows
          </h2>
          <ol className="space-y-3 text-sm">
            <SummaryRow rank={1} title={primary ? cityLabel(primary.id) : "Choose a city"} detail="Shown first" strong />
            <SummaryRow
              rank={2}
              title={
                additionalCityIds.length
                  ? additionalCityIds.map((id) => findCity(id)?.name ?? id).join(", ")
                  : "No extra cities"
              }
              detail="Shown next"
            />
            <SummaryRow
              rank={3}
              title={includeNationwide ? "Everywhere else in India" : "Other cities excluded"}
              detail={includeNationwide ? "Still included, ranked lower" : "You won't see these"}
              muted={!includeNationwide}
            />
          </ol>
        </Card>
      </aside>
    </div>
  );
}

function SummaryRow({
  rank,
  title,
  detail,
  strong,
  muted,
}: {
  rank: number;
  title: string;
  detail: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs",
          strong ? "border-signal-ink bg-signal text-on-signal" : "border-line-strong text-fg-secondary",
        )}
      >
        {rank}
      </span>
      <div className="min-w-0">
        <p className={cn("font-semibold", muted ? "text-fg-muted line-through" : "text-fg")}>{title}</p>
        <p className="text-fg-muted">{detail}</p>
      </div>
    </li>
  );
}
