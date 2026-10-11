import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ResumeStudioProvider } from "@/components/resume-studio-provider";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <ResumeStudioProvider><AppShell>{children}</AppShell></ResumeStudioProvider>;
}
