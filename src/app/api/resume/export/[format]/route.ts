import { NextResponse, type NextRequest } from "next/server";
import { generateResumeExport, ResumeExportError } from "@/lib/resume-export.server";
import { acquireRequestSlot } from "@/lib/request-limits.server";
import { readBoundedBody } from "@/lib/request-limits.server";
import { getAuthenticatedContext } from "@/lib/supabase/session.server";
import { getSupabaseConfig } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
const MAX_EXPORT_BYTES = 512_000;

async function exportResume(request: NextRequest, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;
  if (format !== "pdf" && format !== "docx") return NextResponse.json({ error: { code: "UNSUPPORTED_FORMAT", message: "Choose PDF or DOCX export." } }, { status: 415 });
  let raw: string;
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("BAD_TYPE");
    raw = await readBoundedBody(request, MAX_EXPORT_BYTES);
  }
  catch (error) {
    const code = error instanceof Error ? error.message : "BAD_BODY";
    const tooLarge = code === "TOO_LARGE";
    const timedOut = code === "TIMEOUT";
    const wrongType = code === "BAD_TYPE";
    return NextResponse.json({ error: { code: tooLarge ? "TOO_LARGE" : timedOut ? "REQUEST_TIMEOUT" : wrongType ? "BAD_TYPE" : "BAD_REQUEST", message: tooLarge ? "This resume is too large to export." : timedOut ? "The export request took too long to upload." : wrongType ? "Submit resume content as JSON." : "The export request could not be read." } }, { status: tooLarge ? 413 : timedOut ? 408 : wrongType ? 415 : 400, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: { code: "INVALID_CONTENT", message: "The resume content could not be read." } }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  try {
    const result = await generateResumeExport(body, format);
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ResumeExportError) {
      const empty = error.code === "EMPTY_RESUME";
      const status = error.code === "EXPORT_FAILED" ? 500 : 422;
      return NextResponse.json({ error: { code: error.code, message: empty ? "Add resume content before exporting." : error.code === "INVALID_CONTENT" ? "Some resume fields are invalid or too long. Review your content and try again." : "The resume could not be exported. Your editor content is unchanged; please try again." } }, { status, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: { code: "EXPORT_FAILED", message: "The resume could not be exported. Your editor content is unchanged; please try again." } }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ format: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  if (!getSupabaseConfig()) return NextResponse.json({ error: { code: "AUTH_UNAVAILABLE", message: "Resume export is unavailable until account authentication is configured." } }, { status: 503, headers });
  if (!(await getAuthenticatedContext())) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to export a resume." } }, { status: 401, headers });
  const release = acquireRequestSlot("export");
  if (!release) return NextResponse.json({ error: { code: "RATE_LIMIT", message: "Document export is busy. Please retry shortly." } }, { status: 429, headers: { ...headers, "Retry-After": "1" } });
  try {
    return await exportResume(request, context);
  } finally {
    release();
  }
}
