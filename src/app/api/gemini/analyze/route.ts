import { NextResponse, type NextRequest } from "next/server";
import { analyzeWithGemini, GeminiAnalysisError, geminiRequestSchema, MAX_AI_REQUEST_BYTES, publicGeminiError } from "@/lib/gemini-analysis";
import { createGeminiGenerator, DEFAULT_GEMINI_MODEL } from "@/lib/gemini-provider.server";
import { consumeGeminiLimit } from "@/lib/gemini-rate-limit.server";
import { getAuthenticatedContext } from "@/lib/supabase/session.server";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { readBoundedBody } from "@/lib/request-limits.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const maxDuration = 35;

export async function POST(request: NextRequest) {
  if (!getSupabaseConfig()) return NextResponse.json({ error: { code: "AUTH_UNAVAILABLE", message: "AI analysis is unavailable until account authentication is configured." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const context = await getAuthenticatedContext();
  if (!context) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to use resume analysis." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Submit the analysis as a JSON request." } }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }
  let raw: string;
  try {
    raw = await readBoundedBody(request, MAX_AI_REQUEST_BYTES);
  } catch (error) {
    const code = error instanceof Error ? error.message : "BAD_BODY";
    const tooLarge = code === "TOO_LARGE";
    const timedOut = code === "TIMEOUT";
    return NextResponse.json({ error: { code: tooLarge ? "INVALID_REQUEST" : timedOut ? "REQUEST_TIMEOUT" : "INVALID_REQUEST", message: tooLarge ? "The analysis request is too large." : timedOut ? "The analysis request took too long to upload." : "The analysis request could not be read." } }, { status: tooLarge ? 413 : timedOut ? 408 : 400, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Submit resume text, job description, and reviewed requirements as valid JSON." } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const validated = geminiRequestSchema.safeParse(body);
  if (!validated.success) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The request is incomplete or exceeds an allowed input limit." } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const limit = await consumeGeminiLimit(context.supabase, "analysis");
  if (limit === "unavailable") return NextResponse.json({ error: { code: "RATE_LIMIT_UNAVAILABLE", message: "AI analysis is temporarily unavailable. Please retry later." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (limit === "limited") return NextResponse.json({ error: { code: "RATE_LIMIT", message: "You have reached the analysis limit for this minute. Please retry shortly." } }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    const failure = publicGeminiError(new GeminiAnalysisError("CONFIGURATION"));
    return NextResponse.json({ error: failure }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await analyzeWithGemini(validated.data, apiKey, createGeminiGenerator(apiKey, process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = publicGeminiError(error);
    return NextResponse.json({ error: failure }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }
}
