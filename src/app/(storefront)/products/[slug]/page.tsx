
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import ProductDetails from "./ProductDetails";

export const instant = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProductPage({ params }: PageProps) {
  await connection();
  const { slug } = await params;

  const supabase = createSupabaseAdminClient();
  const productSelection =
    "id, name, slug, description, price, discountPrice, isFeatured, category, imageUrl, isActive, variants:ProductVariant(id, colour, size, imageUrl, isActive), colours:ProductColour(id, name, hexColor, sortOrder, images:ProductColourImage(id, imageUrl, position, isPrimary))";
  const findProduct = async (value: string) => {
    const { data, error } = await supabase
      .from("Product")
      .select(productSelection)
      .eq("slug", value)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  let product = await findProduct(slug);

  if (!product) {
    try {
      const decodedSlug = decodeURIComponent(slug);
      if (decodedSlug !== slug) {
        product = await findProduct(decodedSlug);
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
        variants: product.variants.filter((variant) => variant.isActive).map((variant) => ({
          id: variant.id,
          colour: variant.colour,
          size: variant.size,
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
