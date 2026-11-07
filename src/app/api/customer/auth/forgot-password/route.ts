import { NextResponse } from "next/server";
import { isAuthRateLimited } from "@/lib/auth-rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/customer-auth.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const genericMessage =
  "If an account uses that email, password reset instructions will be sent.";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const email = normalizeEmail(
      typeof body === "object" && body !== null
        ? (body as { email?: unknown }).email
        : null
    );
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { message: "Enter a valid email address." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (await isAuthRateLimited("password-reset", email, 3)) {
      return NextResponse.json(
        { message: "Too many reset requests. Please wait before trying again." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL is not configured.");
    const redirectTo = new URL(
      "/auth/callback?next=%2Faccount%2Freset-password",
      appUrl
    ).toString();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      console.error("Supabase password reset request failed:", error.message);
      return NextResponse.json(
        { message: "Password reset is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { message: genericMessage },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Password reset request failed:", error);
    return NextResponse.json(
      { message: "Password reset is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
