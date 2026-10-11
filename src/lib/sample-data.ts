export type ResumeRecord = {
  id: string;
  fileName: string;
  uploadedAt: string;
  fileType: "PDF" | "DOCX";
};

export type ApplicationStatus = "Draft" | "Applied" | "Interview" | "Closed";

export type ApplicationRecord = {
  id: string;
  title: string;
  company: string;
  appliedAt: string;
  status: ApplicationStatus;
};

export type AnalysisRecord = {
  id: string;
  title: string;
  company: string;
  createdAt: string;
};

export const sampleResumes: ResumeRecord[] = [
  {
    id: "resume-1",
    fileName: "Marketing_Resume_2026.pdf",
    uploadedAt: "Oct 2, 2026",
    fileType: "PDF",
  },
  {
    id: "resume-2",
    fileName: "Program_Manager_Resume.docx",
    uploadedAt: "Sep 24, 2026",
    fileType: "DOCX",
  },
];

export const sampleApplications: ApplicationRecord[] = [
  {
    id: "application-1",
    title: "Marketing Specialist",
    company: "Cedarline Cooperative",
    appliedAt: "Oct 4, 2026",
    status: "Applied",
  },
  {
    id: "application-2",
    title: "Program Manager",
    company: "Northstar Community Health",
    appliedAt: "Sep 28, 2026",
    status: "Interview",
  },
  {
    id: "application-3",
    title: "Communications Coordinator",
    company: "Harbourlight Analytics",
    appliedAt: "Sep 17, 2026",
    status: "Draft",
  },
];

export const sampleAnalyses: AnalysisRecord[] = [
  {
    id: "analysis-1",
    title: "Marketing Specialist",
    company: "Cedarline Cooperative",
    createdAt: "Oct 4, 2026",
  },
  {
    id: "analysis-2",
    title: "Program Manager",
    company: "Northstar Community Health",
    createdAt: "Sep 28, 2026",
  },
  {
    id: "analysis-3",
    title: "Communications Coordinator",
    company: "Harbourlight Analytics",
    createdAt: "Sep 17, 2026",
  },
];
