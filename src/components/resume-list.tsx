"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SavedResumeRow = { id: string; name: string; created_at: string; original_resume_id: string | null };

export function ResumeList({ initialResumes, loadError = false }: { initialResumes: SavedResumeRow[]; loadError?: boolean }) {
  const [resumes, setResumes] = useState(initialResumes);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(loadError ? "Saved resumes could not be loaded. Check your connection and refresh. Your saved items have not been changed." : "");
  const [message, setMessage] = useState("");

  async function rename(id: string) {
    const nextName = name.trim();
    if (!nextName || nextName.length > 120) { setError("Resume names must contain 1 to 120 characters."); return; }
    setBusyId(id); setError("");
    const { data, error: updateError } = await getSupabaseBrowserClient().from("resumes").update({ name: nextName }).eq("id", id).select("id").maybeSingle();
    if (updateError || !data) setError("Resume name was not updated. Please retry.");
    else { setResumes((current) => current.map((resume) => resume.id === id ? { ...resume, name: nextName } : resume)); setEditing(null); setMessage("Resume renamed."); }
    setBusyId(null);
  }

  async function remove(id: string, resumeName: string) {
    if (!window.confirm(`Delete “${resumeName}”? Related analyses and applications will be retained without this resume association.`)) return;
    setBusyId(id); setError(""); setMessage("");
    const { data, error: deleteError } = await getSupabaseBrowserClient().from("resumes").delete().eq("id", id).select("id").maybeSingle();
    if (deleteError || !data) setError("Resume was not deleted. Please retry.");
    else { setResumes((current) => current.filter((resume) => resume.id !== id)); setMessage("Resume deleted."); }
    setBusyId(null);
  }

  return <>
    <div className="mb-5 flex items-start gap-3 rounded-md border border-[#dce7df] bg-[#f6faf7] p-4 text-sm text-[#526258]"><Icon name="shield" size={18} /><p className="leading-6">Resumes are stored in your private account. Saving stores extracted text and structured content; original PDF/DOCX files are discarded.</p></div>
    {error ? <p role="alert" className="mb-4 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm text-[#963d35]">{error}</p> : null}
    {message ? <p role="status" className="mb-4 text-sm text-[#176b50]">{message}</p> : null}
    {resumes.length ? <div className="overflow-hidden rounded-md border border-[#e0e8e2] bg-white">
      <div className="hidden grid-cols-[minmax(0,1fr)_0.7fr_auto] gap-4 border-b border-[#e7ece8] bg-[#f8faf8] px-5 py-3 text-[11px] font-semibold uppercase text-[#65756b] sm:grid"><span>Resume</span><span>Updated</span><span>Actions</span></div>
      <ul>{resumes.map((resume, index) => <li key={resume.id} className={`grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_0.7fr_auto] sm:items-center sm:gap-4 sm:px-5 ${index ? "border-t border-[#edf1ee]" : ""}`}>
        <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded bg-[#eff5f1] text-[#36745a]"><Icon name="file" size={18} /></span><div className="min-w-0 flex-1">{editing === resume.id ? <div className="flex gap-2"><input aria-label="Resume name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className="form-control min-h-9" /><button type="button" onClick={() => void rename(resume.id)} disabled={busyId === resume.id} className="rounded bg-[#176b50] px-3 text-xs font-semibold text-white">Save</button></div> : <span className="block truncate text-sm font-medium text-[#2b3c32]">{resume.name}</span>}{resume.original_resume_id ? <span className="mt-1 block text-[11px] text-[#65756b]">Tailored version</span> : null}</div></div>
        <span className="text-xs text-[#7c8981] sm:text-sm">{new Date(resume.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}</span>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end"><Link href={`/editor?id=${encodeURIComponent(resume.id)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[#dce5df] px-3 text-xs font-medium text-[#43564a] hover:bg-[#f5f8f6]"><Icon name="eye" size={15} />Open</Link><button type="button" onClick={() => { setEditing(resume.id); setName(resume.name); setError(""); }} aria-label={`Rename ${resume.name}`} className="inline-flex size-9 items-center justify-center rounded border border-[#dce5df] text-[#43564a] hover:bg-[#f5f8f6]"><Icon name="edit" size={15} /></button><button type="button" onClick={() => void remove(resume.id, resume.name)} disabled={busyId === resume.id} aria-label={`Delete ${resume.name}`} className="inline-flex size-9 items-center justify-center rounded border border-[#e8dedc] text-[#8e4c45] hover:bg-[#fcf6f5] disabled:opacity-50"><Icon name="trash" size={15} /></button></div>
      </li>)}</ul>
    </div> : <div className="rounded-md border border-[#e0e8e2] bg-white"><EmptyState icon="file" title="No saved resumes yet" description="Extract a PDF or DOCX and choose Save resume in the editor. The uploaded file itself is not retained." action={<Link href="/analyze" className="text-sm font-semibold text-[#176b50] hover:text-[#12583f]">Go to Analyze resume</Link>} /></div>}
  </>;
}
