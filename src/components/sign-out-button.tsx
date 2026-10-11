"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { runSignOut } from "@/lib/auth-workflow";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true); setError("");
    const success = await runSignOut(async () => !(await getSupabaseBrowserClient().auth.signOut()).error);
    if (success) { router.replace("/auth"); router.refresh(); } else setError("Could not sign out. Check your connection and retry.");
    setBusy(false);
  }
  return <span className="flex flex-col items-end"><button type="button" onClick={() => void signOut()} disabled={busy} className="min-h-9 rounded border border-[#dce5df] px-3 text-xs font-semibold text-[#43564a] hover:bg-[#f5f8f6] disabled:opacity-60">{busy ? "Signing out…" : "Sign out"}</button>{error ? <span role="alert" className="absolute right-4 top-[68px] rounded border border-[#efc7c1] bg-white px-2 py-1 text-xs text-[#963d35]">{error}</span> : null}</span>;
}
