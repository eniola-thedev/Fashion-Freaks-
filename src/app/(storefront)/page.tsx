
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { whatsappUrl } from "@/lib/whatsapp";
import { isValidProductImageUrl } from "@/lib/product-colours.mjs";
import editorialImage from "../../../front.jpg";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  regularPrice: number | null;
  isFeatured: boolean;
  colours: {
    name: string;
    image: string | null;
  }[];
  colour: string;
  image: string;
  slug: string;
  available: boolean;
};

type DatabaseProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  colour: string | null;
  imageUrl: string | null;
  discountPrice: number | null;
  isFeatured: boolean;
  colours: {
    name: string;
    hexColor: string;
    images: {
      imageUrl: string;
      isPrimary: boolean;
    }[];
  }[];
  slug: string;
  variants: {
    colour: string;
    imageUrl: string | null;
  }[];
};

const categoryKey = (category: string) =>
  category.trim().toLocaleLowerCase().replace(/\s+/g, " ");

const money = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);


export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("latest");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState("");
  const [productLoadAttempt, setProductLoadAttempt] = useState(0);
  const [unavailableColourImages, setUnavailableColourImages] =
    useState<Set<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setLoadingProducts(true);
      setProductError("");
      try {
        const response = await fetch("/api/products", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json();
        if (!response.ok) {
          const errorMessage =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : "Could not load products.";
          throw new Error(errorMessage);
        }

        if (!Array.isArray(data)) {
          throw new Error("The product service returned an invalid response.");
        }

        setProducts((data as DatabaseProduct[]).map((product) => {
          const colours = product.colours.length > 0
            ? product.colours.map((colour) => ({
                name: colour.name,
                image:
                  colour.images.find(
                    (image) =>
                      image.isPrimary &&
                      isValidProductImageUrl(image.imageUrl)
                  )?.imageUrl ??
                  colour.images.find((image) =>
                    isValidProductImageUrl(image.imageUrl)
                  )?.imageUrl ??
                  product.variants.find(
                    (variant) =>
                      variant.colour.toLocaleLowerCase() ===
                        colour.name.toLocaleLowerCase() &&
                      isValidProductImageUrl(variant.imageUrl)
                  )?.imageUrl ??
                  null,
              }))
            : [
                ...new Set(
                  product.variants.map((variant) => variant.colour)
                ),
              ].map((name) => ({
                name,
                image:
                  product.variants.find(
                    (variant) =>
                      variant.colour.toLocaleLowerCase() ===
                        name.toLocaleLowerCase() &&
                      isValidProductImageUrl(variant.imageUrl)
                  )?.imageUrl ?? null,
              }));
          const mainImage =
            colours.find((colour) => colour.image)?.image ??
            (isValidProductImageUrl(product.imageUrl)
              ? product.imageUrl
              : null) ??
            "";

          return {
            id: product.id,
            name: product.name,
            category: product.category,
            price: product.discountPrice ?? product.price,
            regularPrice:
              product.discountPrice === null ? null : product.price,
            isFeatured: product.isFeatured,
            colours,
            colour: colours.map((colour) => colour.name).join(" · ") ||
              product.colour ||
              "Colour not specified",
            image: mainImage,
            slug: product.slug,
            available: product.variants.length > 0,
          };
        }));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Product loading error:", error);
        setProductError("We couldn't load products. Please try again.");
      } finally {
        if (!controller.signal.aborted) {
          setLoadingProducts(false);
        }
      }
    }

    loadProducts();

    return () => controller.abort();
  }, [productLoadAttempt]);

  const categoryOptions = useMemo(() => {
    const categoryNames = new Map<string, string>();
    products.forEach((product) => {
      if (product.category.trim()) {
        const key = categoryKey(product.category);
        if (!categoryNames.has(key)) {
          categoryNames.set(key, product.category.trim());
        }
      }
    });

    return [
      { name: "All products", value: "all" },
      ...[...categoryNames].map(([value, name]) => ({ name, value })),
    ];
  }, [products]);

  const categoryProducts = useMemo(() => {
    return categoryOptions
      .filter((category) => category.value !== "all")
      .map((category, index) => {
        const firstProduct = products.find(
          (product) => categoryKey(product.category) === category.value
        );
        return {
          ...category,
          number: String(index + 1).padStart(2, "0"),
          image: firstProduct?.image ?? "",
        };
      });
  }, [categoryOptions, products]);

  const visibleProducts = useMemo(
    () => {
      const query = search.trim().toLocaleLowerCase();
      const result = products.filter((product) => {
        const inCategory =
          activeCategory === "all" ||
          categoryKey(product.category) === activeCategory;
        const matchesQuery =
          !query ||
          `${product.name} ${product.category} ${product.colour}`
            .toLocaleLowerCase()
            .includes(query);
        return inCategory && matchesQuery;
      });

      return result.sort((first, second) => {
        if (sort === "price-asc") return first.price - second.price;
        if (sort === "price-desc") return second.price - first.price;
        if (sort === "name") return first.name.localeCompare(second.name);
        return 0;
      });
    },
    [activeCategory, products, search, sort]
  );

  return (
    <main>
      <section className="hero">
        <div
          className="hero-image"
          role="img"
          aria-label="Model wearing a black Fashion Freaks outfit"
        />
        <div className="hero-shade" />

        <div className="hero-content">
          <span className="eyebrow hero-eyebrow">
            THE NEW STANDARD · 001
          </span>
          <h1>
            Style Without
            <br />
            <span>Trying Too Hard.</span>
          </h1>
          <p>
            Wear your own rules. Considered essentials. Distinctive silhouettes.
            <br className="desktop-break" />
            Style that speaks before you do.
          </p>

          <div className="hero-actions">
            <a href="#shop" className="button button-light">
              SHOP NOW <span>↗</span>
            </a>
            <a href="#categories" className="hero-secondary-link">
              EXPLORE THE COLLECTION
            </a>
          </div>
        </div>

        <div className="hero-index">
          <span>01 — 03</span>
          <span>THE EVERYDAY EDITION</span>
        </div>

        <div className="hero-vertical">FASHION FREAKS / NIGERIA</div>
      </section>

      <div className="brand-strip">
        <span>BUILT FOR INDIVIDUALS</span>
        <span className="strip-star">✳</span>
        <span>MADE TO BE WORN</span>
        <span className="strip-star">✳</span>
        <span>NEVER JUST ANOTHER FIT</span>
        <span className="strip-star">✳</span>
      </div>

      <section className="collection-section" id="categories">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FIND YOUR UNIFORM</span>
            <h2>Shop by category<span className="accent-dot">.</span></h2>
          </div>
          <p>
            The pieces you reach for.
            <br />
            The details that make them yours.
          </p>
        </div>

        <div
          className="category-grid"
          role="region"
          aria-label="Shop by category"
          tabIndex={0}
        >
          {categoryProducts.length === 0 ? (
            <p>Product categories will appear here as items are added.</p>
          ) : (
            categoryProducts.map((category) => (
              <a
                href="#shop"
                key={category.value}
                className="category-card"
                onClick={() => setActiveCategory(category.value)}
              >
                {category.image ? (
                  <div
                    className="category-image"
                    style={{ backgroundImage: `url("${category.image}")` }}
                    role="img"
                    aria-label={`${category.name} collection`}
                  />
                ) : (
                  <div className="category-image category-image-empty" />
                )}
                <span className="category-number">{category.number}</span>
                <div className="category-label">
                  <div>
                    <span>SHOP THE COLLECTION</span>
                    <h3>{category.name}</h3>
                  </div>
                  <span className="round-arrow" aria-hidden="true">↗</span>
                </div>
              </a>
            ))
          )}
        </div>
      </section>

      <section className="products-section" id="shop">
        <div className="section-heading product-heading">
          <div>
            <span className="eyebrow">CURATED FOR YOUR ROTATION</span>
            <h2>Shop the collection<span className="accent-dot">.</span></h2>
          </div>
          <span className="product-total">
            {visibleProducts.length.toString().padStart(2, "0")} PIECES
          </span>
        </div>

        <div className="filter-row" aria-label="Filter products by category">
          <div className="filter-list">
            {categoryOptions.map((category) => (
              <button
                key={category.value}
                className={`filter-button ${
                  activeCategory === category.value ? "filter-active" : ""
                }`}
                onClick={() => setActiveCategory(category.value)}
                aria-pressed={activeCategory === category.value}
              >
                {category.name}
              </button>
            ))}
          </div>
          <div className="product-controls">
            <label>
              <span className="visually-hidden">Search products</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products"
              />
            </label>
            <label>
              <span className="visually-hidden">Sort products</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="latest">Latest</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        </div>
       
<div className="product-grid">
  {loadingProducts ? (
    <p>Loading the collection...</p>
  ) : productError ? (
    <div className="product-load-error" role="alert">
      <p>{productError}</p>
      <button
        type="button"
        className="button button-dark"
        onClick={() => setProductLoadAttempt((attempt) => attempt + 1)}
      >
        Try again
      </button>
    </div>
  ) : visibleProducts.length === 0 ? (
    <p className="product-empty">
      {products.length === 0
        ? "There are no products available at the moment."
        : "No products match your search. Try another category or search term."}
    </p>
  ) : (
    visibleProducts.map((product, index) => (
      <Link
        href={`/products/${encodeURIComponent(product.slug)}`}
        className="product-card"
        key={product.id}
        aria-label={`View ${product.name}`}
      >
        <div className="product-image-wrap">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className="product-image"
              loading={index > 3 ? "lazy" : "eager"}
            />
          ) : (
            <div
              className="product-image product-image-placeholder"
              role="img"
              aria-label="Product image unavailable"
            >
              Image coming soon
            </div>
          )}
          <span className="product-view-label">View product</span>
        </div>
        <div className="product-information">
          <div>
            <h3>{product.name}</h3>
            <p>{product.colour}</p>
            {product.colours.length > 0 && (
              <div className="product-card-colours" aria-label="Available colours">
                {product.colours.map((colour) => (
                  <span
                    className="product-card-colour"
                    key={colour.name}
                    title={colour.name}
                  >
                    {colour.image &&
                    !unavailableColourImages.has(
                      `${product.id}:${colour.name}:${colour.image}`
                    ) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={colour.image}
                        alt=""
                        aria-hidden="true"
                        onError={() =>
                          setUnavailableColourImages((current) =>
                            new Set(current).add(
                              `${product.id}:${colour.name}:${colour.image}`
                            )
                          )
                        }
                      />
                    ) : (
                      <span
                        className="product-card-colour-placeholder"
                        role="img"
                        aria-label={`${colour.name} product image unavailable`}
                      />
                    )}
                  </span>
                ))}
              </div>
            )}
            <p className={product.available ? "product-stock" : "product-stock out"}>
              {product.available ? "Available" : "Currently unavailable"}
            </p>
          </div>
          <span className="product-price">
            {product.isFeatured && (
              <span className="product-featured-label">Featured</span>
            )}
            {money(product.price)}
            {product.regularPrice !== null && (
              <del>{money(product.regularPrice)}</del>
            )}
          </span>
        </div>
      </Link>
    ))
  )}
