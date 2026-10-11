import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Gemini API routes require a verified Supabase user before handling resume data", async () => {
  for (const path of ["../src/app/api/gemini/analyze/route.ts", "../src/app/api/gemini/suggest/route.ts"]) {
    const route = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(route, /await getAuthenticatedContext\(\)/);
    assert.match(route, /status: 401/);
    assert.match(route, /Cache-Control.*no-store/);
    assert.match(route, /consumeGeminiLimit\(context\.supabase/);
    assert.doesNotMatch(route, /x-forwarded-for|new Map</);
  }
});

test("Gemini analysis applies byte and time bounds before provider work", async () => {
  const route = await readFile(new URL("../src/app/api/gemini/analyze/route.ts", import.meta.url), "utf8");
  assert.match(route, /readBoundedBody\(request, MAX_AI_REQUEST_BYTES\)/);
  assert.match(route, /timedOut \? 408/);
  const limitCall = route.indexOf('const limit = await consumeGeminiLimit');
  assert.ok(route.indexOf("await readBoundedBody") < limitCall);
  assert.ok(limitCall < route.indexOf("await analyzeWithGemini("));
});
