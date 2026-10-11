"use client";

import { Icon } from "@/components/icon";
import {
  addAnalysisItem,
  editAnalysisItem,
  removeAnalysisItem,
  type EditableJobDescriptionAnalysis,
  type JobAnalysisSection,
} from "@/lib/job-description-analysis";

const sectionDetails: Array<{ key: JobAnalysisSection; title: string; empty: string }> = [
  { key: "required", title: "Required qualifications", empty: "No explicit required qualifications were clearly detected." },
  { key: "preferred", title: "Preferred qualifications", empty: "No preferred qualifications were clearly detected." },
  { key: "skills", title: "Skills", empty: "No skills from the current skill dictionary were detected." },
  { key: "responsibilities", title: "Responsibilities", empty: "No responsibility statements were clearly detected." },
  { key: "experienceEducation", title: "Experience and education", empty: "No explicit experience, education, or credential requirements were detected." },
  { key: "needsReview", title: "Needs review", empty: "No uncertain requirement statements were flagged." },
];

export function JobDescriptionResults({
  analysis,
  onChange,
}: {
  analysis: EditableJobDescriptionAnalysis | null;
  onChange: (analysis: EditableJobDescriptionAnalysis) => void;
}) {
  if (!analysis) {
    return <section aria-labelledby="job-findings-title" className="border-t border-[#edf1ee] pt-5">
      <h2 id="job-findings-title" className="text-base font-semibold text-[#25372d]">Job description findings</h2>
      <p className="mt-2 text-sm leading-6 text-[#65756b]">Extracted requirements will appear here after you analyze a job description.</p>
    </section>;
  }

  return (
    <section aria-labelledby="job-findings-title" className="border-t border-[#edf1ee] pt-5">
      <div className="mb-5">
        <h2 id="job-findings-title" className="text-base font-semibold text-[#25372d]">Job description findings</h2>
        <p className="mt-1 text-sm leading-5 text-[#65756b]">Review the detected requirements before comparing. Add anything important that was missed.</p>
      </div>
      <div className="mb-5 border-b border-[#edf1ee] pb-5">
        <label htmlFor="identified-job-title" className="mb-1.5 block text-sm font-medium text-[#34453b]">Job title</label>
        <input id="identified-job-title" className="form-control" value={analysis.jobTitle} onChange={(event) => onChange({ ...analysis, jobTitle: event.target.value })} />
      </div>
      <div className="space-y-4">
        {sectionDetails.filter(({ key }) => analysis.sections[key].length > 0).map(({ key, title }) => {
          const items = analysis.sections[key];
          return <section key={key} aria-labelledby={`section-${key}`} className="border-b border-[#edf1ee] pb-4 last:border-0 last:pb-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id={`section-${key}`} className="text-sm font-semibold text-[#34453b]">{title}<span className="ml-1.5 font-normal text-[#65756b]">{items.length}</span></h3>
              <button type="button" onClick={() => onChange(addAnalysisItem(analysis, key))} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#176b50] hover:bg-[#f2f7f3] focus-visible:outline-2 focus-visible:outline-[#176b50]" aria-label={`Add item to ${title}`}><Icon name="plus" size={14} />Add</button>
            </div>
            <ul className="space-y-2">
              {items.map((item, index) => <li key={item.id} className="flex items-start gap-2">
                <label className="sr-only" htmlFor={`${key}-${item.id}`}>{title}, item {index + 1}</label>
                <textarea id={`${key}-${item.id}`} rows={2} value={item.text} onChange={(event) => onChange(editAnalysisItem(analysis, key, item.id, event.target.value))} className="form-control min-h-10 flex-1 resize-y py-2 text-sm leading-5" />
                <button type="button" onClick={() => onChange(removeAnalysisItem(analysis, key, item.id))} className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#65756b] hover:bg-[#fbefed] hover:text-[#a23d35] focus-visible:outline-2 focus-visible:outline-[#176b50]" title={`Remove item from ${title}`} aria-label={`Remove item ${index + 1} from ${title}`}><Icon name="trash" size={15} /></button>
              </li>)}
            </ul>
          </section>;
        })}
        {sectionDetails.filter(({ key }) => analysis.sections[key].length === 0).length ? <details className="border-t border-[#edf1ee] pt-3">
          <summary className="cursor-pointer text-sm font-medium text-[#176b50]">Show empty categories to add requirements</summary>
          <div className="mt-3 divide-y divide-[#edf1ee]">
            {sectionDetails.filter(({ key }) => analysis.sections[key].length === 0).map(({ key, title, empty }) => <div key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><h3 className="text-sm font-medium text-[#34453b]">{title}</h3><p className="mt-1 text-xs text-[#65756b]">{empty}</p></div>
              <button type="button" onClick={() => onChange(addAnalysisItem(analysis, key))} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#176b50] hover:bg-[#f2f7f3] focus-visible:outline-2 focus-visible:outline-[#176b50]" aria-label={`Add item to ${title}`}><Icon name="plus" size={14} />Add</button>
            </div>)}
          </div>
        </details> : null}
      </div>
    </section>
  );
}
