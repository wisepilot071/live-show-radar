#!/usr/bin/env node
/**
 * End-to-end smoke test against a deployed app, using a BRAND-NEW isolated test
 * profile (its own cookie jar). It never touches existing users' data, sends no
 * external messages (the test profile has no email/Telegram/Calendar), and
 * deletes the test profile at the end.
 *
 *   node scripts/e2e-production-smoke.mjs [https://live-show-radar.vercel.app]
 */
const BASE = (process.argv[2] ?? "https://live-show-radar.vercel.app").replace(/\/$/, "");
let cookie = "";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
    headers: { cookie, origin: BASE, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) {
    const m = set.match(/lsr_profile=([^;]*)/);
    if (m) cookie = m[1] ? `lsr_profile=${m[1]}` : "";
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text };
}

// 1. Routes render (server responds; client-side checks are done in a browser separately).
for (const p of ["/", "/explore", "/radar", "/artists", "/inbox", "/saved", "/bookings", "/settings", "/onboarding/artists"]) {
  const r = await call("GET", p);
  check(`route ${p} responds`, r.status === 200, `HTTP ${r.status}`);
}

// 2. Pick two real catalogue artists that have stored upcoming shows.
const cat = await call("GET", "/api/artists/catalogue");
const entries = cat.json?.data?.entries ?? [];
const pick = (n) => entries.find((e) => e.artist.name === n)?.artist;
const gnr = pick("Guns N’ Roses");
const arijit = pick("Arijit Singh");
check("catalogue loads real artists", entries.length >= 40 && gnr && arijit, `${entries.length} entries`);

// 3. Follow both (new profile is created on first write).
const at = new Date().toISOString();
for (const a of [gnr, arijit]) {
  const r = await call("POST", "/api/me/artists", { artist: a, addedVia: "manual", selectedAt: at });
  check(`follow ${a.name}`, r.status === 200 && r.json?.ok, `HTTP ${r.status}`);
}
const again = await call("POST", "/api/me/artists", { artist: gnr, addedVia: "manual", selectedAt: at });
let prof = await call("GET", "/api/me/profile");
const names = (prof.json?.data?.profile?.selections ?? []).map((s) => s.artist.name);
check("double follow is idempotent; follows persist across requests", again.json?.ok && names.length === 2, names.join(", "));

// 4. Radar: the followed artists' real shows, from the real pipeline.
const ev = await call("GET", "/api/me/events");
const events = ev.json?.data?.report?.events ?? [];
const gnrShow = events.find((e) => e.artistNames.includes("Guns N’ Roses") && e.cityName === "Bengaluru");
const arijitShow = events.find((e) => e.artistNames.includes("Arijit Singh") && e.cityName === "Bengaluru");
check("radar returns the followed artists' real shows", Boolean(gnrShow && arijitShow), `${events.length} events`);
check("events only for followed artists", events.every((e) => e.artistNames.some((n) => ["Guns N’ Roses", "Arijit Singh"].includes(n))));
check("no duplicate event ids", new Set(events.map((e) => e.id)).size === events.length);
check("every event names its source", events.every((e) => e.source?.name && !/scrapingbee/i.test(e.source.name)));
const links = events.map((e) => e.ticket.bookingUrl).filter(Boolean);
check(
  "ticket links are https, event-specific, never tracking/redirect hops",
  links.length > 0 && links.every((u) => /^https:\/\/[^/]+\/.+/.test(u) && !/\/trk\//.test(u)),
  links[0] ?? "none",
);

// 5. Saved shows: save, double-save, persist, unsave.
const s1 = await call("POST", "/api/me/saved", { eventId: gnrShow.id });
const s2 = await call("POST", "/api/me/saved", { eventId: gnrShow.id });
prof = await call("GET", "/api/me/profile");
const saved = prof.json?.data?.profile?.savedEvents ?? [];
check("save + double save = one saved show", s1.json?.ok && s2.json?.ok && saved.filter((x) => x.eventId === gnrShow.id).length === 1);
let bk = await call("GET", "/api/me/bookings");
check("saving does NOT create a booking", (bk.json?.data?.bookings ?? []).length === 0);
const un = await call("DELETE", `/api/me/saved?eventId=${encodeURIComponent(gnrShow.id)}`);
prof = await call("GET", "/api/me/profile");
check("unsave removes it", un.json?.ok && !(prof.json?.data?.profile?.savedEvents ?? []).some((x) => x.eventId === gnrShow.id));

// 6. Booking: user-recorded, idempotent, calendar state honest for a profile without Google.
const b1 = await call("POST", "/api/me/bookings", { eventId: arijitShow.id });
const b2 = await call("POST", "/api/me/bookings", { eventId: arijitShow.id });
bk = await call("GET", "/api/me/bookings");
const bookings = bk.json?.data?.bookings ?? [];
check("booking recorded once (idempotent)", b1.json?.ok && b2.json?.ok && bookings.length === 1, `HTTP ${b1.status}/${b2.status}`);
check("booking is user-confirmed, calendar 'not_connected' (no fake sync)", bookings[0]?.status === "user_confirmed" && bookings[0]?.calendar?.status === "not_connected", JSON.stringify(bookings[0]?.calendar ?? {}));

// 7. Inbox: the booking alert exists in-app; no email/Telegram claimed for this profile.
const inbox = await call("GET", "/api/me/notifications");
const notes = inbox.json?.data?.notifications ?? [];
const bookingNote = notes.find((n) => n.category === "booking_confirmed");
check("inbox has the booking alert (in-app)", Boolean(bookingNote));
check(
  "no email/Telegram delivery claimed for a profile without them",
  !(bookingNote?.deliveries ?? []).some((d) => (d.channel === "email" || d.channel === "telegram") && d.status === "sent"),
);

// 8. Settings endpoints answer with real, secret-free status.
const status = await call("GET", "/api/integrations/status");
check("integration status answers, no secrets", status.status === 200 && !/(AIza|GOCSPX|re_[A-Za-z0-9]{12}|bot\d+:)/.test(status.text));
for (const p of ["/api/me/channels", "/api/me/telegram", "/api/me/google-calendar"]) {
  const r = await call("GET", p);
  check(`settings ${p}`, r.status === 200 && r.json?.ok);
}

// 9. Unfollow, then delete the whole test profile.
const key = (prof.json?.data?.profile?.selections ?? []).find((s) => s.artist.name === "Guns N’ Roses");
const keyOf = (a) => (a.externalIds?.musicbrainz ? `mbid:${a.externalIds.musicbrainz}` : a.id);
const uf = await call("DELETE", `/api/me/artists?key=${encodeURIComponent(keyOf(key.artist))}`);
prof = await call("GET", "/api/me/profile");
check("unfollow persists", uf.json?.ok && (prof.json?.data?.profile?.selections ?? []).length === 1);
const del = await call("DELETE", "/api/me");
check("test profile deleted", del.json?.ok === true);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
