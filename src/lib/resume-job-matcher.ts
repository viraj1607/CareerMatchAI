import { JOB_SKILLS, type EditableJobDescriptionAnalysis, type JobAnalysisSection } from "@/lib/job-description-analysis";

export type MatchStatus = "matched" | "partially_matched" | "not_found" | "needs_review";
export type MatchPriority = "required" | "preferred" | "unspecified";
export type MatchCategory = Exclude<JobAnalysisSection, "needsReview"> | "needsReview";
export type ScoreCategory = "required" | "preferred" | "skills" | "responsibilities";

export type MatchRequirement = {
  id: string;
  text: string;
  category: MatchCategory;
  priority: MatchPriority;
  scoreCategory: ScoreCategory | null;
  classificationNeedsReview: boolean;
};

export type RequirementMatch = {
  requirement: MatchRequirement;
  automaticStatus: MatchStatus;
  reviewedStatus: MatchStatus | null;
  reviewedPriority: MatchPriority | null;
  evidenceExcerpts: string[];
  explanation: string;
};

export type MatchCounts = Record<MatchStatus, number>;
export type ResumeMatchReport = {
  findings: RequirementMatch[];
  scorePercent: number | null;
  scoreExplanation: string;
  counts: MatchCounts;
  strengths: Array<{ requirement: string; evidence: string }>;
  gaps: Array<{ requirement: string; priority: MatchPriority; status: MatchStatus }>;
  nextSteps: string[];
};

export const MATCH_SCORE_WEIGHTS: Record<ScoreCategory, number> = {
  required: 0.6,
  preferred: 0.2,
  skills: 0.15,
  responsibilities: 0.05,
};
export const MIN_SCORABLE_REQUIREMENTS = 2;

const TERM_SYNONYMS: Array<{ canonical: string; variants: string[] }> = [
  { canonical: "Customer service", variants: ["customer support"] },
  { canonical: "Troubleshooting", variants: ["technical issue resolution", "resolve technical issues", "resolving technical issues"] },
  { canonical: "REST APIs", variants: ["REST API", "RESTful API", "RESTful APIs"] },
  { canonical: "Microsoft Excel", variants: ["Excel"] },
  { canonical: "Written communication", variants: ["written communications"] },
  { canonical: "Leadership", variants: ["team leadership", "leading a team"] },
  { canonical: "Organization", variants: ["organizational skills"] },
];

const CREDENTIAL_GROUPS: Array<{ canonical: string; variants: string[] }> = [
  { canonical: "bachelor degree", variants: ["bachelor's degree", "bachelors degree", "bachelor degree"] },
  { canonical: "master degree", variants: ["master's degree", "masters degree", "master degree"] },
  { canonical: "doctoral degree", variants: ["PhD", "Ph.D.", "doctorate"] },
  { canonical: "diploma", variants: ["diploma"] },
  { canonical: "certification", variants: ["certification", "certificate", "certified"] },
  { canonical: "professional licence", variants: ["licence", "license", "licensed", "licenced"] },
  { canonical: "professional registration", variants: ["registration", "registered"] },
];

const STOP_WORDS = new Set((
  "a an and are as at be been being by can candidate candidates demonstrate demonstrated do for from have in is it its of on or our possess require required requirements qualification qualifications relevant role should skills skill strong the their this to with work working experience years year minimum preferred must plus ideally ability able well including equivalent related successful you your"
).split(" "));

const HIGH_LEVEL_CUE = /\b(advanced|expert|expertise|proficient|proficiency|extensive|deep knowledge|strong command)\b/i;
const LOW_LEVEL_CUE = /\b(familiar with|basic knowledge|beginner|introductory|exposure to|some experience|coursework|class project|training in)\b/i;
const INCONCLUSIVE_CUE = /\b(?:mentioned|mention of|awareness of|read about|saw once|observed|no hands-on experience)\b/i;
const NEGATION_CUE = /\b(?:no|without|lack(?:s|ing)?|never used|not experienced with|not proficient in)\b[^.!?\n]{0,55}$/i;

type EvidenceTerm = { label: string; patterns: string[]; kind: "skill" | "credential" | "token" };
type EvidenceHit = { term: EvidenceTerm; excerpt: string; start: number; context: string };

