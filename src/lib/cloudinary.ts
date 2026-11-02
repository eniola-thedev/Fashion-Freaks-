import "server-only";

import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";

const PRODUCT_IMAGE_FOLDER = "fashion-freaks/products";

export class CloudinaryConfigurationError extends Error {
  constructor() {
    super("Cloudinary image storage is not configured.");
    this.name = "CloudinaryConfigurationError";
  }
}

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new CloudinaryConfigurationError();
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
}

export function isProductCloudinaryAsset(
  imageUrl: unknown,
  publicId: unknown
): imageUrl is string {
  if (
    typeof imageUrl !== "string" ||
    imageUrl.length > 2000 ||
    typeof publicId !== "string" ||
    publicId.length > 255 ||
    !publicId.startsWith(`${PRODUCT_IMAGE_FOLDER}/`) ||
    !/^[a-zA-Z0-9/_-]+$/.test(publicId)
  ) {
    return false;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;

  try {
    const url = new URL(imageUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.startsWith(`/${cloudName}/image/upload/`) &&
      url.pathname.includes(`/${publicId}.`)
    );
  } catch {
    return false;
  }
}

export function isManagedProductPublicId(publicId: string) {
  return (
    publicId.length <= 255 &&
    publicId.startsWith(`${PRODUCT_IMAGE_FOLDER}/`) &&
    /^[a-zA-Z0-9/_-]+$/.test(publicId)
  );
}

export async function uploadProductImage(buffer: Buffer) {
  const client = configureCloudinary();

  return new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: PRODUCT_IMAGE_FOLDER,
        public_id: randomUUID(),
        resource_type: "image",
        overwrite: false,
        unique_filename: false,
        use_filename: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.secure_url || !result.public_id) {
          reject(new Error("Cloudinary returned an incomplete upload result."));
          return;
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

export async function deleteProductImage(publicId: string) {
  if (!isManagedProductPublicId(publicId)) {
    throw new Error("Refusing to delete an unmanaged Cloudinary asset.");
  }

  const result = await configureCloudinary().uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });

  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary asset cleanup failed (${result.result}).`);
  }
}
