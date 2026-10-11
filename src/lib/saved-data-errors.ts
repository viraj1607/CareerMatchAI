/** Only recognized database errors become quota messages; never expose raw errors. */
export function savedDataQuotaMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: unknown; message?: unknown };
  if (value.code !== "23514") return null;
  if (value.message === "Account record quota exceeded") {
    return "You've reached the 200 saved-item limit across resumes, jobs, analyses and applications. Remove an item you no longer need before saving another. Your text and edits are still available.";
  }
  if (value.message === "Account saved-data quota exceeded") {
    return "Your account's saved-data storage is full. Remove saved items you no longer need before saving more. Your text and edits are still available.";
  }
  return null;
}
