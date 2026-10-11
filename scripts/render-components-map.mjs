#!/usr/bin/env node
/**
 * Renders docs/diagrams/live-show-radar-components-map.{svg,png}.
 *
 *   node scripts/render-components-map.mjs
 *
 * Documentation tooling only — not imported by the app. The SVG is built in
 * code; the PNG is rasterised with sharp (already present via next), so no
 * new dependency is added. A deliberately simple, high-level map: one box per
 * step, plain labels. The .md next to the output lists the code behind each box.
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
  user: { fill: "#DCEBFB", stroke: "#5F93CF", label: "User" },
  external: { fill: "#DCF1E0", stroke: "#5DAE78", label: "External service" },
  processing: { fill: "#FFF5C7", stroke: "#CFAA36", label: "App logic" },
  ai: { fill: "#F1E2F5", stroke: "#AE72C4", label: "AI (Gemini)" },
  output: { fill: "#FDE2CF", stroke: "#DE8F5C", label: "Output" },
  storage: { fill: "#E8EBEE", stroke: "#8E98A3", label: "Database" },
};
const INK = "#1F2A37";
const MUTED = "#4F5B6A";
const ARROW = "#3B4756";

const COLUMNS = ["Actor", "Trigger", "Input", "Context", "Processing", "AI", "Output"];
const GRID_X0 = 300;
const GRID_X1 = 3160;
const COL_W = (GRID_X1 - GRID_X0) / COLUMNS.length;
const BOX_W = 360;
const BOX_H = 150;

const LANES = [
  { title: ["Follow", "artists"] },
  { title: ["Find", "concerts"] },
  { title: ["Alert", "the fan"] },
  { title: ["See &", "book"] },
];
const LANE_Y0 = 270;
const LANE_H = 328;
LANES.forEach((l, i) => (l.y = LANE_Y0 + i * LANE_H));
const LANES_END = LANE_Y0 + LANES.length * LANE_H;

// One box per cell. `lines` = at most two short lines under the title.
const BOXES = [
  { id: "fan1", lane: 0, col: 0, kind: "user", title: "Fan", lines: ["Any fan, any device"] },
  { id: "trg1", lane: 0, col: 1, kind: "user", title: "Picks artists", lines: ["and home city"] },
  { id: "in1", lane: 0, col: 2, kind: "processing", title: "Artist + city", lines: ["Any artist can be searched"] },
  { id: "ctx1", lane: 0, col: 3, kind: "external", title: "MusicBrainz", lines: ["Artist search"] },
  { id: "prc1", lane: 0, col: 4, kind: "processing", title: "Save follows", lines: ["Quick show lookup"] },
  { id: "out1", lane: 0, col: 6, kind: "storage", title: "Followed artists", lines: ["Saved per fan"] },

  { id: "fan2", lane: 1, col: 0, kind: "processing", dashed: true, title: "Scheduler", lines: ["Vercel Cron, 3× a day"] },
  { id: "trg2", lane: 1, col: 1, kind: "processing", dashed: true, title: "Scheduled check", lines: ["or fan taps “Check now”"] },
  { id: "in2", lane: 1, col: 2, kind: "storage", title: "Followed artists", lines: ["+ cities to watch"] },
  { id: "ctx2", lane: 1, col: 3, kind: "external", title: "Event sources", lines: ["Ticketmaster · MusicBrainz", "News articles"] },
  { id: "prc2", lane: 1, col: 4, kind: "processing", title: "Verify & store", lines: ["Fact-check every date", "Remove duplicates"] },
  { id: "ai2", lane: 1, col: 5, kind: "ai", title: "Gemini Flash", lines: ["Reads news articles", "for dates & cities"] },
  { id: "out2", lane: 1, col: 6, kind: "storage", title: "Concert list", lines: ["Real, upcoming shows only"] },

  { id: "fan3", lane: 2, col: 0, kind: "processing", title: "Alert engine", lines: ["Runs after each check"] },
  { id: "trg3", lane: 2, col: 1, kind: "processing", title: "New show found", lines: ["or details changed"] },
  { id: "in3", lane: 2, col: 2, kind: "processing", title: "Show details", lines: ["Artist, date, city, link"] },
  { id: "ctx3", lane: 2, col: 3, kind: "storage", title: "Fan settings", lines: ["Cities + alert channels"] },
  { id: "prc3", lane: 2, col: 4, kind: "processing", title: "Match & group", lines: ["Fan’s cities only", "One message per artist"] },
  { id: "out3", lane: 2, col: 6, kind: "output", title: "Alerts", lines: ["Inbox · Email · Telegram"] },

  { id: "fan4", lane: 3, col: 0, kind: "user", title: "Fan", lines: ["Opens the app"] },
  { id: "trg4", lane: 3, col: 1, kind: "user", title: "Views shows", lines: ["Taps “I’ve booked”"] },
  { id: "in4", lane: 3, col: 2, kind: "storage", title: "Concert list", lines: ["Home city first,", "then Bengaluru"] },
  { id: "ctx4", lane: 3, col: 3, kind: "external", title: "Ticket seller", lines: ["Fan buys tickets there"] },
  { id: "prc4", lane: 3, col: 4, kind: "processing", title: "Record booking", lines: ["Confirmed by the fan"] },
  { id: "out4", lane: 3, col: 6, kind: "output", title: "Google Calendar", lines: ["+ booking alert"] },
];

const byId = new Map();
for (const b of BOXES) {
  b.w = BOX_W;
  b.h = BOX_H;
  b.x = GRID_X0 + b.col * COL_W + (COL_W - BOX_W) / 2;
  b.y = LANES[b.lane].y + (LANE_H - BOX_H) / 2;
  byId.set(b.id, b);
}
const box = (id) => byId.get(id);

// Same-lane arrows (straight). Processing ↔ AI is drawn as a pair.
const EDGES = [
  ["fan1", "trg1"], ["trg1", "in1"], ["in1", "ctx1"], ["ctx1", "prc1"], ["prc1", "out1"],
  ["fan2", "trg2", true], ["trg2", "in2"], ["in2", "ctx2"], ["ctx2", "prc2"], ["ai2", "out2"],
  ["fan3", "trg3"], ["trg3", "in3"], ["in3", "ctx3"], ["ctx3", "prc3"], ["prc3", "out3"],
  ["fan4", "trg4"], ["trg4", "in4"], ["in4", "ctx4"], ["ctx4", "prc4"], ["prc4", "out4"],
];
function straight(a, b, y) {
  return `M${a.x + a.w},${y} L${b.x - 4},${y}`;
}
const arrow = (d, dashed) =>
  `<path d="${d}" fill="none" stroke="${ARROW}" stroke-width="3.5"${dashed ? ' stroke-dasharray="14 10"' : ""} marker-end="url(#arrow)"/>`;

// Cross-lane: down from the source box to the lane boundary, across, down into the target.
function crossLane(fromId, toId) {
  const a = box(fromId);
  const b = box(toId);
  const yb = LANES[b.lane].y;
  const sx = a.x + a.w / 2;
  const tx = b.x + b.w / 2;
  const r = 14;
  return `M${sx},${a.y + a.h} V${yb - r} Q${sx},${yb} ${sx - r},${yb} H${tx + r} Q${tx},${yb} ${tx},${yb + r} V${b.y - 4}`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textWidth = (s, px, bold) => s.length * px * (bold ? 0.56 : 0.5);
const overflow = [];

function renderBox(b) {
  const c = COLORS[b.kind];
  const cx = b.x + b.w / 2;
  const block = 36 + b.lines.length * 30;
  const top = b.y + (b.h - block) / 2;
  const out = [
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="18" fill="${c.fill}" stroke="${c.stroke}" stroke-width="3"${b.dashed ? ' stroke-dasharray="12 8"' : ""}/>`,
    `<text x="${cx}" y="${top + 28}" text-anchor="middle" font-size="29" font-weight="700" fill="${INK}">${esc(b.title)}</text>`,
  ];
  if (textWidth(b.title, 29, true) > b.w - 24) overflow.push(`${b.id}: "${b.title}"`);
  b.lines.forEach((l, i) => {
    if (textWidth(l, 21, false) > b.w - 24) overflow.push(`${b.id}: "${l}"`);
    out.push(`<text x="${cx}" y="${top + 66 + i * 30}" text-anchor="middle" font-size="21" fill="${MUTED}">${esc(l)}</text>`);
  });
  return out.join("\n");
}
function pill(text, x, y) {
  const w = textWidth(text, 19, true) + 32;
  return `<rect x="${x - w / 2}" y="${y - 19}" width="${w}" height="38" rx="19" fill="#FFFFFF" stroke="${ARROW}" stroke-width="1.5"/>
<text x="${x}" y="${y + 7}" text-anchor="middle" font-size="19" font-weight="600" fill="${ARROW}">${esc(text)}</text>`;
}

const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
svg.push(`<defs><marker id="arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto"><path d="M1,1 L11,6 L1,11 Z" fill="${ARROW}"/></marker></defs>`);
svg.push(`<rect width="${W}" height="${H}" fill="#FAFBFC"/>`);
svg.push(`<text x="40" y="96" font-size="60" font-weight="800" fill="${INK}">Live Show Radar — Components Map</text>`);
svg.push(`<text x="42" y="150" font-size="28" fill="${MUTED}">Artist tracking, concert discovery, event processing and alerts</text>`);

COLUMNS.forEach((c, i) => {
  const x = GRID_X0 + i * COL_W + 16;
  svg.push(`<rect x="${x}" y="196" width="${COL_W - 32}" height="54" rx="27" fill="${INK}"/>`);
  svg.push(`<text x="${x + (COL_W - 32) / 2}" y="232" text-anchor="middle" font-size="24" font-weight="700" fill="#FFFFFF" letter-spacing="1.5">${c.toUpperCase()}</text>`);
});

LANES.forEach((l, i) => {
  svg.push(`<rect x="40" y="${l.y}" width="${GRID_X1 - 40}" height="${LANE_H}" fill="${i % 2 ? "#F1F4F7" : "#FFFFFF"}" stroke="#DCE1E7" stroke-width="1.5"/>`);
  svg.push(`<text x="66" y="${l.y + LANE_H / 2 - 30}" font-size="18" font-weight="700" fill="${MUTED}" letter-spacing="1.5">${i + 1}</text>`);
  l.title.forEach((t, j) => svg.push(`<text x="66" y="${l.y + LANE_H / 2 + 6 + j * 36}" font-size="31" font-weight="800" fill="${INK}">${esc(t)}</text>`));
});
for (let i = 0; i < COLUMNS.length; i++) {
  const x = GRID_X0 + i * COL_W;
  svg.push(
    i === 0
      ? `<line x1="${x}" y1="${LANE_Y0}" x2="${x}" y2="${LANES_END}" stroke="#C9D0D8" stroke-width="1.5"/>`
      : `<line x1="${x}" y1="${LANE_Y0}" x2="${x}" y2="${LANES_END}" stroke="#D8DDE3" stroke-width="1.2" stroke-dasharray="4 10"/>`,
  );
}

for (const [f, t, dashed] of EDGES) {
  const a = box(f);
  svg.push(arrow(straight(a, box(t), a.y + a.h / 2), dashed));
}
// Processing ↔ Gemini: article text goes to Gemini, extracted dates come back to be fact-checked.
const p2 = box("prc2");
const g2 = box("ai2");
svg.push(arrow(straight(p2, g2, p2.y + 48)));
svg.push(arrow(`M${g2.x},${p2.y + p2.h - 48} L${p2.x + p2.w + 4},${p2.y + p2.h - 48}`));
svg.push(arrow(crossLane("out1", "in2"), true));
svg.push(arrow(crossLane("out2", "trg3")));
for (const b of BOXES) svg.push(renderBox(b));
svg.push(pill("used on every check", (box("ctx1").x + box("out1").x) / 2 + 180, LANES[1].y));
svg.push(pill("new shows trigger alerts", (box("ctx2").x + box("out2").x) / 2 + 180, LANES[2].y));

// Legend
const LY = LANES_END + 40;
svg.push(`<rect x="40" y="${LY}" width="${GRID_X1 - 40}" height="${H - LY - 40}" rx="18" fill="#FFFFFF" stroke="#DCE1E7" stroke-width="1.5"/>`);
let lx = 80;
for (const c of Object.values(COLORS)) {
  svg.push(`<rect x="${lx}" y="${LY + 40}" width="52" height="34" rx="8" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.5"/>`);
  svg.push(`<text x="${lx + 66}" y="${LY + 65}" font-size="23" fill="${INK}">${esc(c.label)}</text>`);
  lx += 66 + textWidth(c.label, 23, false) + 70;
}
svg.push(arrow(`M${lx},${LY + 57} L${lx + 90},${LY + 57}`));
svg.push(`<text x="${lx + 106}" y="${LY + 65}" font-size="23" fill="${INK}">Direct step</text>`);
lx += 106 + textWidth("Direct step", 23, false) + 70;
svg.push(arrow(`M${lx},${LY + 57} L${lx + 90},${LY + 57}`, true));
svg.push(`<text x="${lx + 106}" y="${LY + 65}" font-size="23" fill="${INK}">Scheduled</text>`);
svg.push(
  `<text x="80" y="${LY + 126}" font-size="21" fill="${MUTED}">Not active yet: Bandsintown (no key) · Spotify (coming soon). Email is sent via Resend, not Gmail. Every alert uses verified info only — nothing is invented.</text>`,
);
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
