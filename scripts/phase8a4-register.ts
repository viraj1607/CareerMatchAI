/** Approved SDK signup only. Stops before confirmation, login, or fixture writes. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

async function main() {
  process.loadEnvFile(".env.local");
  process.loadEnvFile(".env.qa.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const origin = process.env.CAREERMATCH_QA_APP_ORIGIN!;
  assert.equal(new URL(url).hostname, "wxpdchlzlejsfdhabpxy.supabase.co");
  assert(key.startsWith("sb_publishable_"));
  assert.equal(origin, "http://127.0.0.1:3100");
  const raw = process.env.CAREERMATCH_QA_AUTH_REDIRECT_URLS ?? "";
  const redirects: string[] = raw.startsWith("[") ? JSON.parse(raw) : [raw];
  assert(redirects.includes(`${origin}/**`), "Confirmed local redirect entry required");
  const emails = [process.env.CAREERMATCH_QA_EMAIL_A!, process.env.CAREERMATCH_QA_EMAIL_B!];
  assert(emails.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));
  assert.notEqual(emails[0].toLowerCase(), emails[1].toLowerCase());

  const path = ".env.qa-state.local";
  type Account = { label: string; email: string; password: string; status: string; id?: string };
  const state: { project: string; accounts: Account[] } = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : { project: "wxpdchlzlejsfdhabpxy", accounts: emails.map((email, i) => ({ label: `CareerMatch QA ${i === 0 ? "A" : "B"}`, email, password: randomBytes(32).toString("base64url"), status: "prepared" })) };
  assert.equal(state.project, "wxpdchlzlejsfdhabpxy");
  assert(state.accounts.every((account, i) => account.email === emails[i]));
  const save = () => { writeFileSync(path, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 }); chmodSync(path, 0o600); };
  save();
  for (const account of state.accounts) {
    if (account.status !== "prepared") {
      console.log(`${account.label}: existing attempt preserved; no automatic resend`);
      continue;
    }
    account.status = "attempted";
    save();
    // SDK signup uses implicit confirmation; app PKCE/UI signup is tested separately.
    // Confirmation returns to the public sign-in page, not the PKCE code callback.
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" } });
    const { data, error } = await client.auth.signUp({ email: account.email, password: account.password, options: { data: { display_name: account.label }, emailRedirectTo: `${origin}/auth` } });
    if (error) {
      account.status = "failed";
      save();
      console.log(`${account.label}: signup rejected; safe code=${error.code ?? "unknown"}, status=${error.status ?? "unknown"}`);
      throw new Error("Signup failed; stop without retry");
    }
    assert(data.user && !data.session, "Expected user awaiting email confirmation, without a session");
    assert(!data.user.email_confirmed_at, "Expected unconfirmed disposable account");
    assert(data.user.identities?.length, "Expected newly registered identity");
    account.id = data.user.id;
    account.status = "awaiting-confirmation";
    save();
    console.log(`${account.label}: SDK signup accepted; email confirmation pending; no session issued`);
  }
  console.log("STOP: manual confirmation required. No login, persistence writes, or account deletion performed.");
}

main().catch(() => {
  console.error("Stopped at signup approval/validation/network boundary; credentials not logged. Inspect safe status before retrying.");
  process.exitCode = 1;
});
