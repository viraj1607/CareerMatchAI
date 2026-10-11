import { InterviewPrepSelector } from "@/components/interview-prep-selector";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { requireUser } from "@/lib/supabase/server";

const preparationSteps = [
  { icon: "briefcase" as const, title: "Choose a role", detail: "Start from a saved opportunity or provide a job description." },
  { icon: "file" as const, title: "Add your experience", detail: "Connect the resume you plan to discuss." },
  { icon: "message" as const, title: "Prepare with context", detail: "Build practice around the role and your background." },
];

export default async function InterviewsPage() {
  const { supabase } = await requireUser();
  const { data: applications } = await supabase.from("job_applications").select("id,job_title,company_name").order("updated_at", { ascending: false });
  return (
    <>
      <PageHeading
        title="Interview preparation"
        description="Prepare for a conversation with a clearer view of the role and the experience you want to highlight."
      />

      <div className="mb-8 flex items-start gap-3 rounded-md border border-[#dce6ed] bg-[#f3f8fb] p-4 text-sm text-[#435e72]">
        <Icon name="info" size={18} />
        <p className="leading-6">Interview practice is not available yet. This page previews the preparation flow without generating questions or answers.</p>
      </div>

      <section aria-labelledby="prep-flow-heading" className="mb-9">
        <h2 id="prep-flow-heading" className="mb-4 text-base font-semibold text-[#25372d]">A role-specific preparation flow</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {preparationSteps.map((step, index) => (
            <div key={step.title} className="rounded-md border border-[#e0e8e2] bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-md bg-[#eff5f1] text-[#36745a]"><Icon name={step.icon} size={18} /></span>
                <span className="font-mono text-xs text-[#89958d]">0{index + 1}</span>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-[#304238]">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#65756b]">{step.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <InterviewPrepSelector applications={applications ?? []} />
    </>
  );
}
