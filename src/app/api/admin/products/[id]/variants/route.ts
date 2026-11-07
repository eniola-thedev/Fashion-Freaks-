import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth";
import { colourHexFromName } from "@/lib/product-colours.mjs";

// export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const { id: productId } = await context.params;
    const body = await request.json();

    const colour =
      typeof body.colour === "string"
        ? body.colour.trim()
        : "";

    const size =
      typeof body.size === "string"
        ? body.size.trim()
        : "";

    const stock = body.stock;

    if (
      !colour ||
      colour.length > 80 ||
      !size ||
      size.length > 30 ||
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      stock > 1_000_000
    ) {
      return NextResponse.json(
        {
          error:
            "Enter a valid colour, size, and non-negative stock quantity.",
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: variant, error } = await supabase.rpc(
      "admin_upsert_variant",
      {
        p_product_id: productId,
        p_colour: colour,
        p_size: size,
        p_stock: stock,
        p_hex_color: colourHexFromName(colour),
      }
    );
    if (error?.code === "P0002") {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 }
      );
    }
    if (error) throw error;

    return NextResponse.json(
      { variant },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin variant update failed:", error);

    return NextResponse.json(
      { error: "Could not save the product variant." },
      { status: 500 }
    );
  }
}