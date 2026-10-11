"use client";

import { useMemo, useState } from "react";
import { getEffectiveMatchStatus, type MatchPriority, type MatchStatus, type ResumeMatchReport, type RequirementMatch } from "@/lib/resume-job-matcher";

const statusLabels: Record<MatchStatus, string> = {
  matched: "Matched",
  partially_matched: "Partially matched",
  not_found: "Not found",
  needs_review: "Needs review",
};

const statusStyles: Record<MatchStatus, string> = {
  matched: "border-[#bbd8c4] bg-[#edf6ef] text-[#2d6747]",
  partially_matched: "border-[#ead9ad] bg-[#fffaf0] text-[#705923]",
  not_found: "border-[#e8c8c4] bg-[#fbefed] text-[#8b3c34]",
  needs_review: "border-[#d5dbe6] bg-[#f3f5f8] text-[#505d72]",
};

function categoryLabel(category: RequirementMatch["requirement"]["category"]): string {
  const labels: Record<RequirementMatch["requirement"]["category"], string> = {
    required: "Required qualification",
    preferred: "Preferred qualification",
    skills: "Skill",
    responsibilities: "Responsibility",
    experienceEducation: "Experience and education",
    needsReview: "Needs review",
  };
  return labels[category];
}

function interpretation(score: number): string {
  if (score >= 80) return "Strong evidence across the requirements compared.";
  if (score >= 60) return "Several requirements have resume evidence; review the remaining gaps.";
  return "Some requirements have evidence; review potential gaps and ambiguous items.";
}

