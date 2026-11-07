import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";
import {
  deleteProductImage,
  getProductImageUrlReference,
  isManagedProductImagePublicId,
  isProductImageAsset,
} from "@/lib/product-image-storage";
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

type UpdatedProduct = {
  imagePublicId: string | null;
  colours: {
    images: { imagePublicId: string | null }[];
  }[];
};

type DeletedProduct = {
  imagePublicId: string | null;
  colours: {
    images: { imagePublicId: string | null }[];
  }[];
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
    const supabase = createSupabaseAdminClient();

    const { data: existing, error: existingError } = await supabase
      .from("Product")
      .select("*, variants:ProductVariant(*), colours:ProductColour(*, images:ProductColourImage(*))")
      .eq("id", id)
      .eq("variants.isActive", true)
      .maybeSingle();
    if (existingError) throw existingError;

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
          !isProductImageAsset(
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
          isProductImageAsset
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
      const { data: removed, error: removedError } = await supabase
        .from("ProductVariant")
        .select("id, colour, size")
        .in("id", removedVariantIds)
        .eq("productId", id);
      if (removedError) throw removedError;
      const removedVariants = removed ?? [];
      if (removedVariants.length !== removedVariantIds.length) {
        return NextResponse.json(
          { error: "One or more variants no longer belong to this product." },
          { status: 409 }
        );
      }
      if (
        removedVariants.some((variant) =>
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

    const { data: updateResult, error: updateError } = await supabase.rpc(
      "admin_update_product",
      {
        p_product_id: id,
        p_data: data,
        p_variants: variantInputs ?? null,
        p_colours:
          colourInputs?.map(({ name, hexColor, images }) => ({
            name,
            hexColor,
            images: images.map(
              ({ imageUrl, imagePublicId, isPrimary }) => ({
                imageUrl,
                imagePublicId,
                isPrimary,
              })
            ),
          })) ?? null,
        p_removed_variant_ids: removedVariantIds as string[],
      }
    );
    if (updateError) {
      if (updateError.code === "P0002") {
        return NextResponse.json(
          { error: "Product not found." },
          { status: 404 }
        );
      }
      throw updateError;
    }
    if (
      !updateResult ||
      typeof updateResult !== "object" ||
      Array.isArray(updateResult)
    ) {
      throw new Error("Supabase did not return the updated product.");
    }
    const updatePayload = updateResult as { [key: string]: Json | undefined };
    if (
      !updatePayload.product ||
      typeof updatePayload.product !== "object" ||
      Array.isArray(updatePayload.product) ||
      typeof updatePayload.retainedHistoricalVariants !== "number"
    ) {
      throw new Error("Supabase returned an invalid product update response.");
    }
    const updated = updatePayload.product as unknown as UpdatedProduct;
    const retainedHistoricalVariants =
      updatePayload.retainedHistoricalVariants;

    const warnings: string[] = [];
    if (retainedHistoricalVariants > 0) {
      warnings.push(
        `${retainedHistoricalVariants} variant(s) linked to order history were kept with zero stock.`
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
          "The product was saved, but its previous uploaded image needs manual cleanup."
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
    const supabase = createSupabaseAdminClient();
    const { data: deletedProduct, error: deleteError } = await supabase.rpc(
      "admin_delete_product",
      { p_product_id: id }
    );
    if (deleteError) throw deleteError;

    if (
      !deletedProduct ||
      typeof deletedProduct !== "object" ||
      Array.isArray(deletedProduct)
    ) {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 }
      );
    }
    const deletedProductRecord = deletedProduct as DeletedProduct;

    const colourImages = Array.isArray(deletedProductRecord.colours)
      ? deletedProductRecord.colours.flatMap((colour) =>
          Array.isArray(colour.images) ? colour.images : []
        )
      : [];
    const imageAssets = new Set(
      [
        deletedProductRecord.imagePublicId,
        ...colourImages.map((image) => image.imagePublicId),
      ].filter(
        (publicId): publicId is string =>
          typeof publicId === "string" &&
          isManagedProductImagePublicId(publicId)
      )
    );
    let imageCleanupFailed = false;

    for (const imagePublicId of imageAssets) {
      try {
        const imageUrlReference = getProductImageUrlReference(imagePublicId);
        const [
          productIdReference,
          productUrlReference,
          colourIdReference,
          colourUrlReference,
          variantUrlReference,
        ] = await Promise.all([
          supabase.from("Product").select("id").eq("imagePublicId", imagePublicId).limit(1),
          supabase.from("Product").select("id").ilike("imageUrl", `%${imageUrlReference}%`).limit(1),
          supabase.from("ProductColourImage").select("id").eq("imagePublicId", imagePublicId).limit(1),
          supabase.from("ProductColourImage").select("id").ilike("imageUrl", `%${imageUrlReference}%`).limit(1),
          supabase.from("ProductVariant").select("id").ilike("imageUrl", `%${imageUrlReference}%`).limit(1),
        ]);
        const referenceResults = [
          productIdReference,
          productUrlReference,
          colourIdReference,
          colourUrlReference,
          variantUrlReference,
        ];
        const referenceError = referenceResults.find((result) => result.error)?.error;
        if (referenceError) throw referenceError;

        if (referenceResults.some((result) => result.data?.length)) {
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