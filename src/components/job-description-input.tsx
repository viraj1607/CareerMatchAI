"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { MAX_JOB_DESCRIPTION_LENGTH, validateJobDescription } from "@/lib/job-description-analysis";

export function JobDescriptionInput({
  value,
  externalError,
  onChange,
  onAnalyze,
  onClear,
}: {
  value: string;
  externalError?: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  onClear: () => void;
}) {
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  async function analyze() {
    const validation = validateJobDescription(value);
    if (limitReached) {
      setError(`The ${MAX_JOB_DESCRIPTION_LENGTH.toLocaleString()}-character limit was reached. Shorten the text before analyzing.`);
      return;
    }
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    setError("");
    setIsAnalyzing(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    onAnalyze();
    setIsAnalyzing(false);
  }

  function clear() {
    onClear();
    setError("");
    setLimitReached(false);
  }

  return (
    <section aria-labelledby="job-description-heading" className="border-t border-[#edf1ee] pt-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="job-description-heading" className="text-base font-semibold text-[#25372d]">Job description</h2>
          <p className="mt-1 text-sm leading-5 text-[#65756b]">Paste the complete posting. Analysis runs locally in this application.</p>
        </div>
        <button type="button" onClick={clear} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-[#d8e2da] px-2.5 text-sm font-medium text-[#526259] hover:bg-[#f5f8f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50]" aria-label="Clear job description and analysis">
          <Icon name="close" size={15} />Clear
        </button>
      </div>
      <label htmlFor="job-description" className="mb-2 block text-sm font-medium text-[#34453b]">Full job posting</label>
      <textarea
        id="job-description"
        name="jobDescription"
        rows={12}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue.length > MAX_JOB_DESCRIPTION_LENGTH) {
            onChange(nextValue.slice(0, MAX_JOB_DESCRIPTION_LENGTH));
            setLimitReached(true);
            setError(`The maximum is ${MAX_JOB_DESCRIPTION_LENGTH.toLocaleString()} characters. Extra text was not added.`);
          } else {
            onChange(nextValue);
            setLimitReached(false);
            setError("");
          }
        }}
        aria-invalid={Boolean(error || externalError)}
        aria-describedby={`job-description-help job-description-counter${error || externalError ? " job-description-error" : ""}`}
        className="form-control min-h-64 resize-y"
        placeholder="Paste the job title, responsibilities, qualifications, experience, education, and skills from the posting."
      />
      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-[#65756b]">
        <p id="job-description-help">The original posting stays available for review and is not saved or sent to an external service.</p>
        <p id="job-description-counter" aria-live="polite">{value.length.toLocaleString()} / {MAX_JOB_DESCRIPTION_LENGTH.toLocaleString()}</p>
      </div>
      {error ? <p id="job-description-error" role="alert" className="mt-2 text-sm font-medium text-[#a23d35]">{error}</p> : null}
      {!error && externalError ? <p id="job-description-error" role="alert" className="mt-2 text-sm font-medium text-[#a23d35]">{externalError}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={analyze} disabled={isAnalyzing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#176b50] px-4 text-sm font-semibold text-white hover:bg-[#12583f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50] disabled:cursor-wait disabled:opacity-60">
          {isAnalyzing ? <><span className="size-4 animate-spin rounded-full border-2 border-[#a7c8b4] border-t-white" aria-hidden="true" />Finding requirements…</> : <><Icon name="scan" size={17} />Review job requirements</>}
        </button>
        <span className="text-xs text-[#65756b]">Rule-based extraction. Review the results for accuracy.</span>
      </div>
    </section>
  );
}
