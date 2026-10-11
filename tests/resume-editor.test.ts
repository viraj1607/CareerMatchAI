import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mammoth from "mammoth";
import {
  acceptSuggestion, addEducation, addExperience, addListItem, blankResume, contentHasResumeText, deduplicateResumeContent, initialResumeEditorState,
  organizeResumeText, removeEducation, removeExperience, removeListItem, resumeEditorReducer,
  safeResumeFileName, type ResumeContent, type ResumeSuggestion,
} from "../src/lib/resume-editor";
import { generateResumeExport, validateResumeForExport } from "../src/lib/resume-export.server";
import { extractResumeText } from "../src/lib/resume-document-parser";
import { makeResumeSuggestionPrompt, resumeSuggestionRequestSchema, validateResumeSuggestionResult, type ResumeSuggestionRequest } from "../src/lib/resume-suggestions";

const source = `Avery Chen\navery.chen@example.ca | (416) 555-0134 | Toronto, ON\n\nProfessional Summary\nCustomer support specialist with clear written communication.\n\nWork Experience\nSupport Analyst\nNorthwind Clinic\n2021 - 2025\n- Resolved customer issues and documented outcomes.\n\nEducation\nDiploma in Information Systems\nLakeside College\n2020\n\nSkills\nSQL, Microsoft Excel, Communication\n\nCertifications\nFirst Aid Certificate\n\nProjects\nCreated a sample support knowledge base.`;
const validSuggestion = {
  suggestions: [{
    originalText: "Resolved customer issues and documented outcomes.",
    suggestedText: "Resolved customer issues and documented outcomes with clear follow-up notes.",
    explanation: "Clarifies the communication component without adding a metric.",
    requirementId: "requirement-communication",
    evidenceExcerpt: "Resolved customer issues and documented outcomes.",
    clarificationQuestion: null,
  }],
};

function sampleContent(): ResumeContent {
  return organizeResumeText(source);
}

function sampleSuggestion(): ResumeSuggestion {
  return { id: "suggest-1", target: { kind: "summary" }, originalText: "clear written communication", suggestedText: "clear, professional written communication", explanation: "Improves flow.", requirementId: null, evidenceExcerpt: "clear written communication", evidenceVerified: true, clarificationQuestion: null, status: "pending", stale: false };
}

