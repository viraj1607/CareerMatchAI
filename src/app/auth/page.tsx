import { AuthForm } from "@/components/auth-form";
import { getSupabaseConfig } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ mode?: string; reason?: string }> }) {
  const { mode, reason } = await searchParams;
  return <AuthForm configured={Boolean(getSupabaseConfig())} initialMode={mode === "signup" ? "signup" : "signin"} setupRequired={reason === "setup"} />;
}
