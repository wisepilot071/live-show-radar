import { describe, expect, it } from "vitest";
import { isOfficialTicketHost, safeTicketUrl } from "@/lib/ticket-url";

describe("safeTicketUrl", () => {
  it("accepts event-specific https links", () => {
    expect(safeTicketUrl("https://thumpn.com/tour/VEVCFY/arijit-singh-india-tour")).toBe("https://thumpn.com/tour/VEVCFY/arijit-singh-india-tour");
    expect(safeTicketUrl("https://www.ticketmaster.com/event/Z7r9jZ1A7j-_w")).toBeDefined();
  });
  it("rejects unsafe schemes, credentials, IPs and localhost", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://district.in/e/1", "https://user:pw@district.in/e", "https://10.0.0.1/e", "https://localhost/e", "not a url", 42])
      expect(safeTicketUrl(bad)).toBeUndefined();
  });
  it("rejects tracking hops and open-redirect shapes", () => {
    expect(safeTicketUrl("https://on.fgtix.com/trk/v1yW")).toBeUndefined();
    expect(safeTicketUrl("https://example.test/go?url=https%3A%2F%2Fevil.test")).toBeUndefined();
    expect(safeTicketUrl("https://example.test/go?next=//evil.test")).toBeUndefined();
  });
  it("labels official ticketing hosts", () => {
    expect(isOfficialTicketHost("https://in.bookmyshow.com/events/x")).toBe(true);
    expect(isOfficialTicketHost("https://random-resale.test/x")).toBe(false);
  });
});
