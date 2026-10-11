import { DEFAULT_MAX_RESUME_SIZE_BYTES } from "@/lib/resume-upload-policy";

export function getMaxResumeSizeBytes(): number {
  const configured = process.env.CAREERMATCH_RESUME_MAX_BYTES;
  if (!configured) return DEFAULT_MAX_RESUME_SIZE_BYTES;
  const value = Number(configured);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_MAX_RESUME_SIZE_BYTES;
}
