/** Non-Gemini HTTP checks only: no saved-record writes, RPCs or provider routes. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { extractResumeText } from "../src/lib/resume-document-parser";

async function main() {
  process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  assert.equal(new URL(url).hostname, "wxpdchlzlejsfdhabpxy.supabase.co");
  const state = JSON.parse(readFileSync(".env.qa-state.local", "utf8"));
  assert.equal(state.project, "wxpdchlzlejsfdhabpxy");
  const origin = process.env.PHASE8B_LOCAL_ORIGIN ?? "http://127.0.0.1:3100";
  assert(["http://127.0.0.1:3100", "http://127.0.0.1:3101"].includes(origin));
  const account = state.accounts[0];
  const jar = new Map<string, string>();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => Array.from(jar, ([name, value]) => ({ name, value })), setAll: items => { for (const item of items) jar.set(item.name, item.value); } },
  });
  const checks: { name: string; status: number }[] = [];
  let phase = "login";
  let failure = false;
  let lastHttpStatus: number | null = null;
  async function request(path: string, init: RequestInit = {}, authenticated = true) {
    assert(path.startsWith("/api/resume/") || ["/resumes", "/saved-analyses", "/applications"].includes(path));
    const headers = new Headers(init.headers);
    if (authenticated) headers.set("cookie", Array.from(jar, ([n, v]) => `${n}=${v}`).join("; "));
    lastHttpStatus = null;
    const response = await fetch(`${origin}${path}`, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
    lastHttpStatus = response.status;
    return response;
  }
  try {
    const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
    assert(!login.error && login.data.user?.id === account.id);
    for (const format of ["pdf", "docx"] as const) {
      phase = `${format} upload`;
      const bytes = readFileSync(`tests/fixtures/phase8b/resume.${format}`);
      const response = await request("/api/resume/parse", { method: "POST", headers: { "content-type": "application/octet-stream", "x-resume-file-name": `resume.${format}` }, body: new Uint8Array(bytes) });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.match(body.text, /Morgan Reed/);
      checks.push({ name: phase, status: response.status });
      phase = `${format} export`;
      const exported = await request(`/api/resume/export/${format}`, { method: "POST", headers: { "content-type": "application/json" }, body: readFileSync("tests/fixtures/phase8b/resume.json", "utf8") });
      assert.equal(exported.status, 200);
      assert.match(exported.headers.get("content-disposition") ?? "", /attachment/);
      const text = await extractResumeText(new Uint8Array(await exported.arrayBuffer()), format);
      assert.match(text, /Morgan Reed/);
      checks.push({ name: phase, status: exported.status });
    }
    for (const [name, expected] of [["unsupported.txt", 415], ["empty.pdf", 400], ["invalid.pdf", 422]] as const) {
      phase = name;
      const response = await request("/api/resume/parse", { method: "POST", headers: { "content-type": "application/octet-stream", "x-resume-file-name": name }, body: new Uint8Array(readFileSync(`tests/fixtures/phase8b/${name}`)) });
      assert.equal(response.status, expected);
      const body = await response.json();
      assert.equal(typeof body.error.message, "string");
      assert(!/stack|password|token|api.?key/i.test(body.error.message));
      checks.push({ name, status: response.status });
    }
    phase = "anonymous upload";
    const anon = await request("/api/resume/parse", { method: "POST" }, false);
    assert.equal(anon.status, 401);
    checks.push({ name: phase, status: anon.status });
    for (const path of ["/resumes", "/saved-analyses", "/applications"]) {
      phase = `authenticated SSR ${path}`;
      const response = await request(path);
      assert.equal(response.status, 200);
      await response.text();
      checks.push({ name: phase, status: response.status });
      phase = `anonymous ${path}`;
      const anonymous = await request(path, {}, false);
      assert([303, 307, 308].includes(anonymous.status));
      assert.match(anonymous.headers.get("location") ?? "", /auth/);
      checks.push({ name: phase, status: anonymous.status });
    }
  } catch {
    failure = true;
    console.log(`BLOCKED/FAILED HTTP check: ${phase}; details withheld; no retry`);
  } finally {
    await client.auth.signOut({ scope: "local" });
    const resultPath = origin.endsWith(":3101") ? "docs/PHASE_8B_PRODUCTION_HTTP_RESULTS.json" : "docs/PHASE_8B_HTTP_RESULTS.json";
    writeFileSync(resultPath, JSON.stringify({ status: failure ? "BLOCKED" : "PASSED", origin, evidence: "ordinary QA A session HTTP/SSR; not interactive browser", completed: checks, stoppedAt: failure ? phase : null, lastHttpStatus, databaseWrites: 0, providerRequests: 0 }, null, 2) + "\n");
  }
}
main().catch(() => { console.error("HTTP harness setup failed; private details withheld"); process.exitCode = 1; });
