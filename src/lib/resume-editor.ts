import { z } from "zod";

export type ResumeExperience = { id: string; jobTitle: string; employer: string; location: string; dates: string; description: string; bullets: string[] };
export type ResumeEducation = { id: string; qualification: string; institution: string; location: string; dates: string; details: string };
export type ResumeListItem = { id: string; text: string };
export type ResumeContent = {
  contact: { name: string; email: string; phone: string; location: string; website: string };
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: ResumeListItem[];
  certifications: ResumeListItem[];
  projects: ResumeListItem[];
  additionalInformation: string;
};

export type SuggestionTarget =
  | { kind: "summary" }
  | { kind: "additional" }
  | { kind: "experience-description"; entryId: string }
  | { kind: "experience-bullet"; entryId: string; index: number }
  | { kind: "education-details"; entryId: string }
  | { kind: "project"; itemId: string }
  | { kind: "certification"; itemId: string };

export type ResumeSuggestion = {
  id: string;
  target: SuggestionTarget;
  originalText: string;
  suggestedText: string | null;
  explanation: string;
  requirementId: string | null;
  evidenceExcerpt: string | null;
  evidenceVerified: boolean;
  clarificationQuestion: string | null;
  status: "pending" | "accepted" | "rejected" | "edited_accepted";
  stale: boolean;
};

export type ResumeEditorState = {
  originalText: string;
  sourceFileName: string;
  originalContent: ResumeContent;
  currentContent: ResumeContent;
  targetJobDescription: string;
  targetRequirements: Array<{ id: string; text: string }>;
  suggestions: ResumeSuggestion[];
  savedResumeId: string | null;
  originalResumeId: string | null;
  savedName: string;
  savedSnapshot: string;
};

export type ResumeEditorAction =
  | { type: "resume-source-set"; text: string; fileName: string }
  | { type: "target-context-set"; description: string; requirements: Array<{ id: string; text: string }> }
  | { type: "content-updated"; content: ResumeContent }
  | { type: "suggestions-added"; suggestions: ResumeSuggestion[] }
  | { type: "suggestion-rejected"; id: string }
  | { type: "suggestion-accepted"; id: string; finalText?: string }
  | { type: "resume-loaded"; state: ResumeEditorState }
  | { type: "resume-saved"; id: string; name: string; originalResumeId: string | null; snapshot: string }
  | { type: "reset-confirmed"; confirmed: boolean };

export const blankResume = (): ResumeContent => ({
  contact: { name: "", email: "", phone: "", location: "", website: "" },
  summary: "", experience: [], education: [], skills: [], certifications: [], projects: [], additionalInformation: "",
});

export function addExperience(content: ResumeContent, id: string): ResumeContent {
  return { ...content, experience: [...content.experience, { id, jobTitle: "", employer: "", location: "", dates: "", description: "", bullets: [] }] };
}

export function removeExperience(content: ResumeContent, id: string): ResumeContent {
  return { ...content, experience: content.experience.filter((entry) => entry.id !== id) };
}

export function addEducation(content: ResumeContent, id: string): ResumeContent {
  return { ...content, education: [...content.education, { id, qualification: "", institution: "", location: "", dates: "", details: "" }] };
}

export function removeEducation(content: ResumeContent, id: string): ResumeContent {
  return { ...content, education: content.education.filter((entry) => entry.id !== id) };
}

export function addListItem(content: ResumeContent, section: "skills" | "certifications" | "projects", id: string): ResumeContent {
  return { ...content, [section]: [...content[section], { id, text: "" }] };
}

export function removeListItem(content: ResumeContent, section: "skills" | "certifications" | "projects", id: string): ResumeContent {
  return { ...content, [section]: content[section].filter((item) => item.id !== id) };
}

