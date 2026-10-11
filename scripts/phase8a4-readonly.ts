/** Read-only live preflight. Run with node --env-file=.env.local --import tsx. */
import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseBrowserClient } from "../src/lib/supabase/client";
import { getSupabaseConfig } from "../src/lib/supabase/env";

async function main() {
  const config = getSupabaseConfig();
  assert(config, "Supabase configuration is required");
  assert.equal(new URL(config.url).hostname, "wxpdchlzlejsfdhabpxy.supabase.co");
  assert(config.key.startsWith("sb_publishable_"), "Use the configured publishable key only");
  console.log("PASS: intended project and publishable key configuration");

  const browser = getSupabaseBrowserClient();
  const server = createServerClient(config.url, config.key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  assert.equal(browser, getSupabaseBrowserClient());
  for (const [name, client] of [["browser factory (Node smoke)", browser], ["SSR factory (empty cookie adapter)", server]] as const) {
    const { data, error } = await client.auth.getUser();
    assert.equal(data.user, null);
    assert(error, "No-cookie client must not authenticate");
    console.log(`PASS: ${name} initializes without an authenticated session`);
  }

  for (const table of ["profiles", "resumes", "job_descriptions", "match_analyses", "job_applications", "gemini_rate_limit_buckets"]) {
    const { error, status } = await browser.from(table).select("*").limit(0);
    assert(error, "Anonymous table access must fail");
    assert.equal(error.code, "42501", "Expected permission denial, not missing table");
    console.log(`PASS: Data API resolves ${table} and denies anonymous SELECT (${status}, ${error.code})`);
  }

  // EXECUTE is denied before this write-capable RPC can run; no bucket is consumed.
  const { error, status } = await browser.rpc("consume_gemini_rate_limit", { p_scope: "analysis", p_limit: 5 });
  assert(error, "Anonymous RPC must fail");
  assert.equal(error.code, "42501");
  console.log(`PASS: anonymous rate-limit RPC denied (${status}, ${error.code})`);

  const settings = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key } });
  assert.equal(settings.status, 200);
  const body = await settings.json();
  console.log(`LIVE Auth settings: email enabled=${body.external?.email === true}; email confirmation required=${body.mailer_autoconfirm === false}`);
}

main().catch(() => {
  // Never log SDK objects, request headers, configuration, or session material.
  console.error("FAIL: read-only preflight assertion or network request failed; no credentials logged");
  process.exitCode = 1;
});
