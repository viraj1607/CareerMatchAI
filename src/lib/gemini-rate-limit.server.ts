import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { configuredGeminiLimit } from "@/lib/request-limits.server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type GeminiLimitResult = "allowed" | "limited" | "unavailable";

export async function consumeGeminiLimit(supabase: SupabaseClient, scope: "analysis" | "suggestions"): Promise<GeminiLimitResult> {
  try {
    const { data, error } = await supabase.rpc("consume_gemini_rate_limit", {
      p_scope: scope,
      p_limit: configuredGeminiLimit(scope),
    });
    if (error || typeof data !== "boolean") return "unavailable";
    return data ? "allowed" : "limited";
  } catch {
    return "unavailable";
  }
}
