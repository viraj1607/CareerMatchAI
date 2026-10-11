import { ApplicationList } from "@/components/application-list";
import { PageHeading } from "@/components/page-heading";
import { requireUser } from "@/lib/supabase/server";

export default async function ApplicationsPage() {
  const { supabase } = await requireUser();
  const [applications, resumes, jobs] = await Promise.all([
    supabase.from("job_applications").select("id,job_title,company_name,job_url,status,application_date,notes,resume_id,job_description_id").order("updated_at", { ascending: false }),
    supabase.from("resumes").select("id,name").order("name"),
    supabase.from("job_descriptions").select("id,job_title,company_name").order("updated_at", { ascending: false }),
  ]);
  return (
    <>
      <PageHeading
        title="Job applications"
        description="Keep track of roles you are exploring and the next step in each application."
      />
      <ApplicationList initialApplications={applications.data ?? []} resumes={resumes.data ?? []} jobs={jobs.data ?? []} loadError={Boolean(applications.error || resumes.error || jobs.error)} />
    </>
  );
}
