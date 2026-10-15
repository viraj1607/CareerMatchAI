import { analyzeJobDescription, makeEditableAnalysis } from "@/lib/job-description-analysis";
import { analyzeResumeMatch } from "@/lib/resume-job-matcher";

export type PortfolioCandidate = {
  id: string;
  name: string;
  headline: string;
  summary: string;
  resumeText: string;
  highlights: string[];
};

export type PortfolioJob = {
  id: string;
  title: string;
  organization: string;
  summary: string;
  description: string;
};

export const portfolioCandidates: PortfolioCandidate[] = [
  {
    id: "jordan",
    name: "Jordan Lee",
    headline: "Product-focused software developer",
    summary: "Fictional web developer with accessible-interface and cross-functional delivery experience.",
    resumeText: `Jordan Lee\nFrontend developer with 4 years of experience building accessible web applications.\n\nExperience\nBuilt TypeScript and React features for public-service teams, partnering with product managers and content designers.\nCreated documented REST APIs and reusable interface components.\nFacilitated user-feedback reviews and translated findings into scoped delivery plans.\n\nSkills\nTypeScript, React, Next.js, JavaScript, HTML, CSS, REST APIs, Git, Documentation, Accessibility, Communication, Agile.`,
    highlights: ["4 years of web development", "Accessible interfaces", "TypeScript and React"],
  },
  {
    id: "samira",
    name: "Samira Patel",
    headline: "Customer support and operations analyst",
    summary: "Fictional operations analyst with customer support, documentation, and reporting experience.",
    resumeText: `Samira Patel\nOperations analyst with 3 years of customer support and reporting experience.\n\nExperience\nResolved customer service requests and documented recurring technical issues for product teams.\nCreated Microsoft Excel reports to identify support trends and improve response workflows.\nCoordinated with technical support specialists and communicated clear updates to customers.\n\nSkills\nCustomer service, Troubleshooting, Microsoft Excel, Data analysis, Documentation, Communication, Organization, Problem solving.`,
    highlights: ["Customer support operations", "Excel reporting", "Technical issue documentation"],
  },
];

export const portfolioJobs: PortfolioJob[] = [
  {
    id: "frontend-developer",
    title: "Frontend Developer",
    organization: "Example Civic Services",
    summary: "Fictional role focused on accessible public-service interfaces.",
    description: `Frontend Developer\n\nRequired qualifications\n- 3+ years of experience with TypeScript and React\n- Experience building accessible web interfaces\n- Strong written communication and documentation skills\n\nPreferred qualifications\n- Experience with Next.js and REST APIs\n\nResponsibilities\n- Build and maintain accessible public-service web features\n- Partner with product and content teams to deliver user-centred improvements\n- Document implementation decisions for cross-functional teams`,
  },
  {
    id: "support-analyst",
    title: "Support Operations Analyst",
    organization: "Sample Transit Co-op",
    summary: "Fictional role focused on service operations and trend reporting.",
    description: `Support Operations Analyst\n\nRequired qualifications\n- 2+ years of customer service or technical support experience\n- Strong troubleshooting and written communication skills\n- Experience using Microsoft Excel for reporting\n\nPreferred qualifications\n- Experience with data analysis and documentation\n\nResponsibilities\n- Analyze support trends and recommend workflow improvements\n- Coordinate customer issue updates with technical teams\n- Maintain clear support documentation`,
  },
];

export function buildPortfolioMatch(candidateId: string, jobId: string) {
  const candidate = portfolioCandidates.find((item) => item.id === candidateId) ?? portfolioCandidates[0];
  const job = portfolioJobs.find((item) => item.id === jobId) ?? portfolioJobs[0];
  const jobAnalysis = makeEditableAnalysis(analyzeJobDescription(job.description));
  const report = analyzeResumeMatch(candidate.resumeText, jobAnalysis);
  return { candidate, job, report };
}
