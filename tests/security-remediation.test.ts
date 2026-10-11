import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readBoundedBody, acquireRequestSlot, configuredGeminiLimit } from "../src/lib/request-limits.server";
import { consumeGeminiLimit } from "../src/lib/gemini-rate-limit.server";
import type { createSupabaseServerClient } from "../src/lib/supabase/session.server";
import { applySecurityHeaders, makeContentSecurityPolicy } from "../src/lib/security-headers";

import { createGeminiGenerator } from "../src/lib/gemini-provider.server";
import { analyzeWithGemini, GeminiAnalysisError } from "../src/lib/gemini-analysis";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function streamRequest(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit);
}

describe("security remediation boundaries", () => {
  it("enforces chunked and understated Content-Length limits before concatenating the body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(4)); },
      cancel() { cancelled = true; },
    });
    await assert.rejects(readBoundedBody(streamRequest(body, { "content-length": "1" }), 5), /TOO_LARGE/);
    assert.equal(cancelled, true);
  });

  it("times out slow request bodies and rejects malformed UTF-8", async () => {
    const slow = new ReadableStream<Uint8Array>({
      start(controller) { setTimeout(() => { try { controller.close(); } catch { /* canceled by timeout */ } }, 40); },
    });
    await assert.rejects(readBoundedBody(streamRequest(slow), 32, 5), /TIMEOUT/);
    const invalidUtf8 = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } });
    await assert.rejects(readBoundedBody(streamRequest(invalidUtf8), 32), TypeError);
  });

  it("bounds local parser/export concurrency and releases slots idempotently", () => {
    const original = process.env.CAREERMATCH_PARSE_MAX_CONCURRENCY;
    process.env.CAREERMATCH_PARSE_MAX_CONCURRENCY = "1";
    try {
      const release = acquireRequestSlot("parse");
      assert.equal(typeof release, "function");
      assert.equal(acquireRequestSlot("parse"), null);
      release?.(); release?.();
      const released = acquireRequestSlot("parse");
      assert.equal(typeof released, "function");
      released?.();
      const cap = acquireRequestSlot("export");
      assert.equal(typeof cap, "function");
      cap?.();
    } finally {
      if (original === undefined) delete process.env.CAREERMATCH_PARSE_MAX_CONCURRENCY;
      else process.env.CAREERMATCH_PARSE_MAX_CONCURRENCY = original;
    }
  });

  it("clamps configurable Gemini request counts and fails closed when shared RPC fails", async () => {
    const original = process.env.CAREERMATCH_GEMINI_ANALYZE_LIMIT;
    process.env.CAREERMATCH_GEMINI_ANALYZE_LIMIT = "99";
    try {
      assert.equal(configuredGeminiLimit("analysis"), 5);
      const calls: unknown[] = [];
      const client = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: true, error: null }; } } as unknown as Client;
      assert.equal(await consumeGeminiLimit(client, "analysis"), "allowed");
      assert.deepEqual(calls, [["consume_gemini_rate_limit", { p_scope: "analysis", p_limit: 5 }]]);
      const failedClient = { rpc: async () => ({ data: null, error: new Error("offline") }) } as unknown as Client;
      assert.equal(await consumeGeminiLimit(failedClient, "suggestions"), "unavailable");
      const limitedClient = { rpc: async () => ({ data: false, error: null }) } as unknown as Client;
      assert.equal(await consumeGeminiLimit(limitedClient, "suggestions"), "limited");
    } finally {
      if (original === undefined) delete process.env.CAREERMATCH_GEMINI_ANALYZE_LIMIT;
      else process.env.CAREERMATCH_GEMINI_ANALYZE_LIMIT = original;
    }
  });

  it("creates a nonce CSP scoped to the configured Supabase origin and security headers", () => {
    const policy = makeContentSecurityPolicy("fictionalNonce123", "https://fictional-project.supabase.co", false);
    assert.match(policy, /script-src 'self' 'nonce-fictionalNonce123' 'strict-dynamic'/);
    assert.match(policy, /connect-src 'self' https:\/\/fictional-project\.supabase\.co wss:\/\/fictional-project\.supabase\.co/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.doesNotMatch(policy, /unsafe-eval/);
    const headers = new Headers();
    applySecurityHeaders(headers, true);
    assert.equal(headers.get("X-Frame-Options"), "DENY");
    assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(headers.get("Strict-Transport-Security") ?? "", /max-age=31536000/);
  });
});


describe("provider cancellation through the real SDK with offline transport", () => {
  it("aborts the transport at the analysis deadline without retrying", async () => {
    const originalFetch = globalThis.fetch;
    let attempts = 0;
    let observedAbort = false;
    globalThis.fetch = async (_input, init) => {
      attempts++;
      return new Promise<Response>((resolve, reject) => {
        const fallback = setTimeout(() => resolve(new Response("{}", { status: 503 })), 100);
        const abort = () => { observedAbort = true; clearTimeout(fallback); reject(new DOMException("Offline simulated abort", "AbortError")); };
        const signal = init?.signal ?? (_input instanceof Request ? _input.signal : undefined);
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    };
    try {
      await assert.rejects(analyzeWithGemini({ consent: true, resumeText: "Fictional Python work", jobDescription: "Fictional Python job", requirements: [{ id: "qa", text: "Python", category: "Technical" }] }, "fictional-offline-key", createGeminiGenerator("fictional-offline-key", "gemini-3.8-flash"), 10), (error: unknown) => error instanceof GeminiAnalysisError && error.code === "TIMEOUT");
      assert.equal(observedAbort, true);
      assert.equal(attempts, 1);
    } finally { globalThis.fetch = originalFetch; }
  });
});
