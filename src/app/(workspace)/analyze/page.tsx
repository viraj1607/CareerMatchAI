import { PageHeading } from "@/components/page-heading";
import { ResumeAnalysisForm } from "@/components/resume-analysis-form";
import { getMaxResumeSizeBytes } from "@/lib/resume-upload-config.server";

export const dynamic = "force-dynamic";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job } = await searchParams;
  const maxFileSizeBytes = getMaxResumeSizeBytes();
  return (
    <>
      <PageHeading
        title="Analyze resume"
        description="Add a resume and job posting to see how your experience matches the role."
      />
      <ResumeAnalysisForm maxFileSizeBytes={maxFileSizeBytes} initialSavedJobId={job ?? null} />
    </>
  );
}
