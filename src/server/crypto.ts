import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/config/server-env";

/**
 * Encryption for third-party tokens at rest (Google OAuth tokens).
 * AES-256-GCM with a random 96-bit IV; output "v1.<iv>.<tag>.<ciphertext>" (base64url).
 * Key: TOKEN_ENCRYPTION_KEY (32 bytes, base64url) or, if unset, HKDF-SHA256 of
 * SESSION_SECRET with a fixed label — so tokens are never stored in plaintext.
 * Rotating the key invalidates stored tokens (users reconnect).
 */
function key(): Buffer {
  const env = getServerEnv();
  if (env.tokenEncryptionKey) {
    const k = Buffer.from(env.tokenEncryptionKey, "base64url");
    if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (base64url)");
    return k;
  }
  if (!env.sessionSecret) throw new Error("No key available for token encryption");
  return Buffer.from(hkdfSync("sha256", env.sessionSecret, "live-show-radar", "oauth-token-encryption-v1", 32));
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** URL-safe random token, e.g. for single-use links. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