export function ResumeMatchResults({
  report,
  stale,
  onReview,
  onPriorityReview,
}: {
  report: ResumeMatchReport | null;
  stale: boolean;
  onReview: (id: string, status: MatchStatus | null) => void;
  onPriorityReview: (id: string, priority: MatchPriority | null) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<MatchStatus | "all">("all");
  const [groupBy, setGroupBy] = useState<"category" | "importance">("category");
  const grouped = useMemo(() => {
    if (!report) return [] as Array<[string, RequirementMatch[]]>;
    const filtered = report.findings.filter((finding) => statusFilter === "all" || getEffectiveMatchStatus(finding) === statusFilter);
    const groups = new Map<string, RequirementMatch[]>();
    for (const finding of filtered) {
      const priority = finding.reviewedPriority ?? finding.requirement.priority;
      const key = groupBy === "category" ? categoryLabel(finding.requirement.category) : priority === "unspecified" ? "Importance not specified" : `${priority[0].toUpperCase()}${priority.slice(1)}`;
      groups.set(key, [...(groups.get(key) ?? []), finding]);
    }
    return [...groups.entries()];
  }, [groupBy, report, statusFilter]);

  if (!report) {
    return <section aria-labelledby="resume-match-title" className="rounded-md border border-[#e0e8e2] bg-white p-5 sm:p-7">
      <h2 id="resume-match-title" className="text-base font-semibold text-[#25372d]">Resume match</h2>
      <p className="mt-2 text-sm leading-6 text-[#65756b]">Once a resume has been extracted and job requirements are ready, the comparison will appear here.</p>
    </section>;
  }

  return (
    <section aria-labelledby="resume-match-title" className="space-y-4">
      {stale ? <div role="status" className="rounded-md border border-[#ead9ad] bg-[#fffaf0] p-4 text-sm leading-5 text-[#705923]">Your resume or job requirements changed after this comparison. These results may be out of date; run the match again to refresh them.</div> : null}

      <section className="rounded-md border border-[#e0e8e2] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 id="resume-match-title" className="text-base font-semibold text-[#25372d]">Resume match</h2><p className="mt-1 text-sm text-[#65756b]">Indicative comparison, not a hiring or interview prediction.</p></div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase text-[#65756b]">Match score</p>
            <p className="mt-0.5 text-4xl font-semibold tabular-nums text-[#176b50]">{report.scorePercent === null ? "Unavailable" : `${report.scorePercent}%`}</p>
          </div>
        </div>
        {report.scorePercent !== null ? <>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#e8eee9]" role="progressbar" aria-label="Resume match score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={report.scorePercent}>
            <div className="h-full rounded-full bg-[#39815b] transition-[width]" style={{ width: `${report.scorePercent}%` }} />
          </div>
          <p className="mt-2 text-sm text-[#526259]">{interpretation(report.scorePercent)}</p>
        </> : <p className="mt-3 text-sm leading-5 text-[#526259]">{report.scoreExplanation}</p>}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#edf1ee] pt-4 sm:grid-cols-4">
          {(["matched", "partially_matched", "not_found", "needs_review"] as const).map((status) => <div key={status}>
            <p className="text-xl font-semibold tabular-nums text-[#34453b]">{report.counts[status]}</p><p className="text-xs text-[#65756b]">{statusLabels[status]}</p>
          </div>)}
        </div>
        <details className="mt-4 border-t border-[#edf1ee] pt-3">
          <summary className="cursor-pointer text-sm font-medium text-[#176b50] focus-visible:outline-2 focus-visible:outline-[#176b50]">How the score works</summary>
          <p className="mt-2 text-sm leading-6 text-[#65756b]">{report.scoreExplanation}</p>
          <p className="mt-1 text-xs leading-5 text-[#65756b]">These configurable defaults are product choices, not scientifically validated weights. Manual status corrections update the score when the requirement has a known scoring category. Importance-unclear items remain excluded until reviewed; automatic statuses stay visible.</p>
        </details>
      </section>

      <details className="border-t border-[#e0e8e2] pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#176b50] focus-visible:outline-2 focus-visible:outline-[#176b50]">View detailed comparison ({report.findings.length} requirements)</summary>
        <div className="mt-5 space-y-7">
        <section aria-labelledby="match-detail-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="match-detail-title" className="text-base font-semibold text-[#25372d]">Requirement comparison</h2><p className="mt-1 text-xs leading-5 text-[#65756b]">Every result shows the automatic assessment. Review labels are kept separately.</p></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="match-status-filter" className="mb-1 block text-xs font-medium text-[#526259]">Status</label><select id="match-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as MatchStatus | "all")} className="form-control h-9 py-1 text-xs"><option value="all">All</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label htmlFor="match-group-by" className="mb-1 block text-xs font-medium text-[#526259]">Group by</label><select id="match-group-by" value={groupBy} onChange={(event) => setGroupBy(event.target.value as "category" | "importance")} className="form-control h-9 py-1 text-xs"><option value="category">Category</option><option value="importance">Importance</option></select></div>
          </div>
        </div>
        {grouped.length === 0 ? <p className="rounded-md bg-[#f8faf8] p-4 text-sm text-[#65756b]">No requirements match this filter.</p> : <div className="space-y-5">
          {grouped.map(([group, findings]) => <section key={group} aria-label={group}>
            <h3 className="mb-2 border-b border-[#edf1ee] pb-2 text-sm font-semibold text-[#34453b]">{group}<span className="ml-1.5 font-normal text-[#65756b]">{findings.length}</span></h3>
            <ul className="space-y-3">
              {findings.map((finding) => {
                const id = finding.requirement.id;
                const effective = getEffectiveMatchStatus(finding);
                const priority = finding.reviewedPriority ?? finding.requirement.priority;
                return <li key={id} className="rounded-md border border-[#e7ece8] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-[#34453b]">{finding.requirement.text}</p>
                    <span className={`inline-flex min-h-6 items-center rounded border px-2 text-xs font-semibold ${statusStyles[effective]}`}>{statusLabels[effective]}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#65756b]">{categoryLabel(finding.requirement.category)} · {priority === "unspecified" ? "Importance not specified" : `${priority[0].toUpperCase()}${priority.slice(1)}`}{finding.reviewedPriority ? ` · manually reviewed (automatic: ${finding.requirement.priority})` : ""}</p>
                  <p className="mt-2 text-sm leading-5 text-[#526259]">{finding.explanation}</p>
                  {finding.automaticStatus !== "not_found" && finding.evidenceExcerpts.length > 0 ? <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-semibold text-[#526259]">Resume evidence</p>
                    {finding.evidenceExcerpts.map((excerpt, index) => <blockquote key={`${id}-${index}`} className="border-l-2 border-[#b9c9bf] pl-3 text-sm leading-5 text-[#65756b]">{excerpt}</blockquote>)}
                  </div> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#edf1ee] pt-2">
                    <label htmlFor={`review-${id}`} className="text-xs font-medium text-[#526259]">Review classification</label>
                    <select id={`review-${id}`} value={finding.reviewedStatus ?? "automatic"} onChange={(event) => onReview(id, event.target.value === "automatic" ? null : event.target.value as MatchStatus)} className="form-control h-8 w-auto min-w-40 py-1 text-xs">
                      <option value="automatic">Use automatic result</option>
                      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    {finding.reviewedStatus ? <span className="text-xs text-[#526259]">Manually reviewed · automatic: {statusLabels[finding.automaticStatus]}</span> : null}
                    {(finding.requirement.priority === "unspecified" || finding.reviewedPriority) ? <>
                      <label htmlFor={`priority-${id}`} className="sr-only">Review importance</label>
                      <select id={`priority-${id}`} aria-label={`Review importance for ${finding.requirement.text}`} value={priority} onChange={(event) => onPriorityReview(id, event.target.value === "unspecified" ? null : event.target.value as MatchPriority)} className="form-control h-8 w-auto min-w-36 py-1 text-xs">
                        <option value="unspecified">Importance not specified</option><option value="required">Required</option><option value="preferred">Preferred</option>
                      </select>
                    </> : null}
                  </div>
                </li>;
              })}
            </ul>
          </section>)}
        </div>}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="match-strengths-title" className="rounded-md border border-[#e0e8e2] bg-white p-5">
          <h2 id="match-strengths-title" className="text-sm font-semibold text-[#25372d]">Resume strengths</h2>
          {report.strengths.length ? <ul className="mt-3 space-y-3">{report.strengths.map((item, index) => <li key={`${item.requirement}-${index}`}><p className="text-sm font-medium text-[#34453b]">{item.requirement}</p><p className="mt-1 border-l-2 border-[#b9c9bf] pl-2 text-xs leading-5 text-[#65756b]">{item.evidence}</p></li>)}</ul> : <p className="mt-2 text-sm leading-5 text-[#65756b]">No confirmed strengths with supporting excerpts yet.</p>}
        </section>
        <section aria-labelledby="match-gaps-title" className="rounded-md border border-[#e0e8e2] bg-white p-5">
          <h2 id="match-gaps-title" className="text-sm font-semibold text-[#25372d]">Potential gaps</h2>
          {report.gaps.length ? <ul className="mt-3 space-y-2">{report.gaps.map((gap, index) => <li key={`${gap.requirement}-${index}`} className="text-sm leading-5 text-[#526259]"><span className="font-medium">{gap.priority === "required" ? "Required" : gap.priority === "preferred" ? "Preferred" : "Unspecified"}:</span> {gap.requirement} <span className="text-xs text-[#65756b]">({statusLabels[gap.status]})</span></li>)}</ul> : <p className="mt-2 text-sm leading-5 text-[#65756b]">No partially supported or missing requirements in the current comparison.</p>}
        </section>
      </div>

      <section aria-labelledby="match-next-steps-title" className="rounded-md border border-[#e0e8e2] bg-white p-5">
        <h2 id="match-next-steps-title" className="text-sm font-semibold text-[#25372d]">Suggested next steps</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-[#526259]">{report.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul>
      </section>
        </div>
      </details>
    </section>
  );
}
