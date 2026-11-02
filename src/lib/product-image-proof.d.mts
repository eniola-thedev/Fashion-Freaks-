export function createProductImageProof(
  imageUrl: string,
  publicId: string
): string;

export function verifyProductImageProof(
  proof: unknown,
  imageUrl: string,
  publicId: string
): boolean;
