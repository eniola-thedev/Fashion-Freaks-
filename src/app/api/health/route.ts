import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { count: activeProducts, error } = await supabase
      .from("Product")
      .select("id", { count: "exact", head: true })
      .eq("isActive", true);
    if (error) throw error;

    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        catalogue: (activeProducts ?? 0) > 0 ? "ready" : "empty",
        activeProducts: activeProducts ?? 0,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Health check database query failed:", error);
    return NextResponse.json(
      {
        status: "unavailable",
        database: "disconnected",
        catalogue: "unavailable",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }
}
