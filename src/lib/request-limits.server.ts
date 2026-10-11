import "server-only";

type WorkType = "parse" | "export";
type Counters = Record<WorkType, number>;
type GlobalWithCounters = typeof globalThis & { __careermatchRequestCounters?: Counters };

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export function maxConcurrentRequests(type: WorkType): number {
  return type === "parse"
    ? positiveInt(process.env.CAREERMATCH_PARSE_MAX_CONCURRENCY, 4, 16)
    : positiveInt(process.env.CAREERMATCH_EXPORT_MAX_CONCURRENCY, 4, 16);
}

export function acquireRequestSlot(type: WorkType): (() => void) | null {
  const root = globalThis as GlobalWithCounters;
  const counters = root.__careermatchRequestCounters ??= { parse: 0, export: 0 };
  if (counters[type] >= maxConcurrentRequests(type)) return null;
  counters[type] += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    counters[type] = Math.max(0, counters[type] - 1);
  };
}

export function configuredGeminiLimit(scope: "analysis" | "suggestions"): number {
  const value = scope === "analysis"
    ? process.env.CAREERMATCH_GEMINI_ANALYZE_LIMIT
    : process.env.CAREERMATCH_GEMINI_SUGGEST_LIMIT;
  return positiveInt(value, 5, 5);
}

export async function readBoundedBody(request: Request, maxBytes: number, timeoutMs = 10_000): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("TOO_LARGE");
  if (!request.body) throw new Error("BAD_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (timedOut) throw new Error("TIMEOUT");
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("TOO_LARGE");
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
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
