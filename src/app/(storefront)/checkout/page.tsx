"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./checkout.css"
import {
  getCartReadySnapshot,
  getCartSnapshot,
  getServerCartReadySnapshot,
  getServerCartSnapshot,
  subscribeToCart,
} from "@/lib/cart";
import {
  getPendingOrderSnapshot,
  getServerPendingOrderSnapshot,
  savePendingOrder,
  subscribeToPendingOrder,
} from "@/lib/pending-order";
import { NIGERIAN_STATES } from "@/lib/nigeria";

const CHECKOUT_KEY = "fashion-freaks-checkout-key";

type CustomerDetails = {
  fullName: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  address: string;
  deliveryNotes: string;
};

type DeliveryQuote = {
  deliveryFee: number;
  courierName: string;
  deliveryEta: string | null;
};

type QuoteResult = {
  key: string;
  status: "loading" | "ready" | "error";
  quote?: DeliveryQuote;
  error?: string;
};

const initialDetails: CustomerDetails = {
  fullName: "",
  email: "",
  phone: "",
  state: "",
  city: "",
  address: "",
  deliveryNotes: "",
};

function money(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CheckoutPage() {
  const router = useRouter();
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
  const pendingOrder = useSyncExternalStore(
    subscribeToPendingOrder,
    getPendingOrderSnapshot,
    getServerPendingOrderSnapshot
  );
  const [details, setDetails] =
    useState<CustomerDetails>(initialDetails);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [accountReady, setAccountReady] = useState(false);
  const orderNumber = pendingOrder.orderNumber;
  const orderTotal = pendingOrder.total;

  useEffect(() => {
    const controller = new AbortController();

    async function checkCustomerSession() {
      try {
        const response = await fetch("/api/customer/auth/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as {
          authenticated?: boolean;
          user?: { email?: unknown; displayName?: unknown };
        };
        if (!response.ok || !result.authenticated) {
          router.replace("/account/login?next=%2Fcheckout");
          return;
        }

        const email =
          typeof result.user?.email === "string" ? result.user.email : "";
        const displayName =
          typeof result.user?.displayName === "string"
            ? result.user.displayName
            : "";
        setDetails((current) => ({
          ...current,
          email,
          fullName: current.fullName || displayName,
        }));
        setAccountReady(true);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setMessage("Unable to check your account. Please try again.");
      }
    }

    void checkCustomerSession();
    return () => controller.abort();
  }, [router]);

  async function handlePayment() {
    if (!orderNumber || paying) return;

    setPaying(true);
    setMessage("");

    try {
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderNumber }),
      });

      const result = (await response.json()) as {
        authorizationUrl?: unknown;
        error?: string;
      };

      if (
        !response.ok ||
        typeof result.authorizationUrl !== "string"
      ) {
        throw new Error(
          result.error || "Could not start payment."
        );
      }

      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to start payment. Please try again."
      );
      setPaying(false);
    }
  }

  function updateField(
    field: keyof CustomerDetails,
    value: string
  ) {
    setDetails((current) => ({
      ...current,
      [field]: value,
    }));
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const quoteKey = JSON.stringify({
    details,
    items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
    })),
  });
  const hasAddress =
    Boolean(
      details.fullName.trim() &&
        details.email.trim() &&
        details.phone.trim() &&
        details.state &&
        details.city.trim() &&
        details.address.trim() &&
        items.length > 0
    ) && loaded;
  const currentQuoteResult =
    quoteResult?.key === quoteKey ? quoteResult : null;
  const deliveryQuote =
    currentQuoteResult?.status === "ready"
      ? currentQuoteResult.quote ?? null
      : null;
  const quoteStatus = hasAddress
    ? currentQuoteResult?.status ?? "loading"
    : "idle";
  const quoteError =
    currentQuoteResult?.status === "error"
      ? currentQuoteResult.error ?? ""
      : "";

  useEffect(() => {
    if (!hasAddress) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setQuoteResult({ key: quoteKey, status: "loading" });
      try {
        const response = await fetch("/api/shipping/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: details,
            items: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as {
          deliveryFee?: unknown;
          courierName?: unknown;
          deliveryEta?: unknown;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "Could not get a delivery quote.");
        }
        if (
          typeof result.deliveryFee !== "number" ||
          !Number.isSafeInteger(result.deliveryFee) ||
          result.deliveryFee <= 0 ||
          typeof result.courierName !== "string"
        ) {
          throw new Error("The delivery service returned an invalid quote.");
        }
        setQuoteResult({
          key: quoteKey,
          status: "ready",
          quote: {
            deliveryFee: result.deliveryFee,
            courierName: result.courierName,
            deliveryEta:
              typeof result.deliveryEta === "string"
                ? result.deliveryEta
                : null,
          },
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setQuoteResult({
          key: quoteKey,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Unable to get a delivery quote. Please try again.",
        });
      }
    }, 700);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [details, hasAddress, items, quoteAttempt, quoteKey]);

  function retryDeliveryQuote() {
    setQuoteResult({ key: quoteKey, status: "loading" });
    setQuoteAttempt((attempt) => attempt + 1);
  }

async function handleSubmit(
  event: React.FormEvent<HTMLFormElement>
) {
  event.preventDefault();
  setMessage("");

  if (items.length === 0) {
    setMessage("Your shopping bag is empty.");
    return;
  }
  if (!deliveryQuote) {
    setMessage("Wait for a valid delivery quote before placing your order.");
    return;
  }

  setSubmitting(true);

  try {
    const checkoutKey =
      localStorage.getItem(CHECKOUT_KEY) ?? crypto.randomUUID();
    localStorage.setItem(CHECKOUT_KEY, checkoutKey);

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkoutKey,
        customer: details,
        expectedDeliveryFee: deliveryQuote.deliveryFee,
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      }),
    });

    const result = (await response.json()) as {
      error?: string;
      order?: { orderNumber?: unknown; total?: unknown };
      deliveryQuote?: DeliveryQuote;
    };

    if (!response.ok) {
      if (
        result.deliveryQuote &&
        Number.isSafeInteger(result.deliveryQuote.deliveryFee)
      ) {
        setQuoteResult({
          key: quoteKey,
          status: "ready",
          quote: result.deliveryQuote,
        });
      }
      throw new Error(
        result.error || "Could not create your order."
      );
    }

    const createdOrderNumber = result.order?.orderNumber;
    if (typeof createdOrderNumber !== "string") {
      throw new Error("The order was created but its reference was missing.");
    }

    const createdOrderTotal = result.order?.total;
    if (
      typeof createdOrderTotal !== "number" ||
      !Number.isSafeInteger(createdOrderTotal) ||
      createdOrderTotal < 0
    ) {
      throw new Error("The order was created but its total was missing.");
    }

    savePendingOrder(createdOrderNumber, createdOrderTotal);
  } catch (error) {
    setMessage(
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again."
    );
  } finally {
    setSubmitting(false);
  }
}


  if (!loaded) {
    return (
      <main className="checkout-page">
        <p>Loading checkout...</p>
      </main>
    );
  }

  if (!accountReady) {
    return (
      <main className="checkout-page">
        <p role="status">Checking your account...</p>
        {message && <p role="alert">{message}</p>}
      </main>
    );
  }

  
