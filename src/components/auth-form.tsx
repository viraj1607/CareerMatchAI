"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/auth-validation";
import { runAuthWorkflow } from "@/lib/auth-workflow";

type Mode = "signin" | "signup" | "forgot";

export function AuthForm({ configured, initialMode, setupRequired }: { configured: boolean; initialMode: Mode; setupRequired: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    if (!configured) { setError("Add your Supabase project URL and publishable key to .env.local, then restart the development server."); return; }
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") ?? "").trim().toLowerCase();
    const password = String(values.get("password") ?? "");
    const displayName = String(values.get("displayName") ?? "").trim();
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeInternalPath(searchParams.get("next")))}`;
      const outcome = await runAuthWorkflow(mode, { email, password, displayName, redirectTo, resetRedirectTo: `${window.location.origin}/auth/update-password` }, {
        signIn: async (address, secret) => { const { error: requestError } = await supabase.auth.signInWithPassword({ email: address, password: secret }); return { error: Boolean(requestError) }; },
        signUp: async (address, secret, name, callback) => { const { data, error: requestError } = await supabase.auth.signUp({ email: address, password: secret, options: { data: { display_name: name || undefined }, emailRedirectTo: callback } }); return { error: Boolean(requestError), session: Boolean(data.session) }; },
        resetPassword: async (address, callback) => { const { error: requestError } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: callback }); return { error: Boolean(requestError) }; },
      });
      if (outcome === "invalid-email") { setError("Enter a valid email address."); return; }
      if (outcome === "weak-password") { setError("Use a password with at least 10 characters."); return; }
      if (outcome === "name-too-long") { setError("Keep your name under 120 characters."); return; }
      if (outcome === "failed") { setError(mode === "signin" ? "We could not sign you in with those details. The session may have expired; retry or reset your password." : "Your request could not be completed. Please check the details and try again."); return; }
      if (outcome === "confirmation-sent") setMessage("Check your email to confirm your account, then sign in.");
      else if (outcome === "reset-sent") setMessage("If an account exists for that address, password reset instructions are on the way.");
      else router.replace(safeInternalPath(searchParams.get("next")));
      router.refresh();
    } catch { setError("CareerMatch AI could not reach Supabase. Check your connection and project configuration."); }
    finally { setPending(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4 py-10 text-[#23342b]">
    <section className="w-full max-w-md rounded-md border border-[#e0e8e2] bg-white p-6 sm:p-8">
      <Link href="/" className="text-sm font-semibold text-[#176b50]">CareerMatch AI</Link>
      <h1 className="mt-6 text-2xl font-semibold">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in"}</h1>
      <p className="mt-2 text-sm leading-6 text-[#68766e]">Save your resumes, analyses, and job search progress privately in your account.</p>
      {setupRequired || !configured ? <p role="status" className="mt-5 rounded border border-[#ead9ad] bg-[#fffaf0] p-3 text-sm leading-5 text-[#705923]">Supabase setup is needed before account features can be used. Add the project URL and publishable key to `.env.local`.</p> : null}
      {searchParams.get("error") === "callback" ? <p role="alert" className="mt-5 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm leading-5 text-[#963d35]">The sign-in link could not be verified. Request a fresh email and try again.</p> : null}
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "signup" ? <label className="block text-sm font-medium">Name <span className="text-xs font-normal text-[#65756b]">Optional</span><input name="displayName" autoComplete="name" maxLength={120} className="form-control mt-1.5" /></label> : null}
        <label className="block text-sm font-medium">Email<input name="email" type="email" autoComplete="email" required className="form-control mt-1.5" /></label>
        {mode !== "forgot" ? <label className="block text-sm font-medium">Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={10} required className="form-control mt-1.5" /></label> : null}
        {error ? <p role="alert" className="text-sm text-[#a23d35]">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-[#176b50]">{message}</p> : null}
        <button disabled={pending} className="min-h-11 w-full rounded-md bg-[#176b50] px-4 text-sm font-semibold text-white hover:bg-[#12583f] disabled:opacity-60">{pending ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm text-[#176b50]">
        {mode === "signin" ? <><button onClick={() => { setMode("signup"); setError(""); setMessage(""); }} className="underline underline-offset-2">Create an account</button><button onClick={() => { setMode("forgot"); setError(""); setMessage(""); }} className="underline underline-offset-2">Forgot password?</button></> : <button onClick={() => { setMode("signin"); setError(""); setMessage(""); }} className="underline underline-offset-2">Back to sign in</button>}
      </div>
      <p className="mt-6 border-t border-[#edf1ee] pt-4 text-xs leading-5 text-[#65756b]">Saving a resume stores its text and structured content in your private account. This does not grant permission to send it to Gemini; AI analysis still requires separate consent.</p>
    </section>
  </main>;
}
