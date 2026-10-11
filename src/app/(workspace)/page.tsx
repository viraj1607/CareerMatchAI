import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeading, SectionHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/application-status";

type RecentAnalysis = {
  id: string;
  deterministic_score: number | null;
  analyzed_at: string;
  is_stale: boolean;
  job_descriptions: { job_title: string; company_name: string | null } | Array<{ job_title: string; company_name: string | null }> | null;
};

type RecentApplication = {
  id: string;
  job_title: string;
  company_name: string;
  status: ApplicationStatus;
  application_date: string | null;
};

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const [resumes, jobs, analyses, applications, recentAnalyses, recentApplications] = await Promise.all([
    supabase.from("resumes").select("id", { count: "exact", head: true }),
    supabase.from("job_descriptions").select("id", { count: "exact", head: true }),
    supabase.from("match_analyses").select("id", { count: "exact", head: true }),
    supabase.from("job_applications").select("id", { count: "exact", head: true }),
    supabase.from("match_analyses").select("id,deterministic_score,analyzed_at,is_stale,job_descriptions(job_title,company_name)").order("analyzed_at", { ascending: false }).limit(4),
    supabase.from("job_applications").select("id,job_title,company_name,status,application_date").order("updated_at", { ascending: false }).limit(4),
  ]);
  const failed = Boolean(resumes.error || jobs.error || analyses.error || applications.error || recentAnalyses.error || recentApplications.error);
  const recentAnalysisRows = (recentAnalyses.data ?? []) as unknown as RecentAnalysis[];
  const recentApplicationRows = (recentApplications.data ?? []) as unknown as RecentApplication[];
  const isNewWorkspace = !failed && !resumes.count && !jobs.count && !analyses.count && !applications.count;
  const metrics = [
    { label: "Resumes", value: resumes.error ? "—" : resumes.count ?? 0, detail: "Saved privately", icon: "file" as const, href: "/resumes" },
    { label: "Saved jobs", value: jobs.error ? "—" : jobs.count ?? 0, detail: "Reviewed requirements", icon: "briefcase" as const, href: "/saved-analyses" },
    { label: "Resume analyses", value: analyses.error ? "—" : analyses.count ?? 0, detail: "Saved comparisons", icon: "scan" as const, href: "/saved-analyses" },
    { label: "Job applications", value: applications.error ? "—" : applications.count ?? 0, detail: "Tracked roles", icon: "briefcase" as const, href: "/applications" },
  ];
  return <>
    <PageHeading title="Dashboard" description="Your resumes, comparisons, and job search at a glance." action={!isNewWorkspace ? <Link href="/analyze" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#176b50] px-4 text-sm font-semibold text-white hover:bg-[#12583f]"><Icon name="scan" size={17} />Analyze resume</Link> : undefined} />
    {failed ? <p role="alert" className="mb-4 rounded border border-[#efc7c1] bg-[#fff5f3] p-3 text-sm text-[#963d35]">Some saved activity could not be loaded. Check your connection and refresh. Your saved items have not been changed.</p> : null}
    <section aria-label="Workspace overview" className="grid gap-px overflow-hidden rounded-md border border-[#e0e8e2] bg-[#e0e8e2] sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <Link key={metric.label} href={metric.href} className="flex min-h-20 items-center gap-3 bg-white px-4 py-3 hover:bg-[#fbfcfb] sm:px-5"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#eff5f1] text-[#36745a]"><Icon name={metric.icon} size={18} /></span><span className="min-w-0"><span className="block text-xl font-semibold tabular-nums leading-tight text-[#1e3026]">{metric.value}</span><span className="mt-1 block truncate text-xs text-[#68766e]">{metric.label}</span></span></Link>)}</section>
    {isNewWorkspace ? <section className="mt-8 flex flex-col gap-4 rounded-md border border-[#dce7df] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 className="text-base font-semibold text-[#23342b]">Start with a resume comparison</h2><p className="mt-1 text-sm text-[#68766e]">Add a resume and a job description to see how your experience lines up.</p></div><Link href="/analyze" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[#cbd9d0] px-4 text-sm font-semibold text-[#176b50] hover:bg-[#f5f8f6]">Analyze resume <Icon name="arrow" size={16} /></Link></section> : null}
    <section className="mt-8 grid gap-8 xl:grid-cols-2">
      <div>
        <SectionHeading title="Recent analyses" action={<Link href="/saved-analyses" className="inline-flex items-center gap-1 text-sm font-medium text-[#176b50]">View all <Icon name="arrow" size={16} /></Link>} />
        <div className="overflow-hidden rounded-md border border-[#e0e8e2] bg-white">{recentAnalysisRows.length ? recentAnalysisRows.map((analysis, index) => { const job = Array.isArray(analysis.job_descriptions) ? analysis.job_descriptions[0] : analysis.job_descriptions; return <div key={analysis.id} className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${index ? "border-t border-[#edf1ee]" : ""}`}><div><p className="text-sm font-medium text-[#26372d]">{job?.job_title ?? "Saved job analysis"}</p><p className="mt-1 text-xs text-[#65756b]">{job?.company_name || "Company not provided"} · {new Date(analysis.analyzed_at).toLocaleDateString("en-CA")}</p></div><span className="text-sm font-semibold text-[#176b50]">{analysis.deterministic_score == null ? "Score unavailable" : `${analysis.deterministic_score}% match`}{analysis.is_stale ? " · potentially outdated" : ""}</span></div>; }) : <p className="px-5 py-6 text-sm text-[#65756b]">No saved analyses yet.</p>}</div>
      </div>
      <div>
        <SectionHeading title="Job applications" action={<Link href="/applications" className="inline-flex items-center gap-1 text-sm font-medium text-[#176b50]">View all <Icon name="arrow" size={16} /></Link>} />
        <div className="overflow-hidden rounded-md border border-[#e0e8e2] bg-white">{recentApplicationRows.length ? recentApplicationRows.map((application, index) => <div key={application.id} className={`flex items-center justify-between gap-4 px-5 py-4 ${index ? "border-t border-[#edf1ee]" : ""}`}><div className="min-w-0"><p className="truncate text-sm font-medium text-[#26372d]">{application.job_title}</p><p className="mt-1 truncate text-xs text-[#65756b]">{application.company_name} · {application.application_date ?? "Date not set"}</p></div><StatusBadge status={application.status} /></div>) : <p className="px-5 py-6 text-sm text-[#65756b]">No applications yet.</p>}</div>
      </div>
    </section>
  </>;
}
