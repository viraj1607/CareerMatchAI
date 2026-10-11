import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve PDF.js's adjacent worker module when loading the server parser.
  serverExternalPackages: ["pdfjs-dist"],
  // PDF.js dynamically imports this adjacent worker; static tracing misses it.
  outputFileTracingIncludes: {
    "/api/resume/parse": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
