import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareerMatch AI | Career tools for Canadian job seekers",
  description:
    "A focused workspace for Canadian job seekers to compare resumes with job descriptions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
