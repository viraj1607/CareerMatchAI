import type { ReactNode } from "react";

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-[#e1e7e3] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold leading-tight text-[#1c2b24]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68766e]">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-[#23342b]">{title}</h2>
        {detail ? <p className="mt-1 text-sm text-[#78847d]">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}
