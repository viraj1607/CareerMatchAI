import "server-only";

import { redirect } from "next/navigation";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { getAuthenticatedContext as getContext } from "@/lib/supabase/session.server";

export { createSupabaseServerClient, getAuthenticatedContext } from "@/lib/supabase/session.server";

export async function requireUser() {
  if (!getSupabaseConfig()) redirect("/auth?reason=setup");
  const context = await getContext();
  if (!context) redirect("/auth");
  return context;
}

export async function hasAuthenticatedUser() {
  return Boolean(await getContext());
}
