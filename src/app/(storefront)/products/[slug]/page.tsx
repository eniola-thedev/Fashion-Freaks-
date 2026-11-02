
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import ProductDetails from "./ProductDetails";

export const instant = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProductPage({ params }: PageProps) {
  await connection();
  const { slug } = await params;

  const productSelect = {
    id: true,
    name: true,
    slug: true,
    description: true,
    price: true,
    discountPrice: true,
    isFeatured: true,
    category: true,
    imageUrl: true,
    isActive: true,
    variants: {
      where: { isActive: true },
      select: {
        id: true,
        colour: true,
        size: true,
        stock: true,
        imageUrl: true,
      },
      orderBy: [{ colour: "asc" }, { size: "asc" }],
    },
    colours: {
      select: {
        id: true,
        name: true,
        hexColor: true,
        images: {
          select: {
            id: true,
            imageUrl: true,
            position: true,
            isPrimary: true,
          },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    },
  } satisfies Prisma.ProductSelect;

  let product = await prisma.product.findUnique({
    where: { slug },
    select: productSelect,
  });

  if (!product) {
    try {
      const decodedSlug = decodeURIComponent(slug);
      if (decodedSlug !== slug) {
        product = await prisma.product.findUnique({
          where: { slug: decodedSlug },
          select: productSelect,
        });
      }
    } catch (error) {
      if (error instanceof URIError) {
        notFound();
      }
      throw error;
    }
  }

  if (!product?.isActive) {
    notFound();
  }

  return (
    <ProductDetails
      key={product.id}
      product={{
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        discountPrice: product.discountPrice,
        isFeatured: product.isFeatured,
        category: product.category,
        imageUrl: product.imageUrl,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          colour: variant.colour,
          size: variant.size,
          stock: variant.stock,
          imageUrl: variant.imageUrl,
        })),
        colours: product.colours.map((colour) => ({
          id: colour.id,
          name: colour.name,
          hexColor: colour.hexColor,
          images: colour.images.map((image) => ({
            id: image.id,
            imageUrl: image.imageUrl,
            position: image.position,
            isPrimary: image.isPrimary,
          })),
        })),
      }}
    />
  );
}
