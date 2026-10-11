import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { isStrongEnoughPassword, isValidEmail, safeInternalPath, validatedHttpUrl } from "../src/lib/auth-validation";
import { runAuthWorkflow, runSignOut, type AuthDriver } from "../src/lib/auth-workflow";
import { savedDataQuotaMessage } from "../src/lib/saved-data-errors";

test("recognized record quota provides actionable guidance without retry advice", () => {
  const message = savedDataQuotaMessage({ code: "23514", message: "Account record quota exceeded" });
  assert.match(message ?? "", /200 saved-item limit/);
  assert.match(message ?? "", /resumes, jobs, analyses and applications/);
  assert.match(message ?? "", /text and edits are still available/);
  assert.doesNotMatch(message ?? "", /retry|23514/);
});

test("storage quota is distinguished from record quota", () => {
  const message = savedDataQuotaMessage({ code: "23514", message: "Account saved-data quota exceeded" });
  assert.match(message ?? "", /storage is full/);
  assert.doesNotMatch(message ?? "", /200/);
});

test("HTTP 400 and unrelated constraints never imply account quota", () => {
  for (const error of [null, undefined, "Account record quota exceeded", { status: 400 }, { code: "23514", message: "content size constraint" }, { code: "42501", message: "Account record quota exceeded" }, { message: "Account record quota exceeded" }]) {
    assert.equal(savedDataQuotaMessage(error), null);
  }
});

test("unknown database errors cannot leak diagnostic secrets through quota mapping", () => {
  assert.equal(savedDataQuotaMessage({ code: "23514", message: "internal fictional secret-key stack diagnostic", details: "fictional session token" }), null);
});

const authValues = { email: "candidate@example.ca", password: "fictional-password-42", displayName: "Fictional Candidate", redirectTo: "/auth/callback", resetRedirectTo: "/auth/update-password" };

test("auth input validation rejects malformed email and short password", () => {
  assert.equal(isValidEmail("person@example.ca"), true);
  assert.equal(isValidEmail("no-at-sign"), false);
  assert.equal(isStrongEnoughPassword("123456789"), false);
  assert.equal(isStrongEnoughPassword("fictional-password-42"), true);
});

test("auth return paths stay on the application origin", () => {
  assert.equal(safeInternalPath("/saved-analyses?tab=latest"), "/saved-analyses?tab=latest");
  for (const value of ["https://attacker.example", "//attacker.example", "/\\attacker.example", "\\\\attacker.example"]) {
    assert.equal(safeInternalPath(value), "/");
  }
});

test("application URLs allow only http and https", () => {
  assert.equal(validatedHttpUrl("https://jobs.example.ca/123"), "https://jobs.example.ca/123");
  assert.equal(validatedHttpUrl("javascript:alert(1)"), null);
  assert.equal(validatedHttpUrl("not a URL"), null);
});

test("mocked registration returns confirmation or a signed-in result from Supabase's session", async () => {
  const calls: string[] = [];
  const driver: AuthDriver = {
    signIn: async () => { calls.push("sign-in"); return { error: false }; },
    signUp: async (_email, _password, _name, callback) => { calls.push(callback); return { error: false, session: false }; },
    resetPassword: async () => { calls.push("reset"); return { error: false }; },
  };
  assert.equal(await runAuthWorkflow("signup", authValues, driver), "confirmation-sent");
  assert.deepEqual(calls, [authValues.redirectTo]);
  assert.equal(await runAuthWorkflow("signup", authValues, { ...driver, signUp: async () => ({ error: false, session: true }) }), "signed-in");
});

test("mocked sign-in success, invalid credentials, expired sessions, and sign-out failures are handled", async () => {
  const driver: AuthDriver = {
    signIn: async () => ({ error: false }), signUp: async () => ({ error: false }), resetPassword: async () => ({ error: false }),
  };
  assert.equal(await runAuthWorkflow("signin", authValues, driver), "signed-in");
  assert.equal(await runAuthWorkflow("signin", authValues, { ...driver, signIn: async () => ({ error: true }) }), "failed");
  assert.equal(await runAuthWorkflow("signin", authValues, { ...driver, signIn: async () => { throw new Error("expired session"); } }), "failed");
  assert.equal(await runSignOut(async () => true), true);
  assert.equal(await runSignOut(async () => false), false);
  assert.equal(await runSignOut(async () => { throw new Error("network"); }), false);
});

