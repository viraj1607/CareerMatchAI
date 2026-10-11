import { NextResponse, type NextRequest } from "next/server";
import { GeminiAnalysisError, publicGeminiError } from "@/lib/gemini-analysis";
import { createGeminiGenerator, DEFAULT_GEMINI_MODEL } from "@/lib/gemini-provider.server";
import { makeResumeSuggestionPrompt, resumeSuggestionRequestSchema, RESUME_EDIT_SYSTEM_INSTRUCTION, validateResumeSuggestionResult } from "@/lib/resume-suggestions";
import { consumeGeminiLimit } from "@/lib/gemini-rate-limit.server";
import { getAuthenticatedContext } from "@/lib/supabase/session.server";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { readBoundedBody } from "@/lib/request-limits.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const suggestionsSchema = {
  type: "object",
  properties: {
    suggestions: { type: "array", items: { type: "object", properties: {
      originalText: { type: "string" }, suggestedText: { type: ["string", "null"] }, explanation: { type: "string" },
      requirementId: { type: ["string", "null"] }, evidenceExcerpt: { type: ["string", "null"] }, clarificationQuestion: { type: ["string", "null"] },
    }, required: ["originalText", "suggestedText", "explanation", "requirementId", "evidenceExcerpt", "clarificationQuestion"], additionalProperties: false } },
  }, required: ["suggestions"], additionalProperties: false,
};

export const maxDuration = 35;

export async function POST(request: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  if (!getSupabaseConfig()) return NextResponse.json({ error: { code: "AUTH_UNAVAILABLE", message: "Resume suggestions are unavailable until account authentication is configured." } }, { status: 503, headers: noStore });
  const context = await getAuthenticatedContext();
  if (!context) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to request resume suggestions." } }, { status: 401, headers: noStore });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Submit the suggestion request as JSON." } }, { status: 415, headers: noStore });
  let raw: string;
  try {
    raw = await readBoundedBody(request, 128_000);
  } catch (error) {
    const code = error instanceof Error ? error.message : "BAD_BODY";
    const tooLarge = code === "TOO_LARGE";
    const timedOut = code === "TIMEOUT";
    return NextResponse.json({ error: { code: tooLarge ? "INVALID_REQUEST" : timedOut ? "REQUEST_TIMEOUT" : "INVALID_REQUEST", message: tooLarge ? "This suggestion request is too large." : timedOut ? "The suggestion request took too long to upload." : "The suggestion request could not be read." } }, { status: tooLarge ? 413 : timedOut ? 408 : 400, headers: noStore });
  }
  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The suggestion request is not valid JSON." } }, { status: 400, headers: noStore }); }
  const input = resumeSuggestionRequestSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The request is incomplete or exceeds an allowed input limit." } }, { status: 400, headers: noStore });
  const limit = await consumeGeminiLimit(context.supabase, "suggestions");
  if (limit === "unavailable") return NextResponse.json({ error: { code: "RATE_LIMIT_UNAVAILABLE", message: "Resume suggestions are temporarily unavailable. Please retry later." } }, { status: 503, headers: noStore });
  if (limit === "limited") return NextResponse.json({ error: { code: "RATE_LIMIT", message: "You have reached the suggestion limit for this minute. Please retry shortly." } }, { status: 429, headers: { ...noStore, "Retry-After": "60" } });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    const failure = publicGeminiError(new GeminiAnalysisError("CONFIGURATION"));
    return NextResponse.json({ error: failure }, { status: failure.status, headers: noStore });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const generate = createGeminiGenerator(apiKey, process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL, suggestionsSchema, RESUME_EDIT_SYSTEM_INSTRUCTION);
    const raw = await generate(makeResumeSuggestionPrompt(input.data), controller.signal);
    const suggestions = validateResumeSuggestionResult(raw, input.data);
    return NextResponse.json({ suggestions }, { headers: noStore });
  } catch (error) {
    const safeError = controller.signal.aborted ? new GeminiAnalysisError("TIMEOUT") : error;
    const failure = publicGeminiError(safeError);
    return NextResponse.json({ error: failure }, { status: failure.status, headers: noStore });
  } finally { clearTimeout(timeout); }
}
