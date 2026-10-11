"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

export function InterviewPrepSelector({ applications }: { applications: Array<{ id: string; job_title: string; company_name: string }> }) {
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");

  function beginPreparation() {
    if (!selectedId) return;
    setNotice("Interview preparation is not active yet. No session or practice questions were created.");
  }

  return (
    <section className="rounded-md border border-[#e0e8e2] bg-white p-5 sm:p-7">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[#25372d]">Choose a role</h2>
        <p className="mt-1 text-sm leading-6 text-[#65756b]">Select an application or start with a new job description later.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="interview-role" className="mb-2 block text-sm font-medium text-[#34453b]">Job or application</label>
          <select id="interview-role" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setNotice(""); }} className="form-control">
            <option value="">Select a role</option>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>{application.job_title} · {application.company_name}</option>
            ))}
          </select>
        </div>
        <button type="button" disabled={!selectedId} onClick={beginPreparation} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#176b50] px-4 text-sm font-semibold text-white hover:bg-[#12583f] disabled:cursor-not-allowed disabled:bg-[#bdc9c1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50]">
          Start preparation <Icon name="arrow" size={16} />
        </button>
      </div>
      {notice ? <p role="status" className="mt-4 text-sm leading-6 text-[#65756b]">{notice}</p> : null}
      <p className="mt-4 border-t border-[#edf1ee] pt-4 text-xs leading-5 text-[#65756b]">Choosing a role does not generate fictional questions or answers.</p>
    </section>
  );
}