function phrasePattern(phrase: string): RegExp {
  const words = phrase.normalize("NFKD").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!words.length) return /$a/;
  const source = words.map(escapeRegex).join("[\\s\\p{P}_]+?");
  return new RegExp(`(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`, "giu");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function dedupeKey(value: string): string {
  let key = normalizedText(value);
  for (const group of TERM_SYNONYMS) {
    const canonical = normalizedText(group.canonical);
    for (const variant of group.variants) {
      const alias = normalizedText(variant);
      if (canonical.endsWith(` ${alias}`)) continue;
      key = key.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(alias)}(?![\\p{L}\\p{N}])`, "gu"), canonical);
    }
  }
  for (const group of CREDENTIAL_GROUPS) {
    for (const variant of group.variants) key = key.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(normalizedText(variant))}(?![\\p{L}\\p{N}])`, "gu"), normalizedText(group.canonical));
  }
  return key.replace(/\s+/g, " ").trim();
}

function containsPhrase(text: string, phrase: string): boolean {
  return phrasePattern(phrase).test(text);
}

function addRequirement(
  target: MatchRequirement[],
  seen: Set<string>,
  entry: MatchRequirement,
): void {
  const key = dedupeKey(entry.text);
  if (!key || seen.has(key)) return;
  if (entry.category === "skills") {
    const variants = getSkillVariants(entry.text);
    if (target.some((existing) => existing.category !== "skills" && variants.some((variant) => containsPhrase(existing.text, variant)))) return;
  }
  seen.add(key);
  target.push(entry);
}

function getSkillVariants(text: string): string[] {
  const variants: string[] = [];
  for (const skill of JOB_SKILLS) if (containsPhrase(text, skill)) variants.push(skill);
  for (const group of TERM_SYNONYMS) {
    if ([group.canonical, ...group.variants].some((term) => containsPhrase(text, term))) variants.push(group.canonical);
  }
  return [...new Set(variants)];
}

function inferredPriority(text: string): MatchPriority {
  if (/\b(preferred|nice to have|an asset|ideally|advantage|bonus)\b/i.test(text)) return "preferred";
  if (/\b(required|must have|mandatory|essential|minimum|must be|must hold)\b/i.test(text)) return "required";
  return "unspecified";
}

export function collectMatchRequirements(analysis: EditableJobDescriptionAnalysis | null): MatchRequirement[] {
  if (!analysis) return [];
  const requirements: MatchRequirement[] = [];
  const seen = new Set<string>();
  const sections: Array<{ key: JobAnalysisSection; priority: MatchPriority; scoreCategory: ScoreCategory | null }> = [
    { key: "required", priority: "required", scoreCategory: "required" },
    { key: "preferred", priority: "preferred", scoreCategory: "preferred" },
    { key: "skills", priority: "unspecified", scoreCategory: "skills" },
    { key: "responsibilities", priority: "unspecified", scoreCategory: "responsibilities" },
    { key: "experienceEducation", priority: "unspecified", scoreCategory: null },
    { key: "needsReview", priority: "unspecified", scoreCategory: null },
  ];
  for (const { key, priority: defaultPriority, scoreCategory } of sections) {
    for (const item of analysis.sections[key]) {
      const priority = key === "required" || key === "preferred" ? defaultPriority : key === "needsReview" ? "unspecified" : inferredPriority(item.text);
      const classificationNeedsReview = key === "needsReview" || (key === "experienceEducation" && priority === "unspecified");
      const effectiveScoreCategory = key === "experienceEducation"
        ? priority === "preferred" ? "preferred" : priority === "required" ? "required" : null
        : scoreCategory;
      const skillTerms = key === "skills" ? getSkillVariants(item.text) : [];
      const entries = skillTerms.length > 0 ? skillTerms.map((text, index) => ({ id: `${item.id}-${index}`, text })) : [item];
      for (const entry of entries) addRequirement(requirements, seen, {
        id: entry.id,
        text: entry.text.trim(),
        category: key,
        priority,
        scoreCategory: effectiveScoreCategory,
        classificationNeedsReview,
      });
    }
  }
  return requirements;
}

