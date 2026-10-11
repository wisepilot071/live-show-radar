#!/usr/bin/env node
/**
 * Lists every heading / title / eyebrow / button label in src/ (static text only), one per line,
 * sorted. Used to prove a visual refactor didn't change UI copy:
 *   node scripts/extract-ui-text.mjs > before.txt   …edit…   node scripts/extract-ui-text.mjs | diff before.txt -
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
})("src");

const clean = (s) =>
  s
    .replace(/\{[^{}]*\}/g, "{…}")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
const out = new Set();
for (const f of files) {
  const s = readFileSync(f, "utf8");
  const file = f.split(sep).join("/").replace(/^src\//, "");
  for (const m of s.matchAll(/<(h[1-6]|Button|ButtonLink|Eyebrow|button|Link)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = clean(m[2]);
    if (t && t !== "{…}") out.add(`${file} | ${m[1]} | ${t}`);
  }
  for (const m of s.matchAll(/\b(title|eyebrow|label|description)=(?:"([^"]+)"|\{`([^`]+)`\})/g)) out.add(`${file} | ${m[1]}= | ${m[2] ?? m[3]}`);
  for (const m of s.matchAll(/\b(title|label|eyebrow): "([^"]+)"/g)) out.add(`${file} | ${m[1]}: | ${m[2]}`);
}
console.log([...out].sort().join("\n"));
