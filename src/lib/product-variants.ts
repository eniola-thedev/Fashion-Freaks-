export type ProductVariantInput = {
  colour: string;
  size: string;
  stock: number;
};

export function parseProductVariants(
  value: unknown
): ProductVariantInput[] | null {
  if (!Array.isArray(value) || value.length > 300) {
    return null;
  }

  const combinations = new Set<string>();
  const variants: ProductVariantInput[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      return null;
    }

    const candidate = item as Record<string, unknown>;
    const colour =
      typeof candidate.colour === "string" ? candidate.colour.trim() : "";
    const size =
      typeof candidate.size === "string" ? candidate.size.trim() : "";
    const stock = candidate.stock;
    const combination = JSON.stringify([
      colour.toLocaleLowerCase(),
      size.toLocaleLowerCase(),
    ]);

    if (
      !colour ||
      colour.length > 80 ||
      !size ||
      size.length > 30 ||
      !Number.isSafeInteger(stock) ||
      (stock as number) < 0 ||
      (stock as number) > 1_000_000 ||
      combinations.has(combination)
    ) {
      return null;
    }

    combinations.add(combination);
    variants.push({ colour, size, stock: stock as number });
  }

  return variants;
}
