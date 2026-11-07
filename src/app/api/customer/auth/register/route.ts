import { NextResponse } from "next/server";
import { isAuthRateLimited } from "@/lib/auth-rate-limit";
import {
  isValidCustomerPassword,
  isValidEmail,
  normalizeEmail,
} from "@/lib/customer-auth.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Please submit valid account details." }, { status: 400 });
    }

    const input = body as {
      displayName?: unknown;
      email?: unknown;
      password?: unknown;
    };
    const displayName =
      typeof input.displayName === "string" ? input.displayName.trim() : "";
    const email = normalizeEmail(input.email);
    if (
      displayName.length < 2 ||
      displayName.length > 80 ||
      !isValidEmail(email) ||
      !isValidCustomerPassword(input.password)
    ) {
      return NextResponse.json(
        {
          error:
            "Enter a valid name and email, and use a password with at least 12 characters.",
        },
        { status: 400 }
      );
    }
    if (await isAuthRateLimited("customer-register", email, 5)) {
      return NextResponse.json(
        { error: "Too many sign-up attempts. Please try again later." },
        { status: 429 }
      );
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      throw new Error("APP_URL is not configured.");
    }
    const emailRedirectTo = new URL(
      "/auth/callback?next=%2F%23shop",
      appUrl
    ).toString();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo,
      },
    });
    if (error) {
      const status = error.status === 422 ? 409 : 400;
      return NextResponse.json(
        { error: status === 409 ? "An account with this email already exists." : error.message },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        authenticated: Boolean(data.session),
        emailConfirmationRequired: !data.session,
        message: data.session
          ? "Your account is ready."
          : "Check your email to confirm your account before signing in.",
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Customer registration failed:", error);
    return NextResponse.json(
      { error: "Unable to create your account right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
