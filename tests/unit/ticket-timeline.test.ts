import { describe, expect, it } from "vitest";
import { effectiveTicketKind } from "@/domain/ticket-timeline";

const NOW = new Date("2026-10-15T10:00:00Z");

describe("effectiveTicketKind", () => {
  it("a stated sale date that has passed means on sale", () => {
    expect(effectiveTicketKind("announced_not_on_sale", { saleOpensAt: "2026-10-13T08:30:00Z" }, NOW)).toBe("on_sale");
    expect(effectiveTicketKind("unknown", { saleOpensAt: new Date("2026-10-13T08:30:00Z") }, NOW)).toBe("on_sale");
  });
  it("a sale date still ahead stays announced", () => {
    expect(effectiveTicketKind("announced_not_on_sale", { saleOpensAt: "2026-10-20T08:30:00Z" }, NOW)).toBe("announced_not_on_sale");
  });
  it("an ended early bird falls back to the regular sale; a live one stays", () => {
    expect(effectiveTicketKind("early_bird", { earlyBirdEndsAt: "2026-10-14T00:00:00Z" }, NOW)).toBe("on_sale");
    expect(effectiveTicketKind("early_bird", { earlyBirdEndsAt: "2026-10-20T00:00:00Z" }, NOW)).toBe("early_bird");
  });
  it("never overrides sold out or cancelled", () => {
    expect(effectiveTicketKind("sold_out", { saleOpensAt: "2026-10-01T00:00:00Z" }, NOW)).toBe("sold_out");
    expect(effectiveTicketKind("cancelled", { saleOpensAt: "2026-10-01T00:00:00Z" }, NOW)).toBe("cancelled");
  });
});
