"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";

const primaryLinks: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/analyze", label: "Analyze resume", icon: "scan" },
  { href: "/editor", label: "Resume editor", icon: "file" },
  { href: "/resumes", label: "My resumes", icon: "file" },
  { href: "/saved-analyses", label: "Saved analyses", icon: "scan" },
  { href: "/applications", label: "Job applications", icon: "briefcase" },
  { href: "/interviews", label: "Interview preparation", icon: "message" },
];

function isCurrentPath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-[72px] items-center gap-3 border-b border-[#e7ece8] px-5">
        <span className="flex size-9 items-center justify-center rounded-md bg-[#176b50] text-sm font-semibold text-white">
          CM
        </span>
        <div>
          <p className="text-sm font-semibold text-[#1e3026]">CareerMatch AI</p>
          <p className="mt-0.5 text-[11px] text-[#65756b]">Career workspace</p>
        </div>
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase text-[#88948d]">Workspace</p>
        <ul className="space-y-1">
          {primaryLinks.map(({ href, label, icon }) => {
            const active = isCurrentPath(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50] ${
                    active
                      ? "bg-[#edf5f0] font-medium text-[#176b50]"
                      : "text-[#58675e] hover:bg-[#f5f7f5] hover:text-[#24382c]"
                  }`}
                >
                  <Icon name={icon} size={18} />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mb-2 mt-8 px-3 text-[10px] font-semibold uppercase text-[#88948d]">Account</p>
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={isCurrentPath(pathname, "/settings") ? "page" : undefined}
          className={`flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50] ${
            isCurrentPath(pathname, "/settings")
              ? "bg-[#edf5f0] font-medium text-[#176b50]"
              : "text-[#58675e] hover:bg-[#f5f7f5] hover:text-[#24382c]"
          }`}
        >
          <Icon name="settings" size={18} />
          <span>Settings</span>
        </Link>
      </nav>

      <div className="border-t border-[#e7ece8] px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-medium text-[#53665a]">
          <span className="size-2 rounded-full bg-[#3b8a67]" />
          Canada job market
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[#89958e]">Your saved work is private to your account.</p>
      </div>
    </div>
  );
}
