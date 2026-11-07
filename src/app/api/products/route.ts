import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: products, error } = await supabase
      .from("Product")
      .select(
        "id, name, slug, description, price, category, colour, imageUrl, discountPrice, isFeatured, colours:ProductColour(id, name, hexColor, images:ProductColourImage(imageUrl, position, isPrimary)), variants:ProductVariant(id, colour, size, imageUrl)"
      )
      .eq("isActive", true)
      .eq("variants.isActive", true)
      .order("createdAt", { ascending: false });
    if (error) throw error;

    return NextResponse.json(products, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Failed to fetch products:", error);

    return NextResponse.json(
      { error: "The product catalogue is temporarily unavailable. Please try again." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }
}
