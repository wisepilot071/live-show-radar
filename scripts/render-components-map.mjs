#!/usr/bin/env node
/**
 * Renders docs/diagrams/live-show-radar-components-map.{svg,png}.
 *
 *   node scripts/render-components-map.mjs
 *
 * Documentation tooling only — not imported by the app. The SVG is built in
 * code; the PNG is rasterised with sharp (already present via next), so no
 * new dependency is added. Every box maps to real code; see the .md next to
 * the output for the file each one comes from.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "diagrams");
const BASE = "live-show-radar-components-map";

const W = 3200;
const H = 1800;
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";

const COLORS = {
  user: { fill: "#DCEBFB", stroke: "#5F93CF", label: "User / actor" },
  external: { fill: "#DCF1E0", stroke: "#5DAE78", label: "External service" },
  processing: { fill: "#FFF5C7", stroke: "#CFAA36", label: "App processing (Next.js on Vercel)" },
  ai: { fill: "#F1E2F5", stroke: "#AE72C4", label: "AI (Gemini Flash)" },
  output: { fill: "#FDE2CF", stroke: "#DE8F5C", label: "Output to the fan" },
  storage: { fill: "#E8EBEE", stroke: "#8E98A3", label: "Storage (Supabase Postgres, schema radar)" },
};
const INK = "#1F2A37";
const MUTED = "#5B6675";
const ARROW = "#3B4756";

const COLUMNS = ["Actor", "Trigger", "Input", "Context", "Processing", "AI", "Output"];
const GRID_X0 = 270;
const GRID_X1 = 3160;
const COL_W = (GRID_X1 - GRID_X0) / COLUMNS.length;
const BOX_W = 362;

const LANES = [
  { title: "Follow artists", note: "fan-initiated", h: 180 },
  { title: "Find shows", note: "scheduled + on demand", h: 362 },
  { title: "Alert the fan", note: "same job, after discovery", h: 332 },
  { title: "Browse & book", note: "fan-initiated", h: 268 },
  { title: "Pasted announcement", note: "fan-initiated, private", h: 178 },
];
const LANE_Y0 = 252;
let acc = LANE_Y0;
for (const l of LANES) {
  l.y = acc;
  acc += l.h;
}
const LANES_END = acc;

// ── Boxes ─────────────────────────────────────────────────────────────────
// slot: [index, count] splits the cell vertically.
const BOXES = [
  // 1 · Follow artists
  { id: "fan1", lane: 0, col: 0, kind: "user", title: "Fan", lines: ["Browser, anonymous signed cookie", "Google sign-in links devices"] },
  { id: "trg1", lane: 0, col: 1, kind: "user", title: "Search & follow", lines: ["Onboarding or My Artists"] },
  { id: "in1", lane: 0, col: 2, kind: "processing", title: "Artist query + cities", lines: ["Any artist; home + extra cities"] },
  { id: "ctx1", lane: 0, col: 3, kind: "external", title: "MusicBrainz artist search", lines: ["+ curated catalogue in the repo"] },
  { id: "prc1", lane: 0, col: 4, kind: "processing", title: "/api/me/artists", lines: ["Save follow; after(): quick lookup", "MusicBrainz + Ticketmaster"] },
  { id: "out1", lane: 0, col: 6, kind: "storage", title: "Follows & preferences", lines: ["Postgres · schema radar"] },

  // 2 · Find shows
  { id: "cron", lane: 1, col: 0, slot: [0, 2], kind: "processing", dashed: true, title: "Vercel Cron", lines: ["3 runs a day (scheduler)"] },
  { id: "fan2", lane: 1, col: 0, slot: [1, 2], kind: "user", title: "Fan", lines: ["“Check now” button"] },
  { id: "trgC", lane: 1, col: 1, slot: [0, 2], kind: "processing", dashed: true, title: "/api/cron/monitor", lines: ["01:30 · 09:30 · 17:30 UTC", "Bearer CRON_SECRET"] },
  { id: "trgU", lane: 1, col: 1, slot: [1, 2], kind: "processing", title: "/api/me/discovery", lines: ["Rate limit: 4 per hour"] },
  { id: "in2", lane: 1, col: 2, kind: "processing", title: "Targets", lines: ["Followed artists + catalogue", "Cities due for a news sweep", "Credit check before news calls"] },
  { id: "tm", lane: 1, col: 3, slot: [0, 3], kind: "external", title: "Ticketmaster Discovery v2", lines: ["country IN · 0 Indian events so far"] },
  { id: "mb", lane: 1, col: 3, slot: [1, 3], kind: "external", title: "MusicBrainz events", lines: ["Needs artist MBID · sparse for India"] },
  { id: "news", lane: 1, col: 3, slot: [2, 3], kind: "external", title: "News search + article fetch", lines: ["Google News via ScrapingBee"] },
  { id: "prc2", lane: 1, col: 4, kind: "processing", title: "runDiscovery pipeline", lines: ["Ground: quote, city, date in article", "Normalise · safe ticket URL", "Dedup + upsert with provenance", "Record changes"] },
  { id: "ai2", lane: 1, col: 5, slot: [0, 2], kind: "ai", title: "Gemini Flash", lines: ["Extract dates & cities", "Cached per article"] },
  { id: "out2", lane: 1, col: 6, kind: "storage", title: "Events store", lines: ["events · event_sources", "event_changes · ai_extractions"] },

  // 3 · Alert the fan
  { id: "sys3", lane: 2, col: 0, kind: "processing", title: "Notification pipeline", lines: ["Server job, no user present"] },
  { id: "trg3", lane: 2, col: 1, kind: "processing", title: "New / changed shows", lines: ["From event_changes"] },
  { id: "in3", lane: 2, col: 2, kind: "storage", title: "Each fan’s settings", lines: ["Followed artists, saved shows", "Home + extra cities, channels"] },
  { id: "ctx3", lane: 2, col: 3, kind: "storage", title: "Delivery checks", lines: ["Email confirmed (double opt-in)", "Telegram chat linked"] },
  { id: "prc3", lane: 2, col: 4, kind: "processing", title: "decide()", lines: ["Chosen cities only (saved: always)", "Verified info only", "One digest per artist"] },
  { id: "inbox", lane: 2, col: 6, slot: [0, 3], kind: "output", title: "In-app Inbox", lines: ["Every alert, grouped"] },
  { id: "email", lane: 2, col: 6, slot: [1, 3], kind: "output", title: "Email", lines: ["Resend or SMTP · confirmed only"] },
  { id: "tg", lane: 2, col: 6, slot: [2, 3], kind: "output", title: "Telegram", lines: ["Bot message to linked chat"] },

  // 4 · Browse & book
  { id: "fan4", lane: 3, col: 0, kind: "user", title: "Fan", lines: ["Discover · Radar · event page"] },
  { id: "trgB", lane: 3, col: 1, slot: [0, 2], kind: "user", title: "Opens the radar", lines: ["Show every city (toggle)"] },
  { id: "trgK", lane: 3, col: 1, slot: [1, 2], kind: "user", title: "Taps “I’ve booked”", lines: ["After buying elsewhere"] },
  { id: "inB", lane: 3, col: 2, slot: [0, 2], kind: "processing", title: "/api/me/events", lines: ["+ /api/events/city (public)"] },
  { id: "inK", lane: 3, col: 2, slot: [1, 2], kind: "processing", title: "/api/me/bookings", lines: ["Event id · rate-limited"] },
  { id: "ctxB", lane: 3, col: 3, slot: [0, 2], kind: "storage", title: "Events store", lines: ["Read from lane 2 output"] },
  { id: "ctxK", lane: 3, col: 3, slot: [1, 2], kind: "storage", title: "Google OAuth tokens", lines: ["calendar.events scope"] },
  { id: "prcB", lane: 3, col: 4, slot: [0, 2], kind: "processing", title: "City focus + cards", lines: ["Home → Bengaluru → others ≤60 d"] },
  { id: "prcK", lane: 3, col: 4, slot: [1, 2], kind: "processing", title: "Record booking", lines: ["status user_confirmed · idempotent"] },
  { id: "outB", lane: 3, col: 6, slot: [0, 2], kind: "output", title: "Ticket link (external)", lines: ["Opens seller site; no in-app sale"] },
  { id: "outK", lane: 3, col: 6, slot: [1, 2], kind: "output", title: "Google Calendar event", lines: ["+ booking alert in Inbox"] },

  // 5 · Pasted announcement
  { id: "fan5", lane: 4, col: 0, kind: "user", title: "Fan", lines: ["Pastes a tour post"] },
  { id: "trg5", lane: 4, col: 1, kind: "user", title: "Import announcement", lines: ["Paste text"] },
  { id: "in5", lane: 4, col: 2, kind: "processing", title: "/api/me/announcements", lines: ["Text · rate-limited"] },
  { id: "ctx5", lane: 4, col: 3, kind: "storage", title: "Extraction cache", lines: ["+ known Indian cities"] },
  { id: "prc5", lane: 4, col: 4, kind: "processing", title: "Ground & save", lines: ["Quote + city + date must match"] },
  { id: "ai5", lane: 4, col: 5, slot: [0, 2], dy: 14, kind: "ai", title: "Gemini Flash", lines: [] },
  { id: "out5", lane: 4, col: 6, kind: "output", title: "Private event", lines: ["On the submitter’s radar only"] },
];

// ── Geometry ──────────────────────────────────────────────────────────────
const PAD_T = 14;
const TITLE_H = 27;
const LINE_H = 23;
const PAD_B = 11;
const byId = new Map();
for (const b of BOXES) {
  const lane = LANES[b.lane];
  const [si, sn] = b.slot ?? [0, 1];
  const innerTop = lane.y + 16;
  const innerH = lane.h - 32;
  const slotH = innerH / sn;
  b.h = PAD_T + TITLE_H + b.lines.length * LINE_H + PAD_B;
  if (b.h > slotH - 8) throw new Error(`box ${b.id} (${b.h}px) does not fit its slot (${slotH.toFixed(0)}px)`);
  b.w = BOX_W;
  b.x = GRID_X0 + b.col * COL_W + (COL_W - BOX_W) / 2;
  b.y = innerTop + si * slotH + (slotH - b.h) / 2 + (b.dy ?? 0);
  byId.set(b.id, b);
}
const box = (id) => {
  const b = byId.get(id);
  if (!b) throw new Error(`unknown box ${id}`);
  return b;
};
const right = (b) => b.x + b.w;
const midY = (b) => b.y + b.h / 2;
// A y inside the vertical overlap of two boxes, so a straight arrow touches both.
function overlapY(aId, bId, frac) {
  const a = box(aId);
  const b = box(bId);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (bottom - top < 30) throw new Error(`${aId} and ${bId} overlap only ${bottom - top}px`);
  return top + (bottom - top) * frac;
}

// ── Edges ─────────────────────────────────────────────────────────────────
// Same-lane edges: straight when the boxes overlap vertically, else an elbow.
// dashed = scheduled / asynchronous.
const EDGES = [
  ["fan1", "trg1"], ["trg1", "in1"], ["in1", "ctx1"], ["ctx1", "prc1"], ["prc1", "out1"],

  ["cron", "trgC", { dashed: true }], ["fan2", "trgU"],
  ["trgC", "in2", { dashed: true }], ["trgU", "in2"],
  ["in2", "tm"], ["in2", "mb"], ["in2", "news"],
  ["tm", "prc2"], ["mb", "prc2"], ["news", "prc2"],
  ["prc2", "ai2", { y: () => overlapY("prc2", "ai2", 0.3) }],
  ["ai2", "prc2", { y: () => overlapY("prc2", "ai2", 0.75) }],
  ["prc2", "out2", { y: () => box("prc2").y + box("prc2").h - 22, y2: () => box("prc2").y + box("prc2").h - 22 }],

  ["sys3", "trg3"], ["trg3", "in3"], ["in3", "ctx3"], ["ctx3", "prc3"],
  ["prc3", "inbox"], ["prc3", "email"], ["prc3", "tg"],

  ["fan4", "trgB"], ["fan4", "trgK"],
  ["trgB", "inB"], ["inB", "ctxB"], ["ctxB", "prcB"], ["prcB", "outB"],
  ["trgK", "inK"], ["inK", "ctxK"], ["ctxK", "prcK"], ["prcK", "outK"],

  ["fan5", "trg5"], ["trg5", "in5"], ["in5", "ctx5"], ["ctx5", "prc5"],
  ["prc5", "ai5", { y: () => overlapY("prc5", "ai5", 0.28) }],
  ["ai5", "prc5", { y: () => overlapY("prc5", "ai5", 0.78) }],
  ["prc5", "out5", { y: () => box("prc5").y + box("prc5").h - 16, y2: () => box("prc5").y + box("prc5").h - 16 }],
];

function edgePath(fromId, toId, opt = {}) {
  const a = box(fromId);
  const b = box(toId);
  const backwards = a.x > b.x;
  const x1 = backwards ? a.x : right(a);
  const x2 = backwards ? right(b) : b.x - 4;
  const fixedY = opt.y?.();
  if (fixedY !== undefined) {
    const y2 = opt.y2?.() ?? fixedY;
    return `M${x1},${fixedY} L${backwards ? x2 + 4 : x2},${y2}`;
  }
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (bottom - top > 24) {
    const y = (top + bottom) / 2;
    return `M${x1},${y} L${x2},${y}`;
  }
  const mx = (x1 + x2) / 2;
  const r = 10;
  const y1 = midY(a);
  const y2 = midY(b);
  const s = Math.sign(y2 - y1);
  return `M${x1},${y1} H${mx - r} Q${mx},${y1} ${mx},${y1 + s * r} V${y2 - s * r} Q${mx},${y2} ${mx + r},${y2} H${x2}`;
}

// Cross-lane edges routed along lane boundaries so they never cross a box.
function crossLane(fromId, toId, laneBoundaryY, fromXFrac = 0.5) {
  const a = box(fromId);
  const b = box(toId);
  const sx = a.x + a.w * fromXFrac;
  const tx = b.x + b.w / 2;
  const r = 12;
  const s = Math.sign(tx - sx);
  return `M${sx},${a.y + a.h} V${laneBoundaryY - r} Q${sx},${laneBoundaryY} ${sx + s * r},${laneBoundaryY} H${tx - s * r} Q${tx},${laneBoundaryY} ${tx},${laneBoundaryY + r} V${b.y - 4}`;
}
const CROSS = [
  { d: () => crossLane("out1", "in2", LANES[1].y, 0.5), dashed: true, label: "read on the next run", at: () => [box("ctx1").x + box("ctx1").w / 2 + 210, LANES[1].y] },
  { d: () => crossLane("out2", "trg3", LANES[2].y, 0.5), dashed: false, label: "same job, right after discovery", at: () => [box("ctx3").x + box("ctx3").w / 2 + 210, LANES[2].y] },
];

// ── SVG ───────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textWidth = (s, px, bold) => s.length * px * (bold ? 0.56 : 0.5);
const overflow = [];

function renderBox(b) {
  const c = COLORS[b.kind];
  const cx = b.x + b.w / 2;
  const parts = [
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.5"${b.dashed ? ' stroke-dasharray="10 7"' : ""}/>`,
    `<text x="${cx}" y="${b.y + PAD_T + 20}" text-anchor="middle" font-size="21" font-weight="700" fill="${INK}">${esc(b.title)}</text>`,
  ];
  if (textWidth(b.title, 21, true) > b.w - 24) overflow.push(`${b.id}: "${b.title}"`);
  b.lines.forEach((l, i) => {
    if (textWidth(l, 16.5, false) > b.w - 24) overflow.push(`${b.id}: "${l}"`);
    parts.push(`<text x="${cx}" y="${b.y + PAD_T + TITLE_H + 17 + i * LINE_H}" text-anchor="middle" font-size="16.5" fill="${MUTED}">${esc(l)}</text>`);
  });
  return parts.join("\n");
}

function label(text, [x, y]) {
  const w = textWidth(text, 15, true) + 24;
  return `<rect x="${x - w / 2}" y="${y - 15}" width="${w}" height="30" rx="15" fill="#FFFFFF" stroke="${ARROW}" stroke-width="1.2"/>
<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="600" fill="${ARROW}">${esc(text)}</text>`;
}

const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
svg.push(`<defs><marker id="arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M1,1 L11,6 L1,11 Z" fill="${ARROW}"/></marker></defs>`);
svg.push(`<rect width="${W}" height="${H}" fill="#FAFBFC"/>`);

// Title
svg.push(`<text x="40" y="92" font-size="54" font-weight="800" fill="${INK}">Live Show Radar — Components Map</text>`);
svg.push(`<text x="42" y="140" font-size="25" fill="${MUTED}">Artist tracking, concert discovery, event processing and alerts · mapped from the repository code</text>`);

// Column headers
COLUMNS.forEach((c, i) => {
  const x = GRID_X0 + i * COL_W + 14;
  svg.push(`<rect x="${x}" y="186" width="${COL_W - 28}" height="48" rx="24" fill="${INK}"/>`);
  svg.push(`<text x="${x + (COL_W - 28) / 2}" y="218" text-anchor="middle" font-size="22" font-weight="700" fill="#FFFFFF" letter-spacing="1">${c.toUpperCase()}</text>`);
});

// Lanes
LANES.forEach((l, i) => {
  svg.push(`<rect x="40" y="${l.y}" width="${GRID_X1 - 40}" height="${l.h}" fill="${i % 2 ? "#F1F4F7" : "#FFFFFF"}" stroke="#DCE1E7" stroke-width="1.5"/>`);
  svg.push(`<text x="60" y="${l.y + l.h / 2 - 6}" font-size="15" font-weight="700" fill="${MUTED}" letter-spacing="1">LANE ${i + 1}</text>`);
  svg.push(`<text x="60" y="${l.y + l.h / 2 + 22}" font-size="23" font-weight="800" fill="${INK}">${esc(l.title.length > 15 ? l.title.split(" ")[0] : l.title)}</text>`);
  if (l.title.length > 15) svg.push(`<text x="60" y="${l.y + l.h / 2 + 50}" font-size="23" font-weight="800" fill="${INK}">${esc(l.title.split(" ").slice(1).join(" "))}</text>`);
  svg.push(`<text x="60" y="${l.y + l.h / 2 + (l.title.length > 15 ? 76 : 48)}" font-size="15" fill="${MUTED}">${esc(l.note)}</text>`);
});
// Column guides
for (let i = 1; i < COLUMNS.length; i++) {
  const x = GRID_X0 + i * COL_W;
  svg.push(`<line x1="${x}" y1="${LANE_Y0}" x2="${x}" y2="${LANES_END}" stroke="#D3D9E0" stroke-width="1.2" stroke-dasharray="4 8"/>`);
}
svg.push(`<line x1="${GRID_X0}" y1="${LANE_Y0}" x2="${GRID_X0}" y2="${LANES_END}" stroke="#C9D0D8" stroke-width="1.5"/>`);

// Edges under boxes
for (const [f, t, opt = {}] of EDGES) {
  svg.push(`<path d="${edgePath(f, t, opt)}" fill="none" stroke="${ARROW}" stroke-width="2.6"${opt.dashed ? ' stroke-dasharray="11 8"' : ""} marker-end="url(#arrow)"/>`);
}
for (const c of CROSS) {
  svg.push(`<path d="${c.d()}" fill="none" stroke="${ARROW}" stroke-width="2.6"${c.dashed ? ' stroke-dasharray="11 8"' : ""} marker-end="url(#arrow)"/>`);
}
for (const b of BOXES) svg.push(renderBox(b));
for (const c of CROSS) svg.push(label(c.label, c.at()));

// Legend + status notes
const LY = LANES_END + 26;
svg.push(`<rect x="40" y="${LY}" width="${GRID_X1 - 40}" height="${H - LY - 24}" rx="16" fill="#FFFFFF" stroke="#DCE1E7" stroke-width="1.5"/>`);
svg.push(`<text x="64" y="${LY + 38}" font-size="18" font-weight="800" fill="${INK}" letter-spacing="1">LEGEND</text>`);
const legendKinds = Object.values(COLORS);
legendKinds.forEach((c, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = 64 + col * 470;
  const y = LY + 58 + row * 40;
  svg.push(`<rect x="${x}" y="${y}" width="40" height="26" rx="6" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>`);
  svg.push(`<text x="${x + 52}" y="${y + 19}" font-size="17" fill="${INK}">${esc(c.label)}</text>`);
});
const ax = 1500;
svg.push(`<line x1="${ax}" y1="${LY + 71}" x2="${ax + 80}" y2="${LY + 71}" stroke="${ARROW}" stroke-width="2.6" marker-end="url(#arrow)"/>`);
svg.push(`<text x="${ax + 96}" y="${LY + 77}" font-size="17" fill="${INK}">Request / synchronous step</text>`);
svg.push(`<line x1="${ax}" y1="${LY + 111}" x2="${ax + 80}" y2="${LY + 111}" stroke="${ARROW}" stroke-width="2.6" stroke-dasharray="11 8" marker-end="url(#arrow)"/>`);
svg.push(`<text x="${ax + 96}" y="${LY + 117}" font-size="17" fill="${INK}">Scheduled / picked up later</text>`);
svg.push(`<rect x="${ax}" y="${LY + 24}" width="34" height="22" rx="6" fill="#FFFFFF" stroke="${ARROW}" stroke-width="2" stroke-dasharray="6 4"/>`);
svg.push(`<text x="${ax + 46}" y="${LY + 41}" font-size="17" fill="${INK}">Dashed border = scheduled trigger</text>`);

const NX = 2010;
svg.push(`<text x="${NX}" y="${LY + 38}" font-size="18" font-weight="800" fill="${INK}" letter-spacing="1">NOT SHOWN AS ACTIVE</text>`);
[
  "Bandsintown — adapter exists, no API key configured",
  "Spotify — “Coming soon” in the UI, no integration",
  "Gmail — not used; email goes through Resend or SMTP",
  "No background worker — only cron runs and requests",
].forEach((t, i) => svg.push(`<text x="${NX}" y="${LY + 70 + i * 25}" font-size="16.5" fill="${MUTED}">• ${esc(t)}</text>`));

svg.push(`<text x="${GRID_X1 - 24}" y="${H - 46}" text-anchor="end" font-size="14" fill="#8A94A0">Generated by scripts/render-components-map.mjs</text>`);
svg.push(`</svg>`);

if (overflow.length) {
  console.error("Text likely too wide for its box:\n  " + overflow.join("\n  "));
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const svgText = svg.join("\n");
writeFileSync(join(OUT_DIR, `${BASE}.svg`), svgText);
await sharp(Buffer.from(svgText), { density: 72 }).png().toFile(join(OUT_DIR, `${BASE}.png`));
const meta = await sharp(join(OUT_DIR, `${BASE}.png`)).metadata();
console.log(`wrote ${BASE}.svg and ${BASE}.png (${meta.width}×${meta.height}) to docs/diagrams`);
