import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortfolioDemo } from "@/components/portfolio-demo";
import { isPortfolioDemoEnabled } from "@/lib/portfolio-demo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CareerMatch AI | Portfolio demo",
  description: "A read-only CareerMatch AI portfolio demonstration with fictional sample content.",
};

export default function PortfolioPage() {
  if (!isPortfolioDemoEnabled()) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12 sm:px-10 lg:py-16">
      <div className="mb-10 flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">CareerMatch AI</p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">Portfolio demonstration</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            A read-only product walkthrough showing how a candidate can compare a resume with a job description.
          </p>
        </div>
        <span className="w-fit rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Read-only sample</span>
      </div>

      <aside className="mb-10 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950" role="note">
        <strong>Portfolio demo — fictional data only. Do not submit real resumes or personal information.</strong>
      </aside>

      <PortfolioDemo />
    </main>
  );
}
