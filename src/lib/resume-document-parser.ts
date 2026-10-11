import "server-only";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import type { ResumeDocumentType, ResumeParseErrorCode } from "@/lib/resume-upload-types";

export class ResumeDocumentError extends Error {
  constructor(readonly code: ResumeParseErrorCode, message: string) {
    super(message);
    this.name = "ResumeDocumentError";
  }
}

export type ResumeDocumentLimits = { maxPages: number; maxTextChars: number; timeoutMs: number };

function configuredLimit(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

export function getResumeDocumentLimits(): ResumeDocumentLimits {
  return {
    maxPages: configuredLimit("CAREERMATCH_PDF_MAX_PAGES", 80, 200),
    maxTextChars: configuredLimit("CAREERMATCH_PDF_MAX_TEXT_CHARS", 200_000, 500_000),
    timeoutMs: configuredLimit("CAREERMATCH_PDF_TIMEOUT_MS", 10_000, 30_000),
  };
}

export function isPdfPasswordError(error: unknown): boolean {
  return error instanceof pdfjs.PasswordException || (error !== null && typeof error === "object" && "name" in error && error.name === "PasswordException");
}

function invalidDocument(): ResumeDocumentError {
  return new ResumeDocumentError("MALFORMED_DOCUMENT", "This document could not be read. Try exporting it again as a PDF or DOCX file.");
}

function validatePdf(bytes: Uint8Array): void {
  const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (!header.includes("%PDF-")) throw invalidDocument();
}

function readU16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function validateDocxContainer(bytes: Uint8Array): void {
  if (bytes.length < 22 || readU32(bytes, 0) !== 0x04034b50) throw invalidDocument();
  const min = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (readU32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw invalidDocument();
  const entryCount = readU16(bytes, eocd + 10);
  const centralSize = readU32(bytes, eocd + 12);
  const centralOffset = readU32(bytes, eocd + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff || centralOffset + centralSize > eocd) throw invalidDocument();

  const names = new Set<string>();
  let offset = centralOffset;
  let expandedBytes = 0;
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > bytes.length || readU32(bytes, offset) !== 0x02014b50) throw invalidDocument();
    const expanded = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const nameStart = offset + 46;
    if (nameStart + nameLength + extraLength + commentLength > bytes.length || expanded === 0xffffffff) throw invalidDocument();
    names.add(new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength)));
    expandedBytes += expanded;
    if (expandedBytes > 20 * 1024 * 1024) throw invalidDocument();
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) throw invalidDocument();
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\u00a0 ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(bytes: Uint8Array, limits: ResumeDocumentLimits): Promise<string> {
  validatePdf(bytes);
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const startedAt = Date.now();
  const assertWithinDeadline = () => {
    if (Date.now() - startedAt >= limits.timeoutMs) {
      timedOut = true;
      throw new ResumeDocumentError("PROCESSING_TIMEOUT", "This PDF took too long to process. Try exporting it again or choosing a smaller file.");
    }
  };
  try {
    loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, verbosity: 0 });
    const processing = async () => {
      assertWithinDeadline();
      const document = await loadingTask!.promise;
      assertWithinDeadline();
      if (document.numPages > limits.maxPages) throw new ResumeDocumentError("TOO_MANY_PAGES", `This PDF has too many pages. Choose a document with ${limits.maxPages} pages or fewer.`);
      const pages: string[] = [];
      let extractedChars = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        assertWithinDeadline();
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        assertWithinDeadline();
        let line = "";
        const lines: string[] = [];
        for (const item of content.items) {
          if (!("str" in item)) continue;
          extractedChars += item.str.length + 1;
          if (extractedChars > limits.maxTextChars) throw new ResumeDocumentError("TEXT_TOO_LARGE", "This document contains too much text to process. Choose a shorter resume.");
          line += item.str;
          if (item.hasEOL) { lines.push(line); line = ""; }
          else line += " ";
        }
        if (line.trim()) lines.push(line);
        pages.push(lines.join("\n"));
      }
      const text = normalizeExtractedText(pages.filter(Boolean).join("\n\n"));
      if (!text) throw new ResumeDocumentError("NO_SELECTABLE_TEXT", "No selectable text was found. This may be a scanned PDF; OCR support may be needed to read it.");
      if (text.length > limits.maxTextChars) throw new ResumeDocumentError("TEXT_TOO_LARGE", "This document contains too much text to process. Choose a shorter resume.");
      return text;
    };
    const expired = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        void loadingTask?.destroy();
        reject(new ResumeDocumentError("PROCESSING_TIMEOUT", "This PDF took too long to process. Try exporting it again or choosing a smaller file."));
      }, Math.max(1, limits.timeoutMs));
    });
    return await Promise.race([processing(), expired]);
  } catch (error) {
    if (error instanceof ResumeDocumentError) throw error;
    if (timedOut) throw new ResumeDocumentError("PROCESSING_TIMEOUT", "This PDF took too long to process. Try exporting it again or choosing a smaller file.");
    if (isPdfPasswordError(error)) {
      throw new ResumeDocumentError("PASSWORD_PROTECTED", "This PDF is password-protected. Remove its password and try again.");
    }
    throw invalidDocument();
  } finally {
    if (timeout) clearTimeout(timeout);
    await loadingTask?.destroy().catch(() => undefined);
  }
}

async function extractDocx(bytes: Uint8Array, limits: ResumeDocumentLimits): Promise<string> {
  validateDocxContainer(bytes);
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = normalizeExtractedText(result.value);
    if (!text) throw new ResumeDocumentError("EMPTY_DOCUMENT", "This DOCX file does not contain readable text.");
    if (text.length > limits.maxTextChars) throw new ResumeDocumentError("TEXT_TOO_LARGE", "This document contains too much text to process. Choose a shorter resume.");
    return text;
  } catch (error) {
    if (error instanceof ResumeDocumentError) throw error;
    throw invalidDocument();
  }
}

export async function extractResumeText(bytes: Uint8Array, type: ResumeDocumentType, overrides: Partial<ResumeDocumentLimits> = {}): Promise<string> {
  const limits = { ...getResumeDocumentLimits(), ...overrides };
  return type === "pdf" ? extractPdf(bytes, limits) : extractDocx(bytes, limits);
}

export function getResumeDocumentType(fileName: string): ResumeDocumentType | null {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension === "pdf" || extension === "docx" ? extension : null;
}

export function validateResumeContent(bytes: Uint8Array, type: ResumeDocumentType): void {
  if (type === "pdf") validatePdf(bytes);
  else validateDocxContainer(bytes);
}
