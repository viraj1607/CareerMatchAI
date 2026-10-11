import { PageHeading } from "@/components/page-heading";
import { SavedAnalysisList } from "@/components/saved-analysis-list";
import { requireUser } from "@/lib/supabase/server";

export default async function SavedAnalysesPage() {
  const { supabase } = await requireUser();
  const [jobs, analyses] = await Promise.all([
    supabase.from("job_descriptions").select("id,job_title,company_name,original_description,created_at").order("updated_at", { ascending: false }),
    supabase.from("match_analyses").select("id,deterministic_score,deterministic_results,ai_contextual_analysis,is_stale,analyzed_at,job_description_id,resume_id,job_descriptions(job_title,company_name),resumes(name)").order("analyzed_at", { ascending: false }),
  ]);
  return <><PageHeading title="Saved analyses" description="Reopen saved job descriptions, review prior deterministic comparisons, and rerun a match when its inputs change." /><SavedAnalysisList initialJobs={jobs.data ?? []} initialAnalyses={analyses.data ?? []} loadError={Boolean(jobs.error || analyses.error)} /></>;
}
