import "server-only";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_SYSTEM_INSTRUCTION, type GeminiGenerate } from "@/lib/gemini-analysis";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const responseSchema = {
  type: "object",
  properties: {
    requirements: { type: "array", items: { type: "object", properties: {
      requirementId: { type: "string" }, assessment: { type: "string", enum: ["MATCHED", "PARTIALLY_MATCHED", "NOT_FOUND", "NEEDS_REVIEW"] },
      evidenceExcerpt: { type: ["string", "null"] }, evidenceQuality: { type: "string", enum: ["DIRECT", "INDIRECT", "WEAK", "NONE"] },
      explanation: { type: "string" }, confidence: { type: "number" }, humanReview: { type: "boolean" },
    }, required: ["requirementId", "assessment", "evidenceExcerpt", "evidenceQuality", "explanation", "confidence", "humanReview"], additionalProperties: false } },
    strengths: { type: "array", items: { type: "object", properties: { text: { type: "string" }, evidenceExcerpt: { type: ["string", "null"] } }, required: ["text", "evidenceExcerpt"], additionalProperties: false } },
    potentialGaps: { type: "array", items: { type: "object", properties: { requirementId: { type: "string" }, explanation: { type: "string" } }, required: ["requirementId", "explanation"], additionalProperties: false } },
    suggestions: { type: "array", items: { type: "string" } },
  }, required: ["requirements", "strengths", "potentialGaps", "suggestions"], additionalProperties: false,
};

export function createGeminiGenerator(apiKey: string, model: string, schema: Record<string, unknown> = responseSchema, systemInstruction = GEMINI_SYSTEM_INSTRUCTION): GeminiGenerate {
  const client = new GoogleGenAI({ apiKey });
  return async (prompt, signal) => {
    const response = await client.interactions.create({
      model,
      input: prompt,
      system_instruction: systemInstruction,
      response_format: { type: "text", mime_type: "application/json", schema },
      store: false,
    }, { signal, maxRetries: 0 });
    if (!response.output_text) throw new Error("EMPTY_MODEL_RESPONSE");
    return response.output_text;
  };
}
