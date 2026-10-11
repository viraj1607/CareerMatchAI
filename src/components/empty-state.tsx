import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-[#eef4f0] text-[#36745a]">
        <Icon name={icon} size={21} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-[#25362d]">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-[#718078]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
