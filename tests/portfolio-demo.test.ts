import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { getPortfolioDemoDisposition, isPortfolioDemoEnabled, portfolioDemoEnvironmentVariable } from "../src/lib/portfolio-demo";
import { buildPortfolioMatch, portfolioCandidates, portfolioJobs } from "../src/lib/portfolio-samples";
import { proxy } from "../src/proxy";

test("portfolio demo remains disabled unless its server-only flag is exactly true", () => {
  assert.equal(isPortfolioDemoEnabled({}), false);
  assert.equal(isPortfolioDemoEnabled({ [portfolioDemoEnvironmentVariable]: "false" }), false);
  assert.equal(isPortfolioDemoEnabled({ [portfolioDemoEnvironmentVariable]: "TRUE" }), false);
  assert.equal(isPortfolioDemoEnabled({ [portfolioDemoEnvironmentVariable]: "true" }), true);
  assert.equal(getPortfolioDemoDisposition("/analyze", false), "normal");
  assert.equal(getPortfolioDemoDisposition("/api/gemini/analyze", false), "normal");
});

test("portfolio demo allows only its portfolio route and blocks every application API route", async () => {
  const previous = process.env[portfolioDemoEnvironmentVariable];
  process.env[portfolioDemoEnvironmentVariable] = "true";
  try {
    const portfolio = await proxy(new NextRequest("https://portfolio.example.invalid/portfolio"));
    assert.equal(portfolio.status, 200);
    assert.equal(portfolio.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(portfolio.headers.get("content-security-policy") ?? "", /supabase\.co/i);

    for (const path of ["/api", "/api/unexpected", "/api/resume/parse", "/api/resume/export/pdf", "/api/gemini/analyze", "/api/gemini/suggest"]) {
      const response = await proxy(new NextRequest(`https://portfolio.example.invalid${path}`));
      assert.equal(response.status, 404, path);
      assert.deepEqual(await response.json(), {
        error: { code: "PORTFOLIO_DEMO_READ_ONLY", message: "Portfolio demo mode does not provide API access." },
      });
    }

    for (const path of ["/", "/auth", "/analyze", "/resumes", "/saved-analyses"]) {
      const response = await proxy(new NextRequest(`https://portfolio.example.invalid${path}`));
      assert.equal(response.status, 307, path);
      assert.equal(new URL(response.headers.get("location") ?? "").pathname, "/portfolio", path);
    }
  } finally {
    if (previous === undefined) delete process.env[portfolioDemoEnvironmentVariable];
    else process.env[portfolioDemoEnvironmentVariable] = previous;
  }
});

test("the portfolio page is fictional sample content and the proxy exits before Supabase session refresh", async () => {
  const [page, component, proxySource] = await Promise.all([
    readFile(new URL("../src/app/portfolio/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/portfolio-demo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/proxy.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Portfolio demo — fictional data only\. Do not submit real resumes or personal information\./);
  assert.match(component, /These controls only switch fixed samples in browser memory/);
  assert.match(page, /if \(!isPortfolioDemoEnabled\(\)\) notFound\(\);/);
  assert.doesNotMatch(page, /from ["']@\/lib\/supabase/);
  assert.doesNotMatch(page, /fetch\(|<form|\/api\//);
  assert.match(component, /aria-pressed/);
  assert.match(component, /Illustrative score calculated in this browser/);
  assert.doesNotMatch(component, /from ["']@\/lib\/supabase|from ["']@\/lib\/gemini|fetch\(|\/api\/|<form|<input|<textarea/);

  const demoGuard = proxySource.indexOf('if (demoDisposition !== "normal")');
  const supabaseConfig = proxySource.indexOf("const config = getSupabaseConfig()");
  const sessionRefresh = proxySource.indexOf("supabase.auth.getClaims()");
  assert.ok(demoGuard >= 0);
  assert.ok(demoGuard < supabaseConfig);
  assert.ok(demoGuard < sessionRefresh);
  assert.match(proxySource, /PORTFOLIO_DEMO_READ_ONLY/);
});

test("every selectable portfolio pair uses the deterministic matcher with fixed fictional samples", () => {
  assert.ok(portfolioCandidates.length >= 2);
  assert.ok(portfolioJobs.length >= 2);
  for (const candidate of portfolioCandidates) {
    for (const job of portfolioJobs) {
      const match = buildPortfolioMatch(candidate.id, job.id);
      assert.equal(match.candidate.id, candidate.id);
      assert.equal(match.job.id, job.id);
      assert.ok(match.report.findings.length >= 2);
      assert.notEqual(match.report.scorePercent, null);
    }
  }
});
