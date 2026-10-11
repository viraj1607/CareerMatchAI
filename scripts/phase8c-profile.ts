/** Offline lab measurements; never fetches, authenticates or calls providers. */
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { performance } from "node:perf_hooks";
import { resumeContentSchema, resumeContentToText } from "../src/lib/resume-editor";
import { editableJobDescriptionAnalysisSchema, analyzeJobDescription } from "../src/lib/job-description-analysis";
import { analyzeResumeMatch } from "../src/lib/resume-job-matcher";
import { generateResumeExport } from "../src/lib/resume-export.server";
import { extractResumeText } from "../src/lib/resume-document-parser";

async function main() {
  const mode = process.argv[2];
  if (mode !== "before" && mode !== "after") throw new Error("Choose before/after");
  const content = resumeContentSchema.parse(JSON.parse(readFileSync("tests/fixtures/phase8b/resume.json", "utf8")));
  const job = editableJobDescriptionAnalysisSchema.parse(JSON.parse(readFileSync("tests/fixtures/phase8b/reviewed-job.json", "utf8")));
  const text = resumeContentToText(content);
  const posting = readFileSync("tests/fixtures/phase8b/job-description.txt", "utf8");
  const timings: Record<string, unknown> = {};
  async function measure(name: string, action: () => unknown, samples = 15) {
    await action(); // Warm up; report warm lab timings, not cold request latency.
    const values = [];
    for (let i = 0; i < samples; i++) { const start = performance.now(); await action(); values.push(performance.now() - start); }
    values.sort((a, b) => a - b);
    timings[name] = { samples, medianMs: +values[Math.floor(samples / 2)].toFixed(3), p95Ms: +values[Math.ceil(samples * .95) - 1].toFixed(3) };
  }
  await measure("jobParsing", () => analyzeJobDescription(posting));
  await measure("matching", () => analyzeResumeMatch(text, job));
  for (const format of ["pdf", "docx"] as const) {
    const bytes = readFileSync(`tests/fixtures/phase8b/resume.${format}`);
    await measure(`${format}Extraction`, () => extractResumeText(bytes, format), 5);
    await measure(`${format}Export`, () => generateResumeExport(content, format), 5);
  }
  const bundles: Record<string, unknown> = {};
  for (const route of ["page", "analyze/page", "editor/page", "resumes/page", "applications/page"]) {
    const context = { globalThis: {} as Record<string, Record<string, { clientModules: Record<string, { chunks: string[] }> }>> };
    runInNewContext(readFileSync(`.next/server/app/(workspace)/${route}_client-reference-manifest.js`, "utf8"), context);
    const manifest = Object.values(context.globalThis.__RSC_MANIFEST)[0];
    const chunks = [...new Set(Object.values(manifest.clientModules).flatMap(m => m.chunks).filter(p => p.startsWith("static/chunks/")))];
    let rawBytes = 0, gzipBytes = 0;
    for (const path of chunks) { const bytes = readFileSync(`.next/${path}`); rawBytes += bytes.length; gzipBytes += gzipSync(bytes).length; }
    bundles[route] = { chunkCount: chunks.length, rawBytes, gzipBytes };
  }
  writeFileSync(`docs/PHASE_8C_${mode.toUpperCase()}_METRICS.json`, JSON.stringify({ runtime: process.version, mode, conditions: "warm offline fictional fixture; 15 pure/5 document samples; client-reference chunk union, gzip estimate not measured network transfer", timings, bundles, providerRequests: 0, databaseRequests: 0 }, null, 2) + "\n");
  console.log(JSON.stringify({ mode, timings, bundles }));
}
main().catch(() => { console.error("Offline profile failed; no network requests"); process.exitCode = 1; });
