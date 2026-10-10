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

let client: GoogleGenAI | null = null;

export function geminiStatus(): { configured: boolean; model: string; fallbackModel?: string } {
  const { apiKey, model, fallbackModel } = getServerEnv().gemini;
  return { configured: Boolean(apiKey), model, fallbackModel };
}

function getClient(): GoogleGenAI {
  const { apiKey } = getServerEnv().gemini;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not set", "not_configured");
  client ??= new GoogleGenAI({ apiKey });
  return client;
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
  const { model, fallbackModel } = getServerEnv().gemini;
  try {
    return await generateWith(model, opts);
  } catch (err) {
    const fallbackable =
      err instanceof GeminiError && (err.category === "ai_unavailable" || err.category === "timeout" || err.category === "ai_rate_limited");
    if (!fallbackable || !fallbackModel || fallbackModel === model) throw err;
    log.warn("gemini", "falling back", { from: model, to: fallbackModel, category: (err as GeminiError).category });
    return generateWith(fallbackModel, opts);
  }
}

async function generateWith(model: string, opts: GenerateOpts): Promise<{ json: unknown; model: string }> {
  const ai = getClient();

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