if (orderNumber) {
  return (
    <main className="checkout-page">
      <div className="checkout-empty">
        <p className="checkout-eyebrow">
          FASHION FREAKS / ORDER RECEIVED
        </p>

        <h1>Order created.</h1>

        <p>
  Order reference: <strong>{orderNumber}</strong>
</p>

<p>
  Your order has been created. Complete payment to proceed with your purchase.
</p>
        {orderTotal !== null && (
          <p>
            Order total: <strong>{money(orderTotal)}</strong>
          </p>
        )}

<button
  type="button"
  className="checkout-primary-button"
  onClick={handlePayment}
  disabled={paying}
>
  {paying ? "CONNECTING TO PAYSTACK..." : "PAY NOW"}
</button>

{message && <p role="alert">{message}</p>}
      </div>
    </main>
  );
}


  if (items.length === 0) {
    return (
      <main className="checkout-page">
        <div className="checkout-empty">
          <p className="checkout-eyebrow">FASHION FREAKS</p>
          <h1>Your bag is empty</h1>
          <p>Add something to your bag before checking out.</p>
          <Link href="/#shop" className="checkout-primary-button">
            EXPLORE THE COLLECTION
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <div className="checkout-header">
        <p className="checkout-eyebrow">FASHION FREAKS / CHECKOUT</p>
        <h1>Delivery details</h1>
        <p>
          Tell us where to deliver your order within Nigeria.
        </p>
      </div>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={handleSubmit}>
          <section className="checkout-section">
            <h2>Contact information</h2>

            <label className="checkout-field">
              <span>Full name *</span>
              <input
                required
                autoComplete="name"
                value={details.fullName}
                onChange={(e) =>
                  updateField("fullName", e.target.value)
                }
                placeholder="Enter your full name"
              />
            </label>

            <label className="checkout-field">
              <span>Email address *</span>
              <input
                required
                type="email"
                autoComplete="email"
                value={details.email}
                readOnly
                aria-describedby="checkout-account-email"
              />
              <span id="checkout-account-email">
                Signed in to your Fashion Freaks account.
              </span>
            </label>

            <label className="checkout-field">
              <span>Phone number *</span>
              <input
                required
                type="tel"
                autoComplete="tel"
                value={details.phone}
                onChange={(e) =>
                  updateField("phone", e.target.value)
                }
                placeholder="e.g. 08012345678"
              />
            </label>
          </section>

          <section className="checkout-section">
            <h2>Delivery address</h2>

            <label className="checkout-field">
              <span>State / FCT *</span>
              <select
                required
                value={details.state}
                onChange={(e) =>
                  updateField("state", e.target.value)
                }
              >
                <option value="">Select your state</option>
                {NIGERIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>

            <label className="checkout-field">
              <span>City / Town *</span>
              <input
                required
                autoComplete="address-level2"
                value={details.city}
                onChange={(e) =>
                  updateField("city", e.target.value)
                }
                placeholder="Enter your city or town"
              />
            </label>

            <label className="checkout-field">
              <span>Street address *</span>
              <textarea
                required
                rows={3}
                autoComplete="street-address"
                value={details.address}
                onChange={(e) =>
                  updateField("address", e.target.value)
                }
                placeholder="House number, street, area and any useful directions"
              />
            </label>

            <label className="checkout-field">
              <span>Delivery notes (optional)</span>
              <textarea
                rows={2}
                value={details.deliveryNotes}
                onChange={(e) =>
                  updateField("deliveryNotes", e.target.value)
                }
                placeholder="Landmarks or instructions for the rider"
              />
            </label>
          </section>

          <p className="checkout-required-note">
            * Required fields
          </p>
          
<button
  type="submit"
  className="checkout-primary-button checkout-submit"
  disabled={submitting || !deliveryQuote}
>
  {submitting
    ? "CREATING ORDER..."
    : quoteStatus === "loading"
      ? "GETTING DELIVERY QUOTE..."
      : deliveryQuote
        ? "PLACE ORDER"
        : "DELIVERY QUOTE REQUIRED"}
</button>


          {message && (
            <p className="checkout-message" role="status">
              {message}
            </p>
          )}

          <Link href="/cart" className="checkout-back-link">
            ← Return to your bag
          </Link>
        </form>

        <aside className="checkout-order-summary">
          <h2>Your order</h2>

          {items.map((item) => (
            <div className="checkout-product" key={item.variantId}>
              {item.image ? (
                <img src={item.image} alt={item.name} />
              ) : (
                <div className="checkout-product-placeholder" />
              )}

              <div className="checkout-product-info">
                <strong>{item.name}</strong>
                <p>{item.colour} / {item.size}</p>
                <p>Qty: {item.quantity}</p>
              </div>

              <strong>
                {money(item.price * item.quantity)}
              </strong>
            </div>
          ))}

          <div className="checkout-total-row">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>

          <div className="checkout-total-row">
            <span>Delivery</span>
            <strong>
              {deliveryQuote
                ? money(deliveryQuote.deliveryFee)
                : quoteStatus === "loading"
                  ? "Getting quote..."
                  : "Enter delivery details"}
            </strong>
          </div>

          {deliveryQuote && (
            <p className="checkout-delivery-quote" role="status">
              Via {deliveryQuote.courierName}
              {deliveryQuote.deliveryEta
                ? ` · ${deliveryQuote.deliveryEta}`
                : ""}
            </p>
          )}
          {quoteError && (
            <p className="checkout-message" role="alert">
              {quoteError}
            </p>
          )}
          {quoteStatus === "error" && (
            <button
              type="button"
              className="checkout-quote-retry"
              onClick={retryDeliveryQuote}
            >
              Retry delivery quote
            </button>
          )}

          <div className="checkout-grand-total">
            <span>Order total</span>
            <strong>
              {money(subtotal + (deliveryQuote?.deliveryFee ?? 0))}
            </strong>
          </div>

          <p className="checkout-disclaimer">
            Delivery rates are provided by Shipbubble for the address and
            items entered. The order total is recalculated by the server
            before payment.
          </p>
        </aside>
      </div>
    </main>
  );
}
