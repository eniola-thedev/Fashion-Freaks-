import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth";
import { isProductImageAsset } from "@/lib/product-image-storage";
import { verifyProductImageProof } from "@/lib/product-image-proof.mjs";
import { parseProductVariants } from "@/lib/product-variants";
import {
  parseProductColours,
  validateProductColourImageProofs,
} from "@/lib/product-colours.mjs";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidImageUrl(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  if (typeof value !== "string" || value.length > 2000) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// List products for the admin dashboard.
export async function GET() {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: products, error } = await supabase
      .from("Product")
      .select(
        "*, variants:ProductVariant(*), colours:ProductColour(*, images:ProductColourImage(*))"
      )
      .eq("variants.isActive", true)
      .order("createdAt", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Admin product listing failed:", error);

    return NextResponse.json(
      { error: "Could not load products." },
      { status: 500 }
    );
  }
}

// Create a product.
export async function POST(request: NextRequest) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    const category =
      typeof body.category === "string"
        ? body.category.trim()
        : "";

    const colour =
      typeof body.colour === "string"
        ? body.colour.trim()
        : "";

    const imageUrl =
      typeof body.imageUrl === "string"
        ? body.imageUrl.trim()
        : "";
    const imagePublicId =
      typeof body.imagePublicId === "string"
        ? body.imagePublicId.trim()
        : null;

    const price = body.price;
    const discountPrice = body.discountPrice;
    const isFeatured = body.isFeatured;
    const variants =
      body.variants === undefined
        ? []
        : parseProductVariants(body.variants);
    const colours =
      body.colours === undefined
        ? []
        : parseProductColours(body.colours);
    if (
      !name ||
      name.length > 150 ||
      !category ||
      category.length > 80 ||
      description.length > 5000 ||
      colour.length > 80 ||
      !Number.isSafeInteger(price) ||
      price <= 0 ||
      price > 100_000_000 ||
      (discountPrice !== undefined &&
        discountPrice !== null &&
        (!Number.isSafeInteger(discountPrice) ||
          discountPrice <= 0 ||
          discountPrice >= price)) ||
      (isFeatured !== undefined && typeof isFeatured !== "boolean") ||
      variants === null ||
      colours === null ||
      (body.colours !== undefined &&
        (variants ?? []).some(
            (variant) =>
              !colours.some(
                (colour) =>
                  colour.name.toLocaleLowerCase() ===
                  variant.colour.toLocaleLowerCase()
              )
          )) ||
      !validateProductColourImageProofs(
        colours ?? [],
        [],
        verifyProductImageProof,
        isProductImageAsset
      ) ||
      !isValidImageUrl(imageUrl) ||
      (body.imagePublicId !== undefined &&
        body.imagePublicId !== null &&
        (typeof body.imagePublicId !== "string" ||
          !isProductImageAsset(imageUrl, imagePublicId) ||
          !verifyProductImageProof(
            body.imageUploadProof,
            imageUrl,
            imagePublicId
          )))
    ) {
      return NextResponse.json(
        { error: "Please check the product details and try again." },
        { status: 400 }
      );
    }

    const slug = slugify(name);

    if (!slug) {
      return NextResponse.json(
        { error: "Product name cannot create a valid slug." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from("Product")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      return NextResponse.json(
        {
          error:
            "A product with a similar name already exists. Choose a different name.",
        },
        { status: 409 }
      );
    }

    const { data: product, error: createError } = await supabase.rpc(
      "admin_create_product",
      {
        p_product: {
          name,
          slug,
          description,
          price,
          category,
          colour: colour || null,
          imageUrl: imageUrl || null,
          imagePublicId,
          discountPrice: discountPrice ?? null,
          isFeatured: isFeatured ?? false,
        },
        p_variants: variants ?? [],
        p_colours: (colours ?? []).map(({ name, hexColor, images }) => ({
          name,
          hexColor,
          images: images.map(
            ({ imageUrl, imagePublicId, isPrimary }) => ({
              imageUrl,
              imagePublicId,
              isPrimary,
            })
          ),
        })),
      }
    );
    if (createError) {
      if (createError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "A product with a similar name already exists. Choose a different name.",
          },
          { status: 409 }
        );
      }
      throw createError;
    }

    return NextResponse.json(
      { product },
      { status: 201 }
    );
  } catch (error) {
    console.error("Admin product creation failed:", error);

    return NextResponse.json(
      { error: "Could not create the product." },
      { status: 500 }
    );
  }
}