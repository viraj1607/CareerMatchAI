import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractResumeText, getResumeDocumentType, isPdfPasswordError, ResumeDocumentError } from "../src/lib/resume-document-parser";
import { makeDocxFixture, makePdfFixture } from "./fixtures/documents";

describe("resume document extraction", () => {
  it("extracts fictional text from a multi-page PDF with page boundaries", async () => {
    const text = await extractResumeText(makePdfFixture([["Fictional Candidate", "Skills: TypeScript and testing"], ["Experience: Northwind Example"]]), "pdf");
    assert.match(text, /Fictional Candidate/);
    assert.match(text, /Skills: TypeScript and testing/);
    assert.match(text, /Experience: Northwind Example/);
  });

  it("extracts DOCX paragraphs and preserves boundaries", async () => {
    const text = await extractResumeText(makeDocxFixture(["Fictional Candidate", "Experience: Sample Company"]), "docx");
    assert.match(text, /Fictional Candidate/);
    assert.match(text, /\n\n/);
    assert.match(text, /Experience: Sample Company/);
  });

  it("rejects empty DOCX text", async () => {
    await assert.rejects(extractResumeText(makeDocxFixture(["", "   "]), "docx"), (error: unknown) => error instanceof ResumeDocumentError && error.code === "EMPTY_DOCUMENT");
  });

  it("explains when a PDF has no selectable text", async () => {
    await assert.rejects(extractResumeText(makePdfFixture([[]]), "pdf"), (error: unknown) => error instanceof ResumeDocumentError && error.code === "NO_SELECTABLE_TEXT" && /OCR/.test(error.message));
  });

  it("rejects PDFs over page and extracted-text limits", async () => {
    const multiPage = makePdfFixture([["Fictional page one"], ["Fictional page two"]]);
    await assert.rejects(extractResumeText(multiPage, "pdf", { maxPages: 1 }), (error: unknown) => error instanceof ResumeDocumentError && error.code === "TOO_MANY_PAGES");
    await assert.rejects(extractResumeText(multiPage, "pdf", { maxTextChars: 8 }), (error: unknown) => error instanceof ResumeDocumentError && error.code === "TEXT_TOO_LARGE");
    await assert.rejects(extractResumeText(makeDocxFixture(["Fictional text beyond cap"]), "docx", { maxTextChars: 8 }), (error: unknown) => error instanceof ResumeDocumentError && error.code === "TEXT_TOO_LARGE");
  });

  it("aborts a PDF parse that exceeds its processing deadline", async () => {
    const manyPages = makePdfFixture(Array.from({ length: 300 }, (_, index) => [`Fictional page ${index + 1}`]));
    await assert.rejects(extractResumeText(manyPages, "pdf", { maxPages: 500, timeoutMs: 0 }), (error: unknown) => error instanceof ResumeDocumentError && error.code === "PROCESSING_TIMEOUT");
  });

  it("rejects malformed documents", async () => {
    await assert.rejects(extractResumeText(new Uint8Array(Buffer.from("not a pdf")), "pdf"), (error: unknown) => error instanceof ResumeDocumentError && error.code === "MALFORMED_DOCUMENT");
    await assert.rejects(extractResumeText(new Uint8Array(Buffer.from("PK\u0003\u0004broken")), "docx"), (error: unknown) => error instanceof ResumeDocumentError && error.code === "MALFORMED_DOCUMENT");
  });

  it("does not classify unsupported extensions", () => {
    assert.equal(getResumeDocumentType("candidate.txt"), null);
  });

  it("maps PDF.js password failures to the user-facing protected-file category", () => {
    const passwordError = Object.assign(new Error("private PDF.js diagnostic"), { name: "PasswordException" });
    assert.equal(isPdfPasswordError(passwordError), true);
    assert.equal(isPdfPasswordError(new Error("unrelated")), false);
  });
});

// Cross-module regression: export -> extraction -> organizer -> deterministic match.
describe("Phase 8B non-Gemini document pipeline", () => {
  it("round-trips fictional PDF/DOCX content and preserves deterministic evidence", async () => {
    const { readFileSync } = await import("node:fs");
    const { generateResumeExport } = await import("../src/lib/resume-export.server");
    const { organizeResumeText, resumeContentSchema, resumeContentToText } = await import("../src/lib/resume-editor");
    const { analyzeResumeMatch } = await import("../src/lib/resume-job-matcher");
    const content = resumeContentSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/phase8b/resume.json", import.meta.url), "utf8")));
    const reviewed = JSON.parse(readFileSync(new URL("./fixtures/phase8b/reviewed-job.json", import.meta.url), "utf8"));
    for (const format of ["pdf", "docx"] as const) {
      const file = await generateResumeExport(content, format);
      const extracted = await extractResumeText(file.bytes, format);
      assert.ok(extracted.includes("Café"));
      assert.ok(extracted.includes("Fictional Meridian College"));
      assert.ok(resumeContentSchema.safeParse(organizeResumeText(extracted)).success);
      const headings = extracted.toLowerCase();
      assert.ok(headings.indexOf("work experience") < headings.indexOf("education"));
      assert.ok(headings.indexOf("education") < headings.indexOf("skills"));
    }
    const text = resumeContentToText(content);
    const report = analyzeResumeMatch(text, reviewed);
    assert.deepEqual(report, analyzeResumeMatch(text, reviewed));
    assert.equal(report.scorePercent, 59);
    assert.ok(report.counts.matched > 0 && report.counts.partially_matched > 0 && report.counts.not_found > 0);
    assert.ok(report.findings.some((finding) => finding.evidenceExcerpts.length > 0));
  });
});