function makeEvidenceTerms(requirement: MatchRequirement): EvidenceTerm[] {
  const text = requirement.text;
  const terms: EvidenceTerm[] = [];
  const consumed = new Set<string>();
  const selectedPatterns: string[] = [];
  const selectedLabels = new Set<string>();
  const skillGroups = [
    ...JOB_SKILLS.map((skill) => ({ canonical: skill, variants: [skill] })),
    ...TERM_SYNONYMS,
  ].sort((a, b) => Math.max(...[b.canonical, ...b.variants].map((value) => value.length)) - Math.max(...[a.canonical, ...a.variants].map((value) => value.length)));
  for (const group of skillGroups) {
    const variants = [...new Set([group.canonical, ...group.variants])];
    if (variants.some((variant) => containsPhrase(text, variant))) {
      if (selectedLabels.has(normalizedText(group.canonical))) {
        const existing = terms.find((term) => normalizedText(term.label) === normalizedText(group.canonical));
        if (existing) existing.patterns = [...new Set([...existing.patterns, ...variants])];
      } else if (!variants.some((variant) => selectedPatterns.some((selected) => containsPhrase(selected, variant)))) {
        terms.push({ label: group.canonical, patterns: variants, kind: "skill" });
        selectedLabels.add(normalizedText(group.canonical));
        selectedPatterns.push(...variants);
      }
      for (const variant of variants) for (const token of normalizedText(variant).split(" ")) consumed.add(token);
    }
  }
  for (const group of CREDENTIAL_GROUPS) {
    if (group.variants.some((variant) => containsPhrase(text, variant))) {
      terms.push({ label: group.canonical, patterns: group.variants, kind: "credential" });
      for (const variant of group.variants) for (const token of normalizedText(variant).split(" ")) consumed.add(token);
    }
  }

  const yearsMatch = text.match(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/i);
  if (yearsMatch) terms.push({ label: `${yearsMatch[1]} years experience`, patterns: ["year", "years"], kind: "token" });

  const fallbackTokens = (text.normalize("NFKD").replace(/\p{M}/gu, "").match(/[\p{L}]{4,}/gu) ?? [])
    .map((token) => token.toLocaleLowerCase())
    .filter((token, index, all) => !STOP_WORDS.has(token) && !consumed.has(token) && all.indexOf(token) === index);
  for (const token of fallbackTokens) terms.push({ label: token, patterns: [token], kind: "token" });
  return terms;
}

function excerptFor(source: string, start: number, end: number): string {
  let left = start;
  let right = end;
  while (left > 0 && !/[\n.!?]/.test(source[left - 1])) left--;
  while (right < source.length && !/[\n.!?]/.test(source[right])) right++;
  const excerpt = source.slice(left, right).trim();
  if (excerpt.length <= 240) return excerpt;
  const from = Math.max(left, start - 90);
  const to = Math.min(right, end + 90);
  return `${from > left ? "…" : ""}${source.slice(from, to).trim()}${to < right ? "…" : ""}`;
}

function findHits(resume: string, term: EvidenceTerm): EvidenceHit[] {
  const patterns = term.kind === "token" && term.patterns.length === 0 ? [] : term.patterns;
  if (!patterns.length) return [];
  const hits: EvidenceHit[] = [];
  for (const phrase of patterns) {
    const regex = phrasePattern(phrase);
    for (const match of resume.matchAll(regex)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const before = resume.slice(Math.max(0, start - 65), start);
      if (NEGATION_CUE.test(before)) continue;
      const context = resume.slice(Math.max(0, start - 90), Math.min(resume.length, end + 90));
      const excerpt = excerptFor(resume, start, end);
      if (!hits.some((hit) => hit.start === start)) hits.push({ term, excerpt, start, context });
    }
  }
  return hits;
}

function extractYears(text: string): number | null {
  const match = text.match(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/i);
  return match ? Number(match[1]) : null;
}

