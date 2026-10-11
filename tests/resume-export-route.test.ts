import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/resume/export/[format]/route";
import { generateResumeExport } from "../src/lib/resume-export.server";
import { blankResume, organizeResumeText } from "../src/lib/resume-editor";

const content = organizeResumeText("Fictional Candidate\n\nProfessional Summary\nA fictional analyst with careful documentation experience.");

function request(format: string, body: string) {
  return POST(new NextRequest(`http://localhost/api/resume/export/${format}`, {
    method: "POST", headers: { "content-type": "application/json" }, body,
  }), { params: Promise.resolve({ format }) });
}

describe("resume export route", () => {
  it("fails closed without Supabase configuration before reading the export payload", async () => {
    const envNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    const previous = envNames.map((name) => process.env[name]);
    envNames.forEach((name) => delete process.env[name]);
    try {
      const response = await request("pdf", "not read");
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
    } finally {
      envNames.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
    }
  });

  it("checks authentication and concurrency before export work", async () => {
    const source = await readFile(new URL("../src/app/api/resume/export/[format]/route.ts", import.meta.url), "utf8");
    assert.ok(source.indexOf("await getAuthenticatedContext()") < source.indexOf("await exportResume(request, context)"));
    assert.match(source, /acquireRequestSlot\("export"\)/);
  });

  it("generates valid PDF/DOCX files and rejects empty content", async () => {
    const pdf = await generateResumeExport(content, "pdf");
    const docx = await generateResumeExport(content, "docx");
    assert.equal(pdf.contentType, "application/pdf");
    assert.equal(new TextDecoder().decode(pdf.bytes.subarray(0, 4)), "%PDF");
    assert.equal(docx.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(new TextDecoder().decode(docx.bytes.subarray(0, 2)), "PK");
    await assert.rejects(generateResumeExport(blankResume(), "pdf"));
  });
});
