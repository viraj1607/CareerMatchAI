import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve PDF.js's adjacent worker module when loading the server parser.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
