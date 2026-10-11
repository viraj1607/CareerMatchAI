import { z } from "zod";

export const MAX_JOB_DESCRIPTION_LENGTH = 30_000;
export const MIN_JOB_DESCRIPTION_LENGTH = 80;

export const JOB_SKILLS = [
  "Communication", "Written communication", "Verbal communication", "Customer service", "Troubleshooting",
  "SQL", "Python", "Java", "JavaScript", "TypeScript", "React", "Next.js", "REST APIs", "Git",
  "Microsoft Excel", "Microsoft Office", "Data analysis", "Project management", "Leadership", "Teamwork",
  "Problem solving", "Time management", "Organization", "Adaptability", "Attention to detail", "Technical support",
  "Sales", "Negotiation", "Research", "Documentation", "Agile", "Scrum", "HTML", "CSS", "Power BI", "Tableau",
] as const;

export type JobAnalysisSection = "required" | "preferred" | "skills" | "responsibilities" | "experienceEducation" | "needsReview";
export type JobDescriptionAnalysis = {
  jobTitle: string;
  sections: Record<JobAnalysisSection, string[]>;
};
export type EditableAnalysisItem = { id: string; text: string };
export type EditableJobDescriptionAnalysis = {
  jobTitle: string;
  sections: Record<JobAnalysisSection, EditableAnalysisItem[]>;
};

const editableItemSchema = z.object({ id: z.string().min(1).max(100), text: z.string().max(2000) }).strict();
export const editableJobDescriptionAnalysisSchema = z.object({
  jobTitle: z.string().max(200),
  sections: z.object({
    required: z.array(editableItemSchema).max(200), preferred: z.array(editableItemSchema).max(200),
    skills: z.array(editableItemSchema).max(200), responsibilities: z.array(editableItemSchema).max(200),
    experienceEducation: z.array(editableItemSchema).max(200), needsReview: z.array(editableItemSchema).max(200),
  }).strict(),
}).strict();
export type JobDescriptionValidation = { valid: true } | { valid: false; message: string };

