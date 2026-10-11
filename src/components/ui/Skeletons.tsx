import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

/*
 * Loading placeholders shaped like the content they stand in for. Each one is a
 * role="status" region with a real label for screen readers; no fake progress.
 */

/** Same footprint as <EventCard>. */
export function EventCardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex gap-4">
        <Skeleton className="h-[4.75rem] w-16 rounded-lg" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="mt-auto flex gap-2 border-t border-line pt-3">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>
    </div>
  );
}

export function EventGridSkeleton({ label, count = 3, className }: { label: string; count?: number; className?: string }) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      <ul aria-hidden className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <EventCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacked rows (inbox alerts, bookings, artists). */
export function RowListSkeleton({ label, count = 4, className }: { label: string; count?: number; className?: string }) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      <ul aria-hidden className="space-y-3">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="flex items-start gap-4 rounded-xl border border-line bg-surface p-4 shadow-card">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Whole-page placeholder while saved choices load: header panel + content. */
export function PageSkeleton({
  label,
  width = "wide",
  body = "cards",
}: {
  label: string;
  width?: "default" | "wide";
  body?: "cards" | "rows" | "form";
}) {
  return (
    <Container width={width} className="space-y-8 py-8 sm:py-12">
      <div role="status">
        <span className="sr-only">{label}</span>
        <div aria-hidden className="space-y-8">
          <div className="space-y-3 rounded-[1.75rem] bg-ink px-5 pt-14 pb-7 sm:px-8 sm:pt-20 sm:pb-9">
            <Skeleton tone="ink" className="h-3 w-24" />
            <Skeleton tone="ink" className="h-10 w-2/3 max-w-lg" />
            <Skeleton tone="ink" className="h-5 w-1/2 max-w-md" />
          </div>
          {body === "cards" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <EventCardSkeleton key={i} />
              ))}
            </div>
          )}
          {body === "rows" && (
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          )}
          {body === "form" && (
            <div className="space-y-4">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className={cn("w-full rounded-xl", i === 0 ? "h-40" : "h-28")} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

/** Show-details page placeholder. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="space-y-6">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-5">
          <Skeleton className="h-28 w-24 rounded-xl" />
          <div className="flex-1 space-y-3 pt-2">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
