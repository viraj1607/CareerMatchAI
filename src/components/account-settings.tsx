"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AccountSettings({ email, displayName }: { email: string; displayName: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function saveProfile() {
    setMessage(""); setError("");
    const normalized = name.trim();
    if (normalized.length > 120) { setError("Keep your name under 120 characters."); return; }
    setBusy(true);
    const { data: { user }, error: authError } = await getSupabaseBrowserClient().auth.getUser();
    if (!user || authError) { setError("Your session expired. Sign in again."); setBusy(false); return; }
    const { error: saveError } = await getSupabaseBrowserClient().from("profiles").update({ display_name: normalized || null }).eq("id", user.id);
    if (saveError) setError("Your profile could not be saved. Please retry."); else setMessage("Profile updated.");
    setBusy(false);
  }
  async function deleteAccount() {
    if (!window.confirm("Delete your CareerMatch AI account? This permanently deletes your saved resumes, job descriptions, analyses, and applications. This cannot be undone.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { error: deleteError } = await getSupabaseBrowserClient().rpc("delete_my_account");
      if (deleteError) { setError("Account deletion could not be completed. Your data has not been reported as deleted; contact your project administrator if this continues."); setBusy(false); return; }
      await getSupabaseBrowserClient().auth.signOut();
      router.replace("/auth?deleted=1"); router.refresh();
    } catch { setError("Account deletion could not be completed. Please retry or contact your project administrator."); }
    setBusy(false);
  }
  return <section aria-labelledby="profile-heading" className="rounded-md border border-[#e0e8e2] bg-white p-5 sm:p-7">
    <h2 id="profile-heading" className="text-base font-semibold text-[#25372d]">Account</h2>
    <p className="mt-1 text-sm text-[#65756b]">Signed in as {email || "your account"}</p>
    <label className="mt-5 block text-sm font-medium text-[#34453b]">Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="form-control mt-1.5" /></label>
    <button type="button" onClick={() => void saveProfile()} disabled={busy} className="mt-3 min-h-10 rounded border border-[#176b50] px-3 text-sm font-semibold text-[#176b50] hover:bg-[#f2f7f3] disabled:opacity-50">Save profile</button>
    {message ? <p role="status" className="mt-3 text-sm text-[#176b50]">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-[#a23d35]">{error}</p> : null}
    <div className="mt-7 border-t border-[#edf1ee] pt-5"><h3 className="text-sm font-semibold text-[#8a403a]">Delete account and data</h3><p className="mt-1 text-sm leading-6 text-[#65756b]">This removes your account and saved resumes, job descriptions, analyses, and applications. Original uploaded PDF/DOCX files are not stored.</p><button type="button" onClick={() => void deleteAccount()} disabled={busy} className="mt-3 min-h-10 rounded border border-[#b96960] px-3 text-sm font-semibold text-[#8a403a] hover:bg-[#fcf6f5] disabled:opacity-50">Delete my account</button></div>
  </section>;
}
