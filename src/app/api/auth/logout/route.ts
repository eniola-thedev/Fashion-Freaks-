import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Admin sign-out failed:", error.message);
    return NextResponse.json(
      { error: "Unable to sign out right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { success: true, message: "You have been signed out." },
    { headers: { "Cache-Control": "no-store" } }
  );
}