function requirementMatch(resume: string, requirement: MatchRequirement): RequirementMatch {
  if (requirement.classificationNeedsReview) {
    const evidenceTerms = makeEvidenceTerms(requirement);
    const evidence = evidenceTerms.flatMap((term) => findHits(resume, term)).map((hit) => hit.excerpt);
    return {
      requirement,
      automaticStatus: "needs_review",
      reviewedStatus: null,
      reviewedPriority: null,
      evidenceExcerpts: [...new Set(evidence)],
      explanation: requirement.category === "needsReview"
        ? "The job description parser flagged this wording as uncertain. Review the original posting to decide how it should be classified."
        : "This experience or education item does not clearly say whether it is required or preferred, so it is excluded from the score until reviewed.",
    };
  }

  const terms = makeEvidenceTerms(requirement);
  if (!terms.length) {
    return { requirement, automaticStatus: "needs_review", reviewedStatus: null, reviewedPriority: null, evidenceExcerpts: [], explanation: "The requirement is too broad for the phrase matcher to compare reliably." };
  }
  const hits = terms.map((term) => ({ term, hits: findHits(resume, term) }));
  const matchedTerms = hits.filter(({ hits: termHits }) => termHits.length > 0);
  const evidence = [...new Set(matchedTerms.flatMap(({ hits: termHits }) => termHits.map((hit) => hit.excerpt)))];
  if (!evidence.length) {
    return { requirement, automaticStatus: "not_found", reviewedStatus: null, reviewedPriority: null, evidenceExcerpts: [], explanation: "No matching phrase or explicit synonym was found in the extracted resume text." };
  }

  const leadershipEvidenceIsIndirect = hits.some(({ term, hits: termHits }) =>
    /leadership/i.test(term.label) && termHits.some((hit) => /\b(?:assisted|supported|helped|participated in)\b/i.test(hit.context)));
  if (leadershipEvidenceIsIndirect) {
    return { requirement, automaticStatus: "needs_review", reviewedStatus: null, reviewedPriority: null, evidenceExcerpts: evidence, explanation: "The resume describes assisting with leadership-related work, which does not establish direct team leadership. Review the context." };
  }

  if (hits.some(({ hits: termHits }) => termHits.some((hit) => INCONCLUSIVE_CUE.test(hit.context)))) {
    return { requirement, automaticStatus: "needs_review", reviewedStatus: null, reviewedPriority: null, evidenceExcerpts: evidence, explanation: "The resume mentions this term without clear evidence of applying it. Review the surrounding experience before treating it as a demonstrated qualification." };
  }

  const foundCount = matchedTerms.length;
  let partialReason = foundCount < terms.length ? "Only part of the requirement's identifiable evidence was found." : "";
  const requiredYears = extractYears(requirement.text);
  if (requiredYears !== null) {
    const resumeYears = evidence.map(extractYears).filter((years): years is number => years !== null).sort((a, b) => b - a)[0] ?? null;
    if (resumeYears === null) partialReason = "The resume mentions related evidence but does not state the requested duration.";
    else if (resumeYears < requiredYears) partialReason = `The resume states ${resumeYears} years, below the ${requiredYears} years requested.`;
  }

  if (HIGH_LEVEL_CUE.test(requirement.text)) {
    const evidenceContext = matchedTerms.flatMap(({ hits: termHits }) => termHits.map((hit) => hit.context)).join(" ");
    if (!HIGH_LEVEL_CUE.test(evidenceContext)) partialReason = "The requested proficiency level is not clearly demonstrated in the resume.";
  }
  if (!partialReason && hits.some(({ hits: termHits }) => termHits.some((hit) => LOW_LEVEL_CUE.test(hit.context)))) {
    partialReason = "The resume describes familiarity, training, or assisted experience rather than clear independent proficiency.";
  }

  return {
    requirement,
    automaticStatus: partialReason ? "partially_matched" : "matched",
    reviewedStatus: null,
    reviewedPriority: null,
    evidenceExcerpts: evidence,
    explanation: partialReason || "The resume contains direct phrase or synonym evidence for the identifiable parts of this requirement.",
  };
}

function effectiveStatus(finding: RequirementMatch): MatchStatus {
  return finding.reviewedStatus ?? finding.automaticStatus;
}

function effectiveScoreCategory(finding: RequirementMatch): ScoreCategory | null {
  if (finding.requirement.scoreCategory) return finding.requirement.scoreCategory;
  const priority = finding.reviewedPriority ?? finding.requirement.priority;
  if (priority === "required") return "required";
  if (priority === "preferred") return "preferred";
  return null;
}

function emptyCounts(): MatchCounts {
  return { matched: 0, partially_matched: 0, not_found: 0, needs_review: 0 };
}

