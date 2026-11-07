
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import "./cart.css";
import {
  getCartReadySnapshot,
  getCartSnapshot,
  getServerCartReadySnapshot,
  getServerCartSnapshot,
  subscribeToCart,
  writeCart,
  type CartItem,
} from "@/lib/cart";

function money(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CartPage() {
  const items = useSyncExternalStore(
    subscribeToCart,
    getCartSnapshot,
    getServerCartSnapshot
  );
  const loaded = useSyncExternalStore(
    subscribeToCart,
    getCartReadySnapshot,
    getServerCartReadySnapshot
  );
  const [availability, setAvailability] = useState<{
    cartKey: string;
    availableVariantIds: string[];
    error: string;
  } | null>(null);
  const cartKey = items
    .map((item) => `${item.variantId}:${item.quantity}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!loaded || !cartKey) return;

    const controller = new AbortController();

    async function checkAvailability() {
      try {
        const response = await fetch("/api/products", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("We couldn't check product availability. Please try again.");
        }

        const products: unknown = await response.json();
        if (!Array.isArray(products)) {
          throw new Error("The availability response was not valid.");
        }

        const availableVariantIds: string[] = [];
        for (const product of products) {
          if (!product || typeof product !== "object" || !("variants" in product)) {
            continue;
          }
          const variants = product.variants;
          if (!Array.isArray(variants)) continue;
          for (const variant of variants) {
            if (
              variant &&
              typeof variant === "object" &&
              "id" in variant &&
              typeof variant.id === "string"
            ) {
              availableVariantIds.push(variant.id);
            }
          }
        }

        setAvailability({ cartKey, availableVariantIds, error: "" });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Cart availability check failed:", error);
        setAvailability({
          cartKey,
          availableVariantIds: [],
          error:
            error instanceof Error
              ? error.message
              : "We couldn't check product availability. Please try again.",
        });
      }
    }

    checkAvailability();
    return () => controller.abort();
  }, [cartKey, loaded]);

  const currentAvailability =
    availability?.cartKey === cartKey ? availability : null;
  const availableVariantIds = currentAvailability?.availableVariantIds ?? [];
  const availabilityError = currentAvailability?.error ?? "";
  const availabilityLoading = loaded && Boolean(cartKey) && !currentAvailability;

  function saveCart(updatedItems: CartItem[]) {
    writeCart(updatedItems);
  }

  function changeQuantity(variantId: string, amount: number) {
    const updated = items.map((item) =>
      item.variantId === variantId
        ? {
            ...item,
            quantity: Math.min(
              10,
              Math.max(1, item.quantity + amount)
            ),
          }
        : item
    );

    saveCart(updated);
  }

  function removeItem(variantId: string) {
    saveCart(
      items.filter((item) => item.variantId !== variantId)
    );
  }

  const totalQuantity = items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const unavailableItems = items.filter(
    (item) => !availableVariantIds.includes(item.variantId)
  );
  const canCheckout =
    !availabilityLoading && !availabilityError && unavailableItems.length === 0;
  if (!loaded) {
    return (
      <main className="cart-page">
        <p>Loading your bag...</p>
      </main>
    );
  }

  return (
    <main className="cart-page">
      <div className="cart-heading">
        <div>
          <p className="cart-eyebrow">YOUR SELECTION</p>
          <h1>Your Bag</h1>
        </div>

        <span>{totalQuantity} item(s)</span>
      </div>

      {items.length === 0 ? (
        <section className="cart-empty">
          <h2>Your bag is waiting.</h2>
          <p>
            Explore our collection and find something
            worth adding to your wardrobe.
          </p>
          <Link href="/#shop" className="cart-continue-button">
            CONTINUE SHOPPING
          </Link>
        </section>
      ) : (
        <div className="cart-layout">
          <section className="cart-items">
            {items.map((item) => (
              <article
                className="cart-item"
                key={item.variantId}
              >
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="cart-item-image"
                  />
                ) : (
                  <div className="cart-item-image cart-no-image">
                    No image
                  </div>
                )}

                <div className="cart-item-info">
                  <Link
                    href={`/products/${encodeURIComponent(item.slug)}`}
                    className="cart-item-name"
                  >
                    {item.name}
                  </Link>

                  <p>
                    Colour: {item.colour} · Size: {item.size}
                  </p>

                  <p className="cart-item-price">
                    {money(item.price)}
                  </p>

                  <div className="cart-item-actions">
                    <div className="cart-quantity">
                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(item.variantId, -1)
                        }
                        disabled={item.quantity <= 1 || availabilityLoading}
                        aria-label={`Decrease ${item.name} quantity`}
                      >
                        −
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(item.variantId, 1)
                        }
                        disabled={
                          availabilityLoading ||
                          Boolean(availabilityError) ||
                          item.quantity >= 10
                        }
                        aria-label={`Increase ${item.name} quantity`}
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      className="cart-remove"
                      onClick={() => removeItem(item.variantId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <strong className="cart-line-total">
                  {money(item.price * item.quantity)}
                </strong>
              </article>
            ))}
          </section>

          <aside className="cart-summary">
            <h2>Order Summary</h2>

            <div className="cart-summary-row">
              <span>Items ({totalQuantity})</span>
              <span>{money(subtotal)}</span>
            </div>

            <div className="cart-summary-row">
              <span>Delivery</span>
              <span>Confirmed before dispatch</span>
            </div>

            <div className="cart-summary-total">
              <span>Estimated total before delivery</span>
              <strong>{money(subtotal)}</strong>
            </div>

            <p className="cart-summary-note">
              Delivery fees are not included in this subtotal.
            </p>

            {availabilityLoading && <p role="status">Checking current availability...</p>}
            {availabilityError && <p className="cart-availability-error" role="alert">{availabilityError}</p>}
            {!availabilityLoading && !availabilityError && unavailableItems.length > 0 && (
              <p className="cart-availability-error" role="alert">
                Some options in your bag are no longer available. Remove {unavailableItems.map((item) => item.name).join(", ")} before checkout.
              </p>
            )}
            {canCheckout ? (
              <Link href="/checkout" className="cart-checkout-button">
                PROCEED TO CHECKOUT
              </Link>
            ) : (
              <span className="cart-checkout-button cart-checkout-disabled" aria-disabled="true">
                CHECK AVAILABILITY TO CONTINUE
              </span>
            )}
            <Link href="/#shop" className="cart-back-link">
              Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
