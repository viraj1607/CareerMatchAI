"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icon";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/application-status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { validatedHttpUrl } from "@/lib/auth-validation";
import { savedDataQuotaMessage } from "@/lib/saved-data-errors";

export type ApplicationRow = { id: string; job_title: string; company_name: string; job_url: string | null; status: ApplicationStatus; application_date: string | null; notes: string; resume_id: string | null; job_description_id: string | null };
type RelatedOption = { id: string; name: string };
type JobOption = { id: string; job_title: string; company_name: string };
const blankForm = { job_title: "", company_name: "", job_url: "", status: "Interested" as ApplicationStatus, application_date: "", notes: "", resume_id: "", job_description_id: "" };

export function ApplicationList({ initialApplications, resumes, jobs, loadError = false }: { initialApplications: ApplicationRow[]; resumes: RelatedOption[]; jobs: JobOption[]; loadError?: boolean }) {
  const [rows, setRows] = useState(initialApplications);
  const [filter, setFilter] = useState("All statuses");
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(loadError ? "Applications could not be loaded. Check your connection and refresh. Your saved items have not been changed." : "");
  const [message, setMessage] = useState("");
  const saveLock = useRef(false);
  const applications = useMemo(() => filter === "All statuses" ? rows : rows.filter((row) => row.status === filter), [filter, rows]);

  function beginEdit(row: ApplicationRow) {
    setEditing(row.id); setShowForm(true); setError(""); setMessage("");
    setForm({ job_title: row.job_title, company_name: row.company_name, job_url: row.job_url ?? "", status: row.status, application_date: row.application_date ?? "", notes: row.notes, resume_id: row.resume_id ?? "", job_description_id: row.job_description_id ?? "" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;
    setError(""); setMessage("");
    const jobTitle = form.job_title.trim(); const company = form.company_name.trim(); const urlText = form.job_url.trim();
    if (!jobTitle || jobTitle.length > 200 || !company || company.length > 200 || form.notes.length > 10000) { setError("Add a job title and company. Keep each under 200 characters and notes under 10,000 characters."); return; }
    const safeUrl = validatedHttpUrl(urlText);
    if (urlText && !safeUrl) { setError("Enter a complete job posting URL beginning with https:// or http://."); return; }
    saveLock.current = true; setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user || authError) { setError("Your session expired. Sign in again."); return; }
      const payload = { user_id: user.id, job_title: jobTitle, company_name: company, job_url: safeUrl, status: form.status, application_date: form.application_date || null, notes: form.notes.trim(), resume_id: form.resume_id || null, job_description_id: form.job_description_id || null };
      const response = editing
        ? await supabase.from("job_applications").update(payload).eq("id", editing).select("id,job_title,company_name,job_url,status,application_date,notes,resume_id,job_description_id").maybeSingle()
        : await supabase.from("job_applications").insert(payload).select("id,job_title,company_name,job_url,status,application_date,notes,resume_id,job_description_id").single();
      if (response.error || !response.data) { setError(savedDataQuotaMessage(response.error) ?? "The application was not saved. Check that associated records still exist and retry."); return; }
      setRows((current) => editing ? current.map((row) => row.id === editing ? response.data as ApplicationRow : row) : [response.data as ApplicationRow, ...current]);
      setForm(blankForm); setEditing(null); setShowForm(false); setMessage("Application saved.");
    } catch { setError("The application was not saved. Check your connection and retry."); }
    finally { saveLock.current = false; setBusy(false); }
  }

  async function remove(row: ApplicationRow) {
    if (saveLock.current) return;
    if (!window.confirm(`Delete the application for ${row.job_title} at ${row.company_name}?`)) return;
    saveLock.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
    const { data, error: deleteError } = await getSupabaseBrowserClient().from("job_applications").delete().eq("id", row.id).select("id").maybeSingle();
    if (deleteError || !data) setError("Application was not deleted. Please retry.");
    else { setRows((current) => current.filter(({ id }) => id !== row.id)); setMessage("Application deleted."); }
    } catch { setError("Application was not deleted. Check your connection and try again."); }
    finally { saveLock.current = false; setBusy(false); }
  }

  async function changeStatus(row: ApplicationRow, status: ApplicationStatus) {
    if (saveLock.current) return;
    saveLock.current = true; setBusy(true); setError(""); setMessage("");
    try {
    const { data, error: updateError } = await getSupabaseBrowserClient().from("job_applications").update({ status }).eq("id", row.id).select("id").maybeSingle();
    if (updateError || !data) setError("Application status was not changed. Please retry.");
    else { setRows((current) => current.map((item) => item.id === row.id ? { ...item, status } : item)); setMessage("Application status updated."); }
    } catch { setError("Application status was not changed. Check your connection and try again."); }
    finally { saveLock.current = false; setBusy(false); }
  }

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#dce7df] bg-white p-4">
      <p className="max-w-2xl text-sm leading-6 text-[#526258]">Applications are stored in your private account. Add a role as soon as you want to track it.</p>
      <div className="flex items-center gap-2"><label htmlFor="application-status" className="text-xs font-medium text-[#6e6042]">Status</label><select id="application-status" value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-9 rounded-md border border-[#d9e2dc] bg-white px-3 text-sm"><option>All statuses</option>{APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><button type="button" onClick={() => { setShowForm((value) => !value); setEditing(null); setForm(blankForm); }} className="min-h-9 rounded bg-[#176b50] px-3 text-xs font-semibold text-white">{showForm ? "Close" : "Add application"}</button></div>
    </div>
    {showForm ? <form onSubmit={(event) => void save(event)} className="mb-5 grid gap-4 rounded-md border border-[#dfe8e1] bg-white p-5 sm:grid-cols-2">
      <label className="text-xs font-medium">Job title<input required maxLength={200} value={form.job_title} onChange={(event) => setForm({ ...form, job_title: event.target.value })} className="form-control mt-1.5 min-h-10" /></label>
      <label className="text-xs font-medium">Company<input required maxLength={200} value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} className="form-control mt-1.5 min-h-10" /></label>
      <label className="text-xs font-medium">Job posting URL<input type="url" placeholder="https://" value={form.job_url} onChange={(event) => setForm({ ...form, job_url: event.target.value })} className="form-control mt-1.5 min-h-10" /></label>
      <label className="text-xs font-medium">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ApplicationStatus })} className="form-control mt-1.5 min-h-10">{APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="text-xs font-medium">Application date<input type="date" value={form.application_date} onChange={(event) => setForm({ ...form, application_date: event.target.value })} className="form-control mt-1.5 min-h-10" /></label>
      <label className="text-xs font-medium">Resume<select value={form.resume_id} onChange={(event) => setForm({ ...form, resume_id: event.target.value })} className="form-control mt-1.5 min-h-10"><option value="">No linked resume</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label>
      <label className="text-xs font-medium">Job description<select value={form.job_description_id} onChange={(event) => setForm({ ...form, job_description_id: event.target.value })} className="form-control mt-1.5 min-h-10"><option value="">No linked job description</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.job_title}{job.company_name ? ` · ${job.company_name}` : ""}</option>)}</select></label>
      <label className="text-xs font-medium sm:col-span-2">Notes<textarea maxLength={10000} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="form-control mt-1.5 resize-y" /></label>
      {error ? <p role="alert" className="text-sm text-[#a23d35] sm:col-span-2">{error}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => { setShowForm(false); setEditing(null); setForm(blankForm); }} className="min-h-10 rounded border border-[#dce5df] px-3 text-sm">Cancel</button><button disabled={busy} className="min-h-10 rounded bg-[#176b50] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : editing ? "Save changes" : "Add application"}</button></div>
    </form> : null}
    {!showForm && error ? <p role="alert" className="mb-4 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm text-[#963d35]">{error}</p> : null}
    {message ? <p role="status" className="mb-4 text-sm text-[#176b50]">{message}</p> : null}
    {applications.length ? <div className="overflow-hidden rounded-md border border-[#e0e8e2] bg-white"><div className="hidden grid-cols-[minmax(0,1.5fr)_1fr_0.8fr_0.7fr_auto] gap-4 border-b border-[#e7ece8] bg-[#f8faf8] px-5 py-3 text-[11px] font-semibold uppercase text-[#65756b] sm:grid"><span>Role</span><span>Company</span><span>Application date</span><span>Status</span><span>Actions</span></div><ul>{applications.map((row, index) => <li key={row.id} className={`grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.5fr)_1fr_0.8fr_0.7fr_auto] sm:items-center sm:gap-4 sm:px-5 ${index ? "border-t border-[#edf1ee]" : ""}`}>
      <div className="min-w-0"><p className="truncate text-sm font-medium text-[#2b3c32]">{row.job_url ? <a href={row.job_url} target="_blank" rel="noreferrer" className="hover:underline">{row.job_title}</a> : row.job_title}</p>{row.notes ? <p className="mt-1 truncate text-xs text-[#819087]">{row.notes}</p> : null}</div><span className="truncate text-sm text-[#64736a]">{row.company_name}</span><span className="text-xs text-[#7c8981] sm:text-sm">{row.application_date ?? "Not set"}</span><label className="text-xs sm:hidden">Status<select disabled={busy} aria-label={`Status for ${row.job_title}`} value={row.status} onChange={(event) => void changeStatus(row, event.target.value as ApplicationStatus)} className="form-control mt-1 min-h-9">{APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><span className="hidden sm:block"><StatusBadge status={row.status} /></span><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => beginEdit(row)} className="min-h-9 rounded border border-[#dce5df] px-3 text-xs font-medium text-[#43564a]">Edit</button><button type="button" onClick={() => void remove(row)} disabled={busy} aria-label={`Delete ${row.job_title} at ${row.company_name}`} className="inline-flex size-9 items-center justify-center rounded border border-[#e8dedc] text-[#8e4c45] disabled:opacity-50"><Icon name="trash" size={15} /></button><select disabled={busy} aria-label={`Status for ${row.job_title}`} value={row.status} onChange={(event) => void changeStatus(row, event.target.value as ApplicationStatus)} className="hidden min-h-9 rounded border border-[#d9e2dc] bg-white px-2 text-xs sm:block">{APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div>
    </li>)}</ul></div> : <div className="rounded-md border border-[#e0e8e2] bg-white"><EmptyState icon="briefcase" title={filter === "All statuses" ? "No applications saved" : "No applications in this status"} description={filter === "All statuses" ? "Add an application to keep your private job search organized." : "Try another status or add an application."} /></div>}
  </>;
}
