import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/customer-auth.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/account"
  );
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    console.error("Supabase auth callback failed:", error.message);
  }

  const loginUrl = new URL("/account/login", request.url);
  loginUrl.searchParams.set("authError", "link");
  return NextResponse.redirect(loginUrl);
}
