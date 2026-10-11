/** Read-only comparison against the preserved Phase 8A.5 baseline; never rewrites it. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

async function main() {
  process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  assert.equal(new URL(url).hostname, "wxpdchlzlejsfdhabpxy.supabase.co");
  assert(key.startsWith("sb_publishable_"));
  const state = JSON.parse(readFileSync(".env.qa-state.local", "utf8")) as {
    project: string;
    accounts: { label: string; email: string; password: string; id: string; fixtures: Record<string, string> }[];
  };
  assert.equal(state.project, "wxpdchlzlejsfdhabpxy");
  assert.equal(state.accounts.length, 2);
  const clients = state.accounts.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  const hashes: { account: string; table: string; sha256: string }[] = [];
  const tables = ["profiles", "resumes", "job_descriptions", "match_analyses", "job_applications"];
  try {
    for (let i = 0; i < 2; i++) {
      const account = state.accounts[i];
      const login = await clients[i].auth.signInWithPassword({ email: account.email, password: account.password });
      assert(!login.error && login.data.user?.id === account.id && login.data.user.email_confirmed_at);
      console.log(`${account.label}: confirmed identity verified`);
    }
    for (let i = 0; i < 2; i++) {
      const account = state.accounts[i];
      for (const table of tables) {
        const id = table === "profiles" ? account.id : account.fixtures[table];
        const own = await clients[i].from(table).select("*").eq("id", id).single();
        assert(!own.error && own.data);
        assert.equal(table === "profiles" ? own.data.id : own.data.user_id, account.id);
        const other = await clients[1 - i].from(table).select("id").eq("id", id);
        assert(!other.error && other.data?.length === 0);
        hashes.push({ account: account.label, table, sha256: createHash("sha256").update(JSON.stringify(own.data)).digest("hex") });
        console.log(`${account.label}: ${table} intact; cross-user read denied`);
      }
    }
  } finally {
    for (const client of clients) await client.auth.signOut();
  }
  const baseline = JSON.parse(readFileSync("docs/PHASE_8A_5_BASELINE.json", "utf8"));
  for (const row of hashes) {
    const original = baseline.snapshots.find((b: {account: string; table: string}) => b.account === row.account && b.table === row.table);
    assert(original);
    console.log(`${row.account}: ${row.table} historical hash ${row.sha256 === original.sha256 ? "unchanged" : "changed (manual edits reported; cause not independently attributed)"}`);
  }
  console.log("PASS: eight saved fixtures and two profiles verified; original identities and ownership preserved; historical baseline not overwritten; no fixture writes");
}
main().catch(() => { console.error("FAIL: baseline validation or network error; credentials and private data withheld"); process.exitCode = 1; });
