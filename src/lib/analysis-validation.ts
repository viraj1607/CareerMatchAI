export type AnalysisFormErrors = {
  resume?: string;
  title?: string;
  company?: string;
  description?: string;
};

export function isSupportedResumeFile(fileName: string) {
  return /\.(pdf|docx)$/i.test(fileName);
}

export function validateAnalysisInput({
  resumeName,
  title,
  company,
  description,
}: {
  resumeName: string;
  title: string;
  company: string;
  description: string;
}): AnalysisFormErrors {
  const errors: AnalysisFormErrors = {};
  if (!resumeName) errors.resume = "Select a PDF or DOCX resume to continue.";
  if (!title.trim()) errors.title = "Enter the job title.";
  if (!company.trim()) errors.company = "Enter the company name.";
  if (description.trim().length < 30) {
    errors.description = "Add at least 30 characters from the job description.";
  }
  return errors;
}
