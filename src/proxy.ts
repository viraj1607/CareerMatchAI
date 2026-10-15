import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPortfolioDemoDisposition } from "@/lib/portfolio-demo";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { applySecurityHeaders, makeContentSecurityPolicy } from "@/lib/security-headers";

function withSecurityHeaders(response: NextResponse, contentSecurityPolicy: string): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  applySecurityHeaders(response.headers, process.env.NODE_ENV === "production");
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const demoDisposition = getPortfolioDemoDisposition(request.nextUrl.pathname);

  if (demoDisposition !== "normal") {
    // Do not read Supabase configuration or refresh a session in portfolio mode.
    // This keeps the public route independent of the shared development project.
    const csp = makeContentSecurityPolicy(nonce, undefined, process.env.NODE_ENV === "development");
    if (demoDisposition === "portfolio") {
      return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp);
    }
    if (demoDisposition === "block-api") {
      return withSecurityHeaders(
        NextResponse.json(
          { error: { code: "PORTFOLIO_DEMO_READ_ONLY", message: "Portfolio demo mode does not provide API access." } },
          { status: 404 },
        ),
        csp,
      );
    }
    return withSecurityHeaders(NextResponse.redirect(new URL("/portfolio", request.url)), csp);
  }

  const config = getSupabaseConfig();
  const csp = makeContentSecurityPolicy(nonce, config?.url, process.env.NODE_ENV === "development");
  requestHeaders.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  if (config) {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getClaims();
  }

  return withSecurityHeaders(response, csp);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
