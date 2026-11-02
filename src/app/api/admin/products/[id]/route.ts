import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import {
  deleteProductImage,
  isManagedProductPublicId,
  isProductCloudinaryAsset,
} from "@/lib/cloudinary";
import { verifyProductImageProof } from "@/lib/product-image-proof.mjs";
import { parseProductVariants } from "@/lib/product-variants";
import {
  parseProductColours,
  validateProductColourImageProofs,
} from "@/lib/product-colours.mjs";

// export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function PATCH(
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
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: { where: { isActive: true } },
        colours: { include: { images: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 }
      );
    }

    const data: {
      name?: string;
      description?: string;
      price?: number;
      category?: string;
      colour?: string | null;
      imageUrl?: string | null;
      imagePublicId?: string | null;
      discountPrice?: number | null;
      isFeatured?: boolean;
      isActive?: boolean;
    } = {};

    if (body.name !== undefined) {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 150
      ) {
        return NextResponse.json(
          { error: "Invalid product name." },
          { status: 400 }
        );
      }

      data.name = body.name.trim();
    }

    if (body.description !== undefined) {
      if (
        typeof body.description !== "string" ||
        body.description.length > 5000
      ) {
        return NextResponse.json(
          { error: "Invalid description." },
          { status: 400 }
        );
      }

      data.description = body.description.trim();
    }

    if (body.price !== undefined) {
      if (
        !Number.isSafeInteger(body.price) ||
        body.price <= 0 ||
        body.price > 100_000_000
      ) {
        return NextResponse.json(
          { error: "Invalid price." },
          { status: 400 }
        );
      }

      data.price = body.price;
    }

    const updatedPrice =
      body.price === undefined ? existing.price : body.price;
    const updatedDiscountPrice =
      body.discountPrice === undefined
        ? existing.discountPrice
        : body.discountPrice;
    if (
      updatedDiscountPrice !== null &&
      (!Number.isSafeInteger(updatedDiscountPrice) ||
        updatedDiscountPrice <= 0 ||
        updatedDiscountPrice >= updatedPrice)
    ) {
      return NextResponse.json(
        { error: "The discounted price must be a positive amount below the regular price." },
        { status: 400 }
      );
    }

    if (body.discountPrice !== undefined) {
      data.discountPrice = body.discountPrice;
    }

    if (body.isFeatured !== undefined) {
      if (typeof body.isFeatured !== "boolean") {
        return NextResponse.json(
          { error: "Invalid featured product setting." },
          { status: 400 }
        );
      }

      data.isFeatured = body.isFeatured;
    }

    if (body.category !== undefined) {
      if (
        typeof body.category !== "string" ||
        !body.category.trim() ||
        body.category.trim().length > 80
      ) {
        return NextResponse.json(
          { error: "Invalid category." },
          { status: 400 }
        );
      }

      data.category = body.category.trim();
    }

    if (body.colour !== undefined) {
      if (
        body.colour !== null &&
        typeof body.colour !== "string"
      ) {
        return NextResponse.json(
          { error: "Invalid colour." },
          { status: 400 }
        );
      }

      if (
        typeof body.colour === "string" &&
        body.colour.trim().length > 80
      ) {
        return NextResponse.json(
          { error: "Colour is too long." },
          { status: 400 }
        );
      }

      data.colour =
        typeof body.colour === "string"
          ? body.colour.trim() || null
          : null;
    }

    if (body.imageUrl !== undefined) {
      if (!isValidImageUrl(body.imageUrl)) {
        return NextResponse.json(
          { error: "Enter a valid image URL." },
          { status: 400 }
        );
      }

      data.imageUrl =
        typeof body.imageUrl === "string"
          ? body.imageUrl.trim() || null
          : null;

      if (
        body.imagePublicId !== undefined &&
        body.imagePublicId !== null &&
        (typeof body.imagePublicId !== "string" ||
          !isProductCloudinaryAsset(
            data.imageUrl,
            body.imagePublicId.trim()
          ) ||
          (typeof body.imagePublicId === "string" &&
            body.imagePublicId !== existing.imagePublicId &&
            !verifyProductImageProof(
              body.imageUploadProof,
              data.imageUrl ?? "",
              body.imagePublicId.trim()
            )))
      ) {
        return NextResponse.json(
          { error: "The uploaded product image could not be verified." },
          { status: 400 }
        );
      }

      data.imagePublicId =
        typeof body.imagePublicId === "string"
          ? body.imagePublicId.trim()
          : null;
    } else if (body.imagePublicId !== undefined) {
      return NextResponse.json(
        { error: "An image URL is required with an image asset ID." },
        { status: 400 }
      );
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json(
          { error: "Invalid product status." },
          { status: 400 }
        );
      }

      data.isActive = body.isActive;
    }

    const variantInputs =
      body.variants === undefined
        ? undefined
        : parseProductVariants(body.variants);
    const colourInputs =
      body.colours === undefined
        ? undefined
        : parseProductColours(body.colours);
    const hasRemovedVariantIds = body.removedVariantIds !== undefined;
    const removedVariantIds = hasRemovedVariantIds
      ? body.removedVariantIds
      : [];

    if (
      variantInputs === null ||
      colourInputs === null ||
      !Array.isArray(removedVariantIds) ||
      removedVariantIds.length > 300 ||
      removedVariantIds.some(
        (variantId) =>
          typeof variantId !== "string" ||
          variantId.length === 0 ||
          variantId.length > 100
      ) ||
      (variantInputs === undefined && removedVariantIds.length > 0) ||
      new Set(removedVariantIds).size !== removedVariantIds.length
    ) {
      return NextResponse.json(
        { error: "Please check the product variants and try again." },
        { status: 400 }
      );
    }

    if (colourInputs) {
      const removedIds = new Set(removedVariantIds as string[]);
      const variantColours = new Set([
        ...existing.variants
          .filter((variant) => !removedIds.has(variant.id))
          .map((variant) => variant.colour.toLocaleLowerCase()),
        ...(variantInputs ?? []).map((variant) =>
          variant.colour.toLocaleLowerCase()
        ),
      ]);
      const colourNames = new Set(
        colourInputs.map((colour) => colour.name.toLocaleLowerCase())
      );
      if (
        [...variantColours].some((colour) => !colourNames.has(colour)) ||
        !validateProductColourImageProofs(
          colourInputs,
          existing.colours.flatMap((colour) => colour.images),
          verifyProductImageProof,
          isProductCloudinaryAsset
        )
      ) {
        return NextResponse.json(
          { error: "Please check the product colours and images and try again." },
          { status: 400 }
        );
      }
    }

    const selectedCombinations = new Set(
      (variantInputs ?? []).map((variant) =>
        JSON.stringify([
          variant.colour.toLocaleLowerCase(),
          variant.size.toLocaleLowerCase(),
        ])
      )
    );
    if (removedVariantIds.length > 0) {
      const removed = await prisma.productVariant.findMany({
        where: { id: { in: removedVariantIds }, productId: id },
        select: { id: true, colour: true, size: true },
      });
      if (removed.length !== removedVariantIds.length) {
        return NextResponse.json(
          { error: "One or more variants no longer belong to this product." },
          { status: 409 }
        );
      }
      if (
        removed.some((variant) =>
          selectedCombinations.has(
            JSON.stringify([
              variant.colour.toLocaleLowerCase(),
              variant.size.toLocaleLowerCase(),
            ])
          )
        )
      ) {
        return NextResponse.json(
          { error: "A variant cannot be updated and removed at the same time." },
          { status: 400 }
        );
      }
    }

    const updateResult = await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });
      let retainedHistoricalVariants = 0;

      for (const variant of variantInputs ?? []) {
        await tx.productVariant.upsert({
          where: {
            productId_colour_size: {
              productId: id,
              colour: variant.colour,
              size: variant.size,
            },
          },
          create: {
            productId: id,
            ...variant,
          },
          update: { stock: variant.stock, isActive: true },
        });
      }

      if (colourInputs) {
        const keptColourIds: string[] = [];
        for (const [sortOrder, colour] of colourInputs.entries()) {
          const savedColour = await tx.productColour.upsert({
            where: {
              productId_name: { productId: id, name: colour.name },
            },
            create: {
              productId: id,
              name: colour.name,
              hexColor: colour.hexColor,
              sortOrder,
            },
            update: {
              hexColor: colour.hexColor,
              sortOrder,
            },
            select: { id: true },
          });
          keptColourIds.push(savedColour.id);
        }

        await tx.productColourImage.deleteMany({
          where: { colour: { productId: id } },
        });

        for (const colour of colourInputs) {
          const savedColour = await tx.productColour.findUniqueOrThrow({
            where: {
              productId_name: { productId: id, name: colour.name },
            },
            select: { id: true },
          });
          if (colour.images.length > 0) {
            await tx.productColourImage.createMany({
              data: colour.images.map(
                ({ imageUrl, imagePublicId, isPrimary }, position) => ({
                  colourId: savedColour.id,
                  imageUrl,
                  imagePublicId,
                  isPrimary,
                  position,
                })
              ),
            });
          }
        }

        if (keptColourIds.length > 0) {
          await tx.productColour.deleteMany({
            where: {
              productId: id,
              id: { notIn: keptColourIds },
            },
          });
        } else {
          await tx.productColour.deleteMany({
            where: { productId: id },
          });
        }
      }

      for (const variantId of removedVariantIds as string[]) {
        const orderItem = await tx.orderItem.findFirst({
          where: { variantId },
          select: { id: true },
        });
        if (orderItem) {
          retainedHistoricalVariants += 1;
          await tx.productVariant.updateMany({
            where: { id: variantId, productId: id },
            data: { stock: 0, isActive: false },
          });
        } else {
          await tx.productVariant.deleteMany({
            where: { id: variantId, productId: id },
          });
        }
      }

      return {
        product: await tx.product.findUniqueOrThrow({
          where: { id },
          include: {
            variants: { where: { isActive: true } },
            colours: {
              include: {
                images: { orderBy: { position: "asc" } },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        }),
        retainedHistoricalVariants,
      };
    });
    const updated = updateResult.product;

    const warnings: string[] = [];
    if (updateResult.retainedHistoricalVariants > 0) {
      warnings.push(
        `${updateResult.retainedHistoricalVariants} variant(s) linked to order history were kept with zero stock.`
      );
    }
    if (
      existing.imagePublicId &&
      existing.imagePublicId !== updated.imagePublicId &&
      !updated.colours.some((colour) =>
        colour.images.some(
          (image) => image.imagePublicId === existing.imagePublicId
        )
      )
    ) {
      try {
        await deleteProductImage(existing.imagePublicId);
      } catch (error) {
        console.error(
          "Previous product image cleanup failed:",
          error
        );
        warnings.push(
          "The product was saved, but its previous Cloudinary image needs manual cleanup."
        );
      }
    }
    if (colourInputs) {
      const retainedImageIds = new Set(
        colourInputs.flatMap((colour) =>
          colour.images.flatMap((image) =>
            image.imagePublicId ? [image.imagePublicId] : []
          )
        )
      );
      if (updated.imagePublicId) {
        retainedImageIds.add(updated.imagePublicId);
      }
      const removedImageIds = new Set(
        existing.colours.flatMap((colour) =>
          colour.images.flatMap((image) =>
            image.imagePublicId &&
            !retainedImageIds.has(image.imagePublicId)
              ? [image.imagePublicId]
              : []
          )
        )
      );
      for (const publicId of removedImageIds) {
        try {
          await deleteProductImage(publicId);
        } catch (error) {
          console.error("Previous colour image cleanup failed:", error);
          warnings.push(
            "The product was saved, but one or more previous colour images need manual cleanup."
          );
          break;
        }
      }
    }

    return NextResponse.json({
      product: updated,
      ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
    });
  } catch (error) {
    console.error("Admin product update failed:", error);

    return NextResponse.json(
      { error: "Could not update the product." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
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
    const { id } = await context.params;
    const deletedProduct = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id },
        select: {
          imageUrl: true,
          imagePublicId: true,
          colours: {
            select: {
              images: {
                select: {
                  imageUrl: true,
                  imagePublicId: true,
                },
              },
            },
          },
        },
      });

      if (!product) return null;

      await tx.product.delete({ where: { id } });

      return [
        ...(product.imagePublicId
          ? [{
              imagePublicId: product.imagePublicId,
              imageUrl: product.imageUrl,
            }]
          : []),
        ...product.colours.flatMap((colour) =>
          colour.images.flatMap((image) =>
            image.imagePublicId
              ? [{
                  imagePublicId: image.imagePublicId,
                  imageUrl: image.imageUrl,
                }]
              : []
          )
        ),
      ];
    });

    if (!deletedProduct) {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 }
      );
    }

    const imageAssets = new Set(
      deletedProduct.flatMap((image) =>
        image.imagePublicId &&
        isManagedProductPublicId(image.imagePublicId)
          ? [image.imagePublicId]
          : []
      )
    );
    let imageCleanupFailed = false;

    for (const imagePublicId of imageAssets) {
      try {
        const [productReference, colourImageReference, variantReference] =
          await Promise.all([
            prisma.product.findFirst({
              where: {
                OR: [
                  { imagePublicId },
                  { imageUrl: { contains: imagePublicId } },
                ],
              },
              select: { id: true },
            }),
            prisma.productColourImage.findFirst({
              where: {
                OR: [
                  { imagePublicId },
                  { imageUrl: { contains: imagePublicId } },
                ],
              },
              select: { id: true },
            }),
            prisma.productVariant.findFirst({
              where: { imageUrl: { contains: imagePublicId } },
              select: { id: true },
            }),
          ]);

        if (productReference || colourImageReference || variantReference) {
          continue;
        }

        await deleteProductImage(imagePublicId);
      } catch (error) {
        console.error("Deleted product image cleanup failed:", error);
        imageCleanupFailed = true;
      }
    }

    return NextResponse.json({
      success: true,
      ...(imageCleanupFailed
        ? {
            warning:
              "The product was deleted, but one or more uploaded images could not be safely removed.",
          }
        : {}),
    });
  } catch (error) {
    console.error("Admin product deletion failed:", error);

    return NextResponse.json(
      { error: "Could not delete the product. Please try again." },
      { status: 500 }
    );
  }
}