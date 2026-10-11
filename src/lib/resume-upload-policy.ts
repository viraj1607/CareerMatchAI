export const DEFAULT_MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_RESUME_EXTENSIONS = [".pdf", ".docx"] as const;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
