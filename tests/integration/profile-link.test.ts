/** Google sign-in profile linking against the real DB with ISOLATED TEST users (deleted afterwards). */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_DB } from "./setup-env";
import { getSql } from "@/server/db";
import { adoptGoogleEmail, findProfileForGoogle, mergeProfileInto } from "@/server/profile-link";

const main = randomUUID();
const phone = randomUUID();
const stranger = randomUUID();
const RUN = randomUUID().slice(0, 8);
const artistA = randomUUID();
const artistB = randomUUID();
const SUB = `TEST-sub-${RUN}`;
const EMAIL = `test-${RUN}@example.test`;

describe.skipIf(!HAS_DB)("profile linking (isolated TEST records)", () => {
  beforeAll(async () => {
    const sql = getSql();
    await sql`insert into radar.users (id) values (${main}), (${phone}), (${stranger})`;
    await sql`insert into radar.artists (id, catalogue_key, name, origin) values
      (${artistA}, ${`test:${RUN}:a`}, ${`TEST A ${RUN}`}, 'event_source'), (${artistB}, ${`test:${RUN}:b`}, ${`TEST B ${RUN}`}, 'event_source')`;
    await sql`insert into radar.user_artists (user_id, artist_id, added_via) values (${main}, ${artistA}, 'manual'), (${phone}, ${artistA}, 'manual'), (${phone}, ${artistB}, 'manual')`;
    await sql`insert into radar.google_calendar_connections (user_id, scope, google_sub) values (${main}, 'TEST', ${SUB})`;
    // A stranger typed the address but never confirmed it: must never match.
    await sql`insert into radar.user_preferences (user_id, email_address) values (${stranger}, ${EMAIL})`;
  });
  afterAll(async () => {
    const sql = getSql();
    await sql`delete from radar.users where id in (${main}, ${phone}, ${stranger})`;
    await sql`delete from radar.artists where id in (${artistA}, ${artistB})`;
    await sql.end({ timeout: 2 });
    globalThis.__lsrSql = undefined;
  });

  it("finds the existing profile by Google account id, never by an unconfirmed email", async () => {
    expect(await findProfileForGoogle({ sub: SUB, emailVerified: true }, phone)).toBe(main);
    expect(await findProfileForGoogle({ sub: "TEST-other", email: EMAIL, emailVerified: true }, phone)).toBeNull();
  });

  it("matches a CONFIRMED email", async () => {
    await getSql()`update radar.user_preferences set email_verified_address = email_address where user_id = ${stranger}`;
    expect(await findProfileForGoogle({ sub: "TEST-other", email: EMAIL, emailVerified: true }, phone)).toBe(stranger);
    expect(await findProfileForGoogle({ sub: "TEST-other", email: EMAIL, emailVerified: false }, phone)).toBeNull();
  });

  it("merge copies what's new, keeps existing rows, deletes nothing", async () => {
    const r = await mergeProfileInto(phone, main);
    expect(r.artists).toBe(1); // only artist B was new
    const rows = await getSql()<{ user_id: string }[]>`select user_id from radar.user_artists where artist_id in (${artistA}, ${artistB})`;
    expect(rows.filter((x) => x.user_id === main)).toHaveLength(2);
    expect(rows.filter((x) => x.user_id === phone)).toHaveLength(2);
  });

  it("adopts a Google-verified email only when the profile has none (or the same one)", async () => {
    expect(await adoptGoogleEmail(main, { sub: SUB, email: `g-${RUN}@example.test`, emailVerified: true })).toBe(true);
    expect(await adoptGoogleEmail(main, { sub: SUB, email: `other-${RUN}@example.test`, emailVerified: true })).toBe(false);
    expect(await adoptGoogleEmail(phone, { sub: SUB, email: `x-${RUN}@example.test`, emailVerified: false })).toBe(false);
  });
});
