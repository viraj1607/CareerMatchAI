export function makeContentSecurityPolicy(nonce: string, supabaseUrl: string | undefined, isDevelopment: boolean): string {
  const connectSources = ["'self'"];
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol === "https:" || url.protocol === "http:") {
        connectSources.push(url.origin);
        connectSources.push(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
      }
    } catch { /* invalid Supabase configuration is handled by the auth flow */ }
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function applySecurityHeaders(headers: Headers, isProduction: boolean): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) headers.set("Strict-Transport-Security", "max-age=31536000");
}