function uniqueByText(items: ResumeListItem[]): ResumeListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.text.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function deduplicateResumeContent(content: ResumeContent): ResumeContent {
  const seenExperience = new Set<string>();
  const experience = content.experience.map((entry) => ({ ...entry, bullets: uniqueStrings(entry.bullets) })).filter((entry) => {
    const fields = [entry.jobTitle, entry.employer, entry.location, entry.dates, entry.description, ...entry.bullets];
    if (!fields.some((value) => value.trim())) return false;
    const key = fields.map((value) => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase()).join("\u0000");
    if (seenExperience.has(key)) return false;
    seenExperience.add(key);
    return true;
  });
  const seenEducation = new Set<string>();
  const education = content.education.filter((entry) => {
    const fields = [entry.qualification, entry.institution, entry.location, entry.dates, entry.details];
    if (!fields.some((value) => value.trim())) return false;
    const key = fields.map((value) => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase()).join("\u0000");
    if (seenEducation.has(key)) return false;
    seenEducation.add(key);
    return true;
  });
  return {
    ...content,
    experience,
    education,
    skills: uniqueByText(content.skills),
    certifications: uniqueByText(content.certifications),
    projects: uniqueByText(content.projects),
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const headings: Record<string, "summary" | "experience" | "education" | "skills" | "certifications" | "projects" | "additionalInformation"> = {
  summary: "summary", "professional summary": "summary", "profile": "summary", objective: "summary",
  experience: "experience", "work experience": "experience", employment: "experience", "work history": "experience",
  education: "education", skills: "skills", "technical skills": "skills", certifications: "certifications", certificates: "certifications",
  projects: "projects", "selected projects": "projects", "additional information": "additionalInformation", "other information": "additionalInformation",
};
const BULLET = /^(?:[•●▪◦*-]\s*|\d{1,3}[.)]\s*)/;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+?\d[\d ().-]{7,}\d)/;
const URL = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|ca|org|net|io)(?:\/[^\s]*)?/i;

function listItems(text: string): ResumeListItem[] {
  return text.split(/\r?\n|[,;]+/).map((line) => line.replace(BULLET, "").trim()).filter(Boolean).map((line, index) => ({ id: `import-${index + 1}`, text: line }));
}

export function organizeResumeText(text: string): ResumeContent {
  const content = blankResume();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const segments = new Map<string, string[]>();
  let section = "preamble";
  segments.set(section, []);
  for (const line of lines) {
    const candidate = line.trim().replace(/[:：]$/, "").replace(BULLET, "").trim().toLocaleLowerCase();
    const key = headings[candidate];
    if (key) { section = key; if (!segments.has(section)) segments.set(section, []); }
    else segments.get(section)?.push(line);
  }
  const hasHeading = [...segments.keys()].some((key) => key !== "preamble");
  if (!hasHeading) {
    content.additionalInformation = text;
    return content;
  }

  const preamble = (segments.get("preamble") ?? []).filter((line) => line.trim());
  const nameIndex = preamble.findIndex((line) => !EMAIL.test(line) && !PHONE.test(line) && !URL.test(line) && line.trim().length <= 90);
  if (nameIndex >= 0) content.contact.name = preamble[nameIndex].trim();
  const remaining: string[] = [];
  for (const [index, line] of preamble.entries()) {
    if (index === nameIndex) continue;
    const email = line.match(EMAIL)?.[0];
    const phone = line.match(PHONE)?.[0];
    const url = line.match(URL)?.[0];
    if (email && !content.contact.email) content.contact.email = email;
    if (phone && !content.contact.phone) content.contact.phone = phone;
    if (url && !content.contact.website) content.contact.website = url;
    const residue = line.replace(EMAIL, "").replace(PHONE, "").replace(URL, "").replace(/[|,;]/g, " ").trim();
    if (residue && residue !== line.trim()) content.contact.location ||= residue;
    else if (!email && !phone && !url && line.trim()) remaining.push(line);
  }
  const additional = [...remaining, ...(segments.get("additionalInformation") ?? [])].join("\n").trim();
  content.additionalInformation = additional;
  content.summary = (segments.get("summary") ?? []).join("\n").trim();

  const experienceText = (segments.get("experience") ?? []).join("\n").trim();
  if (experienceText) content.experience = [{ id: "import-experience-1", jobTitle: "", employer: "", location: "", dates: "", description: experienceText, bullets: [] }];
  const educationText = (segments.get("education") ?? []).join("\n").trim();
  if (educationText) content.education = [{ id: "import-education-1", qualification: "", institution: "", location: "", dates: "", details: educationText }];
  content.skills = listItems((segments.get("skills") ?? []).join("\n"));
  content.certifications = listItems((segments.get("certifications") ?? []).join("\n"));
  content.projects = listItems((segments.get("projects") ?? []).join("\n"));
  return content;
}

