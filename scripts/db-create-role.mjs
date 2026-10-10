#!/usr/bin/env node
/**
 * Creates credentials for the least-privilege `lsr_app` database role
 * WITHOUT the password ever leaving this machine.
 *
 *   node scripts/db-create-role.mjs <project-ref> <pooler-host>
 *
 * 1. Generates a random 32-char password.
 * 2. Writes DATABASE_URL (Supabase transaction pooler, port 6543) to .env.local.
 * 3. Prints `create role … password 'SCRAM-SHA-256$…'` — a one-way verifier
 *    that Postgres accepts in place of a plaintext password. Run that SQL in
 *    the Supabase SQL editor (or via the Supabase MCP), then apply
 *    db/migrations/0002_app_role.sql.
 *
 * Re-running rotates the password: it prints `alter role` instead.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [ref, host, mode = "create"] = process.argv.slice(2);
if (!ref || !host) {
  console.error("usage: node scripts/db-create-role.mjs <project-ref> <pooler-host> [create|rotate]");
  process.exit(1);
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const password = Array.from(randomBytes(32), (b) => alphabet[b % alphabet.length]).join("");

// RFC 5802 / RFC 7677 SCRAM-SHA-256 verifier, as stored by Postgres.
const iterations = 4096;
const salt = randomBytes(16);
const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const clientKey = createHmac("sha256", salted).update("Client Key").digest();
const storedKey = createHash("sha256").update(clientKey).digest();
const serverKey = createHmac("sha256", salted).update("Server Key").digest();
const verifier = `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;

const url = `postgresql://lsr_app.${ref}:${password}@${host}:6543/postgres?sslmode=require`;
const envPath = new URL("../.env.local", import.meta.url);
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
env = env.replace(/^DATABASE_URL=.*\n?/m, "");
if (env && !env.endsWith("\n")) env += "\n";
env += `DATABASE_URL=${url}\n`;
writeFileSync(envPath, env, { mode: 0o600 });

const verb = mode === "rotate" ? "alter" : "create";
console.log(`-- DATABASE_URL written to .env.local (password not shown).`);
console.log(`${verb} role lsr_app ${verb === "create" ? "login " : ""}password '${verifier}';`);