</div>


        <div className="view-all-wrap">
          <button
            className="button button-dark"
            onClick={() => {
              setActiveCategory("all");
              window.scrollTo({
                top: document.getElementById("shop")?.offsetTop ?? 0,
                behavior: "smooth",
              });
            }}
          >
            EXPLORE ALL PIECES <span>↗</span>
          </button>
        </div>
      </section>

      <section className="story-section" id="story">
        <div className="story-content">
          <span className="eyebrow">NOT HERE TO BLEND IN</span>
          <h2>
            Style is
            <br />
            personal.
            <br />
            <span>Make it yours.</span>
          </h2>
          <p>
            Fashion Freaks is built around the idea that getting dressed
            should feel effortless, intentional, and entirely your own.
            Pieces that work harder. Details that matter. A wardrobe that
            feels like you.
          </p>
          <a href="#shop" className="text-link">
            FIND YOUR NEXT FAVOURITE <span>↗</span>
          </a>
        </div>

        <div className="story-image">
          <Image
            src={editorialImage}
            alt="Fashion Freaks editorial look"
            fill
            sizes="(max-width: 700px) 82vw, (max-width: 1100px) 38vw, 34vw"
            className="story-image-photo"
          />
          <div className="story-image-overlay" />
          <span className="story-image-caption">THE FF PERSPECTIVE / 001</span>
        </div>
      </section>

      <section className="newsletter-section" id="newsletter">
        <div>
          <span className="eyebrow">FASHION FREAKS / LAGOS</span>
          <h2>Good style.<br />Good people.</h2>
          <p>
            Find us at 22, Billionaires Plaza, Broad Street, Lagos Island,
            Lagos State, Nigeria. Our store is open 9:00 AM – 6:30 PM.
          </p>
        </div>
        <div className="community-actions">
          <a href={whatsappUrl("Hello Fashion Freaks, I would like help with your collection.")} className="button button-dark" target="_blank" rel="noreferrer">
            CHAT WITH US ON WHATSAPP <span>↗</span>
          </a>
          <a href="https://www.instagram.com/Faashionfreaks_online/" target="_blank" rel="noreferrer" className="text-link">
            FOLLOW @FAASHIONFREAKS_ONLINE <span>↗</span>
          </a>
        </div>
      </section>
    </main>
  );
}