export function initialResumeEditorState(text = "", fileName = ""): ResumeEditorState {
  const content = organizeResumeText(text);
  return { originalText: text, sourceFileName: fileName, originalContent: content, currentContent: structuredClone(content), targetJobDescription: "", targetRequirements: [], suggestions: [], savedResumeId: null, originalResumeId: null, savedName: "", savedSnapshot: "" };
}

export function resumeEditorReducer(state: ResumeEditorState, action: ResumeEditorAction): ResumeEditorState {
  switch (action.type) {
    case "resume-source-set": {
      const content = organizeResumeText(action.text);
      return { ...state, originalText: action.text, sourceFileName: action.fileName, originalContent: content, currentContent: structuredClone(content), suggestions: state.suggestions.map((item) => ({ ...item, stale: true })), savedResumeId: null, originalResumeId: null, savedName: "", savedSnapshot: "" };
    }
    case "target-context-set": {
      const changed = state.targetJobDescription !== action.description || JSON.stringify(state.targetRequirements) !== JSON.stringify(action.requirements);
      return { ...state, targetJobDescription: action.description, targetRequirements: action.requirements, suggestions: changed ? state.suggestions.map((item) => ({ ...item, stale: true })) : state.suggestions };
    }
    case "content-updated":
      return refreshSuggestionStaleness({ ...state, currentContent: action.content });
    case "suggestions-added":
      return { ...state, suggestions: [...state.suggestions, ...action.suggestions.filter((candidate) => !state.suggestions.some((existing) => existing.target.kind === candidate.target.kind && JSON.stringify(existing.target) === JSON.stringify(candidate.target) && existing.originalText === candidate.originalText && existing.suggestedText === candidate.suggestedText))] };
    case "suggestion-rejected":
      return { ...state, suggestions: state.suggestions.map((item) => item.id === action.id ? { ...item, status: "rejected" } : item) };
    case "suggestion-accepted":
      return acceptSuggestion(state, action.id, action.finalText);
    case "resume-loaded": return action.state;
    case "resume-saved": return { ...state, savedResumeId: action.id, savedName: action.name, originalResumeId: action.originalResumeId, savedSnapshot: action.snapshot };
    case "reset-confirmed":
      return action.confirmed ? { ...state, currentContent: structuredClone(state.originalContent), suggestions: state.suggestions.map((item) => ({ ...item, stale: item.status === "pending" || item.stale })) } : state;
  }
}

export function contentHasResumeText(content: ResumeContent): boolean {
  return Boolean([
    content.contact.name, content.contact.email, content.contact.phone, content.contact.location, content.contact.website, content.summary,
    ...content.experience.flatMap(({ jobTitle, employer, location, dates, description, bullets }) => [jobTitle, employer, location, dates, description, ...bullets]),
    ...content.education.flatMap(({ qualification, institution, location, dates, details }) => [qualification, institution, location, dates, details]),
    ...content.skills.map(({ text }) => text), ...content.certifications.map(({ text }) => text), ...content.projects.map(({ text }) => text), content.additionalInformation,
  ].some((value) => value.trim()));
}

export function resumeContentToText(content: ResumeContent): string {
  return [
    content.contact.name,
    [content.contact.email, content.contact.phone, content.contact.location, content.contact.website].filter(Boolean).join(" | "),
    content.summary,
    ...content.experience.flatMap((entry) => [entry.jobTitle, entry.employer, entry.location, entry.dates, entry.description, ...entry.bullets]),
    ...content.education.flatMap((entry) => [entry.qualification, entry.institution, entry.location, entry.dates, entry.details]),
    ...content.skills.map((item) => item.text), ...content.certifications.map((item) => item.text), ...content.projects.map((item) => item.text), content.additionalInformation,
  ].filter(Boolean).join("\n");
}

export function targetText(content: ResumeContent, target: SuggestionTarget): string | null {
  if (target.kind === "summary") return content.summary;
  if (target.kind === "additional") return content.additionalInformation;
  if (target.kind === "experience-description") return content.experience.find((item) => item.id === target.entryId)?.description ?? null;
  if (target.kind === "experience-bullet") return content.experience.find((item) => item.id === target.entryId)?.bullets[target.index] ?? null;
  if (target.kind === "education-details") return content.education.find((item) => item.id === target.entryId)?.details ?? null;
  if (target.kind === "project") return content.projects.find((item) => item.id === target.itemId)?.text ?? null;
  return content.certifications.find((item) => item.id === target.itemId)?.text ?? null;
}

