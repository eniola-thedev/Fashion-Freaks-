export type ProductImageLimits = {
  maxBytes: number;
  maxDimension: number;
  maxPixels: number;
};

export class ProductImageValidationError extends Error {
  constructor(message: string);
}

export function getProductImageLimits(): ProductImageLimits;

export function validateProductImage(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  limits?: ProductImageLimits
): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}>;
