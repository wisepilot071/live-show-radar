import { ApiError, GoogleGenAI } from "@google/genai";
import { getServerEnv } from "@/config/server-env";
import { log } from "@/server/log";

/**
 * Server-only Gemini client (official @google/genai SDK).
 * - Model id comes from GEMINI_MODEL (default in server-env), never hardcoded elsewhere.
 * - Structured output: responseMimeType JSON + responseJsonSchema.
 * - Timeout per call, bounded retries on 429/5xx/timeouts only.
 * - Errors are categorised; prompts/outputs are never logged.
 */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly category: "not_configured" | "ai_unavailable" | "ai_rate_limited" | "ai_invalid_output" | "timeout",
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/**
 * Key failover. Keys are tried in order (GEMINI_API_KEY, then GEMINI_API_KEYS).
 * A key Google rejects as invalid / expired / revoked (401, 403, or 400 with a
 * key error) is skipped for KEY_COOLDOWN_MS and the next key is used. Rate
 * limits (429) do NOT rotate keys — they keep the normal retry + fallback-model
 * behaviour (spreading load over keys to dodge quotas isn't allowed by the API terms).
 * Keys are never logged; only their position in the list.
 */
const clients = new Map<string, GoogleGenAI>();
const rejectedUntil = new Map<string, number>();
const KEY_COOLDOWN_MS = 60 * 60_000;

class KeyRejectedError extends Error {}

export function geminiStatus(): { configured: boolean; model: string; fallbackModel?: string; keys: number } {
  const { apiKeys, model, fallbackModel } = getServerEnv().gemini;
  return { configured: apiKeys.length > 0, model, fallbackModel, keys: apiKeys.length };
}

function clientFor(key: string): GoogleGenAI {
  let c = clients.get(key);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key });
    clients.set(key, c);
  }
  return c;
}

/** Usable keys in order; rejected keys come back after the cooldown. */
function usableKeys(now = Date.now()): string[] {
  const { apiKeys } = getServerEnv().gemini;
  return apiKeys.filter((k) => (rejectedUntil.get(k) ?? 0) <= now);
}

function isKeyRejection(status: number | undefined, message: string): boolean {
  if (status === 401 || status === 403) return true;
  return status === 400 && /api[_ ]?key|expired|invalid authentication|credentials/i.test(message);
}

const TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GenerateOpts = {
  systemInstruction: string;
  userText: string;
  jsonSchema: unknown;
  maxOutputTokens?: number;
};

/**
 * Calls Gemini and returns parsed JSON (not yet schema-validated).
 * If the primary model stays unavailable after retries, tries
 * GEMINI_FALLBACK_MODEL once (when set). Never falls back to another provider.
 */
export async function generateJson(opts: GenerateOpts): Promise<{ json: unknown; model: string }> {
  const { apiKeys } = getServerEnv().gemini;
  if (apiKeys.length === 0) throw new GeminiError("GEMINI_API_KEY is not set", "not_configured");
  const keys = usableKeys();
  for (const key of keys) {
    try {
      return await generateWithModels(key, opts);
    } catch (err) {
      if (!(err instanceof KeyRejectedError)) throw err;
      rejectedUntil.set(key, Date.now() + KEY_COOLDOWN_MS);
      log.warn("gemini", "API key rejected; trying the next key", { keyPosition: apiKeys.indexOf(key) + 1, of: apiKeys.length });
    }
  }
  throw new GeminiError("Every configured Gemini API key was rejected (invalid, expired or revoked)", "ai_unavailable");
}

async function generateWithModels(key: string, opts: GenerateOpts): Promise<{ json: unknown; model: string }> {
  const { model, fallbackModel } = getServerEnv().gemini;
  try {
    return await generateWith(key, model, opts);
  } catch (err) {
    const fallbackable =
      err instanceof GeminiError && (err.category === "ai_unavailable" || err.category === "timeout" || err.category === "ai_rate_limited");
    if (!fallbackable || !fallbackModel || fallbackModel === model) throw err;
    log.warn("gemini", "falling back", { from: model, to: fallbackModel, category: (err as GeminiError).category });
    return generateWith(key, fallbackModel, opts);
  }
}

async function generateWith(key: string, model: string, opts: GenerateOpts): Promise<{ json: unknown; model: string }> {
  const ai = clientFor(key);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: opts.userText }] }],
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: opts.jsonSchema,
          temperature: 0,
          maxOutputTokens: opts.maxOutputTokens ?? 2048,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      });
      const text = res.text;
      if (!text) throw new GeminiError("Empty response", "ai_invalid_output");
      try {
        return { json: JSON.parse(text) as unknown, model };
      } catch {
        throw new GeminiError("Response was not valid JSON", "ai_invalid_output");
      }
    } catch (err) {
      if (err instanceof GeminiError) throw err;
      const status = err instanceof ApiError ? err.status : undefined;
      if (isKeyRejection(status, err instanceof Error ? err.message : "")) throw new KeyRejectedError("key rejected");
      const timedOut = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      const retryable = timedOut || status === 429 || (status !== undefined && status >= 500);
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      log.warn("gemini", "request failed", { status, timedOut, model });
      if (timedOut) throw new GeminiError("Gemini timed out", "timeout");
      if (status === 429) throw new GeminiError("Gemini rate limit reached", "ai_rate_limited");
      if (status === 400 || status === 404) throw new GeminiError(`Gemini rejected the request (HTTP ${status})`, "ai_unavailable");
      throw new GeminiError("Gemini is unavailable", "ai_unavailable");
    }
  }
}
