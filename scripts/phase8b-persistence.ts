/** Single-use, explicitly approved 12-request plan. No deletes, retries, RPCs or AI. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resumeContentSchema, resumeContentToText } from "../src/lib/resume-editor";
import { editableJobDescriptionAnalysisSchema } from "../src/lib/job-description-analysis";
import { analyzeResumeMatch } from "../src/lib/resume-job-matcher";

type Row = Record<string, unknown>;
type Account = { label: string; email: string; password: string; id: string; fixtures: Record<string, string> };
const resultPath = "docs/PHASE_8B_PERSISTENCE_RESULTS.json";
const tables = ["resumes", "job_descriptions", "match_analyses", "job_applications"];
const hash = (row: unknown) => createHash("sha256").update(JSON.stringify(row)).digest("hex");

async function main() {
  assert(process.argv.includes("--approved-12-request-plan"), "Explicit approval flag required");
  assert(!existsSync(resultPath), "Single-use evidence exists; never rerun automatically");
  process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  assert.equal(new URL(url).hostname, "wxpdchlzlejsfdhabpxy.supabase.co");
  assert(key.startsWith("sb_publishable_"));
  const state = JSON.parse(readFileSync(".env.qa-state.local", "utf8")) as { project: string; accounts: Account[] };
  assert.equal(state.project, "wxpdchlzlejsfdhabpxy");
  assert.equal(state.accounts.length, 2);
  const clients = state.accounts.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  const anonymous = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = { resume: randomUUID(), job: randomUUID(), analysis1: randomUUID(), analysis2: randomUUID(), application: randomUUID() };
  const evidence = { project: state.project, status: "RUNNING", evidence: "live ordinary-user SDK; not browser UI", ids, requestsAttempted: 0, requestBytes: 0, results: [] as { name: string; status: string; code?: string }[], beforeCounts: [] as number[], afterCounts: [] as number[] };
  const save = () => writeFileSync(resultPath, JSON.stringify(evidence, null, 2) + "\n");
  let stage = "preflight";
  const pass = (name: string, code?: string) => { evidence.results.push({ name, status: "PASSED", ...(code ? { code } : {}) }); save(); console.log(`PASS: ${name}`); };
  async function login(i: number) {
    const a = state.accounts[i];
    const result = await clients[i].auth.signInWithPassword({ email: a.email, password: a.password });
    assert(!result.error && result.data.user?.id === a.id && result.data.user.email_confirmed_at);
  }
  async function read(client: SupabaseClient, table: string, id: string) {
    const result = await client.from(table).select("*").eq("id", id).single();
    assert(!result.error && result.data);
    return result.data as Row;
  }
  async function snapshot(i: number) {
    const rows = new Map<string, Row>();
    for (const table of ["profiles", ...tables]) {
      const result = await clients[i].from(table).select("*").order("id");
      assert(!result.error && result.data);
      for (const row of result.data as Row[]) rows.set(`${table}:${row.id}`, row);
    }
    return rows;
  }
  async function write(name: string, payload: Row, action: () => PromiseLike<{ error: { code: string } | null; data: unknown }>) {
    stage = name;
    assert(evidence.requestsAttempted < 12);
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    assert(bytes <= 32768 && evidence.requestBytes + bytes <= 393216);
    evidence.requestsAttempted++;
    evidence.requestBytes += bytes;
    save(); // Persist intent before sending: interrupted runs must never be replayed.
    return await action();
  }
  try {
    await login(0); await login(1);
    const before = [await snapshot(0), await snapshot(1)];
    evidence.beforeCounts = before.map(rows => [...rows.keys()].filter(k => !k.startsWith("profiles:")).length);
    assert.deepEqual(evidence.beforeCounts, [7, 200]);
    const baseline = JSON.parse(readFileSync("docs/PHASE_8A_5_BASELINE.json", "utf8")) as { snapshots: { account: string; table: string; sha256: string }[] };
    for (let i = 0; i < 2; i++) for (const table of ["profiles", ...tables]) {
      const id = table === "profiles" ? state.accounts[i].id : state.accounts[i].fixtures[table];
      const original = baseline.snapshots.find(b => b.account === state.accounts[i].label && b.table === table);
      assert(original && hash(before[i].get(`${table}:${id}`)) === original.sha256);
    }
    for (const [table, id] of [["resumes", ids.resume], ["job_descriptions", ids.job], ["match_analyses", ids.analysis1], ["match_analyses", ids.analysis2], ["job_applications", ids.application]]) {
      const result = await clients[0].from(table).select("id").eq("id", id);
      assert(!result.error && result.data?.length === 0);
    }
    pass("Preflight: confirmed QA identities; counts A7/B200; ten historical hashes match; fresh IDs absent");
    const original = resumeContentSchema.parse(JSON.parse(readFileSync("tests/fixtures/phase8b/resume.json", "utf8")));
    const edited = resumeContentSchema.parse({ ...original, summary: original.summary + " Reviewed fictional documentation.", skills: [...original.skills, { id: "phase8b-testing", text: "Automated software testing" }], experience: original.experience.map(e => ({ ...e, description: e.description + " Added fictional testing documentation." })), education: original.education.map(e => ({ ...e, details: e.details + " Fictional capstone: inventory validation." })) });
    const editedAgain = resumeContentSchema.parse({ ...edited, summary: edited.summary + " Updated fictional portfolio summary." });
    const job = editableJobDescriptionAnalysisSchema.parse(JSON.parse(readFileSync("tests/fixtures/phase8b/reviewed-job.json", "utf8")));
    const updatedJob = editableJobDescriptionAnalysisSchema.parse({ ...job, sections: { ...job.sections, required: job.sections.required.map((r, i) => i === 0 ? { ...r, text: "Python scripting and documentation" } : r) } });
    const owner = state.accounts[0].id;
    const resume = { id: ids.resume, user_id: owner, name: "Phase 8B Morgan Reed fictional resume", content: original, original_content: original, extracted_text: resumeContentToText(original) };
    let result = await write("1 INSERT resume", resume, () => clients[0].from("resumes").insert(resume)); assert(!result.error);
    assert.deepEqual((await read(clients[0], "resumes", ids.resume)).content, original);
    pass("Resume saved and retrieved");
    const resumePatch = { content: edited, extracted_text: resumeContentToText(edited) };
    result = await write("2 UPDATE new resume four sections", resumePatch, () => clients[0].from("resumes").update(resumePatch).eq("id", ids.resume).eq("user_id", owner).select("id")); assert(!result.error && (result.data as Row[]).length === 1);
    assert.deepEqual((await read(clients[0], "resumes", ids.resume)).content, edited);
    pass("Summary, skills, experience and education edits retrieved exactly");
    const jobRow = { id: ids.job, user_id: owner, job_title: "Phase 8B Software Analyst", company_name: "Fictional Lantern Labs", original_description: readFileSync("tests/fixtures/phase8b/job-description.txt", "utf8"), reviewed_requirements: job };
    result = await write("3 INSERT reviewed job", jobRow, () => clients[0].from("job_descriptions").insert(jobRow)); assert(!result.error);
    assert.deepEqual((await read(clients[0], "job_descriptions", ids.job)).reviewed_requirements, job);
    pass("Reviewed job saved and retrieved");
    const report1 = analyzeResumeMatch(resumeContentToText(edited), job);
    const analysis1 = { id: ids.analysis1, user_id: owner, resume_id: ids.resume, job_description_id: ids.job, deterministic_score: report1.scorePercent, deterministic_results: { report: report1, reviewedRequirements: job }, ai_contextual_analysis: null, is_stale: false, formula_version: "phase4-v1" };
    result = await write("4 INSERT analysis 1", analysis1, () => clients[0].from("match_analyses").insert(analysis1)); assert(!result.error);
    const saved1 = await read(clients[0], "match_analyses", ids.analysis1);
    assert.equal(Number(saved1.deterministic_score), report1.scorePercent); assert.deepEqual(saved1.deterministic_results, analysis1.deterministic_results); assert.equal(saved1.is_stale, false);
    pass("Analysis 1 score, evidence, source IDs and fresh status retrieved");
    const summaryPatch = { content: editedAgain };
    result = await write("5 UPDATE new resume summary", summaryPatch, () => clients[0].from("resumes").update(summaryPatch).eq("id", ids.resume).eq("user_id", owner).select("id")); assert(!result.error && (result.data as Row[]).length === 1);
    assert.equal((await read(clients[0], "match_analyses", ids.analysis1)).is_stale, true);
    pass("Resume edit makes analysis 1 stale through database trigger");
    const report2 = analyzeResumeMatch(resumeContentToText(editedAgain), job);
    const analysis2 = { ...analysis1, id: ids.analysis2, deterministic_score: report2.scorePercent, deterministic_results: { report: report2, reviewedRequirements: job } };
    result = await write("6 INSERT analysis 2", analysis2, () => clients[0].from("match_analyses").insert(analysis2)); assert(!result.error);
    const saved2 = await read(clients[0], "match_analyses", ids.analysis2);
    assert.equal(saved2.is_stale, false); assert.deepEqual(saved2.deterministic_results, analysis2.deterministic_results);
    pass("Analysis 2 recomputed, saved and reopened fresh without resetting analysis 1");
    const jobPatch = { reviewed_requirements: updatedJob, original_description: jobRow.original_description + "\nFictional documentation review required." };
    result = await write("7 UPDATE new job", jobPatch, () => clients[0].from("job_descriptions").update(jobPatch).eq("id", ids.job).eq("user_id", owner).select("id")); assert(!result.error && (result.data as Row[]).length === 1);
    for (const id of [ids.analysis1, ids.analysis2]) assert.equal((await read(clients[0], "match_analyses", id)).is_stale, true);
    pass("Job edit persists and makes analysis 2 stale; analysis 1 remains stale");
    const application = { id: ids.application, user_id: owner, job_title: "Phase 8B fictional application", company_name: "Fictional Lantern Labs", status: "Interested", resume_id: ids.resume, job_description_id: ids.job, notes: "Fictional non-Gemini Phase 8B verification only." };
    result = await write("8 INSERT application", application, () => clients[0].from("job_applications").insert(application)); assert(!result.error);
    assert.equal((await read(clients[0], "job_applications", ids.application)).status, "Interested");
    result = await write("9 UPDATE new application status", { status: "Applied" }, () => clients[0].from("job_applications").update({ status: "Applied" }).eq("id", ids.application).eq("user_id", owner).select("id")); assert(!result.error && (result.data as Row[]).length === 1);
    assert.equal((await read(clients[0], "job_applications", ids.application)).status, "Applied");
    pass("Application associations, ownership and Applied status retrieved");
    const beforeDenials = await snapshot(0);
    result = await write("10 duplicate resume INSERT", resume, () => clients[0].from("resumes").insert(resume)); assert.equal(result.error?.code, "23505");
    pass("Duplicate submission rejected", "23505");
    result = await write("11 QA B UPDATE new QA A application", { status: "Rejected" }, () => clients[1].from("job_applications").update({ status: "Rejected" }).eq("id", ids.application).eq("user_id", owner).select("id")); assert(!result.error && (result.data as Row[]).length === 0);
    pass("Cross-user update returns zero rows and changes nothing");
    result = await write("12 invalid application status UPDATE", { status: "InvalidPhase8B" }, () => clients[0].from("job_applications").update({ status: "InvalidPhase8B" }).eq("id", ids.application).eq("user_id", owner)); assert.equal(result.error?.code, "22P02");
    pass("Invalid enum update rejected", "22P02");
    assert.deepEqual(await snapshot(0), beforeDenials);
    pass("All QA A records unchanged by three denied write attempts");
    stage = "Read-only isolation and final integrity";
    for (const [table, id] of [["resumes", ids.resume], ["job_descriptions", ids.job], ["match_analyses", ids.analysis1], ["match_analyses", ids.analysis2], ["job_applications", ids.application]]) {
      const other = await clients[1].from(table).select("id").eq("id", id); assert(!other.error && other.data?.length === 0);
      const anon = await anonymous.from(table).select("id").eq("id", id); assert.equal(anon.error?.code, "42501");
    }
    const invalid = await clients[0].from("resumes").select("id").eq("id", "invalid-phase8b-id"); assert.equal(invalid.error?.code, "22P02");
    pass("New fixtures hidden from QA B/anonymous; invalid UUID rejected safely by SDK");
    assert(!(await clients[0].auth.signOut({ scope: "local" })).error);
    assert.equal((await clients[0].auth.getSession()).data.session, null);
    await login(0);
    const after = [await snapshot(0), await snapshot(1)];
    assert.deepEqual(after[0], beforeDenials);
    for (let i = 0; i < 2; i++) for (const [id, row] of before[i]) assert.deepEqual(after[i].get(id), row);
    evidence.afterCounts = after.map(rows => [...rows.keys()].filter(k => !k.startsWith("profiles:")).length);
    assert.deepEqual(evidence.afterCounts, [12, 200]);
    assert.equal(evidence.requestsAttempted, 12);
    pass("Logout/relogin preserves all five new records and edits; all 207 prior saved rows and two profiles unchanged; counts A12/B200");
    evidence.status = "PASSED";
  } catch {
    evidence.status = "FAILED_OR_BLOCKED";
    evidence.results.push({ name: stage, status: "FAILED_OR_BLOCKED" });
    console.error(`STOP: ${stage}; no retries or cleanup; sensitive diagnostics withheld`);
    process.exitCode = 1;
  } finally {
    save();
    for (const client of clients) await client.auth.signOut({ scope: "local" });
  }
}
main().catch(() => { console.error("Preflight blocked; existing evidence preserved; credentials withheld"); process.exitCode = 1; });