describe("resume editor state and export", () => {
  it("starts from extracted text in separate original and editable content states", () => {
    const state = initialResumeEditorState(source, "avery.docx");
    assert.equal(state.originalText, source);
    assert.equal(state.sourceFileName, "avery.docx");
    assert.notEqual(state.originalContent, state.currentContent);
    assert.equal(state.currentContent.contact.name, "Avery Chen");
    assert.equal(state.currentContent.contact.email, "avery.chen@example.ca");
  });

  it("organizes common headings while retaining uncertain imported entries for review", () => {
    const content = sampleContent();
    assert.match(content.summary, /Customer support specialist/);
    assert.equal(content.experience[0].jobTitle, "");
    assert.match(content.experience[0].description, /Support Analyst[\s\S]*Northwind Clinic/);
    assert.equal(content.education[0].qualification, "");
    assert.match(content.education[0].details, /Diploma in Information Systems/);
    assert.deepEqual(content.skills.map(({ text }) => text), ["SQL", "Microsoft Excel", "Communication"]);
  });

  it("keeps unrecognized resume text editable instead of dropping it", () => {
    const raw = "Fictional candidate\nA short unstructured resume with punctuation — and accents: Zoë.";
    assert.equal(organizeResumeText(raw).additionalInformation, raw);
  });

  it("edits the tailored version without changing the original", () => {
    const initial = initialResumeEditorState(source, "avery.docx");
    const updated = resumeEditorReducer(initial, { type: "content-updated", content: { ...initial.currentContent, summary: "Revised professional summary." } });
    assert.equal(updated.originalContent.summary, initial.originalContent.summary);
    assert.equal(updated.originalText, source);
    assert.equal(updated.currentContent.summary, "Revised professional summary.");
  });

  it("adds and removes multiple experience and education entries", () => {
    const experienceAdded = addExperience(addExperience(blankResume(), "work-1"), "work-2");
    assert.equal(experienceAdded.experience.length, 2);
    assert.equal(removeExperience(experienceAdded, "work-1").experience[0].id, "work-2");
    const educationAdded = addEducation(addEducation(blankResume(), "edu-1"), "edu-2");
    assert.equal(educationAdded.education.length, 2);
    assert.equal(removeEducation(educationAdded, "edu-2").education.length, 1);
  });

  it("adds and removes individual skills", () => {
    const withSkill = addListItem(blankResume(), "skills", "skill-1");
    const edited = { ...withSkill, skills: withSkill.skills.map((item) => ({ ...item, text: "SQL" })) };
    assert.equal(edited.skills[0].text, "SQL");
    assert.deepEqual(removeListItem(edited, "skills", "skill-1").skills, []);
  });

  it("deduplicates exact repeated resume items consistently for preview and export", () => {
    const content = sampleContent();
    content.skills.push({ id: "skill-copy", text: "sql" });
    content.experience[0].bullets = ["Supported a fictional team.", " supported a fictional team. "];
    const cleaned = deduplicateResumeContent(content);
    assert.equal(cleaned.skills.length, content.skills.length - 1);
    assert.equal(cleaned.experience[0].bullets.length, 1);
  });

  it("accepts a suggestion only into its target, rejects without changing text, and supports edited acceptance", () => {
    const state = initialResumeEditorState("", "");
    const withSummary = { ...state, currentContent: { ...state.currentContent, summary: "clear written communication" }, suggestions: [sampleSuggestion()] };
    const accepted = acceptSuggestion(withSummary, "suggest-1");
    assert.equal(accepted.currentContent.summary, "clear, professional written communication");
    assert.equal(accepted.suggestions[0].status, "accepted");
    const rejected = resumeEditorReducer(withSummary, { type: "suggestion-rejected", id: "suggest-1" });
    assert.equal(rejected.currentContent.summary, "clear written communication");
    assert.equal(rejected.suggestions[0].status, "rejected");
    const edited = acceptSuggestion(withSummary, "suggest-1", "clear and concise communication");
    assert.equal(edited.currentContent.summary, "clear and concise communication");
    assert.equal(edited.suggestions[0].status, "edited_accepted");
  });

  it("prevents duplicate suggestions, duplicate insertions, and rejects stale suggestions", () => {
    const suggestion = sampleSuggestion();
    const state = { ...initialResumeEditorState(), currentContent: { ...blankResume(), summary: suggestion.originalText }, suggestions: [suggestion] };
    const duplicate = resumeEditorReducer(state, { type: "suggestions-added", suggestions: [{ ...suggestion, id: "suggest-2" }] });
    assert.equal(duplicate.suggestions.length, 1);
    const alreadyPresent = { ...state, currentContent: { ...state.currentContent, summary: `${state.currentContent.summary}; ${suggestion.suggestedText}` } };
    assert.equal(acceptSuggestion(alreadyPresent, suggestion.id).currentContent.summary, alreadyPresent.currentContent.summary);
    const changed = resumeEditorReducer(state, { type: "content-updated", content: { ...state.currentContent, summary: "Replaced summary" } });
    assert.equal(changed.suggestions[0].stale, true);
    assert.equal(acceptSuggestion(changed, suggestion.id).currentContent.summary, "Replaced summary");
  });

  it("flags job-tailoring suggestions as outdated after requirements change", () => {
    const state = { ...initialResumeEditorState(), suggestions: [sampleSuggestion()] };
    const next = resumeEditorReducer(state, { type: "target-context-set", description: "New fictional role", requirements: [{ id: "req-1", text: "SQL" }] });
    assert.equal(next.suggestions[0].stale, true);
  });

  it("retains but invalidates suggestions when a new resume source replaces the old document", () => {
    const state = { ...initialResumeEditorState(source, "avery.docx"), suggestions: [sampleSuggestion()] };
    const next = resumeEditorReducer(state, { type: "resume-source-set", text: "A different fictional resume", fileName: "new.docx" });
    assert.equal(next.suggestions.length, 1);
    assert.equal(next.suggestions[0].stale, true);
    assert.equal(next.originalText, "A different fictional resume");
    assert.equal(next.currentContent.additionalInformation, "A different fictional resume");
  });

  it("requires confirmation before resetting editable changes to original", () => {
    const state = initialResumeEditorState(source, "avery.docx");
    const edited = { ...state, currentContent: { ...state.currentContent, summary: "Discard this edit." } };
    assert.equal(resumeEditorReducer(edited, { type: "reset-confirmed", confirmed: false }), edited);
    const reset = resumeEditorReducer(edited, { type: "reset-confirmed", confirmed: true });
    assert.equal(reset.currentContent.summary, state.originalContent.summary);
    assert.equal(reset.originalText, source);
  });

  it("handles optional sections and empty resumes", () => {
    const empty = blankResume();
    assert.equal(contentHasResumeText(empty), false);
    assert.deepEqual(validateResumeForExport(sampleContent()).skills.map(({ text }) => text), ["SQL", "Microsoft Excel", "Communication"]);
    assert.throws(() => validateResumeForExport(empty), /EMPTY_RESUME/);
  });

  it("preserves special characters and sanitizes export filenames", () => {
    const content = { ...sampleContent(), contact: { ...sampleContent().contact, name: "Zoë O’Neil" }, summary: "Équipe — clarity, ‘quotes’, ampersands & commas." };
    assert.match(content.summary, /Équipe — clarity, ‘quotes’/);
    assert.equal(safeResumeFileName(content.contact.name, "pdf"), "Zoe_ONeil.pdf");
    assert.equal(safeResumeFileName("../../ Resume <script>", "docx"), "Resume_script.docx");
    assert.equal(safeResumeFileName("", "pdf"), "CareerMatch_Resume.pdf");
  });

  it("retains longer resumes across multiple PDF pages", async () => {
    const content = sampleContent();
    content.experience = Array.from({ length: 12 }, (_, index) => ({ id: `long-${index}`, jobTitle: `Fictional Support Role ${index}`, employer: "Northwind Clinic", location: "Toronto, ON", dates: "2020 - 2025", description: "Provided careful service and documented outcomes. ".repeat(26), bullets: ["Resolved fictional customer requests with clear notes.".repeat(4)] }));
    const pdf = await generateResumeExport(content, "pdf");
    assert.equal(pdf.bytes.subarray(0, 4).toString("ascii"), "%PDF");
    const extracted = await extractResumeText(new Uint8Array(pdf.bytes), "pdf");
    assert.match(extracted, /Fictional Support Role 11/);
    assert.match(extracted, /Page 1 of/);
  });

  it("generates a valid PDF and DOCX whose extracted text matches the editor", async () => {
    const content = sampleContent();
    const pdf = await generateResumeExport(content, "pdf");
    const docx = await generateResumeExport(content, "docx");
    assert.match(pdf.bytes.subarray(0, 8).toString("ascii"), /^%PDF-/);
    assert.equal(docx.bytes.subarray(0, 2).toString("ascii"), "PK");
    const pdfText = await extractResumeText(new Uint8Array(pdf.bytes), "pdf");
    const docxText = (await mammoth.extractRawText({ buffer: docx.bytes })).value;
    assert.match(pdfText, /Avery Chen/);
    assert.match(pdfText, /Resolved customer issues and documented outcomes/);
    assert.match(docxText, /Avery Chen/);
    assert.match(docxText, /SQL/);
    assert.match(docxText, /Created a sample support knowledge base/);
    assert.equal(pdf.fileName, "Avery_Chen.pdf");
    assert.equal(docx.fileName, "Avery_Chen.docx");
  });

  it("exports common Canadian French accents and punctuation without losing text", async () => {
    const base = sampleContent();
    const content = { ...base, contact: { ...base.contact, name: "Zoë O’Neil" }, summary: "Équipe — clarity, ‘quotes’, ampersands & commas." };
    const pdf = await generateResumeExport(content, "pdf");
    const text = await extractResumeText(new Uint8Array(pdf.bytes), "pdf");
    assert.match(text, /Zoë O’Neil/);
    assert.match(text, /Équipe/);
    assert.match(text, /clarity/);
  });

  it("exports only accepted changes and omits rejected suggestions", async () => {
    const initial = initialResumeEditorState(source, "avery.docx");
    const exp = initial.currentContent.experience[0];
    const originalSentence = "Resolved customer issues and documented outcomes.";
    const suggestion: ResumeSuggestion = { ...sampleSuggestion(), id: "accepted", target: { kind: "experience-description", entryId: exp.id }, originalText: originalSentence, suggestedText: "Resolved customer issues and documented outcomes with clear follow-up notes.", evidenceExcerpt: originalSentence };
    const rejected: ResumeSuggestion = { ...suggestion, id: "rejected", originalText: "Support Analyst", suggestedText: "Senior Support Analyst", status: "rejected" };
    let state = { ...initial, suggestions: [suggestion, rejected] };
    state = resumeEditorReducer(state, { type: "suggestion-accepted", id: "accepted" });
    const exported = await generateResumeExport(state.currentContent, "docx");
    const text = (await mammoth.extractRawText({ buffer: exported.bytes })).value;
    assert.match(text, /clear follow-up notes/);
    assert.doesNotMatch(text, /Senior Support Analyst/);
  });

  it("does not mutate editor state if export validation fails", async () => {
    const state = initialResumeEditorState(source, "avery.docx");
    const before = JSON.stringify(state.currentContent);
    await assert.rejects(() => generateResumeExport(blankResume(), "pdf"));
    assert.equal(JSON.stringify(state.currentContent), before);
  });
});

