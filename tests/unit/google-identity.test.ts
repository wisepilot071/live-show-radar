import { describe, expect, it } from "vitest";
import { identityFromIdToken } from "@/integrations/google/calendar";

const tok = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("identityFromIdToken", () => {
  it("reads sub + verified email for our client from Google's issuer", () => {
    expect(identityFromIdToken(tok({ iss: "https://accounts.google.com", aud: "CID", sub: "123", email: "A@x.test", email_verified: true }), "CID")).toEqual({
      sub: "123",
      email: "a@x.test",
      emailVerified: true,
    });
  });
  it("rejects other issuers, other audiences, missing sub and garbage", () => {
    expect(identityFromIdToken(tok({ iss: "https://evil.test", aud: "CID", sub: "1" }), "CID")).toBeUndefined();
    expect(identityFromIdToken(tok({ iss: "accounts.google.com", aud: "OTHER", sub: "1" }), "CID")).toBeUndefined();
    expect(identityFromIdToken(tok({ iss: "accounts.google.com", aud: "CID" }), "CID")).toBeUndefined();
    expect(identityFromIdToken("not-a-jwt", "CID")).toBeUndefined();
    expect(identityFromIdToken(undefined, "CID")).toBeUndefined();
  });
});
