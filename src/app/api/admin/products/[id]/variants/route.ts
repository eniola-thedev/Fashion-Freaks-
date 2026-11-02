import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 }
      );
    }

    // A repeated colour/size combination updates its stock
    // instead of creating a duplicate variant.
    const variant = await prisma.$transaction(async (tx) => {
      const existingColour = await tx.productColour.findFirst({
        where: {
          productId,
          name: { equals: colour, mode: "insensitive" },
        },
        select: { id: true, name: true },
      });
      if (!existingColour) {
        const colourCount = await tx.productColour.count({
          where: { productId },
        });
        await tx.productColour.create({
          data: {
            productId,
            name: colour,
            hexColor: colourHexFromName(colour),
            sortOrder: colourCount,
          },
        });
      }

      const savedColourName = existingColour?.name ?? colour;
      const existingVariant = await tx.productVariant.findFirst({
        where: {
          productId,
          colour: { equals: savedColourName, mode: "insensitive" },
          size: { equals: size, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (existingVariant) {
        return tx.productVariant.update({
          where: { id: existingVariant.id },
          data: { stock, isActive: true },
        });
      }

      return tx.productVariant.create({
        data: {
          productId,
          colour: savedColourName,
          size,
          stock,
          isActive: true,
        },
      });
    });

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