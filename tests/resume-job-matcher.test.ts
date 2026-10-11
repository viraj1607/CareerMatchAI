import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EditableJobDescriptionAnalysis, JobAnalysisSection } from "../src/lib/job-description-analysis";
import { initialResumeAnalysisWorkflow, resumeAnalysisWorkflowReducer } from "../src/lib/resume-analysis-workflow";
import {
  analyzeResumeMatch,
  collectMatchRequirements,
  MATCH_SCORE_WEIGHTS,
  MIN_SCORABLE_REQUIREMENTS,
  setReviewedPriority,
  setReviewedStatus,
  type MatchStatus,
  type ResumeMatchReport,
} from "../src/lib/resume-job-matcher";

function jobAnalysis(input: Partial<Record<JobAnalysisSection, string[]>>): EditableJobDescriptionAnalysis {
  const keys: JobAnalysisSection[] = ["required", "preferred", "skills", "responsibilities", "experienceEducation", "needsReview"];
  const sections = Object.fromEntries(keys.map((key) => [key, (input[key] ?? []).map((text, index) => ({ id: `${key}-${index}`, text }))])) as EditableJobDescriptionAnalysis["sections"];
  return { jobTitle: "Fictional Support Analyst", sections };
}

function findingStatus(report: ResumeMatchReport, text: string): MatchStatus {
  const finding = report.findings.find((item) => item.requirement.text === text);
  assert.ok(finding, `missing finding: ${text}`);
  return finding.automaticStatus;
}

