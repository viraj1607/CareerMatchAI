"use client";

import type { GeminiAnalysis } from "@/lib/gemini-analysis";

const deterministicLabels: Record<string, string> = {
  matched: "Matched", partially_matched: "Partially matched", not_found: "Not found", needs_review: "Needs review",
};

export function GeminiMatchAnalysis({
  canAnalyze, result, stale, loading, error, consent, onConsentChange, onAnalyze,
}: {
  canAnalyze: boolean;
  result: GeminiAnalysis | null;
  stale: boolean;
  loading: boolean;
  error: string;
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  onAnalyze: () => void;
}) {
  const requestLabel = loading ? "Analyzing with Gemini…" : result ? "Run AI analysis again" : "Run AI analysis";
  return <section aria-labelledby="gemini-heading" className="rounded-md border border-[#b9d2c0] bg-[#f5f9f6] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="gemini-heading" className="text-base font-semibold text-[#25372d]">AI contextual analysis</h3><p className="mt-1 text-sm text-[#65756b]">A separate interpretation; it never changes your deterministic score.</p></div>
      <span className="rounded border border-[#dce7df] bg-[#f6f9f6] px-2 py-1 text-xs font-medium text-[#53675a]">Optional · Gemini</span>
    </div>
    <div className="mt-4 rounded-md border border-[#ead9ad] bg-[#fffaf0] p-3 text-sm leading-6 text-[#705923]">
      <p>To run this analysis, your extracted resume text and job description will be sent to Google's Gemini API. CareerMatch AI cannot guarantee how the external provider processes submitted information; Google's data-use terms can differ by API billing tier. Avoid including sensitive personal information you do not need analyzed. Your local deterministic match remains available without Gemini.</p>
      <label className="mt-3 flex cursor-pointer items-start gap-2 font-medium text-[#604d25]"><input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} className="mt-1 size-4 accent-[#176b50]" /><span>I understand and consent to sending these texts to Google Gemini for this analysis.</span></label>
    </div>
    <button type="button" onClick={onAnalyze} disabled={!canAnalyze || !consent || loading} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#176b50] px-4 text-sm font-semibold text-white hover:bg-[#12583f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50] disabled:cursor-not-allowed disabled:bg-[#aebbb2]">{loading ? <><span className="size-4 animate-spin rounded-full border-2 border-white/50 border-t-white" aria-hidden="true" />{requestLabel}</> : requestLabel}</button>
    {!canAnalyze ? <p className="mt-2 text-xs text-[#65756b]">Extract a resume, add a job description, and review at least one job requirement first.</p> : null}
    {error ? <p role="alert" className="mt-3 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm text-[#963d35]">{error}</p> : null}
    {result ? <details className="mt-5 border-t border-[#dce7df] pt-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#176b50]">View AI assessments and suggestions</summary>
      <div className="mt-4">
      {stale ? <p role="status" className="mb-3 rounded border border-[#ead9ad] bg-[#fffaf0] p-3 text-sm text-[#705923]">Inputs changed since this AI analysis. Rerun it to refresh these results.</p> : null}
      <p className="mb-4 text-xs leading-5 text-[#65756b]">AI can be inaccurate. Review every assessment and evidence excerpt. The deterministic score above remains unchanged.</p>
      <h4 className="text-sm font-semibold text-[#34453b]">Requirement assessments</h4>
      <div className="mt-2 divide-y divide-[#edf1ee]">
        {result.requirements.map((item) => <article key={item.requirementId} className="py-3 first:pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-medium text-[#34453b]">{item.requirementId}</h5><span className="rounded border border-[#dce7df] px-2 py-1 text-xs font-semibold text-[#355343]">{item.assessment.replaceAll("_", " ").toLocaleLowerCase()}</span></div>
          {item.requirementText ? <p className="mt-1 text-xs text-[#65756b]">{item.requirementText}</p> : null}
          <p className="mt-2 text-sm leading-5 text-[#526157]">{item.explanation}</p>
          {item.evidenceExcerpt ? <blockquote className="mt-2 border-l-2 border-[#86a994] pl-3 text-sm italic leading-5 text-[#526157]">“{item.evidenceExcerpt}”</blockquote> : <p className="mt-2 text-xs text-[#65756b]">{item.unverifiedEvidence ? "An unverified excerpt was omitted." : "No verified resume excerpt returned."}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#65756b]"><span>Evidence: {item.evidenceQuality.toLocaleLowerCase()}</span><span>Confidence: {Math.round(item.confidence * 100)}%</span>{item.humanReview || item.disagreesWithDeterministic ? <span className="font-semibold text-[#8a6120]">{item.disagreesWithDeterministic ? "Differs from deterministic assessment · " : ""}Review recommended</span> : null}</div>
          {item.deterministicStatus ? <p className="mt-1 text-xs text-[#65756b]">Deterministic: {deterministicLabels[item.deterministicStatus] ?? item.deterministicStatus}</p> : null}
        </article>)}
      </div>
      <h4 className="mt-4 text-sm font-semibold text-[#34453b]">Supported strengths</h4>
      {result.strengths.length ? <ul className="mt-2 space-y-2">{result.strengths.map((item, i) => <li key={`${item.text}-${i}`} className="text-sm leading-5 text-[#526157]">{item.text}{item.evidenceExcerpt ? <blockquote className="mt-1 border-l-2 border-[#86a994] pl-3 text-xs italic">“{item.evidenceExcerpt}”</blockquote> : <span className="block text-xs text-[#65756b]">No verified resume excerpt returned.</span>}</li>)}</ul> : <p className="mt-2 text-sm text-[#65756b]">No supported strengths were returned.</p>}
      <h4 className="mt-4 text-sm font-semibold text-[#34453b]">Potential gaps or clarifications</h4>
      {result.potentialGaps.length ? <ul className="mt-2 space-y-2">{result.potentialGaps.map((item, i) => <li key={`${item.requirementId}-${i}`} className="text-sm leading-5 text-[#526157]"><span className="font-medium">{item.requirementId}:</span> {item.explanation}</li>)}</ul> : <p className="mt-2 text-sm text-[#65756b]">No potential gaps or clarifications were returned.</p>}
      <h4 className="mt-4 text-sm font-semibold text-[#34453b]">Resume improvement suggestions</h4>
      {result.suggestions.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-[#526157]">{result.suggestions.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-[#65756b]">No suggestions were returned.</p>}
      </div>
    </details> : null}
  </section>;
}

