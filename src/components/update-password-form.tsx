"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const password = new FormData(event.currentTarget).get("password");
    if (typeof password !== "string" || password.length < 10) { setError("Use a password with at least 10 characters."); return; }
    try {
      const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (updateError) { setError("Your password could not be updated. Request a new reset link and try again."); return; }
      setDone(true); router.replace("/"); router.refresh();
    } catch { setError("The password reset session may have expired. Request a new reset link."); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4 text-[#23342b]"><form onSubmit={submit} className="w-full max-w-md rounded-md border border-[#e0e8e2] bg-white p-7"><h1 className="text-2xl font-semibold">Choose a new password</h1><label className="mt-5 block text-sm font-medium">New password<input name="password" type="password" minLength={10} required className="form-control mt-1.5" /></label>{error ? <p role="alert" className="mt-3 text-sm text-[#a23d35]">{error}</p> : null}{done ? <p role="status" className="mt-3 text-sm text-[#176b50]">Password updated.</p> : null}<button className="mt-5 min-h-11 w-full rounded bg-[#176b50] px-4 text-sm font-semibold text-white">Update password</button></form></main>;
}
