import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        category: true,
        colour: true,
        imageUrl: true,
        discountPrice: true,
        isFeatured: true,
        colours: {
          select: {
            id: true,
            name: true,
            hexColor: true,
            images: {
              select: {
                imageUrl: true,
                position: true,
                isPrimary: true,
              },
              orderBy: { position: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        variants: {
          where: { isActive: true },
          select: {
            id: true,
            colour: true,
            size: true,
            stock: true,
            imageUrl: true,
          },
        },
      },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("Failed to fetch products:", error);

    return NextResponse.json(
      { error: "Unable to fetch products" },
      { status: 500 }
    );
  }
}
