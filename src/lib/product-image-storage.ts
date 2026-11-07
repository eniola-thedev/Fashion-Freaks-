import "server-only";

import { randomUUID } from "node:crypto";
import {
  deleteProductImage as deleteCloudinaryProductImage,
  isManagedProductPublicId as isManagedCloudinaryPublicId,
  isProductCloudinaryAsset,
} from "@/lib/cloudinary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SUPABASE_ASSET_PREFIX = "supabase/";
const PRODUCT_IMAGE_PATH = "fashion-freaks/products";

export class ProductImageStorageConfigurationError extends Error {
  constructor() {
    super(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
    this.name = "ProductImageStorageConfigurationError";
  }
}

function getStorageConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || "product-images";

  if (!url || !key || !/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/i.test(bucket)) {
    throw new ProductImageStorageConfigurationError();
  }

  return { url, bucket };
}

function supabaseObjectKey(publicId: string) {
  return publicId.slice(SUPABASE_ASSET_PREFIX.length);
}

export function getProductImageUrlReference(publicId: string) {
  return publicId.startsWith(SUPABASE_ASSET_PREFIX)
    ? supabaseObjectKey(publicId)
    : publicId;
}

export function isSupabaseProductImageAsset(
  imageUrl: unknown,
  publicId: unknown
): imageUrl is string {
  if (
    typeof imageUrl !== "string" ||
    imageUrl.length > 2000 ||
    typeof publicId !== "string" ||
    !publicId.startsWith(SUPABASE_ASSET_PREFIX) ||
    !/^fashion-freaks\/products\/[a-f0-9-]+\.jpg$/i.test(
      supabaseObjectKey(publicId)
    )
  ) {
    return false;
  }

  try {
    const { url, bucket } = getStorageConfig();
    const expectedUrl = new URL(
      `/storage/v1/object/public/${bucket}/${supabaseObjectKey(publicId)}`,
      url
    );
    const actualUrl = new URL(imageUrl);
    return (
      (actualUrl.protocol === "https:" ||
        actualUrl.hostname === "localhost" ||
        actualUrl.hostname === "127.0.0.1" ||
        actualUrl.hostname === "[::1]") &&
      actualUrl.origin === expectedUrl.origin &&
      actualUrl.pathname === expectedUrl.pathname &&
      !actualUrl.search &&
      !actualUrl.hash
    );
  } catch {
    return false;
  }
}

export function isProductImageAsset(imageUrl: unknown, publicId: unknown) {
  return (
    isSupabaseProductImageAsset(imageUrl, publicId) ||
    isProductCloudinaryAsset(imageUrl, publicId)
  );
}

export function isManagedProductImagePublicId(publicId: string) {
  return (
    (publicId.startsWith(SUPABASE_ASSET_PREFIX) &&
      /^fashion-freaks\/products\/[a-f0-9-]+\.jpg$/i.test(
        supabaseObjectKey(publicId)
      )) ||
    isManagedCloudinaryPublicId(publicId)
  );
}

export async function uploadProductImage(buffer: Buffer) {
  const { bucket } = getStorageConfig();
  const supabase = createSupabaseAdminClient();
  const objectKey = `${PRODUCT_IMAGE_PATH}/${randomUUID()}.jpg`;
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(objectKey, buffer, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) throw error;

  const { data: publicUrl } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);
  return {
    secure_url: publicUrl.publicUrl,
    public_id: `${SUPABASE_ASSET_PREFIX}${data.path}`,
  };
}

export async function deleteProductImage(publicId: string) {
  if (!isManagedProductImagePublicId(publicId)) {
    throw new Error("Refusing to delete an unmanaged product image.");
  }

  if (!publicId.startsWith(SUPABASE_ASSET_PREFIX)) {
    await deleteCloudinaryProductImage(publicId);
    return;
  }

  const { bucket } = getStorageConfig();
  const { error } = await createSupabaseAdminClient()
    .storage.from(bucket)
    .remove([supabaseObjectKey(publicId)]);
  if (error) throw error;
}
