import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { isProductCloudinaryAsset } from "@/lib/cloudinary";
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
    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: [
            { colour: "asc" },
            { size: "asc" },
          ],
        },
        colours: {
          include: {
            images: { orderBy: { position: "asc" } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

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
        isProductCloudinaryAsset
      ) ||
      !isValidImageUrl(imageUrl) ||
      (body.imagePublicId !== undefined &&
        body.imagePublicId !== null &&
        (typeof body.imagePublicId !== "string" ||
          !isProductCloudinaryAsset(imageUrl, imagePublicId) ||
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

    const existing = await prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "A product with a similar name already exists. Choose a different name.",
        },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({
      data: {
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
        isActive: true,
        variants: {
          create: variants ?? [],
        },
        colours: {
          create: (colours ?? []).map((productColour, sortOrder) => ({
            name: productColour.name,
            hexColor: productColour.hexColor,
            sortOrder,
            images: {
              create: productColour.images.map(
                ({ imageUrl: colourImageUrl, imagePublicId: colourImagePublicId, isPrimary }, position) => ({
                  imageUrl: colourImageUrl,
                  imagePublicId: colourImagePublicId,
                  isPrimary,
                  position,
                })
              ),
            },
          })),
        },
      },
      include: {
        variants: true,
        colours: {
          include: {
            images: { orderBy: { position: "asc" } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

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