"use client";

import { useMemo, useState } from "react";
import { buildPortfolioMatch, portfolioCandidates, portfolioJobs } from "@/lib/portfolio-samples";

const statusLabel = {
  matched: "Matched",
  partially_matched: "Partially matched",
  not_found: "Not found",
  needs_review: "Needs review",
} as const;

const statusStyle = {
  matched: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partially_matched: "border-amber-200 bg-amber-50 text-amber-900",
  not_found: "border-rose-200 bg-rose-50 text-rose-900",
  needs_review: "border-slate-200 bg-slate-100 text-slate-700",
} as const;

export function PortfolioDemo() {
  const [candidateId, setCandidateId] = useState(portfolioCandidates[0].id);
  const [jobId, setJobId] = useState(portfolioJobs[0].id);
  const { candidate, job, report } = useMemo(() => buildPortfolioMatch(candidateId, jobId), [candidateId, jobId]);
  const visibleFindings = report.findings.slice(0, 6);

  return (
    <div className="space-y-8">
      <section className="grid gap-5 lg:grid-cols-2" aria-label="Choose fictional samples">
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <legend className="text-sm font-semibold text-slate-950">Choose a fictional candidate</legend>
          <div className="mt-4 grid gap-3">
            {portfolioCandidates.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={candidateId === item.id}
                onClick={() => setCandidateId(item.id)}
                className={`rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${candidateId === item.id ? "border-sky-700 bg-sky-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <span className="block font-semibold text-slate-950">{item.name}</span>
                <span className="mt-1 block text-sm text-slate-700">{item.headline}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <legend className="text-sm font-semibold text-slate-950">Choose a fictional job posting</legend>
          <div className="mt-4 grid gap-3">
            {portfolioJobs.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={jobId === item.id}
                onClick={() => setJobId(item.id)}
                className={`rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${jobId === item.id ? "border-sky-700 bg-sky-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <span className="block font-semibold text-slate-950">{item.title}</span>
                <span className="mt-1 block text-sm text-slate-700">{item.organization}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]" aria-live="polite" aria-label="Illustrative fictional match">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Selected fictional candidate</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{candidate.name}</h2>
          <p className="mt-2 text-lg text-slate-700">{candidate.headline}</p>
          <p className="mt-4 leading-7 text-slate-600">{candidate.summary}</p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Sample candidate highlights">
            {candidate.highlights.map((highlight) => <li key={highlight} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{highlight}</li>)}
          </ul>
          <div className="mt-7 border-t border-slate-200 pt-6">
            <p className="text-sm font-semibold text-slate-900">Selected fictional role</p>
            <p className="mt-2 text-lg font-semibold text-slate-800">{job.title} · {job.organization}</p>
            <p className="mt-2 leading-7 text-slate-600">{job.summary}</p>
          </div>
        </article>

        <article className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-300">Illustrative match overview</p>
          <p className="mt-4 text-5xl font-bold tabular-nums">{report.scorePercent === null ? "—" : `${report.scorePercent}%`}</p>
          <p className="mt-2 text-slate-300">Illustrative score calculated in this browser from the selected fictional samples.</p>
          <dl className="mt-8 space-y-4">
            {(["matched", "partially_matched", "not_found", "needs_review"] as const).map((status) => (
              <div key={status} className="flex items-center justify-between border-b border-slate-700 pb-3 last:border-0 last:pb-0">
                <dt className="text-slate-300">{statusLabel[status]}</dt><dd className="font-semibold tabular-nums">{report.counts[status]}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="sample-evidence-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Illustrative evidence</p>
            <h2 id="sample-evidence-title" className="mt-2 text-2xl font-bold text-slate-950">Sample requirement comparison</h2>
          </div>
          <span className="text-sm text-slate-600">{report.scoreExplanation}</span>
        </div>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {visibleFindings.map((finding) => {
            const status = finding.automaticStatus;
            return <li key={finding.requirement.id} className="rounded-xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-950">{finding.requirement.text}</h3>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle[status]}`}>{statusLabel[status]}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{finding.explanation}</p>
              {finding.evidenceExcerpts[0] ? <blockquote className="mt-3 border-l-2 border-slate-300 pl-3 text-sm leading-6 text-slate-700">{finding.evidenceExcerpts[0]}</blockquote> : null}
            </li>;
          })}
        </ul>
      </section>

      <p className="text-sm leading-6 text-slate-500">
        These controls only switch fixed samples in browser memory. They do not collect input, save data, create accounts, upload files, or contact Supabase, Gemini, or an application API.
      </p>
    </div>
  );
}
