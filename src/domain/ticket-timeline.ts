import type { TicketStatusKind } from "./types";

/**
 * A stored ticket status can go stale just by time passing: "sales open on
 * 13 Oct" means tickets are on sale after 13 Oct, and an early-bird window
 * that has ended means the regular sale is what's left. Only those two
 * date-driven moves are made — a sold-out, cancelled or postponed status, or
 * any status a source stated directly, is never changed here.
 */
export function effectiveTicketKind(
  stored: TicketStatusKind,
  dates: { saleOpensAt?: Date | string | null; earlyBirdEndsAt?: Date | string | null },
  now: Date,
): TicketStatusKind {
  const passed = (d: Date | string | null | undefined) => d != null && new Date(d).getTime() <= now.getTime();
  if ((stored === "unknown" || stored === "announced_not_on_sale" || stored === "presale") && passed(dates.saleOpensAt)) return "on_sale";
  if (stored === "early_bird" && passed(dates.earlyBirdEndsAt)) return "on_sale";
  return stored;
}