function summarize(findings: RequirementMatch[]): ResumeMatchReport {
  const counts = emptyCounts();
  for (const finding of findings) counts[effectiveStatus(finding)]++;

  const categoryValues = new Map<ScoreCategory, number[]>();
  let scorableCount = 0;
  for (const finding of findings) {
    const status = effectiveStatus(finding);
    const category = effectiveScoreCategory(finding);
    if (!category || status === "needs_review") continue;
    const score = status === "matched" ? 1 : status === "partially_matched" ? 0.5 : 0;
    const values = categoryValues.get(category) ?? [];
    values.push(score);
    categoryValues.set(category, values);
    scorableCount++;
  }

  const activeWeight = [...categoryValues.keys()].reduce((sum, category) => sum + MATCH_SCORE_WEIGHTS[category], 0);
  let scorePercent: number | null = null;
  let scoreExplanation: string;
  if (scorableCount < MIN_SCORABLE_REQUIREMENTS) {
    scoreExplanation = `A score is unavailable until at least ${MIN_SCORABLE_REQUIREMENTS} classifiable requirements can be compared. ${scorableCount} currently qualify; needs-review items are excluded.`;
  } else if (activeWeight <= 0) {
    scoreExplanation = "A score is unavailable because no weighted requirement category has classifiable items.";
  } else {
    const weighted = [...categoryValues.entries()].reduce((sum, [category, values]) => {
      const average = values.reduce((total, value) => total + value, 0) / values.length;
      return sum + average * (MATCH_SCORE_WEIGHTS[category] / activeWeight);
    }, 0);
    scorePercent = Math.round(weighted * 100);
    scoreExplanation = `Matched = 1, partially matched = 0.5, and not found = 0. Category averages use weights 60% required, 20% preferred, 15% skills, and 5% responsibilities. Empty categories are removed and remaining weights are normalized; needs-review items are excluded. ${scorableCount} requirements were scored.`;
  }

  const strengths = findings
    .filter((finding) => effectiveStatus(finding) === "matched" && finding.evidenceExcerpts.length > 0)
    .map((finding) => ({ requirement: finding.requirement.text, evidence: finding.evidenceExcerpts[0] }));
  const gaps = findings
    .filter((finding) => ["partially_matched", "not_found"].includes(effectiveStatus(finding)))
    .map((finding) => ({ requirement: finding.requirement.text, priority: finding.reviewedPriority ?? finding.requirement.priority, status: effectiveStatus(finding) }))
    .sort((a, b) => (a.priority === "required" ? 0 : a.priority === "preferred" ? 1 : 2) - (b.priority === "required" ? 0 : b.priority === "preferred" ? 1 : 2));

  const nextSteps: string[] = [];
  if (gaps.some((gap) => gap.status === "partially_matched")) nextSteps.push("Clarify the scope, level, or duration of partially supported experience when you can substantiate those details.");
  if (gaps.some((gap) => gap.status === "not_found")) nextSteps.push("Review the relevant sections of your resume. Add truthful evidence only if you have the experience; otherwise consider whether training or a qualification would help.");
  if (findings.some((finding) => effectiveStatus(finding) === "needs_review")) nextSteps.push("Review uncertain requirements and evidence manually before relying on this comparison.");
  if (!nextSteps.length) nextSteps.push("Review the evidence excerpts for accuracy and keep the original resume wording truthful.");

  return { findings, scorePercent, scoreExplanation, counts, strengths, gaps, nextSteps };
}

export function analyzeResumeMatch(resumeText: string, analysis: EditableJobDescriptionAnalysis | null): ResumeMatchReport {
  const requirements = collectMatchRequirements(analysis);
  const resume = resumeText.replace(/\r\n?/g, "\n").trim();
  const findings = requirements.map((requirement) => resume
    ? requirementMatch(resume, requirement)
    : { requirement, automaticStatus: "not_found" as const, reviewedStatus: null, reviewedPriority: null, evidenceExcerpts: [], explanation: "No readable resume text is available for comparison." });
  return summarize(findings);
}

export function setReviewedStatus(report: ResumeMatchReport, id: string, status: MatchStatus | null): ResumeMatchReport {
  return summarize(report.findings.map((finding) => finding.requirement.id === id ? { ...finding, reviewedStatus: status } : finding));
}

export function setReviewedPriority(report: ResumeMatchReport, id: string, priority: MatchPriority | null): ResumeMatchReport {
  return summarize(report.findings.map((finding) => finding.requirement.id === id ? { ...finding, reviewedPriority: priority } : finding));
}

export function getEffectiveMatchStatus(finding: RequirementMatch): MatchStatus {
  return effectiveStatus(finding);
}
