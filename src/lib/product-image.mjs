import sharp from "sharp";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 10_000;
const MAX_PIXEL_COUNT = 100_000_000;

const imageFormats = {
  "image/jpeg": { extensions: ["jpg", "jpeg"], format: "jpeg" },
  "image/png": { extensions: ["png"], format: "png" },
  "image/webp": { extensions: ["webp"], format: "webp" },
};

export class ProductImageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProductImageValidationError";
  }
}

function configuredLimit(key, fallback, maximum) {
  const raw = process.env[key];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(
      `${key} must be a positive integer no greater than ${maximum}.`
    );
  }

  return value;
}

export function getProductImageLimits() {
  return {
    maxBytes: configuredLimit(
      "MAX_PRODUCT_IMAGE_BYTES",
      8 * 1024 * 1024,
      MAX_FILE_BYTES
    ),
    maxDimension: configuredLimit(
      "MAX_PRODUCT_IMAGE_DIMENSION",
      6_000,
      MAX_DIMENSION
    ),
    maxPixels: configuredLimit(
      "MAX_PRODUCT_IMAGE_PIXELS",
      25_000_000,
      MAX_PIXEL_COUNT
    ),
  };
}

export async function validateProductImage(
  buffer,
  mimeType,
  fileName,
  limits = getProductImageLimits()
) {
  if (buffer.length === 0 || buffer.length > limits.maxBytes) {
    throw new ProductImageValidationError(
      `Image must be smaller than ${Math.floor(limits.maxBytes / (1024 * 1024))} MB.`
    );
  }

  const format = Object.hasOwn(imageFormats, mimeType)
    ? imageFormats[mimeType]
    : undefined;
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (
    !format ||
    !extension ||
    !format.extensions.some((allowed) => allowed === extension)
  ) {
    throw new ProductImageValidationError(
      "Choose a JPEG, PNG, or WebP image with a matching file extension."
    );
  }

  let width = 0;
  let height = 0;
  let normalized;
  try {
    const image = sharp(buffer, {
      failOn: "error",
      limitInputPixels: limits.maxPixels,
    });
    const metadata = await image.metadata();

    if (
      metadata.format !== format.format ||
      !metadata.width ||
      !metadata.height ||
      metadata.width < 64 ||
      metadata.height < 64 ||
      metadata.width > limits.maxDimension ||
      metadata.height > limits.maxDimension ||
      metadata.width * metadata.height > limits.maxPixels ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new ProductImageValidationError(
        "Image content, dimensions, or animation is not supported."
      );
    }

    width = metadata.width;
    height = metadata.height;
    normalized = await sharp(buffer, {
      failOn: "error",
      limitInputPixels: limits.maxPixels,
    })
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    if (error instanceof ProductImageValidationError) {
      throw error;
    }

    throw new ProductImageValidationError(
      "The selected file is not a valid, decodable image."
    );
  }

  if (normalized.length > limits.maxBytes) {
    throw new ProductImageValidationError(
      "The processed image exceeds the configured file-size limit."
    );
  }

  return { buffer: normalized, width, height };
}
