/** One explicitly approved isolated provider call; no application or DB writes. */
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

async function main() {
  assert(process.argv.includes("--approved-one-basic-request"));
  const path = "docs/GEMINI_FLASH_LITE_BASIC_RESULT.json";
  assert(!existsSync(path), "Attempt already recorded; no replay");
  process.loadEnvFile(".env.local");
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  assert(apiKey && model);
  assert.equal(model, "gemini-3.5-flash-lite");
  const result: Record<string, unknown> = { status: "ATTEMPT_STARTED", model, providerRequests: 1, endpoint: "interactions.create", prompt: "Reply with exactly OK.", schema: false, retries: 0, startedAt: new Date().toISOString() };
  const save = () => writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
  save();
  const started = Date.now();
  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.interactions.create({ model, input: "Reply with exactly OK.", store: false }, { signal: AbortSignal.timeout(30000), maxRetries: 0 });
    result.hasOutput = Boolean(response.output_text?.trim());
    result.matchesExpected = response.output_text?.trim() === "OK";
    result.status = result.hasOutput ? "PASSED" : "FAILED";
  } catch (error) {
    result.status = "FAILED";
    if (error && typeof error === "object") {
      const value = error as { status?: unknown; statusCode?: unknown; name?: unknown };
      const status = value.status ?? value.statusCode;
      if (typeof status === "number") result.providerHttpStatus = status;
      result.errorClass = typeof value.name === "string" && ["ApiError", "APIError", "TimeoutError", "AbortError", "TypeError", "Error"].includes(value.name) ? value.name : "UNCLASSIFIED";
    }
    // Never log raw provider messages, headers, credentials or model output.
    process.exitCode = 1;
  }
  result.elapsedMs = Date.now() - started;
  save();
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error("Preflight blocked; no replay; private details withheld"); process.exitCode = 1; });
