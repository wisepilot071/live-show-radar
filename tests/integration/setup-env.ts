/**
 * Loads .env.local for integration tests (Vitest doesn't). Integration tests
 * are skipped entirely when DATABASE_URL isn't set, so the unit suite runs
 * anywhere without credentials.
 */
import { existsSync, readFileSync } from "node:fs";

const path = new URL("../../.env.local", import.meta.url);
if (existsSync(path)) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
export const HAS_DB = Boolean(process.env.DATABASE_URL);
