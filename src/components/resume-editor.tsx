"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { useResumeStudio } from "@/components/resume-studio-provider";
import { addEducation, addExperience, addListItem as appendListItem, contentHasResumeText, deduplicateResumeContent, initialResumeEditorState, removeEducation, removeExperience, removeListItem as deleteListItem, resumeContentSchema, resumeContentToText, targetText, type ResumeContent, type ResumeEducation, type ResumeExperience, type ResumeSuggestion, type SuggestionTarget } from "@/lib/resume-editor";
import { mayRunGeminiAnalysis } from "@/lib/gemini-analysis";
import { MAX_RESUME_TEXT_LENGTH } from "@/lib/gemini-analysis";
import { savedDataQuotaMessage } from "@/lib/saved-data-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SuggestionResponse = { suggestions?: Array<Omit<ResumeSuggestion, "id" | "target" | "status" | "stale">>; error?: { message?: string } };

function Field({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-[#4d5e53]">{label}</span>{multiline
    ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} className="form-control resize-y leading-6" />
    : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="form-control min-h-10" />}</label>;
}

function TextEditor({ label, value, onChange, target, onSuggest, busy }: { label: string; value: string; onChange: (value: string) => void; target: SuggestionTarget; onSuggest: (target: SuggestionTarget) => void; busy: string | null }) {
  return <div className="space-y-2"><Field label={label} value={value} onChange={onChange} multiline placeholder="Add content when ready" /><button type="button" disabled={!value.trim() || busy !== null} onClick={() => onSuggest(target)} className="inline-flex min-h-8 items-center gap-2 rounded border border-[#cad9cf] px-2.5 text-xs font-medium text-[#176b50] hover:bg-[#f4f8f5] disabled:cursor-not-allowed disabled:opacity-50">{busy === JSON.stringify(target) ? <span className="size-3 animate-spin rounded-full border-2 border-[#b8c9bf] border-t-[#176b50]" aria-hidden="true" /> : <Icon name="scan" size={14} />}Suggest edits for this text</button></div>;
}

function Section({ title, optional = true, action, children }: { title: string; optional?: boolean; action?: ReactNode; children: ReactNode }) {
  return <section className="border-b border-[#e6ece8] py-5 first:pt-0 last:border-b-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-[#26382d]">{title}</h2>{optional ? <p className="mt-0.5 text-xs text-[#869188]">Optional</p> : null}</div>{action}</div>{children}</section>;
}

function commandButton(label: string, onClick: () => void, icon: "plus" | "trash" = "plus") {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="inline-flex min-h-8 items-center gap-1.5 rounded border border-[#cbd9cf] px-2.5 text-xs font-medium text-[#176b50] hover:bg-[#f4f8f5]"><Icon name={icon} size={14} /><span>{label}</span></button>;
}

