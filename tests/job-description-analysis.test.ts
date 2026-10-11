import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addAnalysisItem,
  analyzeJobDescription,
  editAnalysisItem,
  makeEditableAnalysis,
  MAX_JOB_DESCRIPTION_LENGTH,
  removeAnalysisItem,
  validateJobDescription,
} from "../src/lib/job-description-analysis";
import { initialResumeAnalysisWorkflow, resumeAnalysisWorkflowReducer } from "../src/lib/resume-analysis-workflow";

const completeDescription = `Role: Senior Software Engineer

What You'll Do:
- Build REST APIs and support technical troubleshooting.
- Coordinate with customer service and product teams.

Minimum qualifications:
- 5+ years of experience with Python and SQL.
- Bachelor's degree in computer science or equivalent experience.
- Excellent written communication and Microsoft Excel skills.

Preferred qualifications:
- Project management experience is preferred.
- Experience with React would be an asset.`;

describe("job description analysis", () => {
  it("extracts title, distinct qualification groups, responsibilities, skills, and credentials", () => {
    const result = analyzeJobDescription(completeDescription);
    assert.equal(result.jobTitle, "Senior Software Engineer");
    assert.ok(result.sections.required.some((item) => item.includes("5+ years of experience")));
    assert.ok(result.sections.preferred.some((item) => item.includes("would be an asset")));
    assert.ok(result.sections.skills.includes("Python"));
    assert.ok(result.sections.skills.includes("REST APIs"));
    assert.ok(result.sections.skills.includes("Customer service"));
    assert.ok(result.sections.responsibilities.some((item) => item.startsWith("Build REST APIs")));
    assert.ok(result.sections.experienceEducation.some((item) => item.includes("Bachelor's degree")));
  });

  it("reports an unidentified title when no title cue or common title is present", () => {
    const result = analyzeJobDescription("We are a small fictional organization seeking a thoughtful person to join our group. This position includes collaboration and support for different internal projects.");
    assert.equal(result.jobTitle, "Not identified");
  });

  it("extracts requirements from prose without explicit qualification headings", () => {
    const result = analyzeJobDescription("Applicants must have experience coordinating schedules. Experience with SQL is preferred. The successful candidate should have customer service experience.");
    assert.equal(result.sections.required.length, 1);
    assert.equal(result.sections.preferred.length, 1);
    assert.equal(result.sections.needsReview.length, 1);
  });

  it("deduplicates repeated qualifications and skills", () => {
    const result = analyzeJobDescription("Python experience is required. Python experience is required. We need Python and Python for this fictional role.");
    assert.equal(result.sections.required.length, 1);
    assert.deepEqual(result.sections.skills, ["Python"]);
  });

  it("handles unusual punctuation and mixed line breaks", () => {
    const result = analyzeJobDescription("Position： Data Analyst\r\n\r\nSkills — SQL, Python (3+ years); Excel!\n\nNice to have: Power BI would be an asset.");
    assert.equal(result.jobTitle, "Data Analyst");
    assert.ok(result.sections.skills.includes("SQL"));
    assert.ok(result.sections.skills.includes("Power BI"));
    assert.ok(result.sections.preferred.some((item) => item.includes("would be an asset")));
  });

  it("validates empty, whitespace-only, very short, and overlong input", () => {
    assert.deepEqual(validateJobDescription(""), { valid: false, message: "Paste a job description to analyze." });
    assert.equal(validateJobDescription("  \n\t ").valid, false);
    const shortInput = validateJobDescription("A brief role.");
    assert.equal(shortInput.valid, false);
    if (!shortInput.valid) assert.match(shortInput.message, /very short/);
    assert.equal(validateJobDescription("x".repeat(MAX_JOB_DESCRIPTION_LENGTH + 1)).valid, false);
    assert.throws(() => analyzeJobDescription("x".repeat(MAX_JOB_DESCRIPTION_LENGTH + 1)), RangeError);
  });

  it("supports editing, removing, and adding extracted items without replacing other findings", () => {
    const initial = makeEditableAnalysis(analyzeJobDescription(completeDescription));
    const first = initial.sections.required[0];
    const edited = editAnalysisItem(initial, "required", first.id, "Edited fictional qualification");
    assert.equal(edited.sections.required[0].text, "Edited fictional qualification");
    assert.equal(edited.sections.preferred[0].text, initial.sections.preferred[0].text);

    const added = addAnalysisItem(edited, "required");
    assert.equal(added.sections.required.length, edited.sections.required.length + 1);
    assert.equal(added.sections.required.at(-1)?.text, "");
    const removed = removeAnalysisItem(added, "required", first.id);
    assert.ok(!removed.sections.required.some((item) => item.id === first.id));
    assert.equal(removed.sections.preferred.length, initial.sections.preferred.length);
  });

  it("keeps the selected resume intact when job description analysis is completed or cleared", () => {
    const resume = { fileName: "fictional-resume.pdf", fileType: "pdf" as const, fileSizeBytes: 512, text: "Fictional candidate profile" };
    const withResume = resumeAnalysisWorkflowReducer(initialResumeAnalysisWorkflow, { type: "resume-selected", resume });
    const withDescription = resumeAnalysisWorkflowReducer(withResume, { type: "description-changed", value: completeDescription });
    const analyzed = resumeAnalysisWorkflowReducer(withDescription, {
      type: "analysis-completed",
      analysis: makeEditableAnalysis(analyzeJobDescription(completeDescription)),
    });
    const fresh = resumeAnalysisWorkflowReducer(analyzed, { type: "fresh-description" });
    assert.equal(analyzed.resume, resume);
    assert.equal(fresh.resume, resume);
    assert.equal(fresh.jobDescription, "");
    assert.equal(fresh.jobAnalysis, null);
  });
});
