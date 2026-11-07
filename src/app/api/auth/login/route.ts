import { NextResponse } from "next/server";
import { isAuthRateLimited } from "@/lib/auth-rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/customer-auth.mjs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
    }

    const input = body as { email?: unknown; password?: unknown };
    const email = normalizeEmail(input.email);
    const password = typeof input.password === "string" ? input.password : "";
    if (!isValidEmail(email) || password.length === 0 || password.length > 200) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
    }
    if (await isAuthRateLimited("admin-login", email, 8)) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please try again later." },
        { status: 429 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("UserProfile")
      .select("role, isActive")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !profile.isActive || profile.role !== "ADMIN") {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "This account is not authorized for the admin dashboard." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: true, redirectTo: "/admin" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin login failed:", error);
    return NextResponse.json(
      { error: "Unable to sign in right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
