import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/auth-validation";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const safeNext = safeInternalPath(request.nextUrl.searchParams.get("next"));
  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
    } catch { /* return a generic sign-in message below */ }
  }
  return NextResponse.redirect(new URL("/auth?error=callback", request.url));
}
