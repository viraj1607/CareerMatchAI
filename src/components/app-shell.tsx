"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { Icon } from "@/components/icon";
import { SignOutButton } from "@/components/sign-out-button";

const pageLabels: Record<string, string> = {
  "/": "Dashboard",
  "/analyze": "Analyze resume",
  "/editor": "Resume editor",
  "/resumes": "My resumes",
  "/saved-analyses": "Saved analyses",
  "/applications": "Job applications",
  "/interviews": "Interview preparation",
  "/settings": "Settings",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const currentLabel = pageLabels[pathname] ?? "Career workspace";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mobileMenuOpen && !dialog.open) dialog.showModal();
    if (!mobileMenuOpen && dialog.open) dialog.close();
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#23342b]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-white px-4 py-2 text-sm font-medium text-[#176b50] focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[252px] border-r border-[#e2e9e4] lg:block">
        <AppSidebar />
      </aside>

      <div className="min-h-screen lg:pl-[252px]">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#e2e9e4] bg-white/95 px-4 backdrop-blur-sm sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-haspopup="dialog"
              className="flex size-10 items-center justify-center rounded-md border border-[#dce5df] text-[#43564a] hover:bg-[#f5f8f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50] lg:hidden"
            >
              <Icon name="menu" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#26372d]">{currentLabel}</p>
              <p className="hidden text-xs text-[#65756b] sm:block">Career development workspace</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-md border border-[#e2e9e4] px-3 py-2 text-xs font-medium text-[#54645a] sm:flex">
            <Icon name="map" size={15} />
            <span>Canada</span>
          </div>
          <SignOutButton />
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-7 sm:px-7 sm:py-9 xl:px-10">
          {children}
        </main>
      </div>

        <dialog ref={dialogRef} id="mobile-navigation" aria-label="Workspace navigation" onCancel={() => setMobileMenuOpen(false)} onClose={() => setMobileMenuOpen(false)} className="fixed inset-0 m-0 h-dvh max-h-none w-[min(290px,85vw)] max-w-none border-0 bg-white p-0 shadow-xl backdrop:bg-[#17231d]/35">
          <aside className="relative h-full overflow-y-auto">
            <div className="absolute right-3 top-4 z-20">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="flex size-9 items-center justify-center rounded-md border border-[#dce5df] bg-white text-[#43564a] hover:bg-[#f5f8f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b50]"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <AppSidebar onNavigate={() => setMobileMenuOpen(false)} />
          </aside>
        </dialog>
    </div>
  );
}