test("password recovery response is non-enumerating and validates input before provider call", async () => {
  let called = false;
  const driver: AuthDriver = { signIn: async () => ({ error: false }), signUp: async () => ({ error: false }), resetPassword: async () => { called = true; return { error: false }; } };
  assert.equal(await runAuthWorkflow("forgot", { ...authValues, email: "bad" }, driver), "invalid-email");
  assert.equal(called, false);
  assert.equal(await runAuthWorkflow("forgot", authValues, driver), "reset-sent");
  assert.equal(called, true);
});

test("every private database table enables owner RLS and CRUD policies", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202610090001_phase7_user_data.sql", import.meta.url), "utf8");
  for (const table of ["profiles", "resumes", "job_descriptions", "match_analyses", "job_applications"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS`);
    if (table === "profiles") {
      assert.match(sql, /profiles select own[\s\S]*?using \(\(select auth\.uid\(\)\) = id\)/i);
      assert.match(sql, /profiles update own[\s\S]*?using \(\(select auth\.uid\(\)\) = id\) with check \(\(select auth\.uid\(\)\) = id\)/i);
      continue;
    }
    for (const operation of ["select", "insert", "update", "delete"]) {
      assert.match(sql, new RegExp(`policy ".*" on public\\.${table} for ${operation} to authenticated`, "i"), `${table} needs authenticated ${operation} policy`);
    }
  }
  assert.match(sql, /foreign key \(resume_id, user_id\) references public\.resumes\(id, user_id\)/i);
  assert.match(sql, /foreign key \(job_description_id, user_id\) references public\.job_descriptions\(id, user_id\)/i);
  assert.match(sql, /delete_my_account[\s\S]*?caller_id uuid := auth\.uid\(\)[\s\S]*?delete from auth\.users where id = caller_id/i);
  assert.match(sql, /revoke all on function public\.delete_my_account\(\) from public, anon[\s\S]*?grant execute on function public\.delete_my_account\(\) to authenticated/i);
  assert.match(sql, /mark_analyses_stale_for_resume/);
  assert.match(sql, /mark_analyses_stale_for_job/);
});

test("browser-facing sources and examples contain no service-role key", async () => {
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  const files = ["../src/lib/supabase/client.ts", "../src/components/auth-form.tsx", "../src/components/resume-editor.tsx", "../src/components/application-list.tsx"];
  assert.match(ignore, /^\.env\*/m);
  assert.equal(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key/.test(example), true);
  assert.equal(/GEMINI_API_KEY=your_server_side_gemini_api_key/.test(example), true);
  assert.equal(/\b(?:AIza[\w-]{30,}|sb_secret_[\w-]+|sb_publishable_[\w-]+)/.test(example), false);
  assert.equal(/service[_-]?role/i.test(example), false);
  for (const file of files) assert.equal(/SUPABASE_SERVICE_ROLE|service_role/i.test(await readFile(new URL(file, import.meta.url), "utf8")), false, file);
});

test("security migrations add an auth-bound shared Gemini limiter and safe account quotas", async () => {
  const rate = await readFile(new URL("../supabase/migrations/202610100001_gemini_rate_limits.sql", import.meta.url), "utf8");
  const quota = await readFile(new URL("../supabase/migrations/202610100002_private_data_limits.sql", import.meta.url), "utf8");
  assert.match(rate, /alter table public\.gemini_rate_limit_buckets enable row level security/i);
  assert.match(rate, /revoke all on public\.gemini_rate_limit_buckets from public, anon, authenticated/i);
  assert.match(rate, /caller_id uuid := auth\.uid\(\)/i);
  assert.match(rate, /least\(greatest\(coalesce\(p_limit, 1\), 1\), hard_limit\)/i);
  assert.match(rate, /grant execute on function public\.consume_gemini_rate_limit\(text, integer\) to authenticated/i);
  assert.equal(/p_user_id|user_id\s*,\s*p_scope/i.test(rate), false);
  assert.match(quota, /content::text\) <= 524288\) not valid/i);
  assert.match(quota, /account record quota exceeded/i);
  assert.match(quota, /account saved-data quota exceeded/i);
  assert.match(quota, /pg_advisory|for update/i);
});

test("workspace layout uses a server-side user check before rendering protected pages", async () => {
  const layout = await readFile(new URL("../src/app/(workspace)/layout.tsx", import.meta.url), "utf8");
  const serverClient = await readFile(new URL("../src/lib/supabase/server.ts", import.meta.url), "utf8");
  const sessionClient = await readFile(new URL("../src/lib/supabase/session.server.ts", import.meta.url), "utf8");
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(layout, /await requireUser\(\)/);
  assert.match(serverClient, /getAuthenticatedContext/);
  assert.match(sessionClient, /supabase\.auth\.getUser\(\)/);
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/);
});