describe("Gemini editing suggestions", () => {
  const request: ResumeSuggestionRequest = { consent: true, resumeText: source, targetText: "Resolved customer issues and documented outcomes.", requirements: [{ id: "requirement-communication", text: "Strong written communication" }] };

  it("requires explicit consent and validates the selected suggestion target", () => {
    assert.equal(resumeSuggestionRequestSchema.safeParse({ ...request, consent: false }).success, false);
    assert.equal(resumeSuggestionRequestSchema.safeParse({ ...request, targetText: "" }).success, false);
  });

  it("keeps each generated suggestion tied to original text, evidence, and a known requirement", () => {
    const result = validateResumeSuggestionResult(JSON.stringify(validSuggestion), request);
    assert.equal(result[0].evidenceVerified, true);
    assert.equal(result[0].requirementId, "requirement-communication");
    assert.match(makeResumeSuggestionPrompt(request), /untrusted data/i);
    assert.throws(() => validateResumeSuggestionResult(JSON.stringify({ suggestions: [{ ...validSuggestion.suggestions[0], requirementId: "unknown" }] }), request));
  });

  it("turns unsupported new numerical claims into a clarification instead of a factual rewrite", () => {
    const data = { suggestions: [{ ...validSuggestion.suggestions[0], suggestedText: "Resolved 120 customer issues with a 40% satisfaction gain." }] };
    const result = validateResumeSuggestionResult(JSON.stringify(data), request);
    assert.equal(result[0].suggestedText, null);
    assert.match(result[0].clarificationQuestion ?? "", /verified detail/);
  });

  it("omits fake evidence rather than presenting it as verified", () => {
    const data = { suggestions: [{ ...validSuggestion.suggestions[0], evidenceExcerpt: "Led a team of 80 specialists." }] };
    assert.equal(validateResumeSuggestionResult(JSON.stringify(data), request).length, 0);
  });
});