const REQUIRED_CUE = /\b(required|must[- ]have|minimum qualifications?|mandatory|essential qualifications?|required experience|you(?:'|’)ll need|what you(?:'|’)ll bring)\b/i;
const PREFERRED_CUE = /\b(preferred|nice[- ]to[- ]have|an asset|ideally|would be an advantage|considered a plus)\b/i;
const EXPERIENCE_EDUCATION_CUE = /\b(?:\d+\+?\s+years?|years? of experience|bachelor(?:'|’)s|master(?:'|’)s|Ph\.?D\.?|degree|diploma|certification|certified|licen[cs]e|registration|college|university)\b/i;
const RESPONSIBILITY_HEADING = /^(?:key )?responsibilities|what you(?:'|’)ll do|what you will do|the role|in this role|day to day|your impact|duties(?: and responsibilities)?$/i;
const REQUIRED_HEADING = /^(?:minimum|required|essential|mandatory) qualifications?|^(?:what you(?:'|’)ll need|requirements|qualifications)$/i;
const PREFERRED_HEADING = /^(?:preferred|desired|nice to have|additional) qualifications?|^(?:bonus points|an asset|preferred skills)$/i;
const BULLET_PREFIX = /^(?:[•●▪◦*-]\s*|\d{1,3}[.)]\s*)/;
let itemSequence = 0;

export function makeEditableAnalysis(analysis: JobDescriptionAnalysis): EditableJobDescriptionAnalysis {
  return {
    jobTitle: analysis.jobTitle,
    sections: Object.fromEntries(Object.entries(analysis.sections).map(([section, items]) => [
      section,
      items.map((text) => ({ id: `${section}-${++itemSequence}`, text })),
    ])) as Record<JobAnalysisSection, EditableAnalysisItem[]>,
  };
}

export function editAnalysisItem(
  analysis: EditableJobDescriptionAnalysis,
  section: JobAnalysisSection,
  id: string,
  text: string,
): EditableJobDescriptionAnalysis {
  return { ...analysis, sections: { ...analysis.sections, [section]: analysis.sections[section].map((item) => item.id === id ? { ...item, text } : item) } };
}

export function addAnalysisItem(
  analysis: EditableJobDescriptionAnalysis,
  section: JobAnalysisSection,
): EditableJobDescriptionAnalysis {
  const item = { id: `${section}-${++itemSequence}`, text: "" };
  return { ...analysis, sections: { ...analysis.sections, [section]: [...analysis.sections[section], item] } };
}

export function removeAnalysisItem(
  analysis: EditableJobDescriptionAnalysis,
  section: JobAnalysisSection,
  id: string,
): EditableJobDescriptionAnalysis {
  return { ...analysis, sections: { ...analysis.sections, [section]: analysis.sections[section].filter((item) => item.id !== id) } };
}

export function validateJobDescription(text: string): JobDescriptionValidation {
  if (!text.trim()) return { valid: false, message: "Paste a job description to analyze." };
  if (text.length > MAX_JOB_DESCRIPTION_LENGTH) return { valid: false, message: `Keep the job description under ${MAX_JOB_DESCRIPTION_LENGTH.toLocaleString()} characters.` };
  if (text.trim().length < MIN_JOB_DESCRIPTION_LENGTH) return { valid: false, message: "This description is very short. Add more of the posting (at least 80 characters) for a useful review." };
  return { valid: true };
}

function normalizeLine(line: string): string {
  return line.replace(/[\t\u00a0 ]+/g, " ").replace(BULLET_PREFIX, "").trim();
}

function uniquePush(list: string[], value: string): void {
  const normalized = value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  if (normalized && !list.some((item) => item.replace(/\s+/g, " ").trim().toLocaleLowerCase() === normalized)) list.push(value.trim());
}

function splitStatements(text: string): string[] {
  return text.split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9“"'•*-])/u).map(normalizeLine).filter(Boolean);
}

function identifyTitle(lines: string[]): string {
  const leading = lines.slice(0, 16).map(normalizeLine).filter(Boolean);
  for (const line of leading) {
    const labeled = line.match(/^(?:job title|position|role)\s*[:：\-–—]\s*(.{2,100})$/i);
    if (labeled) return labeled[1].trim();
  }
  const titleWords = /\b(engineer|developer|analyst|manager|coordinator|specialist|designer|technician|consultant|administrator|representative|associate|director|officer|nurse|architect|scientist|accountant|recruiter|advisor|therapist|instructor|operator|writer|editor|support|sales|marketing|product owner|project lead)\b/i;
  for (const line of leading) {
    const candidate = normalizeLine(line.replace(/^(?:careers?|join our team|about us)\s*[:：\-–—]?\s*/i, ""));
    if (candidate.length >= 3 && candidate.length <= 90 && titleWords.test(candidate) && !/[.!?]$/.test(candidate)) return candidate;
  }
  return "Not identified";
}

function sectionHeading(line: string): "required" | "preferred" | "responsibilities" | null {
  const clean = line.replace(/[:：]$/, "").trim();
  if (PREFERRED_HEADING.test(clean)) return "preferred";
  if (REQUIRED_HEADING.test(clean)) return "required";
  if (RESPONSIBILITY_HEADING.test(clean)) return "responsibilities";
  return null;
}

function collectSkills(text: string): string[] {
  const found: string[] = [];
  for (const skill of JOB_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundary = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu");
    if (boundary.test(text)) uniquePush(found, skill);
  }
  return found;
}

export function analyzeJobDescription(text: string): JobDescriptionAnalysis {
  if (text.length > MAX_JOB_DESCRIPTION_LENGTH) throw new RangeError(`Job description exceeds ${MAX_JOB_DESCRIPTION_LENGTH} characters.`);
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(normalizeLine);
  const analysis: JobDescriptionAnalysis = {
    jobTitle: identifyTitle(lines),
    sections: { required: [], preferred: [], skills: collectSkills(text), responsibilities: [], experienceEducation: [], needsReview: [] },
  };
  let currentSection: "required" | "preferred" | "responsibilities" | null = null;
  for (const line of lines) {
    if (!line) continue;
    const heading = sectionHeading(line);
    if (heading) { currentSection = heading; continue; }
    if (/^(?:about (?:the )?company|about us|benefits|compensation|how to apply|equal opportunity|our offer|what we offer)\b/i.test(line)) {
      currentSection = null;
      continue;
    }
    const item = normalizeLine(line);
    if (currentSection === "responsibilities") {
      if (item.length > 12) uniquePush(analysis.sections.responsibilities, item);
      continue;
    }
    if (currentSection === "required" || currentSection === "preferred") {
      if (item.length <= 140 || BULLET_PREFIX.test(line)) {
        uniquePush(analysis.sections[currentSection], item);
        if (EXPERIENCE_EDUCATION_CUE.test(item)) uniquePush(analysis.sections.experienceEducation, item);
      } else {
        for (const statement of splitStatements(item)) uniquePush(analysis.sections[currentSection], statement);
      }
      continue;
    }
    for (const statement of splitStatements(item)) {
      const required = REQUIRED_CUE.test(statement);
      const preferred = PREFERRED_CUE.test(statement);
      if (required && preferred) uniquePush(analysis.sections.needsReview, statement);
      else if (required) uniquePush(analysis.sections.required, statement);
      else if (preferred) uniquePush(analysis.sections.preferred, statement);
      else if (/\b(?:should|ideally|where possible|would be helpful)\b/i.test(statement) && /\b(?:experience|qualification|skill|background|ability)\b/i.test(statement)) uniquePush(analysis.sections.needsReview, statement);
      if (EXPERIENCE_EDUCATION_CUE.test(statement)) uniquePush(analysis.sections.experienceEducation, statement);
      if (/\b(?:will|you(?:'|’)ll|responsible for|develop|maintain|support|lead|manage|coordinate|deliver|provide|build|design|troubleshoot)\b/i.test(statement) && statement.length > 25) {
        if (/\b(?:will|you(?:'|’)ll|responsible for)\b/i.test(statement)) uniquePush(analysis.sections.responsibilities, statement);
      }
    }
  }
  return analysis;
}

