import { NextResponse } from "next/server";
import { isValidCustomerPassword } from "@/lib/customer-auth.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const password =
      typeof body === "object" && body !== null
        ? (body as { password?: unknown }).password
        : undefined;
    if (!isValidCustomerPassword(password)) {
      return NextResponse.json(
        { error: "Use a password with at least 12 characters." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: sessionError } =
      await supabase.auth.getUser();
    if (sessionError || !user) {
      return NextResponse.json(
        { error: "This password reset link is invalid or expired." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      console.error("Supabase password update failed:", error.message);
      return NextResponse.json(
        { error: "Unable to update your password right now." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Password reset failed:", error);
    return NextResponse.json(
      { error: "Unable to reset your password right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