describe("resume-to-job matching", () => {
  it("matches an exact skill and case-insensitive phrase", () => {
    const requirements = jobAnalysis({ skills: ["Python", "Customer service"] });
    const report = analyzeResumeMatch("Fictional candidate with PYTHON scripting and CUSTOMER SERVICE experience.", requirements);
    assert.equal(findingStatus(report, "Python"), "matched");
    assert.equal(findingStatus(report, "Customer service"), "matched");
  });

  it("recognizes explicitly configured terminology synonyms", () => {
    const requirements = jobAnalysis({ skills: ["Customer service", "Troubleshooting", "REST APIs", "Microsoft Excel"] });
    const report = analyzeResumeMatch("Provided customer support, technical issue resolution, RESTful API maintenance, and Excel reporting.", requirements);
    assert.equal(report.findings.length, 4);
    assert.ok(report.findings.every((finding) => finding.automaticStatus === "matched"));
  });

  it("does not treat unmentioned skills as present", () => {
    const report = analyzeResumeMatch("Fictional candidate with Python scripting experience.", jobAnalysis({ skills: ["SQL"] }));
    assert.equal(findingStatus(report, "SQL"), "not_found");
    assert.equal(report.findings[0].evidenceExcerpts.length, 0);
  });

  it("marks a compound requirement partial when only some evidence is present", () => {
    const report = analyzeResumeMatch("Used SQL to prepare fictional reports.", jobAnalysis({ required: ["Advanced SQL and Python experience"] }));
    assert.equal(findingStatus(report, "Advanced SQL and Python experience"), "partially_matched");
  });

  it("uses Needs Review for ambiguous leadership evidence", () => {
    const report = analyzeResumeMatch("Assisted with leadership activities during a fictional volunteer event.", jobAnalysis({ skills: ["Leadership"] }));
    assert.equal(findingStatus(report, "Leadership"), "needs_review");
    assert.match(report.findings[0].explanation, /does not establish direct team leadership/i);
  });

  it("does not treat an incidental technology mention as demonstrated skill evidence", () => {
    const report = analyzeResumeMatch("The fictional candidate mentioned SQL once during an unrelated planning discussion.", jobAnalysis({ skills: ["SQL"] }));
    assert.equal(findingStatus(report, "SQL"), "needs_review");
    assert.ok(report.findings[0].evidenceExcerpts.length > 0);
  });

  it("preserves required and preferred priority in the result records", () => {
    const requirements = collectMatchRequirements(jobAnalysis({ required: ["SQL required"], preferred: ["Python is preferred"] }));
    assert.deepEqual(requirements.map((item) => [item.text, item.priority]), [["SQL required", "required"], ["Python is preferred", "preferred"]]);
  });

  it("keeps priority unclear for Phase 3 items explicitly flagged for review", () => {
    const [requirement] = collectMatchRequirements(jobAnalysis({ needsReview: ["Must have SQL, ideally with Python too"] }));
    assert.equal(requirement.priority, "unspecified");
    assert.equal(requirement.scoreCategory, null);
  });

  it("deduplicates repeated and cross-section requirements", () => {
    const analysis = jobAnalysis({ required: ["Python experience required", "Python experience required"], skills: ["Python", "SQL", "SQL"] });
    const requirements = collectMatchRequirements(analysis);
    assert.equal(requirements.length, 2);
    assert.deepEqual(requirements.map((item) => item.text), ["Python experience required", "SQL"]);
  });

  it("handles empty resume and empty requirements without throwing", () => {
    const emptyResumeReport = analyzeResumeMatch(" \n ", jobAnalysis({ required: ["Python required"] }));
    assert.equal(findingStatus(emptyResumeReport, "Python required"), "not_found");
    assert.match(emptyResumeReport.findings[0].explanation, /No readable resume text/);
    const emptyRequirementsReport = analyzeResumeMatch("Fictional resume content", jobAnalysis({}));
    assert.equal(emptyRequirementsReport.findings.length, 0);
    assert.equal(emptyRequirementsReport.scorePercent, null);
  });

  it("matches requirement phrases across punctuation and unusual formatting", () => {
    const report = analyzeResumeMatch("Skills: RESTful\nAPI delivery; Microsoft—Excel reports.", jobAnalysis({ skills: ["REST APIs", "Microsoft Excel"] }));
    assert.ok(report.findings.every((finding) => finding.automaticStatus === "matched"));
    for (const finding of report.findings) assert.ok(finding.evidenceExcerpts.every((excerpt) => "Skills: RESTful\nAPI delivery; Microsoft—Excel reports.".includes(excerpt)));
  });

  it("compares years near the related evidence and treats lower or unstated duration as partial", () => {
    const requirements = jobAnalysis({ required: ["5+ years of Python experience required"] });
    const insufficient = analyzeResumeMatch("Python developer for 3 years.", requirements);
    assert.equal(findingStatus(insufficient, "5+ years of Python experience required"), "partially_matched");
    const unrelatedTenure = analyzeResumeMatch("Ten years in retail operations. Used Python for data cleanup.", requirements);
    assert.equal(findingStatus(unrelatedTenure, "5+ years of Python experience required"), "partially_matched");
  });

  it("applies configured weights and redistributes absent category weights proportionally", () => {
    assert.equal(Object.values(MATCH_SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 1);
    const onlyRequired = analyzeResumeMatch("SQL, Python", jobAnalysis({ required: ["SQL required", "Python required"] }));
    assert.equal(onlyRequired.scorePercent, 100);

    const mixed = analyzeResumeMatch("SQL", jobAnalysis({ required: ["SQL required"], preferred: ["Python preferred"] }));
    assert.equal(mixed.scorePercent, 75);

    const everyCategory = analyzeResumeMatch("SQL required; Excel reporting; Python scripting; coordinate weekly project work", jobAnalysis({
      required: ["SQL required"],
      preferred: ["Microsoft Excel is preferred"],
      skills: ["Python"],
      responsibilities: ["Coordinate weekly project work"],
    }));
    assert.equal(everyCategory.scorePercent, 100);
    assert.equal(Object.values(MATCH_SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 1);
  });

  it("excludes Needs Review findings from the scored denominator", () => {
    const report = analyzeResumeMatch("SQL and Python", jobAnalysis({ required: ["SQL required", "Python required"], needsReview: ["Experience should be relevant if possible"] }));
    assert.equal(findingStatus(report, "Experience should be relevant if possible"), "needs_review");
    assert.equal(report.counts.needs_review, 1);
    assert.equal(report.scorePercent, 100);
    assert.match(report.scoreExplanation, /needs-review items are excluded/i);
  });

  it("does not produce a score with fewer than the minimum reliable requirements", () => {
    const report = analyzeResumeMatch("SQL experience.", jobAnalysis({ required: ["SQL required"] }));
    assert.equal(MIN_SCORABLE_REQUIREMENTS, 2);
    assert.equal(report.scorePercent, null);
    assert.match(report.scoreExplanation, /unavailable/i);
  });

  it("keeps evidence excerpts verbatim from the resume", () => {
    const resume = "Fictional role: delivered weekly reporting with SQL and Python.";
    const report = analyzeResumeMatch(resume, jobAnalysis({ skills: ["SQL"] }));
    const evidence = report.findings[0].evidenceExcerpts[0];
    assert.ok(evidence);
    assert.ok(resume.includes(evidence));
  });

  it("separates manual corrections from automatic statuses and recalculates the score", () => {
    const report = analyzeResumeMatch("SQL, Python", jobAnalysis({ required: ["SQL required", "Python required"] }));
    const corrected = setReviewedStatus(report, "required-0", "not_found");
    assert.equal(corrected.findings[0].automaticStatus, "matched");
    assert.equal(corrected.findings[0].reviewedStatus, "not_found");
    assert.equal(corrected.scorePercent, 50);
    const reset = setReviewedStatus(corrected, "required-0", null);
    assert.equal(reset.scorePercent, 100);

    const uncertain = analyzeResumeMatch("Python", jobAnalysis({ needsReview: ["Python background if applicable"] }));
    const classified = setReviewedPriority(uncertain, "needsReview-0", "required");
    assert.equal(classified.scorePercent, null);
    const statusCorrected = setReviewedStatus(classified, "needsReview-0", "matched");
    assert.equal(statusCorrected.scorePercent, null); // One reliable requirement remains below the minimum.
    const anotherRequirement = analyzeResumeMatch("Python SQL", jobAnalysis({ required: ["Python required", "SQL required"], needsReview: ["Additional Python background if applicable"] }));
    const rated = setReviewedPriority(anotherRequirement, "needsReview-0", "preferred");
    const ratedAndMatched = setReviewedStatus(rated, "needsReview-0", "matched");
    assert.equal(ratedAndMatched.findings.at(-1)?.automaticStatus, "needs_review");
    assert.equal(ratedAndMatched.findings.at(-1)?.reviewedStatus, "matched");
    assert.equal(ratedAndMatched.findings.at(-1)?.reviewedPriority, "preferred");
    assert.equal(ratedAndMatched.scorePercent, 100);
  });

  it("marks results stale when the resume or edited requirements change", () => {
    const resume = { fileName: "fictional.pdf", fileType: "pdf" as const, fileSizeBytes: 25, text: "SQL Python" };
    const analysis = jobAnalysis({ required: ["SQL required", "Python required"] });
    const report = analyzeResumeMatch(resume.text, analysis);
    const ready = resumeAnalysisWorkflowReducer(initialResumeAnalysisWorkflow, { type: "resume-selected", resume });
    const withRequirements = resumeAnalysisWorkflowReducer(ready, { type: "analysis-completed", analysis });
    const analyzed = resumeAnalysisWorkflowReducer(withRequirements, { type: "match-completed", report });
    const newResume = resumeAnalysisWorkflowReducer(analyzed, { type: "resume-selected", resume: { ...resume, text: "Only SQL" } });
    assert.equal(newResume.matchStale, true);
    const requirementsChanged = resumeAnalysisWorkflowReducer(analyzed, { type: "analysis-edited", analysis });
    assert.equal(requirementsChanged.matchStale, true);
    const descriptionChanged = resumeAnalysisWorkflowReducer(analyzed, { type: "description-changed", value: "A different fictional posting" });
    assert.equal(descriptionChanged.matchStale, true);
    assert.equal(descriptionChanged.jobDescriptionNeedsAnalysis, true);
    const reanalyzed = resumeAnalysisWorkflowReducer(descriptionChanged, { type: "analysis-completed", analysis });
    assert.equal(reanalyzed.jobDescriptionNeedsAnalysis, false);
    assert.equal(reanalyzed.matchStale, true);
  });
});
