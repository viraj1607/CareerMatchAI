"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { isSupportedResumeFile, type AnalysisFormErrors } from "@/lib/analysis-validation";
import { JobDescriptionInput } from "@/components/job-description-input";
import { JobDescriptionResults } from "@/components/job-description-results";
import { analyzeJobDescription, editableJobDescriptionAnalysisSchema, makeEditableAnalysis } from "@/lib/job-description-analysis";
import { analyzeResumeMatch, collectMatchRequirements } from "@/lib/resume-job-matcher";
import type { MatchPriority } from "@/lib/resume-job-matcher";
import { formatFileSize } from "@/lib/resume-upload-policy";
import type { ResumeParseResponse } from "@/lib/resume-upload-types";
import { ResumeMatchResults } from "@/components/resume-match-results";
import { GeminiMatchAnalysis } from "@/components/gemini-match-analysis";
import { enrichGeminiAnalysis, mayRunGeminiAnalysis, type GeminiAnalysis } from "@/lib/gemini-analysis";
import { useResumeStudio } from "@/components/resume-studio-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { initialResumeEditorState, resumeContentSchema, resumeContentToText } from "@/lib/resume-editor";
import { savedDataQuotaMessage } from "@/lib/saved-data-errors";

export function ResumeAnalysisForm({ maxFileSizeBytes, initialSavedJobId }: { maxFileSizeBytes: number; initialSavedJobId: string | null }) {
  const loadJobId = initialSavedJobId;
  const studio = useResumeStudio();
  const loadResumeInStudio = studio.loadSavedResume;
  const setTargetContext = studio.setTargetContext;
  const inputRef = useRef<HTMLInputElement>(null);
  const { workflow, dispatchWorkflow, jobTitle, setJobTitle, companyName, setCompanyName, savedJobId, setSavedJobId, savedResumeId, setSavedResumeId, geminiResult, setGeminiResult, geminiStale, setGeminiStale, getPendingJobId, clearPendingJobId, loadedJobRef } = studio.analysis;
  const requestRef = useRef<AbortController | null>(null);
  const geminiRequestRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const { resume: parsed, jobDescription, jobAnalysis, jobDescriptionNeedsAnalysis, matchReport, matchStale } = workflow;
  const [errors, setErrors] = useState<AnalysisFormErrors>({});
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [geminiError, setGeminiError] = useState("");
  const [geminiConsent, setGeminiConsent] = useState(false);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [savedResumes, setSavedResumes] = useState<Array<{ id: string; name: string }>>([]);
  const [savedResumeLoading, setSavedResumeLoading] = useState(false);
  const [savedResumeError, setSavedResumeError] = useState("");
  const [saveConsent, setSaveConsent] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const saveLock = useRef(false);

  useEffect(() => () => {
    requestRef.current?.abort();
    geminiRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await getSupabaseBrowserClient().from("resumes").select("id,name").order("updated_at", { ascending: false });
        if (!cancelled) { setSavedResumes(data ?? []); if (error) setSavedResumeError("Your saved resumes could not be loaded."); }
      } catch { if (!cancelled) setSavedResumeError("Your saved resumes could not be loaded."); }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadSavedResume = useCallback(async (id: string): Promise<boolean> => {
    setSavedResumeLoading(true); setSavedResumeError(""); setUploadError("");
    try {
      const { data: resume, error } = await getSupabaseBrowserClient().from("resumes").select("id,name,content,original_content,extracted_text,original_resume_id").eq("id", id).maybeSingle();
      if (error || !resume) { setSavedResumeError("That saved resume is not available to this account."); return false; }
      const current = resumeContentSchema.safeParse(resume.content);
      const original = resumeContentSchema.safeParse(resume.original_content);
      if (!current.success || !original.success) { setSavedResumeError("That saved resume has an unsupported format and could not be opened."); return false; }
      const loaded = initialResumeEditorState(resume.extracted_text, resume.name);
      loaded.savedResumeId = resume.id; loaded.originalResumeId = resume.original_resume_id; loaded.savedName = resume.name;
      loaded.currentContent = current.data; loaded.originalContent = original.data; loaded.savedSnapshot = JSON.stringify(current.data);
      loadResumeInStudio(loaded);
      const text = resumeContentToText(current.data).trim() ? resumeContentToText(current.data) : resume.extracted_text;
      const type = resume.name.toLowerCase().endsWith(".docx") ? "docx" : "pdf";
      dispatchWorkflow({ type: "resume-selected", resume: { fileName: resume.name, fileType: type, fileSizeBytes: 0, text } });
      setSavedResumeId(resume.id); setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return true;
    } catch { setSavedResumeError("The saved resume could not be loaded. Check your connection and retry."); return false; }
    finally { setSavedResumeLoading(false); }
  }, [loadResumeInStudio, dispatchWorkflow, setSavedResumeId]);

  useEffect(() => {
    if (!loadJobId || loadedJobRef.current === loadJobId) return;
    loadedJobRef.current = loadJobId;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: job, error } = await supabase.from("job_descriptions").select("id,job_title,company_name,original_description,reviewed_requirements").eq("id", loadJobId).maybeSingle();
        if (cancelled) return;
        if (error || !job) { setSaveError("That saved job description is not available to this account."); return; }
        const savedAnalysis = editableJobDescriptionAnalysisSchema.safeParse(job.reviewed_requirements);
        setJobTitle(job.job_title); setCompanyName(job.company_name); setSavedJobId(job.id);
        dispatchWorkflow({ type: "description-changed", value: job.original_description });
        dispatchWorkflow({ type: "analysis-completed", analysis: savedAnalysis.success ? savedAnalysis.data : makeEditableAnalysis(analyzeJobDescription(job.original_description)) });
        const { data: prior } = await supabase.from("match_analyses").select("resume_id").eq("job_description_id", job.id).order("analyzed_at", { ascending: false }).limit(1).maybeSingle();
        if (cancelled || !prior?.resume_id) return;
        if (await loadSavedResume(prior.resume_id)) setSavedResumeId(prior.resume_id);
      } catch { if (!cancelled) setSaveError("Could not load this saved job. Check your connection and retry."); }
    })();
    return () => { cancelled = true; };
  }, [loadJobId, loadSavedResume, loadedJobRef, dispatchWorkflow, setJobTitle, setCompanyName, setSavedJobId, setSavedResumeId]);

  function invalidateGemini() {
    geminiRequestRef.current?.abort();
    geminiRequestRef.current = null;
    setGeminiLoading(false);
    setGeminiStale(Boolean(geminiResult));
    setGeminiConsent(false);
    setGeminiError("");
  }

  function selectFile(selected?: File) {
    if (!selected) return;
    invalidateGemini();
    studio.setResumeSource("", selected.name);
    setSavedResumeId("");
    requestRef.current?.abort();
    setIsProcessing(false);
    dispatchWorkflow({ type: "resume-selected", resume: null });
    setUploadError("");
    if (!isSupportedResumeFile(selected.name)) {
      setFile(null);
      setErrors((previous) => ({ ...previous, resume: "Choose a PDF or DOCX file." }));
      return;
    }
    if (!selected.size) {
      setFile(null);
      setErrors((previous) => ({ ...previous, resume: "This file is empty. Choose another PDF or DOCX file." }));
      return;
    }
    if (selected.size > maxFileSizeBytes) {
      setFile(null);
      setErrors((previous) => ({ ...previous, resume: `This file is too large. Choose a file up to ${formatFileSize(maxFileSizeBytes)}.` }));
      return;
    }
    setFile(selected);
    setErrors((previous) => ({ ...previous, resume: undefined }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
  }

  function clearFile() {
    invalidateGemini();
    studio.setResumeSource("", "");
    setSavedResumeId("");
    requestRef.current?.abort();
    requestRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    dispatchWorkflow({ type: "resume-selected", resume: null });
    setUploadError("");
    setIsProcessing(false);
    setErrors((previous) => ({ ...previous, resume: undefined }));
  }

  async function extractText() {
    if (!file || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setIsProcessing(true);
    setUploadError("");
    dispatchWorkflow({ type: "resume-selected", resume: null });
    try {
      const response = await fetch("/api/resume/parse", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Resume-File-Name": encodeURIComponent(file.name) },
        body: file,
        signal: controller.signal,
      });
      const result = await response.json() as ResumeParseResponse;
      if (!response.ok || "error" in result) {
        setUploadError("error" in result ? result.error.message : "The file could not be processed. Please try again.");
        return;
      }
      dispatchWorkflow({ type: "resume-selected", resume: result });
      studio.setResumeSource(result.text, result.fileName);
      setErrors((previous) => ({ ...previous, resume: undefined }));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setUploadError("The file could not be processed. Check your connection and try again.");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsProcessing(false);
      }
    }
  }

  function analyzeJobPosting() {
    invalidateGemini();
    dispatchWorkflow({ type: "analysis-completed", analysis: makeEditableAnalysis(analyzeJobDescription(jobDescription)) });
  }

  const requirements = useMemo(() => collectMatchRequirements(jobAnalysis), [jobAnalysis]);
  useEffect(() => {
    setTargetContext(jobDescription, requirements.map(({ id, text }) => ({ id, text })));
  }, [setTargetContext, jobDescription, requirements]);
  const hasResumeText = Boolean(parsed?.text.trim());
  const canAnalyzeMatch = hasResumeText && requirements.length > 0 && !jobDescriptionNeedsAnalysis;

  function analyzeMatch() {
    if (!parsed?.text.trim() || !requirements.length) return;
    dispatchWorkflow({ type: "match-completed", report: analyzeResumeMatch(parsed.text, jobAnalysis) });
  }

  async function saveJobAndAnalysis() {
    if (saveLock.current) return;
    setSaveError(""); setSaveMessage("");
    if (!saveConsent) { setSaveError("Confirm the save disclosure before storing job or analysis details."); return; }
    if (!jobTitle.trim() || !companyName.trim() || !jobDescription.trim() || !jobAnalysis) { setSaveError("Add the job title, company, and job description, then analyze and review the requirements."); return; }
    if (matchReport && !matchStale && !studio.state.savedResumeId) { setSaveError("Save the resume from the editor before saving its match analysis."); return; }
    saveLock.current = true; setSaveBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user || authError) { setSaveError("Your session expired. Sign in again; the current analysis remains on this page."); return; }
      const record = { user_id: user.id, job_title: jobTitle.trim(), company_name: companyName.trim(), original_description: jobDescription, reviewed_requirements: jobAnalysis };
      const jobResult = savedJobId
        ? await supabase.from("job_descriptions").update(record).eq("id", savedJobId).select("id").maybeSingle()
        : await supabase.from("job_descriptions").upsert({ ...record, id: getPendingJobId() }, { onConflict: "id" }).select("id").single();
      if (jobResult.error || !jobResult.data) { setSaveError(savedDataQuotaMessage(jobResult.error) ?? "Job description was not saved. Your text and edits remain available; check your connection and try again."); return; }
      clearPendingJobId();
      setSavedJobId(jobResult.data.id);
      if (matchReport && !matchStale && parsed?.text && studio.state.savedResumeId) {
        const { data: { user: verified }, error: verifyError } = await supabase.auth.getUser();
        if (!verified || verifyError) { setSaveError("The job was saved, but the analysis was not. Sign in again and retry saving the comparison."); return; }
        const result = await supabase.from("match_analyses").insert({
          user_id: verified.id, resume_id: studio.state.savedResumeId, job_description_id: jobResult.data.id,
          deterministic_score: matchReport.scorePercent,
          deterministic_results: { report: matchReport, reviewedRequirements: jobAnalysis },
          ai_contextual_analysis: geminiResult && !geminiStale ? geminiResult : null,
          formula_version: "phase4-v1",
        }).select("id").single();
        if (result.error) { setSaveError(`The job was saved, but this match analysis was not. ${savedDataQuotaMessage(result.error) ?? "Your results remain on this page; check your connection before trying again."}`); return; }
        setSaveMessage("Job description and match analysis saved privately.");
      } else setSaveMessage("Job description and reviewed requirements saved privately.");
    } catch { setSaveError("Your data was not fully saved. Current edits remain on this page; check your connection and retry."); }
    finally { saveLock.current = false; setSaveBusy(false); }
  }

  async function analyzeWithAI() {
    if (!parsed?.text.trim() || geminiRequestRef.current) return;
    if (!mayRunGeminiAnalysis(geminiConsent, Boolean(parsed?.text.trim() && jobDescription.trim() && requirements.length && !jobDescriptionNeedsAnalysis), geminiLoading)) return;
    const controller = new AbortController();
    geminiRequestRef.current = controller;
    setGeminiLoading(true);
    setGeminiError("");
    try {
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, resumeText: parsed.text, jobDescription, requirements: requirements.map(({ id, text, category }) => ({ id, text, category })) }),
        signal: controller.signal,
      });
      const payload = await response.json() as GeminiAnalysis | { error?: { message?: string } };
      if (!response.ok) {
        setGeminiError("error" in payload ? payload.error?.message ?? "AI analysis failed. Please retry." : "AI analysis failed. Please retry.");
        return;
      }
      setGeminiResult(enrichGeminiAnalysis(payload as GeminiAnalysis, requirements, matchReport));
      setGeminiStale(false);
    } catch {
      if (!controller.signal.aborted) setGeminiError("Gemini could not be reached. Your resume, job description, and deterministic results are unchanged; please retry.");
    } finally {
      if (geminiRequestRef.current === controller) { geminiRequestRef.current = null; setGeminiLoading(false); }
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <form onSubmit={(event) => event.preventDefault()} noValidate className="rounded-md border border-[#e0e8e2] bg-white p-5 sm:p-7">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-[#25372d]">Resume and job description</h2>
            <p className="mt-1 text-sm text-[#65756b]">Add the resume and job posting you want to compare.</p>
          </div>

          <p className="mb-5 flex items-center gap-2 text-xs leading-5 text-[#65756b]"><Icon name="info" size={15} />Files are processed temporarily. Saving and Gemini analysis each require separate consent.</p>

          <div className="space-y-5">
            <details className="rounded border border-[#e4ebe6] bg-[#f9fbf9] p-3">
              <summary className="cursor-pointer text-sm font-medium text-[#4d5e53]">Use a saved resume</summary>
              <div className="mt-3">
              <label htmlFor="saved-resume" className="block text-xs font-medium text-[#4d5e53]">Select a resume<select id="saved-resume" value={savedResumeId} onChange={(event) => { setSavedResumeId(event.target.value); setSavedResumeError(""); }} className="form-control mt-1.5 min-h-10"><option value="">Choose a saved resume</option>{savedResumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label>
              {savedResumeId ? <button type="button" onClick={() => void loadSavedResume(savedResumeId)} disabled={savedResumeLoading} className="mt-2 min-h-9 rounded border border-[#176b50] px-3 text-xs font-semibold text-[#176b50] disabled:opacity-50">{savedResumeLoading ? "Loading resume…" : "Use selected resume"}</button> : null}
              {savedResumeError ? <p role="alert" className="mt-2 text-xs text-[#a23d35]">{savedResumeError}</p> : null}
              {!savedResumes.length && !savedResumeError ? <p className="mt-2 text-xs text-[#65756b]">No saved resumes yet. You can still upload a file below.</p> : null}
              </div>
            </details>
            <div>
              <label htmlFor="resume-file" className="mb-2 block text-sm font-medium text-[#34453b]">Resume file <span className="text-[#a64b43]">*</span></label>
              <input ref={inputRef} id="resume-file" name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileChange} aria-invalid={Boolean(errors.resume)} aria-describedby={errors.resume ? "resume-error" : "resume-help"} className="peer sr-only" />
              <label htmlFor="resume-file" onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }} onDrop={handleDrop} className={`group flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-5 py-5 text-center peer-focus-visible:ring-2 peer-focus-visible:ring-[#176b50] ${isDragging ? "border-[#176b50] bg-[#eef6f0]" : "border-[#b9c9bf] bg-[#f9fbf9] hover:border-[#59906f] hover:bg-[#f4f8f5]"}`}>
                <span className="flex size-10 items-center justify-center rounded-full bg-[#eaf2ed] text-[#36745a]"><Icon name="upload" size={20} /></span>
                <span className="mt-2 text-sm font-medium text-[#355343]">{file?.name || "Choose or drop a resume file"}</span>
                <span className="mt-1 text-xs text-[#65756b]">PDF or DOCX · Maximum {formatFileSize(maxFileSizeBytes)}</span>
              </label>
              <p id="resume-help" className="mt-1.5 text-xs text-[#65756b]">Upload is temporary and only used to extract readable text.</p>
              {file ? <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#65756b]"><span>{file.name} · {formatFileSize(file.size)}</span><button type="button" onClick={clearFile} className="font-medium text-[#176b50] underline underline-offset-2">Remove file</button></div> : null}
              {errors.resume ? <p id="resume-error" role="alert" className="mt-1.5 text-xs font-medium text-[#a23d35]">{errors.resume}</p> : null}
              {file && !parsed ? <button type="button" onClick={extractText} disabled={isProcessing} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#176b50] px-3 text-sm font-semibold text-[#176b50] hover:bg-[#f2f7f3] disabled:cursor-wait disabled:opacity-60">
                {isProcessing ? <><span className="size-4 animate-spin rounded-full border-2 border-[#b8c9bf] border-t-[#176b50]" aria-hidden="true" />Extracting text…</> : "Extract resume text"}
              </button> : null}
              {isProcessing ? <p role="status" className="mt-2 text-xs text-[#65756b]">Processing the document securely in memory.</p> : null}
              {uploadError ? <p role="alert" className="mt-2 text-sm leading-5 text-[#a23d35]">{uploadError}</p> : null}
            </div>

            {parsed ? <details className="border-t border-[#edf1ee] pt-4">
              <summary className="cursor-pointer text-sm font-medium text-[#176b50]">Preview extracted text</summary>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase text-[#36745a]">Extraction complete</p><h3 className="mt-1 text-sm font-semibold text-[#34453b]">{parsed.fileName}</h3></div>
                <button type="button" onClick={clearFile} className="text-sm font-medium text-[#176b50] underline underline-offset-2">Replace or remove</button>
              </div>
              <h4 className="mt-4 text-xs font-semibold text-[#44564b]">Extracted text</h4>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-[#e2eae4] bg-white p-3 font-sans text-sm leading-6 text-[#425248]">{parsed.text}</pre>
              <Link href="/editor" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-[#176b50] px-3 text-sm font-semibold text-[#176b50] hover:bg-[#f2f7f3]"><Icon name="file" size={16} />Edit and export resume</Link>
            </details> : null}

            <JobDescriptionInput
              value={jobDescription}
              externalError={errors.description}
              onChange={(value) => {
                invalidateGemini();
                setSaveConsent(false);
                setSaveMessage("");
                dispatchWorkflow({ type: "description-changed", value });
                setErrors((previous) => ({ ...previous, description: undefined }));
              }}
              onAnalyze={analyzeJobPosting}
              onClear={() => { invalidateGemini(); dispatchWorkflow({ type: "fresh-description" }); setSavedJobId(null); setJobTitle(""); setCompanyName(""); setSaveMessage(""); setSaveConsent(false); }}
            />

            <div className="flex flex-col items-start justify-between gap-3 border-t border-[#edf1ee] pt-5 sm:flex-row sm:items-center">
              <button type="button" onClick={analyzeMatch} disabled={!canAnalyzeMatch} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#176b50] px-4 text-sm font-semibold text-white hover:bg-[#12583f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50] disabled:cursor-not-allowed disabled:bg-[#aebbb2]"><Icon name="scan" size={17} />Show match score</button>
              {!canAnalyzeMatch ? <div role="status" className="max-w-md space-y-1 text-sm leading-5 text-[#65756b]">{!hasResumeText ? <p>Extract readable text from a resume to enable the comparison.</p> : null}{requirements.length === 0 ? <p>Analyze the job description and keep or add at least one requirement to enable the comparison.</p> : null}{jobDescriptionNeedsAnalysis ? <p>Analyze the updated job description before comparing requirements.</p> : null}</div> : <p className="max-w-md text-sm leading-5 text-[#65756b]">Compare {requirements.length} detected requirement{requirements.length === 1 ? "" : "s"} against your resume.</p>}
            </div>

            <details className="border-t border-[#edf1ee] pt-4">
              <summary className="cursor-pointer text-sm font-medium text-[#176b50]">Save this job and analysis</summary>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="job-title" className="mb-2 block text-sm font-medium text-[#34453b]">Job title <span className="text-[#a64b43]">*</span></label>
                    <input id="job-title" name="jobTitle" type="text" maxLength={200} autoComplete="off" value={jobTitle} onChange={(event) => { setJobTitle(event.target.value); setSaveMessage(""); setSaveConsent(false); }} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "title-error" : undefined} className="form-control" placeholder="e.g. Product Designer" />
                    {errors.title ? <p id="title-error" role="alert" className="mt-1.5 text-xs font-medium text-[#a23d35]">{errors.title}</p> : null}
                  </div>
                  <div>
                    <label htmlFor="company" className="mb-2 block text-sm font-medium text-[#34453b]">Company name <span className="text-[#a64b43]">*</span></label>
                    <input id="company" name="company" type="text" maxLength={200} autoComplete="organization" value={companyName} onChange={(event) => { setCompanyName(event.target.value); setSaveMessage(""); setSaveConsent(false); }} aria-invalid={Boolean(errors.company)} aria-describedby={errors.company ? "company-error" : undefined} className="form-control" placeholder="e.g. Northwind Health" />
                    {errors.company ? <p id="company-error" role="alert" className="mt-1.5 text-xs font-medium text-[#a23d35]">{errors.company}</p> : null}
                  </div>
                </div>
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-[#59685e]"><input type="checkbox" checked={saveConsent} onChange={(event) => setSaveConsent(event.target.checked)} className="mt-0.5 size-4 accent-[#176b50]" /><span>I understand and consent to saving this resume match (if available), job description, and reviewed requirements in my private CareerMatch AI account. This is separate from Gemini consent.</span></label>
              {saveError ? <div role="alert" className="mt-2 text-sm text-[#a23d35]"><p>{saveError}</p><Link href="/saved-analyses" className="mt-1 inline-flex min-h-9 items-center font-semibold underline">Manage saved jobs and analyses</Link></div> : null}
              {saveMessage ? <p role="status" className="mt-2 text-sm text-[#176b50]">{saveMessage} <Link href="/saved-analyses" className="font-semibold underline">View saved analyses</Link></p> : null}
              <button type="button" onClick={() => void saveJobAndAnalysis()} disabled={!saveConsent || saveBusy || !jobDescription.trim()} className="mt-3 min-h-10 rounded border border-[#176b50] px-3 text-sm font-semibold text-[#176b50] disabled:opacity-50">{saveBusy ? "Saving…" : matchReport && !matchStale ? "Save job and match analysis" : "Save job description"}</button>
              {matchReport && !matchStale && !studio.state.savedResumeId ? <p className="mt-2 text-xs text-[#65756b]">To save the comparison, first save this resume from the Resume editor.</p> : null}
              </div>
            </details>

          </div>
        </form>

        <aside aria-label="Analysis results" className="space-y-6">
          {matchReport ? <section aria-labelledby="analysis-results-title">
            <div className="mb-4"><h2 id="analysis-results-title" className="text-base font-semibold text-[#25372d]">Your match results</h2><p className="mt-1 text-sm text-[#65756b]">The score is an estimate based on the requirements.</p></div>
            <ResumeMatchResults
              report={matchReport}
              stale={matchStale}
              onReview={(id, status) => { invalidateGemini(); dispatchWorkflow({ type: "match-reviewed", requirementId: id, status }); }}
              onPriorityReview={(id, priority: MatchPriority | null) => { invalidateGemini(); dispatchWorkflow({ type: "priority-reviewed", requirementId: id, priority }); }}
            />
          </section> : null}
          {jobAnalysis && hasResumeText ? <GeminiMatchAnalysis
            canAnalyze={Boolean(requirements.length && !jobDescriptionNeedsAnalysis)}
            result={geminiResult} stale={geminiStale} loading={geminiLoading} error={geminiError}
            consent={geminiConsent} onConsentChange={setGeminiConsent} onAnalyze={analyzeWithAI}
          /> : null}
          {jobAnalysis ? <details key={matchReport ? "match-ready" : "requirements-review"} open={!matchReport} className="border-t border-[#e0e8e2] pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#176b50]">Job requirements · {requirements.length} {matchReport ? "reviewed" : "to review"}</summary>
            <div className="mt-4"><JobDescriptionResults analysis={jobAnalysis} onChange={(analysis) => { invalidateGemini(); setSaveConsent(false); dispatchWorkflow({ type: "analysis-edited", analysis }); }} /></div>
          </details> : <JobDescriptionResults analysis={null} onChange={() => {}} />}
        </aside>
      </div>
    </>
  );
}
