import { ResumeEditor } from "@/components/resume-editor";

export default async function ResumeEditorPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <ResumeEditor initialResumeId={id ?? null} />;
}
