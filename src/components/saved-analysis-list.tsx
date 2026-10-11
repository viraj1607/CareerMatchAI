"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SavedJobRow = { id: string; job_title: string; company_name: string; original_description: string; created_at: string };
type JobRelation = { job_title: string; company_name: string };
type ResumeRelation = { name: string };
export type SavedAnalysisRow = { id: string; deterministic_score: number | null; deterministic_results: unknown; ai_contextual_analysis: unknown; is_stale: boolean; analyzed_at: string; job_description_id: string | null; resume_id: string | null; job_descriptions: JobRelation | JobRelation[] | null; resumes: ResumeRelation | ResumeRelation[] | null };

function relatedRecord<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value as T | null;
}

export function SavedAnalysisList({ initialJobs, initialAnalyses, loadError = false }: { initialJobs: SavedJobRow[]; initialAnalyses: SavedAnalysisRow[]; loadError?: boolean }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [openAnalysis, setOpenAnalysis] = useState<SavedAnalysisRow | null>(null);
  const [error, setError] = useState(loadError ? "Saved job data could not be loaded. Check the database migration and refresh." : "");
  const [message, setMessage] = useState("");

  async function deleteJob(job: SavedJobRow) {
    if (!window.confirm(`Delete the saved job description for ${job.job_title}? Existing analyses and applications will be retained without this association.`)) return;
    const { data, error: deleteError } = await getSupabaseBrowserClient().from("job_descriptions").delete().eq("id", job.id).select("id").maybeSingle();
    if (deleteError || !data) setError("Job description was not deleted. Please retry.");
    else { setJobs((current) => current.filter(({ id }) => id !== job.id)); setAnalyses((current) => current.map((analysis) => analysis.job_description_id === job.id ? { ...analysis, job_description_id: null, job_descriptions: null, is_stale: true } : analysis)); setMessage("Job description deleted. Related analysis history was retained."); }
  }

  async function deleteAnalysis(analysis: SavedAnalysisRow) {
    if (!window.confirm("Delete this saved match analysis? The saved resume and job description will remain.")) return;
    const { data, error: deleteError } = await getSupabaseBrowserClient().from("match_analyses").delete().eq("id", analysis.id).select("id").maybeSingle();
    if (deleteError || !data) setError("Analysis was not deleted. Please retry.");
    else { setAnalyses((current) => current.filter(({ id }) => id !== analysis.id)); if (openAnalysis?.id === analysis.id) setOpenAnalysis(null); setMessage("Analysis deleted."); }
  }

  const findings = (analysis: SavedAnalysisRow) => {
    const root = analysis.deterministic_results as { report?: { findings?: Array<{ requirement?: { text?: string }; automaticStatus?: string; reviewedStatus?: string | null; explanation?: string; evidenceExcerpts?: string[] }> } } | null;
    return root?.report?.findings ?? [];
  };

  return <>
    {error ? <p role="alert" className="mb-4 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm text-[#963d35]">{error}</p> : null}
    {message ? <p role="status" className="mb-4 text-sm text-[#176b50]">{message}</p> : null}
    <section className="mb-9" aria-labelledby="saved-jobs-heading"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 id="saved-jobs-heading" className="text-base font-semibold text-[#25372d]">Saved job descriptions</h2><p className="mt-1 text-sm text-[#65756b]">Review requirements, update details, or rerun a comparison.</p></div><Link href="/analyze" className="mb-1 text-sm font-semibold text-[#176b50]">Add a job description</Link></div>
      {jobs.length ? <div className="overflow-hidden rounded-md border border-[#e0e8e2] bg-white"><ul>{jobs.map((job, index) => <li key={job.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${index ? "border-t border-[#edf1ee]" : ""}`}><div className="min-w-0"><p className="truncate text-sm font-medium text-[#2b3c32]">{job.job_title}</p><p className="mt-1 text-xs text-[#65756b]">{job.company_name || "Company not provided"} · Saved {new Date(job.created_at).toLocaleDateString("en-CA")}</p></div><div className="flex gap-2"><Link href={`/analyze?job=${encodeURIComponent(job.id)}`} className="min-h-9 rounded border border-[#dce5df] px-3 py-2 text-xs font-medium text-[#43564a]">Open and edit</Link><button type="button" onClick={() => void deleteJob(job)} aria-label={`Delete ${job.job_title}`} className="min-h-9 rounded border border-[#e8dedc] px-3 text-xs font-medium text-[#8e4c45]">Delete</button></div></li>)}</ul></div> : <div className="rounded-md border border-[#e0e8e2] bg-white"><EmptyState icon="briefcase" title="No saved job descriptions" description="Review a posting on Analyze resume and save it when you are ready." /></div>}
    </section>
    <section aria-labelledby="saved-matches-heading"><div className="mb-3"><h2 id="saved-matches-heading" className="text-base font-semibold text-[#25372d]">Previous match analyses</h2><p className="mt-1 text-sm text-[#65756b]">Deterministic results remain separate from optional AI context.</p></div>
      {analyses.length ? <div className="overflow-hidden rounded-md border border-[#e0e8e2] bg-white"><ul>{analyses.map((analysis, index) => { const job = relatedRecord(analysis.job_descriptions); const resume = relatedRecord(analysis.resumes); return <li key={analysis.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${index ? "border-t border-[#edf1ee]" : ""}`}><div className="min-w-0"><p className="truncate text-sm font-medium text-[#2b3c32]">{job?.job_title ?? "Job description removed"}</p><p className="mt-1 text-xs text-[#65756b]">{job?.company_name || "Company not provided"} · {resume?.name ?? "Resume removed"} · {new Date(analysis.analyzed_at).toLocaleDateString("en-CA")}</p><div className="mt-1 flex gap-2 text-xs">{analysis.is_stale ? <span className="font-medium text-[#8a6120]">Potentially outdated</span> : <span className="text-[#427052]">Current snapshot</span>}{analysis.ai_contextual_analysis ? <span className="text-[#65756b]">Includes separately consented AI context</span> : null}</div></div><div className="flex items-center gap-2"><span className="text-sm font-semibold text-[#176b50]">{analysis.deterministic_score == null ? "No score" : `${analysis.deterministic_score}%`}</span><button type="button" onClick={() => setOpenAnalysis(analysis)} className="min-h-9 rounded border border-[#dce5df] px-3 text-xs font-medium text-[#43564a]">View results</button>{analysis.job_description_id ? <Link href={`/analyze?job=${encodeURIComponent(analysis.job_description_id)}`} className="min-h-9 rounded border border-[#dce5df] px-3 py-2 text-xs font-medium text-[#43564a]">Rerun</Link> : null}<button type="button" onClick={() => void deleteAnalysis(analysis)} aria-label="Delete saved analysis" className="min-h-9 rounded border border-[#e8dedc] px-3 text-xs font-medium text-[#8e4c45]">Delete</button></div></li>; })}</ul></div> : <div className="rounded-md border border-[#e0e8e2] bg-white"><EmptyState icon="scan" title="No saved analyses" description="Run a comparison and save it to keep the result with its resume and job context." /></div>}
    </section>
    {openAnalysis ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17231d]/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenAnalysis(null); }}><section role="dialog" aria-modal="true" aria-labelledby="saved-analysis-title" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-md border border-[#e0e8e2] bg-white p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-[#7d8b82]">Saved deterministic analysis</p><h2 id="saved-analysis-title" className="mt-1 text-lg font-semibold text-[#25372d]">{relatedRecord(openAnalysis.job_descriptions)?.job_title ?? "Job description removed"}</h2><p className="mt-1 text-sm text-[#65756b]">{openAnalysis.deterministic_score == null ? "No score" : `${openAnalysis.deterministic_score}% match`} · {openAnalysis.is_stale ? "Potentially outdated" : "Saved snapshot"}</p></div><button type="button" onClick={() => setOpenAnalysis(null)} aria-label="Close analysis details" className="size-9 rounded border border-[#dce5df]">×</button></div><ul className="mt-5 space-y-3">{findings(openAnalysis).map((finding, index) => <li key={index} className="border-t border-[#edf1ee] pt-3"><p className="text-sm font-medium text-[#2b3c32]">{finding.requirement?.text ?? "Requirement"}</p><p className="mt-1 text-xs text-[#65756b]">Status: {finding.reviewedStatus ?? finding.automaticStatus ?? "Needs review"}</p>{finding.explanation ? <p className="mt-1 text-sm leading-5 text-[#64736a]">{finding.explanation}</p> : null}{finding.evidenceExcerpts?.map((excerpt, i) => <blockquote key={i} className="mt-2 border-l-2 border-[#86a994] pl-3 text-xs italic text-[#526157]">“{excerpt}”</blockquote>)}</li>)}</ul><p className="mt-5 border-t border-[#edf1ee] pt-4 text-xs leading-5 text-[#65756b]">AI contextual analysis, if present, is stored separately and does not change this deterministic score. Reopen the job and rerun matching to compare against current content.</p></section></div> : null}
  </>;
}
