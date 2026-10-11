import { createHash } from "node:crypto";
import { generateJson, GeminiError, geminiStatus } from "@/integrations/gemini/client";
import {
  TOUR_PROMPT_VERSION,
  TOUR_SYSTEM_INSTRUCTION,
  tourJsonSchema,
  tourSchema,
  type TourExtraction,
} from "@/integrations/gemini/tour-extraction";
import { getSql } from "./db";
import { log } from "./log";

/**
 * Gemini tour-schedule extraction for one article text, cached in
 * radar.ai_extractions by (prompt version, model, text) so the same article is
 * never sent twice. Failures are cached too (and retried on a later run).
 */
export async function extractTourCached(text: string): Promise<TourExtraction> {
  const { model } = geminiStatus();
  const hash = createHash("sha256").update(`${TOUR_PROMPT_VERSION}|${model}|${text}`).digest("hex");
  const sql = getSql();
  const [hit] = await sql<{ status: string; output: unknown }[]>`
    select status, output from radar.ai_extractions where input_hash = ${hash}`;
  if (hit?.status === "ok") {
    const parsed = tourSchema.safeParse(hit.output);
    if (parsed.success) return parsed.data;
  }
  let json: unknown;
  let usedModel = model;
  try {
    ({ json, model: usedModel } = await generateJson({
      systemInstruction: TOUR_SYSTEM_INSTRUCTION,
      userText: `ARTICLE:\n"""\n${text}\n"""`,
      jsonSchema: tourJsonSchema,
    }));
  } catch (err) {
    const category = err instanceof GeminiError ? err.category : "ai_unavailable";
    await sql`insert into radar.ai_extractions (input_hash, model, prompt_version, status, error_category)
              values (${hash}, ${model}, ${TOUR_PROMPT_VERSION}, 'failed', ${category})
              on conflict (input_hash) do update set status = 'failed', error_category = excluded.error_category, created_at = now()`;
    throw err;
  }
  const parsed = tourSchema.safeParse(json);
  if (!parsed.success) {
    log.warn("gemini", "tour output failed schema validation", { issue: parsed.error.issues[0]?.message, model: usedModel });
    throw new GeminiError("Gemini's answer didn't match the expected format", "ai_invalid_output");
  }
  await sql`insert into radar.ai_extractions (input_hash, model, prompt_version, status, output)
            values (${hash}, ${usedModel}, ${TOUR_PROMPT_VERSION}, 'ok', ${sql.json(parsed.data as never)})
            on conflict (input_hash) do update set status = 'ok', output = excluded.output, model = excluded.model, created_at = now()`;
  return parsed.data;
}
