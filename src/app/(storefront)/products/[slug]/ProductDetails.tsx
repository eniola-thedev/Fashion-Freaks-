
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readCart, writeCart, type CartItem } from "@/lib/cart";
import {
  buildProductGallerySlides,
  colourHexFromName,
  isValidProductImageUrl,
} from "@/lib/product-colours.mjs";

type Variant = {
  id: string;
  colour: string;
  size: string;
  imageUrl: string | null;
};

type ColourImage = {
  id: string;
  imageUrl: string;
  position: number;
  isPrimary: boolean;
};

type Colour = {
  id: string;
  name: string;
  hexColor: string;
  images: ColourImage[];
};

type GallerySlide = {
  imageUrl: string;
  colourName: string | null;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  discountPrice: number | null;
  isFeatured: boolean;
  category: string;
  imageUrl: string | null;
  variants: Variant[];
  colours: Colour[];
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);

const sameColour = (first: string, second: string) =>
  first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();

export default function ProductDetails({
  product,
}: {
  product: Product;
}) {
  const router = useRouter();
  const colours = useMemo(() => {
    if (product.colours.length > 0) return product.colours;

    const names = product.variants.reduce<string[]>((result, variant) => {
      if (!result.some((name) => sameColour(name, variant.colour))) {
        result.push(variant.colour);
      }
      return result;
    }, []);
    return names.map((name) => ({
      id: name,
      name,
      hexColor: colourHexFromName(name),
      images: product.variants.flatMap((variant, position) =>
        sameColour(variant.colour, name) && variant.imageUrl
          ? [{
              id: variant.id,
              imageUrl: variant.imageUrl,
              position,
              isPrimary: position === 0,
            }]
          : []
      ),
    }));
  }, [product.colours, product.variants]);

  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [unavailableColourThumbnails, setUnavailableColourThumbnails] =
    useState<Set<string>>(() => new Set());
  const galleryRef = useRef<HTMLDivElement>(null);
  const colourSelectorRef = useRef<HTMLDivElement>(null);
  const colourButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const gallerySlides = useMemo<GallerySlide[]>(
    () =>
      buildProductGallerySlides(
        colours,
        product.variants,
        product.imageUrl
      ),
    [colours, product.imageUrl, product.variants]
  );
  const [selectedColour, setSelectedColour] = useState(
    gallerySlides[0]?.colourName ?? colours[0]?.name ?? ""
  );
  const sizes = useMemo(
    () =>
      [
        ...new Set(
          product.variants
            .filter((variant) =>
              sameColour(variant.colour, selectedColour)
            )
            .map((variant) => variant.size)
        ),
      ].sort((first, second) =>
        first.localeCompare(second, undefined, { numeric: true })
      ),
    [product.variants, selectedColour]
  );
  const selectedColourHasImages =
    colours.length === 0
      ? gallerySlides.length > 0
      : gallerySlides.some(
          (slide) =>
            slide.colourName &&
            sameColour(slide.colourName, selectedColour)
        );
  const showGallery = gallerySlides.length > 0 && selectedColourHasImages;

  const selectedVariant = product.variants.find(
    (variant) =>
      sameColour(variant.colour, selectedColour) &&
      variant.size === selectedSize
  );

  const activeSlide = gallerySlides[activeGalleryIndex] ?? gallerySlides[0];
  const image = activeSlide?.imageUrl ?? null;
  const currentPrice = product.discountPrice ?? product.price;

  const scrollColourIntoView = useCallback((colourName: string) => {
    const container = colourSelectorRef.current;
    const selectedButton = colours.find((colour) =>
      sameColour(colour.name, colourName)
    );
    const button = selectedButton
      ? colourButtonRefs.current.get(selectedButton.id)
      : null;
    if (!container || !button) return;

    const containerBounds = container.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const visibleLeft = containerBounds.left + container.clientLeft;
    const visibleRight = visibleLeft + container.clientWidth;
    let targetLeft = container.scrollLeft;

    if (buttonBounds.left < visibleLeft) {
      targetLeft += buttonBounds.left - visibleLeft;
    } else if (buttonBounds.right > visibleRight) {
      targetLeft += buttonBounds.right - visibleRight;
    }

    if (targetLeft !== container.scrollLeft) {
      container.scrollTo({
        left: Math.max(
          0,
          Math.min(container.scrollWidth - container.clientWidth, targetLeft)
        ),
        behavior: "smooth",
      });
    }
  }, [colours]);

  useEffect(() => {
    scrollColourIntoView(selectedColour);
  }, [scrollColourIntoView, selectedColour]);

  function scrollToGalleryIndex(
    index: number,
    behavior: ScrollBehavior = "smooth"
  ) {
    const safeIndex = Math.max(0, Math.min(gallerySlides.length - 1, index));
    setActiveGalleryIndex(safeIndex);
    galleryRef.current?.scrollTo({
      left: safeIndex * galleryRef.current.clientWidth,
      behavior,
    });

    const nextColour = gallerySlides[safeIndex]?.colourName;
    if (nextColour && !sameColour(nextColour, selectedColour)) {
      setSelectedColour(nextColour);
      scrollColourIntoView(nextColour);
      setSelectedSize("");
      setQuantity(1);
      setMessage("");
    }
  }

  function handleGalleryScroll() {
    const gallery = galleryRef.current;
    if (!gallery || gallerySlides.length === 0) return;

    const index = Math.max(
      0,
      Math.min(
        gallerySlides.length - 1,
        Math.round(gallery.scrollLeft / gallery.clientWidth)
      )
    );
    setActiveGalleryIndex(index);
    const nextColour = gallerySlides[index]?.colourName;
    if (nextColour && !sameColour(nextColour, selectedColour)) {
      setSelectedColour(nextColour);
      scrollColourIntoView(nextColour);
      setSelectedSize("");
      setQuantity(1);
      setMessage("");
    }
  }

  function addToBag() {
    setMessage("");

    if (product.variants.length === 0) {
      setMessage(
        "Online ordering is unavailable for this item. Please contact us to confirm availability."
      );
      return false;
    }

    if (!selectedColour || !selectedSize) {
      setMessage("Please select an available colour and size.");
      return false;
    }

    if (!selectedVariant) {
      setMessage("Sorry, this colour and size are no longer available.");
      return false;
    }

    if (quantity > 10) {
      setMessage("You can add up to 10 of this option at a time.");
      return false;
    }

    try {
      const cart: CartItem[] = readCart();

      const existingItem = cart.find(
        (item) => item.variantId === selectedVariant.id
      );

      if (existingItem) {
        if (existingItem.quantity + quantity > 10) {
          setMessage("You can add up to 10 of this option at a time.");
          return false;
        }

        existingItem.quantity += quantity;
      } else {
        cart.push({
          variantId: selectedVariant.id,
          productId: product.id,
          name: product.name,
          slug: product.slug,
          colour: selectedColour,
          size: selectedSize,
          price: currentPrice,
          quantity,
          image: image ?? "",
        });
      }

      writeCart(cart);

      setMessage("Added to your bag successfully.");
      return true;
    } catch {
      setMessage("Could not update your bag. Please try again.");
      return false;
    }
  }

  return (
    <main className="detail-page">
      <nav className="detail-breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/#shop">Shop</Link>
        <span>/</span>
        <span>{product.name}</span>
      </nav>

      <section className="detail-layout">
        <div className="detail-media">
          <div className="detail-image-panel">
            {showGallery ? (
              <div
                className="detail-image-carousel"
                ref={galleryRef}
                onScroll={handleGalleryScroll}
                aria-label="Product image gallery. Swipe or scroll to view every colour."
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    scrollToGalleryIndex(activeGalleryIndex + 1);
                  } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    scrollToGalleryIndex(activeGalleryIndex - 1);
                  }
                }}
              >
                {gallerySlides.map((slide, index) => (
                  <div
                    className="detail-image-slide"
                    key={`${slide.colourName ?? "product"}-${slide.imageUrl}`}
                    aria-label={`${slide.colourName ? `${slide.colourName}, ` : ""}image ${index + 1} of ${gallerySlides.length}`}
                  >
                    <img
                      src={slide.imageUrl}
                      alt={`${product.name}${slide.colourName ? ` in ${slide.colourName}` : ""}, image ${index + 1}`}
                      className="detail-image"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="detail-image-placeholder" role="status">
                {selectedColour
                  ? `No product images uploaded for ${selectedColour}`
                  : "Product image coming soon"}
              </div>
            )}
          </div>
          {showGallery && gallerySlides.length > 1 && (
            <div className="detail-gallery-controls">
              <button
                type="button"
                className="detail-gallery-arrow"
                onClick={() => scrollToGalleryIndex(activeGalleryIndex - 1)}
                disabled={activeGalleryIndex === 0}
                aria-label="Previous product image"
              >
                ‹
              </button>
              <div
                className="detail-gallery-pagination"
                aria-live="polite"
                aria-label={`Image ${activeGalleryIndex + 1} of ${gallerySlides.length}`}
              >
                {gallerySlides.map((slide, index) => (
                  <button
                    type="button"
                    key={`${slide.colourName ?? "product"}-${slide.imageUrl}`}
                    className={`detail-gallery-dot${activeGalleryIndex === index ? " selected" : ""}`}
                    onClick={() => scrollToGalleryIndex(index)}
                    aria-label={`View ${slide.colourName ? `${slide.colourName} ` : ""}image ${index + 1}`}
                    aria-pressed={activeGalleryIndex === index}
                  />
                ))}
                <span>{activeGalleryIndex + 1} / {gallerySlides.length}</span>
              </div>
              <button
                type="button"
                className="detail-gallery-arrow"
                onClick={() => scrollToGalleryIndex(activeGalleryIndex + 1)}
                disabled={activeGalleryIndex === gallerySlides.length - 1}
                aria-label="Next product image"
              >
                ›
              </button>
            </div>
          )}
        </div>

        <div className="detail-information">
          <span className="detail-category">
            {product.category}
          </span>

          <h1>{product.name}</h1>

          <p className="detail-price">
            {money(currentPrice)}
            {product.discountPrice !== null && (
              <span className="detail-original-price">
                {money(product.price)}
              </span>
            )}
          </p>
          {product.isFeatured && (
            <span className="detail-featured-label">Featured piece</span>
          )}

          <p className="detail-description">
            {product.description ||
              "A considered essential for your everyday wardrobe."}
          </p>

          <div className="detail-option">
            <div className="detail-option-heading">
              <strong>Colour</strong>
              <span>{selectedColour || "Unavailable"}</span>
            </div>

            {colours.length > 0 ? (
              <div className="detail-colours" ref={colourSelectorRef}>
                {colours.map((colour) => {
                  const hasAvailableVariant = product.variants
                    .filter((variant) =>
                      sameColour(variant.colour, colour.name)
                    )
                    .length > 0;
                  const thumbnail =
                    colour.images.find(
                      (item) =>
                        item.isPrimary &&
                        isValidProductImageUrl(item.imageUrl)
                    )?.imageUrl ??
                    colour.images.find((item) =>
                      isValidProductImageUrl(item.imageUrl)
                    )?.imageUrl ??
                    product.variants.find(
                      (variant) =>
                        sameColour(variant.colour, colour.name) &&
                        isValidProductImageUrl(variant.imageUrl)
                    )?.imageUrl ??
                    null;
                  const thumbnailKey = `${colour.id}:${thumbnail}`;
                  return (
                    <button
                      key={colour.id}
                      ref={(node) => {
                        if (node) {
                          colourButtonRefs.current.set(colour.id, node);
                        } else {
                          colourButtonRefs.current.delete(colour.id);
                        }
                      }}
                      type="button"
                      className={`detail-colour-button ${
                        selectedColour === colour.name ? "selected" : ""
                      }`}
                      onClick={() => {
                        setSelectedColour(colour.name);
                        setSelectedSize("");
                        setQuantity(1);
                        setMessage("");
                        const firstImageIndex = gallerySlides.findIndex(
                          (slide) =>
                            slide.colourName &&
                            sameColour(slide.colourName, colour.name)
                        );
                        if (firstImageIndex >= 0) {
                          scrollToGalleryIndex(firstImageIndex, "auto");
                        }
                      }}
                      aria-pressed={selectedColour === colour.name}
                      aria-label={`${colour.name}${hasAvailableVariant ? "" : ", unavailable"}`}
                      title={`${colour.name}${hasAvailableVariant ? "" : " · Unavailable"}`}
                    >
                      <span
                        className="detail-colour-swatch"
                      >
                        {thumbnail &&
                        !unavailableColourThumbnails.has(thumbnailKey) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbnail}
                            alt=""
                            aria-hidden="true"
                            onError={() =>
                              setUnavailableColourThumbnails((current) =>
                                new Set(current).add(thumbnailKey)
                              )
                            }
                          />
                        ) : (
                          <span className="detail-colour-image-placeholder">
                            Image unavailable
                          </span>
                        )}
                      </span>
                      <span className="detail-colour-label">{colour.name}</span>
                      {!hasAvailableVariant && (
                        <span className="detail-colour-unavailable">
                          Unavailable
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p>
                {product.variants.length === 0
                  ? "Contact us to confirm available options."
                  : "Choose an available colour."}
              </p>
            )}
          </div>

          <div className="detail-option">
            <div className="detail-option-heading">
              <strong>Size</strong>
              <span>{selectedSize || "Select a size"}</span>
            </div>

            <div className="detail-sizes">
              {sizes.map((size) => {
                const variant = product.variants.find(
                  (v) =>
                    sameColour(v.colour, selectedColour) &&
                    v.size === size
                );

                return (
                  <button
                    key={size}
                    type="button"
                    className={`detail-size-button ${
                      selectedSize === size ? "selected" : ""
                    }`}
                    disabled={!variant}
                    onClick={() => {
                      setSelectedSize(size);
                      setQuantity(1);
                      setMessage("");
                    }}
                    aria-pressed={selectedSize === size}
                    title={variant ? size : `${size} unavailable`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>

            <p className="detail-stock" aria-live="polite">
              {product.variants.length === 0
                ? "Online checkout is unavailable for this product. Contact us for availability."
                : colours.length === 0
                ? "Choose an available colour."
                  : !selectedColour
                    ? "Select a colour first."
                    : !selectedSize
                  ? "Select a size."
                      : selectedVariant
                    ? "Available"
                    : "Choose an available size"}
            </p>
          </div>

          <div className="detail-option">
            <strong>Quantity</strong>

            <div className="detail-quantity">
              <button
                type="button"
                onClick={() =>
                  setQuantity((q) => Math.max(1, q - 1))
                }
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>

              <span>{quantity}</span>

              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                disabled={quantity >= 10}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            className="detail-add-button"
            onClick={addToBag}
            disabled={
              product.variants.length === 0 ||
              !selectedVariant
            }
          >
            {product.variants.length === 0
              ? "UNAVAILABLE FOR ONLINE ORDER"
              : `ADD TO BAG — ${money(currentPrice * quantity)}`}
          </button>

          {product.variants.length > 0 && (
            <div className="detail-purchase-actions">
              <button
                type="button"
                className="detail-buy-button"
                onClick={() => {
                  if (addToBag()) router.push("/checkout");
                }}
                disabled={!selectedVariant}
              >
                BUY NOW
              </button>
            </div>
          )}

          {message && (
            <p className="detail-message" role="status">
              {message}
            </p>
          )}

          <div className="detail-delivery">
            <strong>Fashion Freaks / Nigeria</strong>
            <p>Delivery fees are confirmed at checkout. Need sizing help? Call <a href="tel:08053305564">08053305564</a>.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