function Preview({ content, overflowWarning, onPrint }: { content: ResumeContent; overflowWarning: boolean; onPrint: () => void }) {
  const section = (title: string, children: ReactNode) => <section className="resume-preview-section"><h3>{title}</h3>{children}</section>;
  return <div>
    <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[#26382d]">Live preview</h2><button type="button" onClick={onPrint} className="inline-flex min-h-9 items-center gap-2 rounded border border-[#cbd9cf] px-3 text-xs font-semibold text-[#176b50] hover:bg-[#f4f8f5]">Print preview</button></div>
    {overflowWarning ? <p className="mb-3 rounded border border-[#ead9ad] bg-[#fffaf0] p-3 text-xs leading-5 text-[#705923]">This resume is long and may create awkward page breaks. Review the print preview and exported files before submitting.</p> : null}
    <article className="resume-print-target resume-paper">
      {content.contact.name.trim() ? <h1>{content.contact.name}</h1> : null}
      {[content.contact.email, content.contact.phone, content.contact.location, content.contact.website].filter(Boolean).length ? <p className="resume-contact">{[content.contact.email, content.contact.phone, content.contact.location, content.contact.website].filter(Boolean).join(" | ")}</p> : null}
      {content.summary.trim() ? section("Professional Summary", <p>{content.summary}</p>) : null}
      {content.experience.some((entry) => [entry.jobTitle, entry.employer, entry.location, entry.dates, entry.description, ...entry.bullets].some((value) => value.trim())) ? section("Work Experience", <div className="space-y-3">{content.experience.filter((entry) => [entry.jobTitle, entry.employer, entry.location, entry.dates, entry.description, ...entry.bullets].some((value) => value.trim())).map((entry) => <div key={entry.id} className="resume-entry">{entry.jobTitle.trim() || entry.employer.trim() ? <p className="resume-entry-title">{entry.jobTitle.trim() || entry.employer}</p> : null}{entry.jobTitle.trim() && entry.employer.trim() ? <p>{entry.employer}</p> : null}{[entry.location, entry.dates].filter(Boolean).length ? <p className="resume-meta">{[entry.location, entry.dates].filter(Boolean).join(" | ")}</p> : null}{entry.description.trim() ? <p>{entry.description}</p> : null}{entry.bullets.filter((line) => line.trim()).length ? <ul>{entry.bullets.filter((line) => line.trim()).map((line, index) => <li key={`${entry.id}-${index}`}>{line}</li>)}</ul> : null}</div>)}</div>) : null}
      {content.education.some((entry) => [entry.qualification, entry.institution, entry.location, entry.dates, entry.details].some((value) => value.trim())) ? section("Education", <div className="space-y-2">{content.education.filter((entry) => [entry.qualification, entry.institution, entry.location, entry.dates, entry.details].some((value) => value.trim())).map((entry) => <div key={entry.id} className="resume-entry">{entry.qualification.trim() || entry.institution.trim() ? <p className="resume-entry-title">{entry.qualification.trim() || entry.institution}</p> : null}{entry.qualification.trim() && entry.institution.trim() ? <p>{entry.institution}</p> : null}{[entry.location, entry.dates].filter(Boolean).length ? <p className="resume-meta">{[entry.location, entry.dates].filter(Boolean).join(" | ")}</p> : null}{entry.details.trim() ? <p>{entry.details}</p> : null}</div>)}</div>) : null}
      {content.skills.length ? section("Skills", <p>{content.skills.map((item) => item.text.trim()).filter(Boolean).join(" · ")}</p>) : null}
      {content.certifications.length ? section("Certifications", <ul>{content.certifications.filter((item) => item.text.trim()).map((item) => <li key={item.id}>{item.text}</li>)}</ul>) : null}
      {content.projects.length ? section("Projects", <ul>{content.projects.filter((item) => item.text.trim()).map((item) => <li key={item.id}>{item.text}</li>)}</ul>) : null}
      {content.additionalInformation.trim() ? section("Additional Information", <p>{content.additionalInformation}</p>) : null}
      {!contentHasResumeText(content) ? <p className="resume-empty">Your resume preview will appear here as you add content.</p> : null}
    </article>
  </div>;
}

export function ResumeEditor({ initialResumeId }: { initialResumeId: string | null }) {
  const router = useRouter();
  const studio = useResumeStudio();
  const loadSavedResume = studio.loadSavedResume;
  const { state } = studio;
  const content = state.currentContent;
  const previewContent = useMemo(() => deduplicateResumeContent(content), [content]);
  const [consent, setConsent] = useState(false);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState("");
  const [exportBusy, setExportBusy] = useState<"pdf" | "docx" | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"editor" | "preview">("editor");
  const [resumeName, setResumeName] = useState(state.savedName || state.sourceFileName.replace(/\.(pdf|docx)$/i, "") || "My resume");
  const [saveBusy, setSaveBusy] = useState(false);
  const saveLock = useRef(false);
  const [resumeSaveConsent, setResumeSaveConsent] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const pendingInsertId = useRef<string | null>(null);
  const loadId = initialResumeId;
  const hasContent = contentHasResumeText(content);
  const isDirty = state.savedSnapshot !== JSON.stringify(content);
  useEffect(() => {
    if (!isDirty || !contentHasResumeText(content)) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty, content]);
  const longResume = resumeContentToText(content).length > 6500 || content.experience.reduce((sum, entry) => sum + entry.bullets.join(" ").length, 0) > 3500;
  const missingSections = useMemo(() => [!content.contact.name.trim() && "name/contact", !content.experience.length && "work experience", !content.education.length && "education", !content.skills.length && "skills"].filter(Boolean), [content]);

  useEffect(() => {
    if (!loadId || state.savedResumeId === loadId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await getSupabaseBrowserClient().from("resumes").select("id,user_id,name,content,original_content,extracted_text,original_resume_id").eq("id", loadId).maybeSingle();
        if (cancelled) return;
        if (error || !data) { setSaveError("That saved resume could not be opened. It may have been deleted or is not available to this account."); return; }
        const current = resumeContentSchema.safeParse(data.content);
        const original = resumeContentSchema.safeParse(data.original_content);
        if (!current.success || !original.success) { setSaveError("This saved resume has an unsupported format and could not be opened."); return; }
        const loaded = initialResumeEditorState(data.extracted_text, data.name);
        loaded.savedResumeId = data.id;
        loaded.originalResumeId = data.original_resume_id;
        loaded.savedName = data.name;
        loaded.currentContent = current.data;
        loaded.originalContent = original.data;
        loaded.savedSnapshot = JSON.stringify(current.data);
        loadSavedResume(loaded);
        setResumeName(data.name); setSaveError(""); setSaveMessage("");
      } catch { if (!cancelled) setSaveError("Could not load the saved resume. Check your connection and retry."); }
    })();
    return () => { cancelled = true; };
  }, [loadId, state.savedResumeId, loadSavedResume]);

  async function saveResume(asTailored = false) {
    if (saveLock.current) return;
    const name = resumeName.trim();
    if (!resumeSaveConsent) { setSaveError("Confirm the resume storage disclosure before saving this content."); return; }
    if (!hasContent || !name || name.length > 120 || saveBusy) { if (!name) setSaveError("Enter a name for this resume."); return; }
    saveLock.current = true; setSaveBusy(true); setSaveError(""); setSaveMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user || authError) { setSaveError("Your session expired. Sign in again; your edits are still here."); return; }
      const snapshot = JSON.stringify(content);
      const parentId = asTailored ? (state.savedResumeId ?? state.originalResumeId) : state.originalResumeId;
      const id = asTailored || !state.savedResumeId ? (pendingInsertId.current ??= crypto.randomUUID()) : state.savedResumeId;
      const record = { id, user_id: user.id, name, content, original_content: state.originalContent, extracted_text: state.originalText, original_resume_id: parentId };
      const result = state.savedResumeId && !asTailored
        ? await supabase.from("resumes").update({ name, content }).eq("id", id).select("id").maybeSingle()
        : await supabase.from("resumes").upsert(record, { onConflict: "id" }).select("id").single();
      if (result.error || !result.data) { setSaveError(savedDataQuotaMessage(result.error) ?? "The resume was not saved. Your edits remain on this page; check your connection and retry."); return; }
      pendingInsertId.current = null;
      const originalId = asTailored ? parentId ?? id : state.originalResumeId;
      studio.markResumeSaved(id, name, originalId, snapshot);
      setResumeSaveConsent(false);
      setSaveMessage("Resume saved to your private account.");
      router.replace(`/editor?id=${encodeURIComponent(id)}`, { scroll: false }); router.refresh();
    } catch { setSaveError("The resume was not saved. Your edits remain on this page; check your connection and retry."); }
    finally { saveLock.current = false; setSaveBusy(false); }
  }

  function change(update: (current: ResumeContent) => ResumeContent) {
    studio.updateContent(update(content));
    setExportMessage("");
    setExportError("");
  }

  function patchExperience(id: string, update: Partial<ResumeExperience>) {
    change((current) => ({ ...current, experience: current.experience.map((entry) => entry.id === id ? { ...entry, ...update } : entry) }));
  }
  function patchEducation(id: string, update: Partial<ResumeEducation>) {
    change((current) => ({ ...current, education: current.education.map((entry) => entry.id === id ? { ...entry, ...update } : entry) }));
  }
  function patchList(section: "skills" | "certifications" | "projects", id: string, text: string) {
    change((current) => ({ ...current, [section]: current[section].map((item) => item.id === id ? { ...item, text } : item) }));
  }

  async function suggest(target: SuggestionTarget) {
    if (!mayRunGeminiAnalysis(consent, true, Boolean(busyTarget))) return;
    const selectedText = targetText(content, target);
    if (!selectedText?.trim()) return;
    if ((state.originalText || resumeContentToText(content)).length > MAX_RESUME_TEXT_LENGTH) {
      setSuggestionError("This resume is too long to send for suggestions. Shorten it to 40,000 characters or less.");
      return;
    }
    const key = JSON.stringify(target);
    setBusyTarget(key);
    setSuggestionError("");
    try {
      const response = await fetch("/api/gemini/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, resumeText: state.originalText || resumeContentToText(content), targetText: selectedText, jobDescription: state.targetJobDescription, requirements: state.targetRequirements.slice(0, 30) }),
      });
      const payload = await response.json() as SuggestionResponse;
      if (!response.ok || !payload.suggestions) { setSuggestionError(payload.error?.message ?? "Suggestions could not be generated. Your resume is unchanged; please retry."); return; }
      const additions: ResumeSuggestion[] = payload.suggestions.map((item) => ({ ...item, id: crypto.randomUUID(), target, status: "pending", stale: false }));
      if (additions.length) studio.addSuggestions(additions);
      else setSuggestionError("No safe, evidence-supported edits were returned for this text.");
    } catch { setSuggestionError("Gemini could not be reached. Your resume is unchanged; please retry."); }
    finally { setBusyTarget(null); }
  }

  async function exportResume(format: "pdf" | "docx") {
    if (!hasContent || exportBusy) return;
    setExportBusy(format); setExportMessage(""); setExportError("");
    try {
      const response = await fetch(`/api/resume/export/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(content) });
      if (!response.ok) {
        const body = await response.json() as { error?: { message?: string } };
        setExportError(body.error?.message ?? "The file could not be generated. Your edits are still here.");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="([a-zA-Z0-9_.-]+)"/)?.[1] ?? `CareerMatch_Resume.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = fileName; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage(`${format.toUpperCase()} download ready: ${fileName}`);
    } catch { setExportError("The file could not be generated. Your edits are still here; please try again."); }
    finally { setExportBusy(null); }
  }

  function reset() {
    if (window.confirm("Reset the editable resume to the extracted original? Your edits will be discarded.")) studio.reset(true);
  }

  function patchContact(key: keyof ResumeContent["contact"], value: string) {
    change((current) => ({ ...current, contact: { ...current.contact, [key]: value } }));
  }

  function addListItem(section: "skills" | "certifications" | "projects") {
    change((current) => appendListItem(current, section, crypto.randomUUID()));
  }
  function removeListItem(section: "skills" | "certifications" | "projects", id: string) {
    change((current) => deleteListItem(current, section, id));
  }
  function editSuggestion(id: string) {
    const suggestion = state.suggestions.find((item) => item.id === id);
    const finalText = drafts[id] ?? suggestion?.suggestedText ?? "";
    if (!suggestion || suggestion.stale || !suggestion.suggestedText) return;
    studio.acceptSuggestion(id, finalText === suggestion.suggestedText ? undefined : finalText);
    setDrafts((previous) => { const next = { ...previous }; delete next[id]; return next; });
  }

  return <>
    <PageHeading title="Resume editor" description="Organize the extracted resume, review optional job-specific suggestions, and export the version you choose." action={<div className="flex gap-2"><button type="button" onClick={reset} disabled={JSON.stringify(state.currentContent) === JSON.stringify(state.originalContent)} className="min-h-10 rounded border border-[#cbd9cf] px-3 text-sm font-medium text-[#526258] hover:bg-white disabled:opacity-45">Reset to original</button><button type="button" onClick={() => setMode(mode === "editor" ? "preview" : "editor")} className="min-h-10 rounded bg-[#176b50] px-3 text-sm font-semibold text-white hover:bg-[#12583f] sm:hidden">{mode === "editor" ? "Preview" : "Edit"}</button></div>} />
    {!state.originalText ? <div className="mb-5 rounded border border-[#cbd9cf] bg-white p-4 text-sm leading-6 text-[#59685e]"><strong className="font-semibold text-[#2d4235]">Blank or imported resume.</strong> {state.sourceFileName ? `No document text has been extracted from ${state.sourceFileName} yet. ` : "No resume text is available from the Analyze page. "}You can begin with a blank resume, or extract a PDF/DOCX on Analyze resume; the original text will be organized here without replacing it.</div> : <div className="mb-5 rounded border border-[#cbd9cf] bg-white p-4 text-sm text-[#59685e]"><p><strong className="font-semibold text-[#2d4235]">Starting from {state.sourceFileName || "extracted text"}.</strong> The original extracted text is preserved separately; review imported sections because headings and fields are identified heuristically.</p><details className="mt-2"><summary className="cursor-pointer font-medium text-[#176b50]">View original extracted text</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-[#e2eae4] bg-[#f9fbf9] p-3 text-xs leading-5">{state.originalText}</pre></details></div>}
    {state.targetRequirements.length || state.targetJobDescription ? <div className="mb-5 rounded border border-[#ead9ad] bg-[#fffaf0] p-3 text-sm leading-5 text-[#705923]">This draft is tailored for the current job context{state.targetRequirements.length ? ` (${state.targetRequirements.length} reviewed requirements)` : ""}. If that target changes, pending suggestions are marked potentially outdated.</div> : null}
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded border border-[#ead9ad] bg-[#fffaf0] p-4 text-sm leading-5 text-[#705923]">
      <p className="max-w-3xl">Optional AI suggestions send your original resume text, the selected text, and relevant job context to Google's Gemini API. Provider handling may vary by billing tier; avoid unnecessary sensitive information. No edits are applied automatically. Suggestions can be inaccurate and must be reviewed. The deterministic matcher and editor work without Gemini.</p>
      <label className="flex min-w-64 cursor-pointer items-start gap-2 text-xs font-medium"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-4 accent-[#176b50]" /><span>I explicitly consent to sending my resume text to Gemini for suggestions.</span></label>
    </div>
    {suggestionError ? <p role="alert" className="mb-4 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm text-[#963d35]">{suggestionError}</p> : null}
    {missingSections.length ? <p className="mb-4 text-xs text-[#758279]">Optional sections still empty: {missingSections.join(", ")}.</p> : null}
    {exportError ? <p role="alert" className="mb-3 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm text-[#963d35]">{exportError}</p> : null}
    {exportMessage ? <p role="status" className="mb-3 rounded border border-[#bad7c3] bg-[#f2f8f3] p-3 text-sm text-[#245a3c]">{exportMessage}</p> : null}
    {saveError ? <p role="alert" className="mb-3 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm text-[#963d35]">{saveError}</p> : null}
    {saveMessage ? <p role="status" className="mb-3 rounded border border-[#bad7c3] bg-[#f2f8f3] p-3 text-sm text-[#245a3c]">{saveMessage}</p> : null}
    <section className="mb-5 rounded-md border border-[#dfe8e1] bg-white p-4">
      <p className="text-xs leading-5 text-[#64736a]">Saving stores the extracted text and structured resume content in your private Supabase account. The uploaded PDF/DOCX itself is discarded; this is not Gemini consent.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <label className="block min-w-0 flex-1 text-xs font-medium text-[#4d5e53]">Resume name<input value={resumeName} maxLength={120} onChange={(event) => { setResumeName(event.target.value); setSaveMessage(""); }} className="form-control mt-1.5 min-h-10" /></label>
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
        {state.savedResumeId ? <span className="mr-1 text-xs text-[#65756b]">{isDirty ? "Unsaved changes" : "Saved"}</span> : <span className="mr-1 text-xs text-[#65756b]">Not saved yet</span>}
        <button type="button" onClick={() => void saveResume()} disabled={!resumeSaveConsent || !hasContent || saveBusy || Boolean(!isDirty && state.savedResumeId && resumeName === state.savedName)} className="min-h-10 rounded bg-[#176b50] px-3 text-sm font-semibold text-white hover:bg-[#12583f] disabled:opacity-50">{saveBusy ? "Saving…" : state.savedResumeId ? "Save changes" : "Save resume"}</button>
        {state.savedResumeId ? <button type="button" onClick={() => void saveResume(true)} disabled={!resumeSaveConsent || !hasContent || saveBusy} className="min-h-10 rounded border border-[#176b50] px-3 text-sm font-semibold text-[#176b50] hover:bg-[#f2f7f3] disabled:opacity-50">Save as tailored version</button> : null}
      </div>
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-[#59685e]"><input type="checkbox" checked={resumeSaveConsent} onChange={(event) => { setResumeSaveConsent(event.target.checked); setSaveError(""); }} className="mt-0.5 size-4 accent-[#176b50]" /><span>I understand and consent to storing this resume's extracted text and structured content in my private CareerMatch AI account.</span></label>
    </section>
    {!hasContent ? <p className="mb-4 rounded border border-[#ead9ad] bg-[#fffaf0] p-3 text-sm text-[#705923]">Add at least one piece of resume content before exporting.</p> : null}
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
      {missingSections.length ? <span className="mr-auto text-xs text-[#8a6120]">Review missing sections before export.</span> : null}
      <button type="button" onClick={() => void exportResume("pdf")} disabled={!hasContent || Boolean(exportBusy)} className="min-h-10 rounded border border-[#176b50] px-3 text-sm font-semibold text-[#176b50] hover:bg-[#f2f7f3] disabled:opacity-45">{exportBusy === "pdf" ? "Creating PDF…" : "Download PDF"}</button>
      <button type="button" onClick={() => void exportResume("docx")} disabled={!hasContent || Boolean(exportBusy)} className="min-h-10 rounded border border-[#176b50] px-3 text-sm font-semibold text-[#176b50] hover:bg-[#f2f7f3] disabled:opacity-45">{exportBusy === "docx" ? "Creating DOCX…" : "Download DOCX"}</button>
    </div>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
      <div className={`${mode === "preview" ? "hidden sm:block" : ""} rounded-md border border-[#e0e8e2] bg-white p-5 sm:p-6`}>
        <div className="mb-4"><h2 className="text-base font-semibold text-[#25372d]">Editable content</h2><p className="mt-1 text-xs leading-5 text-[#65756b]">Unrecognized source text is kept in Additional Information so nothing is silently discarded. Remove it only after reviewing.</p></div>
        <Section title="Contact Information" optional={false}>
          <div className="grid gap-4 sm:grid-cols-2">{(["name", "email", "phone", "location", "website"] as const).map((key) => <Field key={key} label={{ name: "Name", email: "Email", phone: "Phone", location: "Location", website: "Website or LinkedIn" }[key]} value={content.contact[key]} onChange={(value) => patchContact(key, value)} />)}</div>
        </Section>
        <Section title="Professional Summary">
          <TextEditor label="Summary text" value={content.summary} onChange={(value) => change((current) => ({ ...current, summary: value }))} target={{ kind: "summary" }} onSuggest={(target) => void suggest(target)} busy={busyTarget} />
        </Section>
        <Section title="Work Experience" action={commandButton("Add experience", () => change((current) => addExperience(current, crypto.randomUUID())))}>
          {content.experience.length ? <div className="space-y-5">{content.experience.map((entry) => <article key={entry.id} className="border-l-2 border-[#dce8df] pl-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-[#54645a]">Experience entry</h3>{commandButton("Remove experience", () => change((current) => removeExperience(current, entry.id)), "trash")}</div>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Job title" value={entry.jobTitle} onChange={(value) => patchExperience(entry.id, { jobTitle: value })} /><Field label="Employer" value={entry.employer} onChange={(value) => patchExperience(entry.id, { employer: value })} /><Field label="Location (optional)" value={entry.location} onChange={(value) => patchExperience(entry.id, { location: value })} /><Field label="Employment dates (optional)" value={entry.dates} onChange={(value) => patchExperience(entry.id, { dates: value })} /></div>
            <div className="mt-3"><TextEditor label="Description and imported text" value={entry.description} onChange={(value) => patchExperience(entry.id, { description: value })} target={{ kind: "experience-description", entryId: entry.id }} onSuggest={(target) => void suggest(target)} busy={busyTarget} /></div>
            <div className="mt-4 space-y-3"><div className="flex justify-between gap-2"><h4 className="text-xs font-medium text-[#4d5e53]">Achievement bullets</h4>{commandButton("Add bullet", () => patchExperience(entry.id, { bullets: [...entry.bullets, ""] }))}</div>{entry.bullets.map((bullet, index) => <div key={`${entry.id}-bullet-${index}`} className="flex items-start gap-2"><div className="min-w-0 flex-1"><TextEditor label={`Bullet ${index + 1}`} value={bullet} onChange={(value) => patchExperience(entry.id, { bullets: entry.bullets.map((line, at) => at === index ? value : line) })} target={{ kind: "experience-bullet", entryId: entry.id, index }} onSuggest={(target) => void suggest(target)} busy={busyTarget} /></div><button type="button" title="Remove bullet" aria-label="Remove bullet" onClick={() => patchExperience(entry.id, { bullets: entry.bullets.filter((_, at) => at !== index) })} className="mt-6 flex size-8 shrink-0 items-center justify-center rounded border border-[#d4ded7] text-[#65756b]"><Icon name="trash" size={14} /></button></div>)}</div>
          </article>)}</div> : <p className="text-sm text-[#65756b]">No work experience added.</p>}
        </Section>
        <Section title="Education" action={commandButton("Add education", () => change((current) => addEducation(current, crypto.randomUUID())))}>
          {content.education.length ? <div className="space-y-5">{content.education.map((entry) => <article key={entry.id} className="border-l-2 border-[#dce8df] pl-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-[#54645a]">Education entry</h3>{commandButton("Remove education", () => change((current) => removeEducation(current, entry.id)), "trash")}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="Qualification" value={entry.qualification} onChange={(value) => patchEducation(entry.id, { qualification: value })} /><Field label="Institution" value={entry.institution} onChange={(value) => patchEducation(entry.id, { institution: value })} /><Field label="Location (optional)" value={entry.location} onChange={(value) => patchEducation(entry.id, { location: value })} /><Field label="Dates (optional)" value={entry.dates} onChange={(value) => patchEducation(entry.id, { dates: value })} /></div><div className="mt-3"><TextEditor label="Additional details" value={entry.details} onChange={(value) => patchEducation(entry.id, { details: value })} target={{ kind: "education-details", entryId: entry.id }} onSuggest={(target) => void suggest(target)} busy={busyTarget} /></div></article>)}</div> : <p className="text-sm text-[#65756b]">No education added.</p>}
        </Section>
        {(["skills", "certifications", "projects"] as const).map((section) => <Section key={section} title={{ skills: "Skills", certifications: "Certifications", projects: "Projects" }[section]} action={commandButton(`Add ${section === "skills" ? "skill" : section === "certifications" ? "certification" : "project"}`, () => addListItem(section))}>
          {content[section].length ? <div className="space-y-3">{content[section].map((item) => <div key={item.id} className="flex items-start gap-2"><div className="min-w-0 flex-1">{section === "skills" ? <Field label="Skill" value={item.text} onChange={(value) => patchList(section, item.id, value)} /> : <TextEditor label={section === "projects" ? "Project description" : "Certification"} value={item.text} onChange={(value) => patchList(section, item.id, value)} target={{ kind: section === "projects" ? "project" : "certification", itemId: item.id }} onSuggest={(target) => void suggest(target)} busy={busyTarget} />}</div><button type="button" title={`Remove ${section === "skills" ? "skill" : section === "certifications" ? "certification" : "project"}`} aria-label={`Remove ${section === "skills" ? "skill" : section === "certifications" ? "certification" : "project"}`} onClick={() => removeListItem(section, item.id)} className="mt-6 flex size-8 shrink-0 items-center justify-center rounded border border-[#d4ded7] text-[#65756b]"><Icon name="trash" size={14} /></button></div>)}</div> : <p className="text-sm text-[#65756b]">No {section} added.</p>}
        </Section>)}
        <Section title="Additional Information">
          <TextEditor label="Other relevant information or unorganized imported text" value={content.additionalInformation} onChange={(value) => change((current) => ({ ...current, additionalInformation: value }))} target={{ kind: "additional" }} onSuggest={(target) => void suggest(target)} busy={busyTarget} />
        </Section>
        {state.suggestions.length ? <Section title="AI suggestions" optional={false}><div className="space-y-4">{state.suggestions.map((item) => {
          const currentTarget = targetText(content, item.target) ?? "";
          const draft = drafts[item.id] ?? item.suggestedText ?? "";
          const duplicate = Boolean(item.suggestedText && item.suggestedText !== item.originalText && currentTarget.includes(item.suggestedText));
          const outdated = item.stale || !currentTarget.includes(item.originalText);
          return <article key={item.id} className="border-t border-[#e6ece8] pt-3 first:border-0 first:pt-0"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-[#53665a]">AI-generated proposal · {item.status.replaceAll("_", " ")}</span>{outdated ? <span className="text-xs font-semibold text-[#8a6120]">Potentially outdated</span> : null}</div><div className="grid gap-3 md:grid-cols-2"><div><p className="mb-1 text-xs font-medium text-[#65756b]">Original</p><p className="whitespace-pre-wrap break-words rounded border border-[#e2eae4] bg-[#f9fbf9] p-3 text-sm leading-5">{item.originalText}</p></div><div><p className="mb-1 text-xs font-medium text-[#65756b]">Suggested wording</p>{item.suggestedText ? <textarea value={draft} onChange={(event) => setDrafts((previous) => ({ ...previous, [item.id]: event.target.value }))} rows={3} className="form-control leading-5" disabled={item.status !== "pending"} /> : <p className="rounded border border-[#ead9ad] bg-[#fffaf0] p-3 text-sm text-[#705923]">Clarification needed: {item.clarificationQuestion}</p>}</div></div><p className="mt-2 text-sm leading-5 text-[#58675e]">{item.explanation}{item.requirementId ? ` Related requirement: ${state.targetRequirements.find(({ id }) => id === item.requirementId)?.text ?? "Reviewed requirement"}.` : ""}</p>{item.evidenceExcerpt && item.evidenceVerified ? <blockquote className="mt-2 border-l-2 border-[#86a994] pl-3 text-xs italic text-[#526157]">Evidence: “{item.evidenceExcerpt}”</blockquote> : null}{item.status === "pending" && item.suggestedText ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={outdated || duplicate || !draft.trim()} onClick={() => editSuggestion(item.id)} className="min-h-9 rounded bg-[#176b50] px-3 text-xs font-semibold text-white disabled:opacity-45">{draft === item.suggestedText ? "Accept" : "Accept edited text"}</button><button type="button" onClick={() => studio.rejectSuggestion(item.id)} className="min-h-9 rounded border border-[#cbd9cf] px-3 text-xs font-semibold text-[#526258]">Reject</button>{duplicate ? <p className="self-center text-xs text-[#8a6120]">This text already appears in the target section.</p> : null}</div> : item.status === "pending" ? <button type="button" onClick={() => studio.rejectSuggestion(item.id)} className="mt-3 min-h-9 rounded border border-[#cbd9cf] px-3 text-xs font-semibold text-[#526258]">Dismiss clarification</button> : null}</article>;
        })}</div></Section> : null}
      </div>
      <div className={mode === "editor" ? "hidden sm:block" : ""}><Preview content={previewContent} overflowWarning={longResume} onPrint={() => window.print()} /></div>
    </div>
  </>;
}
