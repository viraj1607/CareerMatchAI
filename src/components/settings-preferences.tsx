"use client";

import { useState } from "react";

export function SettingsPreferences() {
  const [market, setMarket] = useState("Canada");
  const [fileFormat, setFileFormat] = useState("PDF");
  const [language, setLanguage] = useState("English");

  return (
    <section aria-labelledby="preferences-heading" className="rounded-md border border-[#e0e8e2] bg-white p-5 sm:p-7">
      <div className="mb-6">
        <h2 id="preferences-heading" className="text-base font-semibold text-[#25372d]">Resume preferences</h2>
        <p className="mt-1 text-sm text-[#65756b]">Selections are temporary and will clear when you leave or refresh.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <label htmlFor="market-preference" className="mb-2 block text-sm font-medium text-[#34453b]">Job market</label>
          <select id="market-preference" value={market} onChange={(event) => setMarket(event.target.value)} className="form-control">
            <option>Canada</option>
            <option>United States</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label htmlFor="resume-format" className="mb-2 block text-sm font-medium text-[#34453b]">Preferred file format</label>
          <select id="resume-format" value={fileFormat} onChange={(event) => setFileFormat(event.target.value)} className="form-control">
            <option>PDF</option>
            <option>DOCX</option>
          </select>
        </div>
        <div>
          <label htmlFor="resume-language" className="mb-2 block text-sm font-medium text-[#34453b]">Resume language</label>
          <select id="resume-language" value={language} onChange={(event) => setLanguage(event.target.value)} className="form-control">
            <option>English</option>
            <option>French</option>
          </select>
        </div>
      </div>
    </section>
  );
}
