import { PageHeading } from "@/components/page-heading";
import { ResumeList } from "@/components/resume-list";
import { requireUser } from "@/lib/supabase/server";

export default async function ResumesPage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("resumes").select("id,name,created_at,original_resume_id").order("updated_at", { ascending: false });
  return (
    <>
      <PageHeading
        title="My resumes"
        description="Keep track of the resume versions you use for different roles."
      />
      <ResumeList initialResumes={data ?? []} loadError={Boolean(error)} />
    </>
  );
}
