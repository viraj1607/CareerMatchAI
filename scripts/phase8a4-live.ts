/** Approved fictional-session tests. No admin keys, schema changes, or account deletion. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { blankResume } from "../src/lib/resume-editor";

type Row = Record<string, unknown>;
type Account = { label: string; email: string; password: string; id: string; fixtures?: Record<string, string> };
const statePath = ".env.qa-state.local";
const results: { name: string; status: string; code?: string }[] = existsSync("docs/PHASE_8A_4_LIVE_RESULTS.json") ? JSON.parse(readFileSync("docs/PHASE_8A_4_LIVE_RESULTS.json", "utf8")).results : [];
let stage = "initialization";
const saveResults = () => writeFileSync("docs/PHASE_8A_4_LIVE_RESULTS.json", JSON.stringify({ project: "wxpdchlzlejsfdhabpxy", results }, null, 2) + "\n");
function pass(name: string) { results.push({ name, status: "passed" }); console.log(`PASS: ${name}`); }

async function main() {
  process.loadEnvFile(".env.local");
  process.loadEnvFile(".env.qa.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const origin = process.env.CAREERMATCH_QA_APP_ORIGIN!;
  assert.equal(new URL(url).hostname, "wxpdchlzlejsfdhabpxy.supabase.co");
  assert(key.startsWith("sb_publishable_"));
  assert.equal(origin, "http://127.0.0.1:3100");
  const state: { project: string; accounts: Account[] } = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.project, "wxpdchlzlejsfdhabpxy");
  assert.equal(state.accounts.length, 2);
  const saveState = () => { writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 }); chmodSync(statePath, 0o600); };
  function make(storage?: Map<string, string>) {
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: Boolean(storage), storage: storage ? { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, v); }, removeItem: (k) => { storage.delete(k); } } : undefined } });
  }
  const clients = state.accounts.map(() => make(new Map()));
  const anonymous = make();
  const tables = ["profiles", "resumes", "job_descriptions", "match_analyses", "job_applications"];
  async function read(client: SupabaseClient, table: string, id: string) {
    const { data, error } = await client.from(table).select("*").eq("id", id).single();
    assert(!error && data, `Owned ${table} read must succeed`);
    return data as Row;
  }
  function fixtureId(account: Account, table: string) {
    if (table === "profiles") return account.id;
    account.fixtures ??= {};
    if (!account.fixtures[table]) {
      account.fixtures[table] = randomUUID();
      saveState();
    }
    return account.fixtures[table];
  }
  async function appRead(client: SupabaseClient, account: Account, other: Account) {
    stage = `${account.label}: application SSR session setup`;
    const session = (await client.auth.getSession()).data.session;
    assert(session);
    const jar = new Map<string, string>();
    const ssr = createServerClient(url, key, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (items) => { for (const item of items) jar.set(item.name, item.value); } }, auth: { autoRefreshToken: false } });
    assert(!(await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })).error);
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    for (const [path, marker, forbidden] of [
      ["/resumes", `${account.label} fictional resume`, `${other.label} fictional resume`],
      ["/saved-analyses", `${account.label} fictional job`, `${other.label} fictional job`],
      ["/applications", `${account.label} fictional application`, `${other.label} fictional application`],
      ["/settings", account.label, other.label],
    ]) {
      stage = `${account.label}: application SSR ${path}`;
      const response: Response = await fetch(`${origin}${path}`, { headers: { cookie }, redirect: "manual" });
      assert.equal(response.status, 200, "Authenticated application page must render");
      const html = await response.text();
      assert(html.includes(marker), "Application server must render owned fixture");
      assert(!html.includes(forbidden), "Application server must not render other user's fixture");
      pass(`${account.label}: application HTTP/SSR ${path} renders own data only`);
    }
    const response: Response = await fetch(`${origin}/editor?id=${fixtureId(account, "resumes")}`, { headers: { cookie }, redirect: "manual" });
    assert.equal(response.status, 200);
    pass(`${account.label}: authenticated editor route renders (client hydration not tested)`);
  }

  for (let i = 0; i < 2; i++) {
    const account = state.accounts[i];
    stage = `${account.label}: confirmation and login`;
    const { data, error } = await clients[i].auth.signInWithPassword({ email: account.email, password: account.password });
    assert(!error && data.user?.id === account.id && data.session && data.user.email_confirmed_at);
    pass(`${account.label}: email confirmed and password login succeeded`);
    const bad = await make().auth.signInWithPassword({ email: account.email, password: `incorrect-${randomUUID()}` });
    assert(bad.error && !bad.data.session);
    pass(`${account.label}: incorrect password rejected`);
    const profile = await read(clients[i], "profiles", account.id);
    assert.equal(profile.display_name, account.label);
    pass(`${account.label}: signup trigger created readable own profile`);
  }

  if (!process.argv.includes("--sessions-only")) {
  for (let i = 0; i < 2; i++) {
    const account = state.accounts[i], client = clients[i];
    stage = `${account.label}: persistence fixture creation`;
    const content = { ...blankResume(), contact: { ...blankResume().contact, name: account.label }, summary: "Fictional QA resume for database verification only." };
    const payloads: Record<string, Row> = {
      resumes: { id: fixtureId(account, "resumes"), user_id: account.id, name: `${account.label} fictional resume`, content, original_content: content, extracted_text: "Fictional QA resume. No real employment history." },
      job_descriptions: { id: fixtureId(account, "job_descriptions"), user_id: account.id, job_title: `${account.label} fictional job`, company_name: "Fictional Cedar QA Company", original_description: "Fictional QA role requiring TypeScript and careful testing.", reviewed_requirements: [] },
      match_analyses: { id: fixtureId(account, "match_analyses"), user_id: account.id, resume_id: fixtureId(account, "resumes"), job_description_id: fixtureId(account, "job_descriptions"), deterministic_score: 75, deterministic_results: { findings: [], fixture: "fictional-only" }, ai_contextual_analysis: null },
      job_applications: { id: fixtureId(account, "job_applications"), user_id: account.id, job_title: `${account.label} fictional application`, company_name: "Fictional Cedar QA Company", status: "Interested", resume_id: fixtureId(account, "resumes"), job_description_id: fixtureId(account, "job_descriptions") },
    };
    for (const [table, payload] of Object.entries(payloads)) {
      const existing = await client.from(table).select("id").eq("id", payload.id).maybeSingle();
      assert(!existing.error);
      if (!existing.data) assert(!(await client.from(table).insert(payload)).error, "Fictional insert must succeed");
      await read(client, table, String(payload.id));
      pass(`${account.label}: SDK save/retrieve ${table}`);
    }
    const analysisId = fixtureId(account, "match_analyses");
    assert(!(await client.from("match_analyses").update({ is_stale: false }).eq("id", analysisId)).error);
    const updated = { ...content, summary: `Edited fictional QA summary ${randomUUID()}.` };
    assert(!(await client.from("resumes").update({ content: updated }).eq("id", fixtureId(account, "resumes"))).error);
    assert.equal((await read(client, "resumes", fixtureId(account, "resumes"))).content && ((await read(client, "resumes", fixtureId(account, "resumes"))).content as Row).summary, updated.summary);
    assert.equal((await read(client, "match_analyses", analysisId)).is_stale, true);
    pass(`${account.label}: SDK resume edit persists and marks analysis stale`);
    assert(!(await client.from("match_analyses").update({ is_stale: false }).eq("id", analysisId)).error);
    assert(!(await client.from("job_descriptions").update({ original_description: `Edited fictional QA role requiring TypeScript and careful testing ${randomUUID()}.` }).eq("id", fixtureId(account, "job_descriptions"))).error);
    assert.equal((await read(client, "match_analyses", analysisId)).is_stale, true);
    pass(`${account.label}: SDK job edit marks analysis stale`);
    assert(!(await client.from("job_applications").update({ status: "Applied" }).eq("id", fixtureId(account, "job_applications"))).error);
    assert.equal((await read(client, "job_applications", fixtureId(account, "job_applications"))).status, "Applied");
    pass(`${account.label}: SDK application status update persists`);
  }

  for (let i = 0; i < 2; i++) {
    const owner = state.accounts[i], stranger = clients[1 - i], own = clients[i];
    for (const table of tables) {
      stage = `${owner.label}: ${table} RLS`;
      const id = fixtureId(owner, table), before = await read(own, table, id);
      const hidden = await stranger.from(table).select("*").eq("id", id);
      assert(!hidden.error && hidden.data?.length === 0);
      const patch = table === "profiles" ? { display_name: "forbidden" } : table === "resumes" ? { name: "forbidden" } : table === "match_analyses" ? { deterministic_score: 0 } : { job_title: "forbidden" };
      const changed = await stranger.from(table).update(patch).eq("id", id).select("id");
      assert(!changed.error && changed.data?.length === 0);
      const deleted = await stranger.from(table).delete().eq("id", id).select("id");
      assert(!deleted.error && deleted.data?.length === 0);
      assert.deepEqual(await read(own, table, id), before);
      pass(`${owner.label}: ${table} cross-user read/update/delete denied; owner data unchanged`);
      const reassigned = await own.from(table).update(table === "profiles" ? { id: state.accounts[1 - i].id } : { user_id: state.accounts[1 - i].id }).eq("id", id).select("id");
      assert(reassigned.error, "Ownership transfer must fail");
      assert.deepEqual(await read(own, table, id), before);
      pass(`${owner.label}: ${table} ownership transfer rejected`);
      const forged = { ...before, id: randomUUID(), ...(table === "profiles" ? {} : { user_id: state.accounts[1 - i].id }) };
      // Profile has no INSERT policy; the nonexistent auth ID cannot yield a legal profile.
      const insert = await own.from(table).insert(forged);
      assert(insert.error && insert.error.code === "42501");
      pass(`${owner.label}: ${table} forged insert rejected by RLS`);
    }
    for (const [table, column, target] of [["resumes", "original_resume_id", "resumes"], ["match_analyses", "resume_id", "resumes"], ["match_analyses", "job_description_id", "job_descriptions"], ["job_applications", "resume_id", "resumes"], ["job_applications", "job_description_id", "job_descriptions"]]) {
      stage = `${owner.label}: ${table}.${column} composite FK`;
      const id = fixtureId(owner, table), before = await read(own, table, id);
      const link = await own.from(table).update({ [column]: fixtureId(state.accounts[1 - i], target) }).eq("id", id);
      assert.equal(link.error?.code, "23503");
      assert.deepEqual(await read(own, table, id), before);
      pass(`${owner.label}: cross-user ${table}.${column} rejected by FK`);
    }
    stage = `${owner.label}: direct bucket access`;
    assert.equal((await own.from("gemini_rate_limit_buckets").select("*").limit(0)).error?.code, "42501");
    pass(`${owner.label}: authenticated direct bucket SELECT denied`);
  }
  }
  for (const table of [...tables, "gemini_rate_limit_buckets"]) {
    stage = `anonymous ${table}`;
    assert.equal((await anonymous.from(table).select("*").limit(0)).error?.code, "42501");
    pass(`Anonymous ${table} SELECT denied`);
  }
  for (let i = 0; i < 2; i++) {
    const account = state.accounts[i], client = clients[i];
    stage = `${account.label}: application SSR`;
    await appRead(client, account, state.accounts[1 - i]);
    stage = `${account.label}: session persistence`;
    const storage = new Map<string, string>();
    const session = (await client.auth.getSession()).data.session!;
    const first = make(storage);
    assert(!(await first.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })).error);
    const restored = make(storage);
    assert.equal((await restored.auth.getUser()).data.user?.id, account.id);
    pass(`${account.label}: SDK session restored in a new client using isolated storage`);
    const before = new Map<string, Row>();
    for (const table of tables) before.set(table, await read(client, table, fixtureId(account, table)));
    assert(!(await client.auth.signOut()).error);
    assert.equal((await client.auth.getSession()).data.session, null);
    assert.equal((await client.auth.getUser()).data.user, null);
    const response: Response = await fetch(`${origin}/resumes`, { redirect: "manual" });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/auth");
    pass(`${account.label}: SDK logout clears session; cookie-free protected route redirects`);
    const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
    assert(!login.error && login.data.user?.id === account.id);
    for (const table of tables) assert.deepEqual(await read(client, table, fixtureId(account, table)), before.get(table));
    pass(`${account.label}: login after logout succeeds; all saved records and edits persist`);
    await appRead(client, account, state.accounts[1 - i]);
    assert(!(await client.auth.signOut()).error);
  }
  saveResults();
  console.log("COMPLETE: fictional fixtures retained; no account deletion, schema changes, Gemini, or quota stress.");
}

main().catch((error: unknown) => {
  results.push({ name: stage, status: "failed-or-blocked" });
  saveResults();
  console.error(`STOP: ${stage}; ${error instanceof assert.AssertionError ? error.message : "network/runtime failure"}. No secrets or response objects logged.`);
  process.exitCode = 1;
});
