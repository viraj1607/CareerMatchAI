import "server-only";

export const portfolioDemoEnvironmentVariable = "CAREERMATCH_PORTFOLIO_DEMO";

export type PortfolioDemoDisposition = "normal" | "portfolio" | "block-api" | "redirect";

/**
 * Portfolio mode is deliberately opt-in. Only the exact string "true" enables
 * it, so an unset, misspelled, or differently cased value keeps the existing
 * authenticated application behavior.
 */
export function isPortfolioDemoEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return environment[portfolioDemoEnvironmentVariable] === "true";
}

/**
 * Decide a request before application code, route handlers, or auth refreshes
 * run. This module is intentionally independent of Supabase and browser code.
 */
export function getPortfolioDemoDisposition(pathname: string, enabled = isPortfolioDemoEnabled()): PortfolioDemoDisposition {
  if (!enabled) return "normal";
  if (pathname === "/portfolio" || pathname === "/portfolio/") return "portfolio";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "block-api";
  return "redirect";
}
