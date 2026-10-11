import { NextResponse, type NextRequest } from "next/server";
import { getMaxResumeSizeBytes } from "@/lib/resume-upload-config.server";
import { extractResumeText, getResumeDocumentType } from "@/lib/resume-document-parser";
import { formatFileSize } from "@/lib/resume-upload-policy";
import { ResumeDocumentError } from "@/lib/resume-document-parser";
import type { ResumeParseErrorCode } from "@/lib/resume-upload-types";
import { acquireRequestSlot } from "@/lib/request-limits.server";
import { getAuthenticatedContext } from "@/lib/supabase/session.server";
import { getSupabaseConfig } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 30;

function errorResponse(code: ResumeParseErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

function safeFileName(request: NextRequest): string {
  const value = request.headers.get("x-resume-file-name");
  if (!value || value.length > 512) return "";
  try {
    return decodeURIComponent(value).split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  } catch {
    return "";
  }
}

async function readLimitedBody(request: NextRequest, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) throw new Error("INVALID_REQUEST");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 10_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new Error("REQUEST_TIMEOUT");
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("FILE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function parseResume(request: NextRequest) {
  const maxBytes = getMaxResumeSizeBytes();
  const fileName = safeFileName(request);
  const type = getResumeDocumentType(fileName);
  if (!fileName || !type) return errorResponse("UNSUPPORTED_TYPE", "Choose a PDF or DOCX file.", 415);
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/octet-stream") return errorResponse("INVALID_REQUEST", "The upload request could not be read. Please select the file again.", 400);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return errorResponse("FILE_TOO_LARGE", `Choose a file smaller than ${formatFileSize(maxBytes)}.`, 413);
  }

  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBody(request, maxBytes);
  } catch (error) {
    if (error instanceof Error && error.message === "FILE_TOO_LARGE") return errorResponse("FILE_TOO_LARGE", `Choose a file smaller than ${formatFileSize(maxBytes)}.`, 413);
    if (error instanceof Error && error.message === "REQUEST_TIMEOUT") return errorResponse("INVALID_REQUEST", "The upload took too long. Please retry with a stable connection.", 408);
    return errorResponse("INVALID_REQUEST", "The upload request could not be read. Please select the file again.", 400);
  }
  if (!bytes.length) return errorResponse("INVALID_REQUEST", "The selected file is empty.", 400);

  try {
    const text = await extractResumeText(bytes, type);
    return NextResponse.json({ fileName, fileType: type, fileSizeBytes: bytes.byteLength, text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ResumeDocumentError) {
      const status = error.code === "PASSWORD_PROTECTED" ? 422 : error.code === "UNSUPPORTED_TYPE" ? 415 : 422;
      return errorResponse(error.code, error.message, status);
    }
    return errorResponse("MALFORMED_DOCUMENT", "This document could not be read. Try exporting it again as a PDF or DOCX file.", 422);
  }
}

export async function POST(request: NextRequest) {
  if (!getSupabaseConfig()) return errorResponse("INVALID_REQUEST", "Resume processing is unavailable until account authentication is configured.", 503);
  const context = await getAuthenticatedContext();
  if (!context) return errorResponse("INVALID_REQUEST", "Sign in to process a resume.", 401);
  const release = acquireRequestSlot("parse");
  if (!release) return NextResponse.json({ error: { code: "RATE_LIMIT", message: "Document processing is busy. Please retry shortly." } }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "1" } });
  try {
    return await parseResume(request);
  } finally {
    release();
  }
}
