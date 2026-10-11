import type { ApplicationStatus } from "@/lib/application-status";

const styles: Record<ApplicationStatus, string> = {
  Interested: "bg-[#f1f4f2] text-[#59685f]",
  Preparing: "bg-[#fff6e6] text-[#82612a]",
  Applied: "bg-[#eaf2fb] text-[#3c6389]",
  Interviewing: "bg-[#edf5ee] text-[#3c704d]",
  Offer: "bg-[#edf5ee] text-[#28633c]",
  Rejected: "bg-[#f8eeeb] text-[#8c574c]",
  Withdrawn: "bg-[#f1f4f2] text-[#59685f]",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${styles[status]}`}>{status}</span>;
}