export function replaceTargetText(content: ResumeContent, target: SuggestionTarget, oldText: string, newText: string): ResumeContent {
  const replaceOnce = (value: string) => {
    const index = value.indexOf(oldText);
    return index < 0 ? value : `${value.slice(0, index)}${newText}${value.slice(index + oldText.length)}`;
  };
  if (target.kind === "summary") return { ...content, summary: replaceOnce(content.summary) };
  if (target.kind === "additional") return { ...content, additionalInformation: replaceOnce(content.additionalInformation) };
  if (target.kind === "experience-description") return { ...content, experience: content.experience.map((entry) => entry.id === target.entryId ? { ...entry, description: replaceOnce(entry.description) } : entry) };
  if (target.kind === "experience-bullet") return { ...content, experience: content.experience.map((entry) => entry.id === target.entryId ? { ...entry, bullets: entry.bullets.map((bullet, index) => index === target.index ? replaceOnce(bullet) : bullet) } : entry) };
  if (target.kind === "education-details") return { ...content, education: content.education.map((entry) => entry.id === target.entryId ? { ...entry, details: replaceOnce(entry.details) } : entry) };
  if (target.kind === "project") return { ...content, projects: content.projects.map((entry) => entry.id === target.itemId ? { ...entry, text: replaceOnce(entry.text) } : entry) };
  return { ...content, certifications: content.certifications.map((entry) => entry.id === target.itemId ? { ...entry, text: replaceOnce(entry.text) } : entry) };
}

export function acceptSuggestion(state: ResumeEditorState, id: string, finalText?: string): ResumeEditorState {
  const suggestion = state.suggestions.find((item) => item.id === id);
  if (!suggestion || suggestion.stale || !suggestion.suggestedText || !suggestion.originalText) return state;
  const current = targetText(state.currentContent, suggestion.target);
  if (current === null || !current.includes(suggestion.originalText)) return state;
  const nextText = finalText ?? suggestion.suggestedText;
  if (!nextText.trim() || (nextText !== suggestion.originalText && current.includes(nextText))) return state;
  return {
    ...state,
    currentContent: replaceTargetText(state.currentContent, suggestion.target, suggestion.originalText, nextText),
    suggestions: state.suggestions.map((item) => item.id === id ? { ...item, status: finalText === undefined || finalText === item.suggestedText ? "accepted" : "edited_accepted" } : item),
  };
}

export function refreshSuggestionStaleness(state: ResumeEditorState): ResumeEditorState {
  return { ...state, suggestions: state.suggestions.map((suggestion) => suggestion.status === "pending" && !suggestion.clarificationQuestion ? { ...suggestion, stale: suggestion.stale || !targetText(state.currentContent, suggestion.target)?.includes(suggestion.originalText) } : suggestion) };
}

export function safeResumeFileName(name: string, extension: "pdf" | "docx"): string {
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 _.-]/g, "").trim().replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  const base = normalized.slice(0, 72).replace(/\.(?:pdf|docx)$/i, "");
  return `${base || "CareerMatch_Resume"}.${extension}`;
}

const contactSchema = z.object({ name: z.string().max(160), email: z.string().max(200), phone: z.string().max(80), location: z.string().max(160), website: z.string().max(240) }).strict();
const textItemSchema = z.object({ id: z.string().min(1).max(100), text: z.string().max(4000) }).strict();
export const resumeContentSchema = z.object({
  contact: contactSchema,
  summary: z.string().max(8000),
  experience: z.array(z.object({ id: z.string().min(1).max(100), jobTitle: z.string().max(200), employer: z.string().max(200), location: z.string().max(180), dates: z.string().max(120), description: z.string().max(8000), bullets: z.array(z.string().max(2000)).max(60) }).strict()).max(30),
  education: z.array(z.object({ id: z.string().min(1).max(100), qualification: z.string().max(200), institution: z.string().max(200), location: z.string().max(180), dates: z.string().max(120), details: z.string().max(4000) }).strict()).max(30),
  skills: z.array(textItemSchema).max(120), certifications: z.array(textItemSchema).max(60), projects: z.array(textItemSchema).max(60),
  additionalInformation: z.string().max(8000),
}).strict();
