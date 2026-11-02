export type ProductColourImageInput = {
  imageUrl: string;
  imagePublicId: string | null;
  imageUploadProof: string | null;
  isPrimary: boolean;
};

export type ProductColourInput = {
  name: string;
  hexColor: string;
  images: ProductColourImageInput[];
};

export function parseProductColours(
  value: unknown
): ProductColourInput[] | null;

export function colourHexFromName(name: string): string;

export function isValidProductImageUrl(value: unknown): value is string;

export function buildProductGallerySlides(
  colours: {
    name: string;
    images?: {
      imageUrl: string;
      position: number;
      isPrimary: boolean;
    }[];
  }[],
  variants: { colour: string; imageUrl: string | null }[],
  fallbackImageUrl: string | null
): { imageUrl: string; colourName: string | null }[];

export function validateProductColourImageProofs(
  colours: ProductColourInput[],
  existingImages: { imageUrl: string; imagePublicId: string | null }[],
  verifyProof: (
    proof: string | null,
    imageUrl: string,
    publicId: string
  ) => boolean,
  isCloudinaryAsset: (imageUrl: string, publicId: string) => boolean
): boolean;
