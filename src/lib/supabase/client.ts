"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/env";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured. Add the project URL and publishable key to .env.local.");
  browserClient ??= createBrowserClient(config.url, config.key);
  return browserClient;
}